import Contacts
import CryptoKit
import Foundation

enum AgentProfilePlatform: String, Codable, CaseIterable, Identifiable, Sendable {
    case linkedIn = "linkedin"
    case github
    case x
    case instagram
    case telegram
    case whatsApp = "whatsapp"
    case weChat = "wechat"
    case website

    var id: String { rawValue }

    var title: String {
        switch self {
        case .linkedIn: return "LinkedIn"
        case .github: return "GitHub"
        case .x: return "X"
        case .instagram: return "Instagram"
        case .telegram: return "Telegram"
        case .whatsApp: return "WhatsApp"
        case .weChat: return "WeChat"
        case .website: return "Website"
        }
    }

    var systemImage: String {
        switch self {
        case .linkedIn, .github, .x, .instagram: return "person.text.rectangle"
        case .telegram, .whatsApp, .weChat: return "message"
        case .website: return "globe"
        }
    }

    var example: String {
        switch self {
        case .linkedIn: return "linkedin.com/in/your-name"
        case .github: return "github.com/your-name"
        case .x: return "@your_name"
        case .instagram: return "@your.name"
        case .telegram: return "@your_name"
        case .whatsApp: return "+1 415 555 0100"
        case .weChat: return "your_wechat_id"
        case .website: return "https://your-site.example"
        }
    }

    func normalize(_ input: String) throws -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw AgentProfileReferenceError.empty }
        guard trimmed.count <= 2_048 else {
            throw AgentProfileReferenceError.invalidValue
        }

        switch self {
        case .linkedIn:
            return try normalizeHandleOrURL(
                trimmed,
                baseURL: "https://www.linkedin.com/in/",
                allowedHosts: ["linkedin.com", "linkedin.cn"],
                requiredPathPrefix: "/in/",
                pathComponentCount: 2,
                handlePattern: #"^[A-Za-z0-9_-]{2,100}$"#
            )
        case .github:
            return try normalizeHandleOrURL(
                trimmed,
                baseURL: "https://github.com/",
                allowedHosts: ["github.com"],
                requiredPathPrefix: "/",
                pathComponentCount: 1,
                handlePattern: #"^[A-Za-z0-9-]{1,39}$"#
            )
        case .x:
            return try normalizeHandleOrURL(
                trimmed,
                baseURL: "https://x.com/",
                allowedHosts: ["x.com", "twitter.com"],
                requiredPathPrefix: "/",
                pathComponentCount: 1,
                handlePattern: #"^[A-Za-z0-9_]{1,15}$"#
            )
        case .instagram:
            return try normalizeHandleOrURL(
                trimmed,
                baseURL: "https://www.instagram.com/",
                allowedHosts: ["instagram.com"],
                requiredPathPrefix: "/",
                pathComponentCount: 1,
                handlePattern: #"^[A-Za-z0-9._]{1,30}$"#
            )
        case .telegram:
            return try normalizeHandleOrURL(
                trimmed,
                baseURL: "https://t.me/",
                allowedHosts: ["t.me", "telegram.me"],
                requiredPathPrefix: "/",
                pathComponentCount: 1,
                handlePattern: #"^[A-Za-z0-9_]{5,32}$"#
            )
        case .whatsApp:
            if trimmed.lowercased().contains("wa.me/") {
                let normalized = try sanitizedHTTPSURL(trimmed, allowedHosts: ["wa.me"])
                guard let url = URL(string: normalized),
                      url.path.split(separator: "/").count == 1,
                      (7...15).contains(url.path.filter(\.isNumber).count),
                      url.path.dropFirst().allSatisfy(\.isNumber) else {
                    throw AgentProfileReferenceError.invalidValue
                }
                return normalized
            }
            guard ContactImportRecord.isValidPhone(trimmed) else {
                throw AgentProfileReferenceError.invalidValue
            }
            let digits = trimmed.filter(\.isNumber)
            return "https://wa.me/\(digits)"
        case .weChat:
            guard trimmed.range(
                of: #"^[A-Za-z][A-Za-z0-9_-]{1,63}$"#,
                options: .regularExpression
            ) != nil else {
                throw AgentProfileReferenceError.invalidValue
            }
            return trimmed
        case .website:
            return try sanitizedHTTPSURL(trimmed, allowedHosts: nil)
        }
    }

    private func normalizeHandleOrURL(
        _ input: String,
        baseURL: String,
        allowedHosts: [String],
        requiredPathPrefix: String,
        pathComponentCount: Int,
        handlePattern: String
    ) throws -> String {
        if input.contains("://") || input.contains("/") {
            let normalized = try sanitizedHTTPSURL(input, allowedHosts: allowedHosts)
            guard let url = URL(string: normalized) else {
                throw AgentProfileReferenceError.invalidValue
            }
            let pathComponents = url.path.split(separator: "/")
            guard url.path.lowercased().hasPrefix(requiredPathPrefix),
                  url.path.count > requiredPathPrefix.count,
                  pathComponents.count == pathComponentCount,
                  let encodedHandle = pathComponents.last,
                  let handle = String(encodedHandle).removingPercentEncoding,
                  handle.range(of: handlePattern, options: .regularExpression) != nil else {
                throw AgentProfileReferenceError.invalidValue
            }
            return normalized
        }
        let handle = input.hasPrefix("@") ? String(input.dropFirst()) : input
        guard handle.range(of: handlePattern, options: .regularExpression) != nil else {
            throw AgentProfileReferenceError.invalidValue
        }
        return baseURL + handle
    }

    private func sanitizedHTTPSURL(
        _ input: String,
        allowedHosts: [String]?
    ) throws -> String {
        let candidate = input.contains("://") ? input : "https://\(input)"
        guard var components = URLComponents(string: candidate),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(),
              !host.isEmpty,
              components.user == nil,
              components.password == nil else {
            throw AgentProfileReferenceError.invalidValue
        }
        if let allowedHosts,
           !allowedHosts.contains(where: { host == $0 || host.hasSuffix(".\($0)") }) {
            throw AgentProfileReferenceError.wrongPlatform
        }
        components.scheme = "https"
        components.host = host
        components.query = nil
        components.fragment = nil
        if components.path.count > 1, components.path.hasSuffix("/") {
            components.path.removeLast()
        }
        guard let result = components.url?.absoluteString else {
            throw AgentProfileReferenceError.invalidValue
        }
        return result
    }
}

enum AgentProfileReferenceError: LocalizedError, Equatable, Sendable {
    case empty
    case invalidValue
    case wrongPlatform

    var errorDescription: String? {
        switch self {
        case .empty: return "Enter a profile link or handle."
        case .invalidValue: return "This link or handle is not valid for that platform."
        case .wrongPlatform: return "This link belongs to a different platform."
        }
    }
}

struct AgentProfileReference: Codable, Equatable, Identifiable, Sendable {
    let platform: AgentProfilePlatform
    let value: String
    let updatedAt: Date

    var id: String { platform.rawValue }

    init(
        platform: AgentProfilePlatform,
        value: String,
        updatedAt: Date = Date()
    ) throws {
        self.platform = platform
        self.value = try platform.normalize(value)
        self.updatedAt = updatedAt
    }

    var url: URL? {
        guard value.lowercased().hasPrefix("https://") else { return nil }
        return URL(string: value)
    }
}

enum AgentProfileReferenceCodec {
    static func decode(_ data: Data?) -> [AgentProfileReference] {
        guard let data,
              let decoded = try? JSONDecoder().decode(
                  [AgentProfileReference].self,
                  from: data
              ) else { return [] }
        var seen = Set<AgentProfilePlatform>()
        return decoded
            .sorted { $0.updatedAt < $1.updatedAt }
            .reversed()
            .filter { seen.insert($0.platform).inserted }
            .sorted { $0.platform.title < $1.platform.title }
    }

    static func encode(_ references: [AgentProfileReference]) throws -> Data {
        try JSONEncoder().encode(references)
    }

    static func upserting(
        _ reference: AgentProfileReference,
        in references: [AgentProfileReference]
    ) -> [AgentProfileReference] {
        (references.filter { $0.platform != reference.platform } + [reference])
            .sorted { $0.platform.title < $1.platform.title }
    }
}

enum ContactImportSourceKind: String, Equatable, Identifiable, Sendable {
    case contactsFile
    case linkedInConnections

    var id: String { rawValue }
}

struct ContactImportDraft: Equatable, Identifiable, Sendable {
    let sourceKind: ContactImportSourceKind
    let fileName: String
    let contentHash: String
    let importedAt: Date
    let records: [ContactImportRecord]
    let unmappedColumns: [String]

    var id: String { "\(sourceKind.rawValue):\(contentHash)" }
    var reviewableCount: Int { records.filter(\.isReviewable).count }
    var blockedCount: Int { records.count - reviewableCount }
}

struct ContactImportRecord: Equatable, Identifiable, Sendable {
    let id: String
    let rowNumber: Int
    let displayName: String
    let organization: String?
    let jobTitle: String?
    let email: String?
    let phone: String?
    let profileURL: String?
    let warnings: [ContactImportWarning]
    var duplicateOfRow: Int?

    var isReviewable: Bool {
        !displayName.isEmpty && duplicateOfRow == nil
    }

    var identityClue: ConversationContactDraft.IdentityClue? {
        if let email, Self.isValidEmail(email) {
            return .init(type: "email", value: email)
        }
        if let phone, Self.isValidPhone(phone) {
            return .init(type: "phone", value: phone)
        }
        if let profileURL,
           Self.isValidHTTPSProfileURL(profileURL),
           let url = URL(string: profileURL) {
            let type = url.host?.lowercased().contains("linkedin.") == true
                ? "linkedin_url"
                : "public_profile_url"
            return .init(type: type, value: profileURL)
        }
        return nil
    }

    func contactDraft(
        displayName editedName: String,
        relationshipContext: String,
        fileName: String
    ) -> ConversationContactDraft {
        var reviewedFields = ["Name: \(editedName)"]
        if let organization { reviewedFields.append("Organization: \(organization)") }
        if let jobTitle { reviewedFields.append("Position: \(jobTitle)") }
        if let identityClue {
            reviewedFields.append("\(identityClue.label): \(identityClue.value)")
        }
        return ConversationContactDraft(
            name: editedName,
            identityClue: identityClue,
            relationshipContext: relationshipContext,
            sourceNote: "Reviewed import from \(fileName), row \(rowNumber). "
                + reviewedFields.joined(separator: " · "),
            interpreter: .fileImport
        )
    }

    fileprivate var exactDuplicateKey: String? {
        if let clue = identityClue {
            let trimmed = clue.value.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalized = clue.type == "phone"
                ? trimmed.filter(\.isNumber)
                : trimmed.folding(
                    options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
                    locale: Locale(identifier: "en_US_POSIX")
                )
            return "\(clue.type):\(normalized)"
        }
        return nil
    }

    fileprivate static func isValidEmail(_ value: String) -> Bool {
        value.range(
            of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    fileprivate static func isValidPhone(_ value: String) -> Bool {
        let digits = value.filter(\.isNumber)
        guard (7 ... 15).contains(digits.count) else { return false }
        let allowedPunctuation = CharacterSet(charactersIn: "+-(). ")
        return value.unicodeScalars.allSatisfy {
            CharacterSet.decimalDigits.contains($0) || allowedPunctuation.contains($0)
        }
    }

    fileprivate static func isValidHTTPSProfileURL(_ value: String) -> Bool {
        guard let components = URLComponents(string: value),
              components.scheme?.lowercased() == "https",
              components.host?.isEmpty == false,
              components.user == nil,
              components.password == nil else { return false }
        return true
    }
}

enum ContactImportWarning: String, Equatable, Hashable, Sendable {
    case missingName
    case invalidEmail
    case invalidPhone
    case insecureProfileURL
    case notesExcluded
    case exactDuplicate
}

enum ContactImportParserError: LocalizedError, Equatable, Sendable {
    case empty
    case tooLarge
    case unsupportedEncoding
    case malformedCSV
    case missingHeader
    case tooManyRows
    case tooManyColumns
    case fieldTooLarge
    case unsupportedFile
    case invalidVCard

    var errorDescription: String? {
        switch self {
        case .empty: return "The selected file is empty."
        case .tooLarge: return "Choose a contacts file smaller than 10 MB."
        case .unsupportedEncoding: return "The file encoding could not be read safely."
        case .malformedCSV: return "The CSV contains an unfinished quoted field."
        case .missingHeader: return "The contacts file needs a header row."
        case .tooManyRows: return "This first import supports up to 5,000 rows."
        case .tooManyColumns: return "This contacts file has too many columns."
        case .fieldTooLarge: return "A contact field is too large to review safely."
        case .unsupportedFile: return "Choose a CSV, tab-separated text, or vCard file."
        case .invalidVCard: return "The vCard could not be read safely."
        }
    }
}

enum ContactImportParser {
    static let maximumByteCount = 10 * 1_024 * 1_024
    static let maximumRecordCount = 5_000
    static let maximumColumnCount = 200
    static let maximumFieldCharacterCount = 2_000

    static func parse(
        data: Data,
        fileName: String,
        sourceKind: ContactImportSourceKind,
        importedAt: Date = Date()
    ) throws -> ContactImportDraft {
        guard !data.isEmpty else { throw ContactImportParserError.empty }
        guard data.count <= maximumByteCount else { throw ContactImportParserError.tooLarge }
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let safeFileName = sanitizedFileName(fileName)
        let lowercasedName = safeFileName.lowercased()
        if lowercasedName.hasSuffix(".vcf") || lowercasedName.hasSuffix(".vcard") {
            return try parseVCard(
                data: data,
                fileName: safeFileName,
                sourceKind: sourceKind,
                contentHash: hash,
                importedAt: importedAt
            )
        }
        guard lowercasedName.hasSuffix(".csv")
                || lowercasedName.hasSuffix(".tsv")
                || lowercasedName.hasSuffix(".txt") else {
            throw ContactImportParserError.unsupportedFile
        }
        return try parseDelimitedFile(
            data: data,
            fileName: safeFileName,
            sourceKind: sourceKind,
            contentHash: hash,
            importedAt: importedAt
        )
    }

    private static func parseDelimitedFile(
        data: Data,
        fileName: String,
        sourceKind: ContactImportSourceKind,
        contentHash: String,
        importedAt: Date
    ) throws -> ContactImportDraft {
        let text = try decode(data)
        let parsedRows = try rows(
            in: text,
            delimiter: preferredDelimiter(in: text)
        )
        guard let rawHeader = parsedRows.first, !rawHeader.isEmpty else {
            throw ContactImportParserError.missingHeader
        }
        guard rawHeader.count <= maximumColumnCount else {
            throw ContactImportParserError.tooManyColumns
        }
        let dataRows = parsedRows.dropFirst().filter { row in
            row.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
        guard dataRows.count <= maximumRecordCount else {
            throw ContactImportParserError.tooManyRows
        }
        guard dataRows.allSatisfy({ $0.count <= maximumColumnCount }) else {
            throw ContactImportParserError.tooManyColumns
        }

        let header = rawHeader.map(normalizeHeader)
        guard header.contains(where: recognizedHeaders.contains) else {
            throw ContactImportParserError.missingHeader
        }
        let unmappedColumns = zip(rawHeader, header).compactMap { raw, normalized in
            recognizedHeaders.contains(normalized)
                ? nil
                : sanitizedFieldValue(raw)
        }
        .filter { !$0.isEmpty }

        var records: [ContactImportRecord] = []
        for (offset, rawValues) in dataRows.enumerated() {
            let rowNumber = offset + 2
            var values: [String: String] = [:]
            for (index, key) in header.enumerated() where !key.isEmpty {
                guard index < rawValues.count else { continue }
                let value = sanitizedFieldValue(rawValues[index])
                if values[key]?.isEmpty != false { values[key] = value }
            }
            let firstName = firstValue(
                in: values,
                keys: ["firstname", "givenname", "名", "名字"]
            )
            let lastName = firstValue(
                in: values,
                keys: ["lastname", "surname", "familyname", "姓"]
            )
            let combinedName = [firstName, lastName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            let displayName = firstValue(
                in: values,
                keys: ["name", "fullname", "displayname", "姓名", "名称"]
            ) ?? combinedName
            let email = optionalValue(
                firstValue(
                    in: values,
                    keys: [
                        "email", "emailaddress", "email1", "email1value", "email2address",
                        "email2value", "email3address", "邮箱", "电子邮件",
                    ]
                )
            )
            let phone = optionalValue(firstValue(
                in: values,
                keys: [
                    "phone", "phonenumber", "mobile", "mobilephone", "telephone",
                    "phone1value", "phone2value", "businessphone", "homephone",
                    "手机", "手机号", "电话",
                ]
            ))
            let profileURL = optionalValue(firstValue(
                in: values,
                keys: [
                    "linkedinurl", "linkedinprofile", "profileurl", "url", "website",
                    "website1value", "webpage", "领英", "领英链接", "资料链接", "个人主页", "主页", "网址",
                ]
            ))
            var warnings: [ContactImportWarning] = []
            if displayName.isEmpty { warnings.append(.missingName) }
            if let email, !ContactImportRecord.isValidEmail(email) {
                warnings.append(.invalidEmail)
            }
            if let phone, !ContactImportRecord.isValidPhone(phone) {
                warnings.append(.invalidPhone)
            }
            if let profileURL, !ContactImportRecord.isValidHTTPSProfileURL(profileURL) {
                warnings.append(.insecureProfileURL)
            }
            if optionalValue(firstValue(in: values, keys: ["note", "notes", "备注"])) != nil {
                warnings.append(.notesExcluded)
            }
            records.append(
                ContactImportRecord(
                    id: "\(contentHash.prefix(16)):\(rowNumber)",
                    rowNumber: rowNumber,
                    displayName: displayName,
                    organization: optionalValue(firstValue(
                        in: values,
                        keys: [
                            "company", "organization", "organisation", "companyname",
                            "organization1name", "accountname", "公司", "公司名称", "组织",
                        ]
                    )),
                    jobTitle: optionalValue(firstValue(
                        in: values,
                        keys: [
                            "position", "title", "jobtitle", "organization1title",
                            "职位", "职称", "头衔",
                        ]
                    )),
                    email: email,
                    phone: phone,
                    profileURL: profileURL,
                    warnings: warnings,
                    duplicateOfRow: nil
                )
            )
        }
        markExactDuplicates(in: &records)
        return ContactImportDraft(
            sourceKind: sourceKind,
            fileName: fileName,
            contentHash: contentHash,
            importedAt: importedAt,
            records: records,
            unmappedColumns: Array(Set(unmappedColumns)).sorted()
        )
    }

    private static func parseVCard(
        data: Data,
        fileName: String,
        sourceKind: ContactImportSourceKind,
        contentHash: String,
        importedAt: Date
    ) throws -> ContactImportDraft {
        let contacts: [CNContact]
        do {
            contacts = try CNContactVCardSerialization.contacts(with: data)
        } catch {
            throw ContactImportParserError.invalidVCard
        }
        guard !contacts.isEmpty else { throw ContactImportParserError.empty }
        guard contacts.count <= maximumRecordCount else {
            throw ContactImportParserError.tooManyRows
        }
        var records = contacts.enumerated().map { offset, contact in
            let rowNumber = offset + 1
            let formattedName = CNContactFormatter.string(
                from: contact,
                style: .fullName
            )?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let email = contact.emailAddresses.first?.value as String?
            let phone = contact.phoneNumbers.first?.value.stringValue
            let profileURL = contact.urlAddresses.first?.value as String?
                ?? contact.socialProfiles.compactMap { profile in
                    let value = profile.value
                    let url = value.urlString
                    if !url.isEmpty { return url }
                    guard !value.username.isEmpty else { return nil }
                    switch value.service.lowercased() {
                    case "linkedin": return "https://www.linkedin.com/in/\(value.username)"
                    case "twitter", "x": return "https://x.com/\(value.username)"
                    case "instagram": return "https://www.instagram.com/\(value.username)"
                    default: return nil
                    }
                }.first
            var warnings: [ContactImportWarning] = []
            if formattedName.isEmpty { warnings.append(.missingName) }
            if let email = optionalValue(email), !ContactImportRecord.isValidEmail(email) {
                warnings.append(.invalidEmail)
            }
            if let phone = optionalValue(phone), !ContactImportRecord.isValidPhone(phone) {
                warnings.append(.invalidPhone)
            }
            if let profileURL = optionalValue(profileURL),
               !ContactImportRecord.isValidHTTPSProfileURL(profileURL) {
                warnings.append(.insecureProfileURL)
            }
            if !contact.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                warnings.append(.notesExcluded)
            }
            return ContactImportRecord(
                id: "\(contentHash.prefix(16)):\(rowNumber)",
                rowNumber: rowNumber,
                displayName: formattedName,
                organization: optionalValue(contact.organizationName),
                jobTitle: optionalValue(contact.jobTitle),
                email: optionalValue(email),
                phone: optionalValue(phone),
                profileURL: optionalValue(profileURL),
                warnings: warnings,
                duplicateOfRow: nil
            )
        }
        markExactDuplicates(in: &records)
        return ContactImportDraft(
            sourceKind: sourceKind,
            fileName: fileName,
            contentHash: contentHash,
            importedAt: importedAt,
            records: records,
            unmappedColumns: []
        )
    }

    private static func decode(_ data: Data) throws -> String {
        let encodings: [String.Encoding]
        if data.starts(with: [0xFF, 0xFE]) {
            encodings = [.utf16LittleEndian, .utf16, .utf8]
        } else if data.starts(with: [0xFE, 0xFF]) {
            encodings = [.utf16BigEndian, .utf16, .utf8]
        } else {
            encodings = [.utf8]
        }
        for encoding in encodings {
            if var value = String(data: data, encoding: encoding) {
                if value.first == "\u{feff}" { value.removeFirst() }
                return value
            }
        }
        throw ContactImportParserError.unsupportedEncoding
    }

    private static func preferredDelimiter(in text: String) -> Character {
        let candidates: [Character] = [",", "\t", ";"]
        var counts = Dictionary(uniqueKeysWithValues: candidates.map { ($0, 0) })
        var isQuoted = false
        var index = text.startIndex
        while index < text.endIndex {
            let character = text[index]
            if character == "\"" {
                let next = text.index(after: index)
                if isQuoted, next < text.endIndex, text[next] == "\"" {
                    index = next
                } else {
                    isQuoted.toggle()
                }
            } else if !isQuoted, character == "\n" || character == "\r" {
                break
            } else if !isQuoted, counts[character] != nil {
                counts[character, default: 0] += 1
            }
            index = text.index(after: index)
        }
        var selected = candidates[0]
        var selectedCount = counts[selected, default: 0]
        for candidate in candidates.dropFirst() {
            let count = counts[candidate, default: 0]
            if count > selectedCount {
                selected = candidate
                selectedCount = count
            }
        }
        return selected
    }

    private static func rows(
        in text: String,
        delimiter: Character
    ) throws -> [[String]] {
        var result: [[String]] = []
        var row: [String] = []
        var field = ""
        var isQuoted = false
        var index = text.startIndex
        while index < text.endIndex {
            let character = text[index]
            if character == "\"" {
                let next = text.index(after: index)
                if isQuoted, next < text.endIndex, text[next] == "\"" {
                    field.append("\"")
                    index = text.index(after: next)
                    continue
                }
                isQuoted.toggle()
            } else if character == delimiter, !isQuoted {
                row.append(field)
                field = ""
            } else if (character == "\n" || character == "\r"), !isQuoted {
                row.append(field)
                field = ""
                if row.contains(where: { !$0.isEmpty }) { result.append(row) }
                row = []
                if character == "\r" {
                    let next = text.index(after: index)
                    if next < text.endIndex, text[next] == "\n" { index = next }
                }
            } else {
                field.append(character)
                if field.count > maximumFieldCharacterCount {
                    throw ContactImportParserError.fieldTooLarge
                }
            }
            index = text.index(after: index)
        }
        guard !isQuoted else { throw ContactImportParserError.malformedCSV }
        row.append(field)
        if row.contains(where: { !$0.isEmpty }) { result.append(row) }
        return result
    }

    private static func markExactDuplicates(in records: inout [ContactImportRecord]) {
        var firstRowByKey: [String: Int] = [:]
        for index in records.indices {
            guard let key = records[index].exactDuplicateKey else { continue }
            if let firstRow = firstRowByKey[key] {
                records[index].duplicateOfRow = firstRow
                records[index] = ContactImportRecord(
                    id: records[index].id,
                    rowNumber: records[index].rowNumber,
                    displayName: records[index].displayName,
                    organization: records[index].organization,
                    jobTitle: records[index].jobTitle,
                    email: records[index].email,
                    phone: records[index].phone,
                    profileURL: records[index].profileURL,
                    warnings: records[index].warnings + [.exactDuplicate],
                    duplicateOfRow: firstRow
                )
            } else {
                firstRowByKey[key] = records[index].rowNumber
            }
        }
    }

    private static let recognizedHeaders: Set<String> = [
        "name", "fullname", "displayname", "firstname", "givenname", "姓名", "名称", "名", "名字",
        "lastname", "surname", "familyname", "姓",
        "email", "emailaddress", "email1", "email1value", "email2address", "email2value",
        "email3address", "邮箱", "电子邮件",
        "phone", "phonenumber", "mobile", "mobilephone", "telephone", "phone1value",
        "phone2value", "businessphone", "homephone", "手机", "手机号", "电话",
        "linkedinurl", "linkedinprofile", "profileurl", "url", "website", "website1value",
        "webpage", "领英", "领英链接", "资料链接", "个人主页", "主页", "网址",
        "company", "organization", "organisation", "companyname", "organization1name",
        "accountname", "公司", "公司名称", "组织",
        "position", "title", "jobtitle", "organization1title", "职位", "职称", "头衔",
        "note", "notes", "备注", "connectedon",
        "relationship", "relationshipcontext",
    ]

    private static func normalizeHeader(_ value: String) -> String {
        value.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
        .filter { $0.isLetter || $0.isNumber }
    }

    private static func firstValue(
        in values: [String: String],
        keys: [String]
    ) -> String? {
        keys.compactMap { values[$0] }.first(where: { !$0.isEmpty })
    }

    private static func optionalValue(_ value: String?) -> String? {
        guard let value = value.map(sanitizedFieldValue),
              !value.isEmpty else { return nil }
        return value
    }

    private static func sanitizedFieldValue(_ value: String) -> String {
        value.components(separatedBy: .controlCharacters)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func sanitizedFileName(_ value: String) -> String {
        let cleaned = sanitizedFieldValue(value)
        guard !cleaned.isEmpty else { return "contacts" }
        return String(cleaned.prefix(240))
    }
}

extension ConversationContactDraft.Interpreter {
    static let fileImport = Self(
        name: "ios-agent-contact-file-import",
        version: "1.0.0"
    )
}
