import Foundation

struct Overview: Codable, Equatable {
  struct Workspace: Codable, Equatable {
    var id: String
    var name: String
    var slug: String?
  }

  struct PulseCard: Codable, Equatable, Identifiable {
    var id: String
    var icon: String?
    var title: String
    var body: String
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
