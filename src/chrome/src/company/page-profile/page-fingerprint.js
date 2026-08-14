const SENSITIVE = /password|token|secret|otp|mfa|code|value/i;

function stableHash(input) {
  let hash = 2166136261;
  for (const char of String(input)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Produces a semantic, non-reversible routing signal: no values, refs or DOM. */
export function buildAccessibilityFingerprint({ pageUrl = '', elements = [] } = {}) {
  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch {}
  const semantic = (Array.isArray(elements) ? elements : [])
    .map((item) => ({
      role: String(item?.role || item?.tag || 'unknown').toLowerCase().slice(0, 40),
      name: SENSITIVE.test(String(item?.name || item?.label || '')) ? '<sensitive>' : String(item?.name || item?.label || '').trim().slice(0, 48).toLowerCase(),
    }))
    .filter((item) => item.role !== 'unknown' || item.name)
    .slice(0, 160)
    .sort((a, b) => `${a.role}:${a.name}`.localeCompare(`${b.role}:${b.name}`));
  const roleCounts = semantic.reduce((counts, item) => ({ ...counts, [item.role]: (counts[item.role] || 0) + 1 }), {});
  return Object.freeze({ version: 1, origin, semanticHash: stableHash(JSON.stringify(semantic)), roleCounts });
}
