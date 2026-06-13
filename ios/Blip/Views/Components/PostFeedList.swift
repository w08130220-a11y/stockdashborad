import SwiftUI

struct PostFeedList: View {
    let posts: [FeedPost]
    let onReact: (FeedPost, String) -> Void
    let onOpenProfile: (Int) -> Void
    var allowOwnerActions = false
    var onSave: ((FeedPost, Bool) -> Void)? = nil
    var onDelete: ((FeedPost) -> Void)? = nil

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(posts) { post in
                    PostCardView(
                        post: post,
                        onReact: { onReact(post, $0) },
                        onOpenProfile: onOpenProfile,
                        onSave: allowOwnerActions ? { saved in onSave?(post, saved) } : nil,
                        onDelete: allowOwnerActions ? { onDelete?(post) } : nil
                    )
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
    }
}

struct ScreenHeader: View {
    let title: String
    var subtitle: String? = nil
    var trailing: AnyView? = nil

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundStyle(BlipColor.textGradient)
                if let subtitle {
                    Text(subtitle).font(.caption).foregroundColor(BlipColor.muted)
                }
            }
            Spacer()
            trailing
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }
}

struct EmptyState: View {
    let icon: String
    let text: String
    var body: some View {
        VStack(spacing: 10) {
            Text(icon).font(.system(size: 48))
            Text(text).font(.subheadline).foregroundColor(BlipColor.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }
}
