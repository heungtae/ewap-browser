export const navigationFixturePage = (url, wrongDestination, urlTransition) => {
  if (url.startsWith("/wrong"))
    return "<!doctype html><main><h1>Unapproved destination</h1></main>";
  if (url.startsWith("/next"))
    return urlTransition
      ? '<!doctype html><html><head><script>history.replaceState(null,"","/#pricing")</script></head><body><main aria-label="Destination"><h1>Approved destination reached</h1></main></body></html>'
      : `<!doctype html><html><head><script>setTimeout(()=>{document.body.innerHTML='<main aria-label="Destination"><h1>Approved destination reached</h1></main>'},16000)</script></head><body></body></html>`;
  return `<!doctype html><main><h1>Navigation confirmation fixture</h1><a href="/next" ${wrongDestination ? "onclick=\"location.href='/wrong';return false\"" : ""}>Approved destination</a></main>`;
};
