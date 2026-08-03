import XCTest
@testable import TalentSignal

final class CandidateSignalTests: XCTestCase {
    func testNearDeadlineWithConstraintIsAtRisk() {
        XCTAssertEqual(
            SignalVerdict.derive(deadlineDays: 2, hasUnresolvedConstraint: true),
            .atRisk
        )
    }

    func testConstraintWithoutDeadlineNeedsResolution() {
        XCTAssertEqual(
            SignalVerdict.derive(deadlineDays: nil, hasUnresolvedConstraint: true),
            .resolveBlocker
        )
    }

    func testKnownDeadlineWithoutConstraintCanAdvance() {
        XCTAssertEqual(
            SignalVerdict.derive(deadlineDays: 5, hasUnresolvedConstraint: false),
            .advance
        )
    }
}
