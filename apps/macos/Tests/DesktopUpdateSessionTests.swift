import XCTest
import Sparkle
@testable import TalentSignalMac

@MainActor
final class DesktopUpdateSessionTests: XCTestCase {
    func testDiscoveryWaitsForOneExplicitClickThenRelaunchesWithoutAnotherDecision() {
        let session = DesktopUpdateSession()
        var choices: [SPUUserUpdateChoice] = []
        session.configure(); session.checking()
        session.offer(version: "0.2 (12)", verified: true, informationOnly: false) { choices.append($0) }
        XCTAssertTrue(choices.isEmpty)
        XCTAssertTrue(session.state.canInstall)
        session.install(offerID: session.state.offerID); session.install(offerID: session.state.offerID)
        XCTAssertEqual(choices, [.install])
        session.extracting()
        session.ready { choices.append($0) }
        XCTAssertEqual(choices, [.install, .install])
        XCTAssertEqual(session.state.phase, .installing)
    }
    func testCheckBeforeDiscoveryNeverPreauthorizesTheLaterVersion() {
        let session = DesktopUpdateSession()
        session.configure(); session.checking(); session.install(offerID: session.state.offerID)
        var choices: [SPUUserUpdateChoice] = []
        session.offer(version: "2", verified: true, informationOnly: false) { choices.append($0) }
        XCTAssertTrue(choices.isEmpty)
        session.ready { choices.append($0) }
        XCTAssertEqual(choices, [.skip])
    }
    func testUnsignedAndInformationalItemsCannotBecomeInstallable() {
        for (verified, information) in [(false, false), (true, true)] {
            let session = DesktopUpdateSession()
            var choices: [SPUUserUpdateChoice] = []
            session.offer(version: "2", verified: verified, informationOnly: information) { choices.append($0) }
            session.install(offerID: session.state.offerID)
            XCTAssertFalse(session.state.canInstall)
            XCTAssertNil(session.state.version)
            XCTAssertEqual(choices, [.dismiss])
        }
    }
    func testFailureRevokesConsentAndStaleReadyCallbackCannotRestart() {
        let session = DesktopUpdateSession()
        session.offer(version: "2", verified: true, informationOnly: false) { _ in }
        session.install(offerID: session.state.offerID); session.fail(); session.dismiss()
        XCTAssertEqual(session.state.phase, .failed)
        session.ready { XCTAssertEqual($0, .skip) }
        session.downloadProgress(50)
        XCTAssertEqual(session.state.phase, .failed)
        session.checking()
        var choices: [SPUUserUpdateChoice] = []
        session.offer(version: "3", verified: true, informationOnly: false) { choices.append($0) }
        XCTAssertTrue(choices.isEmpty)
    }
    func testDuplicateOfferDoesNotReplaceTheVersionTheUserSaw() {
        let session = DesktopUpdateSession()
        var original: [SPUUserUpdateChoice] = []
        session.offer(version: "2", verified: true, informationOnly: false) { original.append($0) }
        session.offer(version: "3", verified: true, informationOnly: false) { XCTAssertEqual($0, .dismiss) }
        XCTAssertEqual(session.state.version, "2")
        session.install(offerID: session.state.offerID)
        XCTAssertEqual(original, [.install])
    }
    func testExpiredOfferTokenCannotAuthorizeAReplacementUpdate() {
        let session = DesktopUpdateSession()
        session.offer(version: "2", verified: true, informationOnly: false) { _ in }
        let oldOffer = session.state.offerID
        session.fail()
        var choices: [SPUUserUpdateChoice] = []
        session.offer(version: "3", verified: true, informationOnly: false) { choices.append($0) }
        session.install(offerID: oldOffer)
        session.install(offerID: nil)
        XCTAssertTrue(choices.isEmpty)
        XCTAssertEqual(session.state.version, "3")
        session.install(offerID: session.state.offerID)
        session.ready { choices.append($0) }
        session.ready { choices.append($0) }
        XCTAssertEqual(choices, [.install, .install, .skip])
    }
    func testProgressRequiresConsentAndClampsInvalidLengthEstimates() {
        let session = DesktopUpdateSession()
        session.downloadProgress(70)
        XCTAssertNil(session.state.progress)
        session.offer(version: "2", verified: true, informationOnly: false) { _ in }
        session.install(offerID: session.state.offerID); session.downloadProgress(140)
        XCTAssertEqual(session.state.progress, 100)
        session.downloadProgress(-1)
        XCTAssertEqual(session.state.progress, 0)
        session.extracting(); session.downloadProgress(40)
        XCTAssertNil(session.state.progress)
    }
    func testDownloadedOfferResumesInstallationOnlyAfterItsOwnClick() {
        let session = DesktopUpdateSession()
        var choices: [SPUUserUpdateChoice] = []
        session.offer(version: "2", verified: true, informationOnly: false, stage: .downloaded) { choices.append($0) }
        XCTAssertTrue(choices.isEmpty)
        session.install(offerID: session.state.offerID)
        XCTAssertEqual(session.state.phase, .installing)
        XCTAssertEqual(choices, [.install])
    }
    func testUnverifiedCheckNeverClaimsLatestOrAdvancesVerifiedCheckTime() {
        let session = DesktopUpdateSession()
        session.noUpdate(status: "当前已是最新版本", verified: false)
        XCTAssertEqual(session.state.phase, .failed)
        XCTAssertNil(session.state.lastChecked)
        XCTAssertFalse(session.state.status.contains("最新"))
        session.noUpdate(status: "新版本暂不支持这台 Mac", verified: true)
        XCTAssertEqual(session.state.phase, .idle)
        XCTAssertNotNil(session.state.lastChecked)
        XCTAssertEqual(session.state.status, "新版本暂不支持这台 Mac")
    }
}
