import AppIntents
import SwiftUI

enum TalentSignalSetupPreference {
    static let actionButtonCompleteKey =
        "talent-signal.setup.action-button-complete"
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
                                "Talent Signal offers three focused shortcuts. Choosing one never confirms a fact or sends anything."
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
                Text(appLanguage.text("Available shortcuts"))
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
                        "Choose Talent Signal, then select Capture Signal, Record Signal, or Review screenshot."
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
