import SwiftUI

struct AvatarView: View {
    let urlString: String?
    let name: String
    let colorHex: String
    var size: CGFloat = 40

    private var initials: String {
        String(name.trimmingCharacters(in: .whitespaces).prefix(2)).uppercased()
    }

    var body: some View {
        Group {
            if let urlString, let url = Config.mediaURL(urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var placeholder: some View {
        ZStack {
            Color(hex: colorHex)
            Text(initials.isEmpty ? "?" : initials)
                .font(.system(size: size * 0.4, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
        }
    }
}
