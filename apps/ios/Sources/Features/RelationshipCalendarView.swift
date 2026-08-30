import CryptoKit
import EventKit
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
        case appleCalendar
    }

    enum DestinationVerification: Equatable {
        case notRequired
        case verified
        case unavailable
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
    let eventIdentifier: String?
    var destinationVerification: DestinationVerification = .notRequired

    func displayTitle(in language: AppLanguage) -> String {
        source == .preview ? kind.title(in: language) : title
    }
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
    let eventIdentifier: String
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
                source: .appleCalendar,
                eventIdentifier: stored.eventIdentifier,
                destinationVerification: .verified
            )
        }
        .sorted { $0.startDate < $1.startDate }
    }

    func save(_ activity: RelationshipCalendarActivity) throws {
        guard activity.source == .appleCalendar,
              let eventIdentifier = activity.eventIdentifier,
              !eventIdentifier.isEmpty else {
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
            eventIdentifier: eventIdentifier,
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

enum DeviceCalendarEventObservation: Equatable {
    case verified(DeviceCalendarSavedEvent)
    case missing
    case unavailable
}

@MainActor
protocol DeviceCalendarEventObserving: AnyObject {
    func observe(eventIdentifier: String) -> DeviceCalendarEventObservation
}

@MainActor
final class EventKitDeviceCalendarEventObserver: DeviceCalendarEventObserving {
    private let eventStore: EKEventStore

    init(eventStore: EKEventStore = EKEventStore()) {
        self.eventStore = eventStore
    }

    func observe(eventIdentifier: String) -> DeviceCalendarEventObservation {
        if let event = eventStore.event(withIdentifier: eventIdentifier) {
            return .verified(
                DeviceCalendarSavedEvent(
                    identifier: eventIdentifier,
                    title: event.title,
                    startDate: event.startDate,
                    endDate: event.endDate,
                    timeZoneIdentifier: event.timeZone?.identifier
                        ?? TimeZone.current.identifier
                )
            )
        }
        return Self.canObserveAbsence ? .missing : .unavailable
    }

    private static var canObserveAbsence: Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            return status == .fullAccess || status == .authorized
        }
        return status == .authorized
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
                bySettingHour: 10,
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
                timeZoneIdentifier: TimeZone.current.identifier,
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
                    timeZoneIdentifier: TimeZone.current.identifier,
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

struct TodayRelationshipCalendarPeek: View {
    let activities: [RelationshipCalendarActivity]
    let onOpen: () -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: onOpen) {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) {
                        dateMark
                        momentCopy
                        openMark
                    }
                } else {
                    HStack(spacing: 13) {
                        dateMark
                        momentCopy
                        Spacer(minLength: 8)
                        openMark
                    }
                }
            }
            .padding(.vertical, 13)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Color.tsInk.opacity(0.08))
                    .frame(height: 1)
                    .padding(.horizontal, 14)
            }
            .contentShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(
            appLanguage.text("Opens the relationship calendar.")
        )
        .accessibilityIdentifier("today-calendar-peek")
    }

    private var nextActivity: RelationshipCalendarActivity? {
        RelationshipCalendarProjection.next(in: activities)
    }

    private var dateMark: some View {
        VStack(spacing: 1) {
            Text(dateWeekday)
                .font(.system(size: 10, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(Color.tsInk)
            Text(dateDay)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Color.tsInk)
        }
        .frame(width: 42, height: 42)
        .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityHidden(true)
    }

    private var momentCopy: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(appLanguage.text("Calendar"))
                .font(.caption.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(Color.tsMutedInk)
            if let nextActivity {
                Text(
                    verbatim: "\(timeText(nextActivity.startDate)) · \(nextActivity.personDisplayLabel)"
                )
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                Text(
                    verbatim: "\(nextActivity.displayTitle(in: appLanguage)) · \(appLanguage.workspaceTerm(nextActivity.contextDisplayLabel))"
                )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 1)
            } else {
                Text(appLanguage.text("No activity"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var openMark: some View {
        HStack(spacing: 6) {
            if activities.count > 1 {
                Text(verbatim: "\(activities.count)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.tsMutedInk)
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.tsMutedInk)
        }
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityHidden(true)
    }

    private var dateWeekday: String {
        let date = nextActivity?.startDate ?? Date()
        return date.formatted(
            Date.FormatStyle()
                .weekday(.narrow)
                .locale(appLanguage.locale)
        ).uppercased()
    }

    private var dateDay: String {
        let date = nextActivity?.startDate ?? Date()
        // The tile already communicates month/day through the button's full
        // accessibility label. Keep the decorative mark numeric so locales
        // that append a day suffix do not clip inside its fixed square.
        return String(Calendar(identifier: .gregorian).component(.day, from: date))
    }

    private var accessibilityLabel: String {
        guard let nextActivity else {
            return appLanguage.text("Calendar. No linked moments.")
        }
        return String(
            format: appLanguage.text("Calendar. Next: %@, %@, %@."),
            locale: appLanguage.locale,
            nextActivity.personDisplayLabel,
            nextActivity.displayTitle(in: appLanguage),
            dateTimeText(nextActivity.startDate)
        )
    }

    private func timeText(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle()
                .hour()
                .minute()
                .locale(appLanguage.locale)
        )
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

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var activities: [RelationshipCalendarActivity]
    @State private var selectedDate: Date
    @State private var isMonthExpanded = false
    @State private var destination: CalendarSheetDestination?
    @State private var calendarNotice: String?

    private let activityStore: (any RelationshipCalendarActivityPersisting)?
    private let eventObserver: any DeviceCalendarEventObserving

    init(
        snapshot: PursuitWorkspaceSnapshot,
        isPreview: Bool,
        initialActivities: [RelationshipCalendarActivity],
        activityStore: (any RelationshipCalendarActivityPersisting)? = nil,
        eventObserver: (any DeviceCalendarEventObserving)? = nil,
        onPrepare: @escaping (RelationshipCalendarActivity) -> Void
    ) {
        self.snapshot = snapshot
        self.isPreview = isPreview
        self.onPrepare = onPrepare
        let resolvedStore = activityStore ?? (isPreview
            ? nil
            : FileRelationshipCalendarActivityStore(
                accountID: snapshot.workspaceID
            ))
        self.activityStore = resolvedStore
        self.eventObserver = eventObserver
            ?? EventKitDeviceCalendarEventObserver()
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
                    agendaHeader
                        .padding(.top, 28)
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
                    onPrepare: {
                        self.destination = nil
                        onPrepare(activity)
                        dismiss()
                    }
                )
            case .composer:
                RelationshipCalendarComposer(snapshot: snapshot) { activity in
                    do {
                        try activityStore?.save(activity)
                    } catch {
                        calendarNotice = appLanguage.text(
                            "The event is verified in Apple Calendar, but its Talent Signal link could not be saved on this device."
                        )
                    }
                    activities.append(activity)
                    activities.sort { $0.startDate < $1.startDate }
                    selectedDate = Calendar.current.startOfDay(
                        for: activity.startDate
                    )
                    self.destination = nil
                    Task { @MainActor in
                        await Task.yield()
                        self.destination = .detail(activity)
                    }
                }
            }
        }
        .task { reconcileSavedActivities() }
        .accessibilityIdentifier("relationship-calendar")
    }

    private func reconcileSavedActivities() {
        var next = activities
        var removedActivityIDs: [String] = []
        var couldNotVerify = false
        for index in next.indices where next[index].source == .appleCalendar {
            guard let eventIdentifier = next[index].eventIdentifier else {
                next[index].destinationVerification = .unavailable
                couldNotVerify = true
                continue
            }
            switch eventObserver.observe(eventIdentifier: eventIdentifier) {
            case let .verified(event):
                next[index] = RelationshipCalendarActivity(
                    id: next[index].id,
                    kind: next[index].kind,
                    title: event.title,
                    personID: next[index].personID,
                    relationshipContextID: next[index].relationshipContextID,
                    personDisplayLabel: next[index].personDisplayLabel,
                    contextDisplayLabel: next[index].contextDisplayLabel,
                    startDate: event.startDate,
                    endDate: event.endDate,
                    timeZoneIdentifier: event.timeZoneIdentifier,
                    source: .appleCalendar,
                    eventIdentifier: event.identifier,
                    destinationVerification: .verified
                )
                try? activityStore?.save(next[index])
            case .missing:
                removedActivityIDs.append(next[index].id)
            case .unavailable:
                next[index].destinationVerification = .unavailable
                couldNotVerify = true
            }
        }
        if !removedActivityIDs.isEmpty {
            next.removeAll { removedActivityIDs.contains($0.id) }
            for activityID in removedActivityIDs {
                try? activityStore?.remove(activityID: activityID)
            }
            calendarNotice = appLanguage.text(
                "A previously linked event is no longer in Apple Calendar and was removed from this view."
            )
        } else if couldNotVerify {
            calendarNotice = appLanguage.text(
                "Saved events are shown from this device, but Apple Calendar could not be rechecked."
            )
        }
        next.sort { $0.startDate < $1.startDate }
        activities = next
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

                if isMonthExpanded {
                    HStack(spacing: 4) {
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

    private var agendaHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(
                    selectedDate.formatted(
                        Date.FormatStyle()
                            .weekday(.wide)
                            .month(.wide)
                            .day()
                            .locale(appLanguage.locale)
                    )
                )
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                Spacer(minLength: 10)
                Text(verbatim: "\(selectedActivities.count)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.tsMutedInk)
            }
            if isPreview {
                Text(
                    appLanguage.text("Preview · Calendar not read")
                )
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

    @ViewBuilder
    private var agenda: some View {
        if selectedActivities.isEmpty {
            Button {
                destination = .composer
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "calendar.badge.plus")
                        .font(.body.weight(.semibold))
                    Text(appLanguage.text("Add activity"))
                        .font(.headline)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.tsMutedInk)
                }
                .foregroundStyle(Color.tsInk)
                .padding(.vertical, 16)
                .padding(.horizontal, 2)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("calendar-empty-add-activity")
        } else {
            VStack(spacing: 0) {
                ForEach(selectedActivities) { activity in
                    RelationshipCalendarActivityRow(activity: activity) {
                        destination = .detail(activity)
                    }
                }
            }
        }
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
        activities.filter {
            Calendar.current.isDate($0.startDate, inSameDayAs: selectedDate)
        }
    }

    private func isSelected(_ date: Date) -> Bool {
        Calendar.current.isDate(date, inSameDayAs: selectedDate)
    }

    private func hasActivity(on date: Date) -> Bool {
        activities.contains {
            Calendar.current.isDate($0.startDate, inSameDayAs: date)
        }
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
        let count = activities.filter {
            Calendar.current.isDate($0.startDate, inSameDayAs: date)
        }.count
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

    var id: String {
        switch self {
        case let .detail(activity):
            return "detail-\(activity.id)"
        case .composer:
            return "composer"
        }
    }
}

private struct RelationshipCalendarActivityRow: View {
    let activity: RelationshipCalendarActivity
    let action: () -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: action) {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 12) {
                        timeColumn
                        HStack(alignment: .top, spacing: 12) {
                            RelationshipPersonMark(
                                displayName: activity.personDisplayLabel,
                                size: 46
                            )
                            activityCopy
                        }
                        openMark
                    }
                } else {
                    HStack(alignment: .top, spacing: 16) {
                        timeColumn
                        RelationshipPersonMark(
                            displayName: activity.personDisplayLabel,
                            size: 46
                        )
                        activityCopy
                        Spacer(minLength: 8)
                        openMark
                    }
                }
            }
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
        .accessibilityLabel(
            Text(
                verbatim: "\(activity.displayTitle(in: appLanguage)), \(activity.personDisplayLabel), \(timeRange)"
            )
        )
        .accessibilityHint(appLanguage.text("Opens activity details."))
        .accessibilityIdentifier("calendar-activity-\(activity.id)")
    }

    private var timeColumn: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(timeText(activity.startDate))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.tsInk)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Text(durationText)
                .font(.caption2)
                .foregroundStyle(Color.tsMutedInk)
        }
        .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : 68, alignment: .leading)
    }

    private var activityCopy: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(activity.personDisplayLabel)
                .font(.headline)
                .foregroundStyle(Color.tsInk)
            Label(
                activity.displayTitle(in: appLanguage),
                systemImage: activity.kind.symbolName
            )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
            Text(activity.contextDisplayLabel)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var openMark: some View {
        Image(systemName: "chevron.right")
            .font(.caption.weight(.bold))
            .foregroundStyle(Color.tsMutedInk)
            .frame(width: 24, height: 44)
            .accessibilityHidden(true)
    }

    private var durationText: String {
        let minutes = max(1, Int(activity.endDate.timeIntervalSince(activity.startDate) / 60))
        return String(
            format: appLanguage.text("%d min"),
            locale: appLanguage.locale,
            minutes
        )
    }

    private var timeRange: String {
        "\(timeText(activity.startDate))–\(timeText(activity.endDate))"
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

private struct RelationshipCalendarActivityDetail: View {
    let activity: RelationshipCalendarActivity
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
                        .font(.largeTitle.weight(.semibold))
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

                    VStack(alignment: .leading, spacing: 12) {
                        detailLine(
                            icon: "clock",
                            label: appLanguage.text("When"),
                            value: dateRange
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
                    }
                    .padding(.top, 28)

                    Button(action: onPrepare) {
                        HStack(spacing: 12) {
                            Image(systemName: "sparkles")
                            Text(
                                appLanguage.text("Prepare with Agent")
                            )
                            Spacer()
                            Image(systemName: "arrow.right")
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
        return "\(date) · \(start)–\(end)"
    }

    private var sourceText: String {
        switch activity.source {
        case .governed:
            return appLanguage.text("Linked relationship activity")
        case .preview:
            return appLanguage.text("Synthetic preview · not in Apple Calendar")
        case .appleCalendar:
            return activity.destinationVerification == .verified
                ? appLanguage.text("Verified in Apple Calendar")
                : appLanguage.text("Saved on this device · Apple Calendar not rechecked")
        }
    }

    private func detailLine(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
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
    let onSaved: (RelationshipCalendarActivity) -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @State private var selectedScopeID: String
    @State private var selectedKind: RelationshipCalendarActivity.Kind = .interview
    @State private var title = ""
    @State private var titleWasEdited = false
    @State private var startDate: Date
    @State private var durationMinutes = 30
    @State private var editorProposal: DeviceCalendarProposal?
    @State private var calendarWasUnchanged = false
    @State private var calendarSaveNeedsVerification = false

    init(
        snapshot: PursuitWorkspaceSnapshot,
        onSaved: @escaping (RelationshipCalendarActivity) -> Void
    ) {
        self.snapshot = snapshot
        self.onSaved = onSaved
        let scopes = Self.scopes(in: snapshot)
        _selectedScopeID = State(initialValue: scopes.first?.id ?? "")
        let now = Date().addingTimeInterval(60 * 60)
        let calendar = Calendar.current
        let rounded = calendar.date(
            bySetting: .minute,
            value: 0,
            of: now
        ) ?? now
        _startDate = State(initialValue: rounded)
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
                            "Apple Calendar shows the final title and time before saving. Talent Signal does not read the rest of your calendar."
                        ),
                        systemImage: "lock.shield"
                    )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    if calendarWasUnchanged {
                        Label(
                            appLanguage.text("Calendar unchanged"),
                            systemImage: "xmark.circle"
                        )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)
                            .accessibilityIdentifier("calendar-composer-unchanged")
                    }
                    if calendarSaveNeedsVerification {
                        Label(
                            appLanguage.text(
                                "Apple Calendar returned from Save, but Talent Signal could not read the exact event back. Check Apple Calendar before trying again."
                            ),
                            systemImage: "exclamationmark.shield"
                        )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsWarning)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier(
                                "calendar-composer-needs-verification"
                            )
                    }
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
                        appLanguage.text("Review in Calendar")
                    ) {
                        editorProposal = proposal
                        calendarWasUnchanged = false
                        calendarSaveNeedsVerification = false
                    }
                    .font(.subheadline.weight(.semibold))
                    .disabled(proposal == nil || calendarSaveNeedsVerification)
                    .accessibilityHint(
                        appLanguage.text(
                            "Opens Apple's final event editor. Nothing is saved yet."
                        )
                    )
                    .accessibilityIdentifier("calendar-review-in-apple")
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
        .sheet(item: $editorProposal) { proposal in
            DeviceCalendarEditorSheet(proposal: proposal) { completion in
                switch completion {
                case let .saved(event):
                    guard let scope = selectedScope else { return }
                    onSaved(
                        RelationshipCalendarActivity(
                            id: "calendar-\(proposal.sourceID)",
                            kind: selectedKind,
                            title: event.title,
                            personID: scope.personID,
                            relationshipContextID: scope.relationshipContextID,
                            personDisplayLabel: scope.personDisplayLabel,
                            contextDisplayLabel: scope.contextDisplayLabel,
                            startDate: event.startDate,
                            endDate: event.endDate,
                            timeZoneIdentifier: event.timeZoneIdentifier,
                            source: .appleCalendar,
                            eventIdentifier: event.identifier,
                            destinationVerification: .verified
                        )
                    )
                case .cancelled:
                    calendarWasUnchanged = true
                case .verificationNeeded:
                    calendarSaveNeedsVerification = true
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(editorProposal != nil)
        .accessibilityIdentifier("relationship-calendar-composer")
    }

    private var scopes: [RelationshipCalendarScope] {
        Self.scopes(in: snapshot)
    }

    private var selectedScope: RelationshipCalendarScope? {
        scopes.first { $0.id == selectedScopeID }
    }

    private var proposal: DeviceCalendarProposal? {
        guard let selectedScope else { return nil }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return nil }
        return DeviceCalendarProposal(
            sourceID: UUID().uuidString.lowercased(),
            personDisplayName: selectedScope.personDisplayLabel,
            title: trimmedTitle,
            startDate: startDate,
            endDate: startDate.addingTimeInterval(TimeInterval(durationMinutes * 60)),
            timeZoneIdentifier: TimeZone.current.identifier,
            evidenceQuote: appLanguage.text(
                "User-authored relationship calendar activity"
            ),
            detectedDateText: startDate.ISO8601Format(),
            durationWasExplicit: true
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
