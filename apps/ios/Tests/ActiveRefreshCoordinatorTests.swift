import XCTest
@testable import TalentSignal

final class ActiveRefreshCoordinatorTests: XCTestCase {
    final class ManualScheduler: @unchecked Sendable {
        struct Item {
            let delay: TimeInterval
            let block: () -> Void
            var cancelled = false
        }
        private let lock = NSLock()
        private(set) var items: [Item] = []

        var clock: ActiveRefreshCoordinator.Clock {
            ActiveRefreshCoordinator.Clock(
                now: { Date() },
                schedule: { [self] delay, block in
                    lock.lock()
                    items.append(Item(delay: delay, block: block))
                    let index = items.count - 1
                    lock.unlock()
                    return index
                },
                cancel: { [self] token in
                    guard let index = token as? Int else { return }
                    lock.lock()
                    if items.indices.contains(index) { items[index].cancelled = true }
                    lock.unlock()
                }
            )
        }

        func fire(_ index: Int) {
            lock.lock()
            let item = items.indices.contains(index) && !items[index].cancelled ? items[index] : nil
            lock.unlock()
            item?.block()
        }

        var pendingCount: Int {
            lock.lock()
            defer { lock.unlock() }
            return items.filter { !$0.cancelled }.count
        }
    }

    func testForegroundFocusAndNetworkRecoveryRefreshWithTheCurrentGeneration() async throws {
        let scheduler = ManualScheduler()
        let seen = ProtectedBox<String>()
        let holder = CoordinatorBox()
        let coordinator = ActiveRefreshCoordinator(interval: 0, coalesce: 0.01, clock: scheduler.clock) { generation in
            if let current = holder.coordinator, current.isCurrent(generation) {
                seen.append("refresh")
            }
        }
        holder.coordinator = coordinator
        coordinator.activate()
        coordinator.noteForeground()
        scheduler.fire(0)
        coordinator.noteFocus()
        scheduler.fire(1)
        coordinator.noteNetworkRecovery()
        scheduler.fire(2)
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(seen.values, ["refresh", "refresh", "refresh"])
    }

    func testCoalescingAndBackgroundPause() {
        let scheduler = ManualScheduler()
        let coordinator = ActiveRefreshCoordinator(interval: 0, coalesce: 0.01, clock: scheduler.clock) { _ in }
        coordinator.activate()
        coordinator.schedule(reason: "manual")
        coordinator.schedule(reason: "manual")
        // Bursts coalesce into one scheduled refresh.
        XCTAssertEqual(scheduler.pendingCount, 1)
        coordinator.setSurfaceActive(false)
        coordinator.noteForeground()
        // Hidden surfaces never poll.
        XCTAssertEqual(scheduler.pendingCount, 0)
    }

    func testLateCompletionsAreDroppedAfterAScopeSwitch() async throws {
        let scheduler = ManualScheduler()
        let completed = ProtectedBox<Int>()
        let holder = CoordinatorBox()
        let coordinator = ActiveRefreshCoordinator(interval: 0, coalesce: 0.01, clock: scheduler.clock) { generation in
            if let current = holder.coordinator, current.isCurrent(generation) {
                completed.append(generation)
            }
        }
        holder.coordinator = coordinator
        coordinator.activate()
        let first = coordinator.scopeGeneration
        coordinator.noteForeground()
        // The account or endpoint switches before the scheduled work runs.
        let second = coordinator.nextScope()
        scheduler.fire(0)
        coordinator.noteForeground()
        scheduler.fire(1)
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertNotEqual(first, second)
        XCTAssertEqual(completed.values, [second])
        XCTAssertFalse(coordinator.isCurrent(first))
    }

    func testDeactivateCancelsPendingWorkAndStopsPolling() {
        let scheduler = ManualScheduler()
        let coordinator = ActiveRefreshCoordinator(interval: 10, coalesce: 0.01, clock: scheduler.clock) { _ in }
        coordinator.activate()
        coordinator.noteForeground()
        coordinator.deactivate()
        coordinator.noteForeground()
        // The pending coalesced refresh and the bounded timer are cancelled and
        // no further work is scheduled after deactivation.
        XCTAssertEqual(scheduler.pendingCount, 0)
    }
}

/// Holds the coordinator for closure capture without a use-before-init.
final class CoordinatorBox: @unchecked Sendable {
    var coordinator: ActiveRefreshCoordinator?
}

/// Tiny thread-safe box for collecting async observations in tests.
final class ProtectedBox<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Value] = []

    func append(_ value: Value) {
        lock.lock()
        storage.append(value)
        lock.unlock()
    }

    var values: [Value] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}
