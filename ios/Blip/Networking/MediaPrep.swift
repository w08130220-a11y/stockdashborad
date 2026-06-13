import UIKit
import AVFoundation

// 把選到的媒體準備成後端要的 base64 data URL
enum MediaPrep {
    /// 圖片：縮到最大邊長 + JPEG 壓縮 → data:image/jpeg;base64,...
    static func image(from data: Data, maxEdge: CGFloat = 1280, quality: CGFloat = 0.82) -> String? {
        guard let ui = UIImage(data: data) else { return nil }
        let scaled = resize(ui, maxEdge: maxEdge)
        guard let jpeg = scaled.jpegData(compressionQuality: quality) else { return nil }
        return "data:image/jpeg;base64," + jpeg.base64EncodedString()
    }

    /// 影片：讀檔轉 base64 data URL，並回傳長度（秒）
    static func video(at url: URL) async -> (dataUrl: String, duration: Double)? {
        let asset = AVURLAsset(url: url)
        let duration: Double
        do {
            let d = try await asset.load(.duration)
            duration = CMTimeGetSeconds(d)
        } catch {
            return nil
        }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let mime = url.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4"
        return ("data:\(mime);base64," + data.base64EncodedString(), duration)
    }

    private static func resize(_ image: UIImage, maxEdge: CGFloat) -> UIImage {
        let longest = max(image.size.width, image.size.height)
        guard longest > maxEdge else { return image }
        let scale = maxEdge / longest
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
