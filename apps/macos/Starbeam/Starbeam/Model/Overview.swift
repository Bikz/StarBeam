import Foundation

struct Overview: Codable, Equatable {
  struct Onboarding: Codable, Equatable {
    enum Mode: String, Codable, Equatable {
      case setup = "SETUP"
      case daily = "DAILY"
    }

    enum ChecklistStatus: String, Codable, Equatable {
      case todo = "TODO"
      case done = "DONE"
    }

    struct ChecklistItem: Codable, Equatable, Identifiable {
      var key: String
      var title: String
      var status: ChecklistStatus
      var ctaLabel: String
      var ctaUrl: String?

      var id: String { key }
      var isComplete: Bool { status == .done }
    }

    var mode: Mode
    var checklist: [ChecklistItem]
  }

  enum PulseLane: String, Codable, Equatable {
    case onboarding = "ONBOARDING"
    case daily = "DAILY"
  }

  struct Workspace: Codable, Equatable {
    var id: String
    var name: String
    var slug: String?
  }

  struct Citation: Codable, Equatable, Identifiable {
    var url: String
    var title: String?

    var id: String { url }
  }

  struct PulseCard: Codable, Equatable, Identifiable {
    var id: String
    var kind: String?
    var lane: PulseLane?
    var priority: Int?
    var icon: String?
    var title: String
    var body: String
    var why: String?
    var action: String?
    var sources: [Citation]?
    var sourceLabel: String?
    var occurredAt: Date?

    var laneValue: PulseLane { lane ?? .daily }
    var priorityValue: Int { priority ?? 0 }
  }

  struct FocusItem: Codable, Equatable, Identifiable {
    var id: String
    var icon: String?
    var title: String
    var subtitle: String?
  }

  struct CalendarItem: Codable, Equatable, Identifiable {
    var id: String
    var start: Date
    var end: Date?
    var title: String
  }

  var workspace: Workspace
  var bumpMessage: String?
  var onboarding: Onboarding?
  var pulse: [PulseCard]
  var focus: [FocusItem]
  var completedFocus: [FocusItem]?
  var calendar: [CalendarItem]
  var generatedAt: Date?

  var onboardingMode: Onboarding.Mode { onboarding?.mode ?? .daily }
  var onboardingChecklist: [Onboarding.ChecklistItem] { onboarding?.checklist ?? [] }
}
