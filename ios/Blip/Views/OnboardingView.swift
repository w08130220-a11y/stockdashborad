import SwiftUI
import PhotosUI

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var displayName = ""
    @State private var bio = ""
    @State private var themeColor = PRESET_COLORS[0]
    @State private var avatarItem: PhotosPickerItem?
    @State private var avatarDataUrl: String?
    @State private var avatarPreview: UIImage?
    @State private var usernameAvailable: Bool?
    @State private var saving = false
    @State private var errorText: String?

    private var usernameValid: Bool {
        username.range(of: "^[a-zA-Z0-9_.]{3,32}$", options: .regularExpression) != nil
    }
    private var canSubmit: Bool {
        usernameValid && !displayName.trimmingCharacters(in: .whitespaces).isEmpty
            && usernameAvailable != false && !saving
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                (Text("歡迎來到 ") + Text("Blip").foregroundColor(BlipColor.primary))
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                Text("打造你的專屬介面，開始分享身邊 24 小時的精彩。")
                    .foregroundColor(BlipColor.muted)

                avatarPicker

                field("帳號名稱") {
                    TextField("例如 jordan_23", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: username) { _ in scheduleUsernameCheck() }
                    if !username.isEmpty && !usernameValid {
                        hint("3-32 字，只能用英數字、底線、句點", color: BlipColor.primary)
                    } else if usernameValid && usernameAvailable == false {
                        hint("這個名稱已被使用", color: BlipColor.primary)
                    } else if usernameValid && usernameAvailable == true {
                        hint("可以使用 ✓", color: Color(hex: "#3dd68c"))
                    }
                }
                field("顯示名稱") { TextField("你的名字", text: $displayName) }
                field("自我介紹（選填）") { TextField("一句話介紹自己", text: $bio) }

                Text("主題色").font(.subheadline.weight(.semibold))
                colorGrid

                if let errorText { hint(errorText, color: BlipColor.primary) }

                Button(action: submit) {
                    Text(saving ? "建立中…" : "開始使用")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .background(BlipColor.gradient).foregroundColor(.white)
                .clipShape(Capsule()).disabled(!canSubmit).opacity(canSubmit ? 1 : 0.5)
                .padding(.top, 8)
            }
            .padding(24)
        }
        .background(BlipColor.background.ignoresSafeArea())
        .foregroundColor(BlipColor.foreground)
    }

    private var avatarPicker: some View {
        HStack {
            Spacer()
            VStack(spacing: 6) {
                PhotosPicker(selection: $avatarItem, matching: .images) {
                    ZStack {
                        if let avatarPreview {
                            Image(uiImage: avatarPreview).resizable().scaledToFill()
                        } else {
                            Color(hex: themeColor)
                            Text(displayName.isEmpty ? "＋" : String(displayName.prefix(1)).uppercased())
                                .font(.system(size: 34, weight: .heavy)).foregroundColor(.white)
                        }
                    }
                    .frame(width: 96, height: 96).clipShape(Circle())
                }
                Text("點一下換頭像").font(.caption).foregroundColor(BlipColor.muted)
            }
            Spacer()
        }
        .onChange(of: avatarItem) { _ in loadAvatar() }
    }

    private var colorGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 12) {
            ForEach(PRESET_COLORS, id: \.self) { c in
                Circle().fill(Color(hex: c)).frame(height: 34)
                    .overlay(Circle().stroke(themeColor == c ? BlipColor.foreground : .clear, lineWidth: 3))
                    .onTapGesture { themeColor = c }
            }
        }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.semibold))
            content()
                .padding(12).background(BlipColor.secondary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
    private func hint(_ text: String, color: Color) -> some View {
        Text(text).font(.caption).foregroundColor(color)
    }

    // MARK: actions
    @State private var checkTask: Task<Void, Never>?
    private func scheduleUsernameCheck() {
        usernameAvailable = nil
        checkTask?.cancel()
        guard usernameValid else { return }
        let name = username
        checkTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            if Task.isCancelled { return }
            let available = try? await API.checkUsername(name)
            if !Task.isCancelled, name == username { usernameAvailable = available }
        }
    }

    private func loadAvatar() {
        guard let avatarItem else { return }
        Task {
            if let data = try? await avatarItem.loadTransferable(type: Data.self),
               let prepped = MediaPrep.image(from: data, maxEdge: 512) {
                avatarPreview = UIImage(data: data)
                avatarDataUrl = prepped
            }
        }
    }

    private func submit() {
        saving = true; errorText = nil
        Task {
            do {
                try await API.saveProfile(.init(
                    username: username, displayName: displayName,
                    bio: bio.isEmpty ? nil : bio, themeColor: themeColor,
                    cardStyle: nil, avatar: avatarDataUrl
                ))
                await appState.refreshProfile()
                dismiss()
            } catch {
                errorText = error.localizedDescription; saving = false
            }
        }
    }
}
