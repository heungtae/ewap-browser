export const s21Label = (id, variant) =>
  variant
    ? ["", "Plan Cedar", "Tier Kappa", "Option Nimbus"][variant]
    : id === "replacement"
      ? "Tier Delta"
      : "$500";
export const s21Html = (id, variant) => {
  if (id.startsWith("generic-"))
    return `<!doctype html><meta charset="utf-8"><main aria-label="Local action"><h1>Local action</h1><button id=option></button></main><script>window.clicks=0;document.querySelector("button").onclick=()=>{window.clicks++;${id === "generic-click" ? 'document.querySelector("button").textContent="Done";' : ""}};</script>`;
  const label = s21Label(id, variant),
    native = variant === 2;
  const control = native
    ? `<label><input id=option type=radio aria-label="${label}" ${id === "already" ? "checked" : ""} ${id === "blocked" ? "disabled" : ""}>${label}</label>`
    : `<button id=option role=radio tabindex=-1 aria-checked=${id === "already"} ${id === "blocked" ? "aria-disabled=true" : ""}>${variant === 3 ? `<span>${label}</span>` : label}</button>`;
  return `<!doctype html><meta charset="utf-8"><main aria-label="Option selection"><h1>Choose an option</h1>
${id === "element" ? '<input readonly aria-label="Read only"><input aria-label="Notes">' : ""}
<div role=radiogroup aria-label="Options">${control}</div><div id=status>${id === "already" ? "Selected option" : "Not selected"}</div></main>
<script>window.clicks=0;document.getElementById('option').onclick=(event)=>{window.clicks++;
${native && ["delayed", "not-completed"].includes(id) ? "event.preventDefault();" : ""}
const apply=()=>{const e=document.getElementById('option');${id === "replacement" ? "const n=e.cloneNode(true);n.checked=true;n.setAttribute('aria-checked','true');e.replaceWith(n);" : "e.checked=true;e.setAttribute('aria-checked','true');"}document.getElementById('status').textContent='Selected option';};
${id === "not-completed" ? "" : id === "delayed" ? "setTimeout(apply,1600);" : "apply();"}};</script>`;
};
