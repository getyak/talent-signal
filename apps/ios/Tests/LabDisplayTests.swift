import SwiftUI
import XCTest
@testable import TalentSignal

@MainActor
final class LabDisplayTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suite: String!
    override func setUp() {
        super.setUp()
        suite = "LabDisplayTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)!
    }
    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        defaults = nil
        super.tearDown()
    }
    func testTemporaryTrialNeverPersistsAndRestoresWithoutChangingPreferences() {
        defaults.set("light", forKey: LabDisplayStore.themeKey)
        defaults.set("en", forKey: AppLanguage.storageKey)
        var config = LabDisplayConfiguration.standard
        config.theme = .dark; config.language = .chinese; config.textSize = .accessibility5
        let store = LabDisplayStore(defaults: defaults, enabled: true)
        store.apply(config, minutes: 15)
        XCTAssertEqual(store.active?.configuration, config)
        XCTAssertEqual(defaults.string(forKey: LabDisplayStore.themeKey), "light")
        XCTAssertEqual(defaults.string(forKey: AppLanguage.storageKey), "en")
        XCTAssertNil(LabDisplayStore(defaults: defaults, enabled: true).active)
        store.contextChanged()
        XCTAssertNil(store.active)
        XCTAssertEqual(defaults.string(forKey: LabDisplayStore.themeKey), "light")
    }
    func testExpiryUsesMonotonicTimeAndReplacementKeepsItsOwnDeadline() {
        var clock: TimeInterval = 100
        var wall = Date(timeIntervalSince1970: 2_000_000_000)
        let store = LabDisplayStore(defaults: defaults, enabled: true, uptime: { clock }, now: { wall })
        store.apply(.standard, minutes: 5)
        let oldID = store.active!.id
        clock = 200
        store.apply(.standard, minutes: 15)
        XCTAssertNotEqual(store.active?.id, oldID)
        clock = 401; wall = .distantPast
        store.expireIfNeeded()
        XCTAssertNotNil(store.active, "The replaced trial cannot expire its successor.")
        clock = 1_100
        store.expireIfNeeded()
        XCTAssertNil(store.active, "Changing wall clock cannot extend the trial.")
    }
    func testPresetsAreExplicitAndCorruptionCannotBeOverwritten() throws {
        let store = LabDisplayStore(defaults: defaults, enabled: true)
        var config = LabDisplayConfiguration.standard; config.theme = .dark
        store.savePreset(name: "  Dark review  ", configuration: config)
        let restored = LabDisplayStore(defaults: defaults, enabled: true)
        XCTAssertEqual(restored.presets.first?.name, "Dark review")
        XCTAssertEqual(restored.presets.first?.configuration, config)
        XCTAssertNil(restored.active)
        let corrupted = Data("unreadable".utf8)
        defaults.set(corrupted, forKey: LabDisplayStore.presetsKey)
        restored.loadPresets()
        restored.deletePreset(restored.presets[0].id)
        restored.savePreset(name: "New", configuration: .standard)
        XCTAssertEqual(defaults.data(forKey: LabDisplayStore.presetsKey), corrupted)
        XCTAssertNotNil(restored.error)
        defaults.removeObject(forKey: LabDisplayStore.presetsKey)
        restored.loadPresets()
        XCTAssertTrue(restored.presets.isEmpty)
        XCTAssertNil(restored.error)
    }
    func testDisabledLabCannotActivateOrMutateSavedPreferences() {
        let owner = LabDisplayStore(defaults: defaults, enabled: true)
        owner.savePreset(name: "Retained", configuration: .standard)
        let before = defaults.data(forKey: LabDisplayStore.presetsKey)
        let store = LabDisplayStore(defaults: defaults, enabled: false)
        store.apply(.standard, minutes: 15)
        store.savePersonalPreferences(.standard)
        store.deletePreset(store.presets[0].id)
        store.savePreset(name: "Blocked", configuration: .standard)
        XCTAssertNil(store.active)
        XCTAssertNil(defaults.string(forKey: LabDisplayStore.themeKey))
        XCTAssertEqual(defaults.data(forKey: LabDisplayStore.presetsKey), before)
    }
    func testSystemAccessibilityCannotBeReducedByAnyPreset() {
        for size in [DynamicTypeSize.accessibility1, .accessibility3, .accessibility5] {
            for requested in LabDisplayConfiguration.TextSize.allCases {
                XCTAssertGreaterThanOrEqual(requested.resolved(size), size)
            }
        }
        XCTAssertEqual(LabDisplayConfiguration.TextSize.large.resolved(.xxxLarge), .large)
        var environment = EnvironmentValues()
        var config = LabDisplayConfiguration.standard
        config.reduceMotion = true; config.reduceTransparency = true
        environment.labDisplayConfiguration = config
        XCTAssertTrue(environment.talentSignalReduceMotion)
        XCTAssertTrue(environment.talentSignalReduceTransparency)
    }
    func testExplicitPreferenceSaveExcludesAccessibilityAndCurrentValues() {
        defaults.set("en", forKey: AppLanguage.storageKey)
        defaults.set("compact", forKey: WorkspaceCardDensityPreference.storageKey)
        defaults.set("comfortable", forKey: WorkspaceTextSizePreference.storageKey)
        var config = LabDisplayConfiguration.standard
        config.theme = .dark; config.textSize = .accessibility5; config.reduceMotion = true
        let store = LabDisplayStore(defaults: defaults, enabled: true)
        store.savePersonalPreferences(config)
        XCTAssertEqual(defaults.string(forKey: LabDisplayStore.themeKey), "dark")
        XCTAssertEqual(defaults.string(forKey: AppLanguage.storageKey), "en")
        XCTAssertEqual(defaults.string(forKey: WorkspaceCardDensityPreference.storageKey), "compact")
        XCTAssertEqual(defaults.string(forKey: WorkspaceTextSizePreference.storageKey), "comfortable")
        XCTAssertNil(defaults.data(forKey: LabDisplayStore.presetsKey))
        XCTAssertNil(store.active)
    }
    func testPreviewStatesKeepStableSyntheticIdentityAndIsolatedReview() throws {
        let base = LabPreviewFixtures.snapshot(state: .ready)
        for state in [LabPreviewState.partial, .longContent, .stale] {
            let snapshot = LabPreviewFixtures.snapshot(state: state)
            XCTAssertEqual(snapshot.people.map(\.id), base.people.map(\.id))
            XCTAssertTrue(snapshot.people.allSatisfy { $0.avatar == nil })
        }
        let review = LabOnboardingMemoryStore(startsInReview: true)
        XCTAssertEqual(try review.load()?.route, .proposalReview)
        try review.reset()
        XCTAssertNil(try review.load())
        XCTAssertEqual(try LabOnboardingMemoryStore(startsInReview: true).load()?.route, .proposalReview)
    }
}
