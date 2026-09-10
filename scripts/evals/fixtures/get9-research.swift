// Deterministic synthetic image source. No real person's private information.
import AppKit
let size = NSSize(width: 1000, height: 900)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.96, green: 0.97, blue: 0.98, alpha: 1).setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
func label(_ text: String, _ x: CGFloat, _ y: CGFloat, _ font: CGFloat, bold: Bool = false, gray: Bool = false) {
  (text as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [
    .font: bold ? NSFont.boldSystemFont(ofSize: font) : NSFont.systemFont(ofSize: font),
    .foregroundColor: gray ? NSColor.darkGray : NSColor.black
  ])
}
label("SYNTHETIC EVALUATION · NOT A REAL PERSON", 55, 825, 24, gray: true)
label("Demo Chat · 与陈夏的对话", 55, 740, 34, bold: true)
label("2026年9月9日 10:00", 300, 675, 24, gray: true)
NSColor.white.setFill()
NSBezierPath(roundedRect: NSRect(x: 45, y: 360, width: 865, height: 240), xRadius: 22, yRadius: 22).fill()
label("陈夏", 75, 545, 28, bold: true)
label("我是陈夏，公开账号 @chenxia_design。", 75, 478, 31)
label("我在 LatticeWorks 做产品设计。", 75, 416, 31)
NSColor(calibratedRed: 0.8, green: 0.92, blue: 0.84, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 350, y: 180, width: 600, height: 130), xRadius: 22, yRadius: 22).fill()
label("我：收到，谢谢你。", 395, 230, 34)
label("Demo Chat is fictional. All details are synthetic test data.", 55, 40, 24, gray: true)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
