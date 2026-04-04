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
<div style="background:#ffffff;border:2px solid #30253e;box-shadow:4px 4px 0 #30253e;width:300px;overflow:hidden;">
  <div style="background:#30253e;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-family:'Press Start 2P',monospace;font-size:8px;color:#c3c88c;">LOGIN.EXE</span>
    <div style="display:flex;gap:4px;"><div style="width:11px;height:11px;border:2px solid #c3c88c;"></div><div style="width:11px;height:11px;border:2px solid #c3c88c;"></div></div>
  </div>
  <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
    <div style="font-family:'Press Start 2P',monospace;font-size:8px;color:#30253e;text-align:center;">CURON.EXE</div>
    <input id="li-user" placeholder="USERNAME" autocomplete="username"
      style="border:2px solid #30253e;padding:8px;font-family:'VT323',monospace;font-size:18px;outline:none;background:#f4f9f8;color:#30253e;"/>
    <input id="li-pass" type="password" placeholder="PASSWORD" autocomplete="current-password"
      style="border:2px solid #30253e;padding:8px;font-family:'VT323',monospace;font-size:18px;outline:none;background:#f4f9f8;color:#30253e;"/>
    <div id="li-err" style="font-size:14px;color:#c0392b;min-height:16px;font-family:'VT323',monospace;"></div>
    <button id="li-btn" style="background:#94c784;border:2px solid #30253e;box-shadow:3px 3px 0 #30253e;font-family:'VT323',monospace;font-size:18px;color:#30253e;padding:8px;cursor:pointer;">
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
    sessionStorage.setItem('curon_pw', password);
    location.reload();
  }
  document.getElementById('li-btn').addEventListener('click', doLogin);
  document.getElementById('li-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
};

window.showPasswordPrompt = function() {
  const saved = sessionStorage.getItem('curon_pw');
  if (saved) {
    sessionStorage.removeItem('curon_pw');
    bootApp(saved);
    return;
  }

  document.querySelector('.shell').style.display = 'none';
  const el = document.createElement('div');
  el.id = 'unlock-screen';
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;';
  el.innerHTML = `
<div style="background:#ffffff;border:2px solid #30253e;box-shadow:4px 4px 0 #30253e;width:300px;overflow:hidden;">
  <div style="background:#30253e;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-family:'Press Start 2P',monospace;font-size:8px;color:#c3c88c;">UNLOCK.EXE</span>
    <div style="display:flex;gap:4px;"><div style="width:11px;height:11px;border:2px solid #c3c88c;"></div></div>
  </div>
  <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
    <div style="font-family:'Press Start 2P',monospace;font-size:7px;color:#30253e;text-align:center;line-height:2;">
      WELCOME BACK<br>${STATE.user.username.toUpperCase()}
    </div>
    <input id="ul-pass" type="password" placeholder="PASSWORD" autocomplete="current-password"
      style="border:2px solid #30253e;padding:8px;font-family:'VT323',monospace;font-size:18px;outline:none;background:#f4f9f8;color:#30253e;"/>
    <div id="ul-err" style="font-size:14px;color:#c0392b;min-height:16px;font-family:'VT323',monospace;"></div>
    <button id="ul-btn" style="background:#94c784;border:2px solid #30253e;box-shadow:3px 3px 0 #30253e;font-family:'VT323',monospace;font-size:18px;color:#30253e;padding:8px;cursor:pointer;">
      UNLOCK ▶
    </button>
    <div id="ul-logout" style="font-size:13px;color:#638872;text-align:center;cursor:pointer;font-family:'VT323',monospace;">
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
      await bootApp(password);
    } catch (e) {
      btn.textContent = 'UNLOCK ▶';
      btn.disabled = false;
      errEl.textContent = 'wrong password or key error';
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
