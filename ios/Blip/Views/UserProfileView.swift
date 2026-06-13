import SwiftUI

struct UserProfileView: View {
    let userId: Int
    @State private var profile: PublicProfile?
    @State private var loading = true
    @State private var working = false

    var body: some View {
        ScrollView {
            if let p = profile {
                VStack(alignment: .leading, spacing: 0) {
                    LinearGradient(colors: [Color(hex: p.themeColor), BlipColor.accent],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                        .frame(height: 130)
                    VStack(alignment: .leading, spacing: 10) {
                        AvatarView(urlString: p.avatarUrl, name: p.displayName, colorHex: p.themeColor, size: 92)
                            .overlay(Circle().stroke(BlipColor.background, lineWidth: 4))
                            .offset(y: -46).padding(.bottom, -46)

                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.displayName).font(.title2.weight(.heavy))
                                Text("@\(p.username)").font(.subheadline).foregroundColor(BlipColor.muted)
                            }
                            Spacer()
                            followButton(p)
                        }
                        if let bio = p.bio, !bio.isEmpty { Text(bio).font(.subheadline) }
                        HStack(spacing: 20) {
                            stat(p.followers, "粉絲"); stat(p.following, "追蹤中")
                            if p.streakCount > 0 { Text("🔥 \(p.streakCount) 天").font(.subheadline.weight(.semibold)) }
                        }

                        Text("現在的分享").font(.subheadline.weight(.bold))
                            .foregroundColor(BlipColor.muted).padding(.top, 12)
                        grid(p.activePosts)
                    }
                    .padding(.horizontal, 18)
                }
            } else if loading {
                EmptyState(icon: "👤", text: "載入中…").frame(height: 400)
            } else {
                EmptyState(icon: "🚫", text: "找不到這個人").frame(height: 400)
            }
        }
        .background(BlipColor.background.ignoresSafeArea())
        .foregroundColor(BlipColor.foreground)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder private func followButton(_ p: PublicProfile) -> some View {
        if p.canFollow {
            if p.isFollowing {
                Button { toggleFollow(false) } label: { capsule("追蹤中", filled: false) }
                    .buttonStyle(.plain).disabled(working)
            } else {
                Button { toggleFollow(true) } label: { capsule("追蹤", filled: true) }
                    .buttonStyle(.plain).disabled(working)
            }
        } else {
            Text("在附近遇到才能追蹤")
                .font(.caption).foregroundColor(BlipColor.muted)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(BlipColor.secondary).clipShape(Capsule())
        }
    }
    private func capsule(_ text: String, filled: Bool) -> some View {
        Text(text).font(.subheadline.weight(.bold))
            .padding(.horizontal, 18).padding(.vertical, 9)
            .background(filled ? AnyShapeStyle(BlipColor.gradient) : AnyShapeStyle(BlipColor.secondary))
            .foregroundColor(filled ? .white : BlipColor.foreground)
            .clipShape(Capsule())
    }
    private func stat(_ n: Int, _ label: String) -> some View {
        HStack(spacing: 4) {
            Text("\(n)").font(.subheadline.weight(.heavy))
            Text(label).font(.subheadline).foregroundColor(BlipColor.muted)
        }
    }
    private func grid(_ posts: [FeedPost]) -> some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)
        return Group {
            if posts.isEmpty {
                Text("目前沒有進行中的分享").font(.caption).foregroundColor(BlipColor.muted)
                    .frame(maxWidth: .infinity).padding(.vertical, 30)
            } else {
                LazyVGrid(columns: cols, spacing: 4) {
                    ForEach(posts) { post in
                        AsyncImage(url: Config.mediaURL(post.mediaUrl)) { img in
                            img.resizable().scaledToFill()
                        } placeholder: { Color.black }
                        .frame(height: 120).clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(.bottom, 30)
            }
        }
    }

    private func load() async {
        loading = true
        profile = try? await API.publicProfile(userId: userId)
        loading = false
    }
    private func toggleFollow(_ on: Bool) {
        working = true
        Task {
            if on { try? await API.follow(userId: userId) }
            else { try? await API.unfollow(userId: userId) }
            await load(); working = false
        }
    }
}
