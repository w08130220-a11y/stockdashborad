import SwiftUI

@main
struct BlipApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var location = LocationManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(location)
                .preferredColorScheme(.dark)
                .tint(BlipColor.primary)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            BlipColor.background.ignoresSafeArea()
            switch appState.phase {
            case .loading:
                SplashView()
            case .onboarding:
                OnboardingView()
            case .ready:
                MainTabView()
            }
        }
        .task { await appState.bootstrap() }
    }
}

struct SplashView: View {
    var body: some View {
        Text("Blip")
            .font(.system(size: 48, weight: .heavy, design: .rounded))
            .foregroundStyle(BlipColor.textGradient)
    }
}
