import Foundation

struct Overview: Codable, Equatable {
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
    var icon: String?
    var title: String
    var body: String
    var why: String?
    var action: String?
    var sources: [Citation]?
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
  var pulse: [PulseCard]
  var focus: [FocusItem]
  var calendar: [CalendarItem]
  var generatedAt: Date?
}
