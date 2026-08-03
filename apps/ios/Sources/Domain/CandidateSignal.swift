import Foundation

struct EvidenceFact: Identifiable, Equatable {
    let id = UUID()
    let label: String
    let value: String
}
enum SignalVerdict: String, Equatable {
    case advance = "Advance"
    case resolveBlocker = "Resolve blocker"
    case atRisk = "At risk"
    case wait = "Wait"

    static func derive(deadlineDays: Int?, hasUnresolvedConstraint: Bool) -> SignalVerdict {
        if let deadlineDays, deadlineDays <= 3, hasUnresolvedConstraint {
            return .atRisk
        }

        if hasUnresolvedConstraint {
            return .resolveBlocker
        }

        if deadlineDays != nil {
            return .advance
        }

        return .wait
    }
}

struct CandidateSignal: Equatable {
    let name: String
    let role: String
    let facts: [EvidenceFact]
    let deadlineDays: Int?
    let hasUnresolvedConstraint: Bool
    let nextAction: String

    var verdict: SignalVerdict {
        SignalVerdict.derive(
            deadlineDays: deadlineDays,
            hasUnresolvedConstraint: hasUnresolvedConstraint
        )
    }

    static let sample = CandidateSignal(
        name: "Alex Chen",
        role: "Staff Product Designer",
        facts: [
            EvidenceFact(label: "Decision window", value: "Wednesday"),
            EvidenceFact(label: "Availability", value: "Tuesday afternoon"),
            EvidenceFact(label: "Constraint", value: "Remote work is important")
        ],
        deadlineDays: 2,
        hasUnresolvedConstraint: true,
        nextAction: "Confirm the remote-work policy before scheduling another interview."
    )
}
