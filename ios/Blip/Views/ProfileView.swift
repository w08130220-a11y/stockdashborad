import SwiftUI

struct ProfileView: View {
    let openProfile: (Int) -> Void
    @EnvironmentObject var appState: AppState
    @State private var posts: [FeedPost] = []
    @State private var editing = false

    var body: some View {
        ScrollView {
            if let p = appState.myProfile {
                VStack(alignment: .leading, spacing: 0) {
                    banner(p)
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .bottom) {
                            AvatarView(urlString: p.avatarUrl, name: p.displayName, colorHex: p.themeColor, size: 92)
                                .overlay(Circle().stroke(BlipColor.background, lineWidth: 4))
                                .offset(y: -46).padding(.bottom, -46)
                            Spacer()
                            Button { editing = true } label: {
                                Label("編輯", systemImage: "gearshape")
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14).padding(.vertical, 8)
                                    .background(BlipColor.secondary).clipShape(Capsule())
                            }
                            .buttonStyle(.plain).foregroundColor(BlipColor.foreground)
                        }
                        Text(p.displayName).font(.title2.weight(.heavy))
                        Text("@\(p.username)").font(.subheadline).foregroundColor(BlipColor.muted)
                        if let bio = p.bio, !bio.isEmpty { Text(bio).font(.subheadline) }
                        stats(followers: p.followers, following: p.following, streak: p.streakCount)
                    }
                    .padding(.horizontal, 18)

                    Text("我的分享").font(.subheadline.weight(.bold))
                        .foregroundColor(BlipColor.muted).padding(.horizontal, 18).padding(.top, 18)

                    if posts.isEmpty {
                        EmptyState(icon: "📷", text: "還沒有分享，按下方 ＋ 開始吧").frame(height: 200)
                    } else {
                        PostFeedList(posts: posts, onReact: react, onOpenProfile: openProfile,
                                     allowOwnerActions: true, onSave: save, onDelete: remove)
                    }
                }
            } else {
                EmptyState(icon: "👤", text: "載入中…")
            }
        }
        .background(BlipColor.background.ignoresSafeArea())
        .foregroundColor(BlipColor.foreground)
        .task { await load() }
        .sheet(isPresented: $editing) { OnboardingView() }
    }

    private func banner(_ p: MyProfile) -> some View {
        LinearGradient(colors: [Color(hex: p.themeColor), BlipColor.accent],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
            .frame(height: 120)
    }

    private func stats(followers: Int, following: Int, streak: Int) -> some View {
        HStack(spacing: 20) {
            stat(followers, "粉絲")
            stat(following, "追蹤中")
            if streak > 0 { Text("🔥 \(streak) 天連續").font(.subheadline.weight(.semibold)) }
        }
        .padding(.top, 4)
    }
    private func stat(_ n: Int, _ label: String) -> some View {
        HStack(spacing: 4) {
            Text("\(n)").font(.subheadline.weight(.heavy))
            Text(label).font(.subheadline).foregroundColor(BlipColor.muted)
        }
    }

    private func load() async {
        await appState.refreshProfile()
        if let result = try? await API.mine() { posts = result }
    }
    private func react(_ post: FeedPost, _ emoji: String) {
        Task {
            if post.myReaction == emoji { try? await API.unreact(postId: post.id) }
            else { try? await API.react(postId: post.id, emoji: emoji) }
            await load()
        }
    }
    private func save(_ post: FeedPost, _ saved: Bool) {
        Task { try? await API.savePost(postId: post.id, saved: saved); await load() }
    }
    private func remove(_ post: FeedPost) {
        Task { try? await API.deletePost(postId: post.id); await load() }
    }
}
