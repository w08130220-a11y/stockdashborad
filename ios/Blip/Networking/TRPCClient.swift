import Foundation

struct APIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct NoInput: Encodable {}

/// 極簡 tRPC over HTTP client，對應後端的 superjson transformer。
/// - Query : GET  {base}/{path}?input={"json":<input>}
/// - Mutate: POST {base}/{path}  body={"json":<input>}
/// - 回應  : {"result":{"data":{"json":<output>}}}
/// 認證走 Cookie，URLSession 共享 HTTPCookieStorage 會自動帶上 session。
final class TRPCClient {
    static let shared = TRPCClient()
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieStorage = .shared
        cfg.httpShouldSetCookies = true
        cfg.timeoutIntervalForRequest = 30
        session = URLSession(configuration: cfg)
    }

    // MARK: Public API

    func query<I: Encodable, O: Decodable>(_ path: String, input: I, output: O.Type) async throws -> O {
        let inner = try encoder.encode(input)
        return try await send(path: path, method: "GET", inner: inner, output: O.self)
    }

    func query<O: Decodable>(_ path: String, output: O.Type) async throws -> O {
        try await send(path: path, method: "GET", inner: nil, output: O.self)
    }

    @discardableResult
    func mutate<I: Encodable, O: Decodable>(_ path: String, input: I, output: O.Type) async throws -> O {
        let inner = try encoder.encode(input)
        return try await send(path: path, method: "POST", inner: inner, output: O.self)
    }

    // MARK: Core

    private func send<O: Decodable>(path: String, method: String, inner: Data?, output: O.Type) async throws -> O {
        var request: URLRequest
        if method == "GET" {
            var comps = URLComponents(url: Config.trpcURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
            if let inner {
                let wrapped = wrap(inner)
                comps.queryItems = [URLQueryItem(name: "input", value: String(data: wrapped, encoding: .utf8))]
            }
            request = URLRequest(url: comps.url!)
            request.httpMethod = "GET"
        } else {
            request = URLRequest(url: Config.trpcURL.appendingPathComponent(path))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = wrap(inner)
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if status != 200 {
            throw APIError(message: parseError(data) ?? "伺服器錯誤 (\(status))")
        }
        do {
            let envelope = try decoder.decode(TRPCEnvelope<O>.self, from: data)
            return envelope.result.data.json
        } catch {
            if let msg = parseError(data) { throw APIError(message: msg) }
            throw error
        }
    }

    private func wrap(_ inner: Data?) -> Data {
        guard let inner else { return Data("{}".utf8) }
        var d = Data("{\"json\":".utf8)
        d.append(inner)
        d.append(Data("}".utf8))
        return d
    }

    private func parseError(_ data: Data) -> String? {
        struct ErrEnvelope: Decodable {
            struct Err: Decodable { struct Body: Decodable { let message: String? }; let json: Body }
            let error: Err
        }
        return (try? decoder.decode(ErrEnvelope.self, from: data))?.error.json.message
    }
}

private struct TRPCEnvelope<O: Decodable>: Decodable {
    struct ResultBox: Decodable { let data: DataBox }
    struct DataBox: Decodable { let json: O }
    let result: ResultBox
}
