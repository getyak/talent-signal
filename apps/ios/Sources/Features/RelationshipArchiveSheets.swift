import SwiftUI

struct RelationshipChangeReviewView: View {
    let person: RelationshipArchivePerson
    let actorDisplayName: String
    let sourceTimezone: String
    @Environment(\.dismiss) private var dismiss
    @StateObject private var reviewStore: PursuitProposalReviewStore

    init(
        person: RelationshipArchivePerson,
        reviewSession: PursuitProposalReviewSession? = nil,
        service: PursuitProposalReviewServing? = nil,
        actorDisplayName: String = "Current recruiter",
        sourceTimezone: String = TimeZone.current.identifier
    ) {
        self.person = person
        self.actorDisplayName = actorDisplayName
        self.sourceTimezone = sourceTimezone
        _reviewStore = StateObject(
            wrappedValue: PursuitProposalReviewStore(
                session: reviewSession,
                service: service
            )
        )
    }

    private var subjectName: String {
        reviewStore.proposal?.reviewContext.subject.displayLabel ?? person.name
    }

    private var displayedEvidence: String {
        guard let proposal = reviewStore.proposal else { return person.evidence }
        return proposal.reviewContext.evidence.first?.text
            ?? "No reviewable evidence text is available for this Proposal."
    }

    private var displayedProvenance: String {
        guard let proposal = reviewStore.proposal,
              let evidence = proposal.reviewContext.evidence.first else {
            return person.provenance
        }
        let roles = proposal.reviewContext.subject.contextualRoles
            .map { $0.roleType.replacingOccurrences(of: "_", with: " ").capitalized }
            .joined(separator: ", ")
        let actor = evidence.attributedActor
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
        let channel = evidence.inputChannel == "ios_share"
            ? "iOS Share"
            : evidence.inputChannel
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
        return "Person: \(subjectName) · Role: \(roles) · Speaker: \(actor) · Source: \(evidence.sourceDisplayName) · Channel: \(channel) · \(evidenceTimeContext(evidence)) · Attribution: \(evidence.attributionStatus) · Review: \(evidence.reviewStatus)"
    }

    private var relativeDateWarning: String? {
        let normalized = displayedEvidence.lowercased()
        let relativePhrases = [
            "next monday", "next tuesday", "next wednesday", "next thursday",
            "next friday", "next saturday", "next sunday", "tomorrow",
            "this monday", "this tuesday", "this wednesday", "this thursday",
            "this friday", "this weekend",
        ]
        guard relativePhrases.contains(where: normalized.contains) else { return nil }
        return "This evidence contains a relative date. It remains quoted context, not a scheduled date; confirm the absolute date and timezone before creating a due Action."
    }

    private var proposalHeadline: String {
        reviewStore.proposal?.summary ?? person.proposedState
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    RelationshipModalEyebrow("Why this is here")
                        .padding(.top, 34)

                    VStack(alignment: .leading, spacing: 18) {
                        Image(systemName: "quote.opening")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Color.tsVermilion)
                        Text("“\(displayedEvidence)”")
                            .font(.custom("Georgia", size: 25, relativeTo: .title2))
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(displayedProvenance)
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(18)
                    .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(Color.tsLine, lineWidth: 1)
                    }
                    .padding(.top, 18)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("review-exact-evidence")

                    RelationshipCausalSeam()
                        .frame(maxWidth: .infinity)

                    if let relativeDateWarning {
                        RelationshipReviewStatusCard(
                            title: "Relative time remains unresolved",
                            detail: relativeDateWarning,
                            systemImage: "calendar.badge.exclamationmark"
                        )
                        .padding(.bottom, 22)
                    }

                    RelationshipModalEyebrow(
                        reviewStore.proposal.map {
                            "Pursuit · \($0.reviewContext.pursuit.title)"
                        } ?? "Proposed change"
                    )

                    Text(proposalHeadline)
                        .font(.custom("Georgia", size: 29, relativeTo: .title2))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-0.6)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)

                    Text("Only a reviewed backend operation can change this Pursuit. It cannot send a message or write to an external system.")
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)

                    if let proposal = reviewStore.proposal,
                       proposal.evidenceState.availability != "available" {
                        RelationshipReviewStatusCard(
                            title: proposal.evidenceState.attentionLabel,
                            detail: proposal.evidenceState.explanation,
                            systemImage: "exclamationmark.shield"
                        )
                        .padding(.top, 18)
                    }

                    if let proposal = reviewStore.proposal {
                        VStack(alignment: .leading, spacing: 14) {
                            ForEach(proposal.items) { item in
                                VStack(alignment: .leading, spacing: 10) {
                                    RelationshipModalEyebrow(
                                        item.epistemicStatus.replacingOccurrences(
                                            of: "_",
                                            with: " "
                                        )
                                    )
                                    RelationshipDefinitionRow(
                                        label: "Before",
                                        value: item.beforeValue.displayText
                                    )
                                    RelationshipDefinitionRow(
                                        label: "Proposed",
                                        value: item.proposedValue.displayText
                                    )
                                    RelationshipDefinitionRow(
                                        label: "Reason",
                                        value: item.reason
                                    )
                                    RelationshipDefinitionRow(
                                        label: "Effect",
                                        value: item.effectSummary
                                    )
                                    Text(item.evidenceState.explanation)
                                        .font(.caption)
                                        .foregroundStyle(
                                            item.evidenceState.availability == "available"
                                                ? Color.tsMutedInk
                                                : Color.tsVermilion
                                        )

                                    if reviewStore.phase == .ready,
                                       let draft = reviewStore.drafts[item.id] {
                                        RelationshipProposalItemDecisionEditor(
                                            item: item,
                                            draft: draft,
                                            validationMessage: reviewStore.editValidationMessage(for: item),
                                            onSelect: { choice in
                                                reviewStore.select(choice, for: item.id)
                                            },
                                            onEdit: { field, value in
                                                reviewStore.updateEditedField(
                                                    field,
                                                    value: value,
                                                    for: item.id
                                                )
                                            }
                                        )
                                    }
                                }
                                .padding(16)
                                .background(
                                    Color.tsCanvas,
                                    in: RoundedRectangle(cornerRadius: 16)
                                )
                                .overlay {
                                    RoundedRectangle(cornerRadius: 16)
                                        .stroke(Color.tsLine, lineWidth: 1)
                                }
                                .accessibilityElement(children: .contain)
                                .accessibilityIdentifier("proposal-item-\(item.id)")
                            }
                        }
                        .padding(.top, 24)
                    }

                    switch reviewStore.phase {
                    case .previewOnly:
                        RelationshipReviewStatusCard(
                            title: "Canonical review not connected",
                            detail: "This synthetic preview has no Proposal ID, so no confirmation control is available and nothing can be presented as applied.",
                            systemImage: "lock.shield"
                        )
                        .padding(.top, 22)
                    case .loading:
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Loading canonical Proposal…")
                                .font(.subheadline)
                                .foregroundStyle(Color.tsMutedInk)
                        }
                        .padding(.top, 22)
                    case .ready:
                        VStack(alignment: .leading, spacing: 12) {
                            if let notice = reviewStore.notice {
                                Label(notice, systemImage: "checkmark.shield")
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                            }

                            Text(
                                "\(reviewStore.decidedItemCount)/\(reviewStore.proposal?.items.count ?? 0) item decisions complete"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)

                            if let evidenceBlock = reviewStore.evidenceBlockingMessage {
                                RelationshipReviewStatusCard(
                                    title: "Evidence no longer reviewable",
                                    detail: evidenceBlock,
                                    systemImage: "exclamationmark.shield"
                                )
                            }

                            Button("Record reviewed decisions") {
                                Task { await reviewStore.submit() }
                            }
                            .buttonStyle(RelationshipUnderlinedDecisionStyle())
                            .disabled(!reviewStore.canSubmit)
                            .accessibilityHint(
                                reviewStore.canSubmit
                                    ? "Records these decisions in canonical Pursuit state. No external action is performed."
                                    : "Choose a valid decision for every Proposal item first."
                            )
                            .accessibilityIdentifier("confirm-relationship-change")
                        }
                        .padding(.top, 22)
                    case .confirming:
                        RelationshipReviewStatusCard(
                            title: "Confirming with canonical state",
                            detail: "One recovery reference is saved until canonical readback finishes. Do not submit this review again.",
                            systemImage: "arrow.triangle.2.circlepath"
                        )
                        .padding(.top, 22)
                    case let .recorded(result):
                        RelationshipReviewReceipt(
                            result: result,
                            actorDisplayName: actorDisplayName,
                            sourceTimezone: sourceTimezone
                        )
                            .padding(.top, 22)
                    case let .conflict(message):
                        RelationshipReviewStatusCard(
                            title: "Pursuit changed",
                            detail: "\(message) Nothing from this review was applied.",
                            systemImage: "arrow.triangle.branch"
                        )
                        .padding(.top, 22)
                    case let .unknownLocked(operationID):
                        VStack(alignment: .leading, spacing: 12) {
                            RelationshipReviewStatusCard(
                                title: "Outcome unknown — operation locked",
                                detail: "The saved review may or may not have applied. Check canonical readback before trying again; the same recovery reference will be used.",
                                systemImage: "questionmark.diamond"
                            )
                            DisclosureGroup("Audit details") {
                                Text("Recovery reference \(operationID.uuidString.lowercased())")
                                    .font(.caption2)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                            Button("Check canonical status") {
                                Task { await reviewStore.reconcile() }
                            }
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("reconcile-relationship-review")
                        }
                        .padding(.top, 22)
                    case let .failed(message):
                        VStack(alignment: .leading, spacing: 12) {
                            RelationshipReviewStatusCard(
                                title: "Review not applied",
                                detail: message,
                                systemImage: "exclamationmark.triangle"
                            )
                            Button("Retry loading Proposal") {
                                Task { await reviewStore.load() }
                            }
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                        }
                        .padding(.top, 22)
                    }

                    if reviewStore.proposal == nil {
                        VStack(spacing: 0) {
                            RelationshipDefinitionRow(
                                label: "Before",
                                value: person.previousState
                            )
                            RelationshipDefinitionRow(
                                label: "Proposed",
                                value: person.proposedState
                            )
                        }
                        .padding(.top, 40)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle("Review change")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "arrow.left")
                    }
                    .accessibilityLabel("Close relationship review")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    RelationshipReviewIdentityAvatar(label: subjectName)
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.tsSurface, for: .navigationBar)
        }
        .tint(.tsInk)
        .accessibilityIdentifier("relationship-change-review")
        .task {
            await reviewStore.load()
        }
    }

    private func evidenceTimeContext(
        _ evidence: PursuitProposalSnapshot.ReviewContext.Evidence
    ) -> String {
        guard let date = ISO8601DateFormatter().date(from: evidence.observedAt) else {
            return "Observed: \(evidence.observedAt)\(evidence.sourceTimezone.map { " · source timezone \($0)" } ?? "")"
        }
        let sourceFormatter = DateFormatter()
        sourceFormatter.locale = Locale(identifier: "en_US_POSIX")
        sourceFormatter.calendar = Calendar(identifier: .gregorian)
        sourceFormatter.timeZone = evidence.sourceTimezone.flatMap(TimeZone.init(identifier:))
            ?? TimeZone(secondsFromGMT: 0)
        sourceFormatter.dateFormat = "MMM d, yyyy h:mm a z"

        let recruiterFormatter = DateFormatter()
        recruiterFormatter.locale = Locale(identifier: "en_US_POSIX")
        recruiterFormatter.calendar = Calendar(identifier: .gregorian)
        recruiterFormatter.timeZone = .current
        recruiterFormatter.dateFormat = "MMM d, yyyy h:mm a z"

        let relative = RelativeDateTimeFormatter().localizedString(
            for: date,
            relativeTo: Date()
        )
        let source = sourceFormatter.string(from: date)
        let recruiter = recruiterFormatter.string(from: date)
        let zone = evidence.sourceTimezone ?? "UTC"
        if source == recruiter {
            return "Observed \(relative): \(source) · source timezone \(zone)"
        }
        return "Observed \(relative): \(source) · source timezone \(zone) · recruiter time \(recruiter)"
    }
}

struct RelationshipResumeView: View {
    let person: RelationshipArchivePerson
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    RelationshipModalEyebrow("Resume with context")
                        .padding(.top, 28)

                    Text("You stopped while reviewing \(person.name.components(separatedBy: " ").first ?? person.name).")
                        .font(.custom("Georgia", size: 35, relativeTo: .largeTitle))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-0.8)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)

                    Text("Your edits are saved. No message was sent.")
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)

                    VStack(alignment: .leading, spacing: 18) {
                        HStack {
                            RelationshipInitialsAvatar(person: person, size: 48)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(person.relationship)
                                    .font(.custom("Georgia", size: 18, relativeTo: .headline))
                                    .foregroundStyle(Color.tsInk)
                                Text("Evidence 2 of 3")
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                            Spacer()
                        }

                        Text(person.dependency)
                            .font(.body)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)

                        NavigationLink {
                            RelationshipChangeReviewView(person: person)
                        } label: {
                            HStack {
                                Text("Continue review")
                                Spacer()
                                Image(systemName: "arrow.right")
                            }
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                            .frame(minHeight: 48)
                            .overlay(alignment: .bottom) {
                                Rectangle().fill(Color.tsInk).frame(height: 1)
                            }
                        }
                        .accessibilityIdentifier("continue-preserved-review")
                    }
                    .padding(.top, 36)

                    Label(
                        "Review progress describes preserved work, not candidate quality.",
                        systemImage: "lock.shield"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 42)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle("Continue review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .tint(.tsInk)
        .accessibilityIdentifier("relationship-resume-review")
    }
}

struct RelationshipDetailView: View {
    let person: RelationshipArchivePerson
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top, spacing: 16) {
                        RelationshipInitialsAvatar(person: person, size: 64)
                        VStack(alignment: .leading, spacing: 5) {
                            RelationshipModalEyebrow(person.state.rawValue)
                            Text(person.name)
                                .font(.custom("Georgia", size: 30, relativeTo: .title))
                                .foregroundStyle(Color.tsInk)
                            Text("\(person.role) · \(person.company)")
                                .font(.subheadline)
                                .foregroundStyle(Color.tsMutedInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.top, 30)

                    RelationshipDefinitionRow(
                        label: "Context",
                        value: person.relationship
                    )
                    .padding(.top, 32)

                    RelationshipModalEyebrow("Current dependency")
                        .padding(.top, 30)
                    Text(person.dependency)
                        .font(.custom("Georgia", size: 28, relativeTo: .title2))
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    RelationshipModalEyebrow("Exact evidence")
                        .padding(.top, 36)
                    Text("“\(person.evidence)”")
                        .font(.custom("Georgia", size: 21, relativeTo: .title3))
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                    Text(person.provenance)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    RelationshipModalEyebrow("Smallest supported step")
                        .padding(.top, 36)
                    Text(person.nextStep)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    Text("Draft only · Review evidence before confirming any relationship change. External action requires a separate approval.")
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(person.relationship)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .tint(.tsInk)
        .accessibilityIdentifier("relationship-detail-\(person.id)")
    }
}

struct RelationshipMenuView: View {
    let isCanonical: Bool
    let workspaceID: String?
    let accountName: String?
    let proposals: [WorkspaceProposal]
    let signOutNotice: String?
    let onOpenProposal: (WorkspaceProposal) -> Void
    let onSignOut: (() async -> Bool)?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var appLanguage
    @AppStorage(AppLanguage.storageKey) private var storedLanguage =
        AppLanguage.system.rawValue
    @State private var isSigningOut = false
    @State private var selectedDetent: PresentationDetent = .medium

    private var selectedLanguage: AppLanguage {
        AppLanguage.stored(storedLanguage)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        RelationshipSignalOrb()
                        VStack(alignment: .leading, spacing: 3) {
                            Text(accountName ?? "Talent Signal")
                                .font(.custom("Georgia", size: 20, relativeTo: .headline))
                            Text(
                                isCanonical
                                    ? appLanguage.text(
                                        "Canonical workspace",
                                        zhHans: "权威工作区"
                                    )
                                    : appLanguage.text(
                                        "Synthetic preview",
                                        zhHans: "合成预览"
                                    )
                            )
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section {
                    if proposals.isEmpty {
                        Label(
                            appLanguage.text(
                                "No Proposal needs review",
                                zhHans: "没有需要审阅的提议"
                            ),
                            systemImage: "checkmark.circle"
                        )
                            .foregroundStyle(Color.tsMutedInk)
                    } else {
                        ForEach(proposals) { proposal in
                            Button {
                                dismiss()
                                Task { @MainActor in
                                    await Task.yield()
                                    onOpenProposal(proposal)
                                }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(proposal.summary)
                                        .foregroundStyle(Color.tsInk)
                                    Text("\(proposal.subjectDisplayLabel) · \(proposal.status.replacingOccurrences(of: "_", with: " "))")
                                        .font(.caption)
                                        .foregroundStyle(Color.tsMutedInk)
                                }
                            }
                            .accessibilityIdentifier("inbox-proposal-\(proposal.id)")
                        }
                    }
                } header: {
                    Text(appLanguage.text("Review inbox", zhHans: "审阅收件箱"))
                }

                Section {
                    NavigationLink {
                        AppSettingsView()
                            .onAppear { selectedDetent = .large }
                            .onDisappear { selectedDetent = .medium }
                    } label: {
                        HStack(spacing: 12) {
                            Label(
                                appLanguage.text("Settings", zhHans: "设置"),
                                systemImage: "gearshape"
                            )
                            Spacer(minLength: 10)
                            Text(selectedLanguage.displayName(in: appLanguage))
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                        }
                    }
                    .accessibilityIdentifier("open-settings")

                } header: {
                    Text(appLanguage.text("Product", zhHans: "产品"))
                }

                Section {
                    Label(boundaryCopy, systemImage: "lock.shield")
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    if let signOutNotice {
                        Label(signOutNotice, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .accessibilityIdentifier("sign-out-local-deletion-notice")
                    }
                    if let onSignOut {
                        Button(role: .destructive) {
                            guard !isSigningOut else { return }
                            isSigningOut = true
                            Task {
                                let didSignOut = await onSignOut()
                                isSigningOut = false
                                if didSignOut { dismiss() }
                            }
                        } label: {
                            HStack {
                                Label(
                                    appLanguage.text("Sign out", zhHans: "退出登录"),
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
            .scrollContentBackground(.hidden)
            .background(Color.tsSurface)
            .navigationTitle(Text("Talent Signal"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(appLanguage.text("Close", zhHans: "关闭")) {
                        dismiss()
                    }
                    .accessibilityIdentifier("close-relationship-menu")
                }
            }
        }
        .tint(.tsInk)
        .presentationDetents([.medium, .large], selection: $selectedDetent)
    }

    private var boundaryCopy: String {
        if isCanonical {
            return appLanguage.text(
                "This workspace is read from canonical account scope. Proposals carry no execution authority until item review and readback.",
                zhHans: "此工作区读取自权威账户范围。提议在逐项审阅并回读前不具备执行权限。"
            )
        }
        return appLanguage.text(
            "No candidate data is stored in this synthetic preview. Generated proposals carry no execution authority.",
            zhHans: "此合成预览不会存储候选人数据。生成的提议不具备执行权限。"
        )
    }
}

private struct RelationshipReviewIdentityAvatar: View {
    let label: String

    private var initials: String {
        label.split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }

    var body: some View {
        Text(initials)
            .font(.custom("Georgia", size: 14, relativeTo: .caption))
            .foregroundStyle(Color.tsInk)
            .frame(width: 36, height: 36)
            .background(Color.tsCanvas, in: Circle())
            .overlay { Circle().stroke(Color.tsLine, lineWidth: 1) }
            .accessibilityLabel(label)
    }
}

private struct RelationshipProposalItemDecisionEditor: View {
    let item: PursuitProposalSnapshot.Item
    let draft: PursuitProposalDecisionDraft
    let validationMessage: String?
    let onSelect: (PursuitProposalReviewChoice) -> Void
    let onEdit: (String, String) -> Void

    private var availableChoices: [PursuitProposalReviewChoice] {
        PursuitProposalReviewChoice.allCases.filter { choice in
            choice != .edit || item.proposedValue.editableFields != nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your decision")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsInk)

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                ],
                spacing: 8
            ) {
                ForEach(availableChoices) { choice in
                    Button {
                        onSelect(choice)
                    } label: {
                        HStack(spacing: 6) {
                            Image(
                                systemName: draft.choice == choice
                                    ? "checkmark.circle.fill"
                                    : "circle"
                            )
                            Text(choice.label)
                            Spacer(minLength: 0)
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(.horizontal, 10)
                        .background(
                            draft.choice == choice ? Color.tsCanvas : Color.clear,
                            in: RoundedRectangle(cornerRadius: 10)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(
                                    draft.choice == choice ? Color.tsInk : Color.tsLine,
                                    lineWidth: 1
                                )
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(choice.label)
                    .accessibilityValue(draft.choice == choice ? "Selected" : "Not selected")
                    .accessibilityIdentifier("proposal-decision-\(choice.rawValue)-\(item.id)")
                }
            }

            if draft.choice == .edit {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(draft.editedFields.keys.sorted(), id: \.self) { field in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(
                                field == "value"
                                    ? "Corrected value"
                                    : field.replacingOccurrences(of: "_", with: " ").capitalized
                            )
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)

                            TextField(
                                "Required",
                                text: Binding(
                                    get: { draft.editedFields[field, default: ""] },
                                    set: { onEdit(field, $0) }
                                ),
                                axis: .vertical
                            )
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("proposal-edit-\(field)-\(item.id)")
                        }
                    }

                    if let validationMessage {
                        Label(validationMessage, systemImage: "exclamationmark.circle")
                            .font(.caption)
                            .foregroundStyle(Color.tsVermilion)
                    }
                }
            }
        }
        .padding(.top, 4)
    }
}

private struct RelationshipReviewReceipt: View {
    let result: PursuitProposalReviewResult
    let actorDisplayName: String
    let sourceTimezone: String

    private var title: String {
        switch result.receipt.outcome {
        case "canonical_applied":
            return "Canonical Pursuit updated"
        case "mixed_applied":
            return "Applied items recorded; unresolved items remain"
        case "kept_unresolved":
            return "Proposal remains unresolved"
        case "rejected":
            return "Proposal rejected"
        default:
            return "Canonical review recorded"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(
                title,
                systemImage: result.receipt.outcome == "canonical_applied"
                    ? "checkmark.seal"
                    : "pause.circle"
            )
            .font(.headline)
            .foregroundStyle(Color.tsInk)

            Text(
                "Revision \(result.receipt.entityRef.beforeRevision) → \(result.receipt.entityRef.afterRevision) · \(result.receipt.changedFields.count) changed field\(result.receipt.changedFields.count == 1 ? "" : "s")"
            )
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.tsInk)

            Text(result.receipt.summary)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)

            Text(
                "\(actorDisplayName) · \(WorkspaceDate.recorded(at: result.receipt.occurredAt, sourceTimezone: sourceTimezone))"
            )
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)

            DisclosureGroup("Audit details") {
                Text(
                    "Operation \(result.receipt.operationID) · receipt \(result.receipt.id) · actor \(result.receipt.actorUserID)"
                )
                .font(.caption2)
                .foregroundStyle(Color.tsMutedInk)
            }

            Label(
                "No message was sent and external effects are empty.",
                systemImage: "lock.shield"
            )
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
        }
        .padding(16)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("relationship-review-receipt")
    }
}

private struct RelationshipReviewStatusCard: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(Color.tsInk)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("relationship-review-status")
    }
}

private struct RelationshipCausalSeam: View {
    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Color.tsVermilion)
                .frame(width: 1, height: 58)
            Circle()
                .fill(Color.tsVermilion)
                .frame(width: 8, height: 8)
        }
        .padding(.vertical, 2)
        .accessibilityHidden(true)
    }
}

private struct RelationshipDefinitionRow: View {
    let label: String
    let value: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    labelView
                    valueView
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 16) {
                    labelView
                        .frame(minWidth: 78, alignment: .leading)
                    valueView
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.vertical, 16)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
        .accessibilityElement(children: .combine)
    }

    private var labelView: some View {
        Text(label.uppercased())
            .font(.caption2.weight(.semibold))
            .tracking(0.7)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: true, vertical: false)
    }

    private var valueView: some View {
        Text(value)
            .font(.subheadline)
            .foregroundStyle(Color.tsInk)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct RelationshipModalEyebrow: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.05)
            .foregroundStyle(Color.tsVermilion)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct RelationshipInitialsAvatar: View {
    let person: RelationshipArchivePerson
    let size: CGFloat

    var body: some View {
        Text(person.initials)
            .font(.custom("Georgia", size: size * 0.3, relativeTo: .body))
            .foregroundStyle(Color.tsMutedInk)
            .frame(width: size, height: size)
            .background(Color.tsCanvas, in: Circle())
            .overlay { Circle().stroke(Color.tsLine, lineWidth: 1) }
            .accessibilityLabel(person.name)
    }
}

private struct RelationshipQuietDecisionStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline)
            .foregroundStyle(Color.tsMutedInk)
            .frame(maxWidth: .infinity, minHeight: 48)
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

private struct RelationshipUnderlinedDecisionStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Color.tsInk)
            .frame(maxWidth: .infinity, minHeight: 48)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color.tsInk).frame(height: 1)
            }
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

#Preview("Evidence review") {
    RelationshipChangeReviewView(person: .leila)
}
