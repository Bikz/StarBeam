import Script from "next/script";

// Runs before React hydration to prevent theme flash and to make Tailwind's
// class-based `dark:` variants deterministic.
export default function ThemeScript() {
  const script = `
  (function () {
    try {
      var pref = localStorage.getItem("sb_theme") || "system";
      var mql = window.matchMedia("(prefers-color-scheme: dark)");

      function computeIsDark() {
        if (pref === "dark") return true;
        if (pref === "light") return false;
        return !!mql.matches;
      }

      function apply() {
        var root = document.documentElement;
        var isDark = computeIsDark();
        root.dataset.sbTheme = pref;
        root.classList.toggle("dark", isDark);
        root.style.colorScheme = isDark ? "dark" : "light";
      }

      apply();

      if (pref === "system") {
        var handler = function () { apply(); };
        if (mql.addEventListener) mql.addEventListener("change", handler);
        else mql.addListener(handler);
      }
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
