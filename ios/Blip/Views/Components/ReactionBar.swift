import SwiftUI

// 一鍵表情回應列
struct ReactionBar: View {
    let reactions: [String: Int]
    let myReaction: String?
    let onReact: (String) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(REACTION_EMOJIS, id: \.self) { emoji in
                let count = reactions[emoji] ?? 0
                let active = myReaction == emoji
                Button { onReact(emoji) } label: {
                    HStack(spacing: 4) {
                        Text(emoji).font(.body)
                        if count > 0 {
                            Text("\(count)").font(.caption2.weight(.semibold)).monospacedDigit()
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(active ? BlipColor.primary : BlipColor.secondary)
                    .foregroundColor(active ? .white : BlipColor.foreground)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
