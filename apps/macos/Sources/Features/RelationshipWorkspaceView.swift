import SwiftUI

struct RelationshipWorkspaceView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            if model.isSyntheticFixture { SyntheticFixtureBanner() }

            NavigationSplitView {
                List(NavigationDestination.allCases, selection: $model.selectedNavigation) { item in
                    Label(item.rawValue, systemImage: item.icon)
                        .tag(item)
                        .accessibilityIdentifier("navigation.\(item.rawValue.replacingOccurrences(of: " ", with: "-"))")
                }
                .listStyle(.sidebar)
                .frame(minWidth: 190)
                .navigationTitle("Talent Signal")
                .safeAreaInset(edge: .bottom) {
                    IntakeControl()
                        .padding(10)
                }
                .accessibilityIdentifier("workspace.navigation")
            } detail: {
                Group {
                    switch model.selectedNavigation ?? .workspace {
                    case .actionCenter:
                        ActionCenterView()
                    case .workspace:
                        RelationshipDetailView()
                    }
                }
                .background(TSBrand.canvas.opacity(0.62))
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 250)
        }
        .animation((reduceMotion || model.isReducedMotionPreview) ? nil : .easeInOut(duration: 0.18), value: model.mode)
        .toolbar {
            ToolbarItemGroup {
                StatusPill()
                if model.isSyntheticFixture {
                    Menu("Fixture state", systemImage: "testtube.2") {
                        ForEach(WorkspaceMode.allCases) { state in
                            Button(state.title) { model.selectFixtureState(state) }
                                .accessibilityIdentifier("fixture.state.\(state.rawValue)")
                        }
                    }
                    .accessibilityIdentifier("fixture.stateMenu")
                }
            }
        }
        .accessibilityIdentifier("workspace.root")
    }
}

private struct IntakeControl: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: model.isPaused ? "pause.circle.fill" : "lock.open")
                Text(model.isPaused ? "Context intake paused" : "Manual intake")
                    .font(.caption.weight(.semibold))
            }
            Button(model.isPaused ? "Resume intake" : "Pause intake") {
                model.togglePause()
            }
            .buttonStyle(.borderless)
            .keyboardShortcut("p", modifiers: [.command, .option])
            .accessibilityIdentifier("intake.pause")

            Button("Stop and delete local intake", role: .destructive) {
                model.stopContextIntake()
            }
            .buttonStyle(.borderless)
            .disabled(model.isSignedOut || model.isPaused || (model.capsule.items.isEmpty && model.mode != .working))
            .accessibilityHint("Stops only local context intake and deletes unsubmitted local Capsule items; it does not cancel a canonical Task")
            .accessibilityIdentifier("intake.stop")

            Button("Clear local context", role: .destructive) {
                model.clearLocalContext()
            }
            .buttonStyle(.borderless)
            .disabled(model.capsule.items.isEmpty)
            .accessibilityIdentifier("intake.clear")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct StatusPill: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Label(model.isPaused ? "Paused" : model.mode.title, systemImage: model.isPaused ? "pause.circle" : model.mode.systemImage)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Color.secondary.opacity(0.1), in: Capsule())
            .accessibilityIdentifier("workspace.state")
    }
}

private struct RelationshipDetailView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                RelationshipHeader()
                if model.scopeReviewStatus == .proposed {
                    RelationshipScopeReviewView()
                }
                StateContentView()
                if let runAudit = model.runAudit {
                    RunBoundaryView(run: runAudit)
                }
                Divider()
                ContextCapsuleView(compact: false)
            }
            .frame(maxWidth: 920, alignment: .leading)
            .padding(.horizontal, 36)
            .padding(.vertical, 30)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .navigationTitle("Relationship Workspace")
        .accessibilityIdentifier("workspace.relationship")
    }
}

private struct RunBoundaryView: View {
    let run: RunAuditSummary
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 9) {
                Text(run.objective)
                    .font(.callout)
                LabeledContent("Context") {
                    Text("\(run.evidenceFragmentIDs.count) pinned evidence fragment(s) · digest \(run.evidenceManifestDigest.prefix(12))…")
                }
                LabeledContent("Budget") {
                    Text("\(run.maxTurns) turns · \(run.maxToolCalls) tool calls · \(run.maxDurationMilliseconds) ms · \(run.maxTaskTokens) tokens · ≤ $\(run.maximumEstimatedUSD, format: .number.precision(.fractionLength(2)))")
                }
                LabeledContent("Eligible capabilities") {
                    Text(run.eligibleCapabilities.joined(separator: ", "))
                }
                LabeledContent("Source authority") {
                    Text("\(run.sourceAccessState) · \(run.sourceAuthorizationState)\(run.sourceAuthorizationExpiresAt.map { " · expires \($0)" } ?? "")")
                }
                LabeledContent("External effects") {
                    Text("\(run.externalEffects.count)")
                }
                Text("Run \(run.runID)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            .padding(.top, 10)
        } label: {
            Label("Bounded Run history", systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                .font(.headline)
        }
        .padding(16)
        .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.18)))
        .accessibilityIdentifier("run.boundary")
    }
}

private struct RelationshipHeader: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: model.presentation.pursuitTitle)
            Text(model.presentation.candidateName)
                .font(.title2.weight(.semibold))
                .foregroundStyle(TSBrand.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("workspace.candidateName")
            Text(model.presentation.relationshipContext)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if !model.identityTags.isEmpty {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 7) { identityTags }
                    VStack(alignment: .leading, spacing: 6) { identityTags }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("workspace.identityTags")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("workspace.title")
    }

    @ViewBuilder
    private var identityTags: some View {
        ForEach(model.identityTags, id: \.self) { tag in
            Text(tag)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.secondary.opacity(0.09), in: Capsule())
        }
    }
}

private struct StateContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            switch model.mode {
            case .empty:
                if model.isSignedOut {
                    CalmStateView(
                        icon: "person.crop.circle.badge.xmark",
                        title: "Signed out and local recovery cleared",
                        body: model.deletionReceipt ?? "The session ended and no prior relationship content remains available in this window."
                    )
                } else {
                    CalmStateView(
                        icon: "viewfinder",
                        title: "Choose the context aperture",
                        body: "Nothing is being monitored. Add selected text or a file below, then review exactly what may leave this Mac."
                    )
                }
            case .ready:
                if model.capsule.items.isEmpty {
                    CalmStateView(
                        icon: "hand.raised",
                        title: "Connected, with no submitted context",
                        body: "The relationship scope is ready. Add one explicit source below; opening Talent Signal did not capture another app."
                    )
                } else {
                    ReadyStateView()
                }
            case .working:
                CalmStateView(
                    icon: "hourglass",
                    title: "Working within the reviewed Capsule",
                    body: "The task cannot gain newly added context. You can pause intake or keep working elsewhere while the canonical status is checked."
                ) {
                    ProgressView().controlSize(.small)
                }
            case .needsDecision:
                if model.pendingDecision != nil {
                    CanonicalDecisionView()
                } else {
                    EvidenceDecisionView()
                }
            case .noAction:
                NoActionResultView()
            case .receipt:
                CanonicalReceiptView()
            case .clarification:
                ClarificationView()
            case .ambiguousIdentity:
                AmbiguousIdentityView()
            case .identityReviewSaved:
                IdentityReviewSavedView()
            case .stale:
                CalmStateView(
                    icon: "clock.arrow.circlepath",
                    title: "The source or Pursuit changed",
                    body: "This proposal no longer has current authority. Review the changed evidence and create a new immutable Task version before deciding."
                )
            case .failed:
                VStack(alignment: .leading, spacing: 12) {
                    CalmStateView(
                        icon: "exclamationmark.triangle",
                        title: "The task failed without changing relationship state",
                        body: model.errorMessage ?? "Keep the Capsule local and inspect the failure. No automatic retry is authorized."
                    )
                    Button("Review local Capsule — no retry", systemImage: "arrow.left") {
                        model.returnToCapsuleAfterFailure()
                    }
                    .accessibilityHint("Returns to local review without creating a Task, decision, or external effect")
                    .accessibilityIdentifier("failure.reviewCapsule")
                }
            case .outcomeUnknown:
                VStack(alignment: .leading, spacing: 12) {
                    CalmStateView(
                        icon: "questionmark.circle",
                        title: "Outcome unknown",
                        body: "Do not retry yet. Reconcile the original operation ID and canonical readback so the same intent cannot create duplicate work."
                    )
                    Button("Reconcile original operation", systemImage: "arrow.triangle.2.circlepath") {
                        Task { await model.reconcileCanonicalDecision() }
                    }
                    .accessibilityIdentifier("canonical.reconcile")
                }
            case .deleted:
                CalmStateView(
                    icon: "trash",
                    title: "Local context deleted",
                    body: model.deletionReceipt ?? "Local Capsule derivatives were cleared. Canonical history, if any, was not silently rewritten."
                )
            }
        }
    }
}

private struct NoActionResultView: View {
    @EnvironmentObject private var model: AppModel

    private var continuingOwnedAction: ActionProjection? {
        model.presentation.actionProjections.first {
            $0.authority.contains("Existing owned action")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 7) {
                SectionLabel(text: "First response")
                Label(
                    continuingOwnedAction == nil
                        ? "No new action is the useful result"
                        : "No duplicate action was created",
                    systemImage: "checkmark.circle"
                )
                .font(.title3.weight(.semibold))
                Text(model.presentation.changedSummary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("noAction.summary")
                Text(model.presentation.dependency)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("noAction.dependency")
            }

            VStack(alignment: .leading, spacing: 7) {
                SectionLabel(text: "Exact reviewed evidence")
                Text(model.presentation.evidenceQuote)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("noAction.evidence")
                Text(model.presentation.evidenceSource)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.18)))

            if let action = continuingOwnedAction {
                VStack(alignment: .leading, spacing: 7) {
                    SectionLabel(text: "Continue the existing owned action")
                    Text(action.objectName)
                        .font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("noAction.ownedAction.title")
                    Text(action.consequence)
                        .font(.callout)
                    Text(action.authority)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Next: \(action.nextOperation)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Open canonical Task and evidence") {
                        Task { await model.openActionProjection(action) }
                    }
                    .accessibilityIdentifier("noAction.ownedAction.open")
                }
                .padding(16)
                .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.18)))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("noAction.ownedAction")
            } else {
                Text(model.presentation.proposal)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Label(
                "No message, calendar event, or duplicate recruiter task was created.",
                systemImage: "hand.raised"
            )
            .font(.callout.weight(.medium))
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("noAction.noExternalEffect")
        }
        .accessibilityIdentifier("noAction.result")
    }
}

private struct ClarificationView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 7) {
                SectionLabel(text: "Exact clarification required")
                Text("Confirm time before any meeting action")
                    .font(.title3.weight(.semibold))
                Text(model.presentation.proposal)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("clarification.question")
                Text(model.presentation.dependency)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("clarification.reason")
            }

            Label("No calendar write or message send occurred.", systemImage: "hand.raised")
                .font(.callout.weight(.medium))
                .foregroundStyle(.secondary)

            Text("Add the exact date, timezone, duration, and meeting consent to a new reviewed Capsule. The current Task has no authority to infer them.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }
}

private struct CanonicalDecisionView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let review = model.pendingDecision {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 7) {
                    SectionLabel(text: model.isSyntheticFixture ? "Synthetic decision bundle fixture" : "Canonical decision bundle")
                    Text(review.summary)
                        .font(.title3.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(review.dependency)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Expires \(review.expiresAt) · bound to Pursuit revision \(review.baseRevision)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                ForEach(review.evidence) { evidence in
                    VStack(alignment: .leading, spacing: 7) {
                        SectionLabel(text: "Exact reviewed evidence")
                        Text(evidence.text)
                            .textSelection(.enabled)
                            .accessibilityIdentifier("canonical.evidence.\(evidence.id)")
                        Text("\(evidence.source) · \(evidence.observedAt)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Attributed actor: \(evidence.attributedActor) · attribution: \(evidence.attributionStatus) · review: \(evidence.reviewStatus)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.18)))
                }

                ForEach(review.items) { item in
                    CanonicalProposalItemView(item: item)
                }

                HStack(alignment: .center, spacing: 12) {
                    Button("Resolve reviewed decision", systemImage: "checkmark.seal") {
                        Task { await model.resolveCanonicalDecision() }
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .disabled(!model.canResolveCanonicalDecision)
                    .accessibilityHint("Atomically resolves the Agent Decision Bundle and returns a canonical Pursuit receipt. It performs no external effect.")
                    .accessibilityIdentifier("canonical.resolve")

                    Text("No message, calendar event, purchase, deletion, or other external effect is authorized.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

private struct CanonicalProposalItemView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AccessibilityFocusState private var accessibilityFocusedChoice: CanonicalDecisionChoice?
    let item: CanonicalProposalReview.Item

    private var selection: Binding<CanonicalDecisionChoice?> {
        Binding(
            get: { model.decisionSelections[item.id] },
            set: { choice in
                if let choice { model.setDecision(itemID: item.id, choice: choice) }
            }
        )
    }

    private var humanReadableKey: String {
        item.key
            .replacingOccurrences(of: ":", with: " · ")
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    SectionLabel(text: item.changeKind.replacingOccurrences(of: "_", with: " "))
                    Text(humanReadableKey)
                        .font(.headline)
                }
                Spacer()
                Text("Evidence \(item.evidenceAvailability)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(TSBrand.evidence)
            }

            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 14) {
                    DecisionValueColumn(label: "Before", value: item.beforeValue)
                    Image(systemName: "arrow.down")
                        .foregroundStyle(.secondary)
                    DecisionValueColumn(label: "Proposed", value: item.proposedValue)
                }
            } else {
                HStack(alignment: .top, spacing: 0) {
                    DecisionValueColumn(label: "Before", value: item.beforeValue)
                    Image(systemName: "arrow.right")
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.top, 23)
                    DecisionValueColumn(label: "Proposed", value: item.proposedValue)
                }
            }

            Text(item.reason)
                .font(.callout)
            Text("Effect: \(item.effectSummary)")
                .font(.callout.weight(.medium))
            Text("Epistemic status: \(item.epistemicStatus) · \(item.evidenceRefs.count) evidence reference(s)")
                .font(.caption)
                .foregroundStyle(.secondary)

            Label("Decision context reviewed in order", systemImage: "ear.badge.checkmark")
                .font(.caption.weight(.semibold))
                .foregroundStyle(TSBrand.evidence)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(decisionContextAccessibilityLabel)
                .accessibilityHint("The decision control follows this context. No choice is preselected.")
                .accessibilityIdentifier("canonical.decisionContext.\(item.id)")

            VStack(alignment: .leading, spacing: 7) {
                Text("Decision")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                HStack(spacing: 7) {
                    ForEach(CanonicalDecisionChoice.allCases) { choice in
                        let isSelected = selection.wrappedValue == choice
                        Button {
                            selection.wrappedValue = choice
                        } label: {
                            Text(choice.title)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .padding(.horizontal, 10)
                                .background(
                                    isSelected ? Color.accentColor : Color.secondary.opacity(0.10),
                                    in: RoundedRectangle(cornerRadius: 7)
                                )
                                .foregroundStyle(isSelected ? Color.white : Color.primary)
                        }
                        .buttonStyle(.plain)
                        // The actionable element owns the entire ordered
                        // consequence. A segmented Picker can expose this in
                        // an AX snapshot while VoiceOver still lands on an
                        // anonymous toggle segment at runtime.
                        .accessibilityLabel("\(decisionContextAccessibilityLabel). Choice \(choice.title)")
                        .accessibilityValue(isSelected ? "Selected" : "Not selected")
                        .accessibilityHint("Selects \(choice.title) for \(humanReadableKey). The decision is not submitted until Resolve reviewed decision is activated.")
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                        .accessibilityFocused($accessibilityFocusedChoice, equals: choice)
                        .accessibilityIdentifier("canonical.choice.\(choice.rawValue).\(item.id)")
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("canonical.decision.\(item.id)")
            .task {
                guard
                    ProcessInfo.processInfo.arguments.contains("--ui-testing"),
                    ProcessInfo.processInfo.arguments.contains("--voiceover-focus-decision")
                else { return }
                // The runtime probe moves the real VoiceOver cursor onto the
                // same actionable element verified by the keyboard journey.
                // It does not select or submit a choice.
                try? await Task.sleep(for: .milliseconds(800))
                accessibilityFocusedChoice = .accept
            }
        }
        .padding(16)
        .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.18)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("canonical.item.\(item.id)")
    }

    private var decisionContextAccessibilityLabel: String {
        let review = model.pendingDecision
        let evidence = review?.evidence
            .filter { item.evidenceRefs.contains($0.id) }
            .map { "\($0.attributedActor) \($0.attributionStatus): \($0.text)" }
            .joined(separator: "; ") ?? "Evidence unavailable"
        return [
            "Identity \(accessibleIdentitySummary)",
            "Relationship \(accessibleRelationshipSummary)",
            "Claim \(decisionClaimSummary)",
            "Uncertainty \(item.epistemicStatus); evidence \(item.evidenceAvailability)",
            "Evidence \(evidence)",
            "Consequence \(decisionConsequenceSummary)"
        ].joined(separator: ". ")
    }

    private var accessibleIdentitySummary: String {
        model.presentation.candidateName
            .components(separatedBy: " — ")
            .first ?? model.presentation.candidateName
    }

    private var accessibleRelationshipSummary: String {
        let fullRelationship = model.presentation.relationshipContext
            .components(separatedBy: " · identity")
            .first ?? model.presentation.relationshipContext
        let role = fullRelationship
            .components(separatedBy: " in this Pursuit")
            .first ?? fullRelationship
        let pursuit = model.presentation.pursuitTitle
            .replacingOccurrences(of: " · ", with: " ")
            .replacingOccurrences(of: " platform ", with: " ")
        return "\(role); \(pursuit)"
    }

    private var decisionClaimSummary: String {
        let fields = item.proposedValue.components(separatedBy: " · ")
        if let title = fields.first(where: {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .hasPrefix("title:")
        }), let separator = title.firstIndex(of: ":") {
            return String(title[title.index(after: separator)...])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return humanReadableKey
    }

    private var decisionConsequenceSummary: String {
        item.effectSummary
            .replacingOccurrences(of: "Would add one ", with: "Add ")
            .replacingOccurrences(of: " for human review only", with: "; review only")
    }
}

private struct DecisionValueColumn: View {
    let label: String
    let value: String

    private var lines: [String] {
        value.components(separatedBy: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            SectionLabel(text: label)
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    if lines.count > 1 {
                        Circle()
                            .fill(TSBrand.evidence.opacity(0.72))
                            .frame(width: 4, height: 4)
                    }
                    Text(line)
                        .font(.body.weight(index == 0 ? .semibold : .regular))
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct IdentityReviewSavedView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let receipt = model.identityReviewReceipt {
            VStack(alignment: .leading, spacing: 10) {
                Label("Identity remains unresolved", systemImage: "person.crop.circle.badge.checkmark")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(TSBrand.evidence)
                    .accessibilityIdentifier("identity.unresolvedReceipt")
                Text(receipt.summary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Review receipt \(receipt.id)\(receipt.taskID.map { " · canonical task \($0)" } ?? "")")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                Text("This receipt records a non-binding review outcome. It is not a Person match, fact confirmation, or action approval.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(18)
            .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(TSBrand.evidence.opacity(0.36)))
        } else {
            CalmStateView(
                icon: "exclamationmark.triangle",
                title: "Identity review receipt unavailable",
                body: "No person has been bound. Return to the unresolved review before continuing."
            )
        }
    }
}

private struct CanonicalReceiptView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if let receipt = model.canonicalReceipt {
            VStack(alignment: .leading, spacing: 16) {
                Label("Canonical receipt verified", systemImage: "checkmark.seal.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(TSBrand.evidence)
                    .accessibilityIdentifier("canonical.receipt")
                Text(receipt.summary)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)

                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 12) {
                        ReceiptDatum(label: "Outcome", value: receipt.outcome.replacingOccurrences(of: "_", with: " "))
                        ReceiptDatum(label: "Pursuit revision", value: "\(receipt.beforeRevision) → \(receipt.afterRevision)")
                        ReceiptDatum(label: "External effects", value: "\(receipt.externalEffects.count)")
                    }
                } else {
                    HStack(spacing: 24) {
                        ReceiptDatum(label: "Outcome", value: receipt.outcome.replacingOccurrences(of: "_", with: " "))
                        ReceiptDatum(label: "Pursuit revision", value: "\(receipt.beforeRevision) → \(receipt.afterRevision)")
                        ReceiptDatum(label: "External effects", value: "\(receipt.externalEffects.count)")
                    }
                }

                if !receipt.changedFields.isEmpty {
                    Text("Changed fields: \(receipt.changedFields.joined(separator: ", "))")
                        .font(.callout)
                }
                Text("Receipt \(receipt.id) · operation \(receipt.operationID) · \(receipt.occurredAt)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)

                Divider()
                LocalDraftHandoffView()
            }
            .padding(18)
            .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(TSBrand.evidence.opacity(0.36)))
        } else {
            CalmStateView(
                icon: "exclamationmark.triangle",
                title: "Receipt unavailable",
                body: "The interface will not claim success until the canonical receipt can be read back."
            )
        }
    }
}

private struct ReceiptDatum: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel(text: label)
            Text(value).font(.headline.monospacedDigit())
        }
    }
}

private struct CalmStateView<Accessory: View>: View {
    let icon: String
    let title: String
    let bodyText: String
    @ViewBuilder let accessory: Accessory

    init(icon: String, title: String, body: String, @ViewBuilder accessory: () -> Accessory) {
        self.icon = icon
        self.title = title
        self.bodyText = body
        self.accessory = accessory()
    }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(TSBrand.evidence)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 7) {
                Text(title).font(.title3.weight(.semibold))
                Text(bodyText)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                accessory
            }
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension CalmStateView where Accessory == EmptyView {
    init(icon: String, title: String, body: String) {
        self.init(icon: icon, title: title, body: body) { EmptyView() }
    }
}

private struct ReadyStateView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Capsule ready for recruiter review", systemImage: "checkmark.circle")
                .font(.title3.weight(.semibold))
            Text("\(model.capsule.sharedItems.count) item(s) may enter this bounded Task. Local-only items remain on this Mac and are excluded from the immutable manifest.")
                .foregroundStyle(.secondary)
            Button("Review with Talent Signal", systemImage: "arrow.right") {
                Task { await model.submitCapsule() }
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .disabled(!model.canSubmitCapsule)
            .keyboardShortcut(.return, modifiers: [.command, .shift])
            .accessibilityIdentifier("capsule.submit")
        }
    }
}

struct RelationshipScopeReviewView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    SectionLabel(text: "Review relationship scope")
                    Text("No identity is selected yet")
                        .font(.headline)
                }
                Spacer()
                Label("Proposed", systemImage: "circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 8) {
                ForEach(model.relationshipScopeOptions) { option in
                    Button {
                        model.selectRelationshipScopeOption(id: option.id)
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: model.selectedScopeOptionID == option.id ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(model.selectedScopeOptionID == option.id ? TSBrand.evidence : .secondary)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(option.pursuitTitle)
                                    .font(.subheadline.weight(.semibold))
                                Text(option.personDisplayLabel)
                                Text(option.relationshipContextLabel)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(Color.secondary.opacity(0.055), in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(
                        model.selectedScopeOptionID == option.id ? TSBrand.evidence.opacity(0.55) : Color.secondary.opacity(0.15)
                    ))
                    .accessibilityLabel("\(option.pursuitTitle), \(option.personDisplayLabel), \(option.relationshipContextLabel). \(model.selectedScopeOptionID == option.id ? "Selected for confirmation" : "Not selected")")
                    .accessibilityIdentifier("scope.option.\(option.id)")
                }
            }

            Text("Confirm only if this exact Pursuit, Person, and relationship context own the selected source. Keeping it unresolved creates no binding, fact, or action authority.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Button("Keep identity unresolved") {
                    model.keepRelationshipScopeUnresolved()
                }
                .accessibilityIdentifier("scope.keepUnresolved")
                Spacer()
                Button("Confirm this exact scope", systemImage: "checkmark") {
                    Task { await model.confirmRelationshipScope() }
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .disabled(model.selectedScopeOptionID == nil)
                .accessibilityIdentifier("scope.confirm")
            }
        }
        .padding(16)
        .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.22)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("scope.review")
    }
}

private struct EvidenceDecisionView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "What changed")
                Text(model.presentation.changedSummary)
                    .font(.title3.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(model.presentation.dependency)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 7) {
                    SectionLabel(text: "Exact evidence")
                    Text(model.presentation.evidenceQuote)
                        .font(.body)
                        .textSelection(.enabled)
                    Text(model.presentation.evidenceSource)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                Rectangle()
                    .fill(TSBrand.seam)
                    .frame(width: 3)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 7) {
                    SectionLabel(text: "Proposed relationship change")
                    Text("Decision deadline: previously unknown → Wednesday")
                        .font(.body.weight(.medium))
                    Text("Proposed is not confirmed state.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.18)))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("decision.evidenceChange")

            DecisionLayer(
                eyebrow: "Decision 1 · fact review",
                title: model.factReviewStatus == .proposed ? "Should this become confirmed relationship state?" : "Fact review: \(model.factReviewStatus.rawValue)",
                detail: "This decision changes only the governed fact. It grants no permission to prepare, copy, or send a message."
            ) {
                Button("Confirm fact") { model.confirmFactProposal() }
                    .disabled(model.factReviewStatus != .proposed)
                    .accessibilityIdentifier("decision.confirmFact")
                Button("Dismiss") { model.dismissFactProposal() }
                    .disabled(model.factReviewStatus != .proposed)
                    .accessibilityIdentifier("decision.dismissFact")
            }

            LocalDraftHandoffView()
        }
    }
}

private struct LocalDraftHandoffView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        DecisionLayer(
            eyebrow: "Separate local handoff",
            title: model.localDraftStatus == .awaitingDecision
                ? "Prepare a response draft on this Mac?"
                : "Local draft \(model.localDraftStatus.rawValue)",
            detail: "Prepared and copied are local receipts. Neither means sent, scheduled, delivered, or approved for delivery."
        ) {
            Button(model.localDraftStatus == .awaitingDecision ? "Prepare local draft" : "Draft \(model.localDraftStatus.rawValue)") {
                model.prepareLocalDraft()
            }
            .disabled(model.localDraftStatus != .awaitingDecision)
            .accessibilityHint("Creates editable text only on this Mac and performs no external effect")
            .accessibilityIdentifier("decision.prepareDraft")
            Button("Copy prepared draft") { model.copyPreparedDraft() }
                .disabled(model.localDraftStatus == .awaitingDecision)
                .accessibilityHint("Copies the prepared text to the clipboard; it does not send the message")
                .accessibilityIdentifier("decision.copyDraft")
        }
    }
}

private struct DecisionLayer<Actions: View>: View {
    let eyebrow: String
    let title: String
    let detail: String
    @ViewBuilder let actions: Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: eyebrow)
            Text(title).font(.headline).fixedSize(horizontal: false, vertical: true)
            Text(detail).font(.callout).foregroundStyle(.secondary)
            HStack { actions }
        }
        .padding(16)
        .background(Color.secondary.opacity(0.055), in: RoundedRectangle(cornerRadius: 9))
    }
}

private struct AmbiguousIdentityView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Identity must be resolved before evidence can bind", systemImage: "person.2.badge.questionmark")
                .font(.title3.weight(.semibold))
            Text("Two temporal owners share a clue. Neither is selected, and no fact or action can be confirmed from this state.")
                .foregroundStyle(.secondary)

            VStack(spacing: 0) {
                IdentityOption(label: "Current clue", name: "Alexandra 陈嘉宁-Sørensen", detail: "Current source-linked email · relationship controls available after explicit selection")
                Divider()
                IdentityOption(label: "Historical clue", name: "Alex Chen — archived consulting context", detail: "Expired clue · visible for comparison, attachment disabled")
            }
            .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.secondary.opacity(0.18)))

            Button("Save for identity review") {
                model.saveIdentityForReview()
            }
                .accessibilityIdentifier("identity.saveUnresolved")
            Text("Create new person is unavailable while this current-owner conflict exists.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct IdentityOption: View {
    let label: String
    let name: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "circle")
                .foregroundStyle(.secondary)
                .accessibilityLabel("Not selected")
            VStack(alignment: .leading, spacing: 4) {
                SectionLabel(text: label)
                Text(name).font(.headline).fixedSize(horizontal: false, vertical: true)
                Text(detail).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
