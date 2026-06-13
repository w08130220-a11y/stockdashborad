import SwiftUI
import CoreLocation

struct RadarView: View {
    let openProfile: (Int) -> Void
    @EnvironmentObject var location: LocationManager
    @State private var posts: [FeedPost] = []

    private let radiusKm = 3.0

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "雷達", subtitle: "附近正在發生什麼")
            if !location.isAuthorized {
                EmptyState(icon: "🛰️", text: location.errorText ?? "需要定位")
            } else {
                radar
                Text(posts.isEmpty ? "附近還很安靜…" : "附近有 \(posts.count) 則分享，點圓點看是誰")
                    .font(.subheadline).foregroundColor(BlipColor.muted).padding(.top, 16)
                Spacer()
            }
        }
        .task { location.request(); await load() }
        .onChange(of: location.coordinate?.latitude) { _ in Task { await load() } }
    }

    private var radar: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height) - 32
            ZStack {
                ForEach([1.0, 0.66, 0.33], id: \.self) { r in
                    Circle().stroke(BlipColor.border, lineWidth: 1)
                        .frame(width: side * r, height: side * r)
                }
                Circle().fill(BlipColor.gradient).frame(width: 16, height: 16)

                if let c = location.coordinate {
                    ForEach(posts) { post in
                        dot(for: post, center: c, side: side)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(height: 340)
        .padding(.horizontal, 16)
    }

    private func dot(for post: FeedPost, center: CLLocationCoordinate2D, side: CGFloat) -> some View {
        let dn = (post.lat - center.latitude) * 110540
        let de = (post.lng - center.longitude) * 111320 * cos(center.latitude * .pi / 180)
        let r = min(1.0, (dn * dn + de * de).squareRoot() / (radiusKm * 1000))
        let angle = atan2(de, dn)
        let maxR = side / 2
        let x = CGFloat(sin(angle) * r) * maxR
        let y = -CGFloat(cos(angle) * r) * maxR
        return Button { openProfile(post.author.userId) } label: {
            Text(String(post.author.displayName.prefix(1)).uppercased())
                .font(.system(size: 11, weight: .heavy)).foregroundColor(.white)
                .frame(width: 28, height: 28).background(Color(hex: post.author.themeColor))
                .clipShape(Circle()).overlay(Circle().stroke(BlipColor.background, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .offset(x: x, y: y)
    }

    private func load() async {
        guard let c = location.coordinate else { return }
        if let result = try? await API.nearby(lat: c.latitude, lng: c.longitude) { posts = result }
    }
}
