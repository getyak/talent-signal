import SwiftUI

@main
struct TalentSignalMacApp: App {
    @NSApplicationDelegateAdaptor(TalentSignalMacAppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel.bootstrap()

    private var isQuickPanelPreview: Bool {
        ProcessInfo.processInfo.arguments.contains("--quick-panel-preview")
    }

    var body: some Scene {
        Window("Talent Signal", id: "workspace") {
            ApplicationZoomContainer(enabled: model.isAccessibilityZoomPreview) {
                Group {
                    if isQuickPanelPreview {
                        QuickPanelView()
                            .frame(width: 560, height: 640)
                    } else {
                        RelationshipWorkspaceView()
                    }
                }
                    .environmentObject(model)
                    .environment(\.dynamicTypeSize, model.isAccessibilityZoomPreview ? .accessibility2 : .large)
                    .preferredColorScheme(model.isDarkAppearancePreview ? .dark : nil)
                    .task { await model.load() }
                    .background(SelectedTextServiceBridge().environmentObject(model))
            }
            .frame(
                minWidth: isQuickPanelPreview ? 520 : 1_020,
                minHeight: isQuickPanelPreview ? 580 : 680
            )
        }
        .defaultSize(
            width: isQuickPanelPreview ? 560 : 1_280,
            height: isQuickPanelPreview ? 640 : 820
        )
        .windowResizability(isQuickPanelPreview ? .contentSize : .automatic)
        .commands {
            TalentSignalCommands(model: model)
        }

        Window("Quick Panel", id: "quick-panel") {
            ApplicationZoomContainer(enabled: model.isAccessibilityZoomPreview) {
                QuickPanelView()
                    .environmentObject(model)
                    .environment(\.dynamicTypeSize, model.isAccessibilityZoomPreview ? .accessibility2 : .large)
                    .preferredColorScheme(model.isDarkAppearancePreview ? .dark : nil)
            }
            .frame(minWidth: 520, idealWidth: 560, minHeight: 580, idealHeight: 640)
        }
        .defaultSize(width: 560, height: 640)
        .windowResizability(.contentSize)

        MenuBarExtra {
            MenuBarPresenceView()
                .environmentObject(model)
        } label: {
            Label(
                model.isSignedOut ? "Signed out" : (model.isPaused ? "Paused" : model.mode.title),
                systemImage: model.isSignedOut ? "person.crop.circle.badge.xmark" : (model.isPaused ? "pause.circle" : model.mode.systemImage)
            )
        }
        .menuBarExtraStyle(.menu)
    }
}

private struct ApplicationZoomContainer<Content: View>: View {
    let enabled: Bool
    @ViewBuilder let content: Content

    var body: some View {
        GeometryReader { proxy in
            let scale = enabled ? 2.0 : 1.0
            content
                .frame(
                    width: proxy.size.width / scale,
                    height: proxy.size.height / scale,
                    alignment: .topLeading
                )
                .scaleEffect(scale, anchor: .topLeading)
        }
    }
}

private struct TalentSignalCommands: Commands {
    @Environment(\.openWindow) private var openWindow
    @ObservedObject var model: AppModel

    var body: some Commands {
        CommandMenu("Talent Signal") {
            Button("Open Quick Panel") {
                openWindow(id: "quick-panel")
            }
            .keyboardShortcut(.space, modifiers: [.command, .shift])

            Button("Open Today") {
                model.selectedNavigation = .today
                openWindow(id: "workspace")
            }
            .keyboardShortcut("1", modifiers: [.command, .shift])

            Button("Open Relationship Workspace") {
                model.selectedNavigation = .workspace
                openWindow(id: "workspace")
            }
            .keyboardShortcut("2", modifiers: [.command, .shift])

            Button("Open first relationship follow-up") {
                model.openFirstTodayAttentionFromKeyboard()
                openWindow(id: "workspace")
            }
            .keyboardShortcut(.downArrow, modifiers: [.command, .option])
            .disabled(model.selectedNavigation != .today || model.todayAttention.items.isEmpty)

            Button("Prepare current conversation next step") {
                model.prepareCurrentConversationNextStep()
                if model.errorMessage == nil {
                    openWindow(id: "quick-panel")
                }
            }
            .keyboardShortcut("n", modifiers: [.command, .option])
            .disabled(model.selectedNavigation != .today || !model.canPrepareCurrentConversationNextStep)

            Button("Review current proposed changes") {
                Task { await model.reviewFocusedTodayProposal() }
            }
            .keyboardShortcut("r", modifiers: [.command, .option])
            .disabled(
                model.focusedTodayAttentionItem?.kind != .proposalReview ||
                    model.focusedTodayAttentionItem?.proposalID == nil
            )

            Button("Set Up Selection Service…") {
                SelectionServiceSetup.openKeyboardShortcutSettings()
            }

            Divider()

            Button("Select first available relationship scope") {
                model.selectFirstRelationshipScopeFromKeyboard()
            }
            .keyboardShortcut("1", modifiers: [.command, .option])
            .disabled(model.scopeReviewStatus != .proposed || model.relationshipScopeOptions.isEmpty || model.selectedScopeOptionID != nil)

            Button("Confirm selected relationship scope") {
                Task { await model.confirmRelationshipScope() }
            }
            .keyboardShortcut("c", modifiers: [.command, .option])
            .disabled(model.scopeReviewStatus != .proposed || model.selectedScopeOptionID == nil)

            Button("Keep identity unresolved") {
                model.keepRelationshipScopeUnresolved()
            }
            .keyboardShortcut("u", modifiers: [.command, .option])
            .disabled(model.scopeReviewStatus != .proposed)

            Divider()

            Button("Attribute first unresolved source to candidate") {
                model.attributeFirstUnresolvedItemToCandidate()
            }
            .keyboardShortcut("a", modifiers: [.command, .shift])
            .disabled(model.capsule.items.first(where: { !$0.hasConfirmedAttribution }) == nil)

            Button("Confirm first pending source attribution") {
                model.confirmFirstPendingAttribution()
            }
            .keyboardShortcut("a", modifiers: [.command, .option, .shift])
            .disabled(model.capsule.items.first(where: {
                $0.actorKind != nil && !$0.hasConfirmedAttribution
            }) == nil)

            Divider()

            Button("Confirm next unreviewed proposal item") {
                model.decideNextCanonicalItem(.accept)
            }
            .keyboardShortcut("1", modifiers: [.command, .option, .shift])
            .disabled(model.pendingDecision?.items.first(where: { model.decisionSelections[$0.id] == nil }) == nil)

            Button("Reject next unreviewed proposal item") {
                model.decideNextCanonicalItem(.reject)
            }
            .keyboardShortcut("2", modifiers: [.command, .option, .shift])
            .disabled(model.pendingDecision?.items.first(where: { model.decisionSelections[$0.id] == nil }) == nil)

            Button("Keep next proposal item unresolved") {
                model.decideNextCanonicalItem(.keepUnresolved)
            }
            .keyboardShortcut("3", modifiers: [.command, .option, .shift])
            .disabled(model.pendingDecision?.items.first(where: { model.decisionSelections[$0.id] == nil }) == nil)

            Button("Save reviewed changes") {
                Task { await model.resolveCanonicalDecision() }
            }
            .keyboardShortcut(.return, modifiers: [.command, .option])
            .disabled(!model.canResolveCanonicalDecision)

            Divider()

            Button(model.isPaused ? "Resume context intake" : "Pause context intake") {
                model.togglePause()
            }
            .keyboardShortcut("p", modifiers: [.command, .option])
            .disabled(model.isSignedOut)

            Button("Stop and delete local intake") {
                model.stopContextIntake()
            }
            .keyboardShortcut("x", modifiers: [.command, .option])
            .disabled(model.isSignedOut || model.isPaused || (model.capsule.items.isEmpty && model.mode != .working))

            Button("Clear local context") {
                model.clearLocalContext()
            }
            .keyboardShortcut(.delete, modifiers: [.command, .option])
            .disabled(model.capsule.items.isEmpty)

            Divider()

            Button(model.isAccessibilityZoomPreview ? "End 200% text preview" : "Preview 200% text") {
                model.toggleAccessibilityZoomPreview()
            }
            .keyboardShortcut("0", modifiers: [.command, .option])
            .disabled(!model.isSyntheticFixture)

            Button(model.isReducedMotionPreview ? "End Reduced Motion preview" : "Preview Reduced Motion") {
                model.toggleReducedMotionPreview()
            }
            .keyboardShortcut("9", modifiers: [.command, .option])
            .disabled(!model.isSyntheticFixture)
        }
    }
}
