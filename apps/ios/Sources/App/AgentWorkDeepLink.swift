import Foundation

struct AgentWorkActivityIdentity: Codable, Equatable, Hashable {
    let scopeID: String
    let taskID: String
    let activityInstanceID: String
}

enum AgentWorkDeepLinkDestination: String, Codable, Equatable {
    case status
    case actions
    case resolve
}

struct AgentWorkDeepLink: Equatable {
    let identity: AgentWorkActivityIdentity
    let destination: AgentWorkDeepLinkDestination

    static func url(
        identity: AgentWorkActivityIdentity,
        destination: AgentWorkDeepLinkDestination
    ) -> URL? {
        var components = URLComponents()
        components.scheme = "talentsignal"
        components.host = "agent-work"
        components.path = "/\(destination.rawValue)"
        components.queryItems = [
            URLQueryItem(name: "scope", value: identity.scopeID),
            URLQueryItem(name: "task", value: identity.taskID),
            URLQueryItem(name: "instance", value: identity.activityInstanceID),
        ]
        return components.url
    }

    static func parse(_ url: URL) -> AgentWorkDeepLink? {
        guard url.scheme == "talentsignal",
              url.host == "agent-work",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let destination = AgentWorkDeepLinkDestination(
                rawValue: url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
              ),
              let scopeID = components.value(named: "scope"),
              let taskID = components.value(named: "task"),
              let instanceID = components.value(named: "instance"),
              components.queryItems?.count == 3,
              [scopeID, taskID, instanceID].allSatisfy(
                AgentWorkActivityPayloadContract.isValidOpaqueIdentifier
              ) else {
            return nil
        }
        return AgentWorkDeepLink(
            identity: AgentWorkActivityIdentity(
                scopeID: scopeID,
                taskID: taskID,
                activityInstanceID: instanceID
            ),
            destination: destination
        )
    }
}

private extension URLComponents {
    func value(named name: String) -> String? {
        guard let values = queryItems?.filter({ $0.name == name }),
              values.count == 1 else {
            return nil
        }
        return values[0].value
    }
}
