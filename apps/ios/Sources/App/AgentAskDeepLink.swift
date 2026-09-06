import Foundation
import Combine

enum AgentAskDeepLinkDestination: String, Equatable {
    case review
    case retry
    case status
}

struct AgentAskDeepLink: Equatable {
    let identity: AgentAskActivityIdentity
    let destination: AgentAskDeepLinkDestination

    static func url(
        identity: AgentAskActivityIdentity,
        destination: AgentAskDeepLinkDestination
    ) -> URL? {
        var components = URLComponents()
        components.scheme = "talentsignal"
        components.host = "ask"
        components.path = "/\(destination.rawValue)"
        components.queryItems = [
            URLQueryItem(name: "workspace", value: identity.workspaceID),
            URLQueryItem(name: "session", value: identity.sessionID),
            URLQueryItem(name: "instance", value: identity.activityInstanceID),
        ]
        return components.url
    }

    static func parse(_ url: URL) -> AgentAskDeepLink? {
        guard url.scheme == "talentsignal", url.host == "ask",
              let destination = AgentAskDeepLinkDestination(
                rawValue: url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
              ),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let workspace = components.queryItems?.first(where: { $0.name == "workspace" })?.value,
              let session = components.queryItems?.first(where: { $0.name == "session" })?.value,
              let instance = components.queryItems?.first(where: { $0.name == "instance" })?.value else {
            return nil
        }
        let identity = AgentAskActivityIdentity(
            workspaceID: workspace,
            sessionID: session,
            activityInstanceID: instance
        )
        let attributes = AgentAskActivityAttributes(
            schemaVersion: AgentAskActivityAttributes.currentSchemaVersion,
            workspaceID: workspace,
            sessionID: session,
            activityInstanceID: instance
        )
        let probe = AgentAskActivityAttributes.ContentState(
            phase: .thinking,
            eventRevision: 1,
            updatedAt: Date(timeIntervalSince1970: 0)
        )
        guard (try? AgentAskActivityPayloadContract.validate(
            attributes: attributes,
            state: probe
        )) != nil else { return nil }
        return AgentAskDeepLink(identity: identity, destination: destination)
    }
}

@MainActor
final class AgentAskDeepLinkRouter: ObservableObject {
    static let shared = AgentAskDeepLinkRouter()

    @Published private(set) var link: AgentAskDeepLink?

    func accept(_ url: URL) -> Bool {
        guard let parsed = AgentAskDeepLink.parse(url) else { return false }
        link = parsed
        return true
    }

    func consume(_ identity: AgentAskActivityIdentity) {
        guard link?.identity == identity else { return }
        link = nil
    }
}
