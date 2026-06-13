import SwiftUI
import AVKit

struct PostCardView: View {
    let post: FeedPost
    let onReact: (String) -> Void
    let onOpenProfile: (Int) -> Void
    var onSave: ((Bool) -> Void)? = nil
    var onDelete: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            media
            VStack(alignment: .leading, spacing: 12) {
                if !post.caption.isEmpty {
                    Text(post.caption).font(.subheadline).foregroundColor(BlipColor.foreground)
                }
                ReactionBar(reactions: post.reactions, myReaction: post.myReaction, onReact: onReact)
            }
            .padding(14)
        }
        .background(BlipColor.card)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(BlipColor.border, lineWidth: 1))
    }

    private var header: some View {
        HStack(spacing: 10) {
            Button { onOpenProfile(post.author.userId) } label: {
                HStack(spacing: 10) {
                    AvatarView(urlString: post.author.avatarUrl, name: post.author.displayName, colorHex: post.author.themeColor, size: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author.displayName).font(.subheadline.weight(.bold)).foregroundColor(BlipColor.foreground)
                        Text("@\(post.author.username)").font(.caption).foregroundColor(BlipColor.muted)
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer()
            if let km = post.distanceKm {
                Text("📍 \(km, specifier: "%.1f") km").font(.caption.weight(.semibold)).foregroundColor(BlipColor.muted)
            }
            CountdownView(expiresAt: post.expiresDate)
            if post.mine {
                Menu {
                    if let onSave {
                        Button(post.savedByOwner ? "取消保存" : "保存回憶", systemImage: "bookmark") { onSave(!post.savedByOwner) }
                    }
                    if let onDelete {
                        Button("刪除", systemImage: "trash", role: .destructive) { onDelete() }
                    }
                } label: {
                    Image(systemName: "ellipsis").foregroundColor(BlipColor.muted).padding(4)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    @ViewBuilder private var media: some View {
        let url = Config.mediaURL(post.mediaUrl)
        ZStack(alignment: .topLeading) {
            Color.black
            if post.isVideo, let url {
                VideoPlayer(player: AVPlayer(url: url))
            } else if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    case .empty: ProgressView().tint(.white)
                    default: Image(systemName: "photo").foregroundColor(.gray)
                    }
                }
            }
            if post.savedByOwner {
                Text("已保存")
                    .font(.caption2.weight(.semibold)).foregroundColor(.white)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(.black.opacity(0.6)).clipShape(Capsule())
                    .padding(12)
            }
        }
        .aspectRatio(1, contentMode: .fill)
        .frame(maxWidth: .infinity)
        .clipped()
    }
}
