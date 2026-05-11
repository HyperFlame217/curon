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
      el.innerHTML = `<img src="${other}" alt="${escAttr(STATE.otherName || 'THEM')} avatar" class="avatar-img">`;
    } else {
      el.textContent = '👧';
    }
  });

  // Settings preview
  const preview = document.getElementById('avatar-preview-me');
  if (preview) {
    if (mine) {
      preview.innerHTML = `<img src="${mine}" alt="Your avatar preview" class="avatar-preview">`;
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
    reader.onload = async (e) => {
      const originalUrl = e.target.result;
      const preview = document.getElementById('avatar-preview-me');
      
      // Show processing state immediately (P1-K)
      if (preview) {
        preview.innerHTML = `<div style="background:var(--color-sky);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:var(--font-size-micro);color:var(--color-offwhite);animation:blink 1s infinite;">PRC...</div>`;
      }
      
      // Downscale to 128x128 to save storage (P1-K)
      let finalUrl = originalUrl;
      try {
        finalUrl = await resizeImage(originalUrl, 128, 128);
      } catch (err) {
        console.error('[Avatars] Resize failed, using original:', err);
      }

      localStorage.setItem('curon_my_avatar_img', finalUrl);
      
      // Persistence fix
      fetch('/auth/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STATE.token}` },
        body: JSON.stringify({ img: finalUrl }),
      }).catch(console.error);

      applyAvatars();
      if (window.wsSend) wsSend(WS_EV.C_AVATAR_UPDATE, { img: finalUrl });
      if (window.showToast) showToast('AVATAR UPDATED');
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  applyAvatars();
};

async function resizeImage(dataUrl, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;

      if (w > h) {
        if (w > maxW) { h *= maxW / w; w = maxW; }
      } else {
        if (h > maxH) { w *= maxH / h; h = maxH; }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% quality jpeg is tiny
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
