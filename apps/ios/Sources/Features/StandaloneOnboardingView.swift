import AppIntents
import SwiftUI
import UIKit

struct StandaloneOnboardingView: View {
    private enum CaptureMode: String, CaseIterable, Identifiable {
        case voice = "Voice"
        case text = "Text"
        var id: String { rawValue }
    }

    private enum TodayDetail: String, Identifiable {
        case pursuit
        case source
        case signal
        case proposal
        var id: String { rawValue }
    }

    @StateObject private var store: StandaloneOnboardingStore
    @StateObject private var calendarService = StandaloneCalendarService()
    @StateObject private var voiceService = StandaloneVoiceCaptureService()
    @ObservedObject private var intentRouter = CaptureIntentRouter.shared
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.sizeCategory) private var sizeCategory
    @Environment(\.appLanguage) private var appLanguage

    @State private var displayName = ""
    @State private var selectedTemplate = "Hire someone"
    @State private var outcome = "Hire a VP of Engineering"
    @State private var hasTargetDate = false
    @State private var targetDate = Date().addingTimeInterval(30 * 24 * 60 * 60)
    @State private var captureMode: CaptureMode = .text
    @State private var captureAuthorized = false
    @State private var todayDetail: TodayDetail?
    @State private var showsSettings = false
    @State private var sharedCaptureNotice: String?

    private let forceDemoEngine: Bool
    private let simulatesActionButton: Bool
    private let initialURL: URL?

    init(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        initialURL: URL? = nil
    ) {
        let reset = arguments.contains("--standalone-onboarding-reset")
        _store = StateObject(wrappedValue: StandaloneOnboardingStore(reset: reset))
        forceDemoEngine = arguments.contains("--demo-proposal-engine")
            || arguments.contains("--standalone-demo")
        simulatesActionButton = arguments.contains("--simulate-action-button")
            || arguments.contains("--standalone-demo")
        self.initialURL = initialURL
    }

    var body: some View {
        ZStack {
            Color.tsCanvas.ignoresSafeArea()
            VStack(spacing: 0) {
                if store.state.route != .today {
                    progressHeader
                }
                ScrollView {
                    routeContent
                        .frame(maxWidth: 620, alignment: .leading)
                        .padding(.horizontal, 22)
                        .padding(.top, 24)
                        .padding(.bottom, 40)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .foregroundStyle(Color.tsInk)
        .tint(.tsVermilion)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: store.state.route)
        .onChange(of: calendarService.permission) { permission in
            store.observeCalendar(
                permission,
                selectedCalendarIDs: Array(calendarService.selectedCalendarIDs).sorted()
            )
        }
        .onChange(of: voiceService.phase) { phase in
            switch phase {
            case .idle: break
            case .requestingPermission:
                store.updateCaptureState(.requestingPermission)
            case .recording:
                store.updateCaptureState(.recording)
            case .transcribing:
                store.updateCaptureState(.transcribing)
            case let .ready(fileName):
                store.updateCaptureState(.readyToProcess, audioFileName: fileName)
            case let .failed(message):
                store.updateCaptureState(.failedRecoverable, error: message)
                captureMode = .text
            }
        }
        .onChange(of: voiceService.elapsedSeconds) { _ in
            guard voiceService.isRecording,
                  let draftID = store.state.captureDraft?.id,
                  (try? LiveActivityStopRequestBridge.consume(draftID: draftID)) == true else {
                return
            }
            Task { await finishVoiceRecording() }
        }
        .onChange(of: store.state.route) { route in
            if route != .capture, voiceService.isRecording {
                voiceService.stopForInterruption()
            }
        }
        .onChange(of: store.state.pursuit?.id) { _ in
            importNextSharedCapture()
        }
        .onChange(of: intentRouter.request) { request in
            guard let request else { return }
            if store.state.route == .actionButtonPractice,
               store.state.actionPracticeState == .practiceWindowOpened {
                store.completePractice(simulated: false)
            } else {
                switch request.destination {
                case .hub:
                    captureMode = .text
                    store.requestSystemCapture(.text)
                case .foregroundAudio:
                    captureMode = .voice
                    store.requestSystemCapture(.voice)
                case .latestProposal:
                    store.showLatestProposal()
                case let .pursuit(id):
                    store.openPursuit(id: id)
                }
            }
            intentRouter.consume(request.id)
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                importNextSharedCapture()
                if store.state.route == .calendarExplanation
                    || store.state.route == .meetingSelection {
                    Task { await calendarService.refresh() }
                }
            } else if phase != .active, voiceService.isRecording {
                voiceService.stopForInterruption()
            }
        }
        .task {
            importNextSharedCapture()
            if let initialURL { handleDeepLink(initialURL) }
        }
        .sheet(item: $todayDetail) { detail in
            todayDetailSheet(detail)
        }
        .sheet(isPresented: $showsSettings) {
            standaloneSettings
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
    }

    private var progressHeader: some View {
        VStack(spacing: 10) {
            HStack {
                TalentSignalBrandMark().frame(width: 28, height: 28)
                Text(localized("TALENT SIGNAL"))
                    .font(.caption.weight(.bold))
                    .tracking(1.4)
                Spacer()
                Text(localized("\(stepNumber) / 9"))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Color.tsMutedInk)
                    .accessibilityLabel(localized("Onboarding step \(stepNumber) of 9"))
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.tsLine).frame(height: 2)
                    Capsule().fill(Color.tsVermilion)
                        .frame(width: proxy.size.width * CGFloat(stepNumber) / 9, height: 2)
                }
            }
            .frame(height: 2)
        }
        .padding(.horizontal, 22)
        .padding(.top, 14)
        .padding(.bottom, 8)
        .background(Color.tsCanvas)
    }

    private var stepNumber: Int {
        switch store.state.route {
        case .welcome, .identity: return 1
        case .pursuit: return 2
        case .productDemo: return 3
        case .sourceChoice, .calendarExplanation, .meetingSelection: return 4
        case .capture, .processing: return 5
        case .proposalReview: return 6
        case .verifiedProgress: return 7
        case .actionButtonOffer, .actionButtonPractice: return 8
        case .today: return 9
        }
    }

    @ViewBuilder
    private var routeContent: some View {
        switch store.state.route {
        case .welcome: welcome
        case .identity: identity
        case .pursuit: pursuit
        case .productDemo: productDemo
        case .sourceChoice: sourceChoice
        case .calendarExplanation: calendarExplanation
        case .meetingSelection: meetingSelection
        case .capture: capture
        case .processing: processing
        case .proposalReview: proposalReview
        case .verifiedProgress: verifiedProgress
        case .actionButtonOffer: actionButtonOffer
        case .actionButtonPractice: actionButtonPractice
        case .today: today
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 24) {
            Spacer(minLength: 26)
            TalentSignalBrandMark().frame(width: 66, height: 66)
            Text(localized("Remember what moves\nthe work forward."))
                .font(.system(.largeTitle, design: .serif, weight: .semibold))
                .fixedSize(horizontal: false, vertical: true)
            Text(localized("Turn meetings and conversations into evidence-backed next steps."))
                .font(.title3)
                .foregroundStyle(Color.tsMutedInk)
            Label(localized("Nothing changes until you confirm it."), systemImage: "hand.raised.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsConfirmed)
                .padding(.vertical, 14)
                .accessibilityIdentifier("standalone-trust-line")
            Button(localized("Get Started")) { store.showIdentity() }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("standalone-get-started")
#if DEBUG
            Button(localized("Continue as Demo User")) {
                store.begin(displayName: "Demo Recruiter", demoAccount: true)
            }
            .buttonStyle(TSSecondaryButtonStyle())
            .accessibilityIdentifier("standalone-demo-user")
#endif
        }
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("Your work stays yours", eyebrow: "LOCAL IDENTITY")
            Text(localized("A display name is enough to keep local decisions attributable. No email or contact import is required."))
                .foregroundStyle(Color.tsMutedInk)
            VStack(alignment: .leading, spacing: 8) {
                Text(localized("Display name")).font(.subheadline.weight(.semibold))
                TextField("Your name", text: $displayName)
                    .textContentType(.name)
                    .padding(14)
                    .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay { RoundedRectangle(cornerRadius: 14).stroke(Color.tsLine) }
                    .accessibilityIdentifier("standalone-display-name")
            }
            trustNote("This local identity is not Sign in with Apple and never becomes candidate evidence.")
            Button(localized("Use This Local Identity")) {
                store.begin(displayName: displayName, demoAccount: false)
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("standalone-use-identity")
        }
    }

    private var pursuit: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("What are you moving forward?", eyebrow: "PURSUIT")
            Text(localized("Start with the outcome. People and evidence can arrive later."))
                .foregroundStyle(Color.tsMutedInk)
            VStack(spacing: 10) {
                ForEach(["Hire someone", "Win an opportunity", "Build a partnership", "Something else"], id: \.self) { template in
                    choiceRow(
                        title: template,
                        detail: template == "Hire someone" ? "Recommended for the showcase" : nil,
                        selected: selectedTemplate == template
                    ) {
                        selectedTemplate = template
                        if template == "Hire someone", outcome.isEmpty {
                            outcome = "Hire a VP of Engineering"
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(localized("Outcome")).font(.subheadline.weight(.semibold))
                TextField("Hire a VP of Engineering", text: $outcome, axis: .vertical)
                    .lineLimit(2 ... 4)
                    .padding(14)
                    .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay { RoundedRectangle(cornerRadius: 14).stroke(Color.tsLine) }
                    .accessibilityIdentifier("standalone-pursuit-outcome")
                Toggle("Add a target date", isOn: $hasTargetDate)
                if hasTargetDate {
                    DatePicker("Target date", selection: $targetDate, displayedComponents: .date)
                }
            }
            notice
            Button(localized("Create This Pursuit")) {
                store.createPursuit(
                    template: selectedTemplate,
                    outcome: outcome,
                    targetDate: hasTargetDate ? targetDate : nil
                )
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("standalone-create-pursuit")
        }
        .onAppear {
            if let existing = store.state.pursuit {
                selectedTemplate = existing.template
                outcome = existing.outcome
                hasTargetDate = existing.targetDate != nil
                targetDate = existing.targetDate ?? targetDate
            }
        }
    }

    private var productDemo: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("From conversation to a next move", eyebrow: "20-SECOND DEMO")
            demoBadge("SYNTHETIC · DOES NOT UPDATE YOUR PURSUIT")
            causalBlock(
                label: "SOURCE",
                icon: "calendar",
                title: "Candidate catch-up",
                body: "“Prefers remote; availability may be three weeks. Visa status is unclear.”"
            )
            Rectangle().fill(Color.tsVermilion).frame(width: 2, height: 28).padding(.leading, 21)
                .accessibilityHidden(true)
            causalBlock(
                label: "PROPOSAL",
                icon: "sparkles",
                title: "Record what is supported",
                body: "Remote preference is proposed as fact. Visa status stays unresolved. You can confirm, edit, or decline."
            )
            trustNote("A Proposal has no authority. Only your review can create verified progress.")
            Button(localized("Try It With My Signal")) { store.finishProductDemo() }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("standalone-finish-demo")
        }
    }

    private var sourceChoice: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("Give Talent Signal one place to listen", eyebrow: "FIRST SOURCE")
            sourceChoiceButton(
                icon: "calendar",
                title: "Calendar",
                detail: "Connect a meeting to the right Pursuit",
                badge: "Recommended"
            ) { store.chooseSource(.calendar) }
            sourceChoiceButton(
                icon: "waveform",
                title: "Voice",
                detail: "Capture what you just learned",
                badge: nil
            ) {
                captureMode = .voice
                store.chooseSource(.voice)
            }
            sourceChoiceButton(
                icon: "text.cursor",
                title: "Type a Signal",
                detail: "Start without any permission",
                badge: nil
            ) {
                captureMode = .text
                store.chooseSource(.text)
            }
            Text(localized("Later: Share Extension · Contacts · Gmail"))
                .font(.footnote)
                .foregroundStyle(Color.tsMutedInk)
        }
    }

    private var calendarExplanation: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("Connect the conversation to the right moment.", eyebrow: "CALENDAR")
            Text(localized("Talent Signal reads event titles, times, and calendars so you can choose a meeting. It never changes calendar events during onboarding."))
                .foregroundStyle(Color.tsMutedInk)
            VStack(alignment: .leading, spacing: 14) {
                permissionLine("Read a bounded two-week window", icon: "calendar.badge.clock")
                permissionLine("Show at most five choices", icon: "list.number")
                permissionLine("No Calendar writes", icon: "lock.shield")
            }
            .tsCard()
            calendarStatus
            if calendarService.permission == .notDetermined {
                Button(localized("Allow Calendar Access")) {
                    Task {
                        await calendarService.requestFullAccess()
                        store.observeCalendar(calendarService.permission)
                        if [.fullAccess, .connectedEmpty, .connectedWithMeetings].contains(calendarService.permission) {
                            store.showMeetingSelection()
                        }
                    }
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("standalone-allow-calendar")
            } else if [.fullAccess, .connectedEmpty, .connectedWithMeetings].contains(calendarService.permission) {
                Button(localized("Choose a Meeting")) { store.showMeetingSelection() }
                    .buttonStyle(TSPrimaryButtonStyle())
            }
            Button(localized("Not Now")) { store.returnToSourceChoice() }
                .buttonStyle(TSSecondaryButtonStyle())
            Button(localized("Use a Demo Meeting")) {
                store.chooseMeeting(StandaloneCalendarService.demoMeeting())
            }
            .buttonStyle(TSTextButtonStyle())
            .accessibilityIdentifier("standalone-calendar-demo-meeting")
            if [.denied, .restricted, .writeOnly].contains(calendarService.permission) {
                Button(localized("Open Settings")) { openSystemSettings() }
                    .buttonStyle(TSTextButtonStyle())
            }
        }
        .task { await calendarService.refresh() }
    }

    private var meetingSelection: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("Which conversation just moved?", eyebrow: "MEETING")
            VStack(alignment: .leading, spacing: 8) {
                Text(localized("Calendar window")).font(.subheadline.weight(.semibold))
                Picker(
                    "Calendar window",
                    selection: Binding(
                        get: { store.state.calendarWindow },
                        set: { window in
                            store.selectCalendarWindow(window)
                            Task { await calendarService.setWindow(window) }
                        }
                    )
                ) {
                    ForEach(StandaloneCalendarWindow.allCases) { window in
                        Text(localized(window.rawValue)).tag(window)
                    }
                }
                .pickerStyle(.menu)
                Text(localized("Confirm the smallest recent or upcoming window needed to identify the meeting."))
                    .font(.footnote)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .tsCard()
            if !calendarService.calendars.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text(localized("Calendars")).font(.subheadline.weight(.semibold))
                    ForEach(calendarService.calendars) { calendar in
                        Toggle(
                            calendar.title,
                            isOn: Binding(
                                get: { calendarService.selectedCalendarIDs.contains(calendar.id) },
                                set: { _ in Task { await calendarService.toggleCalendar(calendar.id) } }
                            )
                        )
                    }
                }
                .tsCard()
            }
            if calendarService.isLoading {
                ProgressView("Reading the bounded Calendar window…")
            } else if calendarService.meetings.isEmpty {
                emptyState(
                    title: "No meeting needs choosing",
                    body: "Calendar is connected, but the selected window has no eligible events. A Demo Meeting, Voice, or Text can continue the journey."
                )
            } else {
                ForEach(calendarService.meetings) { meeting in
                    meetingButton(meeting)
                }
            }
            meetingButton(StandaloneCalendarService.demoMeeting())
            Button(localized("Use Voice Instead")) {
                captureMode = .voice
                store.chooseSource(.voice)
            }
            .buttonStyle(TSSecondaryButtonStyle())
            Button(localized("Type a Signal Instead")) {
                captureMode = .text
                store.chooseSource(.text)
            }
            .buttonStyle(TSTextButtonStyle())
        }
        .task {
            await calendarService.setWindow(store.state.calendarWindow)
        }
    }

    private var capture: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("What changed after this conversation?", eyebrow: "SIGNAL")
            sourceSummary
            Picker("Input mode", selection: $captureMode) {
                ForEach(CaptureMode.allCases) { mode in Text(mode.rawValue).tag(mode) }
            }
            .pickerStyle(.segmented)
            .disabled(voiceService.isRecording)
            if captureMode == .voice { voiceCapture } else { textCapture }
            notice
            Button(localized("Process This Signal")) {
                Task {
                    await store.process(
                        using: AdaptiveStandaloneProposalEngine(forceDemo: forceDemoEngine)
                    )
                }
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .disabled(
                voiceService.isRecording
                    || store.state.captureDraft?.text
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .isEmpty != false
            )
            .accessibilityIdentifier("standalone-process-signal")
            Text(localized("The Source and Draft are already saved locally. Processing creates a Proposal, not a fact."))
                .font(.footnote)
                .foregroundStyle(Color.tsMutedInk)
        }
    }

    private var textCapture: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextEditor(
                text: Binding(
                    get: { store.state.captureDraft?.text ?? "" },
                    set: { store.updateDraftText($0) }
                )
            )
            .frame(minHeight: 170)
            .padding(10)
            .scrollContentBackground(.hidden)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 16))
            .overlay { RoundedRectangle(cornerRadius: 16).stroke(Color.tsLine) }
            .accessibilityLabel(localized("Signal text"))
            .accessibilityIdentifier("standalone-signal-text")
            Button(localized("Use the showcase Signal")) {
                store.updateDraftText(
                    "Mina prefers remote, could start in three weeks, and wants to understand the team size. Visa status is still unclear."
                )
            }
            .buttonStyle(TSTextButtonStyle())
            .accessibilityIdentifier("standalone-use-example-signal")
        }
    }

    private var voiceCapture: some View {
        VStack(alignment: .leading, spacing: 14) {
            Toggle(
                "I have permission to capture this purpose-bound conversation",
                isOn: $captureAuthorized
            )
            .font(.subheadline)
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: voiceService.isRecording ? "waveform.circle.fill" : "mic.circle")
                        .font(.largeTitle)
                        .foregroundStyle(voiceService.isRecording ? Color.tsVermilion : Color.tsInk)
                    VStack(alignment: .leading) {
                        Text(voicePhaseTitle).font(.headline)
                        Text(timeLabel).font(.body.monospacedDigit()).foregroundStyle(Color.tsMutedInk)
                    }
                    Spacer()
                }
                if voiceService.isRecording {
                    HStack {
                        Button(localized("Stop")) {
                            Task { await finishVoiceRecording() }
                        }
                        .buttonStyle(TSPrimaryButtonStyle())
                        Button(localized("Cancel")) {
                            voiceService.cancel()
                            store.updateCaptureState(.cancelled)
                        }
                            .buttonStyle(TSSecondaryButtonStyle())
                    }
                } else {
                    Button(localized("Start Foreground Recording")) {
                        guard let draftID = store.state.captureDraft?.id else { return }
                        Task {
                            await voiceService.start(
                                draftID: draftID,
                                authorizationConfirmed: captureAuthorized
                            )
                        }
                    }
                    .buttonStyle(TSSecondaryButtonStyle())
                }
            }
            .tsCard()
            if !voiceService.transcript.isEmpty {
                Text(localized("ON-DEVICE TRANSCRIPT")).font(.caption.weight(.bold)).tracking(1)
                Text(voiceService.transcript)
                    .textSelection(.enabled)
                    .padding(14)
                    .background(Color.tsEvidence, in: RoundedRectangle(cornerRadius: 14))
            } else {
                Text(localized("On iOS 26+, SpeechAnalyzer progressively transcribes while the foreground recording is active. If live Speech is unavailable, the recording remains local and you can type the Signal without losing the Draft."))
                    .font(.footnote)
                    .foregroundStyle(Color.tsMutedInk)
            }
            textCapture
        }
    }

    private var processing: some View {
        VStack(alignment: .leading, spacing: 24) {
            pageTitle("Organizing the Signal", eyebrow: "PROPOSAL")
            ProgressView().controlSize(.large)
            Text(localized("Separating supported facts, inference, unknowns, and one possible next action."))
                .font(.title3)
            trustNote("Nothing is being sent and the Pursuit has not changed.")
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue("Processing a local Proposal")
    }

    private var proposalReview: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("Review what Talent Signal understood", eyebrow: "HUMAN DECISION")
            if let proposal = store.state.proposal {
                demoBadge(proposal.engineLabel.uppercased())
                reviewSection("SOURCE", icon: "quote.opening") {
                    Text(proposal.sourceSummary).font(.headline)
                    Text(store.state.captureDraft?.text ?? "")
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .textSelection(.enabled)
                }
                reviewSection("MATCHED PURSUIT", icon: "scope") {
                    Text(store.state.pursuit?.outcome ?? "Unknown Pursuit").font(.headline)
                    Button(localized("Wrong Pursuit")) { store.markWrongPursuit() }
                        .buttonStyle(TSTextButtonStyle())
                }
                Rectangle().fill(Color.tsVermilion).frame(height: 2)
                    .accessibilityLabel(localized("Review boundary between source and proposed changes"))
                ForEach(proposal.facts) { fact in factReview(fact) }
                ForEach(proposal.inferences) { inference in
                    reviewSection("INFERENCE · NOT A FACT", icon: "lightbulb") {
                        Text(inference.statement).font(.headline)
                        Text(inference.basis).foregroundStyle(Color.tsMutedInk)
                    }
                }
                ForEach(proposal.unknowns) { unknown in
                    reviewSection("STILL UNKNOWN", icon: "questionmark.circle") {
                        Text(unknown.question).font(.headline)
                        Text(unknown.whyUnresolved).foregroundStyle(Color.tsMutedInk)
                    }
                }
                ForEach(proposal.nextActions) { action in actionReview(action) }
                notice
                Button(localized("Confirm and Update Pursuit")) { store.confirm() }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("standalone-confirm-proposal")
                Button(localized("Keep Unresolved")) { store.keepUnresolvedOnly() }
                    .buttonStyle(TSSecondaryButtonStyle())
                Button(localized("Discard Proposal")) { store.discardProposal() }
                    .buttonStyle(TSTextButtonStyle())
                Text(proposal.modelDisclaimer)
                    .font(.footnote)
                    .foregroundStyle(Color.tsMutedInk)
            }
        }
    }

    private var verifiedProgress: some View {
        VStack(alignment: .leading, spacing: 22) {
            demoBadge("VERIFIED BY YOU")
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 54))
                .foregroundStyle(Color.tsConfirmed)
            pageTitle("You moved this Pursuit forward.", eyebrow: "VERIFIED PROGRESS")
            if let progress = store.state.progress {
                ForEach(progress.confirmedFacts) { fact in
                    summaryRow(label: fact.field, value: fact.proposedValue, icon: "checkmark")
                }
                ForEach(progress.acceptedActions) { action in
                    summaryRow(label: "Accepted next action", value: action.title, icon: "arrow.right")
                }
                ForEach(progress.unresolved) { unknown in
                    summaryRow(label: "Still unresolved", value: unknown.question, icon: "questionmark")
                }
                trustNote("Source: \(progress.sourceSummary). Confirmation changed only local Pursuit state; no message or Calendar write occurred.")
            }
            Button(localized("See It in Today")) { store.enterToday() }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("standalone-see-today")
            Button(localized("Make the Next Capture Instant")) { store.showActionButtonOffer() }
                .buttonStyle(TSSecondaryButtonStyle())
                .accessibilityIdentifier("standalone-offer-action-button")
        }
    }

    private var actionButtonOffer: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("Capture the next Signal without leaving the moment", eyebrow: "APP SHORTCUT")
            Text(localized("Talent Signal exposes Capture Signal, Record Signal, and Review screenshot. Only you can map an App Shortcut to the Action Button in Settings."))
                .foregroundStyle(Color.tsMutedInk)
            ShortcutsLink()
                .shortcutsLinkStyle(.automaticOutline)
                .frame(maxWidth: .infinity, minHeight: 52)
                .accessibilityIdentifier("standalone-open-shortcuts")
            trustNote("The app cannot set or reliably read your Action Button mapping.")
            Button(localized("Practice Capture Signal")) { store.openPractice() }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("standalone-practice-capture")
            Button(localized("Do This Later")) { store.skipPractice() }
                .buttonStyle(TSSecondaryButtonStyle())
        }
    }

    private var actionButtonPractice: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("Practice without changing your Pursuit", eyebrow: "PRACTICE SESSION")
            Text(localized("Invoke Capture Signal from the Action Button or Shortcuts now. During this practice window it records only a local practice event—no microphone, Proposal, or Pursuit write."))
                .foregroundStyle(Color.tsMutedInk)
            if [.intentReceivedInPractice, .simulated].contains(store.state.actionPracticeState) {
                summaryRow(
                    label: store.state.actionPracticeState == .simulated ? "Simulated Action Button" : "App Shortcut received",
                    value: "Action Button Ready",
                    icon: "checkmark.circle.fill"
                )
                Button(localized("Enter Today")) { store.enterToday() }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("standalone-enter-today")
            } else {
                ProgressView("Waiting for Capture Signal…")
#if DEBUG
                if simulatesActionButton {
                    Button(localized("Simulate Action Button")) { store.completePractice(simulated: true) }
                        .buttonStyle(TSPrimaryButtonStyle())
                        .accessibilityIdentifier("standalone-simulate-action-button")
                    demoBadge("SIMULATED · NOT A HARDWARE EVENT")
                }
#endif
                Button(localized("Skip Practice")) { store.skipPractice() }
                    .buttonStyle(TSSecondaryButtonStyle())
            }
        }
    }

    private var today: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(localized("Today")).font(.largeTitle.bold())
                    Text(localized("One supported move, with its evidence still attached."))
                        .foregroundStyle(Color.tsMutedInk)
                }
                Spacer()
                Button { showsSettings = true } label: {
                    Image(systemName: "gearshape")
                        .frame(width: 44, height: 44)
                        .background(Color.tsSurface, in: Circle())
                }
                .accessibilityLabel(localized("Settings"))
            }
            if let pursuit = store.state.pursuit, let progress = store.state.progress {
                VStack(alignment: .leading, spacing: 18) {
                    Text(pursuit.outcome).font(.title2.bold())
                    ForEach(progress.confirmedFacts.prefix(1)) { fact in
                        summaryRow(label: "Verified progress", value: fact.proposedValue, icon: "checkmark.seal")
                    }
                    ForEach(progress.unresolved.prefix(1)) { unknown in
                        summaryRow(label: "Unresolved", value: unknown.question, icon: "questionmark.circle")
                    }
                    if let action = progress.acceptedActions.first ?? store.state.proposal?.nextActions.first {
                        summaryRow(label: "Next action", value: action.title, icon: "arrow.right.circle")
                    }
                    Text(localized("PROVENANCE")).font(.caption.weight(.bold)).tracking(1)
                    Text(progress.sourceSummary)
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                }
                .tsCard()
                .accessibilityIdentifier("standalone-today-primary-card")
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.flexible(), spacing: 10),
                        count: sizeCategory.isAccessibilityCategory ? 1 : 2
                    ),
                    spacing: 10
                ) {
                    todayLink("Pursuit", .pursuit)
                    todayLink("Source", .source)
                    todayLink("Signal", .signal)
                    todayLink("Proposal", .proposal)
                }
                capabilitySummary
            } else {
                emptyState(title: "No verified progress yet", body: "Replay onboarding to review one Signal and confirm a supported change.")
            }
        }
    }

    private var standaloneSettings: some View {
        NavigationView {
            Form {
                Section("Onboarding") {
                    Button(localized("Replay Onboarding")) {
                        store.replayOnboarding()
                        showsSettings = false
                    }
                    Button(localized("Reset Demo Data"), role: .destructive) {
                        store.resetDemoData()
                        showsSettings = false
                    }
                }
                Section("Boundary") {
                    Text(localized("Reset removes only standalone local onboarding records. It does not change Calendar permissions or user events."))
                }
            }
            .navigationTitle(localized("Settings"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(localized("Done")) { showsSettings = false }
                }
            }
        }
    }

    @ViewBuilder
    private func todayDetailSheet(_ detail: TodayDetail) -> some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch detail {
                    case .pursuit:
                        pageTitle(store.state.pursuit?.outcome ?? "Pursuit", eyebrow: "PURSUIT")
                        Text(localized("Activation: \(store.state.activationStatus.rawValue)"))
                    case .source:
                        pageTitle(store.state.progress?.sourceSummary ?? "Source", eyebrow: "SOURCE")
                        Text(store.state.selectedMeeting?.isDemo == true ? "Demo Meeting" : "User-selected source")
                    case .signal:
                        pageTitle("Captured Signal", eyebrow: "SIGNAL")
                        Text(store.state.captureDraft?.text ?? "Unavailable").textSelection(.enabled)
                    case .proposal:
                        pageTitle("Reviewed Proposal", eyebrow: store.state.proposal?.engineLabel.uppercased() ?? "PROPOSAL")
                        Text(localized("Facts, inferences, unknowns, and next action remain distinct in the saved review."))
                    }
                }
                .padding(22)
            }
            .background(Color.tsCanvas)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(localized("Done")) { todayDetail = nil } } }
        }
    }

    private var capabilitySummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(localized("CAPABILITIES")).font(.caption.weight(.bold)).tracking(1)
            capability("Calendar", value: calendarCapability)
            capability("Signal capture", value: store.state.captureDraft?.sourceKind == .voice ? "Voice used" : "Text ready")
            capability("Action Button", value: actionCapability)
        }
        .padding(.top, 8)
    }

    private var calendarCapability: String {
        if store.state.selectedMeeting?.isDemo == true {
            return "Demo meeting · not connected"
        }
        switch store.state.lastObservedCalendarPermission {
        case .fullAccess, .connectedEmpty, .connectedWithMeetings: return "Connected"
        case .denied, .restricted, .writeOnly: return "Skipped · text remains available"
        case .notDetermined: return "Not connected"
        }
    }

    private var actionCapability: String {
        switch store.state.actionPracticeState {
        case .intentReceivedInPractice: return "Practiced on this device"
        case .simulated: return "Simulator practice only"
        case .skipped: return "Available later"
        default: return "Available in App Shortcuts"
        }
    }

    @ViewBuilder
    private var sourceSummary: some View {
        if let kind = store.state.captureDraft?.sharedPayloadKind {
            VStack(alignment: .leading, spacing: 12) {
                causalBlock(
                    label: "SHARE SHEET SOURCE",
                    icon: kind == .image ? "photo" : (kind == .url ? "link" : "text.quote"),
                    title: "Shared \(kind.rawValue.capitalized)",
                    body: "Imported through the App Group inbox · original source retained locally"
                )
                sharedImagePreview
            }
        } else if let meeting = store.state.selectedMeeting {
            causalBlock(
                label: meeting.isDemo ? "DEMO MEETING" : "CALENDAR MEETING",
                icon: "calendar",
                title: meeting.title,
                body: "\(StandaloneOnboardingDate.short.string(from: meeting.startsAt)) · \(meeting.calendarTitle)"
            )
        } else {
            causalBlock(
                label: "LOCAL DRAFT",
                icon: store.state.selectedSource == .voice ? "waveform" : "text.cursor",
                title: store.state.selectedSource == .voice ? "Voice Signal" : "Typed Signal",
                body: "Draft \(store.state.captureDraft?.id.uuidString.prefix(8) ?? "pending") · saved before permission or processing"
            )
        }
    }

    private var calendarStatus: some View {
        let status: (String, String, Color) = {
            switch calendarService.permission {
            case .notDetermined: return ("Not requested", "You decide when the system prompt appears.", .tsMutedInk)
            case .fullAccess, .connectedEmpty, .connectedWithMeetings: return ("Full access", "Calendar can be read for meeting selection.", .tsConfirmed)
            case .writeOnly: return ("Write-only is not connected", "Reading meetings requires Full Access.", .tsWarning)
            case .denied: return ("Access denied", "Continue with Voice or Text; Talent Signal will not ask again automatically.", .tsWarning)
            case .restricted: return ("Access restricted", "This device does not currently allow Calendar reading.", .tsWarning)
            }
        }()
        return summaryRow(label: status.0, value: status.1, icon: "calendar.badge.exclamationmark")
            .foregroundStyle(status.2)
    }

    private var voicePhaseTitle: String {
        switch voiceService.phase {
        case .idle: return "Ready when you are"
        case .requestingPermission: return "Requesting microphone permission"
        case .recording: return "Recording locally"
        case .transcribing: return "Transcribing on device"
        case .ready: return "Local recording saved"
        case .failed: return "Use typed input"
        }
    }

    private var timeLabel: String {
        String(format: "%02d:%02d", voiceService.elapsedSeconds / 60, voiceService.elapsedSeconds % 60)
    }

    @ViewBuilder
    private var notice: some View {
        if let message = store.state.lastRecoverableError ?? store.persistenceNotice ?? sharedCaptureNotice {
            Label(message, systemImage: "info.circle")
                .font(.footnote)
                .foregroundStyle(Color.tsWarning)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var sharedImagePreview: some View {
        if let fileName = store.state.captureDraft?.sharedPayloadFileName,
           let inbox = try? SharedCaptureInbox(),
           let url = inbox.payloadURL(fileName: fileName),
           let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 220)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .accessibilityLabel(localized("Shared image retained as source evidence"))
        }
    }

    private func importNextSharedCapture() {
        do {
            let inbox = try SharedCaptureInbox()
            for envelope in try inbox.pending() {
                if store.state.importedSharedEnvelopeIDs.contains(envelope.id) {
                    try inbox.markImported(envelope.id)
                    continue
                }
                guard store.importSharedCapture(envelope) else { return }
                try inbox.markImported(envelope.id)
                sharedCaptureNotice = nil
                return
            }
        } catch SharedCaptureInboxError.appGroupUnavailable {
            sharedCaptureNotice = nil
        } catch {
            sharedCaptureNotice = "A shared item is still safely queued and will retry: \(error.localizedDescription)"
        }
    }

    private func finishVoiceRecording() async {
        if let transcript = await voiceService.stopAndTranscribe() {
            store.updateDraftText(transcript)
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "talentsignal", url.host == "standalone" else { return }
        if url.path == "/proposal" { store.showLatestProposal() }
        if url.path == "/share" { importNextSharedCapture() }
    }

    private func pageTitle(_ title: String, eyebrow: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow).font(.caption.weight(.bold)).tracking(1.4).foregroundStyle(Color.tsVermilion)
            Text(title).font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func demoBadge(_ text: String) -> some View {
        Text(text)
            .font(.caption2.weight(.bold))
            .tracking(0.8)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.tsWarning.opacity(0.12), in: Capsule())
            .overlay { Capsule().stroke(Color.tsWarning.opacity(0.35)) }
            .accessibilityLabel(text)
    }

    private func trustNote(_ text: String) -> some View {
        Label(text, systemImage: "lock.shield")
            .font(.footnote)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func causalBlock(label: String, icon: String, title: String, body: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.headline)
                .frame(width: 44, height: 44)
                .background(Color.tsSurfaceMuted, in: Circle())
            VStack(alignment: .leading, spacing: 6) {
                Text(label).font(.caption.weight(.bold)).tracking(1).foregroundStyle(Color.tsMutedInk)
                Text(title).font(.headline)
                Text(body).font(.subheadline).foregroundStyle(Color.tsMutedInk)
            }
        }
        .tsCard()
    }

    private func choiceRow(title: String, detail: String?, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Color.tsConfirmed : Color.tsMutedInk)
                VStack(alignment: .leading) {
                    Text(title).font(.headline)
                    if let detail { Text(detail).font(.caption).foregroundStyle(Color.tsMutedInk) }
                }
                Spacer()
            }
            .padding(15)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
            .overlay { RoundedRectangle(cornerRadius: 14).stroke(selected ? Color.tsInk : Color.tsLine) }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func sourceChoiceButton(icon: String, title: String, detail: String, badge: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.title3).frame(width: 44, height: 44).background(Color.tsSurfaceMuted, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    HStack { Text(title).font(.headline); if let badge { demoBadge(badge.uppercased()) } }
                    Text(detail).font(.subheadline).foregroundStyle(Color.tsMutedInk)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Color.tsMutedInk)
            }
            .padding(16)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 18))
            .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.tsLine) }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("standalone-source-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))")
    }

    private func permissionLine(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon).font(.subheadline)
    }

    private func meetingButton(_ meeting: StandaloneMeeting) -> some View {
        Button { store.chooseMeeting(meeting) } label: {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: meeting.isDemo ? "calendar.badge.plus" : "calendar")
                    .frame(width: 44, height: 44).background(Color.tsSurfaceMuted, in: Circle())
                VStack(alignment: .leading, spacing: 5) {
                    HStack { Text(meeting.title).font(.headline); if meeting.isDemo { demoBadge("DEMO MEETING") } }
                    Text(StandaloneOnboardingDate.short.string(from: meeting.startsAt)).font(.subheadline).foregroundStyle(Color.tsMutedInk)
                    Text(meeting.calendarTitle).font(.caption).foregroundStyle(Color.tsMutedInk)
                }
                Spacer()
            }
            .padding(16)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 18))
            .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.tsLine) }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(meeting.isDemo ? "standalone-use-demo-meeting" : "standalone-meeting-\(meeting.id)")
    }

    private func emptyState(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            Text(body).font(.subheadline).foregroundStyle(Color.tsMutedInk)
        }
        .tsCard()
    }

    private func reviewSection<Content: View>(_ label: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(label, systemImage: icon).font(.caption.weight(.bold)).tracking(0.8).foregroundStyle(Color.tsMutedInk)
            content()
        }
        .tsCard()
    }

    private func factReview(_ fact: StandaloneProposalFact) -> some View {
        reviewSection("FACT FROM THE CONVERSATION", icon: "quote.bubble") {
            Toggle(
                "Confirm this sourced change",
                isOn: Binding(
                    get: { store.state.selectedFactIDs.contains(fact.id) },
                    set: { store.selectFact(fact.id, selected: $0) }
                )
            )
            .font(.subheadline.weight(.semibold))
            Text(fact.field).font(.caption).foregroundStyle(Color.tsMutedInk)
            TextField(
                "Proposed value",
                text: Binding(
                    get: { store.state.proposal?.facts.first(where: { $0.id == fact.id })?.proposedValue ?? fact.proposedValue },
                    set: { store.editFact(fact.id, value: $0) }
                ),
                axis: .vertical
            )
            .font(.headline)
            Text(localized("“\(fact.evidenceExcerpt)”"))
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .textSelection(.enabled)
            Text(fact.confidenceBand).font(.caption).foregroundStyle(Color.tsMutedInk)
        }
    }

    private func actionReview(_ action: StandaloneProposalAction) -> some View {
        reviewSection("PROPOSED NEXT ACTION", icon: "arrow.right.circle") {
            Toggle(
                "Accept this internal next action",
                isOn: Binding(
                    get: { store.state.acceptedActionIDs.contains(action.id) },
                    set: { store.acceptAction(action.id, accepted: $0) }
                )
            )
            .font(.subheadline.weight(.semibold))
            Text(action.title).font(.headline)
            Text(action.rationale).font(.subheadline).foregroundStyle(Color.tsMutedInk)
        }
    }

    private func summaryRow(label: String, value: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).frame(width: 26).foregroundStyle(Color.tsConfirmed)
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.caption.weight(.semibold)).foregroundStyle(Color.tsMutedInk)
                Text(value).font(.body.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func todayLink(_ title: String, _ detail: TodayDetail) -> some View {
        Button { todayDetail = detail } label: {
            Label(title, systemImage: todayLinkIcon(detail))
                .frame(maxWidth: .infinity)
        }
            .buttonStyle(TSSecondaryButtonStyle())
    }

    private func todayLinkIcon(_ detail: TodayDetail) -> String {
        switch detail {
        case .pursuit: return "scope"
        case .source: return "quote.opening"
        case .signal: return "waveform"
        case .proposal: return "doc.text.magnifyingglass"
        }
    }

    private func capability(_ label: String, value: String) -> some View {
        HStack { Text(label).foregroundStyle(Color.tsMutedInk); Spacer(); Text(value).fontWeight(.semibold) }
            .font(.subheadline)
    }

    private func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private func localized(_ key: String) -> String {
        appLanguage.text(key)
    }
}
