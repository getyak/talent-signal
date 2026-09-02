import AppIntents
import SwiftUI

enum TalentSignalSetupPreference {
    static let actionButtonCompleteKey =
        "talent-signal.setup.action-button-complete"
}

enum WorkspaceTextSizePreference: String, CaseIterable, Identifiable {
    case compact
    case system
    case comfortable

    static let storageKey = "talent-signal.display.text-size"
    var id: String { rawValue }

    static func stored(_ value: String) -> Self {
        Self(rawValue: value) ?? .system
    }

    func adjusted(_ systemSize: DynamicTypeSize) -> DynamicTypeSize {
        guard !systemSize.isAccessibilitySize else { return systemSize }
        let sizes: [DynamicTypeSize] = [
            .xSmall, .small, .medium, .large, .xLarge, .xxLarge, .xxxLarge,
        ]
        guard let current = sizes.firstIndex(of: systemSize) else {
            return systemSize
        }
        let offset: Int
        switch self {
        case .compact: offset = -1
        case .system: offset = 0
        case .comfortable: offset = 1
        }
        return sizes[min(max(current + offset, 0), sizes.count - 1)]
    }

    func displayName(in language: AppLanguage) -> String {
        switch self {
        case .compact: return language.text("Small")
        case .system: return language.text("System")
        case .comfortable: return language.text("Large")
        }
    }
}

enum WorkspaceCardDensityPreference: String, CaseIterable, Identifiable {
    case compact
    case standard
    case comfortable

    static let storageKey = "talent-signal.display.card-density"
    var id: String { rawValue }

    static func stored(_ value: String) -> Self {
        Self(rawValue: value) ?? .compact
    }

    func displayName(in language: AppLanguage) -> String {
        switch self {
        case .compact: return language.text("Compact")
        case .standard: return language.text("Standard")
        case .comfortable: return language.text("Comfortable")
        }
    }

    var rowVerticalInset: CGFloat {
        switch self {
        case .compact: return 3
        case .standard: return 5
        case .comfortable: return 7
        }
    }

    var cardPadding: CGFloat {
        switch self {
        case .compact: return 10
        case .standard: return 12
        case .comfortable: return 15
        }
    }

    var cardCornerRadius: CGFloat {
        switch self {
        case .compact: return 14
        case .standard: return 16
        case .comfortable: return 18
        }
    }

    var personAvatarSize: CGFloat {
        switch self {
        case .compact: return 34
        case .standard: return 38
        case .comfortable: return 44
        }
    }

    var sessionAvatarSize: CGFloat {
        switch self {
        case .compact: return 26
        case .standard: return 30
        case .comfortable: return 34
        }
    }
}

private struct WorkspaceCardDensityPreferenceKey: EnvironmentKey {
    static let defaultValue = WorkspaceCardDensityPreference.compact
}

extension EnvironmentValues {
    var workspaceCardDensity: WorkspaceCardDensityPreference {
        get { self[WorkspaceCardDensityPreferenceKey.self] }
        set { self[WorkspaceCardDensityPreferenceKey.self] = newValue }
    }
}

struct WorkspaceDisplayPreferencesRoot<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var systemDynamicTypeSize

    private let textSize: WorkspaceTextSizePreference
    private let cardDensity: WorkspaceCardDensityPreference
    private let content: Content

    init(
        textSize: WorkspaceTextSizePreference,
        cardDensity: WorkspaceCardDensityPreference,
        @ViewBuilder content: () -> Content
    ) {
        self.textSize = textSize
        self.cardDensity = cardDensity
        self.content = content()
    }

    var body: some View {
        content
            .environment(
                \.dynamicTypeSize,
                textSize.adjusted(systemDynamicTypeSize)
            )
            .environment(\.workspaceCardDensity, cardDensity)
    }
}

struct AppSettingsView: View {
    @AppStorage(AppLanguage.storageKey) private var storedLanguage =
        AppLanguage.system.rawValue
    @Environment(\.appLanguage) private var interfaceLanguage

    private var selectedLanguage: AppLanguage {
        AppLanguage.stored(storedLanguage)
    }

    var body: some View {
        List {
            Section {
                ForEach(AppLanguage.allCases) { language in
                    AppLanguageOptionRow(
                        language: language,
                        interfaceLanguage: interfaceLanguage,
                        isSelected: language == selectedLanguage
                    ) {
                        storedLanguage = language.rawValue
                    }
                }
            } header: {
                Text(interfaceLanguage.text("Interface language"))
            } footer: {
                Text(
                    interfaceLanguage.text(
                        "Changes apply immediately and remain on this device."
                    )
                )
            }

            Section {
                SettingsExplanationRow(
                    systemImage: "text.bubble",
                    title: interfaceLanguage.text("Interface language only"),
                    detail: interfaceLanguage.text(
                        "Candidate names, quoted evidence, and source-authored content stay in their original language."
                    )
                )
            } header: {
                Text(interfaceLanguage.text("Evidence boundary"))
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(interfaceLanguage.text("Language"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("app-settings")
    }
}

struct DisplaySettingsView: View {
    @AppStorage(WorkspaceTextSizePreference.storageKey)
    private var storedTextSize = WorkspaceTextSizePreference.system.rawValue
    @AppStorage(WorkspaceCardDensityPreference.storageKey)
    private var storedCardDensity = WorkspaceCardDensityPreference.compact.rawValue
    @Environment(\.appLanguage) private var appLanguage

    private var textSize: WorkspaceTextSizePreference {
        WorkspaceTextSizePreference.stored(storedTextSize)
    }

    private var cardDensity: WorkspaceCardDensityPreference {
        WorkspaceCardDensityPreference.stored(storedCardDensity)
    }

    var body: some View {
        List {
            Section {
                DisplayPreferencePreview()
                    .environment(\.workspaceCardDensity, cardDensity)
                    .id(cardDensity)
            } header: {
                Text(appLanguage.text("Preview"))
            }

            Section {
                ForEach(WorkspaceTextSizePreference.allCases) { preference in
                    DisplayPreferenceRow(
                        title: preference.displayName(in: appLanguage),
                        isSelected: preference == textSize,
                        identifier: "text-size-\(preference.rawValue)"
                    ) {
                        storedTextSize = preference.rawValue
                    }
                }
            } header: {
                Text(appLanguage.text("Text size"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Relative to your iPhone text size. Accessibility sizes are never reduced."
                    )
                )
            }

            Section {
                ForEach(WorkspaceCardDensityPreference.allCases) { preference in
                    DisplayPreferenceRow(
                        title: preference.displayName(in: appLanguage),
                        isSelected: preference == cardDensity,
                        identifier: "card-density-\(preference.rawValue)"
                    ) {
                        storedCardDensity = preference.rawValue
                    }
                }
            } header: {
                Text(appLanguage.text("Card density"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Changes card spacing and avatar size without shrinking controls below their accessible target."
                    )
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(appLanguage.text("Display & text"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("display-settings")
    }
}

private struct DisplayPreferenceRow: View {
    @Environment(\.appLanguage) private var appLanguage

    let title: String
    let isSelected: Bool
    let identifier: String
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(spacing: 12) {
                Text(title)
                    .font(.body)
                    .foregroundStyle(Color.tsInk)
                Spacer(minLength: 12)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? Color.tsInk : Color.tsLine)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(
            appLanguage.text(isSelected ? "Selected" : "Not selected")
        )
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(identifier)
    }
}

private struct DisplayPreferencePreview: View {
    @Environment(\.workspaceCardDensity) private var density
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        HStack(spacing: 10) {
            AccountInitialsAvatar(
                label: appLanguage.text("Preview person"),
                size: density.personAvatarSize
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(appLanguage.text("Preview person"))
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                Text(appLanguage.text("Role · Pursuit"))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            Spacer(minLength: 8)
            Text(appLanguage.text("Now"))
                .font(.caption2)
                .foregroundStyle(Color.tsMutedInk)
        }
        .padding(density.cardPadding)
        .background(
            Color.tsCanvas,
            in: RoundedRectangle(
                cornerRadius: density.cardCornerRadius,
                style: .continuous
            )
        )
        .overlay {
            RoundedRectangle(
                cornerRadius: density.cardCornerRadius,
                style: .continuous
            )
            .stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(density.displayName(in: appLanguage))
        .accessibilityIdentifier("display-settings-preview")
    }
}

struct ActionButtonSetupView: View {
    @AppStorage(TalentSignalSetupPreference.actionButtonCompleteKey)
    private var isSetupComplete = false
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: "button.programmable")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(width: 44, height: 44)
                        .background(Color.tsCanvas, in: Circle())
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 5) {
                        Text(appLanguage.text("Fast capture, on your terms"))
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                        Text(
                            appLanguage.text(
                                "Talent Signal offers focused shortcuts for capture, review, and retrieval. Choosing one never confirms a fact or sends anything."
                            )
                        )
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 6)
            }

            Section {
                SettingsStepRow(
                    number: 1,
                    text: appLanguage.text(
                        "Open Settings and choose Action Button."
                    )
                )
                SettingsStepRow(
                    number: 2,
                    text: appLanguage.text(
                        "Swipe to Shortcut, then choose a shortcut."
                    )
                )
                SettingsStepRow(
                    number: 3,
                    text: appLanguage.text(
                        "Choose Talent Signal, then select the capture or review shortcut you want."
                    )
                )

                ShortcutsLink()
                    .shortcutsLinkStyle(.automaticOutline)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .accessibilityIdentifier("open-app-shortcuts")

                Button {
                    isSetupComplete.toggle()
                } label: {
                    Label(
                        appLanguage.text(
                            isSetupComplete
                                ? "Show setup reminder again"
                                : "I set up the Action Button"
                        ),
                        systemImage: isSetupComplete
                            ? "checkmark.circle.fill"
                            : "circle"
                    )
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.tsInk)
                .accessibilityIdentifier("confirm-action-button-setup")
            } header: {
                Text(appLanguage.text("Set up your iPhone"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Setup status is confirmed by you because iOS does not expose the current Action Button binding to this app."
                    )
                )
            }

            Section {
                SettingsExplanationRow(
                    systemImage: "sparkles",
                    title: appLanguage.text("Agent processing stays visible"),
                    detail: appLanguage.text(
                        "A Live Activity can show the trusted phase while you are away. When Actions are ready, review returns to the App."
                    )
                )
                SettingsExplanationRow(
                    systemImage: "rectangle.stack.badge.person.crop",
                    title: appLanguage.text("Actions stay reviewable"),
                    detail: appLanguage.text(
                        "Add contact, update contact, meetings, and follow-ups remain separate cards with evidence and an exact effect."
                    )
                )
#if DEBUG
                NavigationLink {
                    ResearchShowcaseView()
                } label: {
                    SettingsExplanationRow(
                        systemImage: "doc.text.magnifyingglass",
                        title: appLanguage.text("Open Synthetic Research Showcase"),
                        detail: appLanguage.text(
                            "Run the deterministic approved-page ActivityKit handoff and exact review deep link."
                        )
                    )
                }
                .accessibilityIdentifier("open-research-showcase")

                NavigationLink {
                    AgentWorkShowcaseView()
                } label: {
                    SettingsExplanationRow(
                        systemImage: "testtube.2",
                        title: appLanguage.text("Open Agent lifecycle demo"),
                        detail: appLanguage.text(
                            "Run the synthetic ActivityKit handoff from processing to action review."
                        )
                    )
                }
                .accessibilityIdentifier("open-agent-work-showcase")
#endif
            } header: {
                Text(appLanguage.text("Agent handoff"))
            } footer: {
                Text(
                    appLanguage.text(
                        "The Live Activity exposes phase and attention only. Candidate details and consequential controls stay inside Talent Signal."
                    )
                )
            }

            Section {
                SettingsExplanationRow(
                    systemImage: "waveform.badge.plus",
                    title: appLanguage.text("Capture Signal"),
                    detail: appLanguage.text(
                        "Choose text, photo, or foreground voice in the app."
                    )
                )
                SettingsExplanationRow(
                    systemImage: "mic",
                    title: appLanguage.text("Record Signal"),
                    detail: appLanguage.text(
                        "Open foreground recording; the microphone does not start automatically."
                    )
                )
                SettingsExplanationRow(
                    systemImage: "text.viewfinder",
                    title: appLanguage.text("Review screenshot"),
                    detail: appLanguage.text(
                        "Save one image locally for later text and identity review."
                    )
                )
            } header: {
                Text(appLanguage.text("Capture shortcuts"))
            }

            Section {
                SettingsExplanationRow(
                    systemImage: "checkmark.bubble",
                    title: appLanguage.text("Review Signal"),
                    detail: appLanguage.text(
                        "Open the latest pending Proposal for a human decision."
                    )
                )
                SettingsExplanationRow(
                    systemImage: "scope",
                    title: appLanguage.text("Open Pursuit"),
                    detail: appLanguage.text(
                        "Return to one stable Pursuit without recording a change."
                    )
                )
            } header: {
                Text(appLanguage.text("Review and retrieve"))
            }

            Section {
                SettingsExplanationRow(
                    systemImage: "lock.shield",
                    title: appLanguage.text("Safety boundary"),
                    detail: appLanguage.text(
                        "These shortcuts open or stage review. They do not confirm candidate facts, send messages, create meetings, or write to an ATS or CRM."
                    )
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(appLanguage.text("Action Button & Shortcuts"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("action-button-settings")
    }
}

struct AccountSettingsView: View {
    let isCanonical: Bool
    let workspaceID: String?
    let workspaceLabel: String?
    let accountName: String?
    let accountEmail: String?
    let signOutNotice: String?
    let onSignOut: (() async -> Bool)?

    @Environment(\.appLanguage) private var appLanguage
    @State private var isSigningOut = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    AccountInitialsAvatar(label: displayName, size: 48)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(displayName)
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                        Text(
                            appLanguage.text(
                                isCanonical
                                    ? "Canonical workspace"
                                    : "Synthetic preview"
                            )
                        )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    }
                }
                .padding(.vertical, 6)
            }

            Section {
                AccountValueRow(
                    label: appLanguage.text("Name"),
                    value: displayName
                )
                if let accountEmail {
                    AccountValueRow(
                        label: appLanguage.text("Email"),
                        value: accountEmail
                    )
                }
                AccountValueRow(
                    label: appLanguage.text("Workspace scope"),
                    value: workspaceLabel
                        ?? workspaceID
                        ?? appLanguage.text("Synthetic preview")
                )
            } header: {
                Text(appLanguage.text("Account details"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Account identity is read-only on this device."
                    )
                )
            }

            Section {
                SettingsExplanationRow(
                    systemImage: "lock.shield",
                    title: appLanguage.text("Privacy & approvals"),
                    detail: boundaryCopy
                )
                if let signOutNotice {
                    Label(signOutNotice, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .accessibilityIdentifier("sign-out-local-deletion-notice")
                }
            }

            if let onSignOut {
                Section {
                    Button(role: .destructive) {
                        guard !isSigningOut else { return }
                        isSigningOut = true
                        Task {
                            _ = await onSignOut()
                            isSigningOut = false
                        }
                    } label: {
                        HStack {
                            Label(
                                appLanguage.text("Sign out"),
                                systemImage: "rectangle.portrait.and.arrow.right"
                            )
                            Spacer()
                            if isSigningOut { ProgressView() }
                        }
                    }
                    .disabled(isSigningOut)
                    .accessibilityIdentifier("sign-out")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(appLanguage.text("Account"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("account-settings")
    }

    private var displayName: String {
        accountName ?? "Talent Signal"
    }

    private var boundaryCopy: String {
        if isCanonical {
            return appLanguage.text(
                "Relationship changes stay in account scope. Every external effect requires separate approval and verified readback."
            )
        }
        return appLanguage.text(
            "No candidate data is stored in this synthetic preview. Nothing shown here has execution authority."
        )
    }
}

struct ApprovalSettingsView: View {
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        List {
            Section {
                SettingsExplanationRow(
                    systemImage: "quote.bubble",
                    title: appLanguage.text("Evidence review"),
                    detail: appLanguage.text(
                        "Confirm or correct evidence before it becomes current relationship state."
                    )
                )
                SettingsExplanationRow(
                    systemImage: "hand.raised",
                    title: appLanguage.text("External actions"),
                    detail: appLanguage.text(
                        "Messages, meetings, contacts, notifications, ATS, and CRM writes require a separate exact-effect approval."
                    )
                )
                SettingsExplanationRow(
                    systemImage: "checkmark.seal",
                    title: appLanguage.text("Verified results"),
                    detail: appLanguage.text(
                        "A success state appears only after canonical readback confirms the result."
                    )
                )
            } header: {
                Text(appLanguage.text("Fixed product boundary"))
            } footer: {
                Text(
                    appLanguage.text(
                        "These safeguards cannot be disabled in settings."
                    )
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(appLanguage.text("Approval & data"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("approval-settings")
    }
}

struct CalendarSyncSettingsView: View {
    @AppStorage(CalendarSyncPreference.isEnabledKey)
    private var isCalendarSyncEnabled = true
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        List {
            Section {
                Toggle(
                    appLanguage.text("Sync confirmed events"),
                    isOn: $isCalendarSyncEnabled
                )
                .accessibilityIdentifier("calendar-sync-toggle")

                AccountValueRow(
                    label: appLanguage.text("Destination"),
                    value: appLanguage.text("Apple Calendar · default calendar")
                )
            } header: {
                Text(appLanguage.text("Calendar sync"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Talent Signal saves the event first, then syncs it one way. It never imports or rechecks Apple Calendar events."
                    )
                )
            }

            Section {
                SettingsExplanationRow(
                    systemImage: "arrow.up.forward.app",
                    title: appLanguage.text("Outbound only"),
                    detail: appLanguage.text(
                        "Turning sync off keeps new confirmed events in Talent Signal without changing Apple Calendar."
                    )
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(appLanguage.text("Calendar sync"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("calendar-sync-settings")
    }
}

struct AccountInitialsAvatar: View {
    let label: String
    let size: CGFloat

    private var initials: String {
        let initials = label.split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
        return initials.isEmpty ? "TS" : initials
    }

    var body: some View {
        Text(initials)
            .font(.custom("Georgia", size: size * 0.33, relativeTo: .body))
            .foregroundStyle(Color.tsInk)
            .frame(width: size, height: size)
            .background(Color.tsCanvas, in: Circle())
            .overlay { Circle().stroke(Color.tsLine, lineWidth: 1) }
            .accessibilityHidden(true)
    }
}

private struct AppLanguageOptionRow: View {
    let language: AppLanguage
    let interfaceLanguage: AppLanguage
    let isSelected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(language.displayName(in: interfaceLanguage))
                        .font(.body.weight(.medium))
                        .foregroundStyle(Color.tsInk)
                    Text(language.description(in: interfaceLanguage))
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 12)

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.body)
                    .foregroundStyle(isSelected ? Color.tsInk : Color.tsLine)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(language.displayName(in: interfaceLanguage))
        .accessibilityValue(
            isSelected
                ? interfaceLanguage.text("Selected")
                : interfaceLanguage.text("Not selected")
        )
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("language-option-\(language.rawValue)")
    }
}

private struct SettingsStepRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.tsInk)
                .frame(width: 26, height: 26)
                .background(Color.tsCanvas, in: Circle())
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: 26)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct SettingsExplanationRow: View {
    let systemImage: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: systemImage)
                .font(.body.weight(.medium))
                .foregroundStyle(Color.tsMutedInk)
                .frame(width: 28, height: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private struct AccountValueRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
            Spacer(minLength: 20)
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Color.tsInk)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }
}

#Preview("Language") {
    NavigationStack {
        AppSettingsView()
    }
    .environment(\.appLanguage, .english)
}

#Preview("Action Button") {
    NavigationStack {
        ActionButtonSetupView()
    }
    .environment(\.appLanguage, .english)
}

#Preview("Calendar sync") {
    NavigationStack {
        CalendarSyncSettingsView()
    }
    .environment(\.appLanguage, .english)
}
