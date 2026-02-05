import Foundation

#if DEBUG

enum OverviewPreviewMocks {
  static var overview: Overview {
    Overview(
      workspace: .init(id: "w_123", name: "Company Name", slug: "company"),
      bumpMessage: "Here’s your pulse bump for today, let’s make it a great one.",
      pulse: [
        .init(id: "c1", icon: "🚀", title: "Think about long-term growth", body: "Where are we headed in the next 1–3 years? Let’s brainstorm and jot down some milestones."),
        .init(id: "c2", icon: "⭐️", title: "Make customer experience top-notch", body: "How can we make our product even better for our customers? Think of ways to enhance their journey with us."),
        .init(id: "c3", icon: "💡", title: "Let’s inspire innovation", body: "Don’t be afraid to share those bold ideas. We thrive on creative solutions, so let’s get creative."),
      ],
      focus: [
        .init(id: "f1", icon: "sf:calendar", title: "Focus on roadmap for Q3", subtitle: "Roadmap planning meeting in 30m"),
        .init(id: "f2", icon: "sf:envelope", title: "Customer feedback follow-up", subtitle: "From Gmail · 15m ago"),
      ],
      calendar: [
        .init(id: "e1", start: Self.todayAt(hour: 10, minute: 0), end: Self.todayAt(hour: 10, minute: 30), title: "Team Standup"),
        .init(id: "e2", start: Self.todayAt(hour: 11, minute: 30), end: Self.todayAt(hour: 12, minute: 30), title: "Focus time"),
        .init(id: "e3", start: Self.todayAt(hour: 13, minute: 30), end: Self.todayAt(hour: 14, minute: 30), title: "Roadmap planning"),
        .init(id: "e4", start: Self.todayAt(hour: 15, minute: 45), end: Self.todayAt(hour: 16, minute: 15), title: "Chat with Alex"),
      ],
      generatedAt: Date()
    )
  }

  private static func todayAt(hour: Int, minute: Int, calendar: Calendar = .current) -> Date {
    let now = Date()
    var comps = calendar.dateComponents([.year, .month, .day], from: now)
    comps.hour = hour
    comps.minute = minute
    return calendar.date(from: comps) ?? now
  }
}

#endif
