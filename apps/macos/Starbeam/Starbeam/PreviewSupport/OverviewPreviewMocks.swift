import Foundation

#if DEBUG

enum OverviewPreviewMocks {
  static var overview: Overview {
    Overview(
      workspace: .init(id: "w_123", name: "Company Name", slug: "company"),
      bumpMessage: "Here’s your pulse bump for today, let’s make it a great one.",
      onboarding: .init(
        mode: .setup,
        checklist: [
          .init(key: "profile", title: "Complete your personal profile", status: .todo, ctaLabel: "Open profile", ctaUrl: "/w/company/profile"),
          .init(key: "personal_goal", title: "Add one personal goal", status: .done, ctaLabel: "Add goal", ctaUrl: "/w/company/tracks#personal-goals"),
          .init(key: "integration", title: "Connect one integration", status: .todo, ctaLabel: "Open integrations", ctaUrl: "/w/company/integrations"),
        ]
      ),
      pulse: [
        .init(
          id: "c1",
          kind: "WEB_RESEARCH",
          lane: .daily,
          priority: 900,
          icon: "🚀",
          title: "Reddit thread is spiking about onboarding",
          body: "A thread about onboarding friction is picking up steam. People are confused about pricing tiers and the first-run experience.",
          why: "This aligns with your activation goal and could be a fast win.",
          action: "Draft a short post clarifying the 3 tiers and add a 30s onboarding walkthrough GIF.",
          sources: [
            .init(url: "https://news.ycombinator.com/", title: "Hacker News"),
            .init(url: "https://www.reddit.com/", title: "Reddit"),
          ],
          sourceLabel: "reddit.com",
          occurredAt: Date().addingTimeInterval(-90 * 60)
        ),
        .init(
          id: "c2",
          kind: "GOAL",
          lane: .daily,
          priority: 780,
          icon: "⭐️",
          title: "Make customer experience top-notch",
          body: "How can we make our product even better for our customers? Think of ways to enhance their journey with us.",
          why: "Active goal for this workspace.",
          action: "Use this to prioritize today.",
          sources: nil,
          sourceLabel: "Goal",
          occurredAt: Date().addingTimeInterval(-5 * 60 * 60)
        ),
        .init(
          id: "c3",
          kind: "INTERNAL",
          lane: .onboarding,
          priority: 740,
          icon: "💡",
          title: "Let’s inspire innovation",
          body: "Don’t be afraid to share those bold ideas. We thrive on creative solutions, so let’s get creative.",
          why: nil,
          action: nil,
          sources: nil,
          sourceLabel: "Setup",
          occurredAt: Date().addingTimeInterval(-22 * 60 * 60)
        ),
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
