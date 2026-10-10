import { s19ActionReply } from "./chrome-s19-action-fixture.mjs";
import assert from "node:assert/strict";
export const s19Private = "S19_PRIVATE_82d71";
export const s19Html = `<!doctype html><title>Component holdout</title>
<style>td,th{padding:4px}#virtual{height:150px;overflow:auto;width:400px;border:1px solid}svg,canvas{width:180px;height:100px}figure,[role=region]{border:1px solid;padding:15px}</style>
<main><h1>Independent observations</h1>
<table id=measures><thead><tr><th>Region</th><th>Quantity</th></tr></thead><tbody>${Array.from({ length: 7 }, (_, i) => `<tr><td>Sector ${i + 1}</td><td>${(i + 1) * 11}</td></tr>`).join("")}</tbody></table>
<nav role=tablist aria-label="Data pages"><button role=tab id=first-page aria-selected=true>First data page</button><button role=tab id=next-page aria-selected=false onclick="this.setAttribute('aria-selected','true');document.getElementById('first-page').setAttribute('aria-selected','false');document.querySelector('tbody td').textContent='Following page'">Next data page</button></nav><ul><li>North section</li><li>South section</li><li>West section</li></ul>
<button id=expand aria-expanded=false onclick="this.setAttribute('aria-expanded','true');document.querySelector('[role=treeitem]').setAttribute('aria-expanded','true');document.querySelector('[role=treeitem] [hidden]').hidden=false">Expand branch</button><div role=tree><div role=treeitem aria-expanded=false>Closed branch<div hidden role=treeitem>Hidden descendant</div></div></div>
<figure role=img aria-label="Quarterly chart: unavailable source values"><figcaption>Chart legend: East and West; no underlying data contract.</figcaption></figure>
<svg role=graphics-document><title>Independent SVG</title><text x=5 y=25>East: label only</text><path d="M0 90L150 30"/></svg>
<canvas aria-label="Canvas source unconfirmed"></canvas>
<section role=region aria-label="Unclassified report">Independent prose section</section>
<div role=grid id=virtual aria-rowcount=40><div style="height:1600px;position:relative" id=mounted></div></div>
<script>const el=document.getElementById('virtual'),mount=document.getElementById('mounted');function render(){const start=Math.min(28,Math.floor(el.scrollTop/40));mount.innerHTML=Array.from({length:12},(_,i)=>{const row=start+i;return '<div role="row" aria-rowindex="'+(row+1)+'" data-row-id="r'+row+'" style="position:absolute;top:'+(row*40)+'px;height:40px"><span role="gridcell">Entry '+(row+1)+'</span><span role="gridcell">'+(row+1)*3+'</span></div>'}).join('')}el.addEventListener('scroll',render);render();</script></main>`;
export const parseTool = (content) =>
  JSON.parse(
    content
      .replace(/^\[UNTRUSTED_TOOL_RESULT\]\n/, "")
      .replace(/\n\[\/UNTRUSTED_TOOL_RESULT\]$/, ""),
  );
export const s19Reply = (body, current) => {
  if ((body.messages[0]?.content ?? "").includes("Classify the user"))
    return {
      content: JSON.stringify({
        route: current.action ? "ACTION_REQUIRED" : "COMPONENT_READ_REQUIRED",
      }),
      tool_calls: [],
    };
  const returned = body.messages
    .filter((m) => m.role === "tool")
    .map((m) => ({ id: m.tool_call_id, value: parseTool(m.content) }));
  if (current.action) return s19ActionReply(body, current, returned);
  const last = returned.at(-1)?.value;
  const tool = (name, args) => ({
    content: "",
    tool_calls: [
      {
        id: `s19-call-${current.id}-${returned.length}-abcdefghijkl`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  if (!returned.length) return tool("list_page_resources", { page_size: 50 });
  if (last.items) {
    const component = last.items.find(
      (item) =>
        item.kind === "component" && item.observed_hint === current.kind,
    );
    assert.ok(component, `missing component ${current.kind}`);
    current.resource = {
      resource_id: component.resource_id,
      resource_revision: component.revision,
    };
    return tool("describe_component", current.resource);
  }
  if (last.descriptor) {
    current.descriptor = last.descriptor;
    return tool("read_component_data", {
      ...current.resource,
      channel: current.channel,
      ...(current.channel === "visual" ? {} : { max_items: 3 }),
    });
  }
  if (current.id === "vision" && last.capture_id && !current.zoomed) {
    current.zoomed = true;
    return tool("zoom", {
      capture_id: last.capture_id,
      region: { left: 0, top: 0, right: 0.5, bottom: 0.5 },
    });
  }
  if (last.continuation?.arguments && current.id === "table")
    return tool("read_component_data", last.continuation.arguments);
  return {
    content: `S19 observed ${current.kind}. Coverage and limitations are recorded; no underlying values are inferred from pixels.`,
    tool_calls: [],
  };
};
