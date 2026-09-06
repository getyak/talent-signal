import Foundation

final class RuntimeWorkLease {
    private let id: UUID
    init(_ kind: RuntimeWorkRegistry.Kind) throws { id = try RuntimeWorkRegistry.shared.begin(kind) }
    deinit { RuntimeWorkRegistry.shared.end(id) }
}

final class RuntimeWorkRegistry: @unchecked Sendable {
    static let shared = RuntimeWorkRegistry()
    enum Kind: String { case apiWrite, recording }
    private let lock = NSLock()
    private var transitioning = false
    private var maintenance: UUID?
    private var operations: [UUID: Kind] = [:]
    func beginTransition() throws {
        lock.lock(); defer { lock.unlock() }
        guard !transitioning, operations.isEmpty else { throw RuntimeEnvironmentError.busy }
        transitioning = true
    }
    func beginMaintenance() throws -> UUID {
        lock.lock(); defer { lock.unlock() }
        guard !transitioning, operations.isEmpty else { throw RuntimeEnvironmentError.busy }
        let id = UUID(); transitioning = true; maintenance = id; return id
    }
    func endMaintenance(_ id: UUID) {
        lock.lock(); defer { lock.unlock() }
        guard maintenance == id else { return }
        maintenance = nil; transitioning = false
    }
    func endTransition() {
        lock.lock(); defer { lock.unlock() }
        guard maintenance == nil else { return }
        transitioning = false
    }
    func ownsMaintenance(_ id: UUID) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return maintenance == id && transitioning
    }
    func beginWrite(maintenance owner: UUID? = nil) throws -> UUID {
        lock.lock(); defer { lock.unlock() }
        guard !transitioning || (owner != nil && maintenance == owner) else { throw RuntimeEnvironmentError.busy }
        let id = UUID(); operations[id] = .apiWrite; return id
    }
    @discardableResult
    func begin(_ kind: Kind) throws -> UUID {
        lock.lock(); defer { lock.unlock() }
        guard !transitioning else { throw RuntimeEnvironmentError.busy }
        let id = UUID(); operations[id] = kind; return id
    }
    func end(_ id: UUID) {
        lock.lock(); defer { lock.unlock() }
        operations.removeValue(forKey: id)
    }
    var counts: [Kind: Int] {
        lock.lock(); defer { lock.unlock() }
        return Dictionary(grouping: operations.values, by: { $0 }).mapValues(\.count)
    }
}

enum RuntimeMaintenanceContext {
    @TaskLocal static var logoutPermit: UUID?
}

extension TalentSignalNetworking {
    static func data(for request: URLRequest, using session: URLSession) async throws -> (Data, URLResponse) {
        let synthetic = LabFaultURLProtocol.isIsolated(session)
        if synthetic && !LabFaultURLProtocol.permits(request) { throw URLError(.unsupportedURL) }
        let method = request.httpMethod ?? "GET"
        let permit = method == "POST" && request.url?.path == "/v1/auth/logout" ? RuntimeMaintenanceContext.logoutPermit : nil
        let operation = ["POST", "PUT", "PATCH", "DELETE"].contains(method)
            ? try RuntimeWorkRegistry.shared.beginWrite(maintenance: permit) : nil
        defer { if let operation { RuntimeWorkRegistry.shared.end(operation) } }
        guard let ticket = LabDiagnosticsEngine.shared.begin(request, origin: synthetic ? .syntheticFault : .runtime) else {
            return try await session.data(for: request)
        }
        let delegate = LabDiagnosticRequestDelegate()
        var measuredRequest = request
        let asksForServerTrace = !synthetic && LabServerTrace.mayRequest(request)
        if asksForServerTrace {
            measuredRequest.setValue(ticket.requestID.uuidString.lowercased(), forHTTPHeaderField: LabServerTrace.requestHeader)
        }
        do {
            let result = try await session.data(for: measuredRequest, delegate: delegate)
            let serverTrace = asksForServerTrace ? LabServerTrace.parse(
                (result.1 as? HTTPURLResponse)?.value(forHTTPHeaderField: LabServerTrace.responseHeader),
                requestID: ticket.requestID) : nil
            LabDiagnosticsEngine.shared.finish(ticket, status: (result.1 as? HTTPURLResponse)?.statusCode,
                receivedBytes: result.0.count, error: nil, phases: delegate.phases, serverTrace: serverTrace)
            return result
        } catch {
            LabDiagnosticsEngine.shared.finish(ticket, status: nil, receivedBytes: nil, error: error, phases: delegate.phases)
            throw error
        }
    }
}
