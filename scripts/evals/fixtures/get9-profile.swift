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
label("Demo Social / 个人主页", 55, 740, 34, bold: true)
NSColor.white.setFill()
NSBezierPath(roundedRect: NSRect(x: 45, y: 105, width: 910, height: 575), xRadius: 22, yRadius: 22).fill()
label("陈夏", 95, 555, 68, bold: true)
label("@chenxia_design", 95, 475, 38, gray: true)
label("产品设计师 · LatticeWorks", 95, 365, 42)
label("上海", 95, 290, 32, gray: true)
label("个人简介：关注协作工具与设计系统。", 95, 185, 30)
label("Demo Social is a fictional platform. All details are test data.", 55, 40, 24, gray: true)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
