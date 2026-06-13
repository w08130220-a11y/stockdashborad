import SwiftUI

struct NearbyView: View {
    let openProfile: (Int) -> Void
    @EnvironmentObject var location: LocationManager
    @State private var posts: [FeedPost] = []
    @State private var loading = true

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "附近", subtitle: "3 公里內的限時分享", trailing: AnyView(
                Button { Task { await load() } } label: {
                    Image(systemName: "arrow.clockwise").foregroundColor(BlipColor.foreground)
                }
            ))
            content
        }
        .task { location.request(); await load() }
        .onChange(of: location.coordinate?.latitude) { _ in Task { await load() } }
    }

    @ViewBuilder private var content: some View {
        if !location.isAuthorized {
            VStack(spacing: 14) {
                EmptyState(icon: "📍", text: location.errorText ?? "需要定位才能看到附近的分享")
                Button("開啟定位") { location.request() }
                    .padding(.horizontal, 24).padding(.vertical, 12)
                    .background(BlipColor.gradient).foregroundColor(.white).clipShape(Capsule())
            }
        } else if loading {
            EmptyState(icon: "📡", text: "搜尋附近的分享…")
        } else if posts.isEmpty {
            EmptyState(icon: "🌎", text: "附近還沒有人分享，當第一個吧！")
        } else {
            PostFeedList(posts: posts, onReact: react, onOpenProfile: openProfile)
        }
    }

    private func load() async {
        guard let c = location.coordinate else { loading = false; return }
        loading = true
        if let result = try? await API.nearby(lat: c.latitude, lng: c.longitude) { posts = result }
        loading = false
    }

    private func react(_ post: FeedPost, _ emoji: String) {
        Task {
            if post.myReaction == emoji { try? await API.unreact(postId: post.id) }
            else { try? await API.react(postId: post.id, emoji: emoji) }
            await load()
        }
    }
}
