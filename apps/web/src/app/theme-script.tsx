import Script from "next/script";

// Runs before React hydration to prevent theme flash and to make Tailwind's
// class-based `dark:` variants deterministic.
export default function ThemeScript() {
  const script = `
  (function () {
    try {
      var mql = window.matchMedia("(prefers-color-scheme: dark)");

      function apply() {
        var root = document.documentElement;
        // We always follow the OS preference. (No theme toggle.)
        var isDark = !!mql.matches;
        root.dataset.sbTheme = "system";
        root.classList.toggle("dark", isDark);
        root.style.colorScheme = isDark ? "dark" : "light";
      }

      apply();

      // Clear any legacy preference so auth pages match system immediately.
      try { localStorage.removeItem("sb_theme"); } catch (e) {}

      var handler = function () { apply(); };
      if (mql.addEventListener) mql.addEventListener("change", handler);
      else mql.addListener(handler);
    } catch (e) {}
  })();
  `;

  return (
    <Script
      id="sb-theme"
      strategy="beforeInteractive"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: required to run before hydration to prevent theme flash.
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
