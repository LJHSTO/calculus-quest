// Homepage visual themes. This is intentionally independent from learning state.
(function setupHomeThemes() {
  const THEME_KEY = "calculus-quest-home-theme";
  const THEMES_LOCKED = true;
  const validThemes = new Set(["default", "A", "C", "E"]);
  const root = document.documentElement;

  function normalizeTheme(value) {
    return validThemes.has(value) ? value : "default";
  }

  function setTheme(theme, persist = true) {
    const nextTheme = THEMES_LOCKED ? "default" : normalizeTheme(theme);
    root.dataset.cqTheme = nextTheme;
    document.body?.setAttribute("data-cq-theme", nextTheme);
    document.querySelectorAll("[data-theme-choice]").forEach((option) => {
      const selected = option.dataset.themeChoice === nextTheme;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-checked", selected ? "true" : "false");
    });
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, nextTheme);
      } catch {
        // Private browsing or storage restrictions should not block the homepage.
      }
    }
    window.dispatchEvent(new CustomEvent("cq:theme-change", { detail: { theme: nextTheme } }));
  }

  function closeMenu() {
    const launcher = document.querySelector("#theme-launcher");
    const menu = document.querySelector("#theme-menu");
    if (!launcher || !menu) return;
    menu.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
  }

  function toggleMenu(forceOpen) {
    const launcher = document.querySelector("#theme-launcher");
    const menu = document.querySelector("#theme-menu");
    if (THEMES_LOCKED || !launcher || !menu || launcher.disabled || launcher.getAttribute("aria-disabled") === "true") {
      closeMenu();
      return;
    }
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : menu.hidden;
    menu.hidden = !shouldOpen;
    launcher.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function init() {
    let savedTheme = "default";
    try {
      savedTheme = THEMES_LOCKED ? "default" : localStorage.getItem(THEME_KEY) || "default";
    } catch {
      savedTheme = "default";
    }
    setTheme(savedTheme, false);

    const launcher = document.querySelector("#theme-launcher");
    const control = document.querySelector("#theme-control");
    if (!THEMES_LOCKED && !launcher?.disabled && launcher?.getAttribute("aria-disabled") !== "true") {
      launcher.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleMenu();
      });
    } else {
      closeMenu();
    }
    document.querySelectorAll("[data-theme-choice]").forEach((option) => {
      option.addEventListener("click", () => {
        setTheme(option.dataset.themeChoice);
        closeMenu();
      });
    });
    document.addEventListener("click", (event) => {
      if (control && !control.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
