import XCTest
@testable import TalentSignalMac

final class WorkspaceSettingsTests: XCTestCase {
    func testOnlySameOriginSettingsRoutesSelectNativeSections() throws {
        let origin = try XCTUnwrap(WorkspaceOrigin("https://workspace.example:10443"))
        for section in WorkspaceSettingsSection.allCases where section.isWeb {
            XCTAssertEqual(WorkspaceSettingsSection.resolve(section.url(in: origin), origin: origin), section)
        }
        XCTAssertEqual(WorkspaceSettingsSection.resolve(URL(string: "https://workspace.example:10443/workspace/settings?section=overview")!, origin: origin), .profile)
        for url in ["https://workspace.example/workspace/settings", "https://other.example/workspace/settings", "https://workspace.example:10443/workspace/settings-evil", "https://workspace.example:10443/workspace/settings?section=device", "https://workspace.example:10443/workspace/settings?section=unknown"] {
            XCTAssertNil(WorkspaceSettingsSection.resolve(URL(string: url)!, origin: origin))
        }
    }

    @MainActor
    func testSettingsCommandDoesNotNavigateTheConversation() throws {
        let origin = try XCTUnwrap(WorkspaceOrigin("https://workspace.example"))
        let browser = WorkspaceBrowser(origin: origin)
        browser.webView.stopLoading()
        let before = browser.webView.url
        var opened = 0
        browser.openSettings = { opened += 1 }
        browser.navigate(.settings)
        XCTAssertEqual(opened, 1)
        XCTAssertEqual(browser.webView.url, before)
        XCTAssertFalse(browser.isSettingsSurface)
        let settings = WorkspaceBrowser(origin: origin, settings: true, initialURL: WorkspaceSettingsSection.profile.url(in: origin))
        settings.webView.stopLoading()
        XCTAssertTrue(settings.isSettingsSurface)
        XCTAssertEqual(settings.webView.configuration.websiteDataStore.identifier, browser.webView.configuration.websiteDataStore.identifier)
    }
}
