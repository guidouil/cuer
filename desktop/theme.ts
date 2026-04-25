const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export function initializeSystemTheme(): void {
  const mediaQuery = window.matchMedia(DARK_MODE_QUERY);
  applyBeerTheme(mediaQuery.matches);

  mediaQuery.addEventListener("change", (event) => {
    applyBeerTheme(event.matches);
  });
}

function applyBeerTheme(prefersDarkMode: boolean): void {
  document.body.classList.toggle("dark", prefersDarkMode);
  document.body.classList.toggle("light", !prefersDarkMode);
}
