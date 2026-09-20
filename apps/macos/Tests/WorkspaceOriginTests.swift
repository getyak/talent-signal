import XCTest
@testable import TalentSignalMac

final class WorkspaceOriginTests: XCTestCase {
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
        #if DEBUG
        let local = WorkspaceOrigin("http://127.0.0.1:4396", allowLocalDevelopment: true)
        XCTAssertNotNil(local)
        XCTAssertFalse(local!.contains(URL(string: "http://127.0.0.1:4397")!))
        #else
        XCTAssertNil(WorkspaceOrigin("http://127.0.0.1:4396", allowLocalDevelopment: true))
        #endif
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
}
