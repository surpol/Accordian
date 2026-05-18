import AppKit

let width = 560
let height = 280
let image = NSImage(size: NSSize(width: width, height: height))

image.lockFocus()
NSColor(calibratedRed: 0.96, green: 0.97, blue: 0.99, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

let blue = NSColor(calibratedRed: 0.10, green: 0.45, blue: 0.90, alpha: 1)
let green = NSColor(calibratedRed: 0.20, green: 0.66, blue: 0.33, alpha: 1)
let text = NSColor(calibratedRed: 0.13, green: 0.14, blue: 0.16, alpha: 1)
let muted = NSColor(calibratedRed: 0.37, green: 0.39, blue: 0.42, alpha: 1)

let logoRect = NSRect(x: 36, y: 188, width: 48, height: 48)
let logoPath = NSBezierPath(roundedRect: logoRect, xRadius: 16, yRadius: 16)
blue.setFill()
logoPath.fill()
let smile = NSBezierPath()
smile.lineWidth = 6
green.setStroke()
smile.move(to: NSPoint(x: 48, y: 211))
smile.curve(to: NSPoint(x: 72, y: 211), controlPoint1: NSPoint(x: 54, y: 199), controlPoint2: NSPoint(x: 66, y: 199))
smile.stroke()

func draw(_ string: String, x: CGFloat, y: CGFloat, size: CGFloat, weight: NSFont.Weight, color: NSColor, width: CGFloat) {
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: color
    ]
    string.draw(with: NSRect(x: x, y: y, width: width, height: size * 2.4), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attrs)
}

draw("Accordian.ai", x: 102, y: 184, size: 42, weight: .bold, color: text, width: 420)
draw("A Gemma 4 tutor that turns notes into personalized quiz journeys.", x: 36, y: 124, size: 23, weight: .regular, color: muted, width: 486)

let chips = ["Gemma 4", "SQLite memory", "Offline-first"]
var chipX: CGFloat = 36
for chip in chips {
    let chipWidth = CGFloat(72 + chip.count * 7)
    let rect = NSRect(x: chipX, y: 70, width: chipWidth, height: 34)
    NSColor.white.setFill()
    NSBezierPath(roundedRect: rect, xRadius: 17, yRadius: 17).fill()
    NSColor(calibratedRed: 0.87, green: 0.89, blue: 0.92, alpha: 1).setStroke()
    NSBezierPath(roundedRect: rect, xRadius: 17, yRadius: 17).stroke()
    draw(chip, x: chipX + 14, y: 76, size: 14, weight: .semibold, color: blue, width: chipWidth - 20)
    chipX += chipWidth + 10
}

let track = NSBezierPath(roundedRect: NSRect(x: 36, y: 34, width: 488, height: 10), xRadius: 5, yRadius: 5)
NSColor(calibratedRed: 0.86, green: 0.88, blue: 0.92, alpha: 1).setFill()
track.fill()
let fill = NSBezierPath(roundedRect: NSRect(x: 36, y: 34, width: 360, height: 10), xRadius: 5, yRadius: 5)
green.setFill()
fill.fill()

image.unlockFocus()

let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
let data = rep.representation(using: .png, properties: [:])!
try data.write(to: URL(fileURLWithPath: "/Users/suryapolina/Desktop/kaggle/Waves/docs/submission-assets/kaggle-cover.png"))
