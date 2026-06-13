import SwiftUI

// 美式社群風格主題：深色底 + 鮮豔珊瑚紅 / 紫漸層、粗體大字
enum BlipColor {
    static let background = Color(hex: "#0a0a0f")
    static let card = Color(hex: "#15151d")
    static let secondary = Color(hex: "#1d1d27")
    static let foreground = Color(hex: "#f6f6f8")
    static let muted = Color(hex: "#9a9aa6")
    static let primary = Color(hex: "#ff3d5e")
    static let accent = Color(hex: "#8b6cff")
    static let border = Color(hex: "#26262f")

    static let gradient = LinearGradient(
        colors: [Color(hex: "#ff3d5e"), Color(hex: "#ff7a3d"), Color(hex: "#8b6cff")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let textGradient = LinearGradient(
        colors: [Color(hex: "#ff3d5e"), Color(hex: "#8b6cff")],
        startPoint: .leading, endPoint: .trailing
    )
}

extension Color {
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let r, g, b: Double
        if s.count == 6 {
            r = Double((v & 0xFF0000) >> 16) / 255
            g = Double((v & 0x00FF00) >> 8) / 255
            b = Double(v & 0x0000FF) / 255
        } else {
            r = 1; g = 0.24; b = 0.37 // fallback 珊瑚紅
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

let PRESET_COLORS = ["#ff3d5e", "#ff7a3d", "#ffc83d", "#3dd68c", "#3da5ff", "#8b6cff", "#ff5ca8", "#16161d"]
let REACTION_EMOJIS = ["🔥", "❤️", "😂", "👀", "😮", "💯"]
