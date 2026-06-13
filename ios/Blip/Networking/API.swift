import Foundation

/// 對應後端各 tRPC procedure 的型別化呼叫。
enum API {
    private static let c = TRPCClient.shared

    // MARK: Profile
    static func myProfile() async throws -> MyProfile? {
        try await c.query("profile.me", output: Optional<MyProfile>.self)
    }

    static func checkUsername(_ username: String) async throws -> Bool {
        try await c.query("profile.checkUsername", input: ["username": username], output: UsernameCheck.self).available
    }

    struct ProfileSaveInput: Encodable {
        let username: String
        let displayName: String
        var bio: String?
        var themeColor: String?
        var cardStyle: String?
        var avatar: String?
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(username, forKey: .username)
            try c.encode(displayName, forKey: .displayName)
            try c.encodeIfPresent(bio, forKey: .bio)
            try c.encodeIfPresent(themeColor, forKey: .themeColor)
            try c.encodeIfPresent(cardStyle, forKey: .cardStyle)
            try c.encodeIfPresent(avatar, forKey: .avatar)
        }
        enum CodingKeys: String, CodingKey { case username, displayName, bio, themeColor, cardStyle, avatar }
    }

    static func saveProfile(_ input: ProfileSaveInput) async throws {
        _ = try await c.mutate("profile.save", input: input, output: SuccessResult.self)
    }

    static func publicProfile(userId: Int) async throws -> PublicProfile {
        try await c.query("profile.get", input: ["userId": userId], output: PublicProfile.self)
    }

    // MARK: Posts
    struct CreatePostInput: Encodable {
        let media: String
        let mediaType: String
        var caption: String?
        let lat: Double
        let lng: Double
        var durationSec: Double?
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(media, forKey: .media)
            try c.encode(mediaType, forKey: .mediaType)
            try c.encodeIfPresent(caption, forKey: .caption)
            try c.encode(lat, forKey: .lat)
            try c.encode(lng, forKey: .lng)
            try c.encodeIfPresent(durationSec, forKey: .durationSec)
        }
        enum CodingKeys: String, CodingKey { case media, mediaType, caption, lat, lng, durationSec }
    }

    static func createPost(_ input: CreatePostInput) async throws -> CreatePostResult {
        try await c.mutate("post.create", input: input, output: CreatePostResult.self)
    }

    struct LatLng: Encodable { let lat: Double; let lng: Double }

    static func nearby(lat: Double, lng: Double) async throws -> [FeedPost] {
        try await c.query("post.nearby", input: LatLng(lat: lat, lng: lng), output: [FeedPost].self)
    }

    static func following() async throws -> [FeedPost] {
        try await c.query("post.following", output: [FeedPost].self)
    }

    static func mine() async throws -> [FeedPost] {
        try await c.query("post.mine", output: [FeedPost].self)
    }

    static func react(postId: Int, emoji: String) async throws {
        struct In: Encodable { let postId: Int; let emoji: String }
        _ = try await c.mutate("post.react", input: In(postId: postId, emoji: emoji), output: SuccessResult.self)
    }

    static func unreact(postId: Int) async throws {
        _ = try await c.mutate("post.unreact", input: ["postId": postId], output: SuccessResult.self)
    }

    static func savePost(postId: Int, saved: Bool) async throws {
        struct In: Encodable { let postId: Int; let saved: Bool }
        _ = try await c.mutate("post.save", input: In(postId: postId, saved: saved), output: SuccessResult.self)
    }

    static func deletePost(postId: Int) async throws {
        _ = try await c.mutate("post.delete", input: ["postId": postId], output: SuccessResult.self)
    }

    // MARK: Follow
    static func follow(userId: Int) async throws {
        _ = try await c.mutate("follow.follow", input: ["userId": userId], output: SuccessResult.self)
    }

    static func unfollow(userId: Int) async throws {
        _ = try await c.mutate("follow.unfollow", input: ["userId": userId], output: SuccessResult.self)
    }
}
