    // Compare the same synthetic workload before/after GET-8. Native signposts
    // are observational evidence; Simulator results are not device FPS claims.
    func testGET8TodaySessionsScrollMetrics() {
        measureGET8PagePair(start: "today", forward: "editorial-today", backward: "agent-session-list")
    }

    func testGET8SessionsPeopleScrollMetrics() {
        measureGET8PagePair(start: "sessions", forward: "agent-session-list", backward: "workspace-people-list")
    }

    private func measureGET8PagePair(start: String, forward: String, backward: String) {
        app.launchArguments += ["--preview-long-session-list", "--preview-long-people-list"]
        app.launch()
        let initial = app.buttons["archive-tab-\(start)"]
        XCTAssertTrue(initial.waitForExistence(timeout: 8))
        initial.tap()
        XCTAssertTrue(element(forward).waitForExistence(timeout: 5))
        let options = XCTMeasureOptions()
        options.iterationCount = 5
        // Apple XCTOSSignpostMetric.h: covers scroll and deceleration animations.
        measure(metrics: [XCTClockMetric(), XCTOSSignpostMetric.scrollingAndDecelerationMetric], options: options) {
            element(forward).swipeLeft()
            XCTAssertTrue(element(backward).exists)
            element(backward).swipeRight()
            XCTAssertTrue(app.buttons["archive-tab-\(start)"].isSelected)
        }
    }
