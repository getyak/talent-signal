import XCTest

final class TalentSignalMacUITests: XCTestCase {
    private func launch(
        state: String = "ready",
        reducedMotion: Bool = false,
        identityTagCount: Int? = nil,
        todayPreview: Bool = false,
        quickPanelPreview: Bool = false,
        accessibilityZoom: Bool = false,
        darkAppearance: Bool = false
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--fixture-state", state]
        if let identityTagCount {
            app.launchArguments += ["--identity-tag-count", String(identityTagCount)]
        }
        if reducedMotion {
            app.launchArguments += ["-AppleReduceMotion", "YES"]
        }
        if todayPreview {
            app.launchArguments += ["--today-preview"]
        }
        if quickPanelPreview {
            app.launchArguments += ["--quick-panel-preview"]
        }
        if accessibilityZoom {
            app.launchArguments += ["--accessibility-zoom-200"]
        }
        if darkAppearance {
            app.launchArguments += ["--dark-appearance-preview"]
        }
        app.launch()
        XCTAssertTrue(app.windows.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["app.syntheticBanner"].waitForExistence(timeout: 3))
        return app
    }

    func testTodayIsTheDefaultRetrievalSurface() {
        let app = launch(state: "ready", todayPreview: true)

        XCTAssertTrue(app.descendants(matching: .any)["today.home"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["today.openQuickPanel"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["navigation.Today"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["today.canonicalAttention"].exists)
        XCTAssertEqual(app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "today.attention.")
        ).count, 3)
        let currentConversation = app.descendants(matching: .any)["today.currentConversation"]
        let canonicalAttention = app.descendants(matching: .any)["today.canonicalAttention"]
        XCTAssertTrue(currentConversation.exists)
        XCTAssertLessThan(
            currentConversation.frame.minY,
            canonicalAttention.frame.minY,
            "The conversation the recruiter just reviewed must lead Today instead of falling below the broader queue."
        )

        app.typeKey(.downArrow, modifierFlags: [.command, .option])
        XCTAssertTrue(app.descendants(matching: .any)["today.relationshipDetail"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.windows.count, 1, "Keyboard navigation should reuse the workspace window instead of opening a duplicate.")
        XCTAssertTrue(app.staticTexts["Remote-policy expectation needs review"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["today.detail.evidence"].exists)
        XCTAssertTrue(app.staticTexts["“I need clarity on the remote policy before Friday because the other process has accelerated.”"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["today.detail.unresolvedRelationship"].exists)
        XCTAssertTrue(app.buttons["today.detail.openProposalReview"].exists)
        XCTAssertFalse(app.buttons["today.detail.openQuickPanel"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["scope.review"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["capsule.section"].exists)

        app.typeKey("r", modifierFlags: [.command, .option])
        XCTAssertTrue(app.descendants(matching: .any)["canonical.decisionContext.20000000-0000-4000-8000-000000000005"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["canonical.choice.accept.20000000-0000-4000-8000-000000000005"].exists)
        XCTAssertFalse(app.buttons["canonical.resolve"].isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["canonical.sidebarDecisionGate"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["capsule.section"].exists)

        app.typeKey("1", modifierFlags: [.command, .option, .shift])
        let save = app.buttons["canonical.resolve"]
        XCTAssertTrue(save.isEnabled)
        app.typeKey(.return, modifierFlags: [.command, .option])

        XCTAssertTrue(app.descendants(matching: .any)["canonical.receipt"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Relationship updated after your review"].exists)
        XCTAssertTrue(app.staticTexts["Nothing was sent or scheduled."].exists)
        XCTAssertTrue(app.descendants(matching: .any)["canonical.sidebarSavedResult"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["capsule.section"].exists)

        app.typeKey("1", modifierFlags: [.command, .shift])
        XCTAssertTrue(app.descendants(matching: .any)["today.home"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["today.attention.synthetic-proposal"].exists)
        XCTAssertEqual(app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "today.attention.")
        ).count, 2)
        XCTAssertTrue(app.descendants(matching: .any)["navigation.Needs your review"].exists)
        XCTAssertTrue(app.staticTexts["Next move ready"].exists)
        XCTAssertTrue(app.staticTexts["Relationship saved"].exists)

        app.typeKey("n", modifierFlags: [.command, .option])
        XCTAssertTrue(app.descendants(matching: .any)["quick.draftEditor"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["quick.draftContext"].exists)
        XCTAssertTrue(app.buttons["quick.copyDraft"].exists)
        let quickPanel = app.windows["quick-panel"]
        XCTAssertTrue(quickPanel.exists)
        XCTAssertLessThanOrEqual(
            app.buttons["quick.copyDraft"].frame.maxY,
            quickPanel.frame.maxY,
            "The prepared draft action must be visible when the focused Quick Panel opens."
        )
        XCTAssertFalse(app.descendants(matching: .any)["quick.relationshipReceipt"].exists)
    }

    func testQuickPanelCompletesRelationshipDecisionAndShowsHumanReceipt() {
        let app = launch(state: "needs-decision", quickPanelPreview: true)

        XCTAssertTrue(app.descendants(matching: .any)["quick.relationshipDecision"].waitForExistence(timeout: 4))
        let choice = app.buttons["canonical.choice.accept.20000000-0000-4000-8000-000000000005"]
        XCTAssertTrue(choice.exists)
        choice.click()
        let save = app.buttons["canonical.resolve"]
        XCTAssertTrue(save.isEnabled)
        save.click()

        XCTAssertTrue(app.descendants(matching: .any)["quick.relationshipReceipt"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["Relationship updated after your review"].exists)
        XCTAssertTrue(app.staticTexts["Nothing was sent"].exists)
    }

    func testQuickPanelEditedDraftCanBeCopiedMeasuredAndDiscardedWithoutSendClaim() {
        let app = launch(state: "ready", reducedMotion: true, quickPanelPreview: true)
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<3 { scroll.swipeUp() }

        let prepare = app.buttons["quick.prepareClientQuestion"]
        XCTAssertTrue(prepare.waitForExistence(timeout: 3))
        prepare.click()

        let editor = app.descendants(matching: .any)["quick.draftEditor"]
        XCTAssertTrue(editor.waitForExistence(timeout: 3))
        editor.click()
        editor.typeKey("a", modifierFlags: .command)
        editor.typeText("Exact reviewed client question")
        app.buttons["quick.copyDraft"].click()

        XCTAssertTrue(app.descendants(matching: .any)["quick.trialFeedback"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Copied · not sent"].exists)
        let understood = app.buttons.matching(
            NSPredicate(format: "label == %@", "What changed made sense: Yes")
        ).firstMatch
        XCTAssertTrue(understood.exists)
        understood.click()
        app.buttons["quick.discardDraft"].click()
        XCTAssertTrue(app.descendants(matching: .any)["quick.localControlReceipt"].label.contains("Nothing was sent"))
    }

    func testQuickPanelFirstValueReplacesTheIntakeFormAboveTheFold() {
        let app = launch(state: "ready", reducedMotion: true, quickPanelPreview: true)
        let window = app.windows.firstMatch
        let sourceSummary = app.descendants(matching: .any)["quick.intakeSummary"]
        let evidence = app.descendants(matching: .any)["quick.evidence"]
        let unresolved = app.descendants(matching: .any)["quick.primaryUnresolved"]
        let nextStep = app.descendants(matching: .any)["quick.nextStep"]
        let primaryAction = app.buttons["quick.primaryAction"]

        XCTAssertTrue(sourceSummary.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["quick.reviewAnother"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["quick.selectedText"].exists)
        XCTAssertTrue(evidence.exists)
        XCTAssertTrue(unresolved.exists)
        XCTAssertTrue(nextStep.exists)
        XCTAssertTrue(primaryAction.exists)
        XCTAssertLessThanOrEqual(primaryAction.frame.maxY, window.frame.maxY)

        app.buttons["quick.reviewAnother"].click()
        XCTAssertTrue(app.descendants(matching: .any)["quick.selectedText"].waitForExistence(timeout: 3))
    }

    func testQuickReminderReviewTakesOverWithExactEffectAboveTheFold() {
        let app = launch(state: "ready", reducedMotion: true, quickPanelPreview: true)
        let window = app.windows.firstMatch
        let prepareReminder = app.buttons["quick.prepareReminder"]

        XCTAssertTrue(prepareReminder.waitForExistence(timeout: 3))
        prepareReminder.click()

        let consequence = app.descendants(matching: .any)["quick.consequenceReview"]
        let context = app.descendants(matching: .any)["quick.consequenceContext"]
        let proposal = app.descendants(matching: .any)["quick.reminderProposal"]
        XCTAssertTrue(consequence.waitForExistence(timeout: 3))
        XCTAssertTrue(context.exists)
        XCTAssertTrue(proposal.exists)
        XCTAssertFalse(app.descendants(matching: .any)["quick.insight"].exists)
        XCTAssertLessThanOrEqual(proposal.frame.maxY, window.frame.maxY)

        app.buttons["Cancel"].click()
        XCTAssertTrue(app.descendants(matching: .any)["quick.insight"].waitForExistence(timeout: 3))
    }

    func testExplicitTextIntakeAndBoundaryControls() {
        let app = launch(state: "empty")
        let scopeOption = app.descendants(matching: .any)["scope.option.synthetic-scope"]
        XCTAssertTrue(scopeOption.waitForExistence(timeout: 3))
        scopeOption.click()
        let confirmScope = app.buttons["scope.confirm"]
        XCTAssertTrue(confirmScope.waitForExistence(timeout: 3))
        confirmScope.click()
        let editor = app.descendants(matching: .any)["capsule.textEditor"]
        XCTAssertTrue(editor.waitForExistence(timeout: 3))
        editor.click()
        editor.typeText("The candidate explicitly needs remote-policy clarity before Wednesday.")
        let addButton = app.buttons["capsule.addText"]
        XCTAssertTrue(addButton.isEnabled)
        addButton.click()

        XCTAssertTrue(app.descendants(matching: .any)["capsule.boundary"].exists)
        XCTAssertFalse(app.buttons["capsule.submit"].isEnabled)
        app.typeKey("a", modifierFlags: [.command, .shift])
        app.typeKey("a", modifierFlags: [.command, .option, .shift])
        XCTAssertTrue(app.buttons["capsule.submit"].isEnabled)
    }

    func testLongMixedScriptIdentityAndAmbiguityRemainLegible() {
        let app = launch(state: "ambiguous-identity", reducedMotion: true)
        XCTAssertTrue(app.staticTexts["Alexandra 陈嘉宁-Sørensen — International Leadership & Platform Transformation"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.descendants(matching: .any)["workspace.state"].label, "Identity unresolved")
        XCTAssertTrue(app.buttons["identity.saveUnresolved"].exists)
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", "score")).firstMatch.exists)
        app.buttons["identity.saveUnresolved"].click()
        XCTAssertTrue(app.descendants(matching: .any)["identity.unresolvedReceipt"].waitForExistence(timeout: 3))
    }

    func testReceiptLocalHandoffRemainsReachableAt200PercentWithLongMixedIdentity() {
        let app = launch(
            state: "receipt",
            reducedMotion: true,
            identityTagCount: 3,
            accessibilityZoom: true,
            darkAppearance: true
        )
        let window = app.windows.firstMatch
        let candidateName = app.descendants(matching: .any)["workspace.candidateName"]
        let relationshipScroll = app.scrollViews["workspace.relationship"]
        let prepareDraft = app.buttons["decision.prepareDraft"]

        XCTAssertTrue(candidateName.waitForExistence(timeout: 3))
        XCTAssertTrue(relationshipScroll.exists)
        XCTAssertTrue(prepareDraft.exists)
        XCTAssertLessThan(
            candidateName.frame.height,
            window.frame.height * 0.45,
            "The long mixed-script identity must not consume most of the 200 percent viewport."
        )

        for _ in 0..<6 {
            if prepareDraft.isHittable { break }
            relationshipScroll.swipeUp()
        }

        XCTAssertTrue(prepareDraft.isHittable)
        XCTAssertGreaterThanOrEqual(prepareDraft.frame.minY, window.frame.minY)
        XCTAssertLessThanOrEqual(prepareDraft.frame.maxY, window.frame.maxY)
    }

    func testFailureUnknownNoActionAndDeletedAreTruthfulTerminalStates() {
        let states = [
            (argument: "stale", label: "Source changed"),
            (argument: "failed", label: "Failed safely"),
            (argument: "outcome-unknown", label: "Outcome unknown"),
            (argument: "no-action", label: "No action"),
            (argument: "deleted", label: "Local context deleted")
        ]
        for state in states {
            let app = launch(state: state.argument)
            let status = app.descendants(matching: .any)["workspace.state"]
            XCTAssertTrue(status.waitForExistence(timeout: 3))
            XCTAssertEqual(status.label, state.label)
            app.terminate()
        }
    }

    func testNoActionFirstResponseShowsExactEvidenceAndExistingOwnedAction() {
        let app = launch(state: "no-action", reducedMotion: true)

        XCTAssertTrue(app.descendants(matching: .any)["noAction.result"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["noAction.evidence"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["noAction.ownedAction"].exists)
        XCTAssertEqual(
            app.descendants(matching: .any)["noAction.ownedAction.title"].label,
            "Prepare the exact client policy question"
        )
        XCTAssertTrue(app.descendants(matching: .any)["noAction.dependency"].label.contains("does not justify a duplicate"))
        XCTAssertTrue(app.descendants(matching: .any)["noAction.noExternalEffect"].exists)
        XCTAssertFalse(app.staticTexts["No unresolved dependency is supported by the selected evidence."].exists)
    }

    func testKeyboardShortcutOpensQuickPanelWithoutCapturingContext() {
        let app = launch(state: "ready")
        app.typeKey(" ", modifierFlags: [.command, .shift])
        XCTAssertTrue(app.descendants(matching: .any)["quick.panel"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["capsule.empty"].exists)
    }

    func testCanonicalDecisionRequiresPerItemChoiceBeforeReceipt() {
        let app = launch(state: "needs-decision")
        let resolve = app.buttons["canonical.resolve"]
        XCTAssertTrue(resolve.waitForExistence(timeout: 3))
        XCTAssertFalse(resolve.isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["canonical.evidence.20000000-0000-4000-8000-000000000004"].exists)

        let confirm = app.buttons["canonical.choice.accept.20000000-0000-4000-8000-000000000005"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        var searchStart = confirm.label.startIndex
        for marker in ["Identity ", "Relationship ", "Claim ", "Uncertainty ", "Evidence ", "Consequence ", "Decision for"] {
            let runtimeMarker = marker == "Decision for" ? "Choice Confirm" : marker
            guard let range = confirm.label.range(of: runtimeMarker, range: searchStart..<confirm.label.endIndex) else {
                return XCTFail("Missing or out-of-order VoiceOver decision marker: \(runtimeMarker). Label: \(confirm.label)")
            }
            searchStart = range.upperBound
        }

        confirm.click()
        XCTAssertTrue(resolve.isEnabled)
        resolve.click()

        XCTAssertTrue(app.descendants(matching: .any)["canonical.receipt"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.descendants(matching: .any)["workspace.state"].label, "Receipt verified")
    }

    func testKeyboardOnlyScopeCaptureDecisionAndReceiptJourney() {
        let app = launch(state: "ready", reducedMotion: true)

        app.typeKey("1", modifierFlags: [.command, .option])
        XCTAssertTrue(app.buttons["scope.confirm"].isEnabled)
        app.typeKey("c", modifierFlags: [.command, .option])

        let editor = app.descendants(matching: .any)["capsule.textEditor"]
        XCTAssertTrue(editor.waitForExistence(timeout: 3))
        editor.typeText("The candidate needs the exact remote-work policy before Wednesday.")
        app.typeKey(.return, modifierFlags: [.command])
        XCTAssertFalse(app.buttons["capsule.submit"].isEnabled)
        app.typeKey("a", modifierFlags: [.command, .shift])
        app.typeKey("a", modifierFlags: [.command, .option, .shift])
        XCTAssertTrue(app.buttons["capsule.submit"].isEnabled)

        app.typeKey(.return, modifierFlags: [.command, .shift])
        XCTAssertTrue(app.buttons["canonical.resolve"].waitForExistence(timeout: 3))
        app.typeKey("1", modifierFlags: [.command, .option, .shift])
        XCTAssertTrue(app.buttons["canonical.resolve"].isEnabled)
        app.typeKey(.return, modifierFlags: [.command, .option])

        XCTAssertTrue(app.descendants(matching: .any)["canonical.receipt"].waitForExistence(timeout: 3))
    }

    func testIdentityTagsHaveNoAvatarPlaceholderAndFitZeroThroughThreeTags() {
        for count in 0...3 {
            let app = launch(state: "needs-decision", identityTagCount: count)
            let tags = app.descendants(matching: .any)["workspace.identityTags"]
            XCTAssertEqual(tags.exists, count > 0)
            XCTAssertFalse(app.images.matching(
                NSPredicate(format: "identifier CONTAINS[c] %@", "avatar")
            ).firstMatch.exists)
            app.terminate()
        }
    }

    func testMenuBarExtraShowsGenericPrivacyCopyWithoutCandidateEvidence() {
        let app = launch(state: "needs-decision")
        let statusItem = app.menuBars.statusItems["Needs decision"]
        XCTAssertTrue(statusItem.waitForExistence(timeout: 5))
        statusItem.click()

        XCTAssertTrue(app.menuItems["Open Quick Panel"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.menuItems["Open Relationship Workspace"].exists)
        XCTAssertTrue(app.menuItems["Open Action Center"].exists)

        let menuText = app.menuBars.firstMatch.descendants(matching: .any)
            .allElementsBoundByAccessibilityElement
            .map(\.label)
            .joined(separator: " ")
        XCTAssertTrue(menuText.contains("Context intake is manual"))
        XCTAssertTrue(menuText.contains("Notifications: off in this MVP"))
        XCTAssertFalse(menuText.contains("Alexandra"))
        XCTAssertFalse(menuText.contains("remote-work"))

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "rc5-build4-menu-bar-privacy-surface"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
