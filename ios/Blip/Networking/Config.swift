import Foundation

enum Config {
    /// 後端基底位址。
    /// - 模擬器：用 http://localhost:3000
    /// - 實機：改成你 Mac 的區網 IP，例如 http://192.168.0.10:3000
    /// 之後正式上線改成 https 網域即可。
    static let baseURL = URL(string: "http://localhost:3000")!

    static var trpcURL: URL { baseURL.appendingPathComponent("api/trpc") }

    /// 把後端回傳的相對媒體路徑（/uploads/xxx）補成完整網址。
    static func mediaURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        return URL(string: baseURL.absoluteString + path)
    }
}
