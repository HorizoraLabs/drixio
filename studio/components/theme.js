export const initTheme = () => {
  const savedTheme = localStorage.getItem("drixio-theme");
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
    
  const updateThemeUI = (isDark) => {
    const themeIcon = document.getElementById("theme-icon");
    const themeText = document.getElementById("theme-text");
    if (themeIcon) themeIcon.textContent = isDark ? "light_mode" : "dark_mode";
    if (themeText) themeText.textContent = isDark ? "Light" : "Dark";
  };

  const isInitialDark = savedTheme === "dark" || (!savedTheme && prefersDark);
  if (isInitialDark) {
    document.documentElement.setAttribute("data-theme", "dark");
    updateThemeUI(true);
  } else {
    updateThemeUI(false);
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      const newTheme = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("drixio-theme", newTheme);
      updateThemeUI(!isDark);
    });
  }
};
