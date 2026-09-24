import Foundation

/// One shared, bounded active-refresh coordinator for native People and open
/// conversation history (ADR 0018 synchronization).
///
/// Refresh triggers: foreground, focus, network recovery, and a bounded active
/// interval while the surface is active. Background polling pauses. Work is
/// coalesced, and every async completion carries the scope generation captured
/// when it was scheduled: after an account or endpoint switch the old
/// generation is refused and the late response is dropped instead of painting
/// stale data. Callers keep their drafts, scroll position and pending writes.
final class ActiveRefreshCoordinator: @unchecked Sendable {
    typealias RefreshHandler = @Sendable (_ generation: Int) async -> Void

    struct Clock {
        var now: @Sendable () -> Date
        var schedule: @Sendable (_ delay: TimeInterval, _ block: @escaping @Sendable () -> Void) -> Any
        var cancel: @Sendable (_ token: Any) -> Void
    }

    static func systemClock() -> Clock {
        Clock(
            now: { Date() },
            schedule: { delay, block in
                let work = DispatchWorkItem(block: block)
                DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
                return work
            },
            cancel: { token in
                (token as? DispatchWorkItem)?.cancel()
            }
        )
    }

    private let lock = NSLock()
    private let interval: TimeInterval
    private let coalesce: TimeInterval
    private let clock: Clock
    private let refresh: RefreshHandler

    private var generation = 0
    private var active = false
    private var pending: (token: Any, generation: Int)?
    private var timer: Any?
    /// Surfaces in a background scene never poll.
    private var surfaceActive = true

    init(
        interval: TimeInterval = 15,
        coalesce: TimeInterval = 1,
        clock: Clock = ActiveRefreshCoordinator.systemClock(),
        refresh: @escaping RefreshHandler
    ) {
        self.interval = interval
        self.coalesce = coalesce
        self.clock = clock
        self.refresh = refresh
    }

    var scopeGeneration: Int {
        lock.lock()
        defer { lock.unlock() }
        return generation
    }

    func isCurrent(_ candidate: Int) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return candidate == generation
    }

    /// Account, workspace or endpoint switch: every earlier completion is stale.
    @discardableResult
    func nextScope() -> Int {
        lock.lock()
        defer { lock.unlock() }
        generation += 1
        return generation
    }

    func setSurfaceActive(_ value: Bool) {
        lock.lock()
        surfaceActive = value
        // Backgrounding cancels pending work: a paused surface must not run a
        // refresh it scheduled while visible.
        let pendingToken = value ? nil : pending?.token
        if !value { pending = nil }
        lock.unlock()
        if let pendingToken { clock.cancel(pendingToken) }
        if value { noteForeground() }
    }

    func activate() {
        lock.lock()
        guard !active else {
            lock.unlock()
            return
        }
        active = true
        lock.unlock()
        scheduleTimer()
    }

    func deactivate() {
        lock.lock()
        active = false
        let pendingToken = pending?.token
        let timerToken = timer
        pending = nil
        timer = nil
        lock.unlock()
        if let pendingToken { clock.cancel(pendingToken) }
        if let timerToken { clock.cancel(timerToken) }
    }

    func noteForeground() { schedule(reason: "foreground") }
    func noteFocus() { schedule(reason: "focus") }
    func noteNetworkRecovery() { schedule(reason: "network") }

    /// Schedule one coalesced refresh; the generation travels with the work.
    func schedule(reason: String) {
        lock.lock()
        guard active, surfaceActive else {
            lock.unlock()
            return
        }
        let scheduledGeneration = generation
        if let existing = pending {
            clock.cancel(existing.token)
        }
        let token = clock.schedule(coalesce) { [weak self] in
            self?.run(generation: scheduledGeneration)
        }
        pending = (token, scheduledGeneration)
        lock.unlock()
    }

    private func run(generation scheduledGeneration: Int) {
        lock.lock()
        guard active, surfaceActive, generation == scheduledGeneration else {
            pending = nil
            lock.unlock()
            return
        }
        pending = nil
        lock.unlock()
        Task { [refresh] in
            await refresh(scheduledGeneration)
        }
    }

    private func scheduleTimer() {
        lock.lock()
        guard active, interval > 0 else {
            lock.unlock()
            return
        }
        let token = clock.schedule(interval) { [weak self] in
            guard let self else { return }
            self.schedule(reason: "interval")
            self.scheduleTimer()
        }
        timer = token
        lock.unlock()
    }
}
