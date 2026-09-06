import SpriteKit
import SwiftUI

/// Fictional, bundled people. No contacts or account data enter this illustration.
@MainActor
final class AuthenticationPortraitScene: SKScene {
    static let anchors: [CGPoint] = [
        .init(x: 0.25, y: 0.67), .init(x: 0.73, y: 0.68),
        .init(x: 0.48, y: 0.88), .init(x: 0.50, y: 0.56),
        .init(x: 0.88, y: 0.47), .init(x: 0.15, y: 0.40),
        .init(x: 0.76, y: 0.27), .init(x: 0.30, y: 0.23),
        .init(x: 0.11, y: 0.88), .init(x: 0.87, y: 0.91),
        .init(x: 0.54, y: 0.28),
    ]
    static let diameters: [CGFloat] = [72, 66, 44, 82, 42, 48, 52, 38, 34, 32, 28]
    private var portraits: [SKSpriteNode] = []
    private var threads: [SKShapeNode] = []
    private var lastTime: TimeInterval = 0
    private var awakeUntil: TimeInterval = 0
    private var expanded = false
    private var dragPoint: CGPoint?
    private var dark = false

    override func didMove(to view: SKView) {
        physicsWorld.gravity = .zero
        guard portraits.isEmpty else { return }
        for index in Self.anchors.indices {
            let thread = SKShapeNode(); thread.lineWidth = 0.65; thread.zPosition = -1
            thread.alpha = 0; addChild(thread); threads.append(thread)
            let diameter = Self.diameters[index]
            let sprite = SKSpriteNode(color: .clear, size: CGSize(width: diameter, height: diameter))
            let border = SKShapeNode(circleOfRadius: diameter / 2)
            border.fillColor = UIColor(red: 0.88, green: 0.86, blue: 0.80, alpha: 1)
            border.strokeColor = .clear; sprite.addChild(border)
            let mask = SKShapeNode(circleOfRadius: diameter / 2 - 1.5)
            mask.fillColor = .white; mask.strokeColor = .clear
            let crop = SKCropNode(); crop.maskNode = mask
            if let image = UIImage(named: "WelcomePortrait\(index + 1)") {
                let picture = SKSpriteNode(texture: SKTexture(image: image))
                picture.size = CGSize(width: diameter - 3, height: diameter - 3)
                crop.addChild(picture)
            }
            sprite.addChild(crop)
            sprite.physicsBody = SKPhysicsBody(circleOfRadius: diameter / 2 + 2)
            sprite.physicsBody?.affectedByGravity = false
            sprite.physicsBody?.allowsRotation = false
            sprite.physicsBody?.restitution = 0.48
            sprite.physicsBody?.friction = 0.35
            sprite.physicsBody?.linearDamping = 0.15
            sprite.physicsBody?.mass = diameter / 72
            sprite.alpha = 0; addChild(sprite); portraits.append(sprite)
        }
        expanded ? reveal() : reset()
    }

    func configure(expanded: Bool, dark: Bool) {
        let revealChanged = self.expanded != expanded
        let appearanceChanged = self.dark != dark
        self.expanded = expanded; self.dark = dark
        guard !portraits.isEmpty else { return }
        if revealChanged { expanded ? reveal() : reset() }
        else if appearanceChanged, expanded { wake() }
    }

    private func reset() {
        dragPoint = nil
        for (index, node) in portraits.enumerated() {
            node.removeAllActions(); node.alpha = 0
            node.physicsBody?.isDynamic = false; node.physicsBody?.velocity = .zero
            node.position = spawnPoint(index)
        }
        for thread in threads { thread.removeAllActions(); thread.alpha = 0 }
        isPaused = true
    }

    private func spawnPoint(_ index: Int) -> CGPoint {
        CGPoint(x: size.width * (0.50 + (CGFloat(index % 5) - 2) * 0.075),
                y: -Self.diameters[index] - CGFloat(index % 3) * 26)
    }

    private func reveal() {
        wake()
        for (index, node) in portraits.enumerated() {
            node.removeAllActions(); node.position = spawnPoint(index); node.alpha = 0
            node.setScale(0.52)
            node.physicsBody?.isDynamic = false; node.physicsBody?.velocity = .zero
            node.run(.sequence([
                .wait(forDuration: Double(index) * 0.035),
                .run { [weak node] in
                    node?.physicsBody?.isDynamic = true
                    node?.physicsBody?.velocity = CGVector(dx: CGFloat(index % 3 - 1) * 80, dy: 530 + CGFloat(index % 4) * 40)
                },
                .group([.fadeIn(withDuration: 0.16), .scale(to: 1, duration: 0.48)]),
            ]))
        }
        // Faces arrive first; the relationship threads are the second reveal.
        for (index, thread) in threads.enumerated() {
            thread.removeAllActions(); thread.alpha = 0
            thread.run(.sequence([.wait(forDuration: 0.65 + Double(index) * 0.025), .fadeIn(withDuration: 0.65)]))
        }
    }

    private func target(_ index: Int) -> CGPoint {
        let point = Self.anchors[index]
        return CGPoint(x: size.width * point.x, y: size.height * point.y)
    }

    override func didChangeSize(_ oldSize: CGSize) { if expanded { wake() } }
    private func wake() { isPaused = false; awakeUntil = 0; lastTime = 0 }

    override func update(_ currentTime: TimeInterval) {
        guard expanded else { isPaused = true; return }
        if awakeUntil == 0 { awakeUntil = currentTime + 4.2 }
        let delta = min(max(currentTime - lastTime, 0), 1.0 / 30)
        lastTime = currentTime
        for (index, node) in portraits.enumerated() where node.physicsBody?.isDynamic == true {
            let anchor = target(index)
            var dx = anchor.x - node.position.x, dy = anchor.y - node.position.y
            if let point = dragPoint {
                let x = node.position.x - point.x, y = node.position.y - point.y
                let distance = max(hypot(x, y), 1)
                if distance < 100 {
                    let repulsion = (100 - distance) * 3
                    dx += x / distance * repulsion; dy += y / distance * repulsion
                }
            }
            // Launch is deliberately exuberant; a damped spring brings every
            // portrait home and keeps the final form completely stationary.
            if let body = node.physicsBody {
                let velocity = body.velocity
                // Work in points/second, avoiding SpriteKit impulse unit scaling.
                body.velocity = CGVector(
                    dx: max(-900, min(900, velocity.dx + (dx * 34 - velocity.dx * 7.4) * delta)),
                    dy: max(-900, min(900, velocity.dy + (dy * 34 - velocity.dy * 7.4) * delta)))
            }
        }
        for (index, thread) in threads.enumerated() {
            let first = portraits[index].position
            let second = portraits[(index + 3) % portraits.count].position
            let path = CGMutablePath(); path.move(to: first)
            path.addQuadCurve(to: second, control: CGPoint(x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 - 10))
            thread.path = path
            thread.strokeColor = (dark ? UIColor.white : UIColor.black).withAlphaComponent(0.085)
        }
        if currentTime > awakeUntil, dragPoint == nil { isPaused = true }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard expanded else { return }; dragPoint = touches.first?.location(in: self); wake()
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) { dragPoint = touches.first?.location(in: self) }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { dragPoint = nil; wake() }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { dragPoint = nil; wake() }
}

struct AuthenticationPortraits: View {
    let expanded: Bool
    @Environment(\.talentSignalReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @State private var scene: AuthenticationPortraitScene = {
        let scene = AuthenticationPortraitScene(size: CGSize(width: 390, height: 310))
        scene.scaleMode = .resizeFill; scene.backgroundColor = .clear
        return scene
    }()

    var body: some View {
        Group {
            if reduceMotion {
                GeometryReader { geometry in
                    if expanded {
                        ForEach(AuthenticationPortraitScene.anchors.indices, id: \.self) { index in
                            let point = AuthenticationPortraitScene.anchors[index]
                            let size = AuthenticationPortraitScene.diameters[index]
                            Image("WelcomePortrait\(index + 1)").resizable().scaledToFill()
                                .frame(width: size, height: size).clipShape(Circle())
                                .position(x: geometry.size.width * point.x, y: geometry.size.height * (1 - point.y))
                        }
                    }
                }
            } else {
                AuthenticationSpriteView(scene: scene, expanded: expanded,
                    dark: colorScheme == .dark, active: scenePhase == .active)
                    .opacity(expanded ? 1 : 0)
                    .allowsHitTesting(expanded)
            }
        }
        .accessibilityHidden(true)
    }
}

/// Keep SKView's lifecycle pause separate from the scene's bounded idle pause.
/// The explicit view/scene ownership lets a hidden introduction resume its
/// arrival actions without carrying a view-level idle pause into the reveal.
private struct AuthenticationSpriteView: UIViewRepresentable {
    let scene: AuthenticationPortraitScene
    let expanded: Bool
    let dark: Bool
    let active: Bool
    func makeUIView(context: Context) -> SKView {
        let view = SKView()
        view.isOpaque = false; view.backgroundColor = .clear
        view.allowsTransparency = true; view.preferredFramesPerSecond = 60
        view.presentScene(scene)
        return view
    }
    func updateUIView(_ view: SKView, context: Context) {
        view.isPaused = !active
        view.isUserInteractionEnabled = expanded
        scene.configure(expanded: expanded, dark: dark)
    }
}
