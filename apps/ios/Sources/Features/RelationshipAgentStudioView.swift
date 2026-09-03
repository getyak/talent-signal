import SwiftUI

enum TalentSignalAgentPreference {
    static let aliasKey = "talent-signal.agent.alias"
    static let linkedInURLKey = "talent-signal.agent.linkedin-url"
}

@MainActor
struct RelationshipAgentStudioView: View {
    let isCanonical: Bool
    let workspaceID: String?
    let workspaceLabel: String?
    let accountName: String?
    let accountEmail: String?
    let proposals: [WorkspaceProposal]
    let signOutNotice: String?
    let onOpenProposal: (WorkspaceProposal) -> Void
    let onSignOut: (() async -> Bool)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var appLanguage
    @AppStorage(TalentSignalAgentPreference.aliasKey)
    private var storedAlias = "Signal"
    @AppStorage(TalentSignalAgentPreference.linkedInURLKey)
    private var linkedInURL = ""
    @AppStorage(TalentSignalSetupPreference.actionButtonCompleteKey)
    private var isActionButtonSetupComplete = false
    @AppStorage(CalendarSyncPreference.isEnabledKey)
    private var isCalendarSyncEnabled = true
    @State private var showsWorkspaceMenu = false

    private var sourceSummary: String {
        var parts: [String] = []
        if !linkedInURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(appLanguage.text("LinkedIn reference added"))
        }
        if isActionButtonSetupComplete {
            parts.append(appLanguage.text("Shortcut ready"))
        }
        if parts.isEmpty {
            return appLanguage.text("Choose one source to begin")
        }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    identityHeader
                    destinationList
                    approvalBoundary
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 36)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(appLanguage.text("Agent"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "arrow.left")
                    }
                    .accessibilityLabel(appLanguage.text("Close Agent"))
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showsWorkspaceMenu = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel(appLanguage.text("Open workspace settings"))
                    .accessibilityIdentifier("agent-settings")
                }
            }
            .sheet(isPresented: $showsWorkspaceMenu) {
                RelationshipMenuView(
                    isCanonical: isCanonical,
                    workspaceID: workspaceID,
                    workspaceLabel: workspaceLabel,
                    accountName: accountName,
                    accountEmail: accountEmail,
                    proposals: proposals,
                    signOutNotice: signOutNotice,
                    onOpenProposal: { proposal in
                        showsWorkspaceMenu = false
                        Task { @MainActor in
                            await Task.yield()
                            onOpenProposal(proposal)
                        }
                    },
                    onSignOut: onSignOut
                )
            }
        }
        .tint(.tsInk)
        .accessibilityIdentifier("agent-studio")
    }

    private var identityHeader: some View {
        HStack(alignment: .center, spacing: 16) {
            RelationshipSignalOrb()
                .frame(width: 58, height: 58)
                .padding(11)
                .background(Color.tsCanvas, in: Circle())
                .overlay {
                    Circle().stroke(Color.tsLine, lineWidth: 1)
                }

            VStack(alignment: .leading, spacing: 5) {
                Text(appLanguage.text("YOUR AGENT"))
                    .font(.caption2.weight(.semibold))
                    .tracking(1.2)
                    .foregroundStyle(Color.tsMutedInk)

                TextField(appLanguage.text("Agent display name"), text: $storedAlias)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .font(.custom("Georgia", size: 32, relativeTo: .title))
                    .foregroundStyle(Color.tsInk)
                    .accessibilityLabel(appLanguage.text("Agent display name"))
                    .accessibilityIdentifier("agent-alias")

                Text(appLanguage.text("Turns captured signals into reviewable relationship work."))
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 2)
    }

    private var destinationList: some View {
        VStack(spacing: 0) {
            NavigationLink {
                AgentMemoryOverviewView()
            } label: {
                AgentDestinationRow(
                    systemImage: "brain.head.profile",
                    title: appLanguage.text("Memory"),
                    detail: appLanguage.text("Reviewed relationship context only"),
                    status: appLanguage.text("Scoped"),
                    tone: .active
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("agent-open-memory")

            AgentRowDivider()

            NavigationLink {
                AccountSettingsView(
                    isCanonical: isCanonical,
                    workspaceID: workspaceID,
                    workspaceLabel: workspaceLabel,
                    accountName: accountName,
                    accountEmail: accountEmail,
                    signOutNotice: signOutNotice,
                    onSignOut: onSignOut
                )
            } label: {
                AgentDestinationRow(
                    systemImage: "person.crop.circle",
                    title: appLanguage.text("About you"),
                    detail: accountName ?? appLanguage.text("Account and workspace identity"),
                    status: nil,
                    tone: .muted
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("agent-open-profile")

            AgentRowDivider()

            NavigationLink {
                AgentSourceSettingsView(
                    linkedInURL: $linkedInURL,
                    isActionButtonSetupComplete: isActionButtonSetupComplete,
                    isCalendarSyncEnabled: isCalendarSyncEnabled
                )
            } label: {
                AgentDestinationRow(
                    systemImage: "arrow.down.doc",
                    title: appLanguage.text("Sources & imports"),
                    detail: sourceSummary,
                    status: nil,
                    tone: .muted
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("agent-open-sources")

            AgentRowDivider()

            NavigationLink {
                ApprovalSettingsView()
            } label: {
                AgentDestinationRow(
                    systemImage: "hand.raised",
                    title: appLanguage.text("Action permissions"),
                    detail: appLanguage.text(
                        "Contact, calendar, message, and CRM writes ask first"
                    ),
                    status: appLanguage.text("Approval"),
                    tone: .review
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("agent-open-permissions")
        }
        .padding(.horizontal, 17)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 24))
        .overlay {
            RoundedRectangle(cornerRadius: 24)
                .stroke(Color.tsLine, lineWidth: 1)
        }
    }

    private var approvalBoundary: some View {
        Label {
            Text(
                appLanguage.text(
                    "The Agent can find, interpret, and prepare. You confirm every consequential change."
                )
            )
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "lock.shield")
                .foregroundStyle(Color.tsMutedInk)
        }
        .padding(.horizontal, 4)
    }
}

private struct AgentMemoryOverviewView: View {
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        List {
            Section {
                AgentCapabilityRow(
                    title: appLanguage.text("Relationship context"),
                    detail: appLanguage.text(
                        "The Agent can use reviewed People and relationship evidence only when the current task brings that person into scope."
                    ),
                    status: appLanguage.text("Available"),
                    tone: .active
                )

                AgentCapabilityRow(
                    title: appLanguage.text("Personal memory"),
                    detail: appLanguage.text(
                        "A reviewable personal-memory registry is not connected yet. No local switch pretends to change Agent behavior."
                    ),
                    status: appLanguage.text("Not available"),
                    tone: .muted
                )

                AgentCapabilityRow(
                    title: appLanguage.text("Derived patterns"),
                    detail: appLanguage.text(
                        "Habit and preference patterns will stay proposed until their source, scope, and deletion path are visible."
                    ),
                    status: appLanguage.text("Planned"),
                    tone: .muted
                )
            } header: {
                Text(appLanguage.text("Memory scope"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Memory can shape a proposal. It can never authorize an external action."
                    )
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(appLanguage.text("Memory"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("agent-memory")
    }
}

private struct AgentSourceSettingsView: View {
    @Binding var linkedInURL: String
    let isActionButtonSetupComplete: Bool
    let isCalendarSyncEnabled: Bool

    @Environment(\.appLanguage) private var appLanguage

    private var hasLinkedInReference: Bool {
        !linkedInURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        List {
            Section {
                TextField(
                    appLanguage.text("LinkedIn profile URL"),
                    text: $linkedInURL
                )
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .autocorrectionDisabled()
                .accessibilityIdentifier("agent-linkedin-url")

                AgentCapabilityRow(
                    title: appLanguage.text("Profile reference"),
                    detail: appLanguage.text(
                        "A link helps identify your profile. It does not grant account access or background sync."
                    ),
                    status: hasLinkedInReference
                        ? appLanguage.text("Added")
                        : appLanguage.text("Not added"),
                    tone: hasLinkedInReference ? .active : .muted
                )

                if hasLinkedInReference {
                    Button(role: .destructive) {
                        linkedInURL = ""
                    } label: {
                        Label(
                            appLanguage.text("Clear profile reference"),
                            systemImage: "trash"
                        )
                    }
                    .accessibilityIdentifier("agent-clear-linkedin-url")
                }
            } header: {
                Text(appLanguage.text("LinkedIn"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Kept as an app preference until you clear it. It is never account authorization."
                    )
                )
            }

            Section {
                NavigationLink {
                    ActionButtonSetupView()
                } label: {
                    AgentCapabilityRow(
                        title: appLanguage.text("Action Button & Shortcuts"),
                        detail: appLanguage.text(
                            "Stages a selected screenshot for ordinary review."
                        ),
                        status: isActionButtonSetupComplete
                            ? appLanguage.text("Ready")
                            : appLanguage.text("Set up"),
                        tone: isActionButtonSetupComplete ? .active : .review
                    )
                }
                .accessibilityIdentifier("agent-open-action-button")

                NavigationLink {
                    CalendarSyncSettingsView()
                } label: {
                    AgentCapabilityRow(
                        title: appLanguage.text("Apple Calendar"),
                        detail: appLanguage.text(
                            "One-way projection of confirmed events; each write stays reviewable."
                        ),
                        status: isCalendarSyncEnabled
                            ? appLanguage.text("Projection on")
                            : appLanguage.text("Projection off"),
                        tone: isCalendarSyncEnabled ? .active : .muted
                    )
                }
                .accessibilityIdentifier("agent-open-calendar")
            } header: {
                Text(appLanguage.text("Available now"))
            }

            Section {
                AgentCapabilityRow(
                    title: appLanguage.text("LinkedIn connections archive"),
                    detail: appLanguage.text(
                        "Planned as a one-time, member-exported file with duplicate review."
                    ),
                    status: appLanguage.text("Planned"),
                    tone: .muted
                )

                AgentCapabilityRow(
                    title: appLanguage.text("Contacts, vCard & CSV"),
                    detail: appLanguage.text(
                        "Planned with field mapping, identity review, partial retry, and an import receipt."
                    ),
                    status: appLanguage.text("Planned"),
                    tone: .muted
                )
            } header: {
                Text(appLanguage.text("Import support"))
            } footer: {
                Text(
                    appLanguage.text(
                        "Planned sources are shown for capability clarity. They cannot be opened or mistaken for live connections."
                    )
                )
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(appLanguage.text("Sources & imports"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("agent-sources")
    }
}

private enum AgentStatusTone {
    case active
    case review
    case muted

    var foreground: Color {
        switch self {
        case .active:
            return .tsConfirmed
        case .review:
            return .tsVermilion
        case .muted:
            return .tsMutedInk
        }
    }

    var background: Color {
        switch self {
        case .active:
            return .tsConfirmed.opacity(0.12)
        case .review:
            return .tsVermilion.opacity(0.12)
        case .muted:
            return .tsSurfaceMuted
        }
    }
}

private struct AgentDestinationRow: View {
    let systemImage: String
    let title: String
    let detail: String
    let status: String?
    let tone: AgentStatusTone

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Color.tsInk)
                .frame(width: 30, height: 30)
                .background(Color.tsSurfaceMuted, in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.tsInk)

                    Spacer(minLength: 4)

                    if let status {
                        Text(status)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(tone.foreground)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(tone.background, in: Capsule())
                    }
                }

                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(2)
            }

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
        }
        .padding(.vertical, 15)
        .contentShape(Rectangle())
    }
}

private struct AgentCapabilityRow: View {
    let title: String
    let detail: String
    let status: String
    let tone: AgentStatusTone

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)

                Spacer(minLength: 8)

                Text(status)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(tone.foreground)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tone.background, in: Capsule())
            }

            Text(detail)
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
    }
}

private struct AgentRowDivider: View {
    var body: some View {
        Divider()
            .overlay(Color.tsLine)
            .padding(.leading, 44)
    }
}
