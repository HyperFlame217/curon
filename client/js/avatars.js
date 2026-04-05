/**
 * CURON.EXE — Avatar Service
 * Manages identity imagery, synchronization with the DB, and UI application.
 */

window.getMyAvatar = function() { return localStorage.getItem('curon_my_avatar_img') || null; };
window.getOtherAvatar = function() { return localStorage.getItem('curon_other_avatar_img') || null; };

window.onAvatarUpdate = function(data) {
  if (data.userId === STATE.otherId) {
    localStorage.setItem('curon_other_avatar_img', data.img);
    applyAvatars();
  }
};

window._setAvatarEl = function(el, imgSrc, fallback) {
  if (!el) return;
  const dot = el.querySelector('.sdot');
  if (imgSrc) {
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    el.appendChild(img);
  } else {
    el.innerHTML = fallback;
  }
  if (dot) el.appendChild(dot);
};

window.applyAvatars = function() {
  const mine = getMyAvatar();
  const other = getOtherAvatar();

  // House Character Models (Block 7.7)
  if (window.HOUSE_STATE && HOUSE_STATE.player) {
     if (mine) HOUSE_STATE.player.outfit = [mine];
     if (other) HOUSE_STATE.partner.outfit = [other];
     if (window.renderCharacters) renderCharacters();
  }

  // Sidebar pair panel
  _setAvatarEl(document.querySelector('.pxava.you'), mine, '🧑');
  _setAvatarEl(document.querySelector('.pxava.her'), other, '👧');

  // Mobile header
  _setAvatarEl(document.querySelector('.mh-ava'), other, '👧');

  // Desktop status bar
  _setAvatarEl(document.querySelector('.status-bar .pxava'), other, '👧');

  // Message avatars (their side — update existing ones)
  document.querySelectorAll('.row.them .ra').forEach(el => {
    if (other) {
      el.innerHTML = `<img src="${other}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    } else {
      el.textContent = '👧';
    }
  });

  // Settings preview
  const preview = document.getElementById('avatar-preview-me');
  if (preview) {
    if (mine) {
      preview.innerHTML = `<img src="${mine}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    } else {
      preview.textContent = '🧑';
    }
  }
};

window.initAvatars = function() {
  const fileInput = document.getElementById('avatar-file-input');
  const uploadBtn = document.getElementById('avatar-upload-btn');

  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { 
      if (window.showToast) showToast('IMAGE TOO LARGE — MAX 2MB'); 
      return; 
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      localStorage.setItem('curon_my_avatar_img', dataUrl);
      
      // Persistence fix
      fetch('/auth/keys/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STATE.token}` },
        body: JSON.stringify({ img: dataUrl }),
      }).catch(console.error);

      applyAvatars();
      if (window.wsSend) wsSend(WS_EV.C_AVATAR_UPDATE, { img: dataUrl });
      if (window.showToast) showToast('AVATAR UPDATED');
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  applyAvatars();
};
