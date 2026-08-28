import EventKit
import Foundation

struct StandaloneCalendarChoice: Identifiable, Equatable {
    let id: String
    let title: String
}

enum StandaloneCalendarWindow: String, Codable, CaseIterable, Identifiable {
    case recent = "Past 14 days"
    case upcoming = "Next 14 days"
    case recentAndUpcoming = "Past + next 14 days (28 days total)"

    var id: String { rawValue }

    func interval(now: Date, calendar: Calendar = .current) -> DateInterval {
        let start = self == .upcoming
            ? now
            : (calendar.date(byAdding: .day, value: -14, to: now) ?? now)
        let end = self == .recent
            ? now
            : (calendar.date(byAdding: .day, value: 14, to: now) ?? now)
        return DateInterval(start: start, end: end)
    }
}

@MainActor
final class StandaloneCalendarService: ObservableObject {
    @Published private(set) var permission: StandaloneCalendarPermission = .notDetermined
    @Published private(set) var calendars: [StandaloneCalendarChoice] = []
    @Published private(set) var meetings: [StandaloneMeeting] = []
    @Published private(set) var isLoading = false
    @Published private(set) var notice: String?
    @Published var selectedCalendarIDs: Set<String> = []
    @Published private(set) var window: StandaloneCalendarWindow = .upcoming

    private let eventStore: EKEventStore
    private var eventStoreObserver: NSObjectProtocol?

    init(eventStore: EKEventStore = EKEventStore()) {
        self.eventStore = eventStore
        eventStoreObserver = NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged,
            object: eventStore,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    deinit {
        if let eventStoreObserver {
            NotificationCenter.default.removeObserver(eventStoreObserver)
        }
    }

    func requestFullAccess() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let granted: Bool
            if #available(iOS 17.0, *) {
                granted = try await eventStore.requestFullAccessToEvents()
            } else {
                granted = try await withCheckedThrowingContinuation { continuation in
                    eventStore.requestAccess(to: .event) { value, error in
                        if let error { continuation.resume(throwing: error) }
                        else { continuation.resume(returning: value) }
                    }
                }
            }
            notice = granted
                ? nil
                : "Calendar access was not granted. Continue with Voice or Type a Signal."
        } catch {
            notice = "Calendar permission could not be completed. Continue without Calendar: \(error.localizedDescription)"
        }
        await refresh()
    }

    func refresh(now: Date = Date()) async {
        let observed = Self.permissionStatus()
        permission = observed
        guard observed == .fullAccess else {
            calendars = []
            meetings = []
            return
        }
        isLoading = true
        defer { isLoading = false }
        let eventCalendars = eventStore.calendars(for: .event)
            .filter { $0.allowsContentModifications || $0.type != .birthday }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        calendars = eventCalendars.map {
            StandaloneCalendarChoice(id: $0.calendarIdentifier, title: $0.title)
        }
        selectedCalendarIDs.formIntersection(Set(calendars.map(\.id)))
        let selected = eventCalendars.filter { selectedCalendarIDs.contains($0.calendarIdentifier) }
        guard !selected.isEmpty else {
            meetings = []
            permission = .fullAccess
            notice = "Choose at least one calendar. No events have been read yet."
            return
        }
        notice = nil
        let interval = window.interval(now: now)
        let predicate = eventStore.predicateForEvents(
            withStart: interval.start,
            end: interval.end,
            calendars: selected
        )
        meetings = eventStore.events(matching: predicate)
            .filter { !$0.isAllDay && !$0.isDetached && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted {
                let left = abs($0.startDate.timeIntervalSince(now))
                let right = abs($1.startDate.timeIntervalSince(now))
                if left == right { return $0.startDate < $1.startDate }
                return left < right
            }
            .prefix(5)
            .map {
                StandaloneMeeting(
                    id: $0.eventIdentifier ?? $0.calendarItemIdentifier,
                    eventIdentifier: $0.eventIdentifier,
                    title: $0.title,
                    startsAt: $0.startDate,
                    endsAt: $0.endDate,
                    calendarTitle: $0.calendar.title,
                    isDemo: false
                )
            }
        permission = meetings.isEmpty ? .connectedEmpty : .connectedWithMeetings
    }

    func toggleCalendar(_ id: String) async {
        if selectedCalendarIDs.contains(id) {
            selectedCalendarIDs.remove(id)
        } else {
            selectedCalendarIDs.insert(id)
        }
        await refresh()
    }

    func restoreSelection(_ ids: Set<String>) {
        selectedCalendarIDs = ids
    }

    func setWindow(_ window: StandaloneCalendarWindow) async {
        self.window = window
        await refresh()
    }

    static func permissionStatus() -> StandaloneCalendarPermission {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            switch status {
            case .fullAccess: return .fullAccess
            case .writeOnly: return .writeOnly
            case .notDetermined: return .notDetermined
            case .denied: return .denied
            case .restricted: return .restricted
            case .authorized: return .fullAccess
            @unknown default: return .restricted
            }
        }
        switch status {
        case .authorized: return .fullAccess
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        case .restricted: return .restricted
        default: return .restricted
        }
    }

    static func demoMeeting(now: Date = Date()) -> StandaloneMeeting {
        let start = Calendar.current.date(byAdding: .hour, value: -2, to: now) ?? now
        return StandaloneMeeting(
            id: "demo-meeting-mina-v1",
            eventIdentifier: nil,
            title: "Candidate catch-up with Mina",
            startsAt: start,
            endsAt: start.addingTimeInterval(30 * 60),
            calendarTitle: "Talent Signal Demo",
            isDemo: true
        )
    }
}
