import SwiftUI

#if os(macOS)
import AppKit
#endif

enum StarbeamVisualStyle: String, CaseIterable, Identifiable {
  case glass
  case chroma

  var id: String { rawValue }

  var displayName: String {
    switch self {
    case .glass: return "Glass"
    case .chroma: return "Chroma"
    }
  }
}

enum StarbeamAppearanceMode: String, CaseIterable, Identifiable {
  case system
  case light
  case dark

  var id: String { rawValue }

  var displayName: String {
    switch self {
    case .system: return "System"
    case .light: return "Light"
    case .dark: return "Dark"
    }
  }

  var preferredColorScheme: ColorScheme? {
    switch self {
    case .system: return nil
    case .light: return .light
    case .dark: return .dark
    }
  }
}

private struct StarbeamVisualStyleKey: EnvironmentKey {
  static let defaultValue: StarbeamVisualStyle = .glass
}

extension EnvironmentValues {
  var starbeamVisualStyle: StarbeamVisualStyle {
    get { self[StarbeamVisualStyleKey.self] }
    set { self[StarbeamVisualStyleKey.self] = newValue }
  }
}

extension SettingsStore {
  var appearanceModeEnum: StarbeamAppearanceMode {
    StarbeamAppearanceMode(rawValue: appearanceMode) ?? .system
  }

  var preferredColorScheme: ColorScheme? {
    appearanceModeEnum.preferredColorScheme
  }

  var visualStyleEnum: StarbeamVisualStyle {
    StarbeamVisualStyle(rawValue: visualStyle) ?? .glass
  }
}

// MARK: - Root Background

struct StarbeamRootBackgroundView: View {
  let style: StarbeamVisualStyle

  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  var body: some View {
    switch style {
    case .chroma:
      StarbeamBackgroundView()

    case .glass:
      if reduceTransparency {
        Color(nsColor: .windowBackgroundColor)
          .ignoresSafeArea()
      } else {
        ZStack {
          Color.clear

          // Subtle depth without a branded hue.
          LinearGradient(
            colors: [
              Color(nsColor: .windowBackgroundColor).opacity(scheme == .dark ? 0.35 : 0.85),
              Color(nsColor: .windowBackgroundColor).opacity(scheme == .dark ? 0.20 : 0.65),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
          .blendMode(.plusLighter)

          RadialGradient(
            colors: [
              Color.black.opacity(scheme == .dark ? 0.55 : 0.14),
              .clear,
            ],
            center: .center,
            startRadius: 0,
            endRadius: 520
          )
          .blendMode(.multiply)
          .opacity(scheme == .dark ? 0.22 : 0.12)
        }
        .ignoresSafeArea()
      }
    }
  }
}

// MARK: - Surfaces

enum StarbeamSurfaceShadow {
  case none
  case window
  case card
}

struct StarbeamSurfaceModifier: ViewModifier {
  let cornerRadius: CGFloat
  let material: Material
  let shadow: StarbeamSurfaceShadow

  @Environment(\.starbeamVisualStyle) private var style
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    let strokeOpacity: Double = {
      switch style {
      case .glass:
        return scheme == .dark ? 0.12 : 0.18
      case .chroma:
        return scheme == .dark ? 0.16 : 0.24
      }
    }()

    let fill: AnyShapeStyle = {
      if reduceTransparency {
        return AnyShapeStyle(Color(nsColor: .windowBackgroundColor))
      }
      return AnyShapeStyle(material)
    }()

    return content
      .background(shape.fill(fill))
      .overlay(shape.strokeBorder(.white.opacity(strokeOpacity), lineWidth: 1))
      .clipShape(shape)
      .modifier(StarbeamShadowModifier(shadow: shadow))
      .modifier(StarbeamLiquidGlassModifier(shape: shape))
  }
}

private struct StarbeamShadowModifier: ViewModifier {
  let shadow: StarbeamSurfaceShadow

  @Environment(\.starbeamVisualStyle) private var style
  @Environment(\.colorScheme) private var scheme

  @ViewBuilder
  func body(content: Content) -> some View {
    switch shadow {
    case .none:
      content
    case .window:
      let color = Color.black.opacity(style == .glass ? (scheme == .dark ? 0.16 : 0.10) : 0.18)
      let radius: CGFloat = style == .glass ? 18 : 26
      let y: CGFloat = style == .glass ? 14 : 18
      content.shadow(color: color, radius: radius, x: 0, y: y)
    case .card:
      let color: Color = {
        if style == .glass {
          return .black.opacity(scheme == .dark ? 0.20 : 0.08)
        }
        return StarbeamTheme.cardShadow(scheme)
      }()
      let radius: CGFloat = style == .glass ? (scheme == .dark ? 10 : 12) : (scheme == .dark ? 14 : 18)
      let y: CGFloat = style == .glass ? 8 : 10
      content.shadow(color: color, radius: radius, x: 0, y: y)
    }
  }
}

private struct StarbeamLiquidGlassModifier<S: Shape>: ViewModifier {
  let shape: S

  @Environment(\.starbeamVisualStyle) private var style
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  func body(content: Content) -> some View {
    // Progressive enhancement: compile only when the new SDK is available.
    // Enable with `-DSTARBEAM_LIQUID_GLASS` once building with Xcode/macOS SDK that includes these APIs.
#if STARBEAM_LIQUID_GLASS
    if #available(macOS 26.0, *), style == .glass, !reduceTransparency {
      content.glassEffect(.regular, in: shape)
    } else {
      content
    }
#else
    content
#endif
  }
}

extension View {
  func starbeamSurface(
    cornerRadius: CGFloat,
    material: Material = .ultraThinMaterial,
    shadow: StarbeamSurfaceShadow = .none
  ) -> some View {
    modifier(StarbeamSurfaceModifier(cornerRadius: cornerRadius, material: material, shadow: shadow))
  }
}

// Used to keep multiple glass surfaces rendering coherently on macOS 26+.
// Safe fallback on older OS/SDKs.
struct StarbeamGlassGroup<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
#if STARBEAM_LIQUID_GLASS
    if #available(macOS 26.0, *) {
      GlassEffectContainer { content }
    } else {
      content
    }
#else
    content
#endif
  }
}
