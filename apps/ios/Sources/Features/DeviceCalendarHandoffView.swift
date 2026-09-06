import EventKit
import SwiftUI

struct DeviceCalendarWriteReceipt: Codable, Equatable {
    let sourceID: String
    let eventIdentifier: String?
    let savedAt: Date
}

struct DeviceCalendarReceiptStore {
    private let defaults: UserDefaults
    private let key = "talent-signal.calendar-handoff-receipts.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func receipt(for sourceID: String) -> DeviceCalendarWriteReceipt? {
        guard let data = defaults.data(forKey: key),
              let receipts = try? JSONDecoder().decode(
                [String: DeviceCalendarWriteReceipt].self,
                from: data
              ) else {
            return nil
        }
        return receipts[sourceID]
    }

    func recordSaved(
        sourceID: String,
        eventIdentifier: String?,
        savedAt: Date = Date()
    ) {
        var receipts: [String: DeviceCalendarWriteReceipt] = [:]
        if let data = defaults.data(forKey: key),
           let decoded = try? JSONDecoder().decode(
            [String: DeviceCalendarWriteReceipt].self,
            from: data
           ) {
            receipts = decoded
        }
        receipts[sourceID] = DeviceCalendarWriteReceipt(
            sourceID: sourceID,
            eventIdentifier: eventIdentifier,
            savedAt: savedAt
        )
        guard let encoded = try? JSONEncoder().encode(receipts) else { return }
        defaults.set(encoded, forKey: key)
    }
}

private enum DeviceCalendarHandoffResult: Equatable {
    case notStarted
    case dismissed
    case syncing
    case failed(String)
    case unknown(String)
    case savedInApp
    case saved(DeviceCalendarWriteReceipt)
}

enum DeviceCalendarSyncFailure: Error, Equatable {
    case permissionDenied
    case noDefaultCalendar
    case eventNotFound
    case unsupportedOS
    case saveFailed(String)
}

@MainActor
protocol DeviceCalendarSyncing: AnyObject {
    func createEvent(from proposal: DeviceCalendarProposal) async
        -> Result<DeviceCalendarSavedEvent, DeviceCalendarSyncFailure>
    func updateEvent(
        eventIdentifier: String,
        from proposal: DeviceCalendarProposal
    ) async -> Result<DeviceCalendarSavedEvent, DeviceCalendarSyncFailure>
}

@MainActor
final class EventKitDeviceCalendarSyncService: DeviceCalendarSyncing {
    private let eventStore: EKEventStore

    init(eventStore: EKEventStore = EKEventStore()) {
        self.eventStore = eventStore
    }

    func createEvent(
        from proposal: DeviceCalendarProposal
    ) async -> Result<DeviceCalendarSavedEvent, DeviceCalendarSyncFailure> {
        guard #available(iOS 17.0, *) else {
            return .failure(.unsupportedOS)
        }
        do {
            guard try await ensureWriteAccess() else {
                return .failure(.permissionDenied)
            }
            guard let destination = eventStore.defaultCalendarForNewEvents else {
                return .failure(.noDefaultCalendar)
            }

            let event = EKEvent(eventStore: eventStore)
            event.calendar = destination
            event.title = proposal.title
            event.startDate = proposal.startDate
            event.endDate = proposal.endDate
            event.timeZone = TimeZone(identifier: proposal.timeZoneIdentifier)
            try eventStore.save(event, span: .thisEvent, commit: true)

            return .success(
                DeviceCalendarSavedEvent(
                    identifier: event.eventIdentifier ?? "",
                    title: proposal.title,
                    startDate: proposal.startDate,
                    endDate: proposal.endDate,
                    timeZoneIdentifier: proposal.timeZoneIdentifier
                )
            )
        } catch {
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    func updateEvent(
        eventIdentifier: String,
        from proposal: DeviceCalendarProposal
    ) async -> Result<DeviceCalendarSavedEvent, DeviceCalendarSyncFailure> {
        guard #available(iOS 17.0, *) else {
            return .failure(.unsupportedOS)
        }
        do {
            guard try await ensureFullAccess() else {
                return .failure(.permissionDenied)
            }
            guard !eventIdentifier.isEmpty,
                  let event = eventStore.event(withIdentifier: eventIdentifier) else {
                return .failure(.eventNotFound)
            }

            event.title = proposal.title
            event.startDate = proposal.startDate
            event.endDate = proposal.endDate
            event.timeZone = TimeZone(identifier: proposal.timeZoneIdentifier)
            try eventStore.save(event, span: .thisEvent, commit: true)

            let savedIdentifier = event.eventIdentifier ?? eventIdentifier
            guard let readback = eventStore.event(withIdentifier: savedIdentifier),
                  readback.title == proposal.title,
                  readback.startDate == proposal.startDate,
                  readback.endDate == proposal.endDate,
                  readback.timeZone?.identifier == proposal.timeZoneIdentifier else {
                return .failure(
                    .saveFailed("Apple Calendar did not return the updated event.")
                )
            }

            return .success(
                DeviceCalendarSavedEvent(
                    identifier: savedIdentifier,
                    title: readback.title,
                    startDate: readback.startDate,
                    endDate: readback.endDate,
                    timeZoneIdentifier: readback.timeZone?.identifier
                        ?? proposal.timeZoneIdentifier
                )
            )
        } catch {
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    private func ensureWriteAccess() async throws -> Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            switch status {
            case .writeOnly, .fullAccess, .authorized:
                return true
            case .notDetermined:
                return try await eventStore.requestWriteOnlyAccessToEvents()
            case .denied, .restricted:
                return false
            @unknown default:
                return false
            }
        }

        return false
    }

    @available(iOS 17.0, *)
    private func ensureFullAccess() async throws -> Bool {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess, .authorized:
            return true
        case .notDetermined, .writeOnly:
            return try await eventStore.requestFullAccessToEvents()
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }
}

struct DeviceCalendarHandoffView: View {
    let proposal: DeviceCalendarProposal

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AppStorage(CalendarSyncPreference.isEnabledKey)
    private var isCalendarSyncEnabled = true
    @State private var showsEvidence = false
    @State private var result: DeviceCalendarHandoffResult

    private let receiptStore: DeviceCalendarReceiptStore
    private let calendarSync: any DeviceCalendarSyncing
    private let activityStore: (any RelationshipCalendarActivityPersisting)?
    private let canonicalActivity: RelationshipCalendarActivity?

    init(
        proposal: DeviceCalendarProposal,
        receiptStore: DeviceCalendarReceiptStore = DeviceCalendarReceiptStore(),
        calendarSync: (any DeviceCalendarSyncing)? = nil,
        activityStore: (any RelationshipCalendarActivityPersisting)? = nil,
        canonicalActivity: RelationshipCalendarActivity? = nil
    ) {
        self.proposal = proposal
        self.receiptStore = receiptStore
        self.calendarSync = calendarSync ?? EventKitDeviceCalendarSyncService()
        self.activityStore = activityStore
        self.canonicalActivity = canonicalActivity
        if let receipt = receiptStore.receipt(for: proposal.sourceID) {
            _result = State(initialValue: .saved(receipt))
        } else {
            _result = State(initialValue: .notStarted)
        }
    }

    var body: some View {
        Group {
            switch result {
            case .dismissed:
                dismissedContent
            case let .saved(receipt):
                savedContent(receipt)
            case .syncing:
                syncingContent
            case let .failed(message):
                failedContent(message)
            case let .unknown(message):
                unknownContent(message)
            case .savedInApp:
                savedInAppContent
            case .notStarted:
                proposalContent
            }
        }
        .tsCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("device-calendar-handoff")
    }

    private var proposalContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: "calendar.badge.plus")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.tsVermilion)
                    .frame(width: 36, height: 36)
                    .background(Color.tsSurfaceMuted, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: appLanguage.text("Agent proposal"))
                    Text(proposal.title)
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                }
                Spacer(minLength: 0)
            }

            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(dateText)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                Text(verbatim: "· \(durationText)")
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .accessibilityElement(children: .combine)

            HStack(spacing: 8) {
                Label(
                    appLanguage.text("Only title and time"),
                    systemImage: "lock.shield"
                )
                Spacer(minLength: 0)
                Button(
                    appLanguage.text(showsEvidence ? "Hide source" : "View source")
                ) {
                    showsEvidence.toggle()
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.tsVermilion)
                .accessibilityIdentifier("toggle-calendar-evidence")
            }
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)

            if showsEvidence {
                Text(verbatim: "“\(proposal.evidenceQuote)”")
                    .font(.subheadline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        Color.tsEvidence,
                        in: RoundedRectangle(cornerRadius: 12)
                    )
                    .accessibilityIdentifier("calendar-proposal-evidence")
            }

            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: 10) { proposalActions }
                } else {
                    HStack(spacing: 10) { proposalActions }
                }
            }
        }
    }

    @ViewBuilder
    private var proposalActions: some View {
        Button {
            sync()
        } label: {
            Text(appLanguage.text("Confirm"))
        }
        .buttonStyle(TSPrimaryButtonStyle())
        .accessibilityLabel(appLanguage.text("Confirm calendar event"))
        .accessibilityHint(
            appLanguage.text("Saves this event and syncs it to Apple Calendar.")
        )
        .accessibilityIdentifier("add-calendar-proposal")

        Button(role: .destructive) {
            result = .dismissed
        } label: {
            Text(appLanguage.text("Dismiss"))
        }
        .buttonStyle(TSSecondaryButtonStyle())
        .accessibilityLabel(appLanguage.text("Dismiss proposal"))
        .accessibilityIdentifier("dismiss-calendar-proposal")
    }

    private var dismissedContent: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "calendar.badge.minus")
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(appLanguage.text("Calendar proposal dismissed"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                Text(dateText)
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            Spacer(minLength: 0)
            Button(appLanguage.text("Restore")) {
                result = .notStarted
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.tsVermilion)
            .accessibilityIdentifier("restore-calendar-proposal")
        }
    }

    private var syncingContent: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text(appLanguage.text("Syncing to Calendar…"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsInk)
        }
        .accessibilityIdentifier("calendar-syncing")
    }

    private var savedInAppContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                appLanguage.text("Saved in Talent Signal"),
                systemImage: "checkmark.circle.fill"
            )
                .font(.headline)
                .foregroundStyle(Color.tsConfirmed)
            Text(
                appLanguage.text(
                    "Calendar sync is off. You can change this in Settings."
                )
            )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
        }
        .accessibilityIdentifier("calendar-saved-in-app")
    }

    private func failedContent(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                appLanguage.text("Saved in Talent Signal · Calendar sync failed"),
                systemImage: "exclamationmark.shield"
            )
                .font(.headline)
                .foregroundStyle(Color.tsWarning)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            Button(appLanguage.text("Try Calendar sync again")) {
                sync()
            }
            .buttonStyle(TSSecondaryButtonStyle())
        }
        .accessibilityIdentifier("calendar-sync-failed")
    }

    private func unknownContent(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                appLanguage.text("Calendar sync result unknown"),
                systemImage: "questionmark.diamond"
            )
                .font(.headline)
                .foregroundStyle(Color.tsWarning)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("calendar-sync-unknown")
    }

    private func savedContent(
        _ receipt: DeviceCalendarWriteReceipt
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(
                appLanguage.text("Saved to Calendar"),
                systemImage: "checkmark.seal.fill"
            )
            .font(.headline)
            .foregroundStyle(Color.tsConfirmed)
            .accessibilityIdentifier("calendar-saved")
            Text(proposal.title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Text(dateText)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
            if let identifier = receipt.eventIdentifier, !identifier.isEmpty {
                Text(
                    verbatim: "\(appLanguage.text("Receipt")) \(identifier.prefix(8))"
                )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .accessibilityIdentifier("calendar-save-receipt")
            }
        }
    }

    private var durationMinutes: Int {
        max(1, Int(proposal.endDate.timeIntervalSince(proposal.startDate) / 60))
    }

    private var durationText: String {
        let editableSuffix = proposal.durationWasExplicit
            ? ""
            : " · \(appLanguage.text("Editable"))"
        if appLanguage.usesSimplifiedChinese() {
            return "\(durationMinutes) 分钟\(editableSuffix)"
        }
        return "\(durationMinutes) min\(editableSuffix)"
    }

    private var dateText: String {
        let formatter = DateFormatter()
        formatter.locale = appLanguage.locale
        formatter.timeZone = TimeZone(identifier: proposal.timeZoneIdentifier)
            ?? .current
        formatter.setLocalizedDateFormatFromTemplate("EEE MMM d HH:mm")
        return formatter.string(from: proposal.startDate)
    }

    private func sync() {
        guard result != .syncing else { return }
        if var canonicalActivity, let activityStore {
            canonicalActivity.calendarSyncState = isCalendarSyncEnabled
                ? .syncing
                : .disabled
            canonicalActivity.lastCalendarSyncAttempt = isCalendarSyncEnabled
                ? Date()
                : nil
            do {
                try activityStore.save(canonicalActivity)
            } catch {
                result = .failed(
                    appLanguage.text(
                        "The event could not be saved in Talent Signal. Nothing was added to Apple Calendar."
                    )
                )
                return
            }
            if !isCalendarSyncEnabled {
                result = .savedInApp
                return
            }
        }
        result = .syncing
        Task { @MainActor in
            switch await calendarSync.createEvent(from: proposal) {
            case let .success(event):
                if let canonicalActivity, let activityStore {
                    try? activityStore.save(
                        canonicalActivity.updatingCalendarSync(
                            .synced,
                            eventIdentifier: event.identifier
                        )
                    )
                }
                receiptStore.recordSaved(
                    sourceID: proposal.sourceID,
                    eventIdentifier: event.identifier
                )
                result = .saved(
                    DeviceCalendarWriteReceipt(
                        sourceID: proposal.sourceID,
                        eventIdentifier: event.identifier,
                        savedAt: Date()
                    )
                )
            case let .failure(.saveFailed(message)):
                if let canonicalActivity, let activityStore {
                    try? activityStore.save(
                        canonicalActivity.updatingCalendarSync(.unknown)
                    )
                }
                result = .unknown(
                    uncertainResultMessage(providerMessage: message)
                )
            case let .failure(failure):
                if let canonicalActivity, let activityStore {
                    try? activityStore.save(
                        canonicalActivity.updatingCalendarSync(.failed)
                    )
                }
                result = .failed(failureMessage(failure))
            }
        }
    }

    private func failureMessage(_ failure: DeviceCalendarSyncFailure) -> String {
        let appState = canonicalActivity != nil && activityStore != nil
            ? appLanguage.text("The event is saved in Talent Signal.") + " "
            : ""
        switch failure {
        case .permissionDenied:
            return appState + appLanguage.text(
                "Allow Calendar write access in Settings, then try again."
            )
        case .noDefaultCalendar:
            return appState + appLanguage.text(
                "Choose a default calendar in Apple Calendar, then try again."
            )
        case .eventNotFound:
            return appState + appLanguage.text("The linked Apple Calendar event could not be found. Nothing new was created.")
        case .unsupportedOS:
            return appState + appLanguage.text(
                "One-way Calendar sync requires iOS 17 or later."
            )
        case .saveFailed:
            return appState + appLanguage.text(
                "Apple Calendar could not save the event."
            )
        }
    }

    private func uncertainResultMessage(providerMessage _: String) -> String {
        let appState = canonicalActivity != nil && activityStore != nil
            ? appLanguage.text("The event is saved in Talent Signal.") + " "
            : ""
        return appState + appLanguage.text(
            "Apple Calendar returned an uncertain result. Check Apple Calendar before taking any further action."
        )
    }
}

#if DEBUG
@MainActor
private final class DeterministicDeviceCalendarSyncService: DeviceCalendarSyncing {
    func createEvent(
        from proposal: DeviceCalendarProposal
    ) async -> Result<DeviceCalendarSavedEvent, DeviceCalendarSyncFailure> {
        .success(
            DeviceCalendarSavedEvent(
                identifier: "synthetic-\(proposal.sourceID)",
                title: proposal.title,
                startDate: proposal.startDate,
                endDate: proposal.endDate,
                timeZoneIdentifier: proposal.timeZoneIdentifier
            )
        )
    }

    func updateEvent(
        eventIdentifier: String,
        from proposal: DeviceCalendarProposal
    ) async -> Result<DeviceCalendarSavedEvent, DeviceCalendarSyncFailure> {
        .success(
            DeviceCalendarSavedEvent(
                identifier: eventIdentifier,
                title: proposal.title,
                startDate: proposal.startDate,
                endDate: proposal.endDate,
                timeZoneIdentifier: proposal.timeZoneIdentifier
            )
        )
    }
}

struct DeviceCalendarHandoffScenarioView: View {
    private let proposal = DeviceCalendarProposal(
        sourceID: "calendar-handoff-ui-\(ProcessInfo.processInfo.processIdentifier)",
        personDisplayName: "Leila Hassan",
        title: "Interview · Leila Hassan",
        startDate: Date(timeIntervalSince1970: 1_819_954_800),
        endDate: Date(timeIntervalSince1970: 1_819_956_600),
        timeZoneIdentifier: "Asia/Singapore",
        evidenceQuote: "Interview September 3, 2027 at 3:00 PM.",
        detectedDateText: "September 3, 2027 at 3:00 PM",
        durationWasExplicit: false
    )

    var body: some View {
        NavigationStack {
            ScrollView {
                DeviceCalendarHandoffView(
                    proposal: proposal,
                    calendarSync: DeterministicDeviceCalendarSyncService()
                )
                    .padding(20)
            }
            .background(Color.tsCanvas)
            .navigationTitle("Screenshot reviewed")
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("calendar-handoff-scenario")
        }
    }
}
#endif

struct DeviceCalendarSavedEvent: Equatable {
    let identifier: String
    let title: String
    let startDate: Date
    let endDate: Date
    let timeZoneIdentifier: String
}

#Preview("Calendar proposal") {
    ScrollView {
        DeviceCalendarHandoffView(
            proposal: DeviceCalendarProposal(
                sourceID: "synthetic-calendar-proposal",
                personDisplayName: "Leila Hassan",
                title: "面试 · Leila Hassan",
                startDate: Date(timeIntervalSince1970: 1_788_421_200),
                endDate: Date(timeIntervalSince1970: 1_788_423_000),
                timeZoneIdentifier: "Asia/Singapore",
                evidenceQuote: "9月3日下午3点可以，我们视频面试吧。",
                detectedDateText: "9月3日下午3点",
                durationWasExplicit: false
            ),
            receiptStore: DeviceCalendarReceiptStore(
                defaults: UserDefaults(suiteName: "calendar-preview")!
            )
        )
        .padding()
    }
    .background(Color.tsCanvas)
}
