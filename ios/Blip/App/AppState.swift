import SwiftUI

@MainActor
final class AppState: ObservableObject {
    enum Phase { case loading, onboarding, ready }

    @Published var phase: Phase = .loading
    @Published var myProfile: MyProfile?

    func bootstrap() async {
        do {
            let profile = try await API.myProfile()
            myProfile = profile
            phase = (profile == nil) ? .onboarding : .ready
        } catch {
            // 後端尚未連上時，仍進到 onboarding 讓使用者重試
            phase = .onboarding
        }
    }

    func refreshProfile() async {
        if let profile = try? await API.myProfile() {
            myProfile = profile
            phase = (profile == nil) ? .onboarding : .ready
        }
    }
}
