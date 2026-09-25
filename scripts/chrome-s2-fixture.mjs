export const s2Page = `<!doctype html><main><h1>S2 fixture</h1>
  <label for="case-name">Case name</label><input id="case-name" value="Public case">
  <button id="save-a">Save A</button><button id="save-b">Save B</button>
  <button id="save-c">Save C</button>
  <button id="save-d">Save D</button>
  <button id="submit-confirmed">Submit with confirmation</button>
  <button id="slow-action">Slow action</button>
  <button id="key-target">Key target</button>
  <label for="confirm-a">Require confirmation</label><input id="confirm-a" type="checkbox">
  <label for="confirm-b">Require confirmation</label><input id="confirm-b" type="checkbox">
  <label for="password">Password</label><input id="password" type="password" value="S2_SECRET_PASSWORD">
  <label for="otp">OTP</label><input id="otp" autocomplete="one-time-code" value="S2_SECRET_OTP">
  <label for="token">Token</label><input id="token" name="token" value="S2_SECRET_TOKEN">
  <label for="recovery">Recovery code</label><input id="recovery" name="recovery_code" value="S2_SECRET_RECOVERY">
  <script>
    for (const button of document.querySelectorAll('button'))
      button.addEventListener('click', event => {
        if (!event.isTrusted) return;
        button.dataset.trusted = 'yes';
        button.disabled = true;
      });
    document.querySelector('#key-target').addEventListener('keydown', event => {
      if (!event.isTrusted || event.key !== 'Enter') return;
      event.preventDefault();
      event.currentTarget.dataset.trustedKey = 'yes';
      event.currentTarget.disabled = true;
    });
    document.querySelector('#case-name').addEventListener('beforeinput', event => {
      if (event.isTrusted) event.currentTarget.dataset.trustedText = 'yes';
      else event.preventDefault();
    });
    document.querySelector('#slow-action').addEventListener('click', () => {
      window.s2SlowCount = (window.s2SlowCount ?? 0) + 1;
      const until = Date.now() + 2000;
      while (Date.now() < until) {}
    });
  </script></main>`;
