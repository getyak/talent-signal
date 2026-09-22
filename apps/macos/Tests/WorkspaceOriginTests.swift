import XCTest
@testable import TalentSignalMac

final class WorkspaceOriginTests: XCTestCase {
    func testSettingsAndWorkspaceUseTheSameOriginPrecedence() {
        XCTAssertEqual(WorkspaceOrigin.configured(saved: "https://saved.example", environment: "https://env.example", bundled: "https://bundle.example")?.url.host, "saved.example")
        XCTAssertEqual(WorkspaceOrigin.configured(saved: "", environment: "https://env.example", bundled: "https://bundle.example")?.url.host, "env.example")
        XCTAssertEqual(WorkspaceOrigin.configured(saved: "", environment: nil, bundled: "https://bundle.example")?.url.host, "bundle.example")
    }

    func testDesktopDestinationsStayInsideConfiguredOrigin() throws {
        let origin = try XCTUnwrap(WorkspaceOrigin("https://workspace.example.com:10443"))
        for destination in WorkspaceDestination.allCases {
            XCTAssertTrue(origin.contains(destination.url(in: origin)))
            XCTAssertTrue(destination.url(in: origin).path.hasPrefix("/workspace"))
        }
        XCTAssertEqual(WorkspaceDestination.settings.url(in: origin).path, "/workspace/settings")
    }
    func testOnlyExplicitHTTPSOriginsAreAccepted() {
        for value in ["http://localhost:3000", "file:///etc/passwd", "javascript:alert(1)",
                      "https://user:password@example.com", "https://example.com/workspace",
                      "https://example.com?token=secret", "https://example.com#fragment"] {
            XCTAssertNil(WorkspaceOrigin(value), value)
        }
        XCTAssertEqual(WorkspaceOrigin("https://workspace.example.com:10443/")?.entryURL.absoluteString,
                       "https://workspace.example.com:10443/workspace")
    }

    func testDevelopmentOptInNeverAllowsRemoteHTTP() {
        XCTAssertNil(WorkspaceOrigin("http://workspace.example.com", allowLocalDevelopment: true))
        XCTAssertNil(WorkspaceOrigin("http://127.0.0.1.evil.test:4396", allowLocalDevelopment: true))
        let local = WorkspaceOrigin("http://127.0.0.1:4396", allowLocalDevelopment: true)
        XCTAssertNotNil(local)
        XCTAssertFalse(local!.contains(URL(string: "http://127.0.0.1:4397")!))

    }

    func testNavigationIsBoundToTheExactOrigin() throws {
        let origin = try XCTUnwrap(WorkspaceOrigin("https://workspace.example.com"))
        XCTAssertTrue(origin.contains(URL(string: "https://workspace.example.com:443/login?callbackUrl=%2Fworkspace")!))
        for value in ["https://workspace.example.com.evil.test/workspace", "https://evil.test",
                      "http://workspace.example.com", "https://workspace.example.com:10443",
                      "https://user@workspace.example.com/workspace"] {
            XCTAssertFalse(origin.contains(URL(string: value)!), value)
        }
    }
    func testCalendarDownloadsRequireTheirExactCreatingOrigin() throws {
        let origin = try XCTUnwrap(WorkspaceOrigin("https://workspace.example.com:10443"))
        let source = URL(string: "https://workspace.example.com:10443/workspace/meetings")!
        XCTAssertTrue(origin.allowsCalendarDownload(URL(string: "blob:https://workspace.example.com:10443/operation-id")!, from: source))
        XCTAssertTrue(origin.allowsCalendarDownload(URL(string: "https://workspace.example.com:10443/api/time/export")!, from: source))
        for value in ["blob:https://workspace.example.com/operation-id", "blob:https://evil.test/id", "blob:null/id", "data:text/calendar,secret", "file:///tmp/file.ics", "https://workspace.example.com.evil.test/file.ics"] {
            XCTAssertFalse(origin.allowsCalendarDownload(URL(string: value)!, from: source), value)
        }
        XCTAssertFalse(origin.allowsCalendarDownload(URL(string: "blob:https://workspace.example.com:10443/id")!, from: URL(string: "https://evil.test")!))
    }

}
