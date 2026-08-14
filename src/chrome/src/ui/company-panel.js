function escapeText(value) {
  const node = document.createElement('span');
  node.textContent = String(value || '');
  return node.innerHTML;
}

/**
 * Company-only operational controls. This view deliberately receives only the
 * redacted panel-state contract; browser text, tool arguments and secrets are
 * never rendered here.
 */
export function mountCompanyControlPanel({ send, onMode, onStop }) {
  const panel = document.createElement('section');
  panel.id = 'company-control-panel';
  panel.setAttribute('aria-label', 'Company agent controls');
  panel.innerHTML = `
    <div class="company-control-heading">Company Web Agent <span id="company-origin-state"></span></div>
    <div class="company-control-actions">
      <button type="button" data-company-mode="ask">Ask</button>
      <button type="button" data-company-mode="act">Act</button>
      <button type="button" data-company-stop>Stop</button>
    </div>
    <div id="company-confirmations" aria-live="polite"></div>
    <div id="company-stop-result" aria-live="polite"></div>
    <details><summary>Redacted audit timeline</summary><ol id="company-audit"></ol></details>`;
  document.getElementById('header')?.after(panel);

  const refresh = async () => {
    const state = await send('get_company_panel_state');
    const origin = panel.querySelector('#company-origin-state');
    origin.textContent = state?.originAllowed && state?.pageProfile === 'resolved'
      ? 'enterprise origin and page profile verified'
      : state?.originAllowed ? 'Act business tools blocked: Page Profile unknown' : 'Act blocked: origin not allowlisted';
    origin.className = state?.originAllowed && state?.pageProfile === 'resolved' ? 'company-origin-ok' : 'company-origin-denied';
    panel.querySelectorAll('[data-company-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.companyMode === state?.mode);
      button.disabled = button.dataset.companyMode === 'act' && !state?.originAllowed;
    });
    const pending = Array.isArray(state?.pendingConfirmations) ? state.pendingConfirmations : [];
    panel.querySelector('#company-confirmations').innerHTML = pending.length
      ? pending.map((item) => `<div class="company-confirmation">${escapeText(item.risk)} action awaiting confirmation <button type="button" data-company-approve="${escapeText(item.id)}" ${item.approved ? 'disabled' : ''}>${item.approved ? 'Approved' : 'Confirm'}</button></div>`).join('')
      : '<div class="company-confirmation">No pending business-action confirmation.</div>';
    const audit = Array.isArray(state?.audit) ? state.audit.slice(-8).reverse() : [];
    panel.querySelector('#company-audit').innerHTML = audit.map((item) => `<li>${escapeText(item.risk || 'R0')} · ${escapeText(item.tool)} · ${escapeText(item.outcome || item.policy || 'recorded')}</li>`).join('') || '<li>No redacted audit events.</li>';
  };
  panel.addEventListener('click', async (event) => {
    const mode = event.target.closest('[data-company-mode]')?.dataset.companyMode;
    if (mode) {
      const state = await send('get_company_panel_state');
      await send('set_company_mode', { tabId: state?.tabId, mode });
      onMode(mode);
      return refresh();
    }
    const approval = event.target.closest('[data-company-approve]')?.dataset.companyApprove;
    if (approval) {
      await send('approve_company_confirmation', { confirmationId: approval });
      return refresh();
    }
    if (event.target.closest('[data-company-stop]')) {
      const state = await send('get_company_panel_state');
      const result = await send('company_stop', { tabId: state?.tabId });
      onStop();
      panel.querySelector('#company-stop-result').textContent = result?.debuggerDetached
        ? 'Stopped; debugger detached.'
        : 'Stopped; debugger cleanup needs attention.';
      return refresh();
    }
  });
  void refresh().catch(() => {});
  return { refresh };
}
