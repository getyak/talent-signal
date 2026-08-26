import SwiftUI

struct RelationshipCalendarActivity: Identifiable, Equatable {
    enum Kind: String, Equatable {
        case interview
        case meeting
        case conversation

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

    func displayTitle(in language: AppLanguage) -> String {
        source == .preview ? kind.title(in: language) : title
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
                .font(.caption2.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(Color.tsInk)
            Text(dateDay)
                .font(.title3.weight(.semibold))
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
                    verbatim: "\(nextActivity.displayTitle(in: appLanguage)) · \(nextActivity.contextDisplayLabel)"
                )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 1)
            } else {
                Text(appLanguage.text("No linked moments"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                Text(
                    appLanguage.text("Open to add an activity")
                )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
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
        return date.formatted(
            Date.FormatStyle()
                .day()
                .locale(appLanguage.locale)
        )
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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var activities: [RelationshipCalendarActivity]
    @State private var selectedDate: Date
    @State private var destination: CalendarSheetDestination?

    init(
        snapshot: PursuitWorkspaceSnapshot,
        isPreview: Bool,
        initialActivities: [RelationshipCalendarActivity],
        onPrepare: @escaping (RelationshipCalendarActivity) -> Void
    ) {
        self.snapshot = snapshot
        self.isPreview = isPreview
        self.initialActivities = initialActivities
        self.onPrepare = onPrepare
        _activities = State(initialValue: initialActivities)
        let next = RelationshipCalendarProjection.next(in: initialActivities)
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
                    weekRail
                    agendaHeader
                        .padding(.top, 30)
                    agenda
                        .padding(.top, 8)
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(appLanguage.text("Relationship calendar"))
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
        .accessibilityIdentifier("relationship-calendar")
    }

    private var weekRail: some View {
        HStack(spacing: 5) {
            ForEach(weekDates, id: \.self) { date in
                Button {
                    selectedDate = Calendar.current.startOfDay(for: date)
                } label: {
                    VStack(spacing: 5) {
                        Text(
                            date.formatted(
                                Date.FormatStyle()
                                    .weekday(.narrow)
                                    .locale(appLanguage.locale)
                            ).uppercased()
                        )
                            .font(.caption2.weight(.bold))
                        Text(
                            date.formatted(
                                Date.FormatStyle()
                                    .day()
                                    .locale(appLanguage.locale)
                            )
                        )
                            .font(.subheadline.weight(.semibold))
                        Circle()
                            .fill(hasActivity(on: date) ? Color.tsVermilion : .clear)
                            .frame(width: 4, height: 4)
                    }
                    .foregroundStyle(
                        isSelected(date) ? Color.tsSurface : Color.tsInk
                    )
                    .frame(maxWidth: .infinity, minHeight: 62)
                    .background(
                        isSelected(date) ? Color.tsInk : Color.clear,
                        in: RoundedRectangle(cornerRadius: 16)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(dayAccessibilityLabel(date))
                .accessibilityAddTraits(isSelected(date) ? .isSelected : [])
                .accessibilityIdentifier("calendar-day-\(dayIdentifier(date))")
            }
        }
        .padding(6)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 20))
    }

    private var agendaHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(
                selectedDate.formatted(
                    Date.FormatStyle()
                        .weekday(.wide)
                        .month(.wide)
                        .day()
                        .locale(appLanguage.locale)
                ).uppercased()
            )
                .font(.caption2.weight(.bold))
                .tracking(1.1)
                .foregroundStyle(Color.tsInk)
            HStack(alignment: .firstTextBaseline) {
                Text(appLanguage.text("Relationship moments"))
                    .font(.custom("Georgia", size: 28, relativeTo: .title2))
                    .foregroundStyle(Color.tsInk)
                Spacer(minLength: 10)
                Text(verbatim: "\(selectedActivities.count)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.tsMutedInk)
            }
            if isPreview {
                Text(
                    appLanguage.text("Preview only · no Calendar data was read")
                )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .accessibilityIdentifier("calendar-preview-boundary")
            }
        }
    }

    @ViewBuilder
    private var agenda: some View {
        if selectedActivities.isEmpty {
            Button {
                destination = .composer
            } label: {
                VStack(alignment: .leading, spacing: 9) {
                    Image(systemName: "plus.circle")
                        .font(.title3)
                    Text(
                        appLanguage.text("No linked activity")
                    )
                        .font(.headline)
                    Text(
                        appLanguage.text(
                            "Add one exact moment, then approve it in Apple Calendar."
                        )
                    )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(Color.tsInk)
                .padding(.vertical, 22)
                .frame(maxWidth: .infinity, minHeight: 132, alignment: .leading)
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

    private var weekDates: [Date] {
        let calendar = Calendar.current
        let anchor = calendar.startOfDay(for: selectedDate)
        return (-2...4).compactMap {
            calendar.date(byAdding: .day, value: $0, to: anchor)
        }
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
                        activityCopy
                        openMark
                    }
                } else {
                    HStack(alignment: .top, spacing: 16) {
                        timeColumn
                        Rectangle()
                            .fill(Color.tsLine)
                            .frame(width: 1, height: 66)
                            .accessibilityHidden(true)
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
            Text(durationText)
                .font(.caption2)
                .foregroundStyle(Color.tsMutedInk)
        }
        .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : 52, alignment: .leading)
    }

    private var activityCopy: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(
                activity.displayTitle(in: appLanguage),
                systemImage: activity.kind.symbolName
            )
                .font(.headline)
                .foregroundStyle(Color.tsInk)
            Text(activity.personDisplayLabel)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Text(activity.contextDisplayLabel)
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)
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
                    Image(systemName: activity.kind.symbolName)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Color.tsVermilion)
                        .frame(width: 48, height: 48)
                        .background(Color.tsSurfaceMuted, in: Circle())
                        .accessibilityHidden(true)
                    Text(activity.displayTitle(in: appLanguage))
                        .font(.custom("Georgia", size: 34, relativeTo: .largeTitle))
                        .foregroundStyle(Color.tsInk)
                        .padding(.top, 18)
                    Text(activity.personDisplayLabel)
                        .font(.title3.weight(.semibold))
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
            return appLanguage.text("Saved through Apple Calendar in this visit")
        }
    }

    private func detailLine(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Color.tsMutedInk)
                .frame(width: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(label.uppercased())
                    .font(.caption2.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(Color.tsMutedInk)
                Text(value)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
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
    @State private var title = ""
    @State private var titleWasEdited = false
    @State private var startDate: Date
    @State private var durationMinutes = 30
    @State private var editorProposal: DeviceCalendarProposal?
    @State private var calendarWasUnchanged = false

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
                    }
                    .font(.subheadline.weight(.semibold))
                    .disabled(proposal == nil)
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
        .sheet(item: $editorProposal) { proposal in
            DeviceCalendarEditorSheet(proposal: proposal) { completion in
                switch completion {
                case let .saved(eventIdentifier):
                    guard let scope = selectedScope else { return }
                    onSaved(
                        RelationshipCalendarActivity(
                            id: "calendar-\(proposal.sourceID)",
                            kind: .meeting,
                            title: proposal.title,
                            personID: scope.personID,
                            relationshipContextID: scope.relationshipContextID,
                            personDisplayLabel: scope.personDisplayLabel,
                            contextDisplayLabel: scope.contextDisplayLabel,
                            startDate: proposal.startDate,
                            endDate: proposal.endDate,
                            timeZoneIdentifier: proposal.timeZoneIdentifier,
                            source: .appleCalendar,
                            eventIdentifier: eventIdentifier
                        )
                    )
                case .cancelled:
                    calendarWasUnchanged = true
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
        title = "\(appLanguage.text("Meeting")) · \(selectedScope.personDisplayLabel)"
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
