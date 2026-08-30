import EventKit
import EventKitUI
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
    case cancelled
    case verificationNeeded
    case saved(DeviceCalendarWriteReceipt)
}

struct DeviceCalendarHandoffView: View {
    let proposal: DeviceCalendarProposal

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var editorProposal: DeviceCalendarProposal?
    @State private var showsEvidence = false
    @State private var result: DeviceCalendarHandoffResult

    private let receiptStore: DeviceCalendarReceiptStore

    init(
        proposal: DeviceCalendarProposal,
        receiptStore: DeviceCalendarReceiptStore = DeviceCalendarReceiptStore()
    ) {
        self.proposal = proposal
        self.receiptStore = receiptStore
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
            case .verificationNeeded:
                verificationNeededContent
            case .notStarted, .cancelled:
                proposalContent
            }
        }
        .tsCard()
        .sheet(item: $editorProposal) { proposal in
            DeviceCalendarEditorSheet(proposal: proposal) { completion in
                switch completion {
                case let .saved(event):
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
                case .cancelled:
                    result = .cancelled
                case .verificationNeeded:
                    result = .verificationNeeded
                }
            }
        }
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

            if result == .cancelled {
                Label(
                    appLanguage.text("Calendar unchanged"),
                    systemImage: "xmark.circle"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityIdentifier("calendar-editor-cancelled")
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
            editorProposal = proposal
        } label: {
            Text(appLanguage.text("Add event"))
        }
        .buttonStyle(TSPrimaryButtonStyle())
        .accessibilityLabel(appLanguage.text("Add to Calendar"))
        .accessibilityHint(
            appLanguage.text("Opens Apple's editor with this title and time.")
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

    private var verificationNeededContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                appLanguage.text("Calendar save needs verification"),
                systemImage: "exclamationmark.shield"
            )
                .font(.headline)
                .foregroundStyle(Color.tsWarning)
            Text(
                appLanguage.text(
                    "Apple Calendar returned from Save, but Talent Signal could not read the exact event back. Check Apple Calendar before trying again."
                )
            )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("calendar-save-needs-verification")
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
}

#if DEBUG
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
                DeviceCalendarHandoffView(proposal: proposal)
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

enum DeviceCalendarEditorCompletion {
    case saved(DeviceCalendarSavedEvent)
    case cancelled
    case verificationNeeded
}

struct DeviceCalendarEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    let proposal: DeviceCalendarProposal
    let onComplete: (DeviceCalendarEditorCompletion) -> Void

    var body: some View {
        DeviceCalendarEditorController(proposal: proposal) { completion in
            onComplete(completion)
            dismiss()
        }
        .ignoresSafeArea()
        .interactiveDismissDisabled()
    }
}

private struct DeviceCalendarEditorController: UIViewControllerRepresentable {
    let proposal: DeviceCalendarProposal
    let onComplete: (DeviceCalendarEditorCompletion) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onComplete: onComplete)
    }

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let eventStore = EKEventStore()
        let event = EKEvent(eventStore: eventStore)
        event.title = proposal.title
        event.startDate = proposal.startDate
        event.endDate = proposal.endDate
        event.timeZone = TimeZone(identifier: proposal.timeZoneIdentifier)

        let controller = EKEventEditViewController()
        controller.eventStore = eventStore
        controller.event = event
        controller.editViewDelegate = context.coordinator
        context.coordinator.eventStore = eventStore
        return controller
    }

    func updateUIViewController(
        _ uiViewController: EKEventEditViewController,
        context: Context
    ) {}

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        var eventStore: EKEventStore?
        private let onComplete: (DeviceCalendarEditorCompletion) -> Void
        private var completed = false

        init(onComplete: @escaping (DeviceCalendarEditorCompletion) -> Void) {
            self.onComplete = onComplete
        }

        func eventEditViewController(
            _ controller: EKEventEditViewController,
            didCompleteWith action: EKEventEditViewAction
        ) {
            guard !completed else { return }
            completed = true
            switch action {
            case .saved:
                guard let identifier = controller.event?.eventIdentifier,
                      !identifier.isEmpty,
                      let event = eventStore?.event(withIdentifier: identifier) else {
                    onComplete(.verificationNeeded)
                    return
                }
                onComplete(
                    .saved(
                        DeviceCalendarSavedEvent(
                            identifier: identifier,
                            title: event.title,
                            startDate: event.startDate,
                            endDate: event.endDate,
                            timeZoneIdentifier: event.timeZone?.identifier
                                ?? TimeZone.current.identifier
                        )
                    )
                )
            case .canceled, .deleted:
                onComplete(.cancelled)
            @unknown default:
                onComplete(.cancelled)
            }
        }
    }
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
