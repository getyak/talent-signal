import Foundation

struct DeviceCalendarProposal: Identifiable, Equatable {
    let sourceID: String
    let personDisplayName: String
    let title: String
    let startDate: Date
    let endDate: Date
    let timeZoneIdentifier: String
    let evidenceQuote: String
    let detectedDateText: String
    let durationWasExplicit: Bool

    var id: String { "\(sourceID):calendar" }
}

enum DeviceCalendarProposalDetector {
    private static let meetingTerms = [
        "面试", "会谈", "会议", "视频", "电话聊", "聊聊", "沟通",
        "interview", "meeting", "meet", "video call", "phone call",
        "zoom", "teams call",
    ]

    private static let chineseTerms = [
        "面试", "会谈", "会议", "视频", "电话聊", "聊聊", "沟通",
    ]

    static func detect(
        draft: RecognizedCaptureDraft,
        personDisplayName: String,
        sourceID: String,
        capturedAt: Date,
        now: Date = Date(),
        timeZone: TimeZone = .current
    ) -> DeviceCalendarProposal? {
        guard draft.speaker == .candidate else { return nil }
        let text = draft.reviewedText.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !text.isEmpty else { return nil }

        let normalized = text.lowercased()
        guard meetingTerms.contains(where: normalized.contains) else {
            return nil
        }

        guard let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.date.rawValue
        ) else {
            return nil
        }
        let matches = detector.matches(
            in: text,
            range: NSRange(text.startIndex..., in: text)
        )
        let earliestAllowedDate = max(capturedAt, now).addingTimeInterval(-300)
        guard let match = matches.first(where: {
            guard let date = $0.date else { return false }
            return date >= earliestAllowedDate
        }), let startDate = match.date else {
            return nil
        }

        let duration = explicitDuration(in: text)
        let eventDuration = duration?.seconds ?? 30 * 60
        let hasChineseMeetingTerm = chineseTerms.contains(where: text.contains)
        let isInterview = normalized.contains("interview") || text.contains("面试")
        let eventType: String
        if isInterview {
            eventType = hasChineseMeetingTerm ? "面试" : "Interview"
        } else {
            eventType = hasChineseMeetingTerm ? "会谈" : "Conversation"
        }

        return DeviceCalendarProposal(
            sourceID: sourceID,
            personDisplayName: personDisplayName,
            title: "\(eventType) · \(personDisplayName)",
            startDate: startDate,
            endDate: startDate.addingTimeInterval(eventDuration),
            timeZoneIdentifier: timeZone.identifier,
            evidenceQuote: focusedEvidence(
                in: text,
                around: match.range
            ),
            detectedDateText: (text as NSString).substring(with: match.range),
            durationWasExplicit: duration != nil
        )
    }

    private static func explicitDuration(
        in text: String
    ) -> (seconds: TimeInterval, range: NSRange)? {
        let patterns: [(String, TimeInterval)] = [
            (#"(?i)(\d{1,3})\s*(?:分钟|mins?|minutes?)"#, 60),
            (#"(?i)(\d{1,2})\s*(?:小时|hours?|hrs?)"#, 60 * 60),
        ]
        let fullRange = NSRange(text.startIndex..., in: text)
        for (pattern, unit) in patterns {
            guard let expression = try? NSRegularExpression(pattern: pattern),
                  let result = expression.firstMatch(
                    in: text,
                    range: fullRange
                  ), result.numberOfRanges > 1,
                  let valueRange = Range(result.range(at: 1), in: text),
                  let value = Double(text[valueRange]), value > 0 else {
                continue
            }
            return (value * unit, result.range)
        }
        return nil
    }

    private static func focusedEvidence(
        in text: String,
        around dateRange: NSRange
    ) -> String {
        let boundaries = CharacterSet(charactersIn: "。！？!?\n")
        let sentences = text.components(separatedBy: boundaries)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let detectedDateText = (text as NSString).substring(with: dateRange)
        let sentence = sentences.first(where: {
            $0.contains(detectedDateText)
        }) ?? text
        if sentence.count <= 160 { return sentence }
        return String(sentence.prefix(157)) + "…"
    }
}
