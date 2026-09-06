import Foundation
import Darwin
import os.signpost

// Synchronous, bounded in-memory capture. No disk IO or UI work holds the request lock.
final class LabDiagnosticsEngine: @unchecked Sendable {
    static let shared = LabDiagnosticsEngine()
    static func clock() -> Double { Double(clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)) / 1_000_000_000 }
    struct ClientTicket: Sendable { let reportID: UUID; let id: UUID; let started: Double }
    struct Ticket { let reportID: UUID; let requestID: UUID; let started: Double }
    private let lock = NSLock()
    private let clock: () -> Double
    private let enabled: Bool
    private var report: LabDiagnosticReport?
    private var startTime = 0.0
    private let log = OSLog(subsystem: "com.talentsignal.app", category: "LabDiagnostics")
    private var signpost: OSSignpostID?
    private var clientSignposts: [UUID: OSSignpostID] = [:]
    init(enabled: Bool = DeviceLabAvailability.enabled, clock: @escaping () -> Double = LabDiagnosticsEngine.clock) {
        self.enabled = enabled; self.clock = clock
    }
    @discardableResult
    func start(task: LabDiagnosticTask, now: Date) -> LabDiagnosticReport? {
        lock.lock(); defer { lock.unlock() }
        guard enabled, report == nil else { return nil }
#if targetEnvironment(simulator)
        let simulator = true
#else
        let simulator = false
#endif
        let value = LabDiagnosticReport(id: UUID(), task: task, startedAt: now, simulator: simulator)
        report = value; startTime = clock()
        let id = OSSignpostID(log: log); signpost = id
        os_signpost(.begin, log: log, name: "LabDiagnosticSession", signpostID: id)
        return value
    }
    func begin(_ request: URLRequest, origin: LabDiagnosticOrigin = .runtime) -> Ticket? {
        lock.lock(); defer { lock.unlock() }
        guard var value = report, clock() - startTime < 600 else { return nil }
        guard value.requests.count < 160 else { value.droppedRequests += 1; report = value; return nil }
        let started = clock(), id = UUID()
        value.requests.append(.init(id: id, offsetMilliseconds: max(0, started - startTime) * 1000,
            route: .classify(request.url), method: LabDiagnosticMethod(rawValue: request.httpMethod ?? "GET") ?? .other, origin: origin))
        if let parent = LabClientDiagnostics.current, parent.reportID == value.id,
           value.clientSpans?.contains(where: { $0.id == parent.id && $0.durationMilliseconds == nil }) == true {
            value.requests[value.requests.count - 1].clientSpanID = parent.id
        }
        report = value
        return Ticket(reportID: value.id, requestID: id, started: started)
    }
    func finish(_ ticket: Ticket, status: Int?, receivedBytes: Int?, error: Error?, phases: [LabDiagnosticPhase] = [], serverTrace: LabServerTrace? = nil) {
        lock.lock(); defer { lock.unlock() }
        guard var value = report, clock() - startTime < 600, value.id == ticket.reportID,
              let index = value.requests.firstIndex(where: { $0.id == ticket.requestID }),
              value.requests[index].durationMilliseconds == nil else { return }
        value.requests[index].durationMilliseconds = max(0, clock() - ticket.started) * 1000
        value.requests[index].status = status.flatMap { (100...599).contains($0) ? $0 : nil }
        value.requests[index].receivedBytes = receivedBytes.map { max(0, $0) }
        if let error {
            switch (error as? URLError)?.code {
            case .cancelled: value.requests[index].failure = .cancelled
            case .timedOut: value.requests[index].failure = .timeout
            case .notConnectedToInternet: value.requests[index].failure = .offline
            default: value.requests[index].failure = .transport
            }
        }
        value.requests[index].phases = Array(phases.filter { $0.milliseconds.isFinite && $0.milliseconds >= 0 }.prefix(24))
        if let serverTrace, serverTrace.requestID == ticket.requestID, serverTrace.isValid {
            value.requests[index].serverTrace = serverTrace
        }
        report = value
    }
    func beginClientSpan(_ kind: LabClientSpan.Kind, parent: ClientTicket?) -> ClientTicket? {
        lock.lock(); defer { lock.unlock() }
        guard var value = report, clock() - startTime < 600 else { return nil }
        var spans = value.clientSpans ?? []
        guard spans.count < 120 else { value.droppedClientSpans = min(1_000_000, (value.droppedClientSpans ?? 0) + 1); report = value; return nil }
        if let parent {
            guard parent.reportID == value.id, spans.contains(where: { $0.id == parent.id && $0.durationMilliseconds == nil }) else { return nil }
        }
        let started = clock(), id = UUID()
        spans.append(.init(id: id, parentID: parent?.id, kind: kind, offsetMilliseconds: max(0, started - startTime) * 1000))
        value.clientSpans = spans; report = value
        let signpost = OSSignpostID(log: log); clientSignposts[id] = signpost
        os_signpost(.begin, log: log, name: "LabClientStage", signpostID: signpost, "%{public}@", kind.rawValue)
        return .init(reportID: value.id, id: id, started: started)
    }
    func finishClientSpan(_ ticket: ClientTicket, outcome: LabClientSpan.Outcome) {
        lock.lock(); defer { lock.unlock() }
        guard outcome != .unfinished, var value = report, value.id == ticket.reportID, clock() - startTime < 600,
              let index = value.clientSpans?.firstIndex(where: { $0.id == ticket.id }),
              value.clientSpans?[index].durationMilliseconds == nil else { return }
        value.clientSpans?[index].durationMilliseconds = max(0, clock() - ticket.started) * 1000
        value.clientSpans?[index].outcome = outcome
        if let signpost = clientSignposts.removeValue(forKey: ticket.id) {
            os_signpost(.end, log: log, name: "LabClientStage", signpostID: signpost, "%{public}@", outcome.rawValue)
        }
        report = value
    }
    func mark(_ marker: LabDiagnosticMarker) {
        lock.lock(); defer { lock.unlock() }
        guard var value = report, clock() - startTime < 600 else { return }
        if value.markers.count < 60 {
            value.markers.append(.init(id: UUID(), offsetMilliseconds: max(0, clock() - startTime) * 1000, marker: marker))
            os_signpost(.event, log: log, name: "LabDiagnosticMarker", "%{public}@", marker.rawValue)
        } else { value.droppedMarkers += 1 }
        report = value
    }
    func sample(_ sample: LabDiagnosticSample) {
        lock.lock(); defer { lock.unlock() }
        guard var value = report, value.samples.count < 301 else { return }
        value.samples.append(sample); report = value
    }
    func addOverhead(_ milliseconds: Double) {
        lock.lock(); defer { lock.unlock() }
        guard milliseconds.isFinite, milliseconds >= 0 else { return }
        report?.samplingOverheadMilliseconds += milliseconds
    }
    func snapshot() -> LabDiagnosticReport? {
        lock.lock(); defer { lock.unlock() }
        guard var value = report else { return nil }
        value.durationMilliseconds = max(0, clock() - startTime) * 1000
        return value
    }
    func stop(_ reason: LabDiagnosticEnd) -> LabDiagnosticReport? {
        lock.lock(); defer { lock.unlock() }
        guard var value = report else { return nil }
        value.durationMilliseconds = max(0, clock() - startTime) * 1000; value.ended = reason
        for index in value.requests.indices where value.requests[index].durationMilliseconds == nil {
            value.requests[index].failure = .unfinished
        }
        report = nil
        for value in clientSignposts.values {
            os_signpost(.end, log: log, name: "LabClientStage", signpostID: value, "capture-stopped")
        }
        clientSignposts.removeAll()
        if let signpost { os_signpost(.end, log: log, name: "LabDiagnosticSession", signpostID: signpost) }
        signpost = nil
        return value
    }
}

// Per-task metrics preserve the existing redirect rejection and never retain URLSessionTaskMetrics itself.
final class LabDiagnosticRequestDelegate: RuntimeRedirectGuard, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [LabDiagnosticPhase] = []
    var phases: [LabDiagnosticPhase] { lock.lock(); defer { lock.unlock() }; return values }
    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        var measured: [LabDiagnosticPhase] = []
        func add(_ kind: LabDiagnosticPhase.Kind, _ start: Date?, _ end: Date?) {
            if let start, let end, end >= start {
                measured.append(.init(kind: kind, milliseconds: end.timeIntervalSince(start) * 1000))
            }
        }
        for transaction in metrics.transactionMetrics.prefix(4) {
            add(.dns, transaction.domainLookupStartDate, transaction.domainLookupEndDate)
            add(.connect, transaction.connectStartDate, transaction.connectEndDate)
            add(.tls, transaction.secureConnectionStartDate, transaction.secureConnectionEndDate)
            add(.send, transaction.requestStartDate, transaction.requestEndDate)
            add(.waitForResponse, transaction.requestEndDate, transaction.responseStartDate)
            add(.receive, transaction.responseStartDate, transaction.responseEndDate)
        }
        lock.lock(); values = measured; lock.unlock()
    }
}
