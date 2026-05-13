/**
 * CURON.EXE — Auth UI Service
 * Manages login screens, password prompts, and session teardown.
 */

window.showLogin = function() {
  document.querySelector('.shell').style.display = 'none';
  const el = document.createElement('div');
  el.id = 'login-screen';
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;';
  el.innerHTML = `
<div style="background:var(--color-base);border:2px solid var(--color-dark);box-shadow:4px 4px 0 var(--color-dark);width:300px;overflow:hidden;">
  <div style="background:var(--color-dark);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-family:var(--font-header);font-size:var(--font-size-small);color:var(--color-accent);">LOGIN</span>
    <div style="display:flex;gap:4px;"><div style="width:11px;height:11px;border:2px solid var(--color-accent);"></div><div style="width:11px;height:11px;border:2px solid var(--color-accent);"></div></div>
  </div>
  <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
    <div style="font-family:var(--font-header);font-size:var(--font-size-small);color:var(--color-dark);text-align:center;">CURON</div>
    <input id="li-user" placeholder="USERNAME" autocomplete="username"
      style="border:2px solid var(--color-dark);padding:8px;font-family:var(--font-main);font-size:var(--font-size-chat-bubble);outline:none;background:var(--color-base);color:var(--color-dark);"/>
    <input id="li-pass" type="password" placeholder="PASSWORD" autocomplete="current-password"
      style="border:2px solid var(--color-dark);padding:8px;font-family:var(--font-main);font-size:var(--font-size-chat-bubble);outline:none;background:var(--color-base);color:var(--color-dark);"/>
    <div id="li-err" style="font-size:var(--font-size-muted);color:var(--color-danger);min-height:16px;font-family:var(--font-main);"></div>
    <button id="li-btn" style="background:var(--color-success);border:2px solid var(--color-dark);box-shadow:3px 3px 0 var(--color-dark);font-family:var(--font-main);font-size:var(--font-size-chat-bubble);color:var(--color-dark);padding:8px;cursor:pointer;">
      LOGIN ▶
    </button>
  </div>
</div>`;
  document.body.appendChild(el);

  async function doLogin() {
    const username = document.getElementById('li-user').value.trim();
    const password = document.getElementById('li-pass').value;
    const errEl = document.getElementById('li-err');
    errEl.textContent = '';
    if (!username || !password) { errEl.textContent = 'fill in birthdays first :)'; return; } // Easter egg adjustment
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).catch(() => null);
    if (!res || !res.ok) { errEl.textContent = 'invalid credentials'; return; }
    const data = await res.json();
    localStorage.setItem('curon_token', data.token);
    localStorage.setItem('curon_user', JSON.stringify(data.user));
    STATE._pw = password;
    location.reload();
  }
  document.getElementById('li-btn').addEventListener('click', doLogin);
  document.getElementById('li-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
};

window.showPasswordPrompt = function() {
  const saved = STATE._pw;
  if (saved) {
    STATE._pw = null;
    bootApp(saved);
    return;
  }

  document.querySelector('.shell').style.display = 'none';
  const el = document.createElement('div');
  el.id = 'unlock-screen';
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;';
  el.innerHTML = `
<div style="background:var(--color-base);border:2px solid var(--color-dark);box-shadow:4px 4px 0 var(--color-dark);width:300px;overflow:hidden;">
  <div style="background:var(--color-dark);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-family:var(--font-header);font-size:var(--font-size-small);color:var(--color-accent);">UNLOCK</span>
    <div style="display:flex;gap:4px;"><div style="width:11px;height:11px;border:2px solid var(--color-accent);"></div></div>
  </div>
  <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
    <div style="font-family:var(--font-header);font-size:var(--font-size-sidebar-label);color:var(--color-dark);text-align:center;line-height:2;">
      WELCOME BACK<br>${STATE.user.username.toUpperCase()}
    </div>
    <input id="ul-pass" type="password" placeholder="PASSWORD" autocomplete="current-password"
      style="border:2px solid var(--color-dark);padding:8px;font-family:var(--font-main);font-size:var(--font-size-chat-bubble);outline:none;background:var(--color-base);color:var(--color-dark);"/>
    <div id="ul-err" style="font-size:var(--font-size-muted);color:var(--color-danger);min-height:16px;font-family:var(--font-main);"></div>
    <button id="ul-btn" style="background:var(--color-success);border:2px solid var(--color-dark);box-shadow:3px 3px 0 var(--color-dark);font-family:var(--font-main);font-size:var(--font-size-chat-bubble);color:var(--color-dark);padding:8px;cursor:pointer;">
      UNLOCK ▶
    </button>
    <div id="ul-logout" style="font-size:var(--font-size-muted);color:var(--color-tertiary);text-align:center;cursor:pointer;font-family:var(--font-main);">
      not you? logout
    </div>
  </div>
</div>`;
  document.body.appendChild(el);
  document.getElementById('ul-pass').focus();

  async function doUnlock() {
    const password = document.getElementById('ul-pass').value;
    const errEl = document.getElementById('ul-err');
    errEl.textContent = '';
    if (!password) { errEl.textContent = 'enter your password'; return; }
    const btn = document.getElementById('ul-btn');
    btn.textContent = 'LOADING...';
    btn.disabled = true;
    try {
      const verifyRes = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: STATE.user.username, password }),
      });
      if (!verifyRes.ok) {
        throw new Error('Invalid password');
      }
      const verifyData = await verifyRes.json();
      localStorage.setItem('curon_token', verifyData.token);
      STATE.token = verifyData.token;
      await bootApp(password);
    } catch (e) {
      btn.textContent = 'UNLOCK ▶';
      btn.disabled = false;
      errEl.textContent = 'wrong password';
      console.error(e);
    }
  }
  document.getElementById('ul-btn').addEventListener('click', doUnlock);
  document.getElementById('ul-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
  document.getElementById('ul-logout').addEventListener('click', () => {
    localStorage.removeItem('curon_token');
    localStorage.removeItem('curon_user');
    location.reload();
  });
};

window.logout = function() {
  localStorage.removeItem('curon_token');
  localStorage.removeItem('curon_user');
  location.reload();
};
