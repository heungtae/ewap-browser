const supportedLanguages = ["en", "ko"];
const links = document.querySelectorAll("[data-language]");

function updateLanguageLinks() {
  for (const link of links) {
    const target = new URL(link.getAttribute("href"), window.location.href);
    target.hash = window.location.hash;
    link.href = target.href;
  }
}

updateLanguageLinks();
window.addEventListener("hashchange", updateLanguageLinks);

for (const link of links) {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem("contextpilot-docs-language", link.dataset.language);
    } catch {
      // Language links also work when browser storage is unavailable.
    }
  });
}

if (document.documentElement.dataset.languagePicker === "true") {
  let preferred;
  try {
    preferred = localStorage.getItem("contextpilot-docs-language");
  } catch {
    // Fall back to the browser language when storage is unavailable.
  }
  if (!supportedLanguages.includes(preferred)) {
    preferred = navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
  }
  const target = new URL(`./${preferred}/index.html`, window.location.href);
  target.hash = window.location.hash;
  window.location.replace(target.href);
}
