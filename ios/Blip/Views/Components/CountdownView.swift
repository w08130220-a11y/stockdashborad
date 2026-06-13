import SwiftUI

// 顯示距離 24 小時銷毀的剩餘時間
struct CountdownView: View {
    let expiresAt: Date?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            let text = formatted(at: context.date)
            HStack(spacing: 2) {
                Text("⏳")
                Text(text)
            }
            .font(.caption.weight(.semibold))
            .foregroundColor(isUrgent(at: context.date) ? BlipColor.primary : BlipColor.muted)
        }
    }

    private func remaining(at now: Date) -> TimeInterval {
        guard let expiresAt else { return 0 }
        return expiresAt.timeIntervalSince(now)
    }

    private func isUrgent(at now: Date) -> Bool { remaining(at: now) < 3600 }

    private func formatted(at now: Date) -> String {
        let r = remaining(at: now)
        if r <= 0 { return "即將消失" }
        let totalMin = Int(r / 60)
        let h = totalMin / 60, m = totalMin % 60
        if h > 0 { return "\(h)h \(m)m" }
        if m > 0 { return "\(m)m" }
        return "\(Int(r))s"
    }
}
