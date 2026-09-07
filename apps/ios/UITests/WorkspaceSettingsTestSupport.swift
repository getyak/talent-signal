import XCTest

@MainActor
extension XCUIApplication {
    func openProductLabFromSettings(
        timeout: TimeInterval = 15,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertFalse(
            buttons["talent-signal-lab-capsule"].exists,
            "Internal testing must not occupy the primary navigation.",
            file: file,
            line: line
        )

        let agent = buttons["relationship-agent-studio"]
        XCTAssertTrue(
            agent.waitForExistence(timeout: timeout),
            "The Agent entry is required to reach workspace settings.",
            file: file,
            line: line
        )
        agent.tap()

        let settings = buttons["agent-settings"]
        XCTAssertTrue(
            settings.waitForExistence(timeout: 8),
            "Workspace settings were not reachable from Agent Studio.",
            file: file,
            line: line
        )
        settings.tap()

        let internalTesting = buttons["open-internal-testing"]
        for _ in 0..<18 where !internalTesting.isHittable {
            swipeUp()
        }
        XCTAssertTrue(
            internalTesting.isHittable,
            "Internal testing was not available in workspace settings.",
            file: file,
            line: line
        )
        internalTesting.tap()

        XCTAssertTrue(
            buttons["product-lab-done"].waitForExistence(timeout: 10),
            "Internal testing did not open from workspace settings.",
            file: file,
            line: line
        )
    }
}
