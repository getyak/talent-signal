import XCTest
import UIKit

@MainActor
final class CandidateSignalUITests: XCTestCase {
    private var app: XCUIApplication!
    private let previewWorkspaceEnvironmentKey = "TS_IOS_UI_TEST_PREVIEW_WORKSPACE"

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = [
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
            "-talent-signal.interface-language", "en",
        ]
        app.launchEnvironment[previewWorkspaceEnvironmentKey] = "true"
    }

    func testBareDebugLaunchOpensTheDocumentedLocalPreviewFallback() {
        app.launchEnvironment.removeValue(forKey: previewWorkspaceEnvironmentKey)
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        XCTAssertTrue(element("workspace-preview-boundary").exists)
        XCTAssertFalse(element("authentication-screen").exists)
        preserveScreenshot("Bare Debug launch uses the local preview fallback")
    }

    func testAgentStudioIsADedicatedSparseDestination() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let agentEntry = app.buttons["relationship-agent-studio"]
        XCTAssertTrue(agentEntry.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(agentEntry.frame.width, 44)
        XCTAssertGreaterThanOrEqual(agentEntry.frame.height, 44)
        agentEntry.tap()

        XCTAssertTrue(element("agent-studio").waitForExistence(timeout: 5))
        for identifier in [
            "agent-open-memory",
            "agent-open-profile",
            "agent-open-sources",
            "agent-open-permissions",
        ] {
            let destination = app.buttons[identifier]
            XCTAssertTrue(destination.exists, "Missing Agent destination: \(identifier)")
            XCTAssertGreaterThanOrEqual(destination.frame.height, 44)
        }
        XCTAssertFalse(app.buttons["Ask Agent"].exists)
        preserveScreenshot("Agent is a dedicated sparse destination")

        app.buttons["agent-open-sources"].tap()
        XCTAssertTrue(element("agent-sources").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["agent-import-contacts-file"].exists)
        XCTAssertTrue(app.buttons["agent-import-linkedin"].exists)
        let existingLinkedIn = app.buttons["agent-reference-linkedin"]
        if existingLinkedIn.exists {
            existingLinkedIn.tap()
            tapWhenVisible(app.buttons["Remove reference"])
        }
        app.buttons["agent-add-profile-reference"].tap()
        let reference = app.textFields["agent-reference-value"]
        XCTAssertTrue(reference.waitForExistence(timeout: 3))
        reference.tap()
        reference.typeText("example")
        app.buttons["agent-save-profile-reference"].tap()
        XCTAssertTrue(app.buttons["agent-reference-linkedin"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Reference"].exists)
        app.buttons["agent-reference-linkedin"].tap()
        tapWhenVisible(app.buttons["Remove reference"])
        XCTAssertFalse(app.buttons["agent-reference-linkedin"].exists)
        preserveScreenshot("Agent sources separate files references and connections")

        app.terminate()
        app.launch()
        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-agent-studio"].tap()
        XCTAssertTrue(element("agent-studio").waitForExistence(timeout: 5))
        app.buttons["agent-open-sources"].tap()
        XCTAssertTrue(element("agent-sources").waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["agent-reference-linkedin"].exists)
        XCTAssertTrue(app.buttons["agent-add-profile-reference"].exists)
    }

    func testAgentStudioRemainsReachableInChineseAtAX5() {
        app.launchArguments = [
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let agentEntry = app.buttons["relationship-agent-studio"]
        XCTAssertTrue(agentEntry.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(agentEntry.frame.width, 44)
        XCTAssertGreaterThanOrEqual(agentEntry.frame.height, 44)
        agentEntry.tap()

        XCTAssertTrue(element("agent-studio").waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["agent-alias"].exists)
        let sources = app.buttons["agent-open-sources"]
        scrollToVisible(sources)
        XCTAssertGreaterThanOrEqual(sources.frame.height, 44)
        preserveScreenshot("Agent compact Chinese AX5")
        sources.tap()

        XCTAssertTrue(element("agent-sources").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["agent-import-contacts-file"].exists)
        XCTAssertTrue(app.buttons["agent-add-profile-reference"].exists)
        let actionButton = app.buttons["agent-open-action-button"]
        scrollToVisible(actionButton)
        XCTAssertGreaterThanOrEqual(actionButton.frame.height, 44)
        XCTAssertFalse(actionButton.label.contains("已设置"))
        preserveScreenshot("Agent sources compact Chinese AX5")
        actionButton.tap()

        XCTAssertTrue(element("action-button-settings").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["创建两步快捷指令"].exists)
        XCTAssertTrue(element("shortcut-local-boundary").exists)
        let buildShortcut = element("build-screenshot-shortcut")
        scrollToVisible(buildShortcut)
        XCTAssertGreaterThanOrEqual(buildShortcut.frame.height, 44)
        XCTAssertTrue(buildShortcut.isHittable)
        XCTAssertEqual(buildShortcut.label, "打开快捷指令编辑器")
        preserveScreenshot("Action Button setup Chinese AX5")
    }

    func testDisplaySettingsSeparateTextSizeFromCardDensity() {
        app.launchEnvironment["TS_IOS_UI_TEST_TEXT_SIZE"] = "system"
        app.launchEnvironment["TS_IOS_UI_TEST_CARD_DENSITY"] = "compact"
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openRelationshipMenu()
        let display = app.buttons["open-display-settings"]
        XCTAssertTrue(display.waitForExistence(timeout: 5))
        display.tap()

        XCTAssertTrue(element("display-settings").waitForExistence(timeout: 5))
        let preview = element("display-settings-preview")
        XCTAssertTrue(preview.waitForExistence(timeout: 5))
        XCTAssertEqual(preview.value as? String, "Compact")

        let comfortable = app.buttons["card-density-comfortable"]
        scrollToVisible(comfortable)
        XCTAssertTrue(comfortable.isHittable)
        XCTAssertGreaterThanOrEqual(comfortable.frame.height, 44)
        comfortable.tap()
        XCTAssertEqual(
            app.buttons["card-density-comfortable"].value as? String,
            "Selected"
        )
        XCTAssertEqual(
            element("display-settings-preview").value as? String,
            "Comfortable"
        )

        let smallText = app.buttons["text-size-compact"]
        scrollToVisible(smallText)
        XCTAssertTrue(smallText.isHittable)
        XCTAssertGreaterThanOrEqual(smallText.frame.height, 44)
        smallText.tap()
        XCTAssertEqual(
            app.buttons["text-size-compact"].value as? String,
            "Selected"
        )
        XCTAssertEqual(
            app.buttons["card-density-comfortable"].value as? String,
            "Selected"
        )
        preserveScreenshot("Display settings separate size and density")
    }

    func testPeopleSearchKeepsCompactCardsIndependent() {
        app.launchEnvironment["TS_IOS_UI_TEST_TEXT_SIZE"] = "system"
        app.launchEnvironment["TS_IOS_UI_TEST_CARD_DENSITY"] = "compact"
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        let leila = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "workspace-person-")
        ).element(boundBy: 0)
        XCTAssertTrue(leila.waitForExistence(timeout: 5))
        XCTAssertLessThan(leila.frame.height, 132)
        XCTAssertTrue(leila.label.contains("Chief Product Officer search"))

        let search = app.textFields["people-search-field"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(search.frame.height, 44)
        search.tap()
        search.typeText("Leila")
        XCTAssertTrue(app.staticTexts["Leila Hartmann"].exists)
        XCTAssertFalse(app.staticTexts["Nia Williams"].exists)
        preserveScreenshot("Compact People search")

        app.buttons["people-search-clear"].tap()
        let nia = app.buttons[
            "workspace-person-20000000-0000-4000-8000-000000000002"
        ]
        XCTAssertTrue(nia.waitForExistence(timeout: 3))
        XCTAssertTrue(nia.label.contains("Candidate · Independent board director search"))
    }

    func testPeopleSearchAndPursuitFilterNarrowWithoutRanking() {
        app.launch()

        let people = app.buttons["archive-tab-people"]
        XCTAssertTrue(people.waitForExistence(timeout: 8))
        people.tap()

        let search = app.textFields["people-search-field"]
        XCTAssertTrue(search.waitForExistence(timeout: 4))
        search.tap()
        search.typeText("Nia")
        XCTAssertTrue(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000002"
            ].waitForExistence(timeout: 2)
        )
        XCTAssertFalse(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000001"
            ].exists
        )

        let clear = element("people-search-clear")
        XCTAssertTrue(clear.waitForExistence(timeout: 2))
        clear.tap()
        XCTAssertTrue(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000001"
            ].waitForExistence(timeout: 2)
        )

        search.tap()
        search.typeText("Meridian")
        XCTAssertTrue(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000001"
            ].waitForExistence(timeout: 2)
        )
        XCTAssertFalse(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000002"
            ].exists
        )
        XCTAssertTrue(clear.waitForExistence(timeout: 2))
        clear.tap()

        let filter = element("people-filter-menu")
        filter.tap()
        let chiefProductOfficerFilter = element(
            "people-filter-pursuit-30000000-0000-4000-8000-000000000001"
        )
        XCTAssertTrue(chiefProductOfficerFilter.waitForExistence(timeout: 2))
        chiefProductOfficerFilter.tap()
        XCTAssertTrue(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000001"
            ].waitForExistence(timeout: 2)
        )
        XCTAssertFalse(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000002"
            ].exists
        )
        preserveScreenshot("People Pursuit scope filter")

        search.tap()
        search.typeText("Nia")
        XCTAssertTrue(element("people-no-matches").waitForExistence(timeout: 2))
        let reset = element("people-filter-reset")
        XCTAssertTrue(reset.exists)
        XCTAssertGreaterThanOrEqual(reset.frame.height, 44)
        reset.tap()
        XCTAssertTrue(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000001"
            ].waitForExistence(timeout: 2)
        )
        XCTAssertTrue(
            app.buttons[
                "workspace-person-20000000-0000-4000-8000-000000000002"
            ].exists
        )
        preserveScreenshot("People search and Pursuit filter recovery")
    }

    func testCalendarProposalConfirmsWithoutOpeningSystemEditor() {
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
        preserveScreenshot("Calendar proposal before confirmation")

        add.tap()
        XCTAssertTrue(element("calendar-saved").waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["cancel-button"].exists)
        XCTAssertFalse(dismiss.exists)
        preserveScreenshot("Calendar proposal confirmed in app")
    }

    func testCalendarProposalRecordsOneDirectSyncReceipt() throws {
        app.launchArguments = [
            "--scenario", "calendar-handoff",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        let addProposal = app.buttons["add-calendar-proposal"]
        XCTAssertTrue(addProposal.waitForExistence(timeout: 8))
        addProposal.tap()

        XCTAssertTrue(element("calendar-saved").waitForExistence(timeout: 8))
        XCTAssertFalse(addProposal.exists)
        preserveScreenshot("Calendar direct sync receipt")
    }

    func testDefaultLaunchShowsEditorialToday() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Today"].exists)
        XCTAssertEqual(
            element("today-attention-summary").label,
            "Needs your decision · 2"
        )
        XCTAssertFalse(element("today-unread-session").exists)
        XCTAssertTrue(element("workspace-preview-boundary").exists)
        let calendarReminder = element("today-calendar-reminder")
        XCTAssertTrue(calendarReminder.exists)
        XCTAssertTrue(calendarReminder.label.contains("Chief Product Officer search"))
        XCTAssertGreaterThan(calendarReminder.frame.height, 80)
        XCTAssertTrue(element("today-focus").exists)
        for decisionID in ["preview-contact", "preview-calendar"] {
            let add = app.buttons["today-decision-add-\(decisionID)"]
            let edit = app.buttons["today-decision-edit-\(decisionID)"]
            let dismiss = app.buttons["today-decision-dismiss-\(decisionID)"]
            XCTAssertTrue(add.exists)
            XCTAssertTrue(edit.exists)
            XCTAssertTrue(dismiss.exists)
            XCTAssertGreaterThanOrEqual(add.frame.height, 43.5)
            XCTAssertGreaterThanOrEqual(edit.frame.height, 43.5)
            XCTAssertGreaterThanOrEqual(dismiss.frame.height, 43.5)
        }
        XCTAssertFalse(element("no-action-summary").exists)
        XCTAssertFalse(element("today-calendar-card").exists)
        XCTAssertFalse(app.staticTexts["90-second product loop"].exists)
        preserveScreenshot("Editorial Today default return surface")
    }

    func testTodayInlineDecisionsSupportEvidenceEditApprovalDismissAndUndo() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))

        let evidence = app.buttons["today-decision-evidence-preview-contact"]
        XCTAssertTrue(evidence.exists)
        evidence.tap()
        XCTAssertTrue(
            element("today-decision-evidence-quote-preview-contact")
                .waitForExistence(timeout: 3)
        )

        let addContact = app.buttons["today-decision-add-preview-contact"]
        tapWhenVisible(addContact)
        let contactReceipt = element("today-decision-receipt-preview-contact")
        XCTAssertTrue(contactReceipt.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["No write was made to Contacts."].exists)
        preserveScreenshot("Contact decision local receipt")
        app.buttons["today-decision-restore-preview-contact"].tap()
        XCTAssertTrue(addContact.waitForExistence(timeout: 3))

        let editCalendar = app.buttons["today-decision-edit-preview-calendar"]
        tapWhenVisible(editCalendar)
        XCTAssertTrue(element("today-decision-editor").waitForExistence(timeout: 3))
        let primary = element("today-decision-editor-primary")
        XCTAssertTrue(primary.waitForExistence(timeout: 3))
        primary.tap()
        primary.typeText("Confirmed · ")
        app.buttons["today-decision-editor-save"].tap()
        XCTAssertTrue(
            element("today-decision-effect-preview-calendar")
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            element("today-decision-effect-preview-calendar")
                .label.contains("Confirmed")
        )

        let dismissCalendar = app.buttons["today-decision-dismiss-preview-calendar"]
        tapWhenVisible(dismissCalendar)
        XCTAssertTrue(
            element("today-decision-receipt-preview-calendar")
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            app.staticTexts["No write was made to Apple Calendar."].exists
        )
        preserveScreenshot("Calendar dismissed local receipt")
        app.buttons["today-decision-restore-preview-calendar"].tap()
        XCTAssertTrue(dismissCalendar.waitForExistence(timeout: 3))
        preserveScreenshot("Today inline decision states")
    }

    func testTodayInlineDecisionsRemainReachableInChineseDarkAX5() {
        app.launchArguments = [
            "--force-dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let calendarReminder = element("today-calendar-reminder")
        XCTAssertTrue(calendarReminder.exists)
        XCTAssertTrue(calendarReminder.label.contains("首席产品官搜索"))
        XCTAssertGreaterThan(calendarReminder.frame.height, 80)

        let addContact = app.buttons["today-decision-add-preview-contact"]
        tapWhenVisible(addContact)
        XCTAssertTrue(
            element("today-decision-receipt-preview-contact")
                .waitForExistence(timeout: 3)
        )
        let restoreContact = app.buttons[
            "today-decision-restore-preview-contact"
        ]
        XCTAssertGreaterThanOrEqual(restoreContact.frame.height, 43.5)
        restoreContact.tap()

        let editCalendar = app.buttons["today-decision-edit-preview-calendar"]
        tapWhenVisible(editCalendar)
        XCTAssertTrue(element("today-decision-editor").waitForExistence(timeout: 3))
        XCTAssertTrue(element("today-decision-editor-primary").exists)
        app.buttons["取消"].tap()

        let dismissCalendar = app.buttons[
            "today-decision-dismiss-preview-calendar"
        ]
        tapWhenVisible(dismissCalendar)
        XCTAssertTrue(
            element("today-decision-receipt-preview-calendar")
                .waitForExistence(timeout: 3)
        )
        XCTAssertGreaterThanOrEqual(
            app.buttons["today-decision-restore-preview-calendar"].frame.height,
            43.5
        )
        preserveScreenshot("Today decisions Chinese dark AX5")
    }

    func testUnscopedGreetingRepliesWithoutOpeningRelationshipChoices() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("Hello", into: composer)

        let send = hittableButton("ask-send")
        XCTAssertTrue(send.isEnabled)
        send.tap()

        XCTAssertTrue(
            app.staticTexts[
                "Hello, I’m here. You can chat directly or tell me which relationship you want to revisit."
            ].waitForExistence(timeout: 5)
        )
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertFalse(
            app.buttons.matching(
                NSPredicate(
                    format: "identifier BEGINSWITH %@",
                    "ask-recall-candidate-"
                )
            ).firstMatch.exists
        )
        preserveScreenshot("Agent replies without relationship context")
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
        let composer = app.textFields["ask-composer"]
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

    func testRelationshipCalendarConfirmsInAppWithSyncDisabled() {
        app.launchArguments += [
            "-talent-signal.calendar-sync.enabled", "NO",
        ]
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
        let confirm = app.buttons["calendar-confirm-activity"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertTrue(confirm.isEnabled)
        confirm.tap()

        XCTAssertTrue(element("calendar-activity-detail").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Synthetic preview · not in Apple Calendar"].exists)
        XCTAssertFalse(app.buttons["cancel-button"].exists)
        preserveScreenshot("Relationship activity confirmed in app")
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
            "UICTContentSizeCategoryAccessibilityXXXL",
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
        for _ in 0..<8 where !activity.isHittable { app.swipeUp() }
        XCTAssertTrue(activity.isHittable)
        preserveScreenshot("Relationship calendar agenda at actual AX5")
        activity.tap()
        XCTAssertGreaterThan(app.staticTexts["Leila Hartmann"].firstMatch.frame.height, 50)

        let prepare = app.buttons["calendar-prepare-agent"]
        XCTAssertTrue(prepare.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(prepare.frame.height, 44)
        for _ in 0..<8 where !prepare.isHittable { app.swipeUp() }
        XCTAssertTrue(prepare.isHittable)
        preserveScreenshot("Relationship calendar dark AX5")
    }

    func testWorkspaceMenuLeadsWithAccountSetupAndRealUtilities() {
        app.launchArguments = [
            "-talent-signal.setup.action-button-complete",
            "NO",
            "-talent-signal.setup.screenshot-shortcut-received-at",
            "0",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openRelationshipMenu()

        XCTAssertTrue(
            app.buttons["close-relationship-menu"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["open-account-settings"].exists)
        let actionButtonOnboarding = app.buttons["open-action-button-onboarding"]
        XCTAssertTrue(actionButtonOnboarding.exists)
        let actionButtonSettings = app.buttons["open-action-button-settings"]
        if !actionButtonSettings.exists {
            app.swipeUp()
        }
        XCTAssertTrue(actionButtonSettings.exists)
        XCTAssertFalse(app.staticTexts["Talent Signal"].exists)
        preserveScreenshot("Quiet workspace menu")

        if !actionButtonOnboarding.isHittable {
            app.swipeDown()
        }
        XCTAssertTrue(actionButtonOnboarding.isHittable)
        actionButtonOnboarding.tap()
        XCTAssertTrue(element("action-button-settings").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Build the two-action Shortcut"].exists)
        let systemStep = element("screenshot-shortcut-step-1")
        let talentSignalStep = element("screenshot-shortcut-step-2")
        XCTAssertEqual(systemStep.label, "1. Take Screenshot")
        XCTAssertEqual(systemStep.value as? String, "System action")
        XCTAssertEqual(talentSignalStep.label, "2. Review screenshot")
        XCTAssertEqual(talentSignalStep.value as? String, "Talent Signal action")
        XCTAssertTrue(element("shortcut-local-boundary").exists)
        let buildShortcut = element("build-screenshot-shortcut")
        XCTAssertTrue(buildShortcut.exists)
        XCTAssertGreaterThanOrEqual(buildShortcut.frame.height, 44)
        XCTAssertEqual(buildShortcut.label, "Open Shortcut editor")
        preserveScreenshot("Action Button setup")
        let setupConfirmation = app.buttons["confirm-action-button-setup"]
        scrollToVisible(setupConfirmation)
        XCTAssertTrue(setupConfirmation.exists)
        XCTAssertEqual(setupConfirmation.label, "I've assigned the Shortcut")
        let verification = element("screenshot-shortcut-verification")
        scrollToVisible(verification)
        XCTAssertEqual(verification.label, "Not set up")
        XCTAssertTrue(
            (verification.value as? String)?.contains("No screenshot") == true
        )
        let browseShortcuts = element("open-app-shortcuts")
        scrollToVisible(browseShortcuts)
        XCTAssertTrue(browseShortcuts.exists)
        XCTAssertGreaterThanOrEqual(browseShortcuts.frame.height, 44)
    }

    func testActionButtonSetupSeparatesObservedShortcutReceiptFromAssignment() {
        app.launchArguments = [
            "-talent-signal.setup.action-button-complete",
            "NO",
            "-talent-signal.setup.screenshot-shortcut-received-at",
            "1788480000",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openRelationshipMenu()
        let actionButtonSettings = app.buttons["open-action-button-settings"]
        scrollToVisible(actionButtonSettings)
        XCTAssertTrue(actionButtonSettings.label.contains("Local receipt"))
        actionButtonSettings.tap()

        XCTAssertTrue(element("action-button-settings").waitForExistence(timeout: 5))
        let verification = element("screenshot-shortcut-verification")
        scrollToVisible(verification)
        XCTAssertEqual(verification.label, "Screenshot received via Shortcuts")
        XCTAssertTrue(
            (verification.value as? String)?.contains(
                "local review queue"
            ) == true
        )
        XCTAssertTrue(app.buttons["I've assigned the Shortcut"].exists)
        XCTAssertFalse(app.staticTexts["Action Button Ready"].exists)
        preserveScreenshot("Observed Shortcut receipt")
    }

    func testActionButtonAssignmentAndReceiptStatesRemainIndependent() {
        app.launchArguments = [
            "-talent-signal.setup.action-button-complete",
            "YES",
            "-talent-signal.setup.screenshot-shortcut-received-at",
            "0",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openRelationshipMenu()
        var settings = app.buttons["open-action-button-settings"]
        scrollToVisible(settings)
        XCTAssertTrue(settings.label.contains("Assigned"))
        settings.tap()
        var verification = element("screenshot-shortcut-verification")
        scrollToVisible(verification)
        XCTAssertEqual(verification.label, "Ready for the first capture")
        XCTAssertTrue(app.buttons["Show setup reminder again"].exists)

        app.terminate()
        app.launchArguments = [
            "-talent-signal.setup.action-button-complete",
            "YES",
            "-talent-signal.setup.screenshot-shortcut-received-at",
            "1788480000",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openRelationshipMenu()
        settings = app.buttons["open-action-button-settings"]
        scrollToVisible(settings)
        XCTAssertTrue(settings.label.contains("Local receipt"))
        settings.tap()
        verification = element("screenshot-shortcut-verification")
        scrollToVisible(verification)
        XCTAssertEqual(verification.label, "Screenshot received via Shortcuts")
        XCTAssertTrue(app.buttons["Show setup reminder again"].exists)
    }

    func testPendingScreenshotReviewOffersKeepOrDiscardBeforeProcessing() {
        app.launchArguments = [
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
            "-talent-signal.interface-language", "en",
            "--scenario", "relationship-capture-archive",
        ]
        app.launch()

        XCTAssertTrue(element("reviewed-ocr-text").waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["close-capture-review"].exists)
        app.buttons["close-capture-review"].tap()

        XCTAssertTrue(app.buttons["Keep for later"].waitForExistence(timeout: 3))
        let discard = app.buttons["Discard capture"]
        XCTAssertTrue(discard.exists)
        XCTAssertTrue(
            app.staticTexts[
                "Keeping it preserves the screenshot and reviewed draft for the next app launch."
            ].exists
        )
        XCTAssertFalse(app.buttons["submit-reviewed-capture"].isHittable)
        preserveScreenshot("Pending screenshot keep or discard")

        discard.tap()
        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        XCTAssertFalse(element("reviewed-ocr-text").exists)
    }

    func testCaptureSessionsOpenAndDeleteTheExactDecision() {
        app.launchArguments += [
            "--scenario", "capture-inbox",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let todayInbox = app.buttons["today-capture-inbox"]
        XCTAssertTrue(todayInbox.waitForExistence(timeout: 8))
        let threeDecisions = NSPredicate(format: "label CONTAINS %@", "3 need your input")
        expectation(for: threeDecisions, evaluatedWith: todayInbox)
        waitForExpectations(timeout: 8)
        XCTAssertGreaterThanOrEqual(todayInbox.frame.height, 44)
        preserveScreenshot("Capture Session decisions on Today")

        todayInbox.tap()
        XCTAssertTrue(element("capture-inbox-header").waitForExistence(timeout: 5))
        XCTAssertTrue(element("capture-inbox-header").label.contains("3 need your input"))
        for fileName in [
            "conversation-1.png",
            "conversation-with-priya-about-the-singapore-search.png",
            "conversation-3.png",
        ] {
            XCTAssertTrue(app.staticTexts[fileName].exists)
        }
        preserveScreenshot("Capture Sessions with three decisions")

        let chosenFileName = "conversation-with-priya-about-the-singapore-search.png"
        let chosenResume = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
                "capture-session-decision-",
                chosenFileName
            )
        ).firstMatch
        scrollToVisible(chosenResume)
        chosenResume.tap()

        XCTAssertTrue(element("reviewed-ocr-text").waitForExistence(timeout: 10))
        XCTAssertEqual(
            app.buttons["inspect-capture-source"].value as? String,
            chosenFileName
        )
        app.buttons["close-capture-review"].tap()
        XCTAssertTrue(app.buttons["Keep for later"].waitForExistence(timeout: 3))
        app.buttons["Keep for later"].tap()
        XCTAssertTrue(element("capture-inbox-header").waitForExistence(timeout: 5))

        let chosenDelete = app.buttons.matching(
            NSPredicate(
                format: "label BEGINSWITH %@ AND label CONTAINS %@",
                "Remove local capture",
                chosenFileName
            )
        ).firstMatch
        scrollToVisible(chosenDelete)
        chosenDelete.tap()
        XCTAssertTrue(app.buttons["Remove local capture"].waitForExistence(timeout: 3))
        app.buttons["Remove local capture"].tap()

        let twoCaptures = NSPredicate(format: "label CONTAINS %@", "2 need your input")
        expectation(for: twoCaptures, evaluatedWith: element("capture-inbox-header"))
        waitForExpectations(timeout: 5)
        XCTAssertFalse(app.staticTexts[chosenFileName].exists)
        XCTAssertTrue(app.staticTexts["conversation-1.png"].exists)
        XCTAssertTrue(app.staticTexts["conversation-3.png"].exists)
        preserveScreenshot("Capture Sessions after exact local deletion")

        app.buttons["close-capture-inbox"].tap()
        XCTAssertTrue(todayInbox.waitForExistence(timeout: 5))
        XCTAssertTrue(todayInbox.label.contains("2 need your input"))
    }

    func testCaptureHubSharesTheSessionDecisionCount() {
        app.launchArguments += [
            "--scenario", "capture-inbox",
            "--capture-inbox-open-hub",
        ]
        app.launch()

        let captureHubInbox = app.buttons.matching(
            NSPredicate(
                format: "label BEGINSWITH %@ AND label CONTAINS %@",
                "Capture Sessions",
                "3 need your input"
            )
        ).firstMatch
        XCTAssertTrue(captureHubInbox.waitForExistence(timeout: 8))
        XCTAssertGreaterThanOrEqual(captureHubInbox.frame.height, 44)
        preserveScreenshot("Capture hub shares the Session decision count")
        captureHubInbox.tap()
        XCTAssertTrue(element("capture-inbox-header").waitForExistence(timeout: 5))
        XCTAssertTrue(element("capture-inbox-header").label.contains("3 need your input"))
    }

    func testCaptureSessionDecisionRemainsReachableInChineseDarkAX5() {
        app.launchArguments = [
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "--scenario", "capture-inbox",
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let todayInbox = app.buttons["today-capture-inbox"]
        XCTAssertTrue(todayInbox.waitForExistence(timeout: 8))
        XCTAssertGreaterThanOrEqual(todayInbox.frame.height, 44)
        XCTAssertTrue(todayInbox.isHittable)
        preserveScreenshot("Capture Session decision Today entry Chinese dark AX5")

        todayInbox.tap()
        XCTAssertTrue(element("capture-inbox-header").waitForExistence(timeout: 5))
        let firstResume = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
                "capture-session-decision-",
                "conversation-1.png"
            )
        ).firstMatch
        scrollToVisible(firstResume)
        XCTAssertGreaterThanOrEqual(firstResume.frame.height, 43.5)
        XCTAssertTrue(firstResume.isHittable)
        preserveScreenshot("Capture Session decision Chinese dark AX5")
    }

    func testWorkspaceMenuConfiguresOutboundOnlyCalendarSync() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openRelationshipMenu()
        XCTAssertTrue(
            app.buttons["close-relationship-menu"].waitForExistence(timeout: 5)
        )

        let calendarSettings = app.buttons["open-calendar-sync-settings"]
        if !calendarSettings.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(calendarSettings.waitForExistence(timeout: 5))
        calendarSettings.tap()

        XCTAssertTrue(element("calendar-sync-settings").waitForExistence(timeout: 5))
        let toggle = app.switches["calendar-sync-toggle"]
        XCTAssertTrue(toggle.exists)
        XCTAssertTrue(toggle.isEnabled)
        XCTAssertTrue(app.staticTexts["Apple Calendar · default calendar"].exists)
        XCTAssertTrue(app.staticTexts["Outbound only"].exists)
        preserveScreenshot("Outbound-only Calendar settings")
    }

    func testWorkspaceMenuRoutesCompactReviewInboxToExactProposal() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        openRelationshipMenu()

        let reviewInbox = app.buttons["open-review-inbox"]
        scrollToVisible(reviewInbox)
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
        openRelationshipMenu()

        let account = app.buttons["open-account-settings"]
        let onboarding = app.buttons["open-action-button-onboarding"]
        XCTAssertTrue(account.waitForExistence(timeout: 5))
        XCTAssertTrue(onboarding.exists)
        XCTAssertGreaterThanOrEqual(account.frame.height, 44)
        XCTAssertGreaterThanOrEqual(onboarding.frame.height, 44)
        preserveScreenshot("Workspace menu dark AX5")
    }

    func testPagedRetrievalSwipeAndVisibleSessionMenu() {
        app.launch()

        let todayTab = app.buttons["archive-tab-today"]
        XCTAssertTrue(todayTab.waitForExistence(timeout: 8))
        todayTab.tap()
        let today = element("editorial-today")
        XCTAssertTrue(today.waitForExistence(timeout: 5))
        today.swipeLeft()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)
        let session = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
        ).firstMatch
        XCTAssertTrue(session.waitForExistence(timeout: 5))
        openSessionActions(session)

        XCTAssertTrue(
            app.buttons["delete-session-history"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)
        XCTAssertFalse(app.buttons["archive-tab-people"].isSelected)
        preserveScreenshot("Paged Sessions with explicit row menu")
    }

    func testSessionUnreadAndJudgmentMetadataRemainCompact() {
        app.launch()

        let sessions = hittableButton("archive-tab-sessions", timeout: 8)
        XCTAssertTrue(sessions.waitForExistence(timeout: 8))
        sessions.tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))

        let session = app.buttons[
            "agent-session-90000000-0000-4000-8000-000000000001"
        ]
        XCTAssertTrue(session.waitForExistence(timeout: 5))
        XCTAssertTrue(session.label.contains("Leila Hartmann"))
        XCTAssertTrue(session.label.contains("Needs judgment"))
        XCTAssertTrue(session.label.contains("Chief Product Officer search"))

        openSessionActions(session)
        let markUnread = app.buttons["Mark as unread"]
        XCTAssertTrue(markUnread.waitForExistence(timeout: 5))
        markUnread.tap()
        let unread = NSPredicate(format: "label CONTAINS %@", "Unread")
        let unreadExpectation = XCTNSPredicateExpectation(
            predicate: unread,
            object: session
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [unreadExpectation], timeout: 5),
            .completed
        )
        preserveScreenshot("Session unread participant and judgment metadata")
    }

    func testSwipeAndTopControlsNavigateTheSamePagedSpace() {
        app.launch()

        let todayTab = app.buttons["archive-tab-today"]
        XCTAssertTrue(todayTab.waitForExistence(timeout: 8))
        todayTab.tap()
        let today = element("editorial-today")
        XCTAssertTrue(today.waitForExistence(timeout: 5))
        today.swipeLeft()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)

        element("agent-session-list").swipeLeft()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-people"].isSelected)

        element("workspace-people-list").swipeRight()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)

        todayTab.tap()
        XCTAssertTrue(today.waitForExistence(timeout: 5))
        XCTAssertTrue(todayTab.isSelected)
    }

    func testPeopleSearchAndFilterSurviveAskAndPaging() {
        app.launch()

        let peopleTab = app.buttons["archive-tab-people"]
        XCTAssertTrue(peopleTab.waitForExistence(timeout: 8))
        peopleTab.tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))

        let filter = element("people-filter-menu")
        XCTAssertTrue(filter.waitForExistence(timeout: 5))
        filter.tap()
        let pursuitFilter = element(
            "people-filter-pursuit-30000000-0000-4000-8000-000000000001"
        )
        XCTAssertTrue(pursuitFilter.waitForExistence(timeout: 5))
        pursuitFilter.tap()
        let selectedFilterLabel = filter.label

        let search = app.textFields["people-search-field"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("Leila")
        if app.keyboards.buttons["Search"].exists {
            app.keyboards.buttons["Search"].tap()
        }
        let leila = app.buttons[
            "workspace-person-20000000-0000-4000-8000-000000000001"
        ]
        XCTAssertTrue(leila.waitForExistence(timeout: 5))
        openPersonActions(leila)
        app.buttons["Ask about this person"].tap()

        let askSheet = element("relationship-ask-sheet")
        XCTAssertTrue(askSheet.waitForExistence(timeout: 5))
        app.buttons["ask-close"].tap()
        XCTAssertTrue(askSheet.waitForNonExistence(timeout: 5))
        XCTAssertEqual(search.value as? String, "Leila")
        XCTAssertEqual(filter.label, selectedFilterLabel)

        element("workspace-people-list").swipeRight()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        element("agent-session-list").swipeLeft()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        XCTAssertEqual(search.value as? String, "Leila")
        XCTAssertEqual(filter.label, selectedFilterLabel)
        XCTAssertTrue(leila.exists)
    }

    func testPagedRetrievalMirrorsDirectionInRTL() {
        app.launchArguments += ["--force-right-to-left-layout"]
        app.launch()

        let today = element("editorial-today")
        XCTAssertTrue(today.waitForExistence(timeout: 8))
        today.swipeRight()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)

        element("agent-session-list").swipeRight()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-people"].isSelected)

        element("workspace-people-list").swipeLeft()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)
        preserveScreenshot("RTL paged retrieval and measured tab indicator")
    }

    func testPagedHeaderReflowsAtAX5WithoutShrinkingTapTargets() {
        app.launchArguments = [
            "-UIPreferredContentSizeCategoryName",
            UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue,
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        let studio = app.buttons["relationship-agent-studio"]
        let calendar = app.buttons["today-calendar-peek"]
        let today = app.buttons["archive-tab-today"]
        let sessions = app.buttons["archive-tab-sessions"]
        let people = app.buttons["archive-tab-people"]
        let selectorViewport = app.windows.firstMatch
        XCTAssertTrue(today.waitForExistence(timeout: 8))
        XCTAssertTrue(selectorViewport.exists)

        for control in [studio, calendar, today, sessions, people] {
            XCTAssertGreaterThanOrEqual(control.frame.width, 44)
            XCTAssertGreaterThanOrEqual(control.frame.height, 44)
        }
        XCTAssertTrue(studio.isHittable)
        XCTAssertTrue(calendar.isHittable)
        XCTAssertTrue(today.isHittable)
        XCTAssertGreaterThan(today.frame.minY, studio.frame.minY)
        XCTAssertEqual(today.label, "Today")
        XCTAssertEqual(sessions.label, "Sessions")
        XCTAssertEqual(people.label, "People")
        assertHorizontallyCentered(today, in: selectorViewport)

        sessions.tap()
        XCTAssertTrue(sessions.isSelected)
        assertHorizontallyCentered(sessions, in: selectorViewport)

        people.tap()
        XCTAssertTrue(people.isSelected)
        assertHorizontallyCentered(people, in: selectorViewport)
        preserveScreenshot("Paged header reflows at AX5")
    }

    func testPagedHeaderCentersAX5TabsInRTL() {
        app.launchArguments += [
            "--force-right-to-left-layout",
            "-UIPreferredContentSizeCategoryName",
            UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue,
        ]
        app.launch()

        let selectorViewport = app.windows.firstMatch
        let today = app.buttons["archive-tab-today"]
        let sessions = app.buttons["archive-tab-sessions"]
        let people = app.buttons["archive-tab-people"]
        XCTAssertTrue(today.waitForExistence(timeout: 8))
        assertHorizontallyCentered(today, in: selectorViewport)

        sessions.tap()
        XCTAssertTrue(sessions.isSelected)
        assertHorizontallyCentered(sessions, in: selectorViewport)

        people.tap()
        XCTAssertTrue(people.isSelected)
        assertHorizontallyCentered(people, in: selectorViewport)
        preserveScreenshot("RTL paged header centers AX5 tabs")
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

    func testSessionVisibleAndLongPressMenusExposeTheSameCommands() {
        app.launch()

        let sessionsTab = app.buttons["archive-tab-sessions"]
        XCTAssertTrue(sessionsTab.waitForExistence(timeout: 8))
        sessionsTab.tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        let rows = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
        )
        XCTAssertGreaterThanOrEqual(rows.count, 1)
        let first = rows.element(boundBy: 0)

        openSessionActions(first)
        XCTAssertTrue(app.buttons["Open session"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Mark as unread"].exists)
        XCTAssertTrue(app.buttons["delete-session-history"].exists)
        sessionsTab.tap()

        XCTAssertTrue(first.waitForExistence(timeout: 5))
        first.press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["Open session"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Mark as unread"].exists)
        XCTAssertTrue(app.buttons["delete-session-history"].exists)
    }

    func testSessionDeletionRequiresExactConfirmationAndPreservesPeople() {
        app.launch()

        app.buttons["archive-tab-sessions"].tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 8))
        let sessionRows = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
        )
        let initialSessionCount = sessionRows.count
        XCTAssertGreaterThanOrEqual(initialSessionCount, 2)
        let first = sessionRows.element(boundBy: 0)

        openSessionActions(first)
        app.buttons["delete-session-history"].tap()
        XCTAssertTrue(
            app.staticTexts["Delete this session history from this device?"]
                .waitForExistence(timeout: 5)
        )
        let deletionMessage = app.staticTexts.matching(
            NSPredicate(
                format: "label == %@",
                "This deletes this session’s local messages, Agent responses, and receipts. Saved drafts, People, Pursuits, and workspace evidence stay unchanged."
            )
        ).firstMatch
        XCTAssertTrue(deletionMessage.exists)
        XCTAssertEqual(sessionRows.count, initialSessionCount)
        app.buttons["Cancel"].tap()
        XCTAssertEqual(sessionRows.count, initialSessionCount)

        openSessionActions(first)
        app.buttons["delete-session-history"].tap()
        app.buttons["Delete session history from this device"].firstMatch.tap()
        XCTAssertEqual(sessionRows.count, initialSessionCount - 1)

        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        let people = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "workspace-person-")
        )
        XCTAssertEqual(people.count, 2)
        XCTAssertTrue(app.staticTexts["Leila Hartmann"].exists)
        XCTAssertTrue(app.staticTexts["Nia Williams"].exists)
    }

    func testPeopleVisibleAndLongPressMenusKeepAskInsideVisibleScope() {
        app.launch()

        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 8))
        let person = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "workspace-person-")
        ).firstMatch
        XCTAssertTrue(person.waitForExistence(timeout: 5))
        openPersonActions(person)

        let ask = app.buttons["Ask about this person"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["archive-tab-people"].isSelected)
        ask.tap()

        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))
        let scope = element("ask-scope-selector")
        XCTAssertTrue(scope.waitForExistence(timeout: 5))
        XCTAssertTrue((scope.value as? String)?.contains("Leila Hartmann") == true)
        XCTAssertFalse(element("ask-response-turn").exists)
        let askSheet = element("relationship-ask-sheet")
        let closeAsk = app.buttons["ask-close"]
        XCTAssertTrue(closeAsk.waitForExistence(timeout: 5))
        closeAsk.tap()
        XCTAssertTrue(askSheet.waitForNonExistence(timeout: 5))

        let restoredPerson = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "workspace-person-")
        ).firstMatch
        XCTAssertTrue(restoredPerson.waitForExistence(timeout: 5))
        restoredPerson.press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["Open person"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Ask about this person"].exists)
        app.buttons["Open person"].tap()
        XCTAssertTrue(element("workspace-person-detail").waitForExistence(timeout: 5))
    }

    func testPreferredPersonWithMultipleContextsCanLeaveSelectionToAgent() {
        app.launchArguments = [
            "--preview-multi-context-person",
            "--fixture-record-ask-request-count",
        ]
        app.launch()

        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 8))
        let person = app.buttons[
            "workspace-person-20000000-0000-4000-8000-000000000001"
        ]
        XCTAssertTrue(person.waitForExistence(timeout: 5))
        openPersonActions(person)
        app.buttons["Ask about this person"].tap()

        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))
        XCTAssertTrue(
            element("ask-preferred-scope-optional").waitForExistence(timeout: 5)
        )
        let firstContext = app.buttons[
            "ask-scope-option-20000000-0000-4000-8000-000000000001-21000000-0000-4000-8000-000000000001"
        ]
        let secondContext = app.buttons[
            "ask-scope-option-20000000-0000-4000-8000-000000000001-21000000-0000-4000-8000-000000000003"
        ]
        XCTAssertTrue(firstContext.waitForExistence(timeout: 5))
        XCTAssertTrue(secondContext.waitForExistence(timeout: 5))
        XCTAssertFalse(
            app.buttons.matching(
                NSPredicate(
                    format: "identifier BEGINSWITH %@",
                    "ask-scope-option-20000000-0000-4000-8000-000000000002-"
                )
            ).firstMatch.exists,
            "A preferred-person shortcut must not expose another person as an implicit route."
        )

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("What changed in this relationship?", into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.exists)
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "Send")
        let requestCount = element("ask-fixture-request-count")
        XCTAssertTrue(requestCount.waitForExistence(timeout: 5))
        XCTAssertEqual(requestCount.value as? String, "0")
        XCTAssertFalse(element("ask-pending-turn").exists)
        XCTAssertFalse(element("ask-submission-requesting").exists)

        firstContext.tap()
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "Send")
        XCTAssertEqual(requestCount.value as? String, "0")
        let selectedScope = element("ask-scope-selector")
        XCTAssertTrue(
            (selectedScope.value as? String)?.contains(
                "Leila Hartmann, Chief Product Officer search"
            ) == true
        )
        preserveScreenshot("Preferred person requires an explicit relationship")
    }

    func testLongSessionListPreservesVisibleAnchorAcrossIntentResets() throws {
        app.launchArguments = [
            "--preview-long-session-list",
            "--fixture-record-retrieval-anchor",
        ]
        app.launch()

        let sessionsTab = app.buttons["archive-tab-sessions"]
        XCTAssertTrue(sessionsTab.waitForExistence(timeout: 8))
        sessionsTab.tap()
        let list = element("agent-session-list")
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        for _ in 0..<3 {
            list.swipeUp()
        }
        let anchorProbe = element("session-scroll-anchor-probe")
        XCTAssertTrue(anchorProbe.waitForExistence(timeout: 5))
        let anchorReady = NSPredicate(format: "value != %@", "none")
        let anchorExpectation = XCTNSPredicateExpectation(
            predicate: anchorReady,
            object: anchorProbe
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [anchorExpectation], timeout: 5),
            .completed
        )
        let anchorID = try XCTUnwrap(anchorProbe.value as? String)
        let target = app.buttons["agent-session-\(anchorID)"]
        XCTAssertTrue(target.isHittable)
        let baselineMidY = target.frame.midY
        let tolerance = target.frame.height + 8

        sessionsTab.tap()
        XCTAssertTrue(
            app.buttons["delete-session-history"].waitForNonExistence(timeout: 3)
        )
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)

        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        sessionsTab.tap()
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)

        target.tap()
        let askSheet = element("relationship-ask-sheet")
        XCTAssertTrue(askSheet.waitForExistence(timeout: 5))
        let close = app.buttons["ask-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        close.tap()
        XCTAssertTrue(askSheet.waitForNonExistence(timeout: 5))
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)

        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(list.waitForExistence(timeout: 8))
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)
    }

    func testLongPeopleListPreservesVisibleAnchorAcrossIntentResets() throws {
        app.launchArguments = [
            "--preview-long-people-list",
            "--fixture-record-retrieval-anchor",
        ]
        app.launch()

        let peopleTab = app.buttons["archive-tab-people"]
        XCTAssertTrue(peopleTab.waitForExistence(timeout: 8))
        peopleTab.tap()
        let list = element("workspace-people-list")
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        for _ in 0..<3 { list.swipeUp() }

        let anchorProbe = element("people-scroll-anchor-probe")
        XCTAssertTrue(anchorProbe.waitForExistence(timeout: 5))
        let anchorExpectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value != %@", "none"),
            object: anchorProbe
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [anchorExpectation], timeout: 5),
            .completed
        )
        let anchorID = try XCTUnwrap(anchorProbe.value as? String)
        let target = app.buttons["workspace-person-\(anchorID)"]
        XCTAssertTrue(target.waitForExistence(timeout: 5))
        XCTAssertTrue(target.isHittable)
        let baselineMidY = target.frame.midY
        let tolerance = target.frame.height + 8

        peopleTab.tap()
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)

        app.buttons["archive-tab-sessions"].tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        peopleTab.tap()
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)

        target.tap()
        XCTAssertTrue(element("workspace-person-detail").waitForExistence(timeout: 5))
        app.buttons["Close"].tap()
        XCTAssertTrue(
            element("workspace-person-detail").waitForNonExistence(timeout: 5)
        )
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)

        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(list.waitForExistence(timeout: 8))
        assertVisibleAnchor(target, near: baselineMidY, tolerance: tolerance)
    }

    func testSessionLongPressMirrorsTheGovernedActionSet() {
        app.launch()

        app.buttons["archive-tab-sessions"].tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 8))
        let session = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
        ).firstMatch
        XCTAssertTrue(session.waitForExistence(timeout: 5))
        session.press(forDuration: 0.8)

        XCTAssertTrue(app.buttons["Open session"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Mark as unread"].exists)
        XCTAssertTrue(
            app.buttons["Delete session history from this device"].exists
        )
        app.buttons["Open session"].tap()
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))
    }

    func testRetrievalInteractionLatencyBudgets() throws {
        app.launch()
        let todayTab = app.buttons["archive-tab-today"]
        XCTAssertTrue(todayTab.waitForExistence(timeout: 8))
        todayTab.tap()
        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 5))

        let destinationCycle: [(button: String, content: String)] = [
            ("archive-tab-sessions", "agent-session-list"),
            ("archive-tab-people", "relationship-people"),
            ("archive-tab-today", "editorial-today"),
        ]
        for _ in 0..<3 {
            for destination in destinationCycle {
                app.buttons[destination.button].tap()
                XCTAssertTrue(element(destination.content).exists)
            }
        }
        let destinations = (0..<10).flatMap { _ in destinationCycle }
        var destinationSamples: [Double] = []
        for destination in destinations {
            let content = element(destination.content)
            let start = ProcessInfo.processInfo.systemUptime
            app.buttons[destination.button].tap()
            XCTAssertTrue(content.exists)
            destinationSamples.append(
                (ProcessInfo.processInfo.systemUptime - start) * 1_000
            )
        }

        app.buttons["archive-tab-sessions"].tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 3))
        var sessionOpenSamples: [Double] = []
        for trial in 0..<33 {
            let session = app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
            ).firstMatch
            XCTAssertTrue(session.waitForExistence(timeout: 3))
            let sessionTap = session.coordinate(
                withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)
            )
            let start = ProcessInfo.processInfo.systemUptime
            sessionTap.tap()
            XCTAssertTrue(element("relationship-ask-sheet").exists)
            let elapsed = (ProcessInfo.processInfo.systemUptime - start) * 1_000
            if trial >= 3 {
                sessionOpenSamples.append(elapsed)
            }
            app.buttons["Close"].firstMatch.tap()
            XCTAssertTrue(
                element("relationship-ask-sheet").waitForNonExistence(timeout: 3)
            )
            XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 3))
        }

        let destinationP95 = percentile(destinationSamples, 0.95)
        let sessionOpenP95 = percentile(sessionOpenSamples, 0.95)
        let report: [String: Any] = [
            "schema_version": 1,
            "artifact": "ios-retrieval-post-change",
            "build_sha256": ProcessInfo.processInfo.environment[
                "TS_IOS_RETRIEVAL_BUILD_HASH"
            ] ?? "not-provided",
            "device": ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"]
                ?? "iOS Simulator",
            "os": ProcessInfo.processInfo.operatingSystemVersionString,
            "automation": "XCTest synchronized tap completion through a synchronous semantic query; three destination cycles and three Session opens warmed before 30 recorded samples; 1-second waiter polling excluded; not touch-to-photon",
            "destination_readiness_ms": latencySummary(destinationSamples),
            "session_open_readiness_ms": latencySummary(sessionOpenSamples),
            "gates_ms": [
                "destination_p95_max": 900,
                "session_open_p95_max": 1_200,
            ],
        ]
        let data = try JSONSerialization.data(
            withJSONObject: report,
            options: [.prettyPrinted, .sortedKeys]
        )
        let attachment = XCTAttachment(
            data: data,
            uniformTypeIdentifier: "public.json"
        )
        attachment.name = "retrieval-interaction-latency.json"
        attachment.lifetime = .keepAlways
        add(attachment)

        XCTAssertLessThanOrEqual(destinationP95, 900)
        XCTAssertLessThanOrEqual(sessionOpenP95, 1_200)
    }

    func testAskOpensAsConversationWithEmbeddedWorkspaceTools() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let ask = app.buttons["relationship-guide"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        tapWhenVisible(ask)

        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertTrue(askComposer.exists)
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertFalse(app.buttons["What changed?"].exists)
        XCTAssertTrue(element("ask-voice-ribbon").exists)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].isEnabled)
        XCTAssertFalse(app.buttons["ask-review-screenshot"].exists)
        XCTAssertTrue(app.buttons["ask-voice"].isEnabled)
        XCTAssertFalse(element("ask-remote-ai-disclosure").exists)
        XCTAssertFalse(element("ask-scope-search").exists)
        XCTAssertFalse(app.staticTexts["A quieter Agent"].exists)
        XCTAssertFalse(app.staticTexts["Draft authority only"].exists)
        preserveScreenshot("Conversation-first Ask with embedded tools")
    }

    func testGlobalAgentInputOpensCompactNewChatComposer() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let globalInput = app.buttons["relationship-guide"]
        XCTAssertTrue(globalInput.waitForExistence(timeout: 5))
        globalInput.tap()

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertTrue(
            element("ask-new-chat-header").exists,
            "The home entry should open as a lightweight new Chat composer."
        )
        XCTAssertTrue(element("ask-recall-disclosure").exists)
        XCTAssertTrue(element("ask-voice-ribbon").exists)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].exists)
        XCTAssertTrue(app.buttons["ask-voice"].isEnabled)
        XCTAssertFalse(app.buttons["ask-send"].exists)
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(
            element("relationship-ask-sheet").frame.minY,
            app.windows.firstMatch.frame.height * 0.05,
            "The focused composer should still leave the workspace visibly present above it."
        )

        typeTextReliably("x", into: composer)
        app.keys["delete"].tap()
        XCTAssertTrue(app.buttons["ask-voice"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["ask-send"].exists)
        preserveScreenshot("New Chat focused empty and voice ready")

        let message = "# Search note\n\n- Add Maya Chen for the product search"
        typeTextReliably(message, into: composer)
        XCTAssertEqual(composer.value as? String, message)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.exists)
        XCTAssertTrue(send.isEnabled)
        XCTAssertTrue(app.buttons["ask-voice"].exists)
        XCTAssertFalse(app.buttons["ask-voice"].isEnabled)
        preserveScreenshot("Global Agent compact new Chat ready to type")
    }

    func testGlobalAgentNewChatCanRestAtItsSmallestDetent() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()

        let sheet = element("relationship-ask-sheet")
        XCTAssertTrue(sheet.waitForExistence(timeout: 5))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))

        let dragStart = sheet.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)
        )
        let dragEnd = app.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78)
        )
        dragStart.press(forDuration: 0.08, thenDragTo: dragEnd)

        let photos = app.buttons["ask-minimized-photos"]
        let files = app.buttons["ask-minimized-files"]
        let voice = app.buttons["ask-minimized-voice"]
        let text = app.buttons["ask-minimized-text"]
        XCTAssertTrue(photos.waitForExistence(timeout: 3))
        XCTAssertTrue(files.exists)
        XCTAssertTrue(voice.exists)
        XCTAssertTrue(text.exists)
        XCTAssertFalse(app.keyboards.firstMatch.waitForExistence(timeout: 1))
        XCTAssertGreaterThanOrEqual(sheet.frame.height, 120)
        XCTAssertLessThan(sheet.frame.height, 170)
        for action in [photos, files, voice, text] {
            XCTAssertGreaterThanOrEqual(action.frame.height, 44)
            XCTAssertGreaterThanOrEqual(action.frame.width, 44)
            XCTAssertTrue(action.isHittable)
        }
        let actionMidpoints = [photos, files, voice, text].map { $0.frame.midY }
        XCTAssertLessThan(
            (actionMidpoints.max() ?? 0) - (actionMidpoints.min() ?? 0),
            2
        )
        XCTAssertFalse(element("ask-voice-ribbon").exists)
        preserveScreenshot("Global Agent new Chat smallest detent")

        text.tap()
        XCTAssertTrue(element("ask-voice-ribbon").waitForExistence(timeout: 3))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
    }

    func testGlobalAgentNewChatSmallestDetentPreservesChineseDraft() {
        app.launchArguments = [
            "--force-dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-AppleInterfaceStyle", "Dark",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("Maya follow-up", into: composer)

        let sheet = element("relationship-ask-sheet")
        let dragStart = sheet.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)
        )
        let dragEnd = app.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78)
        )
        dragStart.press(forDuration: 0.08, thenDragTo: dragEnd)

        let photos = app.buttons["ask-minimized-photos"]
        let files = app.buttons["ask-minimized-files"]
        let voice = app.buttons["ask-minimized-voice"]
        let text = app.buttons["ask-minimized-text"]
        XCTAssertTrue(photos.waitForExistence(timeout: 3))
        XCTAssertEqual(photos.label, "图片")
        XCTAssertEqual(files.label, "文件")
        XCTAssertEqual(voice.label, "语音")
        XCTAssertEqual(text.label, "文字")
        for action in [photos, files, voice, text] {
            XCTAssertGreaterThanOrEqual(action.frame.height, 44)
        }
        preserveScreenshot("Global Agent Chinese draft smallest detent")

        text.tap()
        XCTAssertTrue(composer.waitForExistence(timeout: 3))
        XCTAssertEqual(composer.value as? String, "Maya follow-up")
    }

    func testGlobalAgentNewChatAvoidsSmallestDetentAtAccessibilitySize() {
        app.launchArguments = [
            "--force-dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-AppleInterfaceStyle", "Dark",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()

        let sheet = element("relationship-ask-sheet")
        XCTAssertTrue(sheet.waitForExistence(timeout: 5))
        XCTAssertTrue(element("ask-voice-ribbon").exists)
        XCTAssertFalse(app.buttons["ask-minimized-photos"].exists)
        XCTAssertFalse(app.buttons["ask-minimized-files"].exists)
        XCTAssertFalse(app.buttons["ask-minimized-voice"].exists)
        XCTAssertFalse(app.buttons["ask-minimized-text"].exists)

        let dragStart = sheet.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)
        )
        let dragEnd = sheet.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.24)
        )
        dragStart.press(forDuration: 0.08, thenDragTo: dragEnd)

        XCTAssertTrue(sheet.waitForExistence(timeout: 2))
        XCTAssertGreaterThan(
            sheet.frame.height,
            app.windows.firstMatch.frame.height * 0.5
        )
        XCTAssertFalse(app.buttons["ask-minimized-photos"].exists)
        XCTAssertFalse(app.buttons["ask-minimized-files"].exists)
        XCTAssertFalse(app.buttons["ask-minimized-voice"].exists)
        XCTAssertFalse(app.buttons["ask-minimized-text"].exists)
        preserveScreenshot("Global Agent new Chat AX5 avoids smallest detent")
    }

    func testGlobalAgentMinimizedVoicePreservesAnExistingTextDraft() {
        app.launchArguments = [
            "--deterministic-voice-input",
            "-voice-input-cloud-disclosure-v1", "NO",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("Maya follow-up", into: composer)

        let sheet = element("relationship-ask-sheet")
        sheet.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)
        ).press(
            forDuration: 0.08,
            thenDragTo: app.coordinate(
                withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78)
            )
        )

        let minimizedVoice = app.buttons["ask-minimized-voice"]
        XCTAssertTrue(minimizedVoice.waitForExistence(timeout: 3))
        minimizedVoice.tap()

        let start = app.buttons.matching(
            identifier: "confirm-voice-input-disclosure"
        ).firstMatch
        XCTAssertFalse(start.waitForExistence(timeout: 1))
        XCTAssertEqual(composer.value as? String, "Maya follow-up")
        XCTAssertFalse(element("ask-response-turn").exists)
        XCTAssertTrue(element("ask-voice-ribbon").exists)
        XCTAssertTrue(app.buttons["ask-send"].isEnabled)
        XCTAssertFalse(element("ask-response-turn").exists)
    }

    func testNewChatRibbonKeepsTypedFormattingAndSwitchesToSend() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["ask-voice"].isEnabled)
        XCTAssertTrue(app.buttons["ask-attachment-menu"].isEnabled)

        let message = "# Search note\n\n- Add Maya Chen"
        typeTextReliably(message, into: composer)
        XCTAssertEqual(composer.value as? String, message)
        XCTAssertTrue(app.buttons["ask-send"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["ask-voice"].isEnabled)
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        preserveScreenshot("New Chat voice ribbon and adaptive send")
    }

    func testHomePlusShowsAttachmentSourcesBeforeOpeningAPicker() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        let add = app.buttons["open-agent-attachments"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        add.tap()

        XCTAssertTrue(element("home-attachment-chooser").waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["home-attachment-photos"].exists)
        XCTAssertTrue(app.buttons["home-attachment-files"].exists)
        XCTAssertTrue(app.buttons["home-attachment-relationship"].exists)
        XCTAssertTrue(app.buttons["home-attachment-write"].exists)
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        preserveScreenshot("Home attachment source chooser")
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
        XCTAssertTrue(photos.waitForExistence(timeout: 3))
        photos.tap()

        let photoPicker = waitForPhotoPicker()
        XCTAssertFalse(element("signal-capture-hub").exists)
        preserveScreenshot("Global attachment opens the system photo picker")
        XCTAssertTrue(photoPicker.exists)
    }

    func testGlobalAgentDraftRestoresWithoutImplicitRelationship() {
        app.launchArguments = [
            "--persist-preview-agent",
            "--reset-preview-agent",
            "--fixture-agent-contact-proposal",
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
        app.launchArguments = [
            "--persist-preview-agent",
            "--fixture-agent-contact-proposal",
        ]
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

    func testUnscopedQuestionSendsWithoutAContactPicker() {
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
        XCTAssertEqual(send.label, "Send")

        send.tap()

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Agent · Preview"].exists)
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertFalse(element("ask-scope-search").exists)
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForNonExistence(timeout: 3),
            "Relationship clarification should not leave the composer keyboard over the choices."
        )
        XCTAssertTrue(composer.isEnabled)
        preserveScreenshot("Agent answers without a mandatory contact picker")
    }

    func testContactCountUsesTheOnDeviceWorkspaceIndexWithoutAnAgentRequest() {
        app.launchArguments = [
            "--fixture-record-ask-request-count",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("查看我有多少个联系人", into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(
            app.staticTexts["本机工作区索引"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "没有调用远程模型"
                )
            ).firstMatch.exists
        )
        XCTAssertEqual(
            element("ask-fixture-request-count").value as? String,
            "0"
        )
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        preserveScreenshot("Contact count answered on device")
    }

    func testNamedRelationshipQuestionDoesNotTriggerClientSideContactGuessing() {
        app.launchArguments = ["--fixture-ask-delay-seconds", "3"]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("What changed with Leila?", into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-recall-match").exists)
        XCTAssertFalse(element("ask-loading").exists)
        XCTAssertFalse(element("ask-scope-selector").exists)
        preserveScreenshot("Named relationship stays with the Agent")
    }

    func testVoiceRibbonShowsLiveWordsAndSendsDirectlyToAgent() {
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
        XCTAssertGreaterThanOrEqual(voice.frame.height, 48)
        voice.tap()

        let start = app.buttons.matching(
            identifier: "confirm-voice-input-disclosure"
        ).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        let sendVoice = app.buttons["ask-voice-send"]
        XCTAssertTrue(sendVoice.waitForExistence(timeout: 5))
        XCTAssertTrue(element("ask-voice-live-transcript").exists)
        XCTAssertTrue(app.staticTexts["What changed in this search?"].exists)
        preserveScreenshot("Voice ribbon live words")
        XCTAssertTrue(
            app.buttons["ask-voice-cancel"].waitForExistence(timeout: 5)
        )

        sendVoice.tap()

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 8))
        XCTAssertFalse(sendVoice.exists)
        preserveScreenshot("Voice sent directly to Agent")
    }

    func testHoldingEmptyComposerReleasesStraightToAgent() {
        app.launchArguments = [
            "--deterministic-voice-input",
            "-voice-input-cloud-disclosure-v1", "YES",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-guide"].tap()
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))

        let voice = app.buttons["ask-voice"]
        XCTAssertTrue(voice.waitForExistence(timeout: 3))
        voice.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)
        ).press(forDuration: 0.65)

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["What changed in this search?"].exists)
        XCTAssertFalse(element("ask-active-voice-ribbon").exists)
        preserveScreenshot("Hold and release sends voice to Agent")
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
        XCTAssertEqual(voice.label, "Hold to talk")
        voice.tap()
        XCTAssertTrue(
            app.buttons["confirm-voice-input-disclosure"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertFalse(element("audio-signal-capture").exists)
        preserveScreenshot("Canonical loopback voice input disclosure")
    }

    func testCanonicalLoopbackRepliesToUnscopedGreetingWithoutRelationshipChoice() async throws {
        let backendURL = testConfiguration(
            "TS_IOS_BACKEND_URL",
            fallback: "http://127.0.0.1:4320"
        )
        guard await canonicalBackendFixtureIsAvailable(at: backendURL) else {
            throw XCTSkip("The canonical loopback backend was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", backendURL,
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
        ]
        app.launch()

        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        let ask = app.buttons["relationship-guide"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        typeTextReliably("你好", into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        send.tap()

        let response = element("ask-response-turn")
        XCTAssertTrue(response.waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts["Agent 回答"].waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertFalse(
            app.buttons.matching(
                NSPredicate(
                    format: "identifier BEGINSWITH %@",
                    "ask-recall-candidate-"
                )
            ).firstMatch.exists
        )
        preserveScreenshot("Canonical unscoped greeting remote reply")
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

        XCTAssertTrue(element("ask-active-voice-ribbon").waitForExistence(timeout: 5))
        XCTAssertTrue(element("ask-voice-live-transcript").exists)
        XCTAssertTrue(app.buttons["ask-voice-cancel"].waitForExistence(timeout: 5))
        preserveScreenshot("Voice ribbon Simplified Chinese")
    }

    func testCanonicalAskSearchesWorkspaceAndReturnsEvidenceBoundResponse() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
            "--fixture-ask-delay-seconds", "3",
        ]
        launchWithCleanAgentSessions()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        let ask = app.buttons["relationship-guide"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()

        let composer = askComposer
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        let question = "What changed with Leila?"
        typeTextReliably(question, into: composer)
        let send = hittableButton("ask-send")
        XCTAssertTrue(send.isEnabled)
        send.tap()

        let pendingTurn = element("ask-pending-turn")
        let responseTurn = element("ask-response-turn")
        if pendingTurn.waitForExistence(timeout: 1) {
            XCTAssertFalse(element("ask-recall-unresolved").exists)
            let pendingMessage = element("ask-user-message")
            XCTAssertEqual(pendingMessage.label, question)
            let pendingComposer = askComposer
            XCTAssertFalse(String(describing: pendingComposer.value).contains(question))
            XCTAssertFalse(pendingComposer.isEnabled)
            preserveScreenshot("Canonical Ask pending turn")
        } else {
            XCTAssertTrue(
                responseTurn.waitForExistence(timeout: 10),
                "The delayed fixture should expose either its pending turn or its completed response."
            )
        }
        XCTAssertTrue(responseTurn.waitForExistence(timeout: 60))
        XCTAssertTrue(pendingTurn.waitForNonExistence(timeout: 2))
        XCTAssertTrue(askComposer.isEnabled)
        XCTAssertFalse(app.staticTexts["Preview data · connect a workspace to send"].exists)
        let userMessage = element("ask-user-message")
        XCTAssertTrue(userMessage.exists)
        XCTAssertEqual(userMessage.label, question)
        XCTAssertLessThan(userMessage.frame.width, 280)
        preserveScreenshot("Canonical Ask evidence-bound response")

        let evidence = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Evidence from ")
        ).firstMatch
        scrollToVisible(evidence)
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
            "--workspace-account-id", fixture.accountID,
        ]
        launchWithCleanAgentSessions()

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

        let composer = askComposer
        typeTextReliably("What changed with Leila?", into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertTrue(send.isHittable)
        send.tap()

        guard element("ask-response-turn").waitForExistence(timeout: 60) else {
            XCTFail("The canonical Ask response did not render.")
            return
        }
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        let expectsRemoteAI = testConfiguration(
            "TS_IOS_EXPECT_REMOTE_CHAT",
            fallback: "false"
        ) == "true"
        let responseTurn = element("ask-response-turn")
        let remoteAnswer = responseTurn.staticTexts["Agent answer"]
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
        let evidence = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "ask-citation-")
        ).firstMatch
        XCTAssertTrue(
            evidence.waitForExistence(timeout: 5),
            "A remote relationship answer must retain governed evidence."
        )
        XCTAssertFalse(element("ask-error").exists)
        XCTAssertTrue(composer.isEnabled)
        preserveScreenshot("Canonical Ask backend response")
    }

    func testCanonicalAskUsesReviewedContactEvidenceWithoutFalseBindingError() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable(),
              fixture.contactConflictCurrentPersonID != nil,
              fixture.contactConflictCurrentContextID != nil else {
            throw XCTSkip("The reviewed contact evidence fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        launchWithCleanAgentSessions()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        let composer = askComposer
        typeTextReliably("What do we know about Robin Current?", into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isHittable)
        send.tap()

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 60))
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertFalse(element("ask-error").exists)
        let evidence = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Evidence from ")
        ).firstMatch
        scrollToVisible(evidence)
        evidence.tap()
        XCTAssertTrue(element("ask-citation-detail").waitForExistence(timeout: 5))
        XCTAssertTrue(element("ask-citation-excerpt").exists)
        XCTAssertTrue(element("ask-review-citation").exists)
        preserveScreenshot("Reviewed contact evidence supports canonical Ask")
    }

    func testCanonicalAskResponseChineseDarkAX5KeepsEvidenceAndComposerReachable() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
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
        launchWithCleanAgentSessions()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))

        let composer = askComposer
        let question = "Leila 有什么变化？"
        typeTextReliably(question, into: composer)
        let send = app.buttons["ask-send"]
        guard send.isHittable else {
            XCTFail("The Ask send button is visible but cannot receive a tap.")
            return
        }
        send.tap()

        let pendingTurn = element("ask-pending-turn")
        XCTAssertTrue(pendingTurn.waitForExistence(timeout: 15))
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertTrue(
            element("ask-submission-requesting").waitForExistence(timeout: 2)
        )
        XCTAssertEqual(element("ask-user-message").label, question)
        XCTAssertFalse(askComposer.isEnabled)
        preserveScreenshot("Canonical Ask pending turn Chinese dark AX5")

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 60))
        XCTAssertTrue(pendingTurn.waitForNonExistence(timeout: 2))
        XCTAssertTrue(askComposer.isEnabled)

        let userMessage = element("ask-user-message")
        XCTAssertTrue(userMessage.exists)
        XCTAssertEqual(userMessage.label, question)
        XCTAssertLessThanOrEqual(
            userMessage.frame.width,
            app.windows.firstMatch.frame.width - 40
        )

        let responseTurn = element("ask-response-turn")
        let remoteAnswer = responseTurn.staticTexts["Agent 回答"]
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
        XCTAssertTrue(askComposer.exists)
        preserveScreenshot("Canonical Ask response Chinese dark AX5")
    }

    func testCanonicalAskFailureRestoresQuestionAndRetriesSameIntent() async throws {
        guard let fixture = try await preparePursuitProposalFixtureIfAvailable() else {
            throw XCTSkip("The canonical Pursuit workspace fixture was not configured.")
        }
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
            "--fixture-ask-delay-seconds", "3",
            "--fixture-ask-fail-once",
        ]
        launchWithCleanAgentSessions()

        XCTAssertTrue(element("canonical-pursuit-today").waitForExistence(timeout: 15))
        tapWhenVisible(app.buttons["relationship-guide"])
        XCTAssertTrue(element("relationship-ask-sheet").waitForExistence(timeout: 5))

        let composer = askComposer
        let question = "What changed with Leila?"
        typeTextReliably(question, into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertTrue(send.isEnabled)
        XCTAssertTrue(send.isHittable)
        send.tap()

        let pendingTurn = element("ask-pending-turn")
        let failure = element("ask-error")
        XCTAssertTrue(
            pendingTurn.waitForExistence(timeout: 1)
                || failure.waitForExistence(timeout: 10),
            "The delayed fixture should expose either its pending turn or its first failure."
        )
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertTrue(failure.waitForExistence(timeout: 60))
        XCTAssertFalse(pendingTurn.exists)
        XCTAssertTrue(
            String(describing: askComposer.value).contains(question)
        )
        preserveScreenshot("Canonical Ask failure restores question")

        let retry = app.buttons["ask-retry"]
        XCTAssertTrue(retry.exists)
        XCTAssertTrue(retry.isHittable)
        retry.tap()
        let responseTurn = element("ask-response-turn")
        XCTAssertTrue(
            pendingTurn.waitForExistence(timeout: 1)
                || responseTurn.waitForExistence(timeout: 10),
            "Retry should expose either its pending turn or its completed response."
        )
        XCTAssertTrue(responseTurn.waitForExistence(timeout: 60))
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
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertTrue(composer.exists)
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForNonExistence(timeout: 3),
            "AX5 should keep the full starter and capture surface visible until the recruiter chooses to type."
        )
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertFalse(app.buttons["What changed?"].exists)

        let ribbon = element("ask-voice-ribbon")
        let attachments = app.buttons["ask-attachment-menu"]
        let voice = app.buttons["ask-voice"]
        XCTAssertTrue(ribbon.exists)
        XCTAssertTrue(attachments.exists)
        XCTAssertTrue(attachments.isEnabled)
        XCTAssertTrue(voice.exists)
        XCTAssertGreaterThanOrEqual(attachments.frame.height, 44)
        XCTAssertLessThanOrEqual(attachments.frame.width, 60)
        XCTAssertGreaterThanOrEqual(voice.frame.height, 44)
        XCTAssertLessThanOrEqual(voice.frame.width, 60)
        XCTAssertLessThanOrEqual(composer.frame.maxX, app.frame.maxX)
        XCTAssertLessThanOrEqual(composer.frame.maxY, app.frame.maxY)
        XCTAssertTrue(element("ask-preview-send-boundary").exists)
        preserveScreenshot("Ask Chinese dark AX5 input-first")

        typeTextReliably("发生了什么变化？", into: composer)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "发送")
        send.tap()

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 5))
        let provenance = app.staticTexts["Agent · 预览"]
        XCTAssertTrue(provenance.exists)
        XCTAssertTrue(provenance.isHittable)
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertFalse(element("ask-scope-search").exists)
        XCTAssertFalse(app.buttons["ask-prompt-menu"].exists)
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        XCTAssertLessThanOrEqual(composer.frame.maxY, app.frame.maxY)
        let header = element("ask-chat-header")
        XCTAssertTrue(header.exists)
        XCTAssertLessThanOrEqual(header.frame.height, 68)

        let responseBody = app.staticTexts[
            "你好，我在。你可以直接和我聊，或者告诉我想回顾哪段关系。"
        ]
        XCTAssertTrue(responseBody.waitForExistence(timeout: 3))
        let conversation = element("ask-conversation")
        var attempts = 0
        while responseBody.frame.maxY > composer.frame.minY - 8, attempts < 8 {
            conversation.swipeUp()
            attempts += 1
        }
        XCTAssertGreaterThanOrEqual(responseBody.frame.minY, header.frame.maxY)
        XCTAssertLessThanOrEqual(responseBody.frame.maxY, composer.frame.minY - 8)
        XCTAssertTrue(responseBody.isHittable)
        preserveScreenshot("Ask Chinese dark AX5 complete Agent reply")
    }

    func testSettingsSwitchesTheCoreWorkspaceBetweenChineseAndEnglish() {
        app.launchArguments = [
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
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

        app.buttons["open-agent-attachments"].tap()
        XCTAssertTrue(element("home-attachment-chooser").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["先选择内容来源。"].exists)
        XCTAssertTrue(app.staticTexts["在你选择之前，不会导入任何内容。"].exists)
        XCTAssertTrue(app.buttons["home-attachment-photos"].exists)
        XCTAssertTrue(app.buttons["home-attachment-files"].exists)
        XCTAssertTrue(app.buttons["home-attachment-relationship"].exists)
        XCTAssertTrue(app.buttons["home-attachment-write"].exists)
        preserveScreenshot("Simplified Chinese Agent attachment chooser")

        app.terminate()
        app.launch()
        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        XCTAssertEqual(app.buttons["archive-tab-today"].label, "今天")

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
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
        ]
        launchWithCleanAgentSessions()

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
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
        ]
        launchWithCleanAgentSessions()

        XCTAssertTrue(
            element("canonical-pursuit-today").waitForExistence(timeout: 15)
        )
        openRelationshipMenu()
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
        let menu = app.buttons["relationship-agent-studio"]
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
        app.launchArguments = [
            "--workspace-backend-url", fixture.backendURL,
            "--workspace-account-id", fixture.accountID,
        ]
        launchWithCleanAgentSessions()

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
            "--workspace-account-id", fixture.accountID,
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launchArguments = auditArguments
        launchWithCleanAgentSessions()

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
                let top = self.app.buttons["relationship-agent-studio"].frame.maxY
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
        let menu = app.buttons["relationship-agent-studio"]
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
        tapWhenVisible(review)

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
            "--workspace-account-id", fixture.accountID,
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
        tapWorkspaceElementWhenVisible(
            recovery,
            in: "canonical-pursuit-today"
        )
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
        XCTAssertGreaterThanOrEqual(sessions.frame.height, 44)
        sessions.tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["What changed with the location model?"].exists)
        XCTAssertFalse(app.buttons["new-agent-session"].exists)
        XCTAssertFalse(app.staticTexts["AGENT CONVERSATIONS"].exists)
        let sessionRow = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
        ).firstMatch
        XCTAssertTrue(sessionRow.exists)
        XCTAssertGreaterThanOrEqual(sessionRow.frame.height, 44)
        preserveScreenshot("Agent Session retrieval")

        let people = app.buttons["archive-tab-people"]
        XCTAssertGreaterThanOrEqual(people.frame.height, 44)
        people.tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 4))
        let peopleSearch = app.textFields["people-search-field"]
        XCTAssertTrue(peopleSearch.exists)
        XCTAssertTrue(peopleSearch.isHittable)
        let peopleFilter = element("people-filter-menu")
        XCTAssertTrue(peopleFilter.exists)
        XCTAssertGreaterThanOrEqual(peopleFilter.frame.height, 44)
        XCTAssertTrue(app.staticTexts["Leila Hartmann"].exists)
        XCTAssertFalse(
            app.staticTexts[
                "One person may hold different roles across Pursuits; the role never becomes identity."
            ].exists
        )
        let personRow = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "workspace-person-")
        ).firstMatch
        XCTAssertTrue(personRow.exists)
        XCTAssertGreaterThanOrEqual(personRow.frame.height, 44)
        XCTAssertTrue(personRow.label.contains("Chief Product Officer search"))
        preserveScreenshot("Cross-Pursuit People retrieval")
    }

    func testRetrievalCardsRemainReachableInChineseDarkAX5ReducedMotion() {
        app.launchArguments = [
            "--force-dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-UIPreferredContentSizeCategoryName",
            UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue,
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        let sessions = app.buttons["archive-tab-sessions"]
        XCTAssertTrue(sessions.waitForExistence(timeout: 8))
        XCTAssertTrue(sessions.isHittable)
        XCTAssertGreaterThanOrEqual(sessions.frame.height, 44)
        sessions.tap()
        XCTAssertTrue(element("agent-session-list").waitForExistence(timeout: 5))
        let sessionRow = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agent-session-")
        ).firstMatch
        XCTAssertTrue(sessionRow.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(sessionRow.frame.height, 44)
        preserveScreenshot("Sessions cards Chinese dark AX5 reduced motion")

        let people = app.buttons["archive-tab-people"]
        XCTAssertTrue(people.isHittable)
        XCTAssertGreaterThanOrEqual(people.frame.height, 44)
        people.tap()
        XCTAssertTrue(element("relationship-people").waitForExistence(timeout: 5))
        let personRow = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "workspace-person-")
        ).firstMatch
        XCTAssertTrue(personRow.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(personRow.frame.height, 44)
        XCTAssertTrue(personRow.label.contains("Chief Product Officer search"))

        let nia = app.buttons[
            "workspace-person-20000000-0000-4000-8000-000000000002"
        ]
        scrollToVisible(nia)
        XCTAssertTrue(nia.label.contains("Candidate · Independent board director search"))
        XCTAssertGreaterThanOrEqual(nia.frame.height, 88)
        preserveScreenshot("People cards Chinese dark AX5 reduced motion")
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

    func testHomePhotoPickerStagesSelectedImageAsAgentDraft() {
        app.launch()

        tapWhenVisible(app.buttons["open-agent-attachments"])
        XCTAssertTrue(element("home-attachment-chooser").waitForExistence(timeout: 5))
        tapWhenVisible(app.buttons["home-attachment-photos"])

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
        let addSelection = app.buttons["Add"].firstMatch
        if addSelection.waitForExistence(timeout: 3) {
            addSelection.tap()
        }

        XCTAssertTrue(element("ask-media-draft-tray").waitForExistence(timeout: 15))
        XCTAssertTrue(element("relationship-ask-sheet").exists)
        XCTAssertFalse(app.navigationBars["Photos"].exists)
        XCTAssertFalse(app.staticTexts["Unrelated image selected"].exists)
        XCTAssertFalse(element("inspect-capture-source").exists)
        preserveScreenshot("Selected photo remains an Agent message draft")

        let removeImage = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Remove image")
        ).firstMatch
        XCTAssertTrue(removeImage.waitForExistence(timeout: 5))
        removeImage.tap()
        XCTAssertTrue(
            element("ask-media-draft-tray").waitForNonExistence(timeout: 5)
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
    func testRelationshipCaptureRequiresExplicitOwnerAndIndependentReview() async throws {
        try await runRelationshipCaptureJourney(auditsAccessibility: false)
    }

    @MainActor
    func testCapturePartialConfirmationResumesSameSource() async throws {
        let backendURL = testConfiguration("TS_IOS_BACKEND_URL", fallback: "http://127.0.0.1:4329")
        let seed = UUID().uuidString
        let arguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-talent-signal.interface-language", "en",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
            "--scenario", "relationship-capture-archive", "--backend-url", backendURL,
            "--workspace-backend-url", backendURL, "--capture-seed", seed,
            "--capture-handle", "+658\(String(format: "%07u", UInt32.random(in: 0...9_999_999)))",
            "--capture-name", "Review \(seed.prefix(8))", "--capture-text-base64",
            Data("Work mode: Hybrid\nDeadline: next Friday".utf8).base64EncodedString()]
        app.launchArguments = arguments
        app.launch()
        XCTAssertTrue(element("reviewed-ocr-text").waitForExistence(timeout: 10))
        tapWhenVisible(app.buttons["submit-reviewed-capture"])
        XCTAssertTrue(app.buttons["create-new-person-from-capture"].waitForExistence(timeout: 30))
        tapWhenVisible(app.buttons["create-new-person-from-capture"])
        XCTAssertTrue(element("capture-change-review").waitForExistence(timeout: 30))
        tapWhenVisible(app.buttons["capture-review-speaker-choice"])
        tapWhenVisible(app.buttons["Candidate"])
        tapWhenVisible(app.buttons["capture-confirm-speaker"])
        XCTAssertTrue(app.buttons["capture-confirm-work_mode_preference"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["capture-confirm-decision_deadline"].isEnabled)
        preserveScreenshot("Capture date dependency remains blocked")
        tapWhenVisible(app.buttons["capture-confirm-work_mode_preference"])
        XCTAssertTrue(app.buttons["capture-finish-review"].waitForExistence(timeout: 30))
        tapWhenVisible(app.buttons["capture-finish-review"])
        app.swipeDown()
        app.swipeDown()
        XCTAssertTrue(element("capture-confirmed-count").waitForExistence(timeout: 30))
        XCTAssertTrue(element("capture-confirmed-count").label.contains("1 changes confirmed"))
        XCTAssertTrue(element("capture-confirmed-count").label.contains("1 still to review"))
        XCTAssertFalse(app.buttons["continue-capture-in-agent"].isEnabled)
        preserveScreenshot("Capture partial receipt with one confirmed and one unresolved")
        tapWhenVisible(app.buttons["Keep for later"])
        app.terminate()
        app.launchArguments = arguments
        app.launch()
        XCTAssertTrue(app.textFields["capture-claim-value-decision_deadline"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["create-new-person-from-capture"].exists)
        preserveScreenshot("Capture restarts at the same pending review")
        let value = app.textFields["capture-claim-value-decision_deadline"]
        tapWhenVisible(value)
        value.typeText("2026-09-11")
        tapWhenVisible(app.buttons["capture-confirm-decision_deadline"])
        XCTAssertTrue(app.buttons["capture-finish-review"].waitForExistence(timeout: 30))
        tapWhenVisible(app.buttons["capture-finish-review"])
        XCTAssertTrue(element("capture-confirmed-count").waitForExistence(timeout: 30))
        XCTAssertTrue(element("capture-confirmed-count").label.contains("2 changes confirmed"))
        XCTAssertTrue(element("capture-confirmed-count").label.contains("0 still to review"))
        preserveScreenshot("Capture all reviewed with truthful completion")
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
            "-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-talent-signal.interface-language", "en",
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
        } else {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
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

        XCTAssertTrue(element("capture-change-review").waitForExistence(timeout: 30))
        XCTAssertFalse(element("capture-completion-receipt").exists)
        let speakerChoice = app.buttons["capture-review-speaker-choice"]
        tapWhenVisible(speakerChoice)
        tapWhenVisible(app.buttons["Candidate"])
        tapWhenVisible(app.buttons["capture-confirm-speaker"])
        XCTAssertTrue(app.buttons["capture-finish-review"].waitForExistence(timeout: 30))
        preserveScreenshot("Independent change review before completion")
        tapWhenVisible(app.buttons["capture-finish-review"])
        let verdict = element("capture-completion-receipt")
        if !verdict.waitForExistence(timeout: 30) {
            let retry = app.buttons["retry-capture-step"]
            XCTAssertTrue(
                retry.waitForExistence(timeout: 5),
                "Wiki compilation should finish or expose a safe retry."
            )
            retry.tap()
        }
        XCTAssertTrue(verdict.waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["return-to-person"].exists)
        XCTAssertTrue(app.buttons["continue-capture-in-agent"].exists)
        XCTAssertTrue(element("device-contact-handoff").exists)
        XCTAssertTrue(app.buttons["review-device-contact"].exists)
        XCTAssertTrue(element("capture-completion-receipt").exists)
        if auditsAccessibility {
            assertAccessibilityOrder([
                "capture-review-outcome",
                "continue-capture-in-agent",
                "device-contact-handoff",
                "capture-completion-receipt",
            ])
        }
        preserveScreenshot("iOS truthful completed review receipt")

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
        let scopeSelector = element("ask-scope-selector")
        XCTAssertTrue(scopeSelector.waitForExistence(timeout: 5))
        let expectedScopeValue =
            "UI owner \(captureSeed.uuidString.prefix(8)), Current client relationship"
        let expectedNavigationTitle = "UI owner \(captureSeed.uuidString.prefix(8))"
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
                       self.app.navigationBars[expectedNavigationTitle].exists {
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

    func testHomeAttachmentRailOpensPurposeBoundChooserBeforeImport() {
        app.launch()

        let add = app.buttons["open-agent-attachments"]
        XCTAssertTrue(add.waitForExistence(timeout: 8))
        XCTAssertGreaterThanOrEqual(add.frame.height, 44)
        add.tap()

        XCTAssertTrue(element("home-attachment-chooser").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Choose a source first."].exists)
        XCTAssertTrue(app.staticTexts["Nothing is imported until you make a choice."].exists)
        XCTAssertTrue(app.buttons["home-attachment-photos"].exists)
        XCTAssertTrue(app.buttons["home-attachment-files"].exists)
        XCTAssertTrue(app.buttons["home-attachment-relationship"].exists)
        XCTAssertTrue(app.buttons["home-attachment-write"].exists)
        XCTAssertLessThan(
            element("home-attachment-chooser").frame.height,
            app.windows.firstMatch.frame.height * 0.8
        )
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        XCTAssertFalse(element("inspect-capture-source").exists)
        preserveScreenshot("Home attachment purpose-bound chooser")
    }

    func testNaturalContactProposalIsEditableAndRestoresAfterRelaunch() {
        app.launchArguments = [
            "--persist-preview-agent",
            "--reset-preview-agent",
            "--fixture-agent-contact-proposal",
        ]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        tapWhenVisible(app.buttons["relationship-guide"])
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
        tapWhenVisible(app.buttons["relationship-guide"])
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
        app.launchArguments = [
            "--persist-preview-agent",
            "--reset-preview-agent",
            "--fixture-agent-contact-proposal",
        ]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        tapWhenVisible(app.buttons["relationship-guide"])
        XCTAssertTrue(
            element("relationship-ask-sheet").waitForExistence(timeout: 5)
        )

        let composer = app.textFields["ask-composer"]
        let message = "Maya Chen, maya@example.com, Chief Product Officer"
        typeTextReliably(message, into: composer)
        XCTAssertEqual(composer.value as? String, message)
        let send = app.buttons["ask-send"]
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.label, "Send")
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

    func testIdentityQuestionDoesNotBecomeAContactWriteProposal() {
        app.launchArguments = ["--persist-preview-agent", "--reset-preview-agent"]
        app.launch()

        XCTAssertTrue(
            app.buttons["relationship-guide"].waitForExistence(timeout: 8)
        )
        tapWhenVisible(app.buttons["relationship-guide"])
        let composer = app.textFields["ask-composer"]
        let message = "Can you check Maya Chen, maya@example.com?"
        typeTextReliably(message, into: composer)
        app.buttons["ask-send"].tap()

        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 5))
        XCTAssertFalse(element("ask-recall-unresolved").exists)
        XCTAssertFalse(element("ask-scope-selector").exists)
        XCTAssertFalse(element("ask-scope-search").exists)
        XCTAssertFalse(element("contact-proposal-turn").exists)
        XCTAssertFalse(element("contact-proposal-card").exists)
        XCTAssertFalse(String(describing: composer.value).contains(message))
        XCTAssertTrue(composer.isEnabled)
        preserveScreenshot("Identity question remains a non-writing Agent turn")
    }

    func testContactMentionHasNoClientSideInterpretationPhase() {
        app.launchArguments = [
            "--persist-preview-agent",
            "--reset-preview-agent",
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

        XCTAssertFalse(element("ask-contact-interpreting").exists)
        XCTAssertTrue(element("ask-response-turn").waitForExistence(timeout: 5))
        XCTAssertTrue(composer.isEnabled)
        let attachmentMenu = app.buttons["ask-attachment-menu"]
        XCTAssertTrue(attachmentMenu.waitForExistence(timeout: 3))
        XCTAssertTrue(attachmentMenu.isEnabled)
        XCTAssertFalse(element("contact-proposal-turn").exists)
        XCTAssertFalse(element("ask-scope-selector").exists)
        preserveScreenshot("Contact mention stays in the Agent conversation")
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
        launchWithCleanAgentSessions()

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
        launchWithCleanAgentSessions()

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
            "--workspace-account-id", fixture.accountID,
            "--fixture-contact-lookup-delay-seconds", "6",
            "--fixture-contact-lookup-fail-once",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        launchWithCleanAgentSessions()

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
        launchWithCleanAgentSessions()

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
        launchWithCleanAgentSessions()

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
        launchWithCleanAgentSessions()
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
            "--fixture-agent-contact-proposal",
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
                // SwiftUI reports the edge-to-edge window as the ScrollView
                // frame even though the bottom 34 points sit behind the home
                // indicator safe area. Xcode then audits only the antialiased
                // edge of a clipped line and reports false low contrast.
                // Ignore nodes that cross a system-occluded edge while keeping
                // every fully visible contrast finding active.
                let visibleViewportBottom = min(viewportBottom, window.maxY - 34)
                return frame.minY < statusBottom
                    || frame.maxY > visibleViewportBottom
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

    private func assertVisibleAnchor(
        _ element: XCUIElement,
        near expectedMidY: CGFloat,
        tolerance: CGFloat,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(element.waitForExistence(timeout: 5), file: file, line: line)
        XCTAssertTrue(element.isHittable, file: file, line: line)
        XCTAssertLessThanOrEqual(
            abs(element.frame.midY - expectedMidY),
            tolerance,
            file: file,
            line: line
        )
    }

    private func assertHorizontallyCentered(
        _ element: XCUIElement,
        in container: XCUIElement,
        tolerance: CGFloat = 4,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(element.waitForExistence(timeout: 5), file: file, line: line)
        XCTAssertTrue(container.waitForExistence(timeout: 5), file: file, line: line)
        let centered = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in
                abs(element.frame.midX - container.frame.midX) <= tolerance
            },
            object: element
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [centered], timeout: 3),
            .completed,
            "Expected \(element.identifier) to stay centered in the adaptive selector. "
                + "Element frame: \(element.frame); viewport frame: \(container.frame).",
            file: file,
            line: line
        )
    }

    /// Starts canonical Agent journeys without state leaked from an earlier UI test.
    /// The flag is removed after launch so a relaunch inside the same journey can
    /// still prove that its session and write receipt survive process death.
    private func launchWithCleanAgentSessions() {
        let resetFlag = "--reset-agent-sessions"
        if !app.launchArguments.contains(resetFlag) {
            app.launchArguments.append(resetFlag)
        }
        app.launch()
        app.launchArguments.removeAll { $0 == resetFlag }
    }

    private func testConfiguration(_ key: String, fallback: String) -> String {
        // XCTest can reuse a simulator test daemon whose environment still
        // carries an earlier run's ephemeral fixture ports. The bundle values
        // are expanded by the current xcodebuild invocation and are therefore
        // authoritative for this runner.
        if let bundleValue = Bundle(for: CandidateSignalUITests.self)
            .object(forInfoDictionaryKey: key) as? String,
           !bundleValue.isEmpty,
           !bundleValue.contains("$(") {
            return bundleValue
        }
        if let environmentValue = ProcessInfo.processInfo.environment[key],
           !environmentValue.isEmpty {
            return environmentValue
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

    private func recalledRelationship(
        personID: String,
        contextID: String? = nil,
        query: String
    ) -> XCUIElement {
        let identifier = contextID.map {
            "ask-recall-candidate-\(personID):\($0)"
        } ?? "ask-recall-candidate-\(personID):"
        let predicate = contextID == nil
            ? NSPredicate(format: "identifier BEGINSWITH %@", identifier)
            : NSPredicate(format: "identifier == %@", identifier)
        let candidate = app.buttons.matching(predicate).firstMatch
        if !candidate.waitForExistence(timeout: 2) {
            let search = element("ask-recall-search")
            XCTAssertTrue(
                search.waitForExistence(timeout: 5),
                "The relationship recall did not offer a searchable fallback."
            )
            typeTextReliably(query, into: search)
        }
        return candidate
    }

    private func typeTextReliably(_ text: String, into field: XCUIElement) {
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        let keyboard = app.keyboards.firstMatch

        var remaining = text

        for _ in 0..<4 {
            field.tap()
            if keyboard.waitForExistence(timeout: 1.5) {
                if let currentValue = field.value as? String {
                    if currentValue == text {
                        return
                    }
                    if !currentValue.isEmpty,
                       text.hasPrefix(currentValue) {
                        remaining = String(text.dropFirst(currentValue.count))
                    }
                }
                field.typeText(remaining)

                let complete = XCTNSPredicateExpectation(
                    predicate: NSPredicate(format: "value == %@", text),
                    object: field
                )
                if XCTWaiter.wait(for: [complete], timeout: 1) == .completed {
                    return
                }

                let enteredValue = field.value as? String
                if enteredValue == text {
                    return
                }

                guard let entered = enteredValue,
                      text.hasPrefix(entered),
                      entered.count < text.count else {
                    XCTFail(
                        "Expected the text field to contain \(text), got \(field.value ?? "nil")"
                    )
                    return
                }
                remaining = String(text.dropFirst(entered.count))
            }
        }

        XCTFail(
            "Expected the text field to contain \(text), got \(field.value ?? "nil")"
        )
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
        XCTAssertFalse(
            selector.exists,
            "An unresolved identity review must not inherit a relationship scope."
        )

        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertTrue(composer.isEnabled)
        XCTAssertFalse(element("ask-scope-search").exists)
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
        guard element("agent-session-list").waitForExistence(timeout: 5) else {
            preserveScreenshot("Restored Sessions list unavailable")
            XCTFail("The persisted contact receipt did not appear in Sessions after relaunch.")
            return
        }
        let session = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
                "agent-session-",
                sessionTitle
            )
        ).firstMatch
        XCTAssertTrue(session.waitForExistence(timeout: 5))
        tapVisibleCenter(session)

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
            XCTAssertFalse(
                element("ask-scope-selector").exists,
                "An unresolved identity receipt must not imply a relationship scope after relaunch."
            )
            XCTAssertTrue(app.textFields["ask-composer"].isEnabled)
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
        if element.isHittable {
            element.tap()
            return
        }

        let window = app.windows.firstMatch
        let center = CGPoint(x: element.frame.midX, y: element.frame.midY)
        if window.frame.contains(center) {
            // XCTest can keep a visible SwiftUI control marked non-hittable at
            // a scroll or safe-area edge. A coordinate tap preserves the
            // current viewport for the following accessibility assertions.
            tapVisibleCenter(element)
            return
        }

        while !element.isHittable, swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
        if element.isHittable {
            element.tap()
        } else {
            tapVisibleCenter(element)
        }
    }

    private func tapVisibleCenter(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 5))
        let window = app.windows.firstMatch
        let frame = element.frame
        XCTAssertGreaterThan(frame.width, 0)
        XCTAssertGreaterThan(frame.height, 0)
        XCTAssertTrue(window.frame.contains(CGPoint(x: frame.midX, y: frame.midY)))
        let target = CGVector(
            dx: (frame.midX - window.frame.minX) / window.frame.width,
            dy: (frame.midY - window.frame.minY) / window.frame.height
        )
        window.coordinate(withNormalizedOffset: target).tap()
    }

    private func openSessionActions(_ row: XCUIElement) {
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        let sessionID = row.identifier.replacingOccurrences(
            of: "agent-session-",
            with: ""
        )
        let menu = app.buttons["session-actions-\(sessionID)"]
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        menu.tap()
        XCTAssertTrue(app.buttons["archive-tab-sessions"].isSelected)
    }

    private func openPersonActions(_ row: XCUIElement) {
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        let personID = row.identifier.replacingOccurrences(
            of: "workspace-person-",
            with: ""
        )
        let menu = app.buttons["person-actions-\(personID)"]
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        menu.tap()
        XCTAssertTrue(app.buttons["archive-tab-people"].isSelected)
    }

    private func percentile(_ samples: [Double], _ fraction: Double) -> Double {
        precondition(!samples.isEmpty)
        let sorted = samples.sorted()
        let index = max(
            0,
            min(sorted.count - 1, Int(ceil(fraction * Double(sorted.count))) - 1)
        )
        return sorted[index]
    }

    private func latencySummary(_ samples: [Double]) -> [String: Any] {
        [
            "trials": samples.count,
            "p50": (percentile(samples, 0.50) * 100).rounded() / 100,
            "p95": (percentile(samples, 0.95) * 100).rounded() / 100,
            "maximum": ((samples.max() ?? 0) * 100).rounded() / 100,
            "samples": samples.map { ($0 * 100).rounded() / 100 },
        ]
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
        let matches = app.descendants(matching: .any)
            .matching(identifier: identifier)
        if identifier == "relationship-ask-sheet",
           let visible = matches.allElementsBoundByIndex.max(by: {
               $0.frame.height < $1.frame.height
           }) {
            return visible
        }
        return app.descendants(matching: .any)[identifier]
    }

    private func hittableButton(
        _ identifier: String,
        timeout: TimeInterval = 5
    ) -> XCUIElement {
        let matches = app.buttons.matching(identifier: identifier)
        let first = matches.firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: timeout))
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if let visible = matches.allElementsBoundByIndex.first(where: {
                $0.isHittable
            }) {
                return visible
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        } while Date() < deadline
        return first
    }

    private var askComposer: XCUIElement {
        app.textFields["ask-composer"].firstMatch
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
        openRelationshipMenu()
        let settings = app.buttons["open-settings"]
        if !settings.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
    }

    private func openRelationshipMenu() {
        let entry = hittableButton("relationship-agent-studio")
        XCTAssertTrue(entry.isHittable)
        entry.tap()
        XCTAssertTrue(element("agent-studio").waitForExistence(timeout: 5))
        let settings = app.buttons["agent-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        XCTAssertTrue(
            app.buttons["close-relationship-menu"]
                .waitForExistence(timeout: 5)
        )
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
    let contactConflictCurrentContextID: String?
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
        case contactConflictCurrentContextID = "contact_conflict_current_context_id"
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

@MainActor
final class RelationshipCalendarWorkflowUITests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["TS_IOS_UI_TEST_PREVIEW_WORKSPACE"] = "true"
        app.launchEnvironment["TS_IOS_UI_TEST_CALENDAR_DENSITY"] = "true"
        app.launchArguments = ["-talent-signal.interface-language", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    }

    private func openCalendar() {
        app.launch()
        let open = app.buttons["today-calendar-peek"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        open.tap()
        XCTAssertTrue(app.buttons["calendar-view-options"].waitForExistence(timeout: 5))
    }

    private func choose(_ identifier: String) {
        app.buttons["calendar-view-options"].tap()
        let option = app.buttons[identifier]
        XCTAssertTrue(option.waitForExistence(timeout: 5))
        option.tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func openCalendarShortcuts() {
        app.launch()
        let open = app.buttons["today-calendar-peek"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        XCTAssertGreaterThanOrEqual(open.frame.height, 44)
        open.press(forDuration: 0.8)
        XCTAssertTrue(
            app.buttons["calendar-shortcut-open"].waitForExistence(timeout: 5)
        )
    }

    func testCalendarLongPressOpensWeekAndActivityShortcuts() {
        openCalendarShortcuts()
        XCTAssertTrue(app.buttons["calendar-shortcut-today"].exists)
        XCTAssertTrue(app.buttons["calendar-shortcut-this-week"].exists)
        XCTAssertTrue(app.buttons["calendar-shortcut-add-activity"].exists)

        app.buttons["calendar-shortcut-this-week"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-week-grid"]
                .firstMatch.waitForExistence(timeout: 5)
        )

        let activityID = "preview-calendar-morning"
        let activity = app.buttons["calendar-activity-\(activityID)"]
        XCTAssertTrue(activity.waitForExistence(timeout: 5))
        XCTAssertTrue(activity.isHittable)
        activity.press(forDuration: 0.8)
        XCTAssertTrue(
            app.buttons["calendar-context-open-\(activityID)"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["calendar-context-edit-\(activityID)"].exists)
        XCTAssertTrue(app.buttons["calendar-context-person-\(activityID)"].exists)
        XCTAssertTrue(app.buttons["calendar-context-prepare-\(activityID)"].exists)

        app.buttons["calendar-context-prepare-\(activityID)"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["relationship-ask-sheet"]
                .firstMatch.waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.textFields["ask-composer"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            (app.textFields["ask-composer"].value as? String)?
                .contains("Prepare for the") == true
        )
    }

    func testCalendarLongPressEditReviewsChangesBeforeUpdating() {
        openCalendar()
        let activityID = "preview-calendar-morning"
        let activity = app.buttons["calendar-activity-\(activityID)"]
        XCTAssertTrue(activity.waitForExistence(timeout: 5))
        activity.press(forDuration: 0.8)

        let edit = app.buttons["calendar-context-edit-\(activityID)"]
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        edit.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["relationship-calendar-composer"]
                .firstMatch.waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-edit-locked-scope"].firstMatch.exists
        )
        let title = app.textFields["calendar-activity-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeText(" updated")

        let review = app.buttons["calendar-review-activity-edit"]
        XCTAssertTrue(review.isEnabled)
        review.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-activity-edit-review"]
                .firstMatch.waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-edit-change-title"].firstMatch.exists
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-edit-external-effect"].firstMatch.exists
        )
        XCTAssertTrue(app.buttons["calendar-confirm-activity-edit"].exists)
        XCTAssertFalse(app.alerts.firstMatch.exists)
        capture("17-calendar-edit-review")

        app.buttons["calendar-confirm-activity-edit"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-activity-detail"]
                .firstMatch.waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["Preview activity updated"].exists)
        XCTAssertFalse(app.buttons["calendar-retry-sync"].exists)
    }

    func testCalendarLongPressAddActivityOpensReviewBeforeAnyWrite() {
        openCalendarShortcuts()
        app.buttons["calendar-shortcut-add-activity"].tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["relationship-calendar-composer"]
                .firstMatch.waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.staticTexts["Preview only · nothing is added to Apple Calendar."]
                .exists
        )
        XCTAssertTrue(app.buttons["calendar-confirm-activity"].exists)
    }

    func testWeekPersonFilterClearAndPersonRecordHandoff() {
        openCalendar()
        choose("calendar-view-week")
        XCTAssertTrue(app.descendants(matching: .any)["calendar-week-grid"].firstMatch.exists)
        let primary = app.buttons["calendar-activity-preview-calendar-primary"]
        let secondary = app.buttons["calendar-activity-preview-calendar-secondary"]
        XCTAssertTrue(primary.exists)
        XCTAssertTrue(secondary.exists)
        let nine = app.staticTexts["09:00"]
        let morning = app.buttons["calendar-activity-preview-calendar-morning"]
        XCTAssertTrue(nine.exists)
        XCTAssertEqual(nine.frame.midY, morning.frame.minY, accuracy: 12)
        let railX = nine.frame.minX
        app.scrollViews["calendar-week-columns"].swipeRight()
        XCTAssertEqual(nine.frame.minX, railX, accuracy: 1)
        app.scrollViews["calendar-week-columns"].swipeLeft()
        capture("03-week-people")
        choose("calendar-person-filter")
        let leila = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "calendar-filter-person-", "Leila")).firstMatch
        XCTAssertTrue(leila.waitForExistence(timeout: 5))
        leila.tap()
        XCTAssertTrue(primary.waitForExistence(timeout: 5))
        XCTAssertFalse(secondary.exists)
        XCTAssertTrue(app.buttons["calendar-clear-person"].exists)
        capture("04-filtered-person")
        app.buttons["calendar-clear-person"].tap()
        XCTAssertTrue(secondary.exists)
        for _ in 0..<5 where !primary.isHittable { app.swipeUp() }
        primary.tap()
        let person = app.buttons["calendar-open-person"]
        XCTAssertTrue(person.waitForExistence(timeout: 5))
        person.tap()
        XCTAssertTrue(app.descendants(matching: .any)["workspace-person-detail"].firstMatch.waitForExistence(timeout: 8))
        capture("05-person-record")
        app.buttons["Close"].firstMatch.tap()
        XCTAssertTrue(app.buttons["calendar-view-options"].waitForExistence(timeout: 5))
        XCTAssertTrue(secondary.exists)
        capture("11-return-to-calendar")
    }

    func testPreviewCreationUsesFilterAndCannotWriteToCalendar() {
        app.launchArguments += ["-talent-signal.calendar-sync.enabled", "YES"]
        openCalendar()
        choose("calendar-view-week")
        choose("calendar-person-filter")
        let person = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "calendar-filter-person-", "Leila")).firstMatch
        XCTAssertTrue(person.waitForExistence(timeout: 5))
        person.tap()
        app.buttons["calendar-add-activity"].tap()
        XCTAssertTrue(app.staticTexts["Preview only · nothing is added to Apple Calendar."].waitForExistence(timeout: 5))
        let title = app.textFields["calendar-activity-title"]
        XCTAssertTrue((title.value as? String)?.contains("Leila") == true)
        capture("06-contextual-composer")
        app.buttons["calendar-confirm-activity"].tap()
        XCTAssertTrue(app.staticTexts["Synthetic preview · not in Apple Calendar"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["calendar-retry-sync"].exists)
        XCTAssertFalse(app.alerts.firstMatch.exists)
        capture("07-preview-created")
    }

    func testEmptyWeekReturnsToTodayAndChineseCalendarRemainsReadable() {
        app.launchArguments += ["-talent-signal.interface-language", "zh-Hans"]
        openCalendar()
        choose("calendar-view-week")
        capture("08-chinese-week")
        app.buttons["calendar-next-week"].tap()
        XCTAssertTrue(app.staticTexts["这段时间没有日程"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["calendar-empty-add-activity"].exists)
        capture("09-empty-week")
        choose("calendar-return-today")
        XCTAssertTrue(app.buttons["calendar-activity-preview-calendar-primary"].exists)
        app.buttons["calendar-toggle-month"].tap()
        XCTAssertTrue(app.buttons["calendar-next-month"].exists)
        capture("10-expanded-month")
    }

    func testCompactAgendaDisclosesMetadataWithoutHidingPreviewOrPreparation() {
        openCalendar()
        XCTAssertFalse(app.buttons["calendar-return-today"].exists)
        XCTAssertFalse(app.buttons["calendar-person-filter"].exists)
        let first = app.buttons["calendar-activity-preview-calendar-morning"]
        XCTAssertTrue(first.exists)
        XCTAssertLessThan(first.frame.minY, 350)
        XCTAssertLessThan(first.frame.height, 125)
        capture("12-compact-agenda")
        first.tap()
        XCTAssertTrue(app.buttons["calendar-prepare-agent"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Synthetic preview · not in Apple Calendar"].exists)
        let originalZone = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "Event time zone")).firstMatch
        XCTAssertFalse(originalZone.exists)
        let details = app.buttons["calendar-details-disclosure"]
        XCTAssertTrue(details.exists)
        capture("13-compact-detail")
        details.tap()
        XCTAssertTrue(originalZone.waitForExistence(timeout: 3))
        capture("14-expanded-metadata")
    }

    func testWeekFallsBackToReadableAgendaAtAccessibilitySize() {
        app.launchArguments += ["--force-dark", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        openCalendar()
        choose("calendar-view-week")
        XCTAssertTrue(app.staticTexts["calendar-week-list-notice"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["calendar-week-grid"].firstMatch.exists)
        let primary = app.buttons["calendar-activity-preview-calendar-primary"]
        for _ in 0..<12 where !primary.isHittable { app.swipeUp() }
        XCTAssertTrue(primary.isHittable)
        capture("15-week-accessibility-list")
    }

    func testOverlapWarningStaysVisibleWithMetadataCollapsed() {
        openCalendar()
        let overlap = app.buttons["calendar-activity-preview-calendar-followup"]
        for _ in 0..<5 where !overlap.isHittable { app.swipeUp() }
        overlap.tap()
        XCTAssertTrue(app.buttons["calendar-prepare-agent"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Overlaps another Talent Signal activity"].exists)
        XCTAssertTrue(app.buttons["calendar-details-disclosure"].exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "Event time zone")).firstMatch.exists)
        capture("16-overlap-detail")
    }

}
