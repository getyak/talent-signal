import Foundation
import Security

protocol LabWorkspaceJourneyPersisting {
    func load() throws -> LabWorkspaceJourney?
    func save(_ journey: LabWorkspaceJourney) throws
    func delete() throws
}

final class KeychainLabWorkspaceJourneyStore: LabWorkspaceJourneyPersisting {
    static let defaultService = "com.talentsignal.app.lab-workspace"
    private let endpoint: URL
    private let service: String
    private var account: String { RuntimeEndpoint.scope(endpoint) }

    init(endpoint: URL, service: String = defaultService) {
        self.endpoint = endpoint
        self.service = service
    }

#if DEBUG
    static func resetAllForUITesting() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword,
                       kSecAttrService as String: defaultService] as CFDictionary)
    }
#endif

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func load() throws -> LabWorkspaceJourney? {
        guard let data = try bytes() else { return nil }
        guard data.count <= 131_072 else { throw LabWorkspaceError.secureStore }
        // This private journal uses numeric seconds so write/read verification
        // preserves subsecond operation ordering. The network contract remains ISO-8601.
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .secondsSince1970
        guard let value = try? decoder.decode(LabWorkspaceJourney.self, from: data), valid(value) else {
            throw LabWorkspaceError.secureStore
        }
        return value
    }

    func save(_ journey: LabWorkspaceJourney) throws {
        guard valid(journey) else { throw LabWorkspaceError.secureStore }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .secondsSince1970
        let data = try encoder.encode(journey)
        guard data.count <= 131_072 else { throw LabWorkspaceError.secureStore }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let added = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
            guard added == errSecSuccess else { throw LabWorkspaceError.secureStore }
        } else if status != errSecSuccess { throw LabWorkspaceError.secureStore }
        guard try bytes() == data else { throw LabWorkspaceError.secureStore }
    }

    func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw LabWorkspaceError.secureStore
        }
        guard try bytes() == nil else { throw LabWorkspaceError.secureStore }
    }

    private func bytes() throws -> Data? {
        var request = query
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        request[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw LabWorkspaceError.secureStore
        }
        return data
    }

    private func valid(_ value: LabWorkspaceJourney) -> Bool {
        guard value.endpointScope == account,
              [1, 4, 24].contains(value.durationHours),
              value.originalSession.map({ RuntimeEndpoint.same($0.baseURL, endpoint) && $0.user.kind != "lab_human" }) ?? true,
              value.workspace.map({ $0.id == value.id && $0.ownerAccountID == value.ownerAccountID && $0.ownerUserID == value.ownerUserID }) ?? true,
              value.targetAccountID == value.workspace?.accountID || value.workspace == nil,
              value.targetUserID == value.workspace?.userID || value.workspace == nil else { return false }
        if let original = value.originalSession,
           original.account.id != value.ownerAccountID || original.user.id != value.ownerUserID { return false }
        if let token = value.childAccessToken {
            guard token.utf8.count == 43, token.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }),
                  Data(base64URLEncoded: token)?.count == 32 else { return false }
        }
        switch value.phase {
        case .preparing:
            return value.originalSession != nil && value.childAccessToken != nil
        case .entryReady, .childActive, .returning:
            return value.originalSession != nil && value.childAccessToken != nil
                && value.workspace != nil && value.targetAccountID != nil && value.targetUserID != nil
        case .ownerActive, .stopPending, .deleting, .finished:
            return value.originalSession == nil && value.childAccessToken == nil
        }
    }
}

extension Data {
    init?(base64URLEncoded value: String) {
        var base64 = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        self.init(base64Encoded: base64)
    }

    var base64URLEncodedString: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
