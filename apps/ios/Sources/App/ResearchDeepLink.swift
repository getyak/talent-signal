import Foundation

struct ResearchActivityIdentity: Codable, Equatable, Hashable {
    let scopeID: String
    let taskID: String
    let activityInstanceID: String
}

enum ResearchDeepLinkDestination: String, Codable, Equatable {
    case status
    case review
}

struct ResearchDeepLink: Equatable {
    let identity: ResearchActivityIdentity
    let destination: ResearchDeepLinkDestination

    static func url(
        identity: ResearchActivityIdentity,
        destination: ResearchDeepLinkDestination
    ) -> URL? {
        var components = URLComponents()
        components.scheme = "talentsignal"
        components.host = "synthetic-research"
        components.path = "/\(destination.rawValue)"
        components.queryItems = [
            URLQueryItem(name: "scope", value: identity.scopeID),
            URLQueryItem(name: "task", value: identity.taskID),
            URLQueryItem(name: "instance", value: identity.activityInstanceID),
        ]
        return components.url
    }

    static func parse(_ url: URL) -> ResearchDeepLink? {
        guard url.scheme == "talentsignal",
              url.host == "synthetic-research",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let destination = ResearchDeepLinkDestination(
                rawValue: url.path.trimmingCharacters(
                    in: CharacterSet(charactersIn: "/")
                )
              ),
              let scopeID = components.researchValue(named: "scope"),
              let taskID = components.researchValue(named: "task"),
              let instanceID = components.researchValue(named: "instance"),
              components.queryItems?.count == 3,
              [scopeID, taskID, instanceID].allSatisfy(
                ResearchActivityPayloadContract.isValidOpaqueIdentifier
              ) else {
            return nil
        }
        return ResearchDeepLink(
            identity: ResearchActivityIdentity(
                scopeID: scopeID,
                taskID: taskID,
                activityInstanceID: instanceID
            ),
            destination: destination
        )
    }
}

private extension URLComponents {
    func researchValue(named name: String) -> String? {
        guard let values = queryItems?.filter({ $0.name == name }),
              values.count == 1 else {
            return nil
        }
        return values[0].value
    }
}
