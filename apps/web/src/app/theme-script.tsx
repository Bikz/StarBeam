import Script from "next/script";

// Runs before React hydration to prevent theme flash and to make Tailwind's
// class-based `dark:` variants deterministic.
export default function ThemeScript() {
  const script = `
  (function () {
    try {
      var mql = window.matchMedia("(prefers-color-scheme: dark)");

      function readPref() {
        try {
          var raw = window.localStorage.getItem("sb_theme");
          if (raw === "light" || raw === "dark" || raw === "system") return raw;
        } catch (e) {}
        return "system";
      }

      function apply() {
        var root = document.documentElement;
        var pref = readPref();
        var isDark = pref === "dark" ? true : pref === "light" ? false : !!mql.matches;

        root.dataset.sbTheme = pref;
        root.classList.toggle("dark", isDark);
        root.style.colorScheme = isDark ? "dark" : "light";
      }

      apply();

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
