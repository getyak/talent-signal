import Foundation
import Security
import SwiftUI

@MainActor
final class LabWorkspaceStore: ObservableObject {
    @Published private(set) var journey: LabWorkspaceJourney?
    @Published private(set) var workspaces: [LabWorkspace] = []
    @Published private(set) var receipt: LabWorkspaceReceipt?
    @Published private(set) var isWorking = false
    @Published private(set) var secureStoreFailed = false
    @Published var notice: String?

    private let sessionStore: AppSessionStore
    private let persistenceFactory: (URL) -> any LabWorkspaceJourneyPersisting
    private let clientFactory: (URL) -> any LabWorkspaceServing
    private var endpoint: URL?
    private var persistence: (any LabWorkspaceJourneyPersisting)?
    private var client: (any LabWorkspaceServing)?

    init(
        sessionStore: AppSessionStore,
        persistenceFactory: @escaping (URL) -> any LabWorkspaceJourneyPersisting = {
            KeychainLabWorkspaceJourneyStore(endpoint: $0)
        },
        clientFactory: @escaping (URL) -> any LabWorkspaceServing = {
            URLLabWorkspaceClient(baseURL: $0)
        }
    ) {
        self.sessionStore = sessionStore
        self.persistenceFactory = persistenceFactory
        self.clientFactory = clientFactory
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--reset-lab-workspace-journey"),
           let selected = sessionStore.baseURL {
            try? persistenceFactory(selected).delete()
        }
#endif
        loadEndpoint()
    }

    var hasOpenJourney: Bool { journey?.isOpen == true }
    var requiresOnlineRestore: Bool { secureStoreFailed || journey?.isChildPhase == true }
    var currentWorkspace: LabWorkspace? { journey?.workspace }

    func allowsDisplay(_ session: TalentSignalSession) -> Bool {
        guard !secureStoreFailed else { return false }
        guard let journey else { return session.user.kind != "lab_human" }
        if session.account.id == journey.ownerAccountID && session.user.id == journey.ownerUserID { return true }
        return journey.isOpen && session.user.kind == "lab_human"
            && session.account.id == journey.targetAccountID
            && session.user.id == journey.targetUserID
    }

    func reconcile() async {
        guard !isWorking else { return }
        loadEndpoint()
        guard let client, let endpoint else { return }
        if secureStoreFailed {
            notice = LabWorkspaceError.secureStore.localizedDescription
            return
        }
        guard let current = sessionStore.currentSession else {
            if journey?.isChildPhase == true { await recoverOriginalSession() }
            return
        }
        guard RuntimeEndpoint.same(current.baseURL, endpoint) else {
            notice = LabWorkspaceError.wrongAccount.localizedDescription
            return
        }
        guard let active = journey else {
            if current.user.kind == "lab_human" {
                notice = LabWorkspaceError.secureStore.localizedDescription
                return
            }
            await loadList(client: client, owner: current)
            return
        }
        if active.phase == .finished {
            if current.account.id == active.ownerAccountID && current.user.id == active.ownerUserID {
                await loadList(client: client, owner: current)
            }
            return
        }
        if current.account.id == active.ownerAccountID && current.user.id == active.ownerUserID {
            if [.returning, .childActive].contains(active.phase) {
                await finishReturn(owner: current)
            } else if [.preparing, .entryReady].contains(active.phase), active.stopID == nil {
                await continueEntry(owner: current, client: client, createIfNeeded: active.workspace == nil)
            } else {
                await settleOwnerOperations(owner: current)
            }
        } else if current.user.kind == "lab_human",
                  current.account.id == active.targetAccountID,
                  current.user.id == active.targetUserID {
            await inspectChild(client: client, child: current)
        } else {
            notice = LabWorkspaceError.wrongAccount.localizedDescription
        }
    }

    func createAndEnter(durationHours: Int = 4) async {
        guard !isWorking, [1, 4, 24].contains(durationHours), let owner = ownerSession else {
            notice = sessionStore.currentSession == nil
                ? LabWorkspaceError.authenticationRequired.localizedDescription
                : LabWorkspaceError.busy.localizedDescription
            return
        }
        loadEndpoint()
        guard let persistence, let client else { notice = LabWorkspaceError.unavailable.localizedDescription; return }
        if let existing = journey, existing.phase == .finished {
            do { try persistence.delete(); journey = nil; receipt = nil }
            catch { failSecurely(error); return }
        }
        if journey == nil {
            do {
                let value = LabWorkspaceJourney(owner: owner, durationHours: durationHours,
                    accessToken: try Self.randomCredential())
                try save(value)
            } catch { failSecurely(error); return }
        }
        await continueEntry(owner: owner, client: client, createIfNeeded: true)
    }

    func enter(_ workspace: LabWorkspace) async {
        guard !isWorking, journey == nil || journey?.phase == .finished, let owner = ownerSession,
              workspace.ownerAccountID == owner.account.id, workspace.ownerUserID == owner.user.id,
              workspace.state == .active, workspace.expiresAt > .now else {
            notice = LabWorkspaceError.wrongAccount.localizedDescription
            return
        }
        loadEndpoint()
        guard let persistence, let client else { notice = LabWorkspaceError.unavailable.localizedDescription; return }
        do {
            if journey != nil { try persistence.delete(); journey = nil; receipt = nil }
            var value = LabWorkspaceJourney(owner: owner, durationHours: workspace.durationHours,
                workspaceID: workspace.id, accessToken: try Self.randomCredential())
            value.workspace = workspace
            value.targetAccountID = workspace.accountID
            value.targetUserID = workspace.userID
            try save(value)
        } catch { failSecurely(error); return }
        await continueEntry(owner: owner, client: client, createIfNeeded: false)
    }

    func retry() async {
        guard let current = sessionStore.currentSession, let journey else { await reconcile(); return }
        loadEndpoint()
        guard let client else { return }
        if current.account.id == journey.ownerAccountID && current.user.id == journey.ownerUserID {
            if [.preparing, .entryReady].contains(journey.phase), journey.stopID == nil {
                await continueEntry(owner: current, client: client, createIfNeeded: journey.workspace == nil)
            } else { await settleOwnerOperations(owner: current) }
        } else if current.user.kind == "lab_human" { await inspectChild(client: client, child: current) }
    }

    func returnToOwner() async { await returnToOwner(requestStop: false) }
    func endCurrentWorkspace() async { await returnToOwner(requestStop: true) }

    func end(_ workspace: LabWorkspace) async {
        guard !isWorking, let owner = ownerSession,
              workspace.ownerAccountID == owner.account.id, workspace.ownerUserID == owner.user.id else {
            notice = LabWorkspaceError.wrongAccount.localizedDescription
            return
        }
        loadEndpoint()
        do {
            if journey?.phase == .finished { try persistence?.delete(); journey = nil; receipt = nil }
            var value = LabWorkspaceJourney(owner: owner, durationHours: workspace.durationHours,
                workspaceID: workspace.id, accessToken: try Self.randomCredential())
            value.originalSession = nil
            value.childAccessToken = nil
            value.targetAccountID = workspace.accountID
            value.targetUserID = workspace.userID
            value.workspace = workspace
            value.stopID = UUID()
            value.phase = .stopPending
            try save(value)
        } catch { failSecurely(error); return }
        await settleOwnerOperations(owner: owner)
    }

    func recoverOriginalSession() async {
        guard !isWorking, let value = journey, let original = value.originalSession else {
            if journey != nil { notice = LabWorkspaceError.authenticationRequired.localizedDescription }
            return
        }
        guard original.account.id == value.ownerAccountID, original.user.id == value.ownerUserID else {
            failSecurely(LabWorkspaceError.secureStore); return
        }
        await adoptOwner(original, expectedCurrent: nil)
    }

    func dismissFinishedReceipt() {
        guard journey?.phase == .finished, !isWorking else { return }
        do { try persistence?.delete(); journey = nil; receipt = nil; notice = nil }
        catch { failSecurely(error) }
    }

    private var ownerSession: TalentSignalSession? {
        guard let value = sessionStore.currentSession, value.user.kind != "lab_human" else { return nil }
        if let journey, journey.isOpen,
           (value.account.id != journey.ownerAccountID || value.user.id != journey.ownerUserID) { return nil }
        return value
    }

    private func continueEntry(owner: TalentSignalSession, client: any LabWorkspaceServing,
                               createIfNeeded: Bool) async {
        guard !isWorking, var value = journey,
              owner.account.id == value.ownerAccountID, owner.user.id == value.ownerUserID,
              let token = value.childAccessToken else { notice = LabWorkspaceError.wrongAccount.localizedDescription; return }
        isWorking = true; notice = nil
        do {
            if createIfNeeded || value.workspace == nil {
                let workspace = try await client.create(id: value.id, durationHours: value.durationHours, using: owner)
                try verify(workspace, owner: owner, expectedID: value.id)
                value.workspace = workspace
                value.targetAccountID = workspace.accountID
                value.targetUserID = workspace.userID
                value.updatedAt = .now
                try save(value)
            }
            guard let workspace = value.workspace else { throw LabWorkspaceError.invalidResponse }
            let entry = try await client.enter(workspaceID: value.id, entryID: value.entryID,
                accessToken: token, using: owner)
            let candidate = try childSession(entry: entry, workspace: workspace, token: token, endpoint: owner.baseURL)
            value.entryExpiresAt = entry.expiresAt
            value.phase = .entryReady
            value.leavePending = true
            value.updatedAt = .now
            try save(value)
            journey = value
            isWorking = false
            await adoptChild(candidate, owner: owner)
        } catch {
            isWorking = false
            notice = error.localizedDescription
        }
    }

    private func adoptChild(_ candidate: TalentSignalSession, owner: TalentSignalSession) async {
        guard var value = journey else { return }
        let permit: UUID
        do { permit = try RuntimeWorkRegistry.shared.beginMaintenance() }
        catch { notice = LabWorkspaceError.busy.localizedDescription; return }
        isWorking = true
        do {
            let adopted = try await sessionStore.replaceWithValidatedProtectedSession(candidate,
                expectedCurrent: owner, maintenancePermit: permit)
            guard adopted.user.kind == "lab_human", adopted.account.id == value.targetAccountID,
                  adopted.user.id == value.targetUserID else { throw LabWorkspaceError.invalidResponse }
            value.phase = .childActive
            value.updatedAt = .now
            try save(value)
            notice = "Empty test workspace verified. Changes here stay isolated from the original account."
        } catch {
            if Self.isSecureStoreError(error) { failSecurely(error) }
            else { notice = error.localizedDescription }
        }
        RuntimeWorkRegistry.shared.endMaintenance(permit)
        isWorking = false
    }

    private func returnToOwner(requestStop: Bool) async {
        guard !isWorking, var value = journey else { return }
        loadEndpoint()
        if requestStop, value.stopID == nil { value.stopID = UUID() }
        value.phase = .returning
        value.leavePending = true
        value.updatedAt = .now
        do { try save(value) }
        catch { failSecurely(error); return }
        if let current = sessionStore.currentSession,
           current.account.id == value.ownerAccountID, current.user.id == value.ownerUserID {
            await finishReturn(owner: current)
            return
        }
        guard let original = value.originalSession else {
            notice = LabWorkspaceError.authenticationRequired.localizedDescription
            return
        }
        await adoptOwner(original, expectedCurrent: sessionStore.currentSession)
    }

    private func adoptOwner(_ original: TalentSignalSession, expectedCurrent: TalentSignalSession?) async {
        let permit: UUID
        do { permit = try RuntimeWorkRegistry.shared.beginMaintenance() }
        catch { notice = LabWorkspaceError.busy.localizedDescription; return }
        isWorking = true
        do {
            let owner = try await sessionStore.replaceWithValidatedProtectedSession(original,
                expectedCurrent: expectedCurrent, maintenancePermit: permit)
            RuntimeWorkRegistry.shared.endMaintenance(permit)
            isWorking = false
            switch journey?.phase {
            case .preparing, .entryReady:
                if let client {
                    await continueEntry(owner: owner, client: client,
                        createIfNeeded: journey?.workspace == nil)
                }
            case .returning, .childActive:
                await finishReturn(owner: owner)
            default:
                await settleOwnerOperations(owner: owner)
            }
            return
        } catch {
            if Self.isSecureStoreError(error) { failSecurely(error) }
            else { notice = error.localizedDescription }
        }
        RuntimeWorkRegistry.shared.endMaintenance(permit)
        isWorking = false
    }

    private func finishReturn(owner: TalentSignalSession) async {
        guard var value = journey, owner.account.id == value.ownerAccountID,
              owner.user.id == value.ownerUserID else { notice = LabWorkspaceError.wrongAccount.localizedDescription; return }
        value.originalSession = nil
        value.childAccessToken = nil
        value.phase = value.stopID == nil ? .ownerActive : .stopPending
        value.updatedAt = .now
        do { try save(value) }
        catch { failSecurely(error); return }
        await settleOwnerOperations(owner: owner)
    }

    private func settleOwnerOperations(owner: TalentSignalSession) async {
        guard !isWorking, var value = journey,
              owner.account.id == value.ownerAccountID, owner.user.id == value.ownerUserID,
              let client else { return }
        isWorking = true; notice = nil
        do {
            if value.leavePending {
                _ = try await client.leave(workspaceID: value.id, entryID: value.entryID, using: owner)
                value.leavePending = false
                value.updatedAt = .now
                try save(value)
            }
            if let stopID = value.stopID {
                value.phase = .stopPending
                value.updatedAt = .now
                try save(value)
                let workspace = try await client.stop(workspaceID: value.id, stopID: stopID, using: owner)
                value.workspace = workspace
                value.phase = workspace.state == .deleted ? .finished : .deleting
                value.updatedAt = .now
                try save(value)
                receipt = LabWorkspaceReceipt(id: workspace.id, state: workspace.state,
                    stoppedAt: workspace.stoppedAt, deletedAt: workspace.deletedAt,
                    cleanupError: workspace.cleanupError, dataRows: workspace.dataRows)
                notice = workspace.state == .deleted
                    ? "The test workspace was deleted and its scoped data read back as empty."
                    : "Cleanup is still visible on the server. Refresh to review its state."
            } else {
                try persistence?.delete()
                journey = nil
                notice = "Returned to the original account. The test workspace remains available in Lab."
            }
            workspaces = try await client.list(using: owner)
        } catch {
            notice = error.localizedDescription
        }
        isWorking = false
    }

    private func inspectChild(client: any LabWorkspaceServing, child: TalentSignalSession) async {
        guard !isWorking, var value = journey else { return }
        isWorking = true
        do {
            let workspace = try await client.read(id: value.id, using: child)
            value.workspace = workspace
            value.updatedAt = .now
            if workspace.state == .active && workspace.expiresAt > .now {
                value.phase = .childActive
                try save(value)
                notice = workspace.isEmptyAndIsolated ? "Test workspace · isolated" : nil
                isWorking = false
                return
            }
            try save(value)
            isWorking = false
            await returnToOwner(requestStop: value.stopID != nil)
        } catch let error as LabWorkspaceError where error == .closed || error == .authenticationRequired {
            isWorking = false
            await returnToOwner(requestStop: value.stopID != nil)
        } catch {
            isWorking = false
            notice = error.localizedDescription
        }
    }

    private func loadList(client: any LabWorkspaceServing, owner: TalentSignalSession) async {
        guard !isWorking else { return }
        isWorking = true
        do { workspaces = try await client.list(using: owner); notice = nil }
        catch { notice = error.localizedDescription }
        isWorking = false
    }

    private func verify(_ workspace: LabWorkspace, owner: TalentSignalSession, expectedID: UUID) throws {
        guard workspace.id == expectedID, workspace.ownerAccountID == owner.account.id,
              workspace.ownerUserID == owner.user.id, workspace.state == .active,
              workspace.expiresAt > .now, workspace.isEmptyAndIsolated,
              workspace.accountID != owner.account.id, workspace.userID != owner.user.id else {
            throw workspace.dataRows == 0 ? LabWorkspaceError.invalidResponse : LabWorkspaceError.notEmpty
        }
    }

    private func childSession(entry: LabWorkspaceEntry, workspace: LabWorkspace,
                              token: String, endpoint: URL) throws -> TalentSignalSession {
        guard entry.state == .active, entry.expiresAt > .now, let value = entry.session,
              value.contractVersion == TalentSignalAPIContract.version,
              value.expiresAt == entry.expiresAt,
              value.account.id == workspace.accountID, value.user.id == workspace.userID,
              value.user.kind == "lab_human" else { throw LabWorkspaceError.invalidResponse }
        return TalentSignalSession(baseURL: endpoint, accessToken: token, expiresAt: value.expiresAt,
            account: .init(id: value.account.id, slug: value.account.slug, name: value.account.name),
            user: .init(id: value.user.id, email: value.user.email,
                displayName: value.user.displayName, kind: value.user.kind))
    }

    private func loadEndpoint() {
        guard let selected = sessionStore.baseURL else {
            endpoint = nil; persistence = nil; client = nil; journey = nil; return
        }
        if endpoint.map({ RuntimeEndpoint.same($0, selected) }) == true && !secureStoreFailed { return }
        endpoint = selected
        persistence = persistenceFactory(selected)
        client = clientFactory(selected)
        do {
            journey = try persistence?.load()
            if let workspace = journey?.workspace, journey?.phase == .finished {
                receipt = LabWorkspaceReceipt(id: workspace.id, state: workspace.state,
                    stoppedAt: workspace.stoppedAt, deletedAt: workspace.deletedAt,
                    cleanupError: workspace.cleanupError, dataRows: workspace.dataRows)
            } else { receipt = nil }
            secureStoreFailed = false
        } catch {
            journey = nil
            secureStoreFailed = true
            notice = LabWorkspaceError.secureStore.localizedDescription
        }
    }

    private func save(_ value: LabWorkspaceJourney) throws {
        guard let endpoint, value.endpointScope == RuntimeEndpoint.scope(endpoint), let persistence else {
            throw LabWorkspaceError.secureStore
        }
        try persistence.save(value)
        guard let restored = try persistence.load(),
              try Self.canonicalJournal(restored) == Self.canonicalJournal(value) else {
            throw LabWorkspaceError.secureStore
        }
        journey = restored
        secureStoreFailed = false
    }

    /// Date's JSON round-trip is not bit-exact. Compare the complete protected
    /// record after reducing dates to the millisecond precision used by the
    /// service contract, while the Keychain store separately verifies bytes.
    private static func canonicalJournal(_ value: LabWorkspaceJourney) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .custom { date, target in
            var container = target.singleValueContainer()
            try container.encode(Int64((date.timeIntervalSince1970 * 1_000).rounded()))
        }
        return try encoder.encode(value)
    }

    private func failSecurely(_ error: Error) {
        secureStoreFailed = true
        notice = (error as? LocalizedError)?.errorDescription ?? LabWorkspaceError.secureStore.localizedDescription
    }

    private static func randomCredential() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, buffer.count, buffer.baseAddress!)
        }
        guard status == errSecSuccess else {
            throw LabWorkspaceError.secureStore
        }
        let value = Data(bytes).base64URLEncodedString
        guard value.utf8.count == 43 else { throw LabWorkspaceError.secureStore }
        return value
    }

    private static func isSecureStoreError(_ error: Error) -> Bool {
        if let value = error as? LabWorkspaceError, value == .secureStore { return true }
        if let value = error as? AppSessionError, case .keychain = value { return true }
        return false
    }
}
