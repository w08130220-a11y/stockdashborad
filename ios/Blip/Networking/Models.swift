import Foundation

// 與後端 tRPC DTO 對應的模型（日期以 ISO 字串接收）

struct AuthorCard: Codable, Hashable {
    let userId: Int
    let username: String
    let displayName: String
    let avatarUrl: String?
    let themeColor: String
}

struct FeedPost: Codable, Identifiable, Hashable {
    let id: Int
    let mediaType: String        // "image" | "video"
    let mediaUrl: String
    let caption: String
    let createdAt: String
    let expiresAt: String
    let savedByOwner: Bool
    let archived: Bool
    let mine: Bool
    let author: AuthorCard
    let reactions: [String: Int]
    let myReaction: String?
    let distanceKm: Double?
    let lat: Double
    let lng: Double

    var isVideo: Bool { mediaType == "video" }
    var expiresDate: Date? { ISO8601Helper.date(from: expiresAt) }
}

struct MyProfile: Codable {
    let userId: Int
    let username: String
    let displayName: String
    let bio: String?
    let avatarUrl: String?
    let themeColor: String
    let cardStyle: String
    let streakCount: Int
    let lastPostDate: String?
    let followers: Int
    let following: Int
}

struct PublicProfile: Codable {
    let userId: Int
    let username: String
    let displayName: String
    let bio: String?
    let avatarUrl: String?
    let themeColor: String
    let cardStyle: String
    let streakCount: Int
    let followers: Int
    let following: Int
    let isFollowing: Bool
    let canFollow: Bool
    let activePosts: [FeedPost]
}

struct UsernameCheck: Codable { let available: Bool }
struct CreatePostResult: Codable { let id: Int; let mediaUrl: String }
struct SuccessResult: Codable { let success: Bool }

enum ISO8601Helper {
    private static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func date(from s: String) -> Date? {
        withFractional.date(from: s) ?? plain.date(from: s)
    }
}
