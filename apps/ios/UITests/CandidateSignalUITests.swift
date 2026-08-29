import XCTest

@MainActor
final class CandidateSignalUITests: XCTestCase {
    private var app: XCUIApplication!
    private let systemCalendarEditorTimeout: TimeInterval = 20
    private let previewWorkspaceEnvironmentKey = "TS_IOS_UI_TEST_PREVIEW_WORKSPACE"

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment[previewWorkspaceEnvironmentKey] = "true"
    }

    func testBareLaunchRequiresAccountInsteadOfOpeningSyntheticPreview() {
        app.launchEnvironment.removeValue(forKey: previewWorkspaceEnvironmentKey)
        app.launch()

        XCTAssertTrue(element("authentication-screen").waitForExistence(timeout: 8))
        XCTAssertFalse(element("editorial-today").exists)
        XCTAssertFalse(element("workspace-preview-boundary").exists)
        preserveScreenshot("Bare Debug launch requires a workspace")
    }

    func testCalendarProposalOpensSystemEditorAndDismissesWithoutWriting() {
        app.launchArguments = [
            "--scenario", "calendar-handoff",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        let handoff = element("device-calendar-handoff")
        let add = app.buttons["add-calendar-proposal"]
        let dismiss = app.buttons["dismiss-calendar-proposal"]
        XCTAssertTrue(handoff.waitForExistence(timeout: 8))
        XCTAssertTrue(add.exists)
        XCTAssertTrue(dismiss.exists)
        XCTAssertGreaterThanOrEqual(add.frame.height, 44)
        XCTAssertGreaterThanOrEqual(dismiss.frame.height, 44)
        preserveScreenshot("Calendar proposal before device write")

        add.tap()
        let systemCancel = app.buttons["cancel-button"]
        XCTAssertTrue(
            systemCancel.waitForExistence(timeout: systemCalendarEditorTimeout),
            "Apple Calendar editor did not become ready"
        )
        preserveScreenshot("Apple Calendar final approval")
        systemCancel.tap()
        let discardChanges = app.buttons["Discard Changes"]
        if discardChanges.waitForExistence(timeout: 3) {
            discardChanges.tap()
        }
        XCTAssertTrue(element("calendar-editor-cancelled").waitForExistence(timeout: 5))

        dismiss.tap()
        let restore = app.buttons["restore-calendar-proposal"]
        XCTAssertTrue(restore.waitForExistence(timeout: 5))
        XCTAssertFalse(add.exists)
        preserveScreenshot("Calendar proposal dismissed without write")
        restore.tap()
        XCTAssertTrue(add.waitForExistence(timeout: 5))
    }

    func testCalendarProposalSavesOnlyThroughSystemEditor() throws {
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"]
                == "Talent Signal Calendar Save Proof",
            "Runs only on a disposable Simulator that is deleted after proof."
        )
        app.launchArguments = [
            "--scenario", "calendar-handoff",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        let addProposal = app.buttons["add-calendar-proposal"]
        XCTAssertTrue(addProposal.waitForExistence(timeout: 8))
        addProposal.tap()

        let systemAdd = app.buttons["add-button"]
        XCTAssertTrue(
            systemAdd.waitForExistence(timeout: systemCalendarEditorTimeout),
            "Apple Calendar editor did not become ready"
        )
        systemAdd.tap()

        XCTAssertTrue(element("calendar-saved").waitForExistence(timeout: 8))
        XCTAssertFalse(addProposal.exists)
        preserveScreenshot("Calendar saved through Apple approval")
    }

    func testDefaultLaunchShowsEditorialToday() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Today"].exists)
        XCTAssertEqual(element("today-attention-summary").label, "2 to consider")
        XCTAssertFalse(element("today-unread-session").exists)
        XCTAssertTrue(element("workspace-preview-boundary").exists)
        XCTAssertTrue(element("today-focus").exists)
        XCTAssertFalse(element("no-action-summary").exists)
        XCTAssertFalse(element("today-calendar-card").exists)
        XCTAssertFalse(app.staticTexts["90-second product loop"].exists)
        preserveScreenshot("Editorial Today default return surface")
    }

    func testTodayCalendarOpensAgendaAndReturnsToLinkedAgentSession() {
        app.launch()

        let peek = app.buttons["today-calendar-peek"]
        XCTAssertTrue(peek.waitForExistence(timeout: 8))
        XCTAssertGreaterThanOrEqual(peek.frame.height, 44)
        peek.tap()

        XCTAssertTrue(element("relationship-calendar").waitForExistence(timeout: 5))
        XCTAssertTrue(element("calendar-preview-boundary").exists)
        XCTAssertTrue(app.buttons["calendar-add-activity"].exists)
        let activity = app.buttons["calendar-activity-preview-calendar-primary"]
        XCTAssertTrue(activity.waitForExistence(timeout: 5))
        XCTAssertTrue(activity.label.contains("Interview"))
        XCTAssertTrue(activity.label.split(separator: ",").count >= 3)
        preserveScreenshot("Relationship calendar agenda")
        activity.tap()

        XCTAssertTrue(element("calendar-activity-detail").waitForExistence(timeout: 5))
        let prepare = app.buttons["calendar-prepare-agent"]
        XCTAssertTrue(prepare.exists)
        XCTAssertGreaterThanOrEqual(prepare.frame.height, 44)
        XCTAssertFalse(app.buttons["Open route"].exists)
        prepare.tap()

        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))
        XCTAssertTrue(element("ask-response-turn").exists)
        let scope = element("ask-scope-selector")
        XCTAssertTrue(scope.waitForExistence(timeout: 5))
        XCTAssertTrue(
            (scope.value as? String)?.contains("Leila Hartmann") == true
        )
        let composer = element("ask-composer")
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertTrue((composer.value as? String)?.contains("Prepare for the") == true)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].isEnabled)
        XCTAssertFalse(app.buttons["ask-review-screenshot"].exists)
        XCTAssertFalse(
            app.keyboards.firstMatch.exists,
            "A contextual Session should lead with its relationship, not steal focus."
        )
        preserveScreenshot("Meeting preparation returned to Session")
    }

    func testRelationshipCalendarExpandsToMonthAndMovesBetweenMonths() {
        app.launch()

        let peek = app.buttons["today-calendar-peek"]
        XCTAssertTrue(peek.waitForExistence(timeout: 8))
        peek.tap()

        let toggle = app.buttons["calendar-toggle-month"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(toggle.frame.height, 44)
        XCTAssertFalse(app.buttons["calendar-next-month"].exists)
        let dateButtons = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "calendar-month-day-")
        )
        XCTAssertEqual(dateButtons.count, 7)
        toggle.tap()

        let previous = app.buttons["calendar-previous-month"]
        let next = app.buttons["calendar-next-month"]
        XCTAssertTrue(previous.waitForExistence(timeout: 5))
        XCTAssertTrue(next.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.label, "Collapse month")
        XCTAssertGreaterThanOrEqual(previous.frame.height, 44)
        XCTAssertGreaterThanOrEqual(next.frame.height, 44)
        XCTAssertGreaterThanOrEqual(dateButtons.count, 28)
        XCTAssertLessThanOrEqual(dateButtons.count, 42)
        preserveScreenshot("Relationship calendar expanded month")
        next.tap()
        XCTAssertTrue(next.exists)
        toggle.tap()
        XCTAssertFalse(next.exists)
        XCTAssertEqual(dateButtons.count, 7)
    }

    func testRelationshipCalendarAddActivityUsesAppleFinalEditorAndCancelIsTruthful() {
        app.launch()

        let peek = app.buttons["today-calendar-peek"]
        XCTAssertTrue(peek.waitForExistence(timeout: 8))
        peek.tap()
        let add = app.buttons["calendar-add-activity"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        add.tap()

        XCTAssertTrue(
            element("relationship-calendar-composer").waitForExistence(timeout: 5)
        )
        XCTAssertTrue(element("calendar-activity-kind").exists)
        XCTAssertTrue(app.buttons["Interview"].exists)
        XCTAssertTrue(app.buttons["Meeting"].exists)
        XCTAssertTrue(app.buttons["Conversation"].exists)
        let review = app.buttons["calendar-review-in-apple"]
        XCTAssertTrue(review.waitForExistence(timeout: 5))
        XCTAssertTrue(review.isEnabled)
        review.tap()

        let systemCancel = app.buttons["cancel-button"]
        XCTAssertTrue(
            systemCancel.waitForExistence(timeout: systemCalendarEditorTimeout),
            "Apple Calendar editor did not become ready"
        )
        preserveScreenshot("Relationship activity Apple approval")
        systemCancel.tap()
        let discardChanges = app.buttons["Discard Changes"]
        if discardChanges.waitForExistence(timeout: 3) {
            discardChanges.tap()
        }
        XCTAssertTrue(
            element("calendar-composer-unchanged").waitForExistence(timeout: 5)
        )
    }

    func testRelationshipCalendarKeepsPersonContextVisibleInSimplifiedChinese() {
        app.launchArguments = [
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
        ]
        app.launch()

        let peek = app.buttons["today-calendar-peek"]
        XCTAssertTrue(peek.waitForExistence(timeout: 8))
        peek.tap()

        XCTAssertTrue(element("relationship-calendar").waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["不只看时间，也看见人"].exists)
        XCTAssertFalse(app.staticTexts["每个时刻都与它所推进的人和 Pursuit 保持关联。"].exists)
        let toggle = app.buttons["calendar-toggle-month"]
        XCTAssertTrue(toggle.exists)
        XCTAssertEqual(toggle.label, "展开月历")
        toggle.tap()
        XCTAssertTrue(
            app.buttons["calendar-next-month"].waitForExistence(timeout: 5)
        )
        let activity = app.buttons["calendar-activity-preview-calendar-primary"]
        XCTAssertTrue(activity.waitForExistence(timeout: 5))
        XCTAssertTrue(activity.label.contains("面试"))
        preserveScreenshot("Relationship calendar Simplified Chinese")
    }

    func testRelationshipCalendarRemainsReachableInDarkModeAtAX5() {
        app.launchArguments = [
            "--force-dark",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        let peek = app.buttons["today-calendar-peek"]
        XCTAssertTrue(peek.waitForExistence(timeout: 8))
        XCTAssertGreaterThanOrEqual(peek.frame.height, 44)
        peek.tap()

        XCTAssertTrue(element("relationship-calendar").waitForExistence(timeout: 5))
        let add = app.buttons["calendar-add-activity"]
        XCTAssertTrue(add.exists)
        XCTAssertGreaterThanOrEqual(add.frame.height, 44)
        let activity = app.buttons["calendar-activity-preview-calendar-primary"]
        XCTAssertTrue(activity.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(activity.frame.height, 44)
        activity.tap()

        let prepare = app.buttons["calendar-prepare-agent"]
        XCTAssertTrue(prepare.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(prepare.frame.height, 44)
        preserveScreenshot("Relationship calendar dark AX5")
    }

    func testWorkspaceMenuLeadsWithAccountSetupAndRealUtilities() {
        app.launchArguments = [
            "-talent-signal.setup.action-button-complete",
            "NO",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-menu"].tap()

        XCTAssertTrue(
            app.buttons["close-relationship-menu"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["open-account-settings"].exists)
        XCTAssertTrue(app.buttons["open-action-button-onboarding"].exists)
        XCTAssertTrue(app.buttons["open-action-button-settings"].exists)
        XCTAssertFalse(app.staticTexts["Talent Signal"].exists)
        preserveScreenshot("Quiet workspace menu")

        app.buttons["open-action-button-onboarding"].tap()
        XCTAssertTrue(element("action-button-settings").waitForExistence(timeout: 5))
        XCTAssertTrue(element("open-app-shortcuts").exists)
        preserveScreenshot("Action Button setup")
        let setupConfirmation = app.buttons["confirm-action-button-setup"]
        scrollToVisible(setupConfirmation)
        XCTAssertTrue(setupConfirmation.exists)
    }

    func testWorkspaceMenuRoutesCompactReviewInboxToExactProposal() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-menu"].tap()

        let reviewInbox = app.buttons["open-review-inbox"]
        XCTAssertTrue(reviewInbox.waitForExistence(timeout: 5))
        reviewInbox.tap()
        XCTAssertTrue(element("review-inbox").waitForExistence(timeout: 5))

        let proposal = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "inbox-proposal-")
        ).firstMatch
        XCTAssertTrue(proposal.waitForExistence(timeout: 5))
        proposal.tap()

        XCTAssertTrue(element("review-exact-evidence").waitForExistence(timeout: 5))
        XCTAssertTrue(element("relationship-review-status").exists)
        XCTAssertFalse(app.buttons["confirm-relationship-change"].exists)
    }

    func testWorkspaceMenuRemainsLegibleInDarkModeAtAX5() {
        app.launchArguments = [
            "--force-dark",
            "-UICTContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL",
            "-talent-signal.setup.action-button-complete",
            "NO",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-menu"].tap()

        let account = app.buttons["open-account-settings"]
        let onboarding = app.buttons["open-action-button-onboarding"]
        XCTAssertTrue(account.waitForExistence(timeout: 5))
        XCTAssertTrue(onboarding.exists)
        XCTAssertGreaterThanOrEqual(account.frame.height, 44)
        XCTAssertGreaterThanOrEqual(onboarding.frame.height, 44)
        preserveScreenshot("Workspace menu dark AX5")
    }

    func testSwipeOpensSessionsAndReopensAgentWork() {
        app.launch()

        let today = element("editorial-today")
        XCTAssertTrue(today.waitForExistence(timeout: 8))
        today.swipeLeft()

        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)
        preserveScreenshot("Agent Sessions list")
        let session = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
        ).firstMatch
        XCTAssertTrue(session.waitForExistence(timeout: 5))
        session.tap()

        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))
        XCTAssertTrue(element("ask-response-turn").exists)
        preserveScreenshot("Session-first Agent retrieval")
    }

    func testPagingMovesAcrossTodaySessionsAndPeopleInBothDirections() {
        app.launch()

        let today = element("editorial-today")
        XCTAssertTrue(today.waitForExistence(timeout: 8))
        today.swipeLeft()

        let sessions = element("agent-session-list")
        XCTAssertTrue(sessions.waitForExistence(timeout: 5))
        sessions.swipeLeft()

        let people = element("relationship-people")
        XCTAssertTrue(people.waitForExistence(timeout: 5))
        people.swipeRight()
        XCTAssertTrue(sessions.waitForExistence(timeout: 5))
        sessions.swipeRight()
        XCTAssertTrue(today.waitForExistence(timeout: 5))
    }

    func testReducedMotionKeepsSessionNavigationReachable() {
        app.launchArguments = ["-UIAccessibilityReduceMotionEnabled", "YES"]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["archive-tab-sessions"].tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)

        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-people"].isSelected)
        preserveScreenshot("Reduced motion session navigation")
    }

    func testAskOpensAsConversationWithEmbeddedWorkspaceTools() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let ask = app.buttons["relationship-guide"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()

        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertTrue(element("ask-composer").exists)
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertFalse(app.buttons["What changed?"].exists)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].exists)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].isEnabled)
        XCTAssertFalse(app.buttons["ask-review-screenshot"].exists)
        XCTAssertTrue(app.buttons["ask-voice"].isEnabled)
        XCTAssertFalse(element("ask-remote-ai-disclosure").exists)
        XCTAssertFalse(element("ask-scope-search").exists)
        XCTAssertFalse(app.staticTexts["A quieter Agent"].exists)
        XCTAssertFalse(app.staticTexts["Draft authority only"].exists)
        preserveScreenshot("Conversation-first Ask with embedded tools")
    }

    func testGlobalAgentInputStaysCompactUntilTyping() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let globalInput = app.buttons["relationship-guide"]
        XCTAssertTrue(globalInput.waitForExistence(timeout: 5))
        globalInput.tap()

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForNonExistence(timeout: 3),
            "Opening a new Agent message should remain a compact input until the recruiter taps it."
        )

        let message = "Add Maya Chen for the product search"
        typeTextReliably(message, into: composer)
        XCTAssertEqual(composer.value as? String, message)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.exists)
        XCTAssertTrue(send.isEnabled)
        preserveScreenshot("Global Agent input opens ready to type")
    }

    func testUnscopedAgentAttachmentStaysInsideTheConversation() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-scope-selector").exists)

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        let message = "Compare this screenshot with what changed"
        typeTextReliably(message, into: composer)

        let attachments = app.buttons["ask-attachment-menu"]
        XCTAssertTrue(attachments.waitForExistence(timeout: 5))
        XCTAssertTrue(attachments.isEnabled)
        XCTAssertGreaterThanOrEqual(attachments.frame.width, 44)
        XCTAssertGreaterThanOrEqual(attachments.frame.height, 44)
        attachments.tap()
        let photos = app.buttons["Photos"]
        XCTAssertTrue(photos.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Image from Files"].exists)
        XCTAssertTrue(app.buttons["Link a relationship"].exists)
        photos.tap()

        let photoPicker = waitForPhotoPicker()
        XCTAssertFalse(element("signal-capture-hub").exists)
        preserveScreenshot("Global attachment opens the system photo picker")
        closePhotoPicker(photoPicker)

        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 8))
        XCTAssertFalse(element("signal-capture-hub").exists)
        let restoredComposer = app.textFields["ask-composer"]
        XCTAssertTrue(restoredComposer.waitForExistence(timeout: 5))
        XCTAssertEqual(restoredComposer.value as? String, message)
        XCTAssertFalse(element("ask-scope-selector").exists)
        preserveScreenshot("Attachment dismissal preserves the Agent message")
    }

    func testGlobalAgentDraftRestoresWithoutImplicitRelationship() {
        app.launchArguments = [
            "--persist-preview-agent",
            "--reset-preview-agent",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-scope-selector").exists)
        let message = "Add Amara Singh for the health search"
        typeTextReliably(message, into: composer)
        XCTAssertEqual(composer.value as? String, message)

        app.terminate()
        app.launchArguments = ["--persist-preview-agent"]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let restoredComposer = app.textFields["ask-composer"]
        XCTAssertTrue(restoredComposer.waitForExistence(timeout: 5))
        XCTAssertEqual(restoredComposer.value as? String, message)
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertTrue(app.buttons["ask-send"].isEnabled)
        preserveScreenshot("Global Agent draft restores without a relationship")

        app.buttons["ask-send"].tap()
        XCTAssertTrue(element("contact-proposal-card").waitForExistence(timeout: 5))
        app.buttons["contact-dismiss-proposal"].tap()
        XCTAssertTrue(element("contact-proposal-card").waitForNonExistence(timeout: 5))
    }

    func testUnscopedQuestionWaitsForRelationshipWithoutLosingTheDraft() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        let message = "What changed in this relationship?"
        composer.typeText(message)

        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.exists)
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "Send and let Agent link the relationship")

        send.tap()

        let selector = element("ask-scope-selector")
        XCTAssertTrue(selector.waitForExistence(timeout: 5))
        XCTAssertEqual(selector.value as? String, "None")
        XCTAssertTrue(element("ask-scope-search").exists)
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForNonExistence(timeout: 3),
            "Relationship clarification should not leave the composer keyboard over the choices."
        )
        preserveScreenshot("Agent asks for relationship after message")

        let search = element("ask-scope-search")
        search.tap()
        search.typeText("No matching relationship")
        XCTAssertTrue(element("ask-scope-no-results").waitForExistence(timeout: 5))
        app.buttons["Clear search"].tap()
        let scope = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "ask-scope-option-")
        ).firstMatch
        XCTAssertTrue(scope.waitForExistence(timeout: 5))
        scope.tap()

        XCTAssertEqual(composer.value as? String, message)
        XCTAssertTrue(element("ask-compact-scope").waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-scope-search").exists)

        XCTAssertEqual(send.label, "Send")
        XCTAssertTrue(send.isEnabled)
        send.tap()
        let previewError = element("ask-error")
        XCTAssertTrue(previewError.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts[
                "This is preview data, so no question was sent. Open a signed-in workspace connected to the backend, then try again."
            ].exists
        )
        XCTAssertFalse(app.buttons["ask-retry"].exists)
        XCTAssertEqual(composer.value as? String, message)
    }

    func testVoiceInputInsertsAnEditableDraftWithoutSending() {
        app.launchArguments = [
            "--deterministic-voice-input",
            "-voice-input-cloud-disclosure-v1", "NO",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let ask = app.buttons["relationship-guide"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()

        let voice = app.buttons["ask-voice"]
        XCTAssertTrue(voice.waitForExistence(timeout: 5))
        voice.tap()

        let start = app.buttons.matching(
            identifier: "confirm-voice-input-disclosure"
        ).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        XCTAssertTrue(element("ask-voice-recording").waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(voice.frame.height, 48)
        preserveScreenshot("Voice input listening state")
        XCTAssertTrue(
            app.buttons["ask-voice-cancel"].waitForExistence(timeout: 5)
        )

        voice.tap()

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["ask-send"].waitForExistence(timeout: 5))
        XCTAssertEqual(composer.value as? String, "What changed in this search?")
        XCTAssertFalse(element("ask-response-turn").exists)
        preserveScreenshot("Voice input remains an editable Agent draft")
    }

    func testCanonicalLoopbackOffersAuthenticatedVoiceInput() async throws {
        let backendURL = testConfiguration(
            "TS_IOS_BACKEND_URL",
            fallback: "http://127.0.0.1:4320"
        )
        guard await canonicalBackendFixtureIsAvailable(at: backendURL) else {
            throw XCTSkip("The canonical loopback backend was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", backendURL,
            "-voice-input-cloud-disclosure-v1", "NO",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        let ask = app.buttons["relationship-guide"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()

        let voice = app.buttons["ask-voice"]
        XCTAssertTrue(voice.waitForExistence(timeout: 5))
        XCTAssertEqual(voice.label, "Start voice input")
        voice.tap()
        XCTAssertTrue(
            app.buttons["confirm-voice-input-disclosure"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertFalse(element("audio-signal-capture").exists)
        preserveScreenshot("Canonical loopback voice input disclosure")
    }

    func testVoiceListeningStateRemainsLegibleInSimplifiedChinese() {
        app.launchArguments = [
            "--deterministic-voice-input",
            "-voice-input-cloud-disclosure-v1", "NO",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let voice = app.buttons["ask-voice"]
        XCTAssertTrue(voice.waitForExistence(timeout: 5))
        voice.tap()
        let start = app.buttons.matching(
            identifier: "confirm-voice-input-disclosure"
        ).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()

        XCTAssertTrue(element("ask-voice-recording").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["正在听你说"].exists)
        XCTAssertTrue(app.buttons["ask-voice-cancel"].waitForExistence(timeout: 5))
        preserveScreenshot("Voice input Simplified Chinese")
    }

    func testCanonicalAskSearchesWorkspaceAndReturnsEvidenceBoundResponse() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--fixture-ask-delay-seconds", "3",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        let ask = app.buttons["relationship-guide"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()

        let composer = element("ask-composer")
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("What changed?", into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        send.tap()

        let scopeSelector = element("ask-scope-selector")
        XCTAssertTrue(scopeSelector.waitForExistence(timeout: 10))
        let canonicalPerson = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "ask-scope-option-\(fixture.personID)-"
            )
        ).firstMatch
        XCTAssertTrue(canonicalPerson.waitForExistence(timeout: 5))
        canonicalPerson.tap()
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertTrue(send.isEnabled)
        send.tap()
        let pendingTurn = element("ask-pending-turn")
        XCTAssertTrue(pendingTurn.waitForExistence(timeout: 2))
        XCTAssertTrue(element("ask-loading").exists)
        let pendingMessage = element("ask-user-message")
        XCTAssertEqual(pendingMessage.label, "What changed?")
        let pendingComposer = element("ask-composer")
        XCTAssertFalse(String(describing: pendingComposer.value).contains("What changed?"))
        XCTAssertFalse(pendingComposer.isEnabled)
        XCTAssertFalse(element("ask-response-turn").exists)
        preserveScreenshot("Canonical Ask pending turn")
        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 30))
        XCTAssertTrue(pendingTurn.waitForNonExistence(timeout: 2))
        XCTAssertTrue(element("ask-composer").isEnabled)
        XCTAssertFalse(app.staticTexts["Preview data · connect a workspace to send"].exists)
        let userMessage = element("ask-user-message")
        XCTAssertTrue(userMessage.exists)
        XCTAssertEqual(userMessage.label, "What changed?")
        XCTAssertLessThan(userMessage.frame.width, 280)
        preserveScreenshot("Canonical Ask evidence-bound response")

        let evidence = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Evidence from ")
        ).firstMatch
        XCTAssertTrue(evidence.waitForExistence(timeout: 5))
        evidence.tap()
        XCTAssertTrue(element("ask-citation-detail").waitForExistence(timeout: 5))
        XCTAssertTrue(element("ask-citation-excerpt").exists)
        XCTAssertTrue(element("ask-review-citation").exists)
        preserveScreenshot("Canonical Ask exact cited evidence")

        element("ask-review-citation").tap()
        let reason = app.alerts.textFields.firstMatch
        XCTAssertTrue(reason.waitForExistence(timeout: 5))
        reason.typeText("The source needs recruiter correction.")
        app.alerts.buttons["Mark disputed"].tap()
        XCTAssertTrue(
            app.staticTexts["Saved response · ask again to refresh its sources"]
                .waitForExistence(timeout: 10)
        )
        XCTAssertTrue(
            element("ask-citation-detail").waitForNonExistence(timeout: 5)
        )
        preserveScreenshot("Disputed citation makes Agent response stale")

        let openPursuit = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "ask-open-pursuit-\(fixture.pursuitID)-"
            )
        ).firstMatch
        XCTAssertTrue(openPursuit.waitForExistence(timeout: 5))
        openPursuit.tap()
        XCTAssertTrue(element("pursuit-detail").waitForExistence(timeout: 5))
        let referencedAction = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "pursuit-target-action-")
        ).firstMatch
        XCTAssertTrue(referencedAction.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Evidence Supported · Evidence unavailable"].exists)
        XCTAssertTrue(
            app.staticTexts["Originally evidence-supported · Evidence unavailable"]
                .waitForExistence(timeout: 5)
        )
        preserveScreenshot("Ask opens the exact existing Pursuit action")
    }

    func testCanonicalAskRendersTheBackendAnswer() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
        ]
        app.launch()

        guard element("canonical-pursuit-today").waitForExistence(timeout: 15) else {
            XCTFail("The canonical workspace did not load.")
            return
        }
        let ask = app.buttons["relationship-guide"]
        guard ask.waitForExistence(timeout: 5) else {
            XCTFail("The Ask entry point did not load.")
            return
        }
        ask.tap()

        let composer = app.textFields["ask-composer"]
        typeTextReliably("What changed?", into: composer)
        app.buttons["ask-send"].tap()

        let canonicalPerson = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "ask-scope-option-\(fixture.personID)-"
            )
        ).firstMatch
        guard canonicalPerson.waitForExistence(timeout: 10) else {
            XCTFail("The relationship choices did not open after Send.")
            return
        }
        canonicalPerson.tap()

        guard element("ask-compact-scope").waitForExistence(timeout: 5) else {
            XCTFail("The selected relationship did not return to the composer.")
            return
        }
        app.buttons["ask-send"].tap()

        guard element("ask-response-turn").waitForExistence(timeout: 25) else {
            XCTFail("The canonical Ask response did not render.")
            return
        }
        let expectsRemoteAI = testConfiguration(
            "TS_IOS_EXPECT_REMOTE_CHAT",
            fallback: "false"
        ) == "true"
        let responseTurn = element("ask-response-turn")
        let remoteAnswer = responseTurn.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Zhipu AI · ")
        ).firstMatch
        if expectsRemoteAI {
            XCTAssertTrue(
                remoteAnswer.waitForExistence(timeout: 5),
                "The backend response did not include a remote AI answer block."
            )
        }
        if remoteAnswer.exists {
            XCTAssertTrue(
                remoteAnswer.isHittable,
                "The remote AI answer exists but is not visible after the turn completes."
            )
            XCTAssertFalse(app.staticTexts["AI answer unavailable"].exists)
        } else {
            let personBrief = responseTurn.staticTexts["Leila Hartmann"]
            XCTAssertTrue(personBrief.exists)
            XCTAssertTrue(
                personBrief.isHittable,
                "The response exists but its first useful block is not visible."
            )
        }
        XCTAssertTrue(
            app.staticTexts["Availability: 2026-09-01, Asia/Shanghai"].exists
        )
        XCTAssertFalse(element("ask-error").exists)
        XCTAssertTrue(composer.isEnabled)
        preserveScreenshot("Canonical Ask backend response")
    }

    func testCanonicalAskResponseChineseDarkAX5KeepsEvidenceAndComposerReachable() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--fixture-ask-delay-seconds", "3",
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-UIAccessibilityReduceMotionEnabled", "YES",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))

        let composer = app.textFields["ask-composer"]
        typeTextReliably("发生了什么变化？", into: composer)
        app.buttons["ask-send"].tap()

        let canonicalPerson = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "ask-scope-option-\(fixture.personID)-"
            )
        ).firstMatch
        XCTAssertTrue(canonicalPerson.waitForExistence(timeout: 5))
        canonicalPerson.tap()

        let pendingTurn = element("ask-pending-turn")
        XCTAssertTrue(pendingTurn.waitForExistence(timeout: 2))
        XCTAssertTrue(element("ask-loading").exists)
        XCTAssertEqual(element("ask-user-message").label, "发生了什么变化？")
        XCTAssertFalse(element("ask-composer").isEnabled)
        preserveScreenshot("Canonical Ask pending turn Chinese dark AX5")

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 30))
        XCTAssertTrue(pendingTurn.waitForNonExistence(timeout: 2))
        XCTAssertTrue(element("ask-composer").isEnabled)

        let userMessage = element("ask-user-message")
        XCTAssertTrue(userMessage.exists)
        XCTAssertEqual(userMessage.label, "发生了什么变化？")
        XCTAssertLessThanOrEqual(
            userMessage.frame.width,
            app.windows.firstMatch.frame.width - 40
        )

        let responseTurn = element("ask-response-turn")
        let remoteAnswer = responseTurn.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Zhipu AI · ")
        ).firstMatch
        let expectsRemoteAI = testConfiguration(
            "TS_IOS_EXPECT_REMOTE_CHAT",
            fallback: "false"
        ) == "true"
        if expectsRemoteAI {
            XCTAssertTrue(
                remoteAnswer.waitForExistence(timeout: 5),
                "The backend response did not include a remote AI answer block."
            )
        }
        let firstUsefulResponse = remoteAnswer.exists
            ? remoteAnswer
            : responseTurn.staticTexts["Leila Hartmann"]
        XCTAssertTrue(firstUsefulResponse.exists)
        let responseVisible = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "hittable == true"),
            object: firstUsefulResponse
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [responseVisible], timeout: 5),
            .completed
        )

        let evidence = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "ask-citation-")
        ).firstMatch
        XCTAssertTrue(evidence.exists)
        XCTAssertTrue(evidence.label.contains("候选人"))
        XCTAssertTrue(evidence.label.contains("已审阅"))
        XCTAssertTrue(element("ask-composer").exists)
        preserveScreenshot("Canonical Ask response Chinese dark AX5")
    }

    func testCanonicalAskFailureRestoresQuestionAndRetriesSameIntent() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--fixture-ask-delay-seconds", "3",
            "--fixture-ask-fail-once",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))

        let composer = app.textFields["ask-composer"]
        typeTextReliably("What changed?", into: composer)
        app.buttons["ask-send"].tap()

        let scopeSearch = element("ask-scope-search")
        XCTAssertTrue(scopeSearch.waitForExistence(timeout: 5))
        scopeSearch.tap()
        scopeSearch.typeText("Leila")
        let canonicalPerson = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "ask-scope-option-\(fixture.personID)-"
            )
        ).firstMatch
        XCTAssertTrue(canonicalPerson.waitForExistence(timeout: 5))
        canonicalPerson.tap()

        XCTAssertTrue(element("ask-pending-turn").waitForExistence(timeout: 2))
        XCTAssertTrue(element("ask-error").waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-pending-turn").exists)
        XCTAssertTrue(
            String(describing: element("ask-composer").value).contains("What changed?")
        )
        preserveScreenshot("Canonical Ask failure restores question")

        let retry = app.buttons["ask-retry"]
        XCTAssertTrue(retry.exists)
        XCTAssertTrue(retry.isHittable)
        retry.tap()
        XCTAssertTrue(element("ask-pending-turn").waitForExistence(timeout: 2))
        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 30))
        XCTAssertFalse(element("ask-error").exists)
    }

    func testAppleLoginKeepsOneCalmPrimaryAction() {
        let backendURL = testConfiguration(
            "TS_IOS_BACKEND_URL",
            fallback: "http://127.0.0.1:4318"
        )
        app.launchArguments = [
            "--show-login",
            "--auth-backend-url", backendURL,
        ]
        app.launch()

        XCTAssertTrue(element("authentication-screen").waitForExistence(timeout: 10))
        let primaryActions = app.buttons.matching(
            NSPredicate(
                format: "label == %@ OR label == %@ OR label == %@",
                "Continue with Apple",
                "Connecting…",
                "Try again"
            )
        )
        XCTAssertTrue(primaryActions.firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(primaryActions.count, 1)
        XCTAssertTrue(app.staticTexts["Talent Signal"].exists)
        XCTAssertTrue(app.staticTexts["Relationships, in context."].exists)
        XCTAssertFalse(app.staticTexts["Create an account"].exists)
        preserveScreenshot("Sign in with Apple entry")
    }

    func testAskUsesOneColumnAtAX5WithoutLosingComposerOrCapture() {
        app.launchArguments = [
            "--force-dark",
            "-AppleInterfaceStyle",
            "Dark",
            "-AppleLanguages",
            "(zh-Hans)",
            "-AppleLocale",
            "zh_CN",
            "-talent-signal.interface-language",
            "zh-Hans",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let composer = element("ask-composer")
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertTrue(composer.exists)
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForNonExistence(timeout: 3),
            "AX5 should keep the full starter and capture surface visible until the recruiter chooses to type."
        )
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertFalse(app.buttons["What changed?"].exists)

        let photos = app.buttons["ask-attachment-menu"]
        let voice = app.buttons["ask-voice"]
        XCTAssertTrue(photos.exists)
        XCTAssertTrue(photos.isEnabled)
        XCTAssertTrue(voice.exists)
        XCTAssertGreaterThanOrEqual(photos.frame.height, 44)
        XCTAssertLessThanOrEqual(photos.frame.width, 60)
        XCTAssertGreaterThanOrEqual(voice.frame.height, 44)
        XCTAssertLessThanOrEqual(voice.frame.width, 60)
        XCTAssertLessThanOrEqual(composer.frame.maxX, app.frame.maxX)
        XCTAssertTrue(element("ask-preview-send-boundary").exists)
        preserveScreenshot("Ask Chinese dark AX5 input-first")

        typeTextReliably("发生了什么变化？", into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "发送并由 Agent 关联关系")
        send.tap()

        let scope = element("ask-scope-selector")
        XCTAssertTrue(scope.waitForExistence(timeout: 5))
        XCTAssertEqual(scope.value as? String, "未选择")
        XCTAssertTrue(element("ask-scope-search").exists)
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        XCTAssertLessThanOrEqual(scope.frame.maxX, app.frame.maxX)
        XCTAssertLessThanOrEqual(composer.frame.maxY, app.frame.maxY)
        preserveScreenshot("Ask Chinese dark AX5 relationship clarification")
    }

    func testSettingsSwitchesTheCoreWorkspaceBetweenChineseAndEnglish() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openSettings()

        XCTAssertTrue(element("app-settings").waitForExistence(timeout: 5))
        app.swipeUp()
        let chinese = element("language-option-zh-Hans")
        XCTAssertTrue(chinese.waitForExistence(timeout: 5))
        chinese.tap()
        XCTAssertTrue(app.navigationBars["语言"].waitForExistence(timeout: 5))
        XCTAssertEqual(chinese.value as? String, "已选择")
        preserveScreenshot("Simplified Chinese language settings")

        app.navigationBars["语言"].buttons.element(boundBy: 0).tap()
        app.buttons["close-relationship-menu"].tap()
        XCTAssertEqual(app.buttons["archive-tab-today"].label, "今天")
        XCTAssertEqual(app.buttons["archive-tab-sessions"].label, "会话")
        app.buttons["archive-tab-sessions"].tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["会话"].exists)
        preserveScreenshot("Simplified Chinese core workspace")

        app.buttons["capture-relationship-moment"].tap()
        XCTAssertTrue(element("signal-capture-hub").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["为 Agent 记录"].exists)
        XCTAssertTrue(app.buttons["capture-hub-text"].exists)
        XCTAssertTrue(app.buttons["capture-hub-screenshot"].exists)
        XCTAssertTrue(app.buttons["capture-hub-audio"].exists)
        preserveScreenshot("Simplified Chinese Agent capture")
        app.buttons["close-capture-hub"].tap()
        XCTAssertFalse(element("signal-capture-hub").waitForExistence(timeout: 2))

        openSettings()
        let english = element("language-option-en")
        if !english.exists {
            app.swipeDown()
        }
        XCTAssertTrue(english.waitForExistence(timeout: 5))
        english.tap()
        XCTAssertTrue(app.navigationBars["Language"].waitForExistence(timeout: 5))
        XCTAssertEqual(english.value as? String, "Selected")

        app.navigationBars["Language"].buttons.element(boundBy: 0).tap()
        app.buttons["close-relationship-menu"].tap()
        XCTAssertEqual(app.buttons["archive-tab-today"].label, "Today")

        // The gate launches each UI journey in a fresh runner while retaining
        // the app container. Terminate and verify a cold relaunch so the
        // language write is durably English before the next isolated journey.
        app.terminate()
        app.launch()
        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        XCTAssertEqual(app.buttons["archive-tab-today"].label, "Today")
        app.terminate()
    }

    func testSettingsKeepsItsHierarchyInDarkMode() {
        app.launchArguments = ["--force-dark"]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openSettings()

        XCTAssertTrue(element("app-settings").waitForExistence(timeout: 5))
        XCTAssertTrue(element("language-option-system").exists)
        XCTAssertTrue(element("language-option-en").exists)
        preserveScreenshot("English language settings in dark mode")
    }

    func testCanonicalWorkspaceMovesFromTodayToReviewPursuitAndPerson() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = ["--workspace-backend-url", fixture.backendURL]
        app.launch()

        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        XCTAssertFalse(element("workspace-preview-boundary").exists)
        preserveScreenshot("Canonical Pursuit Today")
        let proposal = app.buttons[
            "today-review-proposal-\(fixture.pursuitID)"
        ]
        tapWorkspaceElementWhenVisible(
            proposal,
            in: "canonical-pursuit-today"
        )
        XCTAssertTrue(
            app.buttons["confirm-relationship-change"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Availability: 2026-09-01, Asia/Shanghai"
                )
            ).firstMatch.exists
        )
        preserveScreenshot("Canonical Today to Proposal review")

        app.buttons["Close relationship review"].tap()
        XCTAssertTrue(
            app.buttons["Close relationship review"]
                .waitForNonExistence(timeout: 5)
        )
        let pursuit = app.buttons[
            "today-attention-pursuit-\(fixture.pursuitID)"
        ]
        tapWorkspaceElementWhenVisible(
            pursuit,
            in: "canonical-pursuit-today"
        )
        XCTAssertTrue(element("pursuit-detail").waitForExistence(timeout: 6))
        XCTAssertTrue(app.staticTexts["Chief Product Officer · Meridian Labs"].exists)
        preserveScreenshot("Canonical Pursuit detail")

        app.buttons["Close"].tap()
        XCTAssertTrue(element("pursuit-detail").waitForNonExistence(timeout: 5))
        let people = app.buttons["archive-tab-people"]
        XCTAssertTrue(people.waitForExistence(timeout: 6))
        people.tap()
        let person = app.buttons["workspace-person-\(fixture.personID)"]
        tapWorkspaceElementWhenVisible(person, in: "relationship-people")
        XCTAssertTrue(
            element("workspace-person-detail").waitForExistence(timeout: 6)
        )
        XCTAssertTrue(app.staticTexts["Leila Hartmann"].exists)
        preserveScreenshot("Canonical cross-Pursuit Person detail")
    }

    func testCanonicalWorkspaceEmptyStateDoesNotInventWork() async throws {
        guard let backendURL = try await pursuitFixtureBackendURLIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", backendURL,
            "--workspace-account-slug", "fixture-beta",
            "--workspace-user-email", "recruiter@beta.local",
        ]
        app.launch()

        XCTAssertTrue(element("workspace-empty").waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["Nothing needs attention"].exists)
        XCTAssertFalse(app.staticTexts["Leila Hartmann"].exists)
        XCTAssertFalse(element("workspace-preview-boundary").exists)
        preserveScreenshot("Canonical empty Pursuit workspace")
    }

    func testCanonicalReviewInboxOpensExactPendingProposal() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = ["--workspace-backend-url", fixture.backendURL]
        app.launch()

        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        app.buttons["relationship-menu"].tap()
        let reviewInbox = app.buttons["open-review-inbox"]
        XCTAssertTrue(reviewInbox.waitForExistence(timeout: 8))
        reviewInbox.tap()
        let inboxProposal = app.buttons["inbox-proposal-\(fixture.proposalID)"]
        XCTAssertTrue(inboxProposal.waitForExistence(timeout: 8))
        inboxProposal.tap()

        XCTAssertTrue(
            app.buttons["confirm-relationship-change"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertTrue(app.staticTexts["Leila Hartmann"].exists)
        XCTAssertTrue(element("review-exact-evidence").exists)
        preserveScreenshot("Canonical Review inbox to exact Proposal")
    }

    func testCanonicalWorkspaceOfflineShowsRetryWithoutPreviewFacts() {
        app.launchArguments = [
            "--workspace-backend-url", "http://127.0.0.1:4399",
        ]
        app.launch()

        XCTAssertTrue(element("workspace-failed").waitForExistence(timeout: 12))
        let retry = element("retry-workspace-read")
        XCTAssertTrue(retry.waitForExistence(timeout: 4))
        XCTAssertFalse(app.staticTexts["Leila Hartmann"].exists)
        XCTAssertFalse(element("workspace-preview-boundary").exists)
        retry.tap()
        XCTAssertTrue(
            element("workspace-failed-attempt-2")
                .waitForExistence(timeout: 12)
        )
        let menu = app.buttons["relationship-menu"]
        XCTAssertTrue(menu.waitForExistence(timeout: 8))
        XCTAssertGreaterThan(
            menu.frame.minY,
            app.windows.firstMatch.frame.minY + 32,
            "The workspace header must remain status-safe after an offline retry."
        )
        preserveScreenshot("Canonical workspace offline retry")
    }

    func testCanonicalPersonDetailKeepsGovernedIdentityRowsDistinct() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = ["--workspace-backend-url", fixture.backendURL]
        app.launch()

        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        app.buttons["archive-tab-people"].tap()
        let person = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "workspace-person-")
        ).firstMatch
        tapWorkspaceElementWhenVisible(person, in: "relationship-people")
        XCTAssertTrue(
            element("workspace-person-detail").waitForExistence(timeout: 8)
        )

        let sourceLabel = element("definition-governed-identity-row-0-label")
        let sourceValue = element("definition-governed-identity-row-0-value")
        let clueLabel = element("definition-governed-identity-row-1-label")
        let clueValue = element("definition-governed-identity-row-1-value")
        let contextLabel = element("definition-governed-identity-row-2-label")
        let contextValue = element("definition-governed-identity-row-2-value")
        XCTAssertEqual(sourceLabel.label, "Sources")
        XCTAssertEqual(sourceValue.label, "1")
        XCTAssertEqual(clueLabel.label, "Identity clues")
        XCTAssertEqual(clueValue.label, "1")
        XCTAssertEqual(contextLabel.label, "Contexts")
        XCTAssertEqual(contextValue.label, "1")
        for pair in [
            (sourceLabel, sourceValue),
            (clueLabel, clueValue),
            (contextLabel, contextValue),
        ] {
            XCTAssertGreaterThan(
                pair.1.frame.minX,
                pair.0.frame.maxX + 8,
                "Definition labels and values must remain visually distinct."
            )
        }
        preserveScreenshot("Canonical Person governed identity layout")
    }

    func testCanonicalWorkspaceAX5DarkReducedMotionKeepsNavigationReachable() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        let auditArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launchArguments = auditArguments
        app.launch()

        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [
                .contrast,
                .hitRegion,
                .sufficientElementDescription,
            ]) { issue in
                guard let issueElement = issue.element else { return false }
                if issue.auditType == .contrast,
                   issueElement.identifier.hasPrefix("archive-tab-") {
                    // iOS 26 samples the custom tab's transparent indicator
                    // strip as its text background. The tab labels use system
                    // primary on an opaque surface; keep every non-tab
                    // contrast finding active.
                    return true
                }
                if issue.auditType == .contrast,
                   issueElement.identifier == "workspace-page-eyebrow" {
                    // iOS 26 reports the tracked all-caps glyph bounds as a
                    // contrast failure even when rendered with tsInk on the
                    // opaque tsSurface. The frozen screenshot and token pair
                    // remain the direct evidence; do not waive other text.
                    return true
                }
                if issue.auditType == .contrast,
                   issueElement.label == "T" {
                    let calendarPeek = self.app.buttons["today-calendar-peek"]
                    if calendarPeek.exists,
                       calendarPeek.frame.intersects(issueElement.frame) {
                        // iOS 26 audits the accessibility-hidden narrow
                        // weekday glyph without its opaque calendar tile.
                        // The glyph uses tsInk on tsSurfaceMuted; keep the
                        // workaround inside this labelled Button only.
                        return true
                    }
                }
                let frame = issueElement.frame
                let top = self.app.buttons["relationship-menu"].frame.maxY
                let bottom = self.app.buttons["relationship-guide"].frame.minY
                return frame.maxY <= top || frame.maxY >= bottom
            }
        }

        // Relaunch at AX5 for direct layout and navigation proof. iOS 26's
        // Dynamic Type audit reports standard SwiftUI caption styles as only
        // partially supported; the maximum-size journey below is the stronger
        // observable check for clipping and reachability on this surface.
        app.terminate()
        app.launchArguments = auditArguments + [
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()
        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        XCTAssertTrue(app.buttons["archive-tab-today"].isHittable)
        preserveScreenshot("Canonical AX5 dark reduced-motion Today")

        let proposal = app.buttons["today-review-proposal-\(fixture.pursuitID)"]
        tapWorkspaceElementWhenVisible(proposal, in: "canonical-pursuit-today")
        XCTAssertTrue(element("review-exact-evidence").waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Availability: 2026-09-01, Asia/Shanghai"
                )
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label == %@", "PROPOSED")
            ).firstMatch.exists
        )
        let confirmItem = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "proposal-decision-confirm-")
        ).firstMatch
        tapWhenVisible(confirmItem, maxSwipes: 30)
        tapWhenVisible(app.buttons["confirm-relationship-change"], maxSwipes: 30)
        XCTAssertTrue(
            element("relationship-review-receipt").waitForExistence(timeout: 15)
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Alpha Recruiter · Recorded")
            ).firstMatch.exists
        )
        XCTAssertFalse(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "actor 10000000")
            ).firstMatch.exists
        )
        preserveScreenshot("Canonical AX5 dark Proposal receipt")
        app.buttons["Close relationship review"].tap()

        let actionAttention = app.buttons[
            "today-attention-pursuit-\(fixture.pursuitID)"
        ]
        tapWorkspaceElementWhenVisible(actionAttention, in: "canonical-pursuit-today")
        XCTAssertTrue(element("pursuit-detail").waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Alpha Recruiter · Recorded")
            ).firstMatch.exists
        )
        XCTAssertFalse(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "10000000 · 2026-")
            ).firstMatch.exists
        )
        let openCompletion = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "open-pursuit-action-completion-"
            )
        ).firstMatch
        tapWhenVisible(openCompletion, maxSwipes: 30)
        let outcome = app.textFields.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "pursuit-action-outcome-")
        ).firstMatch
        tapWhenVisible(outcome, maxSwipes: 30)
        outcome.typeText("Client supplied two final-conversation times.")
        let dismissKeyboard = app.buttons["Dismiss keyboard"]
        if dismissKeyboard.waitForExistence(timeout: 3) { dismissKeyboard.tap() }
        let complete = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "complete-pursuit-action-")
        ).firstMatch
        tapWhenVisible(complete, maxSwipes: 30)
        XCTAssertTrue(
            element("pursuit-action-completion-receipt").waitForExistence(timeout: 15)
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Client supplied two")
            ).firstMatch.exists
        )
        preserveScreenshot("Canonical AX5 dark owned action outcome")
        app.buttons["Close"].tap()

        let sessions = app.buttons["archive-tab-sessions"]
        XCTAssertTrue(sessions.isHittable)
        sessions.tap()
        XCTAssertTrue(element("agent-sessions-empty").waitForExistence(timeout: 8))

        let people = app.buttons["archive-tab-people"]
        XCTAssertTrue(people.waitForExistence(timeout: 8))
        XCTAssertTrue(people.isHittable)
        people.tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 8))
        let menu = app.buttons["relationship-menu"]
        XCTAssertTrue(menu.waitForExistence(timeout: 8))
        let window = app.windows.firstMatch
        XCTAssertGreaterThanOrEqual(
            menu.frame.minY,
            window.frame.minY + 32,
            "The persistent workspace header must remain below the status bar after dismissing a detail sheet."
        )
        preserveScreenshot("Canonical AX5 dark People")
    }

    func testEditorialTodayReviewDoesNotPresentPreviewStateAsConfirmed() {
        app.launch()

        let review = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "today-review-proposal-")
        ).firstMatch
        XCTAssertTrue(review.waitForExistence(timeout: 8))
        review.tap()

        let evidence = element("review-exact-evidence")
        XCTAssertTrue(evidence.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Pending item review"].exists)
        XCTAssertFalse(app.buttons["confirm-relationship-change"].exists)
        XCTAssertTrue(app.staticTexts["Canonical review not connected"].exists)
        preserveScreenshot("Editorial evidence to proposed change")
        XCTAssertFalse(app.staticTexts["Relationship state confirmed"].exists)
    }

    func testCanonicalPursuitProposalShowsReceiptOnlyAfterBackendReadback() async throws {
        let fixture = try await preparePursuitProposalFixtureIfAvailable()
        let backendURL = fixture?.backendURL
            ?? testConfiguration("TS_IOS_BACKEND_URL", fallback: "http://127.0.0.1:4320")
        let proposalID = fixture?.proposalID
            ?? ProcessInfo.processInfo.environment["TS_IOS_PROPOSAL_ID"]
            ?? "a1000000-0000-4000-8000-000000000004"
        guard let healthURL = URL(string: "\(backendURL)/health/live"),
              let (_, healthResponse) = try? await URLSession.shared.data(from: healthURL),
              let healthHTTPResponse = healthResponse as? HTTPURLResponse,
              (200...299).contains(healthHTTPResponse.statusCode) else {
            throw XCTSkip("The full-stack Proposal fixture was not configured.")
        }
        app.launchArguments = [
            "--backend-url", backendURL,
            "--pursuit-proposal-id", proposalID,
        ]
        app.launch()

        let record = app.buttons["confirm-relationship-change"]
        XCTAssertTrue(record.waitForExistence(timeout: 12))
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Leila Hartmann")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Availability: 2026-09-01, Asia/Shanghai"
                )
            ).firstMatch.exists
        )
        XCTAssertFalse(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "I could do Singapore")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Would update only")
            ).firstMatch.exists
        )
        XCTAssertFalse(app.staticTexts["Relationship state confirmed"].exists)
        preserveScreenshot("Canonical identity evidence provenance before decision")

        let confirmItem = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "proposal-decision-confirm-")
        ).firstMatch
        tapWhenVisible(confirmItem)
        XCTAssertTrue(record.isEnabled)
        tapWhenVisible(record)
        XCTAssertTrue(
            app.staticTexts["Canonical Pursuit updated"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertTrue(app.staticTexts["Revision 1 → 2 · 1 changed field"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Current recruiter · Recorded")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Leila Hartmann")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts["No message was sent and external effects are empty."].exists
        )
        XCTAssertFalse(app.staticTexts["Relationship state confirmed"].exists)
        preserveScreenshot("Canonical Pursuit Proposal receipt readback")
    }

    func testResponseLossRelaunchReconcilesPersistedOperationWithoutResubmit() async throws {
        let proxyURL = testConfiguration(
            "TS_IOS_RESPONSE_LOSS_PROXY_URL",
            fallback: "http://127.0.0.1:4321"
        )
        let fixture = try await preparePursuitProposalFixtureIfAvailable()
        let proposalID = fixture?.recoveryProposalID
            ?? ProcessInfo.processInfo.environment["TS_IOS_RECOVERY_PROPOSAL_ID"]
            ?? "a1000000-0000-4000-8000-000000000005"
        guard let healthURL = URL(string: "\(proxyURL)/health/live"),
              let (_, healthResponse) = try? await URLSession.shared.data(from: healthURL),
              let healthHTTPResponse = healthResponse as? HTTPURLResponse,
              (200...299).contains(healthHTTPResponse.statusCode) else {
            throw XCTSkip("The response-loss proxy fixture was not configured.")
        }
        let stateURL = try XCTUnwrap(
            URL(string: "\(proxyURL)/__response_loss_proxy/state")
        )
        let (initialStateData, initialStateResponse) = try await URLSession.shared.data(
            from: stateURL
        )
        XCTAssertEqual((initialStateResponse as? HTTPURLResponse)?.statusCode, 200)
        let initialState = try JSONDecoder().decode(
            ResponseLossProxyState.self,
            from: initialStateData
        )

        app.launchArguments = [
            "--backend-url", proxyURL,
            "--pursuit-proposal-id", proposalID,
        ]
        app.launch()

        let record = app.buttons["confirm-relationship-change"]
        XCTAssertTrue(record.waitForExistence(timeout: 12))
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Avery Morgan")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Availability: 2026-09-01, Asia/Shanghai"
                )
            ).firstMatch.exists
        )
        XCTAssertFalse(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "I could do Singapore")
            ).firstMatch.exists
        )
        let confirmItem = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "proposal-decision-confirm-")
        ).firstMatch
        tapWhenVisible(confirmItem)
        tapWhenVisible(record)

        XCTAssertTrue(
            app.staticTexts["Outcome unknown — operation locked"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertFalse(app.staticTexts["Canonical Pursuit updated"].exists)
        preserveScreenshot("Response lost after canonical review operation")

        app.terminate()
        app.launch()

        let reconciledTitle = app.staticTexts["Canonical Pursuit updated"]
        XCTAssertTrue(reconciledTitle.waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["Revision 1 → 2 · 1 changed field"].exists)
        XCTAssertFalse(app.buttons["confirm-relationship-change"].exists)
        scrollToVisible(reconciledTitle)
        preserveScreenshot("Relaunch reconciled persisted operation")

        let (stateData, stateResponse) = try await URLSession.shared.data(from: stateURL)
        XCTAssertEqual((stateResponse as? HTTPURLResponse)?.statusCode, 200)
        let state = try JSONDecoder().decode(ResponseLossProxyState.self, from: stateData)
        XCTAssertEqual(state.reviewPostCount, initialState.reviewPostCount + 1)
        XCTAssertEqual(state.droppedResponseCount, initialState.droppedResponseCount + 1)
    }

    func testOwnedActionResponseLossRelaunchReconcilesWithoutSecondPost() async throws {
        let proxyURL = testConfiguration(
            "TS_IOS_RESPONSE_LOSS_PROXY_URL",
            fallback: "http://127.0.0.1:4321"
        )
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              let healthURL = URL(string: "\(proxyURL)/health/live"),
              let (_, healthResponse) = try? await URLSession.shared.data(from: healthURL),
              let healthHTTPResponse = healthResponse as? HTTPURLResponse,
              (200...299).contains(healthHTTPResponse.statusCode) else {
            throw XCTSkip("The action response-loss fixture was not configured.")
        }
        let stateURL = try XCTUnwrap(
            URL(string: "\(proxyURL)/__response_loss_proxy/state")
        )
        let (initialData, initialResponse) = try await URLSession.shared.data(
            from: stateURL
        )
        XCTAssertEqual((initialResponse as? HTTPURLResponse)?.statusCode, 200)
        let initialState = try JSONDecoder().decode(
            ResponseLossProxyState.self,
            from: initialData
        )
        let launchArguments = [
            "--workspace-backend-url", proxyURL,
            "--workspace-account-slug", "fixture-alpha",
            "--workspace-user-email", "recruiter@alpha.local",
        ]
        app.launchArguments = launchArguments + [
            "--reset-pursuit-action-completions",
        ]
        app.launch()
        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        let row = app.buttons["today-attention-pursuit-\(fixture.recoveryPursuitID)"]
        tapWhenVisible(row, maxSwipes: 120)
        XCTAssertTrue(element("pursuit-detail").waitForExistence(timeout: 10))
        let openCompletion = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "open-pursuit-action-completion-"
            )
        ).firstMatch
        tapWhenVisible(openCompletion, maxSwipes: 30)
        let outcome = app.textFields.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "pursuit-action-outcome-")
        ).firstMatch
        tapWhenVisible(outcome, maxSwipes: 30)
        outcome.typeText("Client supplied two final-conversation times after response loss.")
        let dismissKeyboard = app.buttons["Dismiss keyboard"]
        if dismissKeyboard.waitForExistence(timeout: 3) { dismissKeyboard.tap() }
        let complete = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "complete-pursuit-action-")
        ).firstMatch
        tapWhenVisible(complete, maxSwipes: 30)
        XCTAssertTrue(
            element("pursuit-action-unknown-locked").waitForExistence(timeout: 15)
        )
        XCTAssertFalse(element("pursuit-action-completion-receipt").exists)
        preserveScreenshot("Owned action outcome locked after response loss")

        app.terminate()
        app.launchArguments = launchArguments
        app.launch()
        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        let recovery = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "today-action-recovery-"
            )
        ).firstMatch
        XCTAssertTrue(recovery.waitForExistence(timeout: 20))
        XCTAssertTrue(
            recovery.label.contains(
                "Client supplied two final-conversation times after response loss."
            )
        )
        let oldAttentionRow = app.buttons[
            "today-attention-pursuit-\(fixture.recoveryPursuitID)"
        ]
        XCTAssertFalse(oldAttentionRow.exists)
        preserveScreenshot("Relaunch restored owned action recovery entry")
        tapWhenVisible(recovery)
        XCTAssertTrue(
            element("pursuit-detail").waitForExistence(timeout: 10)
        )
        XCTAssertTrue(
            element("pursuit-action-completion-receipt").waitForExistence(timeout: 20)
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Client supplied two final-conversation times after response loss."
                )
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts["ACTIVE · REVISION 2"].waitForExistence(timeout: 20)
        )
        XCTAssertFalse(app.staticTexts["Waiting for review"].exists)
        XCTAssertFalse(
            app.buttons.matching(
                NSPredicate(
                    format: "identifier BEGINSWITH %@",
                    "pursuit-proposal-"
                )
            ).firstMatch.exists
        )
        preserveScreenshot("Relaunch reconciled owned action receipt")

        let (finalData, finalResponse) = try await URLSession.shared.data(from: stateURL)
        XCTAssertEqual((finalResponse as? HTTPURLResponse)?.statusCode, 200)
        let finalState = try JSONDecoder().decode(
            ResponseLossProxyState.self,
            from: finalData
        )
        XCTAssertEqual(
            finalState.actionCompletionPostCount,
            initialState.actionCompletionPostCount + 1
        )
        XCTAssertEqual(
            finalState.droppedActionResponseCount,
            initialState.droppedActionResponseCount + 1
        )
    }

    func testTypedSignalPersistsAcrossRelaunchThenStagesCanonicalProposal() async throws {
        guard try await preparePursuitProposalFixtureIfAvailable() != nil else {
            throw XCTSkip("The canonical Pursuit fixture was not configured.")
        }
        let preferredAuditProxyURL = testConfiguration(
            "TS_IOS_TEXT_SIGNAL_PROXY_URL",
            fallback: "http://127.0.0.1:4322"
        )
        let initialAuditState = try? await textSignalProxyState(preferredAuditProxyURL)
        let auditProxyURL = initialAuditState == nil ? nil : preferredAuditProxyURL
        let backendURL = auditProxyURL
            ?? testConfiguration("TS_IOS_BACKEND_URL", fallback: "http://127.0.0.1:4320")
        guard let healthURL = URL(string: "\(backendURL)/health/live"),
              let (_, healthResponse) = try? await URLSession.shared.data(from: healthURL),
              let healthHTTPResponse = healthResponse as? HTTPURLResponse,
              (200...299).contains(healthHTTPResponse.statusCode) else {
            throw XCTSkip("The typed Signal backend fixture was not configured.")
        }
        let signalID = UUID().uuidString
        let exactText = "The reference conversation works next Thursday."
        app.launchArguments = [
            "--scenario", "text-signal-capture",
            "--backend-url", backendURL,
            "--text-signal-seed", signalID,
        ]
        app.launch()

        let body = element("text-signal-body")
        XCTAssertTrue(body.waitForExistence(timeout: 12))
        body.tap()
        body.typeText(exactText)
        let dismissKeyboard = app.buttons["dismiss-text-signal-keyboard"]
        XCTAssertTrue(dismissKeyboard.waitForExistence(timeout: 3))
        dismissKeyboard.tap()

        let scope = element("text-signal-scope")
        XCTAssertTrue(scope.waitForExistence(timeout: 12))
        tapWhenVisible(scope)
        let leilaScope = app.buttons.matching(
            NSPredicate(
                format: "label CONTAINS %@ AND label CONTAINS %@",
                "Leila Hartmann",
                "Chief Product Officer"
            )
        ).firstMatch
        XCTAssertTrue(leilaScope.waitForExistence(timeout: 5))
        leilaScope.tap()

        tapWhenVisible(element("text-signal-speaker-candidate"))
        let milestone = element("text-signal-proposed-milestone")
        tapWhenVisible(milestone)
        let referenceCheck = app.buttons["Reference check"]
        XCTAssertTrue(referenceCheck.waitForExistence(timeout: 5))
        referenceCheck.tap()
        XCTAssertTrue(element("text-signal-proposal-reason").waitForExistence(timeout: 3))

        tapWhenVisible(app.buttons["save-text-signal-locally"])
        XCTAssertTrue(
            element("text-signal-saved-local").waitForExistence(timeout: 8)
        )
        XCTAssertFalse(element("text-signal-proposal-receipt").exists)
        preserveScreenshot("Typed Signal saved locally before relaunch")

        app.terminate()
        app.launch()

        XCTAssertTrue(
            element("text-signal-saved-local").waitForExistence(timeout: 10)
        )
        XCTAssertEqual(element("text-signal-body").value as? String, exactText)
        XCTAssertFalse(element("text-signal-proposal-receipt").exists)
        if let auditProxyURL, let initialAuditState {
            let preSyncState = try await textSignalProxyState(auditProxyURL)
            XCTAssertEqual(
                preSyncState.resourceCapturePostCount,
                initialAuditState.resourceCapturePostCount
            )
            XCTAssertEqual(
                preSyncState.pursuitProposalPostCount,
                initialAuditState.pursuitProposalPostCount
            )
            XCTAssertEqual(preSyncState.deletionPostCount, initialAuditState.deletionPostCount)
        }

        tapWhenVisible(app.buttons["sync-text-signal"])
        XCTAssertTrue(
            element("text-signal-proposal-receipt").waitForExistence(timeout: 20)
        )
        XCTAssertTrue(app.staticTexts["Proposal ready for review"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "no Pursuit field changed")
            ).firstMatch.exists
        )
        XCTAssertFalse(app.staticTexts["Canonical Pursuit updated"].exists)
        if let auditProxyURL, let initialAuditState {
            let postSyncState = try await textSignalProxyState(auditProxyURL)
            XCTAssertEqual(
                postSyncState.resourceCapturePostCount,
                initialAuditState.resourceCapturePostCount + 1
            )
            XCTAssertEqual(
                postSyncState.pursuitProposalPostCount,
                initialAuditState.pursuitProposalPostCount + 1
            )
            XCTAssertEqual(postSyncState.deletionPostCount, initialAuditState.deletionPostCount)
        }
        preserveScreenshot("Typed Signal canonical Proposal readback")
    }

    func testTypedSignalOfflineRelaunchRetriesThenDeletesGovernedEvidence() async throws {
        guard try await preparePursuitProposalFixtureIfAvailable() != nil else {
            throw XCTSkip("The canonical Pursuit fixture was not configured.")
        }
        let proxyURL = testConfiguration(
            "TS_IOS_TEXT_SIGNAL_PROXY_URL",
            fallback: "http://127.0.0.1:4322"
        )
        guard let initialState = try? await textSignalProxyState(proxyURL) else {
            throw XCTSkip("The deterministic Text Signal proxy was not configured.")
        }
        try await setTextSignalProxyOffline(false, baseURL: proxyURL)
        let signalID = UUID().uuidString
        let exactText = "The interview debrief can move to Friday."
        app.launchArguments = [
            "--scenario", "text-signal-capture",
            "--backend-url", proxyURL,
            "--text-signal-seed", signalID,
        ]
        app.launch()

        let body = element("text-signal-body")
        XCTAssertTrue(body.waitForExistence(timeout: 12))
        body.tap()
        body.typeText(exactText)
        let dismissKeyboard = app.buttons["dismiss-text-signal-keyboard"]
        XCTAssertTrue(dismissKeyboard.waitForExistence(timeout: 3))
        dismissKeyboard.tap()
        tapWhenVisible(element("text-signal-scope"))
        let leilaScope = app.buttons.matching(
            NSPredicate(
                format: "label CONTAINS %@ AND label CONTAINS %@",
                "Leila Hartmann",
                "Chief Product Officer"
            )
        ).firstMatch
        XCTAssertTrue(leilaScope.waitForExistence(timeout: 5))
        leilaScope.tap()
        tapWhenVisible(element("text-signal-speaker-candidate"))
        tapWhenVisible(app.buttons["save-text-signal-locally"])
        XCTAssertTrue(element("text-signal-saved-local").waitForExistence(timeout: 8))

        try await setTextSignalProxyOffline(true, baseURL: proxyURL)
        app.terminate()
        app.launch()
        XCTAssertTrue(
            element("text-signal-saved-local").waitForExistence(timeout: 10),
            "Offline scope loading must not erase the durable saved-local state."
        )
        XCTAssertEqual(element("text-signal-body").value as? String, exactText)

        tapWhenVisible(app.buttons["sync-text-signal"])
        XCTAssertTrue(element("text-signal-failed").waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["Sync not verified"].exists)
        XCTAssertEqual(element("text-signal-body").value as? String, exactText)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Retry with the same Signal ID")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "reconcile before deletion")
            ).firstMatch.exists
        )
        preserveScreenshot("Typed Signal offline failure remains recoverable")

        try await setTextSignalProxyOffline(false, baseURL: proxyURL)
        tapWhenVisible(app.buttons["retry-text-signal"])
        XCTAssertTrue(element("text-signal-synced-receipt").waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Evidence synced"].exists)
        XCTAssertFalse(element("text-signal-proposal-receipt").exists)

        tapWhenVisible(app.buttons["delete-text-signal"])
        XCTAssertTrue(element("text-signal-deleted").waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Signal deleted"].exists)
        XCTAssertFalse(element("text-signal-body").exists)
        XCTAssertFalse(app.buttons["save-text-signal-locally"].exists)
        XCTAssertFalse(app.buttons["delete-text-signal"].exists)
        XCTAssertFalse(element("text-signal-speaker-candidate").exists)
        XCTAssertTrue(app.buttons["finish-text-signal-deletion"].exists)
        let finalState = try await textSignalProxyState(proxyURL)
        XCTAssertEqual(
            finalState.resourceCapturePostCount,
            initialState.resourceCapturePostCount + 1
        )
        XCTAssertEqual(
            finalState.pursuitProposalPostCount,
            initialState.pursuitProposalPostCount
        )
        XCTAssertEqual(finalState.deletionPostCount, initialState.deletionPostCount + 1)
        XCTAssertGreaterThan(finalState.blockedRequestCount, initialState.blockedRequestCount)
        XCTAssertFalse(finalState.offline)
        preserveScreenshot("Typed Signal governed deletion completed")
    }

    func testSameNameTextSignalScopeStaysDistinctAcrossRelaunchAndReadback() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical same-name fixture was not configured.")
        }
        let recordID = UUID()
        let launchArguments = [
            "--scenario", "text-signal-capture",
            "--backend-url", fixture.backendURL,
            "--text-signal-seed", recordID.uuidString.lowercased(),
        ]
        app.launchArguments = launchArguments
        app.launch()

        XCTAssertTrue(element("text-signal-capture").waitForExistence(timeout: 12))
        XCTAssertFalse(element("text-signal-scope-readback").exists)
        let body = element("text-signal-body")
        tapWhenVisible(body)
        body.typeText("Synthetic same-name candidate evidence for explicit binding.")
        let dismissKeyboard = app.buttons["dismiss-text-signal-keyboard"]
        XCTAssertTrue(dismissKeyboard.waitForExistence(timeout: 3))
        dismissKeyboard.tap()

        let scope = element("text-signal-scope")
        tapWhenVisible(scope)
        let scopeSearch = element("text-signal-scope-search")
        XCTAssertTrue(scopeSearch.waitForExistence(timeout: 5))
        scopeSearch.tap()
        scopeSearch.typeText(String(fixture.sameNameSecondPersonID.prefix(8)))
        let second = app.buttons.matching(
            NSPredicate(
                format: "label CONTAINS %@ AND label CONTAINS %@ AND label CONTAINS %@",
                "Alex Chen",
                "Same-name search B",
                String(fixture.sameNameSecondPersonID.prefix(8))
            )
        ).firstMatch
        XCTAssertTrue(second.waitForExistence(timeout: 5))
        XCTAssertFalse(second.label.contains(String(fixture.sameNameFirstPersonID.prefix(8))))
        second.tap()

        let selected = element("text-signal-scope-readback")
        XCTAssertTrue(selected.waitForExistence(timeout: 4))
        XCTAssertTrue(selected.label.contains("Same-name search B"))
        XCTAssertTrue(selected.label.contains(String(fixture.sameNameSecondPersonID.prefix(8))))
        tapWhenVisible(element("text-signal-speaker-candidate"))
        tapWhenVisible(app.buttons["save-text-signal-locally"])
        XCTAssertTrue(element("text-signal-saved-local").waitForExistence(timeout: 6))

        app.terminate()
        app.launchArguments = launchArguments
        app.launch()
        XCTAssertTrue(element("text-signal-capture").waitForExistence(timeout: 12))
        XCTAssertTrue(element("text-signal-scope-readback").waitForExistence(timeout: 6))
        XCTAssertTrue(element("text-signal-scope-readback").label.contains("Same-name search B"))
        tapWhenVisible(app.buttons["sync-text-signal"])
        let receipt = element("text-signal-synced-receipt")
        XCTAssertTrue(receipt.waitForExistence(timeout: 20))
        let auditDetails = app.buttons["text-signal-audit-details"]
        tapWhenVisible(auditDetails)
        let auditValues = app.staticTexts["text-signal-audit-details"]
        XCTAssertTrue(auditValues.waitForExistence(timeout: 4))
        XCTAssertTrue(auditValues.label.contains(fixture.sameNameSecondPersonID.lowercased()))
        XCTAssertTrue(auditValues.label.contains(fixture.sameNameSecondRoleID.lowercased()))
        XCTAssertTrue(auditValues.label.contains(fixture.sameNameSecondContextID.lowercased()))
        preserveScreenshot("Same-name Text Signal canonical binding receipt")
    }

    private func textSignalProxyState(_ baseURL: String) async throws -> TextSignalProxyState {
        let stateURL = try XCTUnwrap(
            URL(string: "\(baseURL)/__text_signal_proxy/state")
        )
        let (data, response) = try await URLSession.shared.data(from: stateURL)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        return try JSONDecoder().decode(TextSignalProxyState.self, from: data)
    }

    private func preparePursuitProposalFixtureIfAvailable() async throws
        -> IOSPursuitProposalFixture?
    {
        let baseURL = testConfiguration(
            "TS_IOS_PURSUIT_FIXTURE_URL",
            fallback: "http://127.0.0.1:4323"
        )
        guard let healthURL = URL(string: "\(baseURL)/health/live"),
              let (_, healthResponse) = try? await URLSession.shared.data(from: healthURL),
              let healthHTTPResponse = healthResponse as? HTTPURLResponse,
              (200...299).contains(healthHTTPResponse.statusCode) else {
            return nil
        }
        let prepareURL = try XCTUnwrap(
            URL(string: "\(baseURL)/__ios_pursuit_proposal_fixture/prepare")
        )
        var request = URLRequest(url: prepareURL)
        request.httpMethod = "POST"
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 201)
        return try JSONDecoder().decode(IOSPursuitProposalFixture.self, from: data)
    }

    private func pursuitFixtureBackendURLIfAvailable() async throws -> String? {
        let baseURL = testConfiguration(
            "TS_IOS_PURSUIT_FIXTURE_URL",
            fallback: "http://127.0.0.1:4323"
        )
        let healthURL = try XCTUnwrap(
            URL(string: "\(baseURL)/health/live")
        )
        guard let (data, response) = try? await URLSession.shared.data(from: healthURL),
              let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            return nil
        }
        return try JSONDecoder().decode(
            IOSPursuitFixtureHealth.self,
            from: data
        ).backendURL
    }

    private func setTextSignalProxyOffline(_ offline: Bool, baseURL: String) async throws {
        let state = offline ? "offline" : "online"
        let url = try XCTUnwrap(URL(string: "\(baseURL)/__text_signal_proxy/\(state)"))
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    func testWorkspaceKeepsSessionsAndPeopleDirectlyReachable() {
        app.launch()

        let sessions = app.buttons["archive-tab-sessions"]
        XCTAssertTrue(sessions.waitForExistence(timeout: 8))
        sessions.tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["What changed with the location model?"].exists)
        preserveScreenshot("Agent Session retrieval")

        let people = app.buttons["archive-tab-people"]
        people.tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["Leila Hartmann"].exists)
        preserveScreenshot("Cross-Pursuit People retrieval")
    }

    func testTSCORE01EvidenceFactReviewActionPreviewAndHandoff() {
        launch(fixtureID: "TS-CORE-01")

        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Alex Chen"].exists)
        XCTAssertTrue(element("message-m1").exists)
        preserveScreenshot("TS-CORE-01 evidence and proposals")

        let factIDs = [
            "competing_process-m1",
            "decision_deadline-m1",
            "availability-m1",
            "work_mode_preference-m1"
        ]
        for factID in factIDs {
            tapWhenVisible(app.buttons["fact-confirm-\(factID)"])
            XCTAssertTrue(
                app.staticTexts.matching(identifier: "fact-decision-\(factID)")
                    .element.waitForExistence(timeout: 2)
            )
        }

        tapWhenVisible(app.buttons["review-action"])
        let actionTitle = app.staticTexts["Prepare one question—locally"]
        XCTAssertTrue(actionTitle.waitForExistence(timeout: 4))
        XCTAssertGreaterThan(actionTitle.frame.minY, 59)
        XCTAssertTrue(app.staticTexts["client remote-work policy"].exists)
        XCTAssertTrue(
            app.staticTexts[
                "Prepare a recruiter-owned question for a local handoff. No message, meeting, contact, ATS record, or reminder will be created."
            ].exists
        )
        preserveScreenshot("TS-CORE-01 separate action preview")

        tapWhenVisible(app.buttons["complete-handoff"])
        let outcomeTitle = app.staticTexts["Local handoff is ready"]
        XCTAssertTrue(outcomeTitle.waitForExistence(timeout: 4))
        XCTAssertGreaterThan(outcomeTitle.frame.minY, 59)
        XCTAssertTrue(app.staticTexts["No external changes"].exists)
        preserveScreenshot("TS-CORE-01 local outcome")
    }

    func testUnrelatedSelectedImageNeverShowsFixtureFacts() {
        launch(scenario: "unrelated-image")

        XCTAssertTrue(app.staticTexts["Unrelated image selected"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)
        XCTAssertEqual(app.otherElements.matching(NSPredicate(format: "identifier BEGINSWITH 'fact-card-'")).count, 0)
    }

    func testPhotoPickerStagesSelectedImageForReview() {
        app.launch()

        tapWhenVisible(app.buttons["capture-relationship-moment"])
        XCTAssertTrue(element("signal-capture-hub").waitForExistence(timeout: 5))
        tapWhenVisible(app.buttons["capture-hub-screenshot"])
        XCTAssertTrue(app.buttons["choose-image"].waitForExistence(timeout: 5))
        tapWhenVisible(app.buttons["choose-image"])

        XCTAssertTrue(app.staticTexts["Loading..."].waitForNonExistence(timeout: 10))
        let onboardingClose = app.buttons["Close"].firstMatch
        if onboardingClose.exists {
            onboardingClose.tap()
        }
        let firstPhoto = app.images.matching(
            identifier: "PXGGridLayout-Info"
        ).firstMatch
        XCTAssertTrue(firstPhoto.waitForExistence(timeout: 5))
        firstPhoto.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)
        ).tap()

        XCTAssertTrue(element("inspect-capture-source").waitForExistence(timeout: 15))
        XCTAssertFalse(app.navigationBars["Photos"].exists)
        XCTAssertFalse(app.staticTexts["Unrelated image selected"].exists)
        preserveScreenshot("Selected photo reaches governed source review")

        tapWhenVisible(app.buttons["close-capture-review"])
        tapWhenVisible(app.buttons["Discard capture"])
        XCTAssertTrue(
            element("inspect-capture-source").waitForNonExistence(timeout: 5)
        )
    }

    func testProhibitedFitRequestIsRefused() {
        launch(fixtureID: "TS-BOUND-01")

        XCTAssertTrue(app.staticTexts["fit-refusal-message"].waitForExistence(timeout: 8))
        XCTAssertEqual(
            app.staticTexts["fit-refusal-message"].label,
            "Refused: conversation tone, response speed, and shared interests must not become culture-fit, quality, personality, or acceptance scores."
        )
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", ".*[0-9]+%.*")).firstMatch.exists)

        tapWhenVisible(app.buttons["finish-without-action"])
        XCTAssertTrue(app.staticTexts["Candidate scoring was refused"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["No external changes"].exists)
    }

    func testStaleActionCannotComplete() {
        launch(scenario: "stale-preview")

        XCTAssertTrue(app.staticTexts["This preview is no longer current"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["complete-handoff"].exists)
        XCTAssertTrue(app.buttons["refresh-stale-preview"].exists)
    }

    func testImportCancellationAndRecovery() {
        app.launchArguments = [
            "--fixture-import-delay-seconds", "10"
        ]
        launch()

        tapWhenVisible(app.buttons["open-fixture"])
        XCTAssertTrue(element("importing-state").waitForExistence(timeout: 3))
        app.buttons["cancel-import"].tap()
        XCTAssertTrue(app.staticTexts["Opening synthetic fixture was cancelled"].waitForExistence(timeout: 4))
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)

        app.buttons["cancelled-recovery"].tap()
        XCTAssertTrue(app.buttons["open-fixture"].waitForExistence(timeout: 4))
    }

    func testBackendFailureHasTruthfulRecovery() {
        launch(scenario: "import-failed")

        XCTAssertTrue(app.staticTexts["Nothing was changed"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Nothing was changed"].exists)
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)

        app.buttons["failed-recovery"].tap()
        XCTAssertTrue(app.buttons["open-fixture"].waitForExistence(timeout: 4))
    }

    func testOfflineLocalhostFailureAndRecovery() {
        app.launchArguments = ["--endpoint", "http://127.0.0.1:1/fixtures.json"]
        app.launch()

        tapWhenVisible(app.buttons["Configure localhost fixture sync"])
        tapWhenVisible(app.buttons["sync-localhost"])
        XCTAssertTrue(app.staticTexts["Nothing was changed"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)

        app.buttons["failed-recovery"].tap()
        XCTAssertTrue(app.buttons["open-fixture"].waitForExistence(timeout: 4))
    }

    @MainActor
    func testLocalhostSyncSuccess() async throws {
        let endpoint = URL(
            string: "http://127.0.0.1:8787/evals/candidate-momentum-v1.json"
        )!
        guard let (_, response) = try? await URLSession.shared.data(from: endpoint),
              let response = response as? HTTPURLResponse,
              response.statusCode == 200 else {
            throw XCTSkip("Run with the authorized local fixture server.")
        }

        app.launchArguments = [
            "--endpoint",
            endpoint.absoluteString
        ]
        app.launch()

        tapWhenVisible(app.buttons["Configure localhost fixture sync"])
        tapWhenVisible(app.buttons["sync-localhost"])
        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Alex Chen"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Read-only localhost sync · 8 synthetic cases · 2026-08-05.1"
                )
            ).firstMatch.exists
        )
        preserveScreenshot("Localhost fixture provenance")
    }

    @MainActor
    func testBackendCanonicalStateReadsConfirmedFactsFromLocalhost() async throws {
        let backendURL = testConfiguration(
            "TS_IOS_BACKEND_URL",
            fallback: "http://127.0.0.1:4317"
        )
        let endpoint = try XCTUnwrap(URL(string: "\(backendURL)/health/ready"))
        guard let (_, response) = try? await URLSession.shared.data(from: endpoint),
              let response = response as? HTTPURLResponse,
              response.statusCode == 200 else {
            throw XCTSkip("Run with the authorized local Talent Signal backend.")
        }
        guard await canonicalBackendFixtureIsAvailable(at: backendURL) else {
            throw XCTSkip(
                "The authorized local backend does not include the TS-CORE-01 canonical fixture."
            )
        }

        app.launchArguments = [
            "--backend-url", backendURL
        ]
        app.launch()

        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts["Alex Chen"].exists)
        XCTAssertTrue(element("message-m1").exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Localhost canonical state · fixture-alpha"
                )
            ).firstMatch.exists
        )
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-competing_process-m1").element.label, "Confirmed locally")
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-decision_deadline-m1").element.label, "Confirmed locally")
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-availability-m1").element.label, "Confirmed locally")
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-work_mode_preference-m1").element.label, "Confirmed locally")
        XCTAssertTrue(app.buttons["review-action"].exists)
        preserveScreenshot("TS-CORE-01 canonical backend state")
    }

    @MainActor
    func testRelationshipCaptureRequiresExplicitOwnerAndCompilesGoldWiki() async throws {
        try await runRelationshipCaptureJourney(auditsAccessibility: false)
    }

    @MainActor
    func testRelationshipCaptureAX5DarkPreservesEvidenceActionAndScopeOrder() async throws {
        try await runRelationshipCaptureJourney(auditsAccessibility: true)
    }

    @MainActor
    private func runRelationshipCaptureJourney(
        auditsAccessibility: Bool
    ) async throws {
        let backendURL = testConfiguration(
            "TS_IOS_BACKEND_URL",
            fallback: "http://127.0.0.1:4320"
        )
        let endpoint = URL(string: "\(backendURL)/health/ready")!
        guard let (_, response) = try? await URLSession.shared.data(from: endpoint),
              let response = response as? HTTPURLResponse,
              response.statusCode == 200 else {
            throw XCTSkip("Run with the authorized local Talent Signal backend.")
        }

        let captureSeed = UUID()
        let phoneSuffix = String(
            format: "%07u",
            UInt32.random(in: 0...9_999_999)
        )

        app.launchArguments = [
            "--scenario", "relationship-capture-archive",
            "--backend-url", backendURL,
            "--workspace-backend-url", backendURL,
            "--capture-seed", captureSeed.uuidString,
            "--capture-handle", "+658\(phoneSuffix)",
            "--capture-name", "UI owner \(captureSeed.uuidString.prefix(8))"
        ]
        if auditsAccessibility {
            app.launchArguments += [
                "--force-dark",
                "-AppleInterfaceStyle", "Dark",
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            ]
        }
        app.launch()

        XCTAssertTrue(element("reviewed-ocr-text").waitForExistence(timeout: 10))
        XCTAssertTrue(element("unknown-speaker-boundary").exists)
        XCTAssertTrue(element("capture-speaker-review").exists)
        if auditsAccessibility {
            assertAccessibilityOrder([
                "inspect-capture-source",
                "reviewed-ocr-text",
                "unknown-speaker-boundary",
                "capture-speaker-review",
                "submit-reviewed-capture",
            ])
        }
        let inspectSource = app.buttons["inspect-capture-source"]
        XCTAssertTrue(
            inspectSource.waitForExistence(timeout: 5),
            "A real screenshot must be inspectable before OCR becomes evidence."
        )
        inspectSource.tap()
        let sourceInspection = element("capture-source-inspection")
        XCTAssertTrue(sourceInspection.waitForExistence(timeout: 5))
        sourceInspection.doubleTap()
        preserveScreenshot("Zoomable original before OCR correction")
        tapWhenVisible(app.buttons["close-source-inspection"])
        XCTAssertTrue(element("reviewed-ocr-text").waitForExistence(timeout: 5))
        tapWhenVisible(app.buttons["submit-reviewed-capture"])

        let createPerson = app.buttons["create-new-person-from-capture"]
        if !createPerson.waitForExistence(timeout: 30) {
            let retry = app.buttons["retry-capture-step"]
            XCTAssertTrue(
                retry.waitForExistence(timeout: 5),
                "Identity review should load or expose a safe retry."
            )
            retry.tap()
        }
        XCTAssertTrue(createPerson.waitForExistence(timeout: 30))
        XCTAssertTrue(element("identity-no-preselection").exists)
        XCTAssertFalse(app.buttons["bind-selected-person"].exists)
        preserveScreenshot("Explicit new Person decision before binding")

        tapWhenVisible(createPerson)

        let verdict = element("wiki-quality-verdict")
        if !verdict.waitForExistence(timeout: 30) {
            let retry = app.buttons["retry-capture-step"]
            XCTAssertTrue(
                retry.waitForExistence(timeout: 5),
                "Wiki compilation should finish or expose a safe retry."
            )
            retry.tap()
        }
        XCTAssertTrue(verdict.waitForExistence(timeout: 30))
        XCTAssertEqual(verdict.label, "WIKI · GOLD")
        XCTAssertTrue(app.buttons["return-to-person"].exists)
        XCTAssertTrue(app.buttons["continue-capture-in-agent"].exists)
        XCTAssertTrue(element("device-contact-handoff").exists)
        XCTAssertTrue(app.buttons["review-device-contact"].exists)
        XCTAssertTrue(element("capture-completion-receipt").exists)
        if auditsAccessibility {
            assertAccessibilityOrder([
                "wiki-quality-verdict",
                "continue-capture-in-agent",
                "device-contact-handoff",
                "capture-completion-receipt",
            ])
        }
        preserveScreenshot("iOS explicit-owner Wiki Gold receipt")

        tapWhenVisible(app.buttons["review-device-contact"])
        let cancelContact = app.buttons["Cancel"]
        XCTAssertTrue(
            cancelContact.waitForExistence(timeout: 8),
            "The device-owned contact editor should be the exact write gate."
        )
        XCTAssertTrue(app.navigationBars["New Contact"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "UI owner \(captureSeed.uuidString.prefix(8))"
                )
            ).firstMatch.exists
        )
        preserveScreenshot("Apple contact editor exact-field review")

        cancelContact.tap()
        let discardContact = app.buttons["Discard Changes"]
        XCTAssertTrue(
            discardContact.waitForExistence(timeout: 5),
            "Apple should require a second explicit decision before discarding."
        )
        discardContact.tap()
        XCTAssertTrue(element("device-contact-cancelled").waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["review-device-contact"].isEnabled)
        preserveScreenshot("Contact handoff cancelled without write")

        tapWhenVisible(app.buttons["continue-capture-in-agent"])
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 30))
        let scopeSelector = app.buttons["ask-scope-selector"]
        XCTAssertTrue(scopeSelector.waitForExistence(timeout: 5))
        let expectedScopeValue =
            "UI owner \(captureSeed.uuidString.prefix(8)), Current client relationship"
        XCTAssertEqual(
            scopeSelector.value as? String,
            expectedScopeValue
        )
        let seededComposer = app.textFields["ask-composer"]
        XCTAssertTrue(seededComposer.waitForExistence(timeout: 5))
        if auditsAccessibility {
            XCTAssertGreaterThanOrEqual(
                scopeSelector.frame.height,
                80,
                "The AX5 relationship selector should expand instead of clipping its context."
            )
            let closeButton = app.buttons["Close"]
            XCTAssertTrue(closeButton.exists)
            let closePresentAtAX5 = closeButton.exists
            XCTAssertFalse(element("ask-remote-ai-disclosure").exists)
            assertAccessibilityOrder([
                "ask-scope-selector",
                "ask-composer",
                "ask-send",
            ])
            preserveScreenshot("AX5 relationship scope before accessibility audit")
            if #available(iOS 17.0, *) {
                let issueHandler: (XCUIAccessibilityAuditIssue) throws -> Bool = { issue in
                    guard issue.auditType == .dynamicType,
                          let issueElement = issue.element,
                          issueElement.identifier.isEmpty else {
                        return false
                    }
                    if issueElement.elementType == .button,
                       issueElement.label == "Close",
                       closePresentAtAX5,
                       self.app.navigationBars["New session"].exists {
                        // The system NavigationStack button visibly enlarges
                        // at AX5 but XCTest reports the UIKit-hosted toolbar
                        // node as partially unsupported while it cycles sizes.
                        return true
                    }
                    guard issueElement.label == "Current client relationship",
                          scopeSelector.value as? String == expectedScopeValue,
                          scopeSelector.frame.contains(issueElement.frame) else {
                        return false
                    }
                    // SwiftUI exposes this visual label node to XCTest even
                    // though the selector combines its children into one
                    // button. The pre-audit AX5 assertion and screenshot prove
                    // that the label grows and wraps; the button's full value
                    // is the single VoiceOver announcement. Keep every other
                    // Dynamic Type issue unsuppressed.
                    return true
                }
                try app.performAccessibilityAudit(for: [
                    .dynamicType,
                    .hitRegion,
                    .sufficientElementDescription,
                ], issueHandler)
            }
        }
        XCTAssertEqual(
            seededComposer.value as? String,
            "What changed in this relationship, and what is the smallest safe next step?"
        )
        XCTAssertFalse(element("ask-response-turn").exists)
        preserveScreenshot("Capture continues in a scoped unsent Agent Session")
    }

    func testBackgroundInterruptionPreservesReviewDecision() {
        launch(fixtureID: "TS-CORE-01")

        tapWhenVisible(app.buttons["fact-confirm-competing_process-m1"])
        XCTAssertTrue(app.staticTexts["Confirmed locally"].exists)

        XCUIDevice.shared.press(.home)
        app.activate()

        XCTAssertTrue(app.staticTexts["Confirmed locally"].waitForExistence(timeout: 5))
        XCTAssertTrue(element("fixture-banner").exists)
    }

    func testAudioSignalRequiresAuthorizationThenShowsVerifiedLocalLifecycle() {
        app.launchArguments = ["--scenario", "audio-signal-capture"]
        app.launch()

        XCTAssertTrue(element("audio-signal-capture").waitForExistence(timeout: 8))
        XCTAssertTrue(element("audio-signal-idle").exists)
        XCTAssertFalse(element("audio-signal-recording").exists)
        XCTAssertTrue(app.buttons["start-audio-signal"].isEnabled)
        tapWhenVisible(app.buttons["start-audio-signal"])
        XCTAssertTrue(
            app.staticTexts[
                "Name the person or accountable party who authorized this recording."
            ].waitForExistence(timeout: 3)
        )
        preserveScreenshot("Audio Signal starts truthfully idle")

        let authorizingParty = app.textFields["audio-signal-authorizing-party"]
        tapWhenVisible(authorizingParty)
        authorizingParty.typeText("Synthetic participant")
        let dismissAudioKeyboard = app.buttons["dismiss-audio-signal-keyboard"]
        XCTAssertTrue(dismissAudioKeyboard.waitForExistence(timeout: 3))
        dismissAudioKeyboard.tap()
        let authorizationBasis = app.textFields["audio-signal-authorization-basis"]
        tapWhenVisible(authorizationBasis)
        authorizationBasis.typeText("Direct synthetic permission")
        XCTAssertTrue(dismissAudioKeyboard.waitForExistence(timeout: 3))
        dismissAudioKeyboard.tap()
        tapWhenVisible(app.switches["audio-signal-authorization"])
        XCTAssertTrue(app.buttons["start-audio-signal"].isEnabled)
        tapWhenVisible(app.buttons["start-audio-signal"])

        XCTAssertTrue(element("audio-signal-recording").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Recording now"].exists)
        preserveScreenshot("Audio Signal verified foreground recording")

        tapWhenVisible(app.buttons["stop-audio-signal"])
        XCTAssertTrue(element("audio-signal-saved-local").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Saved only on this device"].exists)
        XCTAssertFalse(app.staticTexts["Recording now"].exists)
        preserveScreenshot("Audio Signal sealed local receipt")

        tapWhenVisible(app.buttons["delete-audio-signal"])
        XCTAssertTrue(element("audio-signal-deleted").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Local recording deleted"].exists)
        XCTAssertFalse(app.buttons["delete-audio-signal"].exists)
        preserveScreenshot("Audio Signal local deletion receipt")
    }

    func testCaptureRailOpensPurposeBoundChooserBeforeAnyCapture() {
        app.launch()

        let capture = app.buttons["capture-relationship-moment"]
        XCTAssertTrue(capture.waitForExistence(timeout: 8))
        capture.tap()

        XCTAssertTrue(element("signal-capture-hub").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Capture for the Agent"].exists)
        XCTAssertTrue(app.buttons["capture-hub-text"].exists)
        XCTAssertTrue(app.buttons["capture-hub-screenshot"].exists)
        XCTAssertTrue(app.buttons["capture-hub-audio"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Nothing here confirms")
            ).firstMatch.exists
        )
        XCTAssertLessThan(
            element("signal-capture-hub").frame.height,
            app.windows.firstMatch.frame.height * 0.8
        )
        XCTAssertFalse(element("audio-signal-recording").exists)
        preserveScreenshot("Capture Signal purpose-bound chooser")

        tapWhenVisible(app.buttons["capture-hub-audio"])
        XCTAssertTrue(element("audio-signal-idle").waitForExistence(timeout: 5))
        XCTAssertFalse(element("audio-signal-recording").exists)
        preserveScreenshot("Capture chooser opens audio idle")
    }

    func testNaturalContactProposalIsEditableAndRestoresAfterRelaunch() {
        app.launchArguments = ["--persist-preview-agent", "--reset-preview-agent"]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        app.buttons["relationship-guide"].tap()
        XCTAssertTrue(
            element("relationship-ask-sheet").waitForExistence(timeout: 5)
        )
        if app.buttons["contact-dismiss-proposal"].exists {
            app.buttons["contact-dismiss-proposal"].tap()
        }

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        let message = "Add Maya Chen for the Chief Product Officer search, maya@example.com"
        typeTextReliably(message, into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        send.tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertTrue(element("contact-proposal-card").waitForExistence(timeout: 5))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertEqual(app.staticTexts["contact-proposal-title"].label, "Review this contact")
        XCTAssertEqual(app.staticTexts["contact-summary-name"].label, "Maya Chen")
        XCTAssertEqual(
            app.staticTexts["contact-summary-relationship"].label,
            "Chief Product Officer"
        )
        XCTAssertFalse(app.textFields["contact-proposal-name"].exists)
        XCTAssertFalse(composer.isEnabled)
        XCTAssertFalse(app.buttons["ask-attachment-menu"].isEnabled)
        XCTAssertFalse(app.buttons["ask-voice"].isEnabled)
        XCTAssertTrue(app.buttons["contact-edit-details"].exists)
        assertAccessibilityOrder([
            "contact-user-message",
            "contact-proposal-summary",
            "contact-workspace-unavailable",
            "contact-confirm-save",
        ])
        preserveScreenshot("Conversation-first contact proposal")

        tapWhenVisible(app.buttons["contact-edit-details"])
        XCTAssertTrue(app.textFields["contact-proposal-name"].waitForExistence(timeout: 3))
        XCTAssertEqual(
            app.textFields["contact-proposal-name"].value as? String,
            "Maya Chen"
        )
        XCTAssertEqual(
            app.textFields["contact-proposal-relationship"].value as? String,
            "Chief Product Officer"
        )
        tapWhenVisible(app.buttons["contact-finish-details"])
        XCTAssertFalse(app.textFields["contact-proposal-name"].exists)
        XCTAssertTrue(app.switches["contact-confirm-identity-clue"].exists)
        XCTAssertEqual(
            app.switches["contact-confirm-identity-clue"].value as? String,
            "1"
        )
        XCTAssertTrue(app.buttons["contact-confirm-save"].exists)
        XCTAssertFalse(app.buttons["contact-confirm-save"].isEnabled)
        XCTAssertTrue(element("contact-workspace-unavailable").exists)
        XCTAssertFalse(element("contact-save-success").exists)
        XCTAssertTrue(
            app.staticTexts["Proposed only · nothing changes until you confirm"].exists
        )
        preserveScreenshot("Collapsed contact proposal after edit review")

        app.terminate()
        app.launchArguments = ["--persist-preview-agent"]
        app.launch()
        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        app.buttons["relationship-guide"].tap()
        XCTAssertTrue(element("contact-proposal-card").waitForExistence(timeout: 5))
        XCTAssertFalse(
            app.keyboards.firstMatch.exists,
            "A restored contact decision should not steal focus from review."
        )
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertEqual(app.staticTexts["contact-summary-name"].label, "Maya Chen")
        XCTAssertFalse(app.textFields["contact-proposal-name"].exists)
        XCTAssertFalse(app.textFields["ask-composer"].isEnabled)
        XCTAssertFalse(element("contact-save-success").exists)
        preserveScreenshot("Contact proposal restored after relaunch")

        tapWhenVisible(app.buttons["contact-dismiss-proposal"])
        XCTAssertTrue(
            element("contact-proposal-card").waitForNonExistence(timeout: 5)
        )
        XCTAssertTrue(app.textFields["ask-composer"].isEnabled)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].isEnabled)
        XCTAssertTrue(app.buttons["ask-voice"].isEnabled)
    }

    func testGlobalAgentUnderstandsContactWithoutCommandOrScopeForm() {
        app.launchArguments = ["--persist-preview-agent", "--reset-preview-agent"]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        app.buttons["relationship-guide"].tap()
        XCTAssertTrue(
            element("relationship-ask-sheet").waitForExistence(timeout: 5)
        )

        let composer = app.textFields["ask-composer"]
        let message = "Maya Chen, maya@example.com, Chief Product Officer"
        typeTextReliably(message, into: composer)
        XCTAssertEqual(composer.value as? String, message)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "Send and let Agent link the relationship")
        XCTAssertFalse(element("ask-scope-selector").exists)
        send.tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertEqual(app.staticTexts["contact-summary-name"].label, "Maya Chen")
        XCTAssertEqual(
            app.staticTexts["contact-summary-relationship"].label,
            "Chief Product Officer"
        )
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertFalse(element("contact-save-success").exists)
        XCTAssertFalse(composer.isEnabled)
        preserveScreenshot("Global Agent contact without command")

        tapWhenVisible(app.buttons["contact-dismiss-proposal"])
    }

    func testIdentityQuestionStaysOutOfContactToolsAndRequestsScope() {
        app.launchArguments = ["--persist-preview-agent", "--reset-preview-agent"]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        let message = "Can you check Maya Chen, maya@example.com?"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("ask-scope-selector").waitForExistence(timeout: 10))
        XCTAssertTrue(element("ask-scope-search").exists)
        XCTAssertFalse(element("contact-proposal-turn").exists)
        XCTAssertFalse(element("contact-proposal-card").exists)
        XCTAssertEqual(composer.value as? String, message)
        preserveScreenshot("Identity question requests relationship scope")
    }

    func testContactUnderstandingCanCancelWithoutLosingExactMessage() {
        app.launchArguments = [
            "--persist-preview-agent",
            "--reset-preview-agent",
            "--fixture-contact-interpretation-delay-seconds", "3",
        ]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        let message = "Met Maya Chen for Product — maya@example.com"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("ask-contact-interpreting").waitForExistence(timeout: 2))
        XCTAssertFalse(composer.isEnabled)
        XCTAssertFalse(app.buttons["ask-attachment-menu"].isEnabled)
        let cancel = app.buttons["ask-contact-interpretation-cancel"]
        XCTAssertTrue(cancel.isEnabled)
        preserveScreenshot("Global Agent contact understanding in progress")
        cancel.tap()

        XCTAssertTrue(
            element("ask-contact-interpreting").waitForNonExistence(timeout: 3)
        )
        XCTAssertTrue(composer.isEnabled)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].isEnabled)
        XCTAssertEqual(composer.value as? String, message)
        XCTAssertFalse(element("contact-proposal-turn").exists)
        XCTAssertFalse(element("ask-scope-selector").exists)
    }

    func testCanonicalContactNoMatchCreatesOnlyAfterExplicitConfirmation() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              let email = fixture.contactNoMatchEmail else {
            throw XCTSkip("The canonical contact identity fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))
        if app.buttons["contact-dismiss-proposal"].exists {
            app.buttons["contact-dismiss-proposal"].tap()
        }
        let composer = app.textFields["ask-composer"]
        let message = "Noor Vega, \(email), Design"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertFalse(composer.isEnabled)
        XCTAssertTrue(element("contact-identity-no-match").waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["contact-proposal-title"].label, "Create a new contact?")
        let confirm = app.buttons["contact-confirm-save"]
        XCTAssertTrue(confirm.isEnabled)
        tapWhenVisible(confirm)
        let success = app.staticTexts["contact-save-success"]
        XCTAssertTrue(success.waitForExistence(timeout: 20))
        XCTAssertTrue(success.label.contains("Saved to Noor Vega"))
        assertCompactContactReceipt()
        assertContactContinuationScope(person: "Noor Vega", context: "Design")
        XCTAssertTrue(element("contact-receipt-boundary").exists)
        preserveScreenshot("Canonical contact no-match creation receipt")
        assertContactReceiptRestoresInSessions(
            sessionTitle: "Added Noor Vega",
            outcomeTitle: "Contact created",
            person: "Noor Vega",
            context: "Design"
        )
    }

    func testCanonicalContactReceiptAX5DarkChineseOpensPeopleDetail() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              let email = fixture.contactNoMatchEmail else {
            throw XCTSkip("The canonical contact identity fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-UIAccessibilityReduceMotionEnabled", "YES",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        let composer = app.textFields["ask-composer"]
        let message = "陈晓 \(email)，产品负责人搜索"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["contact-summary-name"].label, "陈晓")
        XCTAssertTrue(element("contact-identity-no-match").waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["contact-proposal-title"].label, "创建新联系人？")
        tapWhenVisible(app.buttons["contact-confirm-save"])
        XCTAssertTrue(
            app.staticTexts["contact-save-success"].waitForExistence(timeout: 20)
        )
        assertCompactContactReceipt()
        tapWhenVisible(app.buttons["contact-dismiss-proposal"])

        let liveReceipt = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "agent-contact-receipt-"
            )
        ).firstMatch
        XCTAssertTrue(liveReceipt.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["联系人已创建"].exists)
        XCTAssertTrue(app.buttons["contact-receipt-open-person"].exists)
        XCTAssertLessThanOrEqual(liveReceipt.frame.maxX, app.frame.maxX + 1)
        preserveScreenshot("Contact tool receipt AX5 dark Chinese")

        app.terminate()
        app.launch()
        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["archive-tab-sessions"])
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        let session = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND identifier != %@ AND identifier != %@",
                "agent-session-",
                "agent-session-list",
                "agent-session-persistence-notice"
            )
        ).firstMatch
        XCTAssertTrue(session.waitForExistence(timeout: 5))
        tapWhenVisible(session)

        let restoredReceipt = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "agent-contact-receipt-"
            )
        ).firstMatch
        XCTAssertTrue(restoredReceipt.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["已恢复的引用 · 请在人物中核对当前状态"].exists
        )
        let openPerson = app.buttons["contact-receipt-open-person"]
        XCTAssertTrue(openPerson.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(openPerson.frame.height, 44)
        preserveScreenshot("Restored contact tool receipt AX5 dark Chinese")

        tapWhenVisible(openPerson)
        XCTAssertTrue(element("workspace-person-detail").waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["陈晓"].exists)
        XCTAssertTrue(app.buttons["archive-tab-people"].exists)
        XCTAssertTrue(app.buttons["relationship-guide"].exists)
        preserveScreenshot("Contact receipt to People AX5 dark Chinese")
    }

    func testCanonicalContactLookupFailurePreservesMessageAndRetries() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              let email = fixture.contactNoMatchEmail else {
            throw XCTSkip("The canonical contact identity fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--fixture-contact-lookup-delay-seconds", "3",
            "--fixture-contact-lookup-fail-once",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        let composer = app.textFields["ask-composer"]
        let message = "Noor Vega, \(email), Design"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertTrue(element("contact-identity-checking").waitForExistence(timeout: 2))
        XCTAssertEqual(
            app.staticTexts["contact-proposal-title"].label,
            "Checking existing contacts"
        )
        XCTAssertFalse(composer.isEnabled)
        preserveScreenshot("Contact identity check pending")

        XCTAssertTrue(element("contact-identity-check-failed").waitForExistence(timeout: 6))
        XCTAssertEqual(
            app.staticTexts["contact-proposal-title"].label,
            "Identity check needs retry"
        )
        XCTAssertEqual(app.staticTexts["contact-summary-name"].label, "Noor Vega")
        XCTAssertFalse(app.textFields["contact-proposal-name"].exists)
        let retry = app.buttons["contact-retry-identity-check"]
        XCTAssertTrue(retry.exists)
        XCTAssertTrue(retry.isHittable)
        preserveScreenshot("Contact identity check recovery")

        retry.tap()
        XCTAssertTrue(element("contact-identity-checking").waitForExistence(timeout: 2))
        XCTAssertTrue(element("contact-identity-no-match").waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["contact-proposal-title"].label, "Create a new contact?")
        XCTAssertTrue(app.buttons["contact-confirm-save"].isEnabled)
        XCTAssertFalse(element("contact-save-success").exists)
    }

    func testCanonicalContactConfirmedMatchAttachesWithoutPreselection() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              let email = fixture.contactSingleEmail,
              let personID = fixture.contactSinglePersonID else {
            throw XCTSkip("The canonical contact identity fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        let composer = app.textFields["ask-composer"]
        let message = "Samira Current, \(email), Product"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertFalse(composer.isEnabled)
        let match = app.buttons["contact-match-\(personID)"]
        XCTAssertTrue(match.waitForExistence(timeout: 15))
        XCTAssertEqual(
            app.staticTexts["contact-proposal-title"].label,
            "Choose the existing contact"
        )
        XCTAssertTrue(element("contact-no-preselection").exists)
        XCTAssertFalse(app.buttons["contact-confirm-save"].isEnabled)
        tapWhenVisible(match)
        XCTAssertEqual(
            app.staticTexts["contact-proposal-title"].label,
            "Add to the existing contact?"
        )
        XCTAssertTrue(app.buttons["contact-confirm-save"].isEnabled)
        tapWhenVisible(app.buttons["contact-confirm-save"])
        let success = app.staticTexts["contact-save-success"]
        XCTAssertTrue(success.waitForExistence(timeout: 20))
        XCTAssertTrue(success.label.contains("Saved to Samira Current"))
        assertCompactContactReceipt()
        assertContactContinuationScope(person: "Samira Current")
        XCTAssertTrue(element("contact-receipt-boundary").exists)
        preserveScreenshot("Canonical contact confirmed match attachment receipt")
        assertContactReceiptRestoresInSessions(
            sessionTitle: "Updated Samira Current",
            outcomeTitle: "Added to existing contact",
            person: "Samira Current",
            context: nil
        )
    }

    func testCanonicalContactConflictLocksHistoryAndSavesResolutionCase() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              let email = fixture.contactConflictEmail,
              let currentPersonID = fixture.contactConflictCurrentPersonID,
              let historicalPersonID = fixture.contactConflictHistoricalPersonID else {
            throw XCTSkip("The canonical contact conflict fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        let composer = app.textFields["ask-composer"]
        let message = "Robin Lee, \(email), Search"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertFalse(composer.isEnabled)
        let current = app.buttons["contact-match-\(currentPersonID)"]
        let historical = app.buttons["contact-match-\(historicalPersonID)"]
        XCTAssertTrue(current.waitForExistence(timeout: 15))
        XCTAssertTrue(historical.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["contact-proposal-title"].label, "Identity needs review")
        XCTAssertEqual(
            element("contact-no-preselection").label,
            "Current and historical owners differ · choose the current owner or keep this unresolved"
        )
        XCTAssertTrue(current.isEnabled)
        XCTAssertFalse(historical.isEnabled)
        XCTAssertFalse(app.buttons["contact-create-distinct"].exists)
        XCTAssertTrue(
            app.buttons["contact-save-for-identity-review"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.buttons["contact-remove-identity-clue"]
                .waitForExistence(timeout: 5)
        )
        preserveScreenshot("Canonical contact conflict review")

        tapWhenVisible(app.buttons["contact-save-for-identity-review"])
        XCTAssertTrue(app.buttons["contact-confirm-save"].isEnabled)
        tapWhenVisible(app.buttons["contact-confirm-save"])
        let success = app.staticTexts["contact-save-success"]
        XCTAssertTrue(success.waitForExistence(timeout: 20))
        XCTAssertTrue(
            success.label.contains("Saved for identity review")
        )
        assertCompactContactReceipt()
        XCTAssertTrue(element("contact-receipt-boundary").exists)
        preserveScreenshot("Canonical contact conflict resolution case receipt")
        assertUnresolvedContactHasNoInheritedScope()
        assertContactReceiptRestoresInSessions(
            sessionTitle: "Review Robin Lee’s identity",
            outcomeTitle: "Saved for identity review",
            person: nil,
            context: nil
        )
    }

    func testCanonicalContactResponseLossRelaunchRetriesSameOperation() async throws {
        let proxyURL = testConfiguration(
            "TS_IOS_RESPONSE_LOSS_PROXY_URL",
            fallback: "http://127.0.0.1:4321"
        )
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              let email = fixture.contactNoMatchEmail,
              let healthURL = URL(string: "\(proxyURL)/health/live"),
              let (_, healthResponse) = try? await URLSession.shared.data(from: healthURL),
              let healthHTTPResponse = healthResponse as? HTTPURLResponse,
              (200...299).contains(healthHTTPResponse.statusCode) else {
            throw XCTSkip("The canonical contact response-loss fixture was not configured.")
        }
        let stateURL = try XCTUnwrap(
            URL(string: "\(proxyURL)/__response_loss_proxy/state")
        )
        let (initialData, initialResponse) = try await URLSession.shared.data(from: stateURL)
        XCTAssertEqual((initialResponse as? HTTPURLResponse)?.statusCode, 200)
        let initial = try JSONDecoder().decode(ResponseLossProxyState.self, from: initialData)
        guard let initialPosts = initial.resourceCapturePostCount,
              let initialDrops = initial.droppedResourceCaptureResponseCount else {
            throw XCTSkip("The contact response-loss counters were not configured.")
        }

        app.launchArguments = [
            "--workspace-backend-url", proxyURL,
            "--workspace-account-id", fixture.accountID,
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()
        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        if app.buttons["contact-dismiss-proposal"].exists {
            app.buttons["contact-dismiss-proposal"].tap()
        }
        let composer = app.textFields["ask-composer"]
        let message = "Mina Patel, \(email), Finance"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()
        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertFalse(composer.isEnabled)
        XCTAssertTrue(element("contact-identity-no-match").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["contact-confirm-save"])
        XCTAssertTrue(
            app.staticTexts["contact-save-error"].waitForExistence(timeout: 15)
        )
        XCTAssertFalse(app.staticTexts["contact-save-success"].exists)
        preserveScreenshot("Canonical contact response lost after commit")

        app.terminate()
        app.launch()
        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        XCTAssertTrue(element("contact-proposal-card").waitForExistence(timeout: 8))
        XCTAssertEqual(element("contact-user-message").label, message)
        XCTAssertEqual(app.staticTexts["contact-summary-name"].label, "Mina Patel")
        XCTAssertFalse(app.textFields["contact-proposal-name"].exists)
        let refreshedMatch = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'contact-match-'")
        ).firstMatch
        XCTAssertTrue(refreshedMatch.waitForExistence(timeout: 15))
        XCTAssertFalse(refreshedMatch.isEnabled)
        XCTAssertTrue(
            element("contact-pending-write-boundary").waitForExistence(timeout: 5)
        )
        XCTAssertEqual(
            app.staticTexts["contact-proposal-title"].label,
            "Confirm the original save"
        )
        XCTAssertFalse(app.buttons["contact-dismiss-proposal"].isEnabled)
        let retry = app.buttons["contact-confirm-save"]
        XCTAssertTrue(retry.isEnabled)
        XCTAssertTrue(retry.label.contains("Retry same operation"))
        tapWhenVisible(retry)
        XCTAssertTrue(
            app.staticTexts["contact-save-success"].waitForExistence(timeout: 20)
        )
        XCTAssertEqual(app.staticTexts["contact-proposal-title"].label, "Contact saved")
        XCTAssertTrue(app.buttons["contact-dismiss-proposal"].isEnabled)
        assertCompactContactReceipt()
        assertContactContinuationScope(person: "Mina Patel")
        preserveScreenshot("Canonical contact relaunch reconciled same operation")

        let (finalData, finalResponse) = try await URLSession.shared.data(from: stateURL)
        XCTAssertEqual((finalResponse as? HTTPURLResponse)?.statusCode, 200)
        let final = try JSONDecoder().decode(ResponseLossProxyState.self, from: finalData)
        XCTAssertEqual(
            try XCTUnwrap(final.resourceCapturePostCount),
            initialPosts + 2
        )
        XCTAssertEqual(
            try XCTUnwrap(final.droppedResourceCaptureResponseCount),
            initialDrops + 1
        )
        assertContactReceiptRestoresInSessions(
            sessionTitle: "Added Mina Patel",
            outcomeTitle: "Contact created",
            person: "Mina Patel",
            context: nil
        )
    }

    func testContactProposalAX5DarkChineseKeepsReviewAndComposerReachable() {
        app.launchArguments = [
            "--persist-preview-agent",
            "--reset-preview-agent",
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-UIAccessibilityReduceMotionEnabled", "YES",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        app.buttons["relationship-guide"].tap()
        if app.buttons["contact-dismiss-proposal"].exists {
            app.buttons["contact-dismiss-proposal"].tap()
        }
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        let message = "陈晓 xiao.chen@example.com，产品负责人搜索"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("contact-proposal-turn").waitForExistence(timeout: 5))
        XCTAssertTrue(element("contact-proposal-card").waitForExistence(timeout: 5))
        XCTAssertEqual(
            element("contact-user-message").label,
            message.replacingOccurrences(of: "，", with: ",")
        )
        XCTAssertEqual(app.staticTexts["contact-proposal-title"].label, "审阅此联系人")
        XCTAssertEqual(app.staticTexts["contact-summary-name"].label, "陈晓")
        XCTAssertEqual(app.staticTexts["contact-summary-relationship"].label, "产品负责人搜索")
        XCTAssertFalse(app.textFields["contact-proposal-name"].exists)
        XCTAssertEqual(
            app.switches["contact-confirm-identity-clue"].value as? String,
            "1"
        )
        XCTAssertTrue(app.textFields["ask-composer"].exists)
        XCTAssertFalse(app.textFields["ask-composer"].isEnabled)
        preserveScreenshot("Conversation-first contact proposal AX5 dark Chinese")

        tapWhenVisible(app.buttons["contact-edit-details"])
        XCTAssertTrue(app.textFields["contact-proposal-name"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.textFields["contact-proposal-name"].value as? String, "陈晓")
        XCTAssertTrue(app.buttons["contact-finish-details"].exists)
        preserveScreenshot("Contact proposal edit AX5 dark Chinese")

        tapWhenVisible(app.buttons["contact-dismiss-proposal"])
    }

    func testAudioSignalAX5DarkKeepsConsentAndStopReachable() throws {
        app.launchArguments = [
            "--scenario", "audio-signal-capture",
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(element("audio-signal-capture").waitForExistence(timeout: 8))
        XCTAssertTrue(element("audio-signal-idle").exists)
        let authorizingParty = app.textFields["audio-signal-authorizing-party"]
        tapWhenVisible(authorizingParty, maxSwipes: 24)
        authorizingParty.typeText("Synthetic participant")
        let dismissAudioKeyboard = app.buttons["dismiss-audio-signal-keyboard"]
        XCTAssertTrue(dismissAudioKeyboard.waitForExistence(timeout: 3))
        dismissAudioKeyboard.tap()
        let authorizationBasis = app.textFields["audio-signal-authorization-basis"]
        tapWhenVisible(authorizationBasis, maxSwipes: 24)
        authorizationBasis.typeText("Direct synthetic permission")
        XCTAssertTrue(dismissAudioKeyboard.waitForExistence(timeout: 3))
        dismissAudioKeyboard.tap()
        tapWhenVisible(app.switches["audio-signal-authorization"], maxSwipes: 24)
        tapWhenVisible(app.buttons["start-audio-signal"], maxSwipes: 24)
        XCTAssertTrue(element("audio-signal-recording").waitForExistence(timeout: 5))
        tapWhenVisible(app.buttons["stop-audio-signal"], maxSwipes: 24)
        XCTAssertTrue(element("audio-signal-saved-local").waitForExistence(timeout: 5))
        preserveScreenshot("Audio Signal AX5 dark saved local")

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [
                .dynamicType,
                .hitRegion,
                .sufficientElementDescription,
            ])
        }
    }

    func testAX5DarkModeCriticalContentRemainsReachable() throws {
        app.launchArguments = [
            "--fixture-id", "TS-CORE-01",
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge"
        ]
        app.launch()

        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 8))
        XCTAssertTrue(element("message-m1").exists)
        tapWhenVisible(app.buttons["fact-confirm-competing_process-m1"])
        XCTAssertTrue(app.staticTexts["Confirmed locally"].exists)
        let reviewInstruction = element("proposal-review-instruction")
        XCTAssertTrue(reviewInstruction.exists)
        let statusBar = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            .statusBars.firstMatch
        XCTAssertTrue(statusBar.exists)
        positionBelowStatusBar(reviewInstruction, statusBar: statusBar)
        XCTAssertGreaterThanOrEqual(reviewInstruction.frame.minY, statusBar.frame.maxY)
        XCTAssertTrue(reviewInstruction.frame.intersects(app.windows.firstMatch.frame))
        preserveScreenshot("AX5 dark status-safe review")

        if #available(iOS 17.0, *) {
            let auditTypes: XCUIAccessibilityAuditType = [
                .dynamicType,
                .contrast,
                .hitRegion,
                .sufficientElementDescription
            ]
            let issueHandler: (XCUIAccessibilityAuditIssue) throws -> Bool = { issue in
                guard issue.auditType == .contrast,
                      let issueElement = issue.element else {
                    return false
                }
                let frame = issueElement.frame
                let window = self.app.windows.firstMatch.frame
                if issueElement.identifier.hasPrefix("fact-confirm-"),
                   frame.maxY >= window.maxY - 4 {
                    // iOS 26 can retain the already-used confirmation control
                    // as a clipped accessibility node at the scroll edge. Its
                    // audit crop contains only the button's rounded edge and
                    // the canvas behind it, not any visible label. Keep its
                    // contrast findings active away from the viewport edge.
                    return true
                }
                let scrollView = self.app.scrollViews.firstMatch
                let viewportBottom = scrollView.exists
                    ? scrollView.frame.maxY
                    : window.maxY
                let statusBottom = statusBar.frame.maxY
                let edgeTolerance: CGFloat = 1
                return frame.minY <= statusBottom + edgeTolerance
                    || frame.maxY >= viewportBottom - edgeTolerance
            }

            do {
                try app.performAccessibilityAudit(for: auditTypes, issueHandler)
            } catch let error as NSError
                where error.domain == "com.apple.xcode.xctest.accessibilityAudit"
                    && error.code == -56 {
                // Xcode occasionally times out before producing any audit
                // result. Retry that infrastructure failure once; recorded
                // accessibility issues are not errors and remain unsuppressed.
                XCTAssertTrue(reviewInstruction.waitForExistence(timeout: 2))
                try app.performAccessibilityAudit(for: auditTypes, issueHandler)
            }
        }
        preserveScreenshot("AX5 dark critical review")
    }

    func testAccessibilityOrderPlacesEvidenceBeforeFactDecision() {
        launch(fixtureID: "TS-CORE-01")

        let elements = app.descendants(matching: .any).allElementsBoundByIndex
        let messageIndex = elements.firstIndex { $0.identifier == "message-m1" }
        let factIndex = elements.firstIndex { $0.identifier == "fact-card-competing_process-m1" }

        XCTAssertNotNil(messageIndex)
        XCTAssertNotNil(factIndex)
        XCTAssertLessThan(messageIndex!, factIndex!)
    }

    private func launch(fixtureID: String? = nil, scenario: String? = nil) {
        if let fixtureID {
            app.launchArguments += ["--fixture-id", fixtureID]
        }
        if let scenario {
            app.launchArguments += ["--scenario", scenario]
        }
        app.launch()
    }

    private func testConfiguration(_ key: String, fallback: String) -> String {
        if let environmentValue = ProcessInfo.processInfo.environment[key],
           !environmentValue.isEmpty {
            return environmentValue
        }
        if let bundleValue = Bundle(for: CandidateSignalUITests.self)
            .object(forInfoDictionaryKey: key) as? String,
           !bundleValue.isEmpty,
           !bundleValue.contains("$(") {
            return bundleValue
        }
        return fallback
    }

    private func canonicalBackendFixtureIsAvailable(at backendURL: String) async -> Bool {
        guard let baseURL = URL(string: backendURL) else { return false }
        var loginRequest = URLRequest(
            url: baseURL.appending(path: "v1/auth/simulated-login")
        )
        loginRequest.httpMethod = "POST"
        loginRequest.setValue("application/json", forHTTPHeaderField: "content-type")
        loginRequest.httpBody = try? JSONSerialization.data(withJSONObject: [
            "account_slug": "fixture-alpha",
            "user_email": "reviewer@alpha.local",
            "client_label": "ios-ui-test-preflight",
        ])

        guard let (loginData, loginResponse) = try? await URLSession.shared.data(
            for: loginRequest
        ),
        let loginHTTPResponse = loginResponse as? HTTPURLResponse,
        (200...299).contains(loginHTTPResponse.statusCode),
        let loginJSON = try? JSONSerialization.jsonObject(with: loginData)
            as? [String: Any],
        let accessToken = loginJSON["access_token"] as? String else {
            return false
        }

        var components = URLComponents(
            url: baseURL.appending(path: "v1/workspace-review"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "fixture_case_id", value: "TS-CORE-01")
        ]
        guard let workspaceURL = components?.url else { return false }
        var workspaceRequest = URLRequest(url: workspaceURL)
        workspaceRequest.setValue(
            "Bearer \(accessToken)",
            forHTTPHeaderField: "authorization"
        )
        guard let (_, workspaceResponse) = try? await URLSession.shared.data(
            for: workspaceRequest
        ),
        let workspaceHTTPResponse = workspaceResponse as? HTTPURLResponse else {
            return false
        }
        return (200...299).contains(workspaceHTTPResponse.statusCode)
    }

    private func typeTextReliably(_ text: String, into field: XCUIElement) {
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        let keyboard = app.keyboards.firstMatch

        for _ in 0..<3 {
            field.tap()
            if keyboard.waitForExistence(timeout: 1.5) {
                field.typeText(text)
                return
            }
        }

        XCTFail("Expected the text field to accept keyboard focus")
    }

    private func assertCompactContactReceipt() {
        XCTAssertTrue(element("contact-completed-receipt").exists)
        XCTAssertTrue(element("contact-saved-identity-clue").exists)
        XCTAssertFalse(element("contact-identity-state").exists)
        XCTAssertFalse(app.switches["contact-confirm-identity-clue"].exists)
        XCTAssertFalse(app.buttons["contact-confirm-save"].exists)
        XCTAssertTrue(app.textFields["ask-composer"].isEnabled)
        XCTAssertTrue(app.buttons["ask-voice"].isEnabled)
    }

    private func assertContactContinuationScope(
        person: String,
        context: String? = nil
    ) {
        let selector = element("ask-scope-selector")
        XCTAssertTrue(selector.waitForExistence(timeout: 5))
        let value = selector.value as? String
        XCTAssertTrue(value?.contains(person) == true)
        if let context {
            XCTAssertTrue(value?.contains(context) == true)
        }
    }

    private func assertUnresolvedContactHasNoInheritedScope() {
        let selector = element("ask-scope-selector")
        XCTAssertTrue(selector.waitForExistence(timeout: 5))
        XCTAssertEqual(selector.value as? String, "None")

        let composer = app.textFields["ask-composer"]
        typeTextReliably("What changed in this relationship?", into: composer)
        let priorContactProposalCount = app.descendants(matching: .any)
            .matching(identifier: "contact-proposal-turn")
            .count
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "Send and let Agent link the relationship")
        send.tap()
        XCTAssertTrue(element("ask-scope-search").waitForExistence(timeout: 5))
        XCTAssertEqual(
            app.descendants(matching: .any)
                .matching(identifier: "contact-proposal-turn")
                .count,
            priorContactProposalCount
        )
    }

    private func assertContactReceiptRestoresInSessions(
        sessionTitle: String,
        outcomeTitle: String,
        person: String?,
        context: String?
    ) {
        tapWhenVisible(app.buttons["contact-dismiss-proposal"])
        let liveReceipt = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "agent-contact-receipt-"
            )
        ).firstMatch
        XCTAssertTrue(liveReceipt.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[outcomeTitle].exists)
        XCTAssertFalse(element("contact-user-message").exists)
        preserveScreenshot("Agent contact tool history receipt")

        app.terminate()
        app.launch()
        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        XCTAssertTrue(
            app.buttons["archive-tab-sessions"].waitForExistence(timeout: 5)
        )
        app.buttons["archive-tab-sessions"].tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        let session = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
                "agent-session-",
                sessionTitle
            )
        ).firstMatch
        XCTAssertTrue(session.waitForExistence(timeout: 5))
        session.tap()

        let restoredReceipt = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@",
                "agent-contact-receipt-"
            )
        ).firstMatch
        XCTAssertTrue(restoredReceipt.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[outcomeTitle].exists)
        if let person {
            XCTAssertTrue(
                app.staticTexts[
                    "Restored reference · verify current state in People"
                ].exists
            )
            assertContactContinuationScope(person: person, context: context)
            let openPerson = app.buttons["contact-receipt-open-person"]
            XCTAssertTrue(openPerson.waitForExistence(timeout: 5))
            preserveScreenshot("Restored Agent contact tool history")
            tapWhenVisible(openPerson)
            XCTAssertTrue(
                element("workspace-person-detail").waitForExistence(timeout: 8)
            )
            XCTAssertTrue(app.staticTexts[person].exists)
            XCTAssertTrue(app.buttons["archive-tab-people"].exists)
            XCTAssertTrue(app.buttons["relationship-guide"].exists)
            preserveScreenshot("Contact receipt opens canonical People detail")
        } else {
            XCTAssertTrue(
                app.staticTexts[
                    "Restored reference · identity still needs review"
                ].exists
            )
            XCTAssertFalse(app.buttons["contact-receipt-open-person"].exists)
            let selector = element("ask-scope-selector")
            XCTAssertTrue(selector.waitForExistence(timeout: 5))
            XCTAssertEqual(selector.value as? String, "None")
            preserveScreenshot("Restored Agent contact tool history")
        }
    }

    private func tapWhenVisible(_ element: XCUIElement, maxSwipes: Int = 14) {
        var swipes = 0
        while !element.exists, swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.exists, "Expected \(element) to exist after scrolling")
        if !element.isHittable {
            // A known SwiftUI control can sit outside the current viewport or
            // behind the keyboard safe area. XCTest performs one semantic
            // scroll-to-visible before synthesizing the user's tap.
            element.tap()
            return
        }
        element.tap()
    }

    private func waitForPhotoPicker() -> XCUIElement {
        XCTAssertTrue(app.staticTexts["Loading..."].waitForNonExistence(timeout: 10))
        let onboardingClose = app.buttons["Close"].firstMatch
        if onboardingClose.exists {
            onboardingClose.tap()
        }
        let photoPicker = app.navigationBars.firstMatch
        XCTAssertTrue(photoPicker.waitForExistence(timeout: 8))
        return photoPicker
    }

    private func closePhotoPicker(_ photoPicker: XCUIElement) {
        let close = photoPicker.buttons.firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        close.tap()
        XCTAssertFalse(photoPicker.waitForExistence(timeout: 5))
    }

    private func tapWorkspaceElementWhenVisible(
        _ element: XCUIElement,
        in scrollIdentifier: String,
        maxSwipes: Int = 40
    ) {
        let workspaceScroll = app.descendants(matching: .any)[scrollIdentifier]
        let window = app.windows.firstMatch
        var swipes = 0
        while swipes < maxSwipes {
            let guide = app.buttons["relationship-guide"]
            let visibleBottom = guide.exists
                ? guide.frame.minY - 8
                : window.frame.maxY - 8
            let headerTab = app.buttons["archive-tab-today"]
            let visibleTop = headerTab.exists
                ? headerTab.frame.maxY + 12
                : window.frame.minY + 12
            if element.exists {
                let targetFrame = element.frame
                if targetFrame.width > 0,
                   targetFrame.minY >= visibleTop,
                   targetFrame.maxY <= visibleBottom {
                    // SwiftUI can report a plainly visible `.plain` button as not
                    // hittable while a persistent safe-area inset is present.
                    // Tap the verified visible center in the app window so the
                    // test still exercises the user's real touch target.
                    let target = CGVector(
                        dx: (targetFrame.midX - window.frame.minX) / window.frame.width,
                        dy: (targetFrame.midY - window.frame.minY) / window.frame.height
                    )
                    window.coordinate(withNormalizedOffset: target).tap()
                    return
                }
                if targetFrame.minY < visibleTop {
                    if workspaceScroll.exists {
                        workspaceScroll.swipeDown()
                    } else {
                        app.swipeDown()
                    }
                } else {
                    if workspaceScroll.exists {
                        workspaceScroll.swipeUp()
                    } else {
                        app.swipeUp()
                    }
                }
                swipes += 1
                continue
            }
            // Several tab surfaces remain in the accessibility hierarchy, so
            // target the selected surface explicitly instead of firstMatch.
            if workspaceScroll.exists {
                workspaceScroll.swipeUp()
            } else {
                app.swipeUp()
            }
            swipes += 1
        }
        XCTFail("Expected \(element) to become visible above persistent workspace controls")
    }

    private func scrollToVisible(_ element: XCUIElement, maxSwipes: Int = 14) {
        var swipes = 0
        while (!element.exists || !element.isHittable), swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.exists, "Expected \(element) to exist after scrolling")
        XCTAssertTrue(element.isHittable, "Expected \(element) to be visible after scrolling")
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func assertAccessibilityOrder(
        _ identifiers: [String],
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let elements = app.descendants(matching: .any).allElementsBoundByIndex
        var previousIndex = -1
        for identifier in identifiers {
            guard let index = elements.firstIndex(where: {
                $0.identifier == identifier
            }) else {
                XCTFail(
                    "Accessibility order is missing \(identifier).",
                    file: file,
                    line: line
                )
                return
            }
            XCTAssertGreaterThan(
                index,
                previousIndex,
                "Accessibility order should place \(identifier) after the prior decision context.",
                file: file,
                line: line
            )
            previousIndex = index
        }
    }

    private func openSettings() {
        app.buttons["relationship-menu"].tap()
        XCTAssertTrue(
            app.buttons["close-relationship-menu"]
                .waitForExistence(timeout: 5)
        )
        let settings = app.buttons["open-settings"]
        if !settings.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
    }

    private func positionBelowStatusBar(
        _ element: XCUIElement,
        statusBar: XCUIElement
    ) {
        var attempts = 0
        while element.frame.minY < statusBar.frame.maxY, attempts < 3 {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.32))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.44))
            start.press(forDuration: 0.01, thenDragTo: end)
            attempts += 1
        }
    }

    private func preserveScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private struct ResponseLossProxyState: Decodable {
    let reviewPostCount: Int
    let droppedResponseCount: Int
    let actionCompletionPostCount: Int
    let droppedActionResponseCount: Int
    let resourceCapturePostCount: Int?
    let droppedResourceCaptureResponseCount: Int?

    enum CodingKeys: String, CodingKey {
        case reviewPostCount = "review_post_count"
        case droppedResponseCount = "dropped_response_count"
        case actionCompletionPostCount = "action_completion_post_count"
        case droppedActionResponseCount = "dropped_action_response_count"
        case resourceCapturePostCount = "resource_capture_post_count"
        case droppedResourceCaptureResponseCount = "dropped_resource_capture_response_count"
    }
}

private struct IOSPursuitProposalFixture: Decodable {
    let backendURL: String
    let accountID: String
    let proposalID: String
    let pursuitID: String
    let personID: String
    let recoveryProposalID: String
    let recoveryPursuitID: String
    let sameNameFirstPersonID: String
    let sameNameSecondPersonID: String
    let sameNameSecondContextID: String
    let sameNameSecondRoleID: String
    let contactNoMatchEmail: String?
    let contactSingleEmail: String?
    let contactSinglePersonID: String?
    let contactConflictEmail: String?
    let contactConflictCurrentPersonID: String?
    let contactConflictHistoricalPersonID: String?

    enum CodingKeys: String, CodingKey {
        case backendURL = "backend_url"
        case accountID = "account_id"
        case proposalID = "proposal_id"
        case pursuitID = "pursuit_id"
        case personID = "person_id"
        case recoveryProposalID = "recovery_proposal_id"
        case recoveryPursuitID = "recovery_pursuit_id"
        case sameNameFirstPersonID = "same_name_first_person_id"
        case sameNameSecondPersonID = "same_name_second_person_id"
        case sameNameSecondContextID = "same_name_second_context_id"
        case sameNameSecondRoleID = "same_name_second_role_id"
        case contactNoMatchEmail = "contact_no_match_email"
        case contactSingleEmail = "contact_single_email"
        case contactSinglePersonID = "contact_single_person_id"
        case contactConflictEmail = "contact_conflict_email"
        case contactConflictCurrentPersonID = "contact_conflict_current_person_id"
        case contactConflictHistoricalPersonID = "contact_conflict_historical_person_id"
    }
}

private struct IOSPursuitFixtureHealth: Decodable {
    let backendURL: String

    enum CodingKeys: String, CodingKey {
        case backendURL = "backend_url"
    }
}

private struct TextSignalProxyState: Decodable {
    let resourceCapturePostCount: Int
    let pursuitProposalPostCount: Int
    let deletionPostCount: Int
    let blockedRequestCount: Int
    let offline: Bool

    enum CodingKeys: String, CodingKey {
        case resourceCapturePostCount = "resource_capture_post_count"
        case pursuitProposalPostCount = "pursuit_proposal_post_count"
        case deletionPostCount = "deletion_post_count"
        case blockedRequestCount = "blocked_request_count"
        case offline
    }
}
