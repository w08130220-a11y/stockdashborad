import SwiftUI

enum BlipTab: Hashable { case nearby, following, radar, me }

struct MainTabView: View {
    @State private var tab: BlipTab = .nearby
    @State private var path = NavigationPath()
    @State private var creating = false

    var body: some View {
        NavigationStack(path: $path) {
            ZStack(alignment: .bottom) {
                BlipColor.background.ignoresSafeArea()

                Group {
                    switch tab {
                    case .nearby:    NearbyView(openProfile: openProfile)
                    case .following: FollowingView(openProfile: openProfile)
                    case .radar:     RadarView(openProfile: openProfile)
                    case .me:        ProfileView(openProfile: openProfile)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                BlipTabBar(tab: $tab, onCreate: { creating = true })
            }
            .navigationDestination(for: Int.self) { userId in
                UserProfileView(userId: userId)
            }
            .fullScreenCover(isPresented: $creating) {
                CreatePostView()
            }
        }
    }

    private func openProfile(_ userId: Int) { path.append(userId) }
}

struct BlipTabBar: View {
    @Binding var tab: BlipTab
    let onCreate: () -> Void

    var body: some View {
        HStack {
            item(.nearby, "附近", "safari")
            item(.following, "追蹤", "sparkles")
            createButton
            item(.radar, "雷達", "dot.radiowaves.left.and.right")
            item(.me, "我", "person.fill")
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .background(.ultraThinMaterial)
        .overlay(Rectangle().frame(height: 1).foregroundColor(BlipColor.border), alignment: .top)
    }

    private func item(_ t: BlipTab, _ label: String, _ icon: String) -> some View {
        Button { tab = t } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 20, weight: tab == t ? .bold : .regular))
                Text(label).font(.system(size: 10, weight: .semibold))
            }
            .foregroundColor(tab == t ? BlipColor.primary : BlipColor.muted)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var createButton: some View {
        Button(action: onCreate) {
            Image(systemName: "plus")
                .font(.system(size: 26, weight: .heavy)).foregroundColor(.white)
                .frame(width: 56, height: 56).background(BlipColor.gradient)
                .clipShape(Circle()).shadow(color: BlipColor.primary.opacity(0.4), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .offset(y: -16)
        .frame(maxWidth: .infinity)
    }
}
