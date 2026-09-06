import Foundation
import Security
import CryptoKit

protocol AppSessionEndingPersisting {
    func load() throws -> [AppSessionEnding]
    func save(_ records: [AppSessionEnding]) throws
}

final class KeychainAppSessionEndingStore: AppSessionEndingPersisting {
    private let endpoint: URL?
    private let service: String
    private var account: String { endpoint.map { RuntimeEndpoint.scope($0) } ?? "unconfigured" }
    init(endpoint: URL?, service: String = "com.talentsignal.app.session-ending") {
        self.endpoint = endpoint; self.service = service
    }
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
    private func bytes() throws -> Data? {
        var value = query; value[kSecMatchLimit as String] = kSecMatchLimitOne; value[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(value as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw AppSessionError.keychain(status) }
        guard data.count <= 262_144 else { throw AppSessionEndingError.unreadable }
        return data
    }
    func load() throws -> [AppSessionEnding] {
        guard let data = try bytes() else { return [] }
        let value: AppSessionEndingArchive
        do { value = try JSONDecoder().decode(AppSessionEndingArchive.self, from: data) }
        catch { throw AppSessionEndingError.unreadable }
        guard value.version == 1, value.records.count <= 64,
              Set(value.records.map(\.id)).count == value.records.count,
              value.records.allSatisfy({ record in
                  record.endpointScope == account && Self.isDigest(record.credentialFingerprint) && Self.isDigest(record.identityFingerprint)
                    && record.startedAt.timeIntervalSince1970.isFinite && record.expiresAt.timeIntervalSince1970.isFinite
                    && (record.credential.map { session in
                        endpoint.map { RuntimeEndpoint.same(session.baseURL, $0) } == true
                          && AppSessionEnding.fingerprint(session) == record.credentialFingerprint
                          && SHA256.hex(session.account.id + "|" + session.user.id) == record.identityFingerprint
                          && session.expiresAt == record.expiresAt
                    } ?? true)
              }) else { throw AppSessionEndingError.unreadable }
        var records = value.records
        var changed = false
        for index in records.indices where records[index].expiresAt <= Date() && (records[index].credential != nil || !records[index].remoteSettled) {
            records[index].credential = nil
            if !records[index].remoteSettled { records[index].remote = .expired }
            changed = true
        }
        if changed { try save(records) }
        return records
    }
    private static func isDigest(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
    func save(_ records: [AppSessionEnding]) throws {
        guard records.count <= 64, records.allSatisfy({ $0.endpointScope == account }) else { throw AppSessionError.scopeMismatch }
        let data = try JSONEncoder().encode(AppSessionEndingArchive(version: 1, records: records))
        guard data.count <= 262_144 else { throw AppSessionEndingError.unreadable }
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let added = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
            guard added == errSecSuccess else { throw AppSessionError.keychain(added) }
        } else if status != errSecSuccess { throw AppSessionError.keychain(status) }
        guard try bytes() == data else { throw AppSessionEndingError.unreadable }
    }
}
