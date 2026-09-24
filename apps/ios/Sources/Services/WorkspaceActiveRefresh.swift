import Foundation
import Network

/// One shared active-refresh registry for native People and open conversation
/// history (ADR 0018 synchronization).
///
/// The app lifecycle and network path drive one bounded coordinator; stores
/// register the refresh work for their surface and every completion carries the
/// scope generation it was scheduled with, so a late readback after an account,
/// workspace or endpoint switch is dropped instead of painting stale data.
/// Drafts, pending messages and reader position stay untouched by the
/// coordinator; stores merge committed records only.
final class WorkspaceActiveRefresh: @unchecked Sendable {
    static let shared = WorkspaceActiveRefresh()

    struct Registration {
        let scope: String
        let id: UUID
    }

    private let lock = NSLock()
    private var subscribers: [String: [UUID: @Sendable (_ generation: Int) async -> Void]] = [:]
    private let monitor = NWPathMonitor()
    private var lastPathSatisfied = true

    private(set) lazy var coordinator = ActiveRefreshCoordinator(
        // 10s interval + 1s coalesce keeps the first visible-surface fetch
        // inside the 15s propagation target before network time.
        interval: 10,
        coalesce: 1
    ) { [weak self] generation in
        await self?.runAll(generation: generation)
    }

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let satisfied = path.status == .satisfied
            self.lock.lock()
            let recovered = satisfied && !self.lastPathSatisfied
            self.lastPathSatisfied = satisfied
            self.lock.unlock()
            if recovered {
                self.coordinator.noteNetworkRecovery()
            }
        }
        monitor.start(queue: DispatchQueue(label: "workspace-active-refresh.network"))
    }

    /// Register one surface's refresh work (People directory, open Session).
    /// The last unregistration deactivates polling.
    @discardableResult
    func register(
        scope: String,
        refresh: @escaping @Sendable (_ generation: Int) async -> Void
    ) -> Registration {
        let id = UUID()
        lock.lock()
        subscribers[scope, default: [:]][id] = refresh
        let total = subscribers.values.reduce(0) { $0 + $1.count }
        lock.unlock()
        if total == 1 { coordinator.activate() }
        return Registration(scope: scope, id: id)
    }

    func unregister(_ registration: Registration) {
        lock.lock()
        subscribers[registration.scope]?[registration.id] = nil
        if subscribers[registration.scope]?.isEmpty == true { subscribers[registration.scope] = nil }
        let total = subscribers.values.reduce(0) { $0 + $1.count }
        lock.unlock()
        if total == 0 { coordinator.deactivate() }
    }

    /// Account/workspace/endpoint switch: earlier completions are stale.
    func nextScope() {
        coordinator.nextScope()
    }

    /// Foreground, focus and explicit mutation requests.
    func noteSceneActive() {
        coordinator.setSurfaceActive(true)
    }

    func noteSceneBackground() {
        coordinator.setSurfaceActive(false)
    }

    func requestRefresh(reason: String = "manual") {
        coordinator.schedule(reason: reason)
    }

    /// App became active again: coalesced foreground refresh of every surface.
    func noteForeground() {
        coordinator.noteForeground()
    }

    private func runAll(generation: Int) async {
        lock.lock()
        let work = Array(subscribers.values.flatMap(\.values))
        lock.unlock()
        await withTaskGroup(of: Void.self) { group in
            for refresh in work {
                group.addTask { await refresh(generation) }
            }
        }
    }
}
