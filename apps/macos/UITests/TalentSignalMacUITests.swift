import XCTest

final class TalentSignalMacUITests: XCTestCase {
    private func launch(
        state: String = "ready",
        reducedMotion: Bool = false,
        identityTagCount: Int? = nil
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--fixture-state", state]
        if let identityTagCount {
            app.launchArguments += ["--identity-tag-count", String(identityTagCount)]
        }
        if reducedMotion {
            app.launchArguments += ["-AppleReduceMotion", "YES"]
        }
        app.launch()
        XCTAssertTrue(app.windows.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["app.syntheticBanner"].waitForExistence(timeout: 3))
        return app
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
