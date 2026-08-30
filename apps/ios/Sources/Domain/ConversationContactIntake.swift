import Foundation

struct ConversationContactDraft: Codable, Equatable, Sendable {
    var name: String
    var identityClue: IdentityClue?
    var relationshipContext: String
    let sourceNote: String
    var interpreter: Interpreter?

    struct IdentityClue: Codable, Equatable, Sendable {
        let type: String
        let value: String

        var label: String {
            switch type {
            case "email": return "Email"
            case "phone": return "Phone"
            case "linkedin_url": return "LinkedIn"
            default: return "Identity clue"
            }
        }
    }

    struct Interpreter: Codable, Equatable, Sendable {
        let name: String
        let version: String

        static let deterministic = Self(
            name: "ios-agent-contact-intake",
            version: "2.0.0"
        )
        static let foundationModel = Self(
            name: "apple-foundation-model-contact-intake",
            version: "1.0.0"
        )
    }

    init(
        name: String,
        identityClue: IdentityClue?,
        relationshipContext: String,
        sourceNote: String,
        interpreter: Interpreter? = nil
    ) {
        self.name = name
        self.identityClue = identityClue
        self.relationshipContext = relationshipContext
        self.sourceNote = sourceNote
        self.interpreter = interpreter
    }
}

struct ConversationContactModelOutput: Equatable, Sendable {
    let isContactIntent: Bool
    let name: String
    let identityType: String
    let identityValue: String
    let relationshipContext: String
}

enum ConversationContactInterpretation: Equatable, Sendable {
    case contact(ConversationContactDraft)
    case notContact
    case needsClarification
}

enum ConversationContactTarget: Codable, Equatable, Sendable {
    case newPerson
    case existingPerson(personID: String, relationshipContextID: String?)
    case unresolved
}

enum ConversationContactLookupPhase: Equatable {
    case idle
    case checking
    case complete
    case failed(String)
}

enum ConversationContactMatchPolicy {
    static func authoritativeMatches(
        in people: [WorkspacePerson]
    ) -> [WorkspacePerson] {
        people.filter { person in
            person.identityMatches.contains {
                $0.kind == "confirmed_handle" || $0.kind == "expired_handle"
            }
        }
    }

    static func sameNameReview(
        for draft: ConversationContactDraft,
        in people: [WorkspacePerson]
    ) -> [WorkspacePerson] {
        let target = normalizedName(draft.name)
        guard !target.isEmpty else { return [] }
        return people.filter { normalizedName($0.displayLabel) == target }
    }

    static func currentMatches(
        in people: [WorkspacePerson]
    ) -> [WorkspacePerson] {
        people.filter { person in
            person.identityMatches.contains { $0.kind == "confirmed_handle" }
        }
    }

    static func historicalMatches(
        in people: [WorkspacePerson]
    ) -> [WorkspacePerson] {
        people.filter { person in
            person.identityMatches.contains { $0.kind == "expired_handle" }
        }
    }

    static func hasCurrentHistoricalConflict(
        in people: [WorkspacePerson]
    ) -> Bool {
        !currentMatches(in: people).isEmpty
            && !historicalMatches(in: people).isEmpty
    }

    static func canSelect(
        _ person: WorkspacePerson,
        among people: [WorkspacePerson]
    ) -> Bool {
        if !currentMatches(in: people).isEmpty,
           person.identityMatches.contains(where: { $0.kind == "expired_handle" }) {
            return false
        }
        return true
    }

    private static func normalizedName(_ value: String) -> String {
        value.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: .current
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

enum ConversationContactIntake {
    static func identityClue(in input: String) -> ConversationContactDraft.IdentityClue? {
        extractIdentityClue(
            input.precomposedStringWithCompatibilityMapping
                .trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    static func propose(_ input: String) -> ConversationContactDraft? {
        let source = input.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isClearlyNonContactMutation(source) else { return nil }
        let identityClue = extractIdentityClue(source)
        let hasExplicitIntent = hasExplicitContactIntent(source)
        let implicitName = identityClue.flatMap {
            extractUnlabeledName(source, identityClue: $0)
        } ?? ""
        let hasSafeImplicitIntent = !hasExplicitIntent
            && identityClue != nil
            && !looksLikeOrdinaryQuestion(source)
            && isHighPrecisionUnlabeledName(implicitName)
        guard !source.isEmpty,
              hasExplicitIntent || hasSafeImplicitIntent else { return nil }

        let name = hasExplicitIntent
            ? extractName(source, identityClue: identityClue)
            : implicitName
        guard isReadableName(name) else { return nil }

        return ConversationContactDraft(
            name: name,
            identityClue: identityClue,
            relationshipContext: extractRelationshipContext(
                source,
                identityClue: identityClue,
                allowsUnlabeledContext: hasSafeImplicitIntent
            ),
            sourceNote: source,
            interpreter: .deterministic
        )
    }

    static func requiresContactClarification(_ input: String) -> Bool {
        let source = input.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isClearlyNonContactMutation(source) else { return false }
        if hasExplicitContactIntent(source) { return propose(source) == nil }
        return extractIdentityClue(source) != nil
            && !looksLikeOrdinaryQuestion(source)
            && propose(source) == nil
    }

    static func isClearlyNonContactMutation(_ input: String) -> Bool {
        let source = input.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return matches(
            #"(?i)(?:^|[\s,，。])(?:add|create|save|remember|new)\s+(?:(?:a|an|the)\s+)?(?:calendar|event|meeting|interview|reminder)\b|(?:添加|新增|新建|创建|創建|保存|记下|記下)(?:一个|一個|一位)?(?:对应的|對應的)?(?:日历|日曆|日程|会议|會議|面试|面試|活动|活動|提醒)"#,
            in: source
        )
    }

    static func validatedModelDraft(
        from output: ConversationContactModelOutput,
        source input: String
    ) -> ConversationContactInterpretation {
        let source = input.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard output.isContactIntent else { return .notContact }

        let name = output.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isReadableName(name), containsExactText(name, in: source) else {
            return .needsClarification
        }

        let identityType = output.identityType
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let identityValue = output.identityValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let identityClue: ConversationContactDraft.IdentityClue?
        if identityType.isEmpty || identityType == "none" {
            guard identityValue.isEmpty else { return .needsClarification }
            identityClue = nil
        } else {
            guard ["email", "phone", "linkedin_url"].contains(identityType),
                  !identityValue.isEmpty,
                  containsExactText(identityValue, in: source) else {
                return .needsClarification
            }
            identityClue = .init(
                type: identityType,
                value: identityType == "email"
                    ? identityValue.lowercased()
                    : identityValue
            )
        }

        let proposedContext = output.relationshipContext
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let relationshipContext = isReadableContext(proposedContext)
            && containsExactText(proposedContext, in: source)
            ? proposedContext
            : "General relationship"

        return .contact(
            ConversationContactDraft(
                name: name,
                identityClue: identityClue,
                relationshipContext: relationshipContext,
                sourceNote: source,
                interpreter: .foundationModel
            )
        )
    }

    private static func hasExplicitContactIntent(_ value: String) -> Bool {
        matches(
            #"(?i)(?:^|[\s,，。])(?:add|create|save|remember|new)\s+(?:a\s+)?(?:new\s+)?(?:contact\s+)?|(?:添加|新增|新建|创建|保存|记下)(?:一个|一位)?(?:联系人)?"#,
            in: value
        )
    }

    private static func extractIdentityClue(_ value: String) -> ConversationContactDraft.IdentityClue? {
        if let email = firstMatch(
            #"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"#,
            in: value
        ) {
            return .init(type: "email", value: email.lowercased())
        }
        if let linkedIn = firstMatch(
            #"(?i)https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Z0-9_%\-./]+"#,
            in: value
        ) {
            return .init(type: "linkedin_url", value: linkedIn)
        }
        if let phone = firstMatch(
            #"(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)"#,
            in: value
        ) {
            return .init(type: "phone", value: phone.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }

    private static func extractName(
        _ value: String,
        identityClue: ConversationContactDraft.IdentityClue?
    ) -> String {
        let patterns = [
            #"(?i)(?:^|[\s,])(?:add|create|save|remember|new)\s+(?:a\s+)?(?:new\s+)?(?:contact\s+)?([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,3}?)(?=\s+(?:for|to|at|from|with|as)\b|\s*[,，。;；]|$)"#,
            #"(?:添加|新增|新建|创建|保存|记下)(?:一个|一位)?(?:联系人)?[：:\s]*([\p{Han}]{2,8}|[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3})(?=[，。,；;\s]|$)"#,
        ]
        for pattern in patterns {
            if let captured = captureGroup(pattern, in: value, group: 1) {
                let cleaned = captured.trimmingCharacters(in: .whitespacesAndNewlines)
                if !cleaned.isEmpty { return cleaned }
            }
        }
        if let identityClue {
            let prefix = value.replacingOccurrences(of: identityClue.value, with: "")
            for pattern in patterns {
                if let captured = captureGroup(pattern, in: prefix, group: 1) {
                    return captured.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
        }
        return ""
    }

    private static func extractUnlabeledName(
        _ value: String,
        identityClue: ConversationContactDraft.IdentityClue
    ) -> String {
        guard let clueRange = value.range(
            of: identityClue.value,
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive]
        ) else { return "" }
        var prefix = String(value[..<clueRange.lowerBound])
        prefix = prefix.replacingOccurrences(
            of: #"(?i)(?:email|e-mail|phone|mobile|linkedin|邮箱|邮件|电话|手机)\s*[:：]?\s*$"#,
            with: "",
            options: .regularExpression
        )
        prefix = prefix.trimmingCharacters(
            in: CharacterSet.whitespacesAndNewlines.union(
                CharacterSet(charactersIn: ",，;；-—:：。")
            )
        )
        let components = prefix.components(
            separatedBy: CharacterSet(charactersIn: ",，;；\n")
        )
        return (components.last ?? prefix).trimmingCharacters(
            in: CharacterSet.whitespacesAndNewlines.union(
                CharacterSet(charactersIn: "-—:：。")
            )
        )
    }

    private static func extractRelationshipContext(
        _ value: String,
        identityClue: ConversationContactDraft.IdentityClue?,
        allowsUnlabeledContext: Bool
    ) -> String {
        let patterns = [
            #"(?i)\bfor\s+(?:the\s+)?(.+?)(?=\s*[,，。;；]|\s+(?:email|phone|referred|introduced|available|open)\b|$)"#,
            #"(?:用于|加入|放到|归入|对应)[：:\s]*([^，。,；;]+)"#,
            #"(?:岗位|职位|项目|搜索)[：:\s]*([^，。,；;]+)"#,
        ]
        for pattern in patterns {
            guard let captured = captureGroup(pattern, in: value, group: 1) else { continue }
            var cleaned = captured.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned = cleaned.replacingOccurrences(
                of: #"(?i)\s+(?:search|role|position)$"#,
                with: "",
                options: .regularExpression
            )
            if !cleaned.isEmpty { return cleaned }
        }
        if allowsUnlabeledContext,
           let identityClue,
           let clueRange = value.range(
                of: identityClue.value,
                options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive]
           ) {
            let suffix = String(value[clueRange.upperBound...])
                .trimmingCharacters(
                    in: CharacterSet.whitespacesAndNewlines.union(
                        CharacterSet(charactersIn: ",，;；。-—:：")
                    )
                )
            let firstSegment = suffix.components(
                separatedBy: CharacterSet(charactersIn: ",，;；。\n")
            ).first?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let disallowedPrefixes = [
                "referred", "introduced", "met ", "available", "phone", "email",
                "推荐", "介绍", "下周", "可聊", "电话", "邮箱",
            ]
            if isReadableContext(firstSegment),
               !disallowedPrefixes.contains(where: {
                   firstSegment.lowercased().hasPrefix($0)
               }) {
                return firstSegment
            }
        }
        return "General relationship"
    }

    private static func isReadableName(_ value: String) -> Bool {
        let normalized = value.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return false }
        if ["for ", "to ", "at ", "from ", "with ", "as "].contains(
            where: { normalized.hasPrefix($0) }
        ) {
            return false
        }
        return ![
            "a contact", "contact", "a person", "person", "someone",
            "new contact", "this person", "that person", "this contact",
            "that contact", "联系人", "一个联系人", "一位联系人",
            "这个人", "那个人", "这位联系人", "那位联系人",
        ].contains(normalized)
    }

    private static func isHighPrecisionUnlabeledName(_ value: String) -> Bool {
        let normalized = value.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let narrativePrefixes = [
            "met ", "meet ", "spoke ", "talked ", "remember ", "introduced ",
            "referred ", "认识", "见到", "见了", "刚聊", "聊了",
        ]
        guard !narrativePrefixes.contains(where: { normalized.hasPrefix($0) }) else {
            return false
        }
        return matches(#"^[\p{Han}]{2,8}$"#, in: value)
            || matches(
                #"^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){1,3}$"#,
                in: value
            )
    }

    private static func isReadableContext(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.count <= 120
    }

    private static func looksLikeOrdinaryQuestion(_ value: String) -> Bool {
        matches(
            #"(?i)^\s*(?:who|what|when|where|why|how|can|could|would|should|is|are|do|does|did|check|find)\b|^\s*(?:谁|什么|何时|哪里|为什么|怎么|如何|能否|是否|请问|帮我查)"#,
            in: value
        )
    }

    private static func containsExactText(_ needle: String, in value: String) -> Bool {
        guard !needle.isEmpty else { return false }
        return value.range(of: needle, options: .literal) != nil
    }

    private static func matches(_ pattern: String, in value: String) -> Bool {
        firstMatch(pattern, in: value) != nil
    }

    private static func firstMatch(_ pattern: String, in value: String) -> String? {
        captureGroup(pattern, in: value, group: 0)
    }

    private static func captureGroup(
        _ pattern: String,
        in value: String,
        group: Int
    ) -> String? {
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        guard let match = expression.firstMatch(in: value, range: range),
              group < match.numberOfRanges,
              let captureRange = Range(match.range(at: group), in: value) else {
            return nil
        }
        return String(value[captureRange])
    }
}
