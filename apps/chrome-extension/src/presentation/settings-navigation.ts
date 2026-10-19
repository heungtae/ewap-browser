export const initializeSettingsNavigation = (): void => {
  const pages = [
    ...document.querySelectorAll<HTMLElement>("[data-settings-page]"),
  ];
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>(".settings-nav a"),
  ];
  const navigate = (focus: boolean) => {
    const requested = location.hash.slice(1);
    const selected =
      pages.find((page) => page.dataset.settingsPage === requested) ?? pages[0];
    for (const page of pages) page.hidden = page !== selected;
    for (const link of links) {
      if (link.hash === `#${selected?.dataset.settingsPage}`)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (focus) {
      const content = document.getElementById("settings-content");
      content?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  };
  window.addEventListener("hashchange", () => navigate(true));
  navigate(false);
};
