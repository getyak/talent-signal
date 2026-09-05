import Foundation

// Task-local ancestry follows structured async work without a mutable global
// current-operation pointer. Labels are closed and input/output are never stored.
enum LabClientDiagnostics {
    @TaskLocal static var current: LabDiagnosticsEngine.ClientTicket?
    static func measure<T>(_ kind: LabClientSpan.Kind, body: () async throws -> T) async rethrows -> T {
        guard let ticket = LabDiagnosticsEngine.shared.beginClientSpan(kind, parent: current) else { return try await body() }
        return try await $current.withValue(ticket) {
            do {
                let result = try await body()
                LabDiagnosticsEngine.shared.finishClientSpan(ticket, outcome: .completed)
                return result
            } catch {
                LabDiagnosticsEngine.shared.finishClientSpan(ticket, outcome: failure(error))
                throw error
            }
        }
    }
    static func observe(_ kind: LabClientSpan.Kind, body: () async -> LabClientSpan.Outcome) async {
        guard let ticket = LabDiagnosticsEngine.shared.beginClientSpan(kind, parent: current) else { _ = await body(); return }
        let outcome = await $current.withValue(ticket) { await body() }
        LabDiagnosticsEngine.shared.finishClientSpan(ticket, outcome: outcome)
    }
    static func observeSync(_ kind: LabClientSpan.Kind, body: () -> LabClientSpan.Outcome) {
        guard let ticket = LabDiagnosticsEngine.shared.beginClientSpan(kind, parent: current) else { _ = body(); return }
        let outcome = $current.withValue(ticket) { body() }
        LabDiagnosticsEngine.shared.finishClientSpan(ticket, outcome: outcome)
    }
    static func measureSync<T>(_ kind: LabClientSpan.Kind, body: () throws -> T) rethrows -> T {
        guard let ticket = LabDiagnosticsEngine.shared.beginClientSpan(kind, parent: current) else { return try body() }
        return try $current.withValue(ticket) {
            do {
                let result = try body()
                LabDiagnosticsEngine.shared.finishClientSpan(ticket, outcome: .completed)
                return result
            } catch {
                LabDiagnosticsEngine.shared.finishClientSpan(ticket, outcome: failure(error))
                throw error
            }
        }
    }
    static func failure(_ error: Error) -> LabClientSpan.Outcome {
        error is CancellationError || (error as? URLError)?.code == .cancelled ? .cancelled : .failed
    }
}
