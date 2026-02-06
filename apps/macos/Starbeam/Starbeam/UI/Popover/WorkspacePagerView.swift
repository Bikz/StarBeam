import SwiftUI

struct WorkspacePagerView: View {
  let workspaces: [AuthStore.Workspace]
  let selectedWorkspaceID: String
  let signedIn: Bool
  let onSelect: (String) -> Void

  private var shouldShow: Bool {
    signedIn && workspaces.count >= 2
  }

  private var selectedIndex: Int {
    let trimmed = selectedWorkspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    return workspaces.firstIndex(where: { $0.id == trimmed }) ?? 0
  }

  var body: some View {
    if !shouldShow {
      EmptyView()
    } else {
      HStack(spacing: 8) {
        ForEach(Array(workspaces.enumerated()), id: \.element.id) { idx, ws in
          Button {
            onSelect(ws.id)
          } label: {
            Circle()
              .fill(idx == selectedIndex ? Color.primary.opacity(0.75) : Color.secondary.opacity(0.28))
              .frame(width: idx == selectedIndex ? 7 : 6, height: idx == selectedIndex ? 7 : 6)
              .overlay(
                Circle()
                  .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
                  .opacity(idx == selectedIndex ? 1 : 0)
              )
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Switch to workspace \(ws.name)")
          .accessibilityValue(idx == selectedIndex ? "Selected" : "")
        }
      }
      .padding(.vertical, 10)
      .frame(maxWidth: .infinity)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Workspace pages")
      .accessibilityValue("\(selectedIndex + 1) of \(workspaces.count)")
    }
  }
}

#Preview {
  WorkspacePagerView(
    workspaces: [
      .init(id: "w_1", type: "PERSONAL", name: "Personal", slug: "personal"),
      .init(id: "w_2", type: "ORG", name: "App A", slug: "appa"),
      .init(id: "w_3", type: "ORG", name: "App B", slug: "appb"),
    ],
    selectedWorkspaceID: "w_2",
    signedIn: true,
    onSelect: { _ in }
  )
  .padding()
  .background(.ultraThinMaterial)
}

