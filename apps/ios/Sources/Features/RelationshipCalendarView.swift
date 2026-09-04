import CryptoKit
import SwiftUI

struct RelationshipCalendarActivity: Identifiable, Equatable {
    enum Kind: String, CaseIterable, Equatable, Identifiable {
        case interview
        case meeting
        case conversation

        var id: String { rawValue }

        func title(in language: AppLanguage) -> String {
            switch self {
            case .interview:
                return language.text("Interview")
            case .meeting:
                return language.text("Meeting")
            case .conversation:
                return language.text("Conversation")
            }
        }

        var symbolName: String {
            switch self {
            case .interview:
                return "person.2"
            case .meeting:
                return "calendar"
            case .conversation:
                return "bubble.left.and.bubble.right"
            }
        }
    }

    enum Source: String, Equatable {
        case governed
        case preview
        case talentSignal
    }

    enum CalendarSyncState: String, Equatable {
        case disabled
        case pending
        case syncing
        case synced
        case failed
        case unknown
    }

    let id: String
    let kind: Kind
    let title: String
    let personID: String
    let relationshipContextID: String
    let personDisplayLabel: String
    let contextDisplayLabel: String
    let startDate: Date
    let endDate: Date
    let timeZoneIdentifier: String
    let source: Source
    var eventIdentifier: String?
    var calendarSyncState: CalendarSyncState = .disabled
    var lastCalendarSyncAttempt: Date? = nil

    func displayTitle(in language: AppLanguage) -> String {
        source == .preview && id.hasPrefix("preview-calendar-") ? kind.title(in: language) : title
    }

    func updatingCalendarSync(
        _ state: CalendarSyncState,
        eventIdentifier: String? = nil,
        attemptedAt: Date = Date()
    ) -> RelationshipCalendarActivity {
        var updated = self
        updated.calendarSyncState = state
        updated.lastCalendarSyncAttempt = attemptedAt
        if let eventIdentifier {
            updated.eventIdentifier = eventIdentifier
        }
        return updated
    }
}

enum CalendarSyncPreference {
    static let isEnabledKey = "talent-signal.calendar-sync.enabled"
}

private struct StoredRelationshipCalendarActivity: Codable, Equatable {
    let id: String
    let kind: String
    let title: String
    let personID: String
    let relationshipContextID: String
    let startDate: Date
    let endDate: Date
    let timeZoneIdentifier: String
    let source: String?
    let eventIdentifier: String?
    let calendarSyncState: String?
    let lastCalendarSyncAttempt: Date?
    let savedAt: Date
}

protocol RelationshipCalendarActivityPersisting: AnyObject {
    func activities(in snapshot: PursuitWorkspaceSnapshot) throws
        -> [RelationshipCalendarActivity]
    func save(_ activity: RelationshipCalendarActivity) throws
    func remove(activityID: String) throws
}

final class FileRelationshipCalendarActivityStore:
    RelationshipCalendarActivityPersisting {
    private let fileURL: URL

    init(
        accountID: String,
        rootURL: URL? = nil
    ) {
        let digest = SHA256.hash(data: Data(accountID.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        let root = rootURL ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        fileURL = root
            .appending(
                path: "TalentSignal/CalendarActivities",
                directoryHint: .isDirectory
            )
            .appending(path: "\(digest).json")
    }

    func activities(
        in snapshot: PursuitWorkspaceSnapshot
    ) throws -> [RelationshipCalendarActivity] {
        try entries().values.compactMap { stored in
            guard let kind = RelationshipCalendarActivity.Kind(
                rawValue: stored.kind
            ), let person = snapshot.people.first(where: {
                $0.id == stored.personID
            }), let context = person.contexts.first(where: {
                $0.id == stored.relationshipContextID
            }) else {
                return nil
            }
            let decodedSyncState = stored.calendarSyncState.flatMap(
                RelationshipCalendarActivity.CalendarSyncState.init(rawValue:)
            ) ?? (stored.eventIdentifier == nil ? .pending : .synced)
            return RelationshipCalendarActivity(
                id: stored.id,
                kind: kind,
                title: stored.title,
                personID: stored.personID,
                relationshipContextID: stored.relationshipContextID,
                personDisplayLabel: person.displayLabel,
                contextDisplayLabel: context.displayLabel,
                startDate: stored.startDate,
                endDate: stored.endDate,
                timeZoneIdentifier: stored.timeZoneIdentifier,
                source: .talentSignal,
                eventIdentifier: stored.eventIdentifier,
                calendarSyncState: decodedSyncState == .syncing
                    ? .unknown
                    : decodedSyncState,
                lastCalendarSyncAttempt: stored.lastCalendarSyncAttempt
            )
        }
        .sorted { $0.startDate < $1.startDate }
    }

    func save(_ activity: RelationshipCalendarActivity) throws {
        guard activity.source != .preview else {
            return
        }
        var next = try entries()
        next[activity.id] = StoredRelationshipCalendarActivity(
            id: activity.id,
            kind: activity.kind.rawValue,
            title: activity.title,
            personID: activity.personID,
            relationshipContextID: activity.relationshipContextID,
            startDate: activity.startDate,
            endDate: activity.endDate,
            timeZoneIdentifier: activity.timeZoneIdentifier,
            source: activity.source.rawValue,
            eventIdentifier: activity.eventIdentifier,
            calendarSyncState: activity.calendarSyncState.rawValue,
            lastCalendarSyncAttempt: activity.lastCalendarSyncAttempt,
            savedAt: Date()
        )
        try write(next)
    }

    func remove(activityID: String) throws {
        var next = try entries()
        next.removeValue(forKey: activityID)
        if next.isEmpty {
            if FileManager.default.fileExists(atPath: fileURL.path) {
                try FileManager.default.removeItem(at: fileURL)
            }
        } else {
            try write(next)
        }
    }

    private func entries() throws -> [String: StoredRelationshipCalendarActivity] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return [:]
        }
        return try JSONDecoder().decode(
            [String: StoredRelationshipCalendarActivity].self,
            from: Data(contentsOf: fileURL)
        )
    }

    private func write(
        _ entries: [String: StoredRelationshipCalendarActivity]
    ) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        var directoryValues = URLResourceValues()
        directoryValues.isExcludedFromBackup = true
        var protectedDirectory = directory
        try protectedDirectory.setResourceValues(directoryValues)
        try JSONEncoder().encode(entries).write(
            to: fileURL,
            options: [.atomic, .completeFileProtectionUnlessOpen]
        )
    }
}

enum RelationshipCalendarProjection {
    static func activities(
        snapshot: PursuitWorkspaceSnapshot,
        isPreview: Bool,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [RelationshipCalendarActivity] {
        guard isPreview else { return [] }
        let scopes = snapshot.people.flatMap { person in
            person.contexts.map { (person, $0) }
        }
        guard let first = scopes.first else { return [] }

        let today = calendar.startOfDay(for: now)
        let afternoon = calendar.date(
            bySettingHour: 15,
            minute: 0,
            second: 0,
            of: today
        ) ?? now.addingTimeInterval(3_600)
        let firstStart: Date
        if afternoon > now.addingTimeInterval(30 * 60) {
            firstStart = afternoon
        } else {
            let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)
                ?? now.addingTimeInterval(24 * 60 * 60)
            firstStart = calendar.date(
                bySettingHour: 15,
                minute: 0,
                second: 0,
                of: tomorrow
            ) ?? tomorrow
        }

        var result = [
            RelationshipCalendarActivity(
                id: "preview-calendar-primary",
                kind: .interview,
                title: "Interview",
                personID: first.0.id,
                relationshipContextID: first.1.id,
                personDisplayLabel: first.0.displayLabel,
                contextDisplayLabel: first.1.displayLabel,
                startDate: firstStart,
                endDate: firstStart.addingTimeInterval(45 * 60),
                timeZoneIdentifier: "Asia/Singapore",
                source: .preview,
                eventIdentifier: nil
            ),
        ]

        if scopes.count > 1 {
            let secondDay = calendar.date(
                byAdding: .day,
                value: 2,
                to: calendar.startOfDay(for: firstStart)
            ) ?? firstStart.addingTimeInterval(2 * 24 * 60 * 60)
            let secondStart = calendar.date(
                bySettingHour: 11,
                minute: 30,
                second: 0,
                of: secondDay
            ) ?? secondDay
            let second = scopes[1]
            result.append(
                RelationshipCalendarActivity(
                    id: "preview-calendar-secondary",
                    kind: .conversation,
                    title: "Conversation",
                    personID: second.0.id,
                    relationshipContextID: second.1.id,
                    personDisplayLabel: second.0.displayLabel,
                    contextDisplayLabel: second.1.displayLabel,
                    startDate: secondStart,
                    endDate: secondStart.addingTimeInterval(30 * 60),
                    timeZoneIdentifier: "Asia/Singapore",
                    source: .preview,
                    eventIdentifier: nil
                )
            )
        }
        return result.sorted { $0.startDate < $1.startDate }
    }

    static func next(
        in activities: [RelationshipCalendarActivity],
        now: Date = Date()
    ) -> RelationshipCalendarActivity? {
        activities
            .filter { $0.endDate >= now }
            .min { $0.startDate < $1.startDate }
    }
}

enum RelationshipCalendarAgenda {
    enum Mode: String, CaseIterable, Identifiable {
        case day, week
        var id: String { rawValue }
    }

    static func interval(for date: Date, mode: Mode, calendar: Calendar) -> DateInterval {
        let start = calendar.startOfDay(for: date)
        let end = calendar.date(byAdding: .day, value: mode == .day ? 1 : 7, to: start)!
        return DateInterval(start: start, end: end)
    }

    static func activities(
        _ activities: [RelationshipCalendarActivity],
        in interval: DateInterval,
        personID: String? = nil
    ) -> [RelationshipCalendarActivity] {
        activities.filter {
            (personID == nil || $0.personID == personID)
                && $0.startDate < interval.end && $0.endDate > interval.start
                && $0.endDate > $0.startDate
        }.sorted {
            $0.startDate == $1.startDate ? $0.id < $1.id : $0.startDate < $1.startDate
        }
    }

    static func overlappingIDs(in activities: [RelationshipCalendarActivity]) -> Set<String> {
        let sorted = activities.filter { $0.endDate > $0.startDate }
            .sorted { $0.startDate < $1.startDate }
        var result: Set<String> = []
        for (index, activity) in sorted.enumerated() {
            for other in sorted.dropFirst(index + 1) {
                guard other.startDate < activity.endDate else { break }
                if other.id != activity.id {
                    result.insert(activity.id)
                    result.insert(other.id)
                }
            }
        }
        return result
    }

    static func suggestedStart(on date: Date, now: Date = Date(), calendar: Calendar) -> Date {
        let morning = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: date) ?? date
        let nextHour = calendar.dateInterval(of: .hour, for: now)?.end ?? now.addingTimeInterval(3600)
        return max(morning, nextHour)
    }
}

struct TodayRelationshipCalendarPeek: View {
    let activities: [RelationshipCalendarActivity]
    let onOpen: () -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 14) {
                    timeMark
                    Spacer(minLength: 8)
                    openMark
                }
                momentCopy
                    .layoutPriority(1)
            }
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Color.tsLine)
                    .frame(height: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(
            appLanguage.text("Opens the relationship calendar.")
        )
        .accessibilityIdentifier("today-calendar-reminder")
    }

    private var nextActivity: RelationshipCalendarActivity? {
        RelationshipCalendarProjection.next(in: activities)
    }

    private var timeMark: some View {
        HStack(spacing: 9) {
            VStack(spacing: 0) {
                Circle()
                    .fill(Color.tsVermilion)
                    .frame(width: 7, height: 7)
                Rectangle()
                    .fill(Color.tsVermilion)
                    .frame(width: 1, height: 35)
            }
            Text(nextActivity.map { timeText($0.startDate, in: $0) } ?? "—")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.tsVermilion)
                .fixedSize()
        }
        .frame(minWidth: dynamicTypeSize.isAccessibilitySize ? nil : 96, alignment: .leading)
        .accessibilityHidden(true)
    }

    private var momentCopy: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let nextActivity {
                Text(
                    verbatim: "\(nextActivity.personDisplayLabel) · \(nextActivity.displayTitle(in: appLanguage))"
                )
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                Text(
                    verbatim: "\(contextText(nextActivity)) · \(timeZoneText(nextActivity))"
                )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
            } else {
                Text(appLanguage.text("No activity"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var openMark: some View {
        Image(systemName: "chevron.right")
            .font(.caption.weight(.bold))
            .foregroundStyle(Color.tsMutedInk)
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityHidden(true)
    }

    private var accessibilityLabel: String {
        guard let nextActivity else {
            return appLanguage.text("Calendar. No linked moments.")
        }
        let nextSummary = String(
            format: appLanguage.text("Calendar. Next: %@, %@, %@."),
            locale: appLanguage.locale,
            nextActivity.personDisplayLabel,
            nextActivity.displayTitle(in: appLanguage),
            dateTimeText(nextActivity.startDate)
        )
        return "\(nextSummary) \(contextText(nextActivity)) · \(timeZoneText(nextActivity))"
    }

    private func timeText(
        _ date: Date,
        in activity: RelationshipCalendarActivity
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale = appLanguage.locale
        formatter.timeZone = TimeZone(identifier: activity.timeZoneIdentifier)
            ?? .current
        formatter.setLocalizedDateFormatFromTemplate("j:mm")
        return formatter.string(from: date)
    }

    private func timeZoneText(_ activity: RelationshipCalendarActivity) -> String {
        if activity.timeZoneIdentifier == "Asia/Singapore" {
            return appLanguage.text("Singapore time")
        }
        return activity.timeZoneIdentifier.replacingOccurrences(of: "_", with: " ")
    }

    private func contextText(_ activity: RelationshipCalendarActivity) -> String {
        guard activity.source == .preview,
              appLanguage.usesSimplifiedChinese() else {
            return appLanguage.workspaceTerm(activity.contextDisplayLabel)
        }
        switch activity.contextDisplayLabel {
        case "Chief Product Officer search":
            return "首席产品官搜索"
        case "Board search":
            return "董事会搜寻"
        default:
            return appLanguage.workspaceTerm(activity.contextDisplayLabel)
        }
    }

    private func dateTimeText(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle()
                .weekday(.wide)
                .hour()
                .minute()
                .locale(appLanguage.locale)
        )
    }
}

@MainActor
struct RelationshipCalendarView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isPreview: Bool
    let initialActivities: [RelationshipCalendarActivity]
    let onPrepare: (RelationshipCalendarActivity) -> Void
    let personDetail: ((String) -> AnyView?)?

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(CalendarSyncPreference.isEnabledKey)
    private var isCalendarSyncEnabled = true
    @State private var activities: [RelationshipCalendarActivity]
    @State private var selectedDate: Date
    @State private var agendaMode: RelationshipCalendarAgenda.Mode = .day
    @State private var selectedPersonID: String?
    @State private var isMonthExpanded = false
    @State private var destination: CalendarSheetDestination?
    @State private var calendarNotice: String?
    @State private var syncingActivityIDs: Set<String> = []

    private let activityStore: (any RelationshipCalendarActivityPersisting)?
    private let calendarSync: any DeviceCalendarSyncing

    init(
        snapshot: PursuitWorkspaceSnapshot,
        isPreview: Bool,
        initialActivities: [RelationshipCalendarActivity],
        activityStore: (any RelationshipCalendarActivityPersisting)? = nil,
        calendarSync: (any DeviceCalendarSyncing)? = nil,
        personDetail: ((String) -> AnyView?)? = nil,
        onPrepare: @escaping (RelationshipCalendarActivity) -> Void
    ) {
        self.snapshot = snapshot
        self.isPreview = isPreview
        self.onPrepare = onPrepare
        self.personDetail = personDetail
        let resolvedStore = activityStore ?? (isPreview
            ? nil
            : FileRelationshipCalendarActivityStore(
                accountID: snapshot.workspaceID
            ))
        self.activityStore = resolvedStore
        self.calendarSync = calendarSync
            ?? EventKitDeviceCalendarSyncService()
        let restored = (try? resolvedStore?.activities(in: snapshot)) ?? []
        var combined = initialActivities
        for activity in restored where !combined.contains(where: {
            $0.id == activity.id
        }) {
            combined.append(activity)
        }
        combined.sort { $0.startDate < $1.startDate }
        self.initialActivities = combined
        _activities = State(initialValue: combined)
        let next = RelationshipCalendarProjection.next(in: combined)
        _selectedDate = State(
            initialValue: Calendar.current.startOfDay(
                for: next?.startDate ?? Date()
            )
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    calendarPicker
                    agendaControls
                        .padding(.top, 18)
                    agendaHeader
                        .padding(.top, 22)
                    agenda
                        .padding(.top, 14)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(appLanguage.text("Calendar"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(appLanguage.text("Close")) {
                        dismiss()
                    }
                    .accessibilityIdentifier("close-relationship-calendar")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        destination = .composer
                    } label: {
                        Image(systemName: "plus")
                            .frame(width: 44, height: 44)
                    }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                    .accessibilityLabel(appLanguage.text("Add activity"))
                    .accessibilityIdentifier("calendar-add-activity")
                }
            }
        }
        .tint(.tsInk)
        .sheet(item: $destination) { destination in
            switch destination {
            case let .detail(activity):
                RelationshipCalendarActivityDetail(
                    activity: activity,
                    onOpenPerson: personDetail == nil ? nil : {
                        self.destination = .person(activity.personID)
                    },
                    onRetryCalendarSync: [.pending, .failed].contains(
                        activity.calendarSyncState
                    )
                        && isCalendarSyncEnabled
                        ? { syncToCalendar(activityID: activity.id) }
                        : nil,
                    onPrepare: {
                        self.destination = nil
                        onPrepare(activity)
                        dismiss()
                    }
                )
            case .composer:
                RelationshipCalendarComposer(
                    snapshot: snapshot,
                    syncsToCalendar: isCalendarSyncEnabled && !isPreview,
                    isPreview: isPreview,
                    selectedDate: selectedDate,
                    preferredPersonID: selectedPersonID
                ) { activity in
                    confirm(activity)
                }
            case let .person(personID):
                if let detail = personDetail?(personID) {
                    detail
                } else {
                    Text(appLanguage.text("This person is no longer available."))
                        .padding(24)
                }
            case .people:
                RelationshipCalendarPersonFilter(
                    people: snapshot.people,
                    selectedPersonID: selectedPersonID
                ) { personID in
                    selectedPersonID = personID
                    self.destination = nil
                }
            }
        }
        .accessibilityIdentifier("relationship-calendar")
        .task { resumePendingCalendarSync() }
    }

    private func confirm(_ activity: RelationshipCalendarActivity) {
        do {
            try activityStore?.save(activity)
        } catch {
            calendarNotice = appLanguage.text(
                "The event could not be saved in Talent Signal. Nothing was added to Apple Calendar."
            )
            return
        }

        activities.removeAll { $0.id == activity.id }
        activities.append(activity)
        activities.sort { $0.startDate < $1.startDate }
        selectedDate = Calendar.current.startOfDay(for: activity.startDate)
        if selectedPersonID != nil { selectedPersonID = activity.personID }
        destination = .detail(activity)
        guard activity.calendarSyncState == .pending else { return }
        syncToCalendar(activityID: activity.id)
    }

    private func syncToCalendar(activityID: String) {
        guard !isPreview, !syncingActivityIDs.contains(activityID),
              let index = activities.firstIndex(where: { $0.id == activityID }),
              [.pending, .failed].contains(activities[index].calendarSyncState),
              isCalendarSyncEnabled else { return }

        let syncingActivity = activities[index].updatingCalendarSync(.syncing)
        do {
            try activityStore?.save(syncingActivity)
        } catch {
            calendarNotice = appLanguage.text(
                "The sync attempt could not be recorded in Talent Signal. Nothing was added to Apple Calendar."
            )
            return
        }
        activities[index] = syncingActivity
        destination = .detail(syncingActivity)
        syncingActivityIDs.insert(activityID)
        calendarNotice = nil

        Task { @MainActor in
            let proposal = DeviceCalendarProposal(
                sourceID: syncingActivity.id,
                personDisplayName: syncingActivity.personDisplayLabel,
                title: syncingActivity.title,
                startDate: syncingActivity.startDate,
                endDate: syncingActivity.endDate,
                timeZoneIdentifier: syncingActivity.timeZoneIdentifier,
                evidenceQuote: appLanguage.text(
                    "User-confirmed Talent Signal calendar event"
                ),
                detectedDateText: syncingActivity.startDate.ISO8601Format(),
                durationWasExplicit: true
            )
            let result = await calendarSync.createEvent(from: proposal)
            syncingActivityIDs.remove(activityID)
            guard let index = activities.firstIndex(where: {
                $0.id == activityID
            }) else { return }

            switch result {
            case let .success(event):
                activities[index] = activities[index].updatingCalendarSync(
                    .synced,
                    eventIdentifier: event.identifier
                )
            case .failure(.saveFailed):
                activities[index] = activities[index].updatingCalendarSync(
                    .unknown
                )
                calendarNotice = appLanguage.text(
                    "The event is saved in Talent Signal. Apple Calendar returned an uncertain result; check Apple Calendar before taking any further action."
                )
            case .failure:
                activities[index] = activities[index].updatingCalendarSync(
                    .failed
                )
                calendarNotice = appLanguage.text(
                    "The event is saved in Talent Signal. Apple Calendar sync failed; open the event to try again."
                )
            }
            do {
                try activityStore?.save(activities[index])
            } catch {
                calendarNotice = appLanguage.text(
                    "Calendar sync finished, but its receipt could not be saved in Talent Signal."
                )
            }
            destination = .detail(activities[index])
        }
    }

    private func resumePendingCalendarSync() {
        guard isCalendarSyncEnabled && !isPreview else { return }
        for activity in activities where activity.calendarSyncState == .pending {
            syncToCalendar(activityID: activity.id)
        }
    }

    private var calendarPicker: some View {
        VStack(spacing: 8) {
            HStack(spacing: 4) {
                Button {
                    updateCalendar {
                        isMonthExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 7) {
                        Text(monthTitle)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.tsMutedInk)
                            .rotationEffect(.degrees(isMonthExpanded ? 180 : 0))
                            .animation(calendarMotion, value: isMonthExpanded)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    appLanguage.text(isMonthExpanded ? "Collapse month" : "Expand month")
                )
                .accessibilityValue(monthTitle)
                .accessibilityIdentifier("calendar-toggle-month")

                Spacer(minLength: 8)

                Button(appLanguage.text("Today")) { select(Date()) }
                    .font(.caption.weight(.semibold))
                    .frame(minWidth: 44, minHeight: 44)
                    .accessibilityIdentifier("calendar-return-today")

                if isMonthExpanded {
                    HStack(spacing: 0) {
                        monthNavigationButton(
                            symbol: "chevron.left",
                            label: appLanguage.text("Previous month"),
                            identifier: "calendar-previous-month",
                            offset: -1
                        )
                        monthNavigationButton(
                            symbol: "chevron.right",
                            label: appLanguage.text("Next month"),
                            identifier: "calendar-next-month",
                            offset: 1
                        )
                    }
                } else {
                    HStack(spacing: 0) {
                        weekNavigationButton(offset: -1)
                        weekNavigationButton(offset: 1)
                    }
                }
            }
            .padding(.horizontal, 8)

            calendarGrid
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .padding(7)
        .background(
            Color.tsCanvas,
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
    }

    private var calendarGrid: some View {
        VStack(spacing: 6) {
            LazyVGrid(columns: monthColumns, spacing: 4) {
                ForEach(weekdayHeaderDates, id: \.self) { date in
                    Text(weekdayText(for: date))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                        .frame(maxWidth: .infinity, minHeight: 28)
                        .accessibilityHidden(true)
                }
            }

            LazyVGrid(columns: monthColumns, spacing: calendarRowSpacing) {
                ForEach(visibleGridDates, id: \.self) { date in
                    monthDayCell(date)
                }
            }
            .transaction { transaction in
                transaction.disablesAnimations = true
            }
            .frame(height: visibleGridHeight, alignment: .top)
            .animation(calendarMotion, value: isMonthExpanded)
            .clipped()
        }
        .padding(.horizontal, 2)
        .padding(.bottom, 3)
    }

    @ViewBuilder
    private func monthDayCell(_ date: Date) -> some View {
        if isDateInteractive(date) {
            Button { select(date) } label: {
                monthDayLabel(date)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(dayAccessibilityLabel(date))
            .accessibilityAddTraits(isSelected(date) ? .isSelected : [])
            .accessibilityIdentifier("calendar-month-day-\(dayIdentifier(date))")
        } else {
            monthDayLabel(date)
                .accessibilityHidden(true)
        }
    }

    private func monthDayLabel(_ date: Date) -> some View {
        ZStack(alignment: .bottom) {
            Text(verbatim: "\(calendar.component(.day, from: date))")
                .font(.subheadline.weight(isSelected(date) ? .bold : .medium))
                .foregroundStyle(isSelected(date) ? Color.tsSurface : Color.tsInk)
                .frame(width: 36, height: 36)
                .background(
                    isSelected(date) ? Color.tsInk : Color.clear,
                    in: Circle()
                )
                .overlay {
                    if calendar.isDateInToday(date), !isSelected(date) {
                        Circle().stroke(Color.tsLine, lineWidth: 1)
                    }
                }

            if hasActivity(on: date) {
                Circle()
                    .fill(isSelected(date) ? Color.tsSurface : Color.tsInk)
                    .frame(width: 4, height: 4)
                    .offset(y: -2)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
        .opacity(dayOpacity(date))
    }

    private var agendaControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 4) {
                ForEach(RelationshipCalendarAgenda.Mode.allCases) { mode in
                    Button { agendaMode = mode } label: {
                        Text(appLanguage.text(mode == .day ? "Day agenda" : "Week agenda"))
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(agendaMode == mode ? Color.tsSurface : Color.tsMutedInk)
                            .background(agendaMode == mode ? Color.tsInk : Color.clear,
                                        in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(agendaMode == mode ? .isSelected : [])
                    .accessibilityIdentifier("calendar-view-\(mode.rawValue)")
                }
            }
            .padding(3)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 15))

            HStack(spacing: 8) {
                Button { destination = .people } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "person.crop.circle")
                        Text(selectedPerson?.displayLabel ?? appLanguage.text("All people"))
                            .lineLimit(1)
                        Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.tsInk)
                    .frame(minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(appLanguage.text("Filter by person"))
                .accessibilityValue(selectedPerson?.displayLabel ?? appLanguage.text("All people"))
                .accessibilityIdentifier("calendar-person-filter")
                Spacer(minLength: 0)
                if selectedPersonID != nil {
                    Button { selectedPersonID = nil } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Color.tsMutedInk)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(appLanguage.text("Clear person filter"))
                    .accessibilityIdentifier("calendar-clear-person")
                }
            }
        }
    }

    private var agendaHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(agendaTitle)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .accessibilityAddTraits(.isHeader)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) {
                    agendaSummary
                    Spacer(minLength: 10)
                    displayTimeZone
                }
                .fixedSize(horizontal: true, vertical: false)
                VStack(alignment: .leading, spacing: 6) {
                    agendaSummary
                    displayTimeZone
                }
            }
            if isPreview {
                Text(appLanguage.text("Preview · Calendar not read"))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .accessibilityIdentifier("calendar-preview-boundary")
            }
            if let calendarNotice {
                Label(calendarNotice, systemImage: "exclamationmark.shield")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("calendar-reconciliation-notice")
            }
        }
    }

    private var agendaSummary: some View {
        Text(String(format: appLanguage.text("Activities: %d · People: %d"),
                    locale: appLanguage.locale,
                    selectedActivities.count, Set(selectedActivities.map(\.personID)).count))
            .font(.subheadline)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("calendar-agenda-summary")
    }

    private var displayTimeZone: some View {
        Text(calendar.timeZone.identifier)
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(appLanguage.text("Display time zone") + ": " + calendar.timeZone.identifier)
    }

    @ViewBuilder
    private var agenda: some View {
        if selectedActivities.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(appLanguage.text(selectedPersonID == nil
                    ? "No activities in this period" : "No activities for this person in this period"))
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                Text(appLanguage.text("Only Talent Signal activities are shown."))
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                if let next = nextFilteredActivity {
                    Button { select(next.startDate) } label: {
                        Label(appLanguage.text("Go to next activity"), systemImage: "arrow.right")
                            .frame(minHeight: 44)
                    }
                    .accessibilityIdentifier("calendar-next-activity")
                }
                Button { destination = .composer } label: {
                    Label(appLanguage.text("Add activity"), systemImage: "plus")
                        .frame(minHeight: 44)
                }
                .accessibilityIdentifier("calendar-empty-add-activity")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 18)
        } else {
            let overlappingIDs = overlappingActivityIDs
            VStack(alignment: .leading, spacing: 22) {
                ForEach(agendaDays, id: \.self) { day in
                    let dayActivities = RelationshipCalendarAgenda.activities(
                        selectedActivities,
                        in: RelationshipCalendarAgenda.interval(for: day, mode: .day, calendar: calendar)
                    )
                    if !dayActivities.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            if agendaMode == .week {
                                Text(day.formatted(.dateTime.weekday(.wide).month().day().locale(appLanguage.locale)))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Color.tsInk)
                                    .accessibilityAddTraits(.isHeader)
                            }
                            ForEach(dayActivities) { activity in
                                RelationshipCalendarActivityRow(
                                    activity: activity,
                                    day: day,
                                    hasOverlap: overlappingIDs.contains(activity.id)
                                ) {
                                    destination = .detail(activity)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var selectedPerson: WorkspacePerson? {
        snapshot.people.first { $0.id == selectedPersonID }
    }

    private var agendaInterval: DateInterval {
        RelationshipCalendarAgenda.interval(for: selectedDate, mode: agendaMode, calendar: calendar)
    }

    private var agendaDays: [Date] {
        (0..<(agendaMode == .day ? 1 : 7)).compactMap {
            calendar.date(byAdding: .day, value: $0, to: agendaInterval.start)
        }
    }

    private var agendaTitle: String {
        let start = selectedDate.formatted(.dateTime.month(.wide).day().weekday(.wide).locale(appLanguage.locale))
        guard agendaMode == .week, let last = agendaDays.last else { return start }
        return selectedDate.formatted(.dateTime.month().day().locale(appLanguage.locale))
            + " – " + last.formatted(.dateTime.month().day().locale(appLanguage.locale))
    }

    private var overlappingActivityIDs: Set<String> {
        RelationshipCalendarAgenda.overlappingIDs(in: activities)
    }

    private var nextFilteredActivity: RelationshipCalendarActivity? {
        activities.filter {
            (selectedPersonID == nil || $0.personID == selectedPersonID)
                && $0.startDate >= agendaInterval.end
        }.min { $0.startDate < $1.startDate }
    }

    private func weekNavigationButton(offset: Int) -> some View {
        Button {
            if let date = calendar.date(byAdding: .day, value: offset * 7, to: selectedDate) {
                select(date)
            }
        } label: {
            Image(systemName: offset < 0 ? "chevron.left" : "chevron.right")
                .font(.caption.weight(.bold))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(appLanguage.text(offset < 0 ? "Previous week" : "Next week"))
        .accessibilityIdentifier(offset < 0 ? "calendar-previous-week" : "calendar-next-week")
    }

    private var weekdayHeaderDates: [Date] {
        let start = calendar.dateInterval(of: .weekOfYear, for: selectedDate)?.start
            ?? calendar.startOfDay(for: selectedDate)
        return (0..<7).compactMap {
            calendar.date(byAdding: .day, value: $0, to: start)
        }
    }

    private var monthColumns: [GridItem] {
        Array(repeating: GridItem(.flexible(minimum: 36), spacing: 4), count: 7)
    }

    private var calendarRowSpacing: CGFloat { 4 }

    private var calendarRowHeight: CGFloat { 44 }

    private var calendarMotion: Animation? {
        reduceMotion ? nil : .easeInOut(duration: 0.24)
    }

    private var monthGridDates: [Date] {
        guard let monthInterval = calendar.dateInterval(of: .month, for: selectedDate),
              let days = calendar.range(of: .day, in: .month, for: selectedDate) else {
            return []
        }
        let firstDay = calendar.startOfDay(for: monthInterval.start)
        let weekday = calendar.component(.weekday, from: firstDay)
        let leadingCount = (weekday - calendar.firstWeekday + 7) % 7
        let occupiedCells = leadingCount + days.count
        let totalCells = ((occupiedCells + 6) / 7) * 7
        return (0..<totalCells).compactMap { index in
            calendar.date(
                byAdding: .day,
                value: index - leadingCount,
                to: firstDay
            )
        }
    }

    private var selectedWeekIndex: Int {
        guard let selectedIndex = monthGridDates.firstIndex(where: isSelected) else {
            return 0
        }
        return selectedIndex / 7
    }

    private var visibleGridDates: [Date] {
        guard !isMonthExpanded else { return monthGridDates }
        let start = selectedWeekIndex * 7
        let end = min(start + 7, monthGridDates.count)
        guard start < end else { return [] }
        return Array(monthGridDates[start..<end])
    }

    private var expandedGridHeight: CGFloat {
        let rowCount = max(1, monthGridDates.count / 7)
        return CGFloat(rowCount) * calendarRowHeight
            + CGFloat(max(0, rowCount - 1)) * calendarRowSpacing
    }

    private var visibleGridHeight: CGFloat {
        isMonthExpanded ? expandedGridHeight : calendarRowHeight
    }

    private var monthTitle: String {
        selectedDate.formatted(
            Date.FormatStyle()
                .month(.wide)
                .year()
                .locale(appLanguage.locale)
        )
    }

    private var calendar: Calendar {
        var value = Calendar.autoupdatingCurrent
        value.locale = appLanguage.locale
        return value
    }

    private var selectedActivities: [RelationshipCalendarActivity] {
        RelationshipCalendarAgenda.activities(
            activities, in: agendaInterval, personID: selectedPersonID
        )
    }

    private func isSelected(_ date: Date) -> Bool {
        Calendar.current.isDate(date, inSameDayAs: selectedDate)
    }

    private func hasActivity(on date: Date) -> Bool {
        !activities(on: date).isEmpty
    }

    private func activities(on date: Date) -> [RelationshipCalendarActivity] {
        RelationshipCalendarAgenda.activities(
            activities,
            in: RelationshipCalendarAgenda.interval(for: date, mode: .day, calendar: calendar),
            personID: selectedPersonID
        )
    }

    private func isInSelectedMonth(_ date: Date) -> Bool {
        calendar.isDate(date, equalTo: selectedDate, toGranularity: .month)
    }

    private func isInSelectedWeek(_ date: Date) -> Bool {
        calendar.isDate(date, equalTo: selectedDate, toGranularity: .weekOfYear)
    }

    private func isDateInteractive(_ date: Date) -> Bool {
        isMonthExpanded ? isInSelectedMonth(date) : isInSelectedWeek(date)
    }

    private func dayOpacity(_ date: Date) -> Double {
        if isInSelectedMonth(date) {
            return 1
        }
        return isMonthExpanded ? 0 : 0.32
    }

    private func select(_ date: Date) {
        updateCalendar {
            selectedDate = calendar.startOfDay(for: date)
        }
    }

    private func moveMonth(by offset: Int) {
        guard let currentMonth = calendar.dateInterval(of: .month, for: selectedDate)?.start,
              let targetMonth = calendar.date(byAdding: .month, value: offset, to: currentMonth),
              let targetDays = calendar.range(of: .day, in: .month, for: targetMonth) else {
            return
        }
        let preferredDay = calendar.component(.day, from: selectedDate)
        let targetDay = min(preferredDay, targetDays.count)
        guard let target = calendar.date(byAdding: .day, value: targetDay - 1, to: targetMonth) else {
            return
        }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            selectedDate = calendar.startOfDay(for: target)
        }
    }

    private func monthNavigationButton(
        symbol: String,
        label: String,
        identifier: String,
        offset: Int
    ) -> some View {
        Button { moveMonth(by: offset) } label: {
            Image(systemName: symbol)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.tsInk)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(identifier)
    }

    private func weekdayText(for date: Date) -> String {
        let value = date.formatted(
            Date.FormatStyle()
                .weekday(.narrow)
                .locale(appLanguage.locale)
        )
        return appLanguage.usesSimplifiedChinese() ? value : value.uppercased()
    }

    private func updateCalendar(_ update: () -> Void) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            update()
        }
    }

    private func dayAccessibilityLabel(_ date: Date) -> String {
        let formatted = date.formatted(
            Date.FormatStyle()
                .weekday(.wide)
                .month(.wide)
                .day()
                .locale(appLanguage.locale)
        )
        let count = activities(on: date).count
        return String(
            format: appLanguage.text("%@, %d activities"),
            locale: appLanguage.locale,
            formatted,
            count
        )
    }

    private func dayIdentifier(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

private enum CalendarSheetDestination: Identifiable {
    case detail(RelationshipCalendarActivity)
    case composer
    case people
    case person(String)

    var id: String {
        switch self {
        case let .detail(activity):
            return "detail-\(activity.id)"
        case .composer:
            return "composer"
        case .people:
            return "people"
        case let .person(personID):
            return "person-\(personID)"
        }
    }
}

private struct RelationshipCalendarActivityRow: View {
    let activity: RelationshipCalendarActivity
    let day: Date
    let hasOverlap: Bool
    let action: () -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: action) {
            Group {
                if dynamicTypeSize >= .xxLarge {
                    VStack(alignment: .leading, spacing: 10) {
                        timeColumn
                        activityCard
                    }
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        timeColumn.frame(width: 76, alignment: .leading)
                        activityCard
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim:
            "\(activity.personDisplayLabel), \(activity.displayTitle(in: appLanguage)), \(timeRange), \(activity.contextDisplayLabel), \(statusText)"
                + (hasOverlap ? ", " + appLanguage.text("Overlaps another Talent Signal activity") : "")
        ))
        .accessibilityHint(appLanguage.text("Opens activity details."))
        .accessibilityIdentifier("calendar-activity-\(activity.id)")
    }

    private var timeColumn: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(timeText(max(activity.startDate, Calendar.current.startOfDay(for: day))))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
            Text(continuesFromEarlier ? appLanguage.text("Continued") : durationText)
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
        }
        .padding(.top, 12)
    }

    private var activityCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 9) {
                RelationshipPersonMark(displayName: activity.personDisplayLabel, size: 34)
                Text(activity.personDisplayLabel)
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.top, 8)
            }
            VStack(alignment: .leading, spacing: 5) {
                Label(activity.displayTitle(in: appLanguage), systemImage: activity.kind.symbolName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.tsInk)
                Text(activity.contextDisplayLabel)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(timeRange + " · " + statusText)
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            if hasOverlap {
                Label(appLanguage.text("Overlaps another Talent Signal activity"), systemImage: "clock.badge.exclamationmark")
                    .font(.caption)
                    .foregroundStyle(Color.tsVermilion)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.tsLine, lineWidth: 1) }
    }

    private var continuesFromEarlier: Bool {
        activity.startDate < Calendar.current.startOfDay(for: day)
    }

    private var statusText: String {
        if activity.source == .preview { return appLanguage.text("Preview activity") }
        switch activity.calendarSyncState {
        case .failed: return appLanguage.text("Calendar sync failed")
        case .unknown: return appLanguage.text("Calendar sync unverified")
        case .pending: return appLanguage.text("Waiting to sync")
        case .syncing: return appLanguage.text("Syncing one way")
        case .disabled, .synced:
            return appLanguage.text(activity.source == .talentSignal ? "Saved in Talent Signal" : "Linked relationship activity")
        }
    }

    private var durationText: String {
        String(format: appLanguage.text("%d min"), locale: appLanguage.locale,
               max(1, Int(activity.endDate.timeIntervalSince(activity.startDate) / 60)))
    }

    private var timeRange: String {
        let calendar = Calendar.current
        if calendar.isDate(activity.startDate, inSameDayAs: activity.endDate) {
            return "\(timeText(activity.startDate))–\(timeText(activity.endDate))"
        }
        let format = Date.FormatStyle().month().day().hour().minute().locale(appLanguage.locale)
        return activity.startDate.formatted(format) + " – " + activity.endDate.formatted(format)
    }

    private func timeText(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute().locale(appLanguage.locale))
    }
}

private struct RelationshipCalendarPersonFilter: View {
    let people: [WorkspacePerson]
    let selectedPersonID: String?
    let onSelect: (String?) -> Void
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List {
                Button { onSelect(nil) } label: {
                    HStack {
                        Label(appLanguage.text("All people"), systemImage: "person.2")
                        Spacer()
                        if selectedPersonID == nil { Image(systemName: "checkmark") }
                    }
                    .frame(minHeight: 44)
                }
                .accessibilityIdentifier("calendar-filter-all")
                ForEach(filteredPeople) { person in
                    Button { onSelect(person.id) } label: {
                        HStack(alignment: .top, spacing: 12) {
                            RelationshipPersonMark(displayName: person.displayLabel, size: 36)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(person.displayLabel).font(.headline)
                                Text(person.contexts.map(\.displayLabel).joined(separator: " · "))
                                    .font(.subheadline)
                                    .foregroundStyle(Color.tsMutedInk)
                                if people.filter({ $0.displayLabel == person.displayLabel }).count > 1 {
                                    Text(String(format: appLanguage.text("Person record · %@"), String(person.id.suffix(8))))
                                        .font(.caption).foregroundStyle(Color.tsMutedInk)
                                }
                            }
                            Spacer(minLength: 0)
                            if selectedPersonID == person.id { Image(systemName: "checkmark") }
                        }
                        .frame(minHeight: 44)
                        .padding(.vertical, 4)
                    }
                    .accessibilityIdentifier("calendar-filter-person-\(person.id)")
                }
                if filteredPeople.isEmpty {
                    Text(appLanguage.text("No matching people"))
                        .foregroundStyle(Color.tsMutedInk)
                }
            }
            .searchable(text: $query, prompt: appLanguage.text("Search people or context"))
            .scrollContentBackground(.hidden)
            .background(Color.tsSurface)
            .navigationTitle(appLanguage.text("Filter by person"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(appLanguage.text("Close")) { dismiss() }
                }
            }
        }
        .tint(.tsInk)
        .presentationDetents([.large])
    }

    private var filteredPeople: [WorkspacePerson] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return people.filter {
            trimmed.isEmpty || $0.displayLabel.localizedCaseInsensitiveContains(trimmed)
                || $0.contexts.contains { $0.displayLabel.localizedCaseInsensitiveContains(trimmed) }
        }.sorted {
            $0.displayLabel == $1.displayLabel ? $0.id < $1.id
                : $0.displayLabel.localizedStandardCompare($1.displayLabel) == .orderedAscending
        }
    }
}

private struct RelationshipCalendarActivityDetail: View {
    let activity: RelationshipCalendarActivity
    let onOpenPerson: (() -> Void)?
    let onRetryCalendarSync: (() -> Void)?
    let onPrepare: () -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    RelationshipPersonMark(
                        displayName: activity.personDisplayLabel,
                        size: 60
                    )
                    Text(activity.personDisplayLabel)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .padding(.top, 18)
                    Label(
                        activity.displayTitle(in: appLanguage),
                        systemImage: activity.kind.symbolName
                    )
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .padding(.top, 8)
                    Text(activity.contextDisplayLabel)
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .padding(.top, 4)

                    if let onOpenPerson {
                        Button(action: onOpenPerson) {
                            Label(appLanguage.text("View person record"), systemImage: "person.crop.rectangle")
                                .font(.subheadline.weight(.semibold))
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 8)
                        .accessibilityIdentifier("calendar-open-person")
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        detailLine(
                            icon: "clock",
                            label: appLanguage.text("When"),
                            value: dateRange
                        )
                        detailLine(
                            icon: "globe",
                            label: appLanguage.text("Event time zone"),
                            value: eventZoneTime
                        )
                        detailLine(
                            icon: "link",
                            label: appLanguage.text("Scope"),
                            value: activity.contextDisplayLabel
                        )
                        detailLine(
                            icon: "checkmark.shield",
                            label: appLanguage.text("Source"),
                            value: sourceText
                        )
                        if activity.source == .talentSignal {
                            detailLine(
                                icon: calendarSyncIcon,
                                label: appLanguage.text("Apple Calendar"),
                                value: calendarSyncText
                            )
                        }
                    }
                    .padding(.top, 28)

                    if let onRetryCalendarSync {
                        Button {
                            onRetryCalendarSync()
                            dismiss()
                        } label: {
                            Label(
                                appLanguage.text("Try Calendar sync again"),
                                systemImage: "arrow.clockwise"
                            )
                            .frame(maxWidth: .infinity, minHeight: 48)
                        }
                        .buttonStyle(TSSecondaryButtonStyle())
                        .padding(.top, 20)
                        .accessibilityIdentifier("calendar-retry-sync")
                    }

                    Button(action: onPrepare) {
                        HStack(spacing: 12) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 18, weight: .medium))
                            Text(
                                appLanguage.text("Prepare with Agent")
                            )
                            Spacer()
                            Image(systemName: "arrow.right")
                                .font(.system(size: 18, weight: .semibold))
                        }
                        .font(.headline)
                        .foregroundStyle(Color.tsSurface)
                        .frame(minHeight: 52)
                        .padding(.horizontal, 16)
                        .background(Color.tsInk, in: RoundedRectangle(cornerRadius: 18))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 30)
                    .accessibilityLabel(
                        String(
                            format: appLanguage.text("Prepare for this %@ with Agent"),
                            locale: appLanguage.locale,
                            activity.kind.title(in: appLanguage).lowercased()
                        )
                    )
                    .accessibilityHint(
                        appLanguage.text(
                            "Returns to the linked Session with an editable draft. Nothing is sent yet."
                        )
                    )
                    .accessibilityIdentifier("calendar-prepare-agent")

                    Label(
                        appLanguage.text(
                            "Opens an editable Session draft · no automatic action"
                        ),
                        systemImage: "lock.shield"
                    )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                }
                .padding(24)
            }
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(appLanguage.text("Activity"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(appLanguage.text("Close")) {
                        dismiss()
                    }
                }
            }
        }
        .tint(.tsInk)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("calendar-activity-detail")
    }

    private var dateRange: String {
        let date = activity.startDate.formatted(
            Date.FormatStyle()
                .weekday(.wide)
                .month(.wide)
                .day()
                .locale(appLanguage.locale)
        )
        let start = timeText(activity.startDate)
        let end = timeText(activity.endDate)
        let endLabel = Calendar.current.isDate(activity.startDate, inSameDayAs: activity.endDate)
            ? end : activity.endDate.formatted(.dateTime.month().day().hour().minute().locale(appLanguage.locale))
        return "\(date) · \(start)–\(endLabel) · \(TimeZone.current.identifier)"
    }

    private var eventZoneTime: String {
        guard let zone = TimeZone(identifier: activity.timeZoneIdentifier) else {
            return activity.timeZoneIdentifier
        }
        let format = Date.FormatStyle(date: .abbreviated, time: .shortened,
                                      locale: appLanguage.locale, timeZone: zone)
        return activity.startDate.formatted(format) + " – " + activity.endDate.formatted(format)
            + " · " + zone.identifier
    }

    private var sourceText: String {
        switch activity.source {
        case .governed:
            return appLanguage.text("Linked relationship activity")
        case .preview:
            return appLanguage.text("Synthetic preview · not in Apple Calendar")
        case .talentSignal:
            return appLanguage.text("Confirmed in Talent Signal")
        }
    }

    private var calendarSyncText: String {
        switch activity.calendarSyncState {
        case .disabled:
            return appLanguage.text("Off · event stays in Talent Signal")
        case .pending:
            return appLanguage.text("Waiting to sync")
        case .syncing:
            return appLanguage.text("Syncing one way")
        case .synced:
            return appLanguage.text("Synced one way")
        case .failed:
            return appLanguage.text("Sync failed · event kept in Talent Signal")
        case .unknown:
            return appLanguage.text("Sync result unknown · check Apple Calendar")
        }
    }

    private var calendarSyncIcon: String {
        switch activity.calendarSyncState {
        case .disabled:
            return "calendar.badge.minus"
        case .pending:
            return "clock"
        case .syncing:
            return "arrow.up.forward.app"
        case .synced:
            return "checkmark.circle"
        case .failed:
            return "exclamationmark.triangle"
        case .unknown:
            return "questionmark.diamond"
        }
    }

    private func detailLine(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(Color.tsMutedInk)
                .frame(width: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(displayLabel(label))
                    .font(.caption2.weight(.bold))
                    .tracking(appLanguage.usesSimplifiedChinese() ? 0 : 0.8)
                    .foregroundStyle(Color.tsMutedInk)
                Text(value)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func displayLabel(_ label: String) -> String {
        appLanguage.usesSimplifiedChinese() ? label : label.uppercased()
    }

    private func timeText(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle()
                .hour()
                .minute()
                .locale(appLanguage.locale)
        )
    }
}

private struct RelationshipPersonMark: View {
    let displayName: String
    let size: CGFloat

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.28, weight: .semibold, design: .rounded))
            .foregroundStyle(Color.tsInk)
            .frame(width: size, height: size)
            .background(Color.tsSurfaceMuted, in: Circle())
            .overlay {
                Circle()
                    .stroke(Color.tsLine, lineWidth: 1)
            }
            .accessibilityHidden(true)
    }

    private var initials: String {
        let words = displayName.split(whereSeparator: { $0.isWhitespace })
        if words.count > 1 {
            return words.prefix(2).compactMap(\.first).map(String.init).joined()
        }
        return displayName.first.map(String.init) ?? "–"
    }
}

private struct RelationshipCalendarScope: Identifiable, Hashable {
    let personID: String
    let relationshipContextID: String
    let personDisplayLabel: String
    let contextDisplayLabel: String

    var id: String { "\(personID):\(relationshipContextID)" }
}

@MainActor
private struct RelationshipCalendarComposer: View {
    let snapshot: PursuitWorkspaceSnapshot
    let syncsToCalendar: Bool
    let isPreview: Bool
    let onConfirmed: (RelationshipCalendarActivity) -> Void
    private let activityID: String

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @State private var selectedScopeID: String
    @State private var selectedKind: RelationshipCalendarActivity.Kind = .interview
    @State private var title = ""
    @State private var titleWasEdited = false
    @State private var startDate: Date
    @State private var durationMinutes = 30

    init(
        snapshot: PursuitWorkspaceSnapshot,
        syncsToCalendar: Bool,
        isPreview: Bool,
        selectedDate: Date,
        preferredPersonID: String?,
        onConfirmed: @escaping (RelationshipCalendarActivity) -> Void
    ) {
        self.snapshot = snapshot
        self.syncsToCalendar = syncsToCalendar
        self.isPreview = isPreview
        self.onConfirmed = onConfirmed
        activityID = "calendar-\(UUID().uuidString.lowercased())"
        let scopes = Self.scopes(in: snapshot)
        _selectedScopeID = State(initialValue:
            scopes.first(where: { $0.personID == preferredPersonID })?.id ?? scopes.first?.id ?? ""
        )
        _startDate = State(initialValue: RelationshipCalendarAgenda.suggestedStart(
            on: selectedDate, calendar: .current
        ))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(appLanguage.text("Relationship")) {
                    if scopes.isEmpty {
                        Text(
                            appLanguage.text("No confirmed relationship is available.")
                        )
                            .foregroundStyle(Color.tsMutedInk)
                    } else {
                        Picker(
                            appLanguage.text("Person and context"),
                            selection: $selectedScopeID
                        ) {
                            ForEach(scopes) { scope in
                                Text(
                                    verbatim: "\(scope.personDisplayLabel) · \(scope.contextDisplayLabel)"
                                )
                                    .tag(scope.id)
                            }
                        }
                        if let selectedScope {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(selectedScope.personDisplayLabel)
                                    .font(.subheadline.weight(.semibold))
                                Text(selectedScope.contextDisplayLabel)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("calendar-selected-scope")
                        }
                    }
                }

                Section(appLanguage.text("Activity")) {
                    Picker(
                        appLanguage.text("Activity type"),
                        selection: $selectedKind
                    ) {
                        ForEach(RelationshipCalendarActivity.Kind.allCases) { kind in
                            Label(
                                kind.title(in: appLanguage),
                                systemImage: kind.symbolName
                            )
                                .tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("calendar-activity-kind")
                    TextField(
                        appLanguage.text("Title"),
                        text: $title,
                        onEditingChanged: { editing in
                            if editing { titleWasEdited = true }
                        }
                    )
                        .accessibilityIdentifier("calendar-activity-title")
                    DatePicker(
                        appLanguage.text("Starts"),
                        selection: $startDate,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    Text(TimeZone.current.identifier)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .accessibilityLabel(appLanguage.text("Event time zone") + ": " + TimeZone.current.identifier)
                    Picker(
                        appLanguage.text("Duration"),
                        selection: $durationMinutes
                    ) {
                        Text(appLanguage.text("30 min")).tag(30)
                        Text(appLanguage.text("45 min")).tag(45)
                        Text(appLanguage.text("60 min")).tag(60)
                    }
                }

                Section {
                    Label(
                        appLanguage.text(
                            isPreview ? "Preview only · nothing is added to Apple Calendar." : syncsToCalendar
                                ? "Confirm to save here and sync to Apple Calendar."
                                : "Confirm to save in Talent Signal. Calendar sync is off."
                        ),
                        systemImage: syncsToCalendar
                            ? "arrow.up.forward.app"
                            : "checkmark.circle"
                    )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.tsSurface)
            .navigationTitle(appLanguage.text("Add activity"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(appLanguage.text("Cancel")) {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(
                        appLanguage.text("Confirm")
                    ) {
                        guard let activity else { return }
                        onConfirmed(activity)
                    }
                    .font(.subheadline.weight(.semibold))
                    .disabled(activity == nil)
                    .accessibilityHint(
                        appLanguage.text(
                            syncsToCalendar
                                ? "Saves in Talent Signal, then syncs one way to Apple Calendar."
                                : "Saves in Talent Signal without changing Apple Calendar."
                        )
                    )
                    .accessibilityIdentifier("calendar-confirm-activity")
                }
            }
        }
        .tint(.tsInk)
        .task { updateDefaultTitleIfNeeded() }
        .onChange(of: selectedScopeID) { _ in
            updateDefaultTitleIfNeeded()
        }
        .onChange(of: selectedKind) { _ in
            updateDefaultTitleIfNeeded()
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("relationship-calendar-composer")
    }

    private var scopes: [RelationshipCalendarScope] {
        Self.scopes(in: snapshot)
    }

    private var selectedScope: RelationshipCalendarScope? {
        scopes.first { $0.id == selectedScopeID }
    }

    private var activity: RelationshipCalendarActivity? {
        guard let selectedScope else { return nil }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return nil }
        return RelationshipCalendarActivity(
            id: activityID,
            kind: selectedKind,
            title: trimmedTitle,
            personID: selectedScope.personID,
            relationshipContextID: selectedScope.relationshipContextID,
            personDisplayLabel: selectedScope.personDisplayLabel,
            contextDisplayLabel: selectedScope.contextDisplayLabel,
            startDate: startDate,
            endDate: startDate.addingTimeInterval(TimeInterval(durationMinutes * 60)),
            timeZoneIdentifier: TimeZone.current.identifier,
            source: isPreview ? .preview : .talentSignal,
            eventIdentifier: nil,
            calendarSyncState: syncsToCalendar && !isPreview ? .pending : .disabled,
            lastCalendarSyncAttempt: nil
        )
    }

    private func updateDefaultTitleIfNeeded() {
        guard !titleWasEdited, let selectedScope else { return }
        title = "\(selectedKind.title(in: appLanguage)) · \(selectedScope.personDisplayLabel)"
    }

    private static func scopes(
        in snapshot: PursuitWorkspaceSnapshot
    ) -> [RelationshipCalendarScope] {
        snapshot.people.flatMap { person in
            person.contexts.map { context in
                RelationshipCalendarScope(
                    personID: person.id,
                    relationshipContextID: context.id,
                    personDisplayLabel: person.displayLabel,
                    contextDisplayLabel: context.displayLabel
                )
            }
        }
    }
}

#Preview("Relationship calendar") {
    let snapshot = PursuitWorkspaceSnapshot.preview
    RelationshipCalendarView(
        snapshot: snapshot,
        isPreview: true,
        initialActivities: RelationshipCalendarProjection.activities(
            snapshot: snapshot,
            isPreview: true
        ),
        onPrepare: { _ in }
    )
}
