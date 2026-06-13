import SwiftUI

struct FollowingView: View {
    let openProfile: (Int) -> Void
    @State private var posts: [FeedPost] = []
    @State private var loading = true

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "追蹤中", subtitle: "你追蹤的人的分享，不受距離限制")
            if loading {
                EmptyState(icon: "✨", text: "載入中…")
            } else if posts.isEmpty {
                EmptyState(icon: "👀", text: "在「附近」遇到喜歡的人，追蹤後就會出現在這裡")
            } else {
                PostFeedList(posts: posts, onReact: react, onOpenProfile: openProfile)
            }
        }
        .task { await load() }
    }

    private func load() async {
        loading = true
        if let result = try? await API.following() { posts = result }
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
