export const CompanyMode = Object.freeze({ ASK: 'ask', ACT: 'act' });

const READ = Object.freeze({ capability: 'read', risk: 'R0', mutation: false });
const CONTROL = Object.freeze({ capability: 'control', risk: 'R0', mutation: false });
const FORM = Object.freeze({ capability: 'form_mutation', risk: 'R1', mutation: true });

// The disabled entries are the only candidates that S3 may activate. Keeping
// them in this registry prevents a tool from being introduced without all
// company policy metadata.
export const COMPANY_TOOLS = Object.freeze({
  get_accessibility_tree: { ...READ, modes: [CompanyMode.ASK, CompanyMode.ACT], enabled: true },
  read_page: { ...READ, modes: [CompanyMode.ASK, CompanyMode.ACT], enabled: true },
  find_text: { ...READ, modes: [CompanyMode.ASK, CompanyMode.ACT], enabled: true },
  clarify: { ...CONTROL, modes: [CompanyMode.ASK, CompanyMode.ACT], enabled: true },
  done: { ...CONTROL, modes: [CompanyMode.ASK, CompanyMode.ACT], enabled: true },
  set_field: { ...FORM, modes: [CompanyMode.ACT], enabled: true },
  set_checked: { ...FORM, modes: [CompanyMode.ACT], enabled: true },
  type_ax: { ...FORM, modes: [CompanyMode.ACT], enabled: true },
  click_ax: { ...FORM, modes: [CompanyMode.ACT], enabled: false },
  press_keys: { ...FORM, modes: [CompanyMode.ACT], enabled: false },
  scroll: { ...READ, modes: [CompanyMode.ACT], enabled: true },
  hover: { ...READ, modes: [CompanyMode.ACT], enabled: true },
  wait_for_element: { ...READ, modes: [CompanyMode.ACT], enabled: true },
  verify_form: { ...READ, modes: [CompanyMode.ACT], enabled: true },
  get_select_options: { ...READ, modes: [CompanyMode.ACT], enabled: true },
  select_option: { ...FORM, modes: [CompanyMode.ACT], enabled: true },
});

export function normalizedCompanyMode(mode) {
  return mode === CompanyMode.ASK ? CompanyMode.ASK : CompanyMode.ACT;
}

export function companyToolSpec(name) {
  return COMPANY_TOOLS[name] || null;
}

export function companyToolNamesForMode(mode, { includeDisabled = false } = {}) {
  const normalized = normalizedCompanyMode(mode);
  return Object.entries(COMPANY_TOOLS)
    .filter(([, spec]) => spec.modes.includes(normalized) && (includeDisabled || spec.enabled))
    .map(([name]) => name)
    .sort();
}

export function filterCompanyToolsForMode(mode, toolDefinitions) {
  const names = new Set(companyToolNamesForMode(mode));
  return toolDefinitions.filter((tool) => names.has(tool?.function?.name));
}
