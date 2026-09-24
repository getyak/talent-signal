import WebKit

/// Page JavaScript cannot call this handler or manufacture a trusted click.
/// The isolated world carries only an update link; native code validates its
/// origin, main frame, and currently offered version before granting consent.
@MainActor
final class DesktopUpdateClickBridge: NSObject, WKScriptMessageHandler {
    static let world = WKContentWorld.world(name: "TalentSignalUpdateConsent")
    static let name = "installDesktopUpdate"
    static let script = """
    document.addEventListener('click', event => {
      if (!event.isTrusted || event.button !== 0) return;
      const link = event.composedPath().find(node => node instanceof HTMLAnchorElement);
      if (!link || !link.href.startsWith('talentsignal-desktop://install-update?')) return;
      event.preventDefault();
      window.webkit.messageHandlers.installDesktopUpdate.postMessage(link.href);
    }, true);
    """
    private let onClick: (URL, WKFrameInfo) -> Void
    static var userScript: WKUserScript {
        WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world)
    }

    init(controller: WKUserContentController, onClick: @escaping (URL, WKFrameInfo) -> Void) {
        self.onClick = onClick
        super.init()
        controller.add(self, contentWorld: Self.world, name: Self.name)
        controller.addUserScript(Self.userScript)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.name, message.world == Self.world,
              let value = message.body as? String, let url = URL(string: value) else { return }
        onClick(url, message.frameInfo)
    }
}
