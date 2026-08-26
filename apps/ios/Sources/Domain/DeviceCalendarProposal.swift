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
    private struct DetectedDate {
        let date: Date
        let range: NSRange
    }

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

        let earliestAllowedDate = max(capturedAt, now).addingTimeInterval(-300)
        guard let match = detectedDates(in: text, timeZone: timeZone)
            .first(where: { $0.date >= earliestAllowedDate }) else {
            return nil
        }
        let startDate = match.date

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

    private static func detectedDates(
        in text: String,
        timeZone: TimeZone
    ) -> [DetectedDate] {
        let chineseDates = chineseDetectedDates(in: text, timeZone: timeZone)
        guard let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.date.rawValue
        ) else {
            return chineseDates
        }
        let detectorDates = detector.matches(
            in: text,
            range: NSRange(text.startIndex..., in: text)
        ).compactMap { match -> DetectedDate? in
            guard !chineseDates.contains(where: {
                NSIntersectionRange($0.range, match.range).length > 0
            }), let date = dateFromDetectorMatch(match, timeZone: timeZone) else {
                return nil
            }
            return DetectedDate(date: date, range: match.range)
        }
        return (chineseDates + detectorDates).sorted {
            $0.range.location < $1.range.location
        }
    }

    private static func dateFromDetectorMatch(
        _ match: NSTextCheckingResult,
        timeZone: TimeZone
    ) -> Date? {
        guard let date = match.date else { return nil }
        if match.timeZone != nil {
            return date
        }

        // NSDataDetector interprets wall-clock text in the runner's timezone.
        // Rebuild those components in the capture timezone so CI and devices
        // produce the same proposal for text that does not name a timezone.
        var detectorCalendar = Calendar(identifier: .gregorian)
        detectorCalendar.timeZone = .current
        let components = detectorCalendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: date
        )
        var captureCalendar = Calendar(identifier: .gregorian)
        captureCalendar.timeZone = timeZone
        return captureCalendar.date(from: components)
    }

    private static func chineseDetectedDates(
        in text: String,
        timeZone: TimeZone
    ) -> [DetectedDate] {
        let pattern = #"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?\s*(上午|下午|晚上|中午|凌晨)?\s*(\d{1,2})(?:点|时)(?:(\d{1,2})分?)?"#
        guard let expression = try? NSRegularExpression(pattern: pattern) else {
            return []
        }
        let fullRange = NSRange(text.startIndex..., in: text)
        return expression.matches(in: text, range: fullRange).compactMap { match in
            guard let year = integerCapture(1, from: match, in: text),
                  let month = integerCapture(2, from: match, in: text),
                  let day = integerCapture(3, from: match, in: text),
                  var hour = integerCapture(5, from: match, in: text) else {
                return nil
            }
            let minute = integerCapture(6, from: match, in: text) ?? 0
            if let period = stringCapture(4, from: match, in: text) {
                if ["下午", "晚上", "中午"].contains(period), hour < 12 {
                    hour += 12
                } else if ["上午", "凌晨"].contains(period), hour == 12 {
                    hour = 0
                }
            }

            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = timeZone
            var components = DateComponents()
            components.timeZone = timeZone
            components.year = year
            components.month = month
            components.day = day
            components.hour = hour
            components.minute = minute
            guard let date = calendar.date(from: components) else { return nil }
            let validated = calendar.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: date
            )
            guard validated.year == year,
                  validated.month == month,
                  validated.day == day,
                  validated.hour == hour,
                  validated.minute == minute else {
                return nil
            }
            return DetectedDate(date: date, range: match.range)
        }
    }

    private static func integerCapture(
        _ index: Int,
        from match: NSTextCheckingResult,
        in text: String
    ) -> Int? {
        guard let value = stringCapture(index, from: match, in: text) else {
            return nil
        }
        return Int(value)
    }

    private static func stringCapture(
        _ index: Int,
        from match: NSTextCheckingResult,
        in text: String
    ) -> String? {
        let range = match.range(at: index)
        guard range.location != NSNotFound else { return nil }
        return (text as NSString).substring(with: range)
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
