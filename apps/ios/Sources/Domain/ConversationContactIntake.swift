import Foundation

struct ConversationContactDraft: Codable, Equatable, Sendable {
    var name: String
    var identityClue: IdentityClue?
    var relationshipContext: String
    let sourceNote: String
    var interpreter: Interpreter?
    var reviewedPublicProfile: ReviewedPublicProfile?
    var fieldEvidence: [FieldEvidence]?

    struct FieldEvidence: Codable, Equatable, Sendable {
        enum Field: String, Codable, Sendable {
            case name
            case identityClue
            case relationshipContext
        }

        let field: Field
        let exactExcerpt: String
    }

    struct IdentityClue: Codable, Equatable, Sendable {
        let type: String
        let value: String

        var label: String {
            switch type {
            case "email": return "Email"
            case "phone": return "Phone"
            case "linkedin_url": return "LinkedIn"
            case "public_profile_url": return "Public profile"
            default: return "Identity clue"
            }
        }
    }

    struct ReviewedPublicProfile: Codable, Equatable, Sendable {
        let resultID: String
        let providerID: String
        let platform: String
        let profileURL: String
        let displayName: String
        let handle: String?
        let biography: String?
        let avatarURL: String?
        let avatarDisplayPolicy: String?
        let avatarRightsBasis: String?
        let verified: Bool?
        let matchBasis: String
        let contentHash: String
        let retrievedAt: String
        var cardHeadline: String
        var includeAvatar: Bool
    }

    struct Interpreter: Codable, Equatable, Sendable {
        let name: String
        let version: String

        static let deterministic = Self(
            name: "ios-agent-contact-intake",
            version: "3.0.0"
        )
        static let foundationModel = Self(
            name: "apple-foundation-model-contact-intake",
            version: "2.0.0"
        )
        static let reviewedPublicResearch = Self(
            name: "ios-agent-public-profile-review",
            version: "1.0.0"
        )
        static let workspaceAgent = Self(
            name: "workspace-conversation-agent",
            version: "1.0.0"
        )
    }

    init(
        name: String,
        identityClue: IdentityClue?,
        relationshipContext: String,
        sourceNote: String,
        interpreter: Interpreter? = nil,
        reviewedPublicProfile: ReviewedPublicProfile? = nil,
        fieldEvidence: [FieldEvidence]? = nil
    ) {
        self.name = name
        self.identityClue = identityClue
        self.relationshipContext = relationshipContext
        self.sourceNote = sourceNote
        self.interpreter = interpreter
        self.reviewedPublicProfile = reviewedPublicProfile
        self.fieldEvidence = fieldEvidence
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
        let originalSource = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let source = input.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !shouldBypassContactIntake(source),
              !hasAmbiguousContactSubjects(source),
              let identityClue = extractIdentityClue(source) else { return nil }
        let hasExplicitIntent = hasExplicitContactIntent(source)
        let implicitName = extractUnlabeledName(source, identityClue: identityClue)
        let hasSafeImplicitIntent = !hasExplicitIntent
            && isHighPrecisionUnlabeledName(implicitName)
        guard !source.isEmpty,
              hasExplicitIntent || hasSafeImplicitIntent else { return nil }

        let name = hasExplicitIntent
            ? extractName(source, identityClue: identityClue)
            : implicitName
        guard isReadableName(name),
              let nameExcerpt = originalExcerpt(for: name, in: originalSource),
              let clueExcerpt = originalExcerpt(for: identityClue.value, in: originalSource)
        else { return nil }
        let context = extractRelationshipContext(
            source,
            identityClue: identityClue,
            allowsUnlabeledContext: hasSafeImplicitIntent
        )
        let contextExcerpt = originalExcerpt(for: context, in: originalSource)
        var evidence: [ConversationContactDraft.FieldEvidence] = [
            .init(field: .name, exactExcerpt: nameExcerpt),
            .init(field: .identityClue, exactExcerpt: clueExcerpt),
        ]
        if let contextExcerpt {
            evidence.append(.init(field: .relationshipContext, exactExcerpt: contextExcerpt))
        }

        return ConversationContactDraft(
            name: nameExcerpt,
            identityClue: identityClue,
            relationshipContext: contextExcerpt ?? "",
            sourceNote: originalSource,
            interpreter: .deterministic,
            fieldEvidence: evidence
        )
    }

    static func requiresContactClarification(_ input: String) -> Bool {
        let source = input.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !shouldBypassContactIntake(source) else { return false }
        if hasAmbiguousContactSubjects(source) { return true }
        if hasExplicitContactIntent(source) { return propose(source) == nil }
        return extractIdentityClue(source) != nil
            && !looksLikeOrdinaryQuestion(source)
            && propose(source) == nil
    }

    /// These sources remain ordinary conversation even if a model claims intake intent.
    static func shouldBypassContactIntake(_ source: String) -> Bool {
        isClearlyNonContactMutation(source)
            || looksLikeThirdPartySource(source)
            || (looksLikeOrdinaryQuestion(source) && !hasExplicitContactIntent(source))
    }

    static func hasAmbiguousContactSubjects(_ source: String) -> Bool {
        let normalized = source.precomposedStringWithCompatibilityMapping
        var identities: [ConversationContactDraft.IdentityClue] = []
        // Multiple values of one identity type cannot be assigned to one person silently.
        for (type, pattern) in [
            ("email", emailPattern), ("linkedin_url", linkedInPattern), ("phone", phonePattern),
        ] {
            let values = allMatches(pattern, in: normalized)
                .filter { pattern != phonePattern || isStablePhone($0) }
                .map { $0.lowercased() }
            if Set(values).count > 1 { return true }
            identities.append(contentsOf: values.map { .init(type: type, value: $0) })
        }
        let namedSubjects = identities.compactMap { clue -> String? in
            let candidate = extractUnlabeledName(normalized, identityClue: clue)
            return isHighPrecisionUnlabeledName(candidate)
                ? candidate.lowercased() : nil
        }
        let explicitName = extractName(normalized, identityClue: extractIdentityClue(normalized))
        let distinctNames = Set(namedSubjects + (isReadableName(explicitName) ? [explicitName.lowercased()] : []))
        if distinctNames.count > 1 {
            return true
        }
        let prefix = extractIdentityClue(normalized).flatMap { clue in
            normalized.range(of: clue.value, options: .caseInsensitive).map {
                String(normalized[..<$0.lowerBound])
            }
        } ?? normalized
        let contextRange = prefix.range(
            of: #"(?i)\s+(?:for|to|at|from|with|as)\b"#,
            options: .regularExpression
        )
        let subject = contextRange.map { String(prefix[..<$0.lowerBound]) } ?? prefix
        return matches(
            #"(?:\b[A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*){0,2}\s+(?:and|&)\s+[A-Z][\p{L}'’.-]*|[\p{Han}]{2,4}[和与及、][\p{Han}]{2,4})(?=\s|[,，;；。]|$)"#,
            in: subject
        )
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
        let source = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !shouldBypassContactIntake(source) else { return .notContact }
        guard !hasAmbiguousContactSubjects(source) else { return .needsClarification }
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
        let identityClue: ConversationContactDraft.IdentityClue
        if identityType.isEmpty || identityType == "none" {
            return hasExplicitContactIntent(source) || !identityValue.isEmpty
                ? .needsClarification : .notContact
        } else {
            guard ["email", "phone", "linkedin_url"].contains(identityType),
                  !identityValue.isEmpty,
                  containsExactText(identityValue, in: source),
                  let verifiedClue = extractIdentityClue(identityValue),
                  verifiedClue.type == identityType,
                  verifiedClue.value == (identityType == "email"
                    ? identityValue.lowercased() : identityValue) else {
                return .needsClarification
            }
            identityClue = verifiedClue
        }

        let proposedContext = output.relationshipContext
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let relationshipContext = isReadableContext(proposedContext)
            && containsExactText(proposedContext, in: source)
            && proposedContext != name
            && !proposedContext.contains(identityValue)
            ? proposedContext
            : ""
        var evidence: [ConversationContactDraft.FieldEvidence] = [
            .init(field: .name, exactExcerpt: name),
            .init(field: .identityClue, exactExcerpt: identityValue),
        ]
        if !relationshipContext.isEmpty {
            evidence.append(.init(field: .relationshipContext, exactExcerpt: relationshipContext))
        }

        return .contact(
            ConversationContactDraft(
                name: name,
                identityClue: identityClue,
                relationshipContext: relationshipContext,
                sourceNote: source,
                interpreter: .foundationModel,
                fieldEvidence: evidence
            )
        )
    }

    private static func hasExplicitContactIntent(_ value: String) -> Bool {
        matches(
            #"(?i)^\s*(?:(?:please|can you|could you|would you)\s+)?(?:add|create|save|remember|new)\s+(?:a\s+)?(?:new\s+)?(?:contact\s+)?|^\s*(?:请|請|帮我|幫我)?(?:添加|新增|新建|创建|創建|保存|记下|記下)(?:一个|一個|一位)?(?:联系人|聯絡人)?"#,
            in: value
        )
    }

    private static let emailPattern = #"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"#
    private static let linkedInPattern = #"(?i)https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Z0-9_%\-./]+"#
    private static let phonePattern = #"(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)"#

    private static func extractIdentityClue(_ value: String) -> ConversationContactDraft.IdentityClue? {
        if let email = firstMatch(emailPattern, in: value) {
            return .init(type: "email", value: email.lowercased())
        }
        if let linkedIn = firstMatch(linkedInPattern, in: value) {
            return .init(type: "linkedin_url", value: linkedIn)
        }
        if let phone = allMatches(phonePattern, in: value).first(where: isStablePhone) {
            return .init(type: "phone", value: phone.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }

    private static func isStablePhone(_ value: String) -> Bool {
        let digits = value.filter(\.isNumber)
        guard (8...15).contains(digits.count),
              !value.contains("\n"),
              !matches(#"^\d{4}[-./]\d{1,2}[-./]\d{1,2}$"#, in: value),
              !matches(#"^\d{1,2}[-./]\d{1,2}[-./]\d{4}$"#, in: value)
        else { return false }
        return true
    }

    private static func extractName(
        _ value: String,
        identityClue: ConversationContactDraft.IdentityClue?
    ) -> String {
        let patterns = [
            #"(?i)(?:^|[\s,])(?:add|create|save|remember|new)\s+(?:a\s+)?(?:new\s+)?(?:contact\s+)?([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,3}?)(?=\s+(?:for|to|at|from|with|as)\b|\s*[,，。;；]|$)"#,
            #"(?:添加|新增|新建|创建|創建|保存|记下|記下)(?:一个|一個|一位)?(?:联系人|聯絡人)?[：:\s]*([\p{Han}]{2,8}|[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3})(?=[，。,；;\s]|$)"#,
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
        for (index, pattern) in patterns.enumerated() {
            guard let captured = captureGroup(pattern, in: value, group: 1) else { continue }
            var cleaned = captured.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned = cleaned.replacingOccurrences(
                of: #"(?i)\s+(?:search|role|position)$"#,
                with: "",
                options: .regularExpression
            )
            let beforeIdentity = identityClue.flatMap { clue in
                value.range(of: clue.value, options: .caseInsensitive).map {
                    String(value[..<$0.lowerBound])
                }
            } ?? ""
            if isReadableContext(cleaned),
               index != 0 || containsExactText(cleaned, in: beforeIdentity)
                    || looksLikeRelationshipContext(cleaned) {
                return cleaned
            }
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
               looksLikeRelationshipContext(firstSegment),
               !disallowedPrefixes.contains(where: {
                   firstSegment.lowercased().hasPrefix($0)
               }) {
                return firstSegment
            }
        }
        return ""
    }

    private static func isReadableName(_ value: String) -> Bool {
        let normalized = value.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty, normalized.count <= 80,
              matches(#"^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,3}$"#, in: value)
        else { return false }
        guard !matches(#"(?i)\b(?:and|or)\b|、|表示|提到"#, in: value)
        else { return false }
        if ["for ", "to ", "at ", "from ", "with ", "as ", "met ", "meet ", "spoke ", "talked "].contains(
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
            "referred ", "add ", "create ", "save ", "new ", "please ",
            "认识", "见到", "见了", "刚聊", "聊了", "添加", "新增", "新建",
            "创建", "創建", "保存", "记下", "記下", "请", "請", "帮我", "幫我",
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
            && !["general relationship", "unknown", "none", "n/a", "一般关系", "未知"]
                .contains(trimmed.lowercased())
            && extractIdentityClue(trimmed) == nil
    }

    private static func looksLikeRelationshipContext(_ value: String) -> Bool {
        matches(
            #"(?i)\b(?:search|role|position|chief|officer|director|manager|engineer|designer|founder|cofounder|recruit|candidate|client|customer|colleague|friend|mentor|partner|project|team|finance|design|growth|product|sales|marketing|hiring|collaborat\w*|leadership)\b|搜索|职位|岗位|候选|招聘|负责人|总监|经理|工程师|设计|产品|项目|客户|同事|朋友|合作|校友|导师|创业"#,
            in: value
        )
    }

    private static func looksLikeThirdPartySource(_ value: String) -> Bool {
        matches(
            #"(?im)^\s*(?:[>\"“「『]|forwarded\b|quoted\b|(?:message|text|email)\s+from\b|(?:转发|轉發|引用|聊天记录|聊天記錄|对方说|對方說))|\b(?:said|says|wrote|writes|told me|asked me|reported)(?=\s|[:：\"“])|(?:说|說|表示|提到|写道|寫道)[：:]|[\p{Han}]{2,4}(?:说|說|告诉我|告訴我|提到|表示)|^\s*[\p{L}][\p{L}\s.'’\-]{1,40}[:：]\s*(?:add|create|save|remember|添加|新增|保存|记下)"#,
            in: value
        )
    }

    private static func looksLikeOrdinaryQuestion(_ value: String) -> Bool {
        matches(
            #"(?i)^\s*(?:who|what|when|where|why|how|can|could|would|should|is|are|do|does|did|check|find|search|look up)\b|^\s*(?:谁|什么|何时|哪里|为什么|怎么|如何|能否|是否|请问|帮我查|幫我查|查找|搜索)|[?？]\s*$"#,
            in: value
        )
    }

    private static func originalExcerpt(for value: String, in source: String) -> String? {
        guard !value.isEmpty,
              let range = source.range(of: value, options: [.caseInsensitive, .widthInsensitive])
        else { return nil }
        return String(source[range])
    }

    private static func allMatches(_ pattern: String, in value: String) -> [String] {
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return [] }
        return expression.matches(in: value, range: NSRange(value.startIndex..., in: value))
            .compactMap { Range($0.range, in: value).map { String(value[$0]) } }
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
