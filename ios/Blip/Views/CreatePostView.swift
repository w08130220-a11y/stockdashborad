import SwiftUI
import PhotosUI
import AVKit
import CoreTransferable
import UniformTypeIdentifiers

struct Movie: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent("blip-\(UUID().uuidString).mov")
            try? FileManager.default.removeItem(at: copy)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return Movie(url: copy)
        }
    }
}

struct CreatePostView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var location: LocationManager

    @State private var imageItem: PhotosPickerItem?
    @State private var videoItem: PhotosPickerItem?

    @State private var dataUrl: String?
    @State private var mediaType: String?
    @State private var duration: Double?
    @State private var previewImage: UIImage?
    @State private var previewVideoURL: URL?

    @State private var caption = ""
    @State private var busy = false
    @State private var errorText: String?

    private var hasDraft: Bool { dataUrl != nil }

    var body: some View {
        NavigationStack {
            ZStack {
                BlipColor.background.ignoresSafeArea()
                ScrollView {
                    if hasDraft { draftView } else { pickerView }
                }
            }
            .foregroundColor(BlipColor.foreground)
            .navigationTitle("新分享")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "上傳中…" : "分享") { submit() }
                        .fontWeight(.bold).disabled(!hasDraft || busy)
                }
            }
            .task { location.request() }
        }
    }

    private var pickerView: some View {
        VStack(spacing: 16) {
            Text("選擇要分享的內容（圖片，或最長 10 秒的影片）")
                .font(.subheadline).foregroundColor(BlipColor.muted)
                .multilineTextAlignment(.center).padding(.top, 30)

            PhotosPicker(selection: $imageItem, matching: .images) {
                pickRow(icon: "camera.fill", color: BlipColor.primary, title: "照片", subtitle: "從相簿或相機選擇")
            }
            PhotosPicker(selection: $videoItem, matching: .videos) {
                pickRow(icon: "film.fill", color: BlipColor.accent, title: "影片", subtitle: "最長 10 秒")
            }
            if let errorText { Text(errorText).font(.caption).foregroundColor(BlipColor.primary) }
        }
        .padding(20)
        .onChange(of: imageItem) { _ in loadImage() }
        .onChange(of: videoItem) { _ in loadVideo() }
    }

    private func pickRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(spacing: 16) {
            Image(systemName: icon).font(.title2).foregroundColor(color).frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(subtitle).font(.caption).foregroundColor(BlipColor.muted)
            }
            Spacer()
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(BlipColor.secondary).clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private var draftView: some View {
        VStack(spacing: 16) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if let previewVideoURL {
                        VideoPlayer(player: AVPlayer(url: previewVideoURL))
                    } else if let previewImage {
                        Image(uiImage: previewImage).resizable().scaledToFill()
                    }
                }
                .aspectRatio(1, contentMode: .fill).frame(maxWidth: .infinity).clipped()
                .clipShape(RoundedRectangle(cornerRadius: 24))

                Button { reset() } label: {
                    Image(systemName: "xmark").font(.subheadline.weight(.bold)).foregroundColor(.white)
                        .padding(8).background(.black.opacity(0.6)).clipShape(Circle())
                }
                .padding(12)
            }

            TextField("說點什麼…", text: $caption, axis: .vertical)
                .lineLimit(3, reservesSpace: true)
                .padding(12).background(BlipColor.secondary).clipShape(RoundedRectangle(cornerRadius: 16))

            HStack(spacing: 6) {
                Image(systemName: "mappin.and.ellipse")
                if location.coordinate != nil {
                    Text("已取得位置，將分享給附近 3 公里的人")
                } else {
                    Text(location.errorText ?? "定位中…").foregroundColor(BlipColor.primary)
                    Button("重試") { location.request() }.font(.caption.weight(.bold))
                }
                Spacer()
            }
            .font(.caption).foregroundColor(BlipColor.muted)

            if let errorText { Text(errorText).font(.caption).foregroundColor(BlipColor.primary) }
        }
        .padding(16)
    }

    // MARK: load
    private func loadImage() {
        guard let imageItem else { return }
        Task {
            guard let data = try? await imageItem.loadTransferable(type: Data.self),
                  let prepared = MediaPrep.image(from: data) else {
                errorText = "讀取圖片失敗"; return
            }
            previewImage = UIImage(data: data)
            previewVideoURL = nil
            dataUrl = prepared
            mediaType = "image"
            duration = nil
        }
    }

    private func loadVideo() {
        guard let videoItem else { return }
        Task {
            guard let movie = try? await videoItem.loadTransferable(type: Movie.self) else {
                errorText = "讀取影片失敗"; return
            }
            guard let result = await MediaPrep.video(at: movie.url) else {
                errorText = "無法讀取影片"; return
            }
            if result.duration > 10.5 {
                errorText = String(format: "影片 %.1f 秒，超過 10 秒上限", result.duration)
                return
            }
            previewImage = nil
            previewVideoURL = movie.url
            dataUrl = result.dataUrl
            mediaType = "video"
            duration = result.duration
            errorText = nil
        }
    }

    private func reset() {
        dataUrl = nil; mediaType = nil; duration = nil
        previewImage = nil; previewVideoURL = nil
        imageItem = nil; videoItem = nil; errorText = nil
    }

    // MARK: submit
    private func submit() {
        guard let dataUrl, let mediaType else { return }
        guard let c = location.coordinate else {
            errorText = location.errorText ?? "需要定位才能分享"; location.request(); return
        }
        busy = true; errorText = nil
        Task {
            do {
                _ = try await API.createPost(.init(
                    media: dataUrl, mediaType: mediaType,
                    caption: caption.isEmpty ? nil : caption,
                    lat: c.latitude, lng: c.longitude, durationSec: duration
                ))
                dismiss()
            } catch {
                errorText = error.localizedDescription; busy = false
            }
        }
    }
}
