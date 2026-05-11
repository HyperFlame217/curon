//  GALLERY
// ════════════════════════════════════════════════════════════

const USE_OLD_GALLERY = false; // Feature flag for fallback

let _galleryLoaded = false;
let _currentTab = 'media';
let _mediaList = [];
let _fileList = [];
let _renderedCount = 0;
let _lazyScrollHandler = null;

// Pagination state
let _mediaOffset = 0;
let _fileOffset = 0;
let _mediaTotal = 0;
let _fileTotal = 0;
let _isLoadingMore = false;
let _byMonthCache = null;
let _galleryScrollTimer = null;
let _filesScrollTimer = null;

async function openGallery() {
  _closeAllViews();
  document.getElementById('gallery-view').classList.add('show');

  if (!_galleryLoaded) await loadGallery();
}

function closeGallery() {
  document.getElementById('gallery-view').classList.remove('show');
}

async function loadGallery() {
  const body = document.getElementById('gallery-body');
  const loading = document.getElementById('gallery-loading');
  const empty = document.getElementById('gallery-empty');

  body.querySelectorAll('.gallery-month, .gallery-grid, .gallery-files-list').forEach(el => el.remove());

  loading.innerHTML = `
        <div class="pixel-loader"><span></span><span></span><span></span></div>
        <div class="loading-text">LOADING...</div>
      `;
  loading.style.display = 'flex';
  empty.style.display = 'none';

  let timeoutId = setTimeout(() => {
    loading.innerHTML = `
          <div style="color:var(--color-deep);margin-bottom:10px;line-height:1.5;">SLOW CONNECTION...</div>
          <button class="pixel-btn" style="font-size:var(--font-size-small);padding:8px 12px;" onclick="loadGallery()">RETRY</button>
        `;
  }, 10000);

  // Reset pagination state
  _mediaOffset = 0;
  _fileOffset = 0;
  _mediaList = [];
  _fileList = [];
  _byMonthCache = null;

  try {
    if (USE_OLD_GALLERY) {
      // Legacy: fetch all messages
      await loadGalleryLegacy();
    } else {
      // New: fetch paginated gallery data
      const [mediaRes, filesRes] = await Promise.all([
        fetch('/gallery/media?limit=15&offset=0', { headers: { Authorization: `Bearer ${STATE.token}` } }),
        fetch('/gallery/files?limit=20&offset=0', { headers: { Authorization: `Bearer ${STATE.token}` } })
      ]);

      if (!mediaRes.ok || !filesRes.ok) throw new Error('Fetch failed');

      const mediaData = await mediaRes.json();
      const filesData = await filesRes.json();

      _mediaList = mediaData.items;
      _fileList = filesData.items;
      _mediaTotal = mediaData.total;
      _fileTotal = filesData.total;
      _mediaOffset = 15;
      _fileOffset = 20;
    }

    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    loading.innerHTML = `
          <div style="color:var(--color-deep);margin-bottom:10px;line-height:1.5;">FAILED TO LOAD</div>
          <button class="pixel-btn" style="font-size:var(--font-size-small);padding:8px 12px;" onclick="loadGallery()">RETRY</button>
        `;
    return;
  }

  loading.style.display = 'none';
  renderGalleryTab();
  _galleryLoaded = true;
}

// Legacy fallback: fetch all messages (original implementation)
async function loadGalleryLegacy() {
  let before = null;
  const allMedia = [];
  const allFiles = [];
  let done = false;

  while (!done) {
    const url = before
      ? `/messages?limit=100&before=${before}`
      : '/messages?limit=100';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${STATE.token}` },
    });
    if (!res.ok) throw new Error('Fetch failed');

    const msgs = await res.json();
    if (!msgs.length) break;

    for (const msg of msgs) {
      if (msg.media_id) {
        const mime = (msg.content || msg.encrypted_content || '').toLowerCase();
        if (mime.startsWith('image/') || mime.startsWith('video/')) {
          allMedia.push(msg);
        } else {
          allFiles.push(msg);
        }
      }
    }

    before = msgs[0].id;
    if (msgs.length < 100) done = true;
  }

  _mediaList = allMedia;
  _fileList = allFiles;
  _mediaTotal = allMedia.length;
  _fileTotal = allFiles.length;
}

// Load next batch for infinite scroll
async function loadNextBatch(tab) {
  if (_isLoadingMore) return;
  if (tab === 'media' && _mediaOffset >= _mediaTotal) return;
  if (tab === 'files' && _fileOffset >= _fileTotal) return;

  _isLoadingMore = true;
  const loading = document.getElementById('gallery-loading');
  const originalText = loading.querySelector('.loading-text')?.textContent || 'LOADING...';
  loading.querySelector('.loading-text').textContent = 'LOADING MORE...';

  try {
    if (USE_OLD_GALLERY) {
      // Legacy: no more batches available
      _isLoadingMore = false;
      loading.querySelector('.loading-text').textContent = originalText;
      return;
    }

    const endpoint = tab === 'media' ? '/gallery/media' : '/gallery/files';
    const offset = tab === 'media' ? _mediaOffset : _fileOffset;
    const limit = tab === 'media' ? 15 : 20;

    const res = await fetch(`${endpoint}?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${STATE.token}` }
    });
    if (!res.ok) throw new Error('Fetch failed');

    const data = await res.json();

    if (tab === 'media') {
      _mediaList = [..._mediaList, ...data.items];
      _mediaOffset += data.items.length;
    } else {
      _fileList = [..._fileList, ...data.items];
      _fileOffset += data.items.length;
    }

    // Clear cache to force re-group
    _byMonthCache = null;

    // Append new items to DOM
    const body = document.getElementById('gallery-body');
    if (tab === 'media') {
      renderMediaTab(body, false);
    } else {
      renderFilesTab(body, false);
    }
  } catch (err) {
    console.error('Load more error:', err);
  } finally {
    _isLoadingMore = false;
    loading.querySelector('.loading-text').textContent = originalText;
  }
}

function renderGalleryTab() {
  const body = document.getElementById('gallery-body');
  body.querySelectorAll('.gallery-month, .gallery-grid, .gallery-files-list').forEach(el => el.remove());

  if (_currentTab === 'media') {
    renderMediaTab(body, true);
  } else {
    renderFilesTab(body, true);
  }
}

function renderMediaTab(body, reset = true) {
  const empty = document.getElementById('gallery-empty');

  if (reset) {
    body.querySelectorAll('.gallery-month, .gallery-grid, .gallery-files-list').forEach(el => el.remove());
    _renderedCount = 0;
    if (_lazyScrollHandler) {
      document.getElementById('gallery-body').removeEventListener('scroll', _lazyScrollHandler);
      _lazyScrollHandler = null;
    }
    _byMonthCache = null;
  }

  if (!_mediaList.length) {
    empty.style.display = 'block';
    empty.innerHTML = '📷 NO IMAGES YET<br>SHARE SOME PHOTOS!';
    return;
  }
  empty.style.display = 'none';

  // Build or use cached month grouping
  if (!_byMonthCache) {
    _byMonthCache = {};
    _mediaList.forEach(msg => {
      const d = new Date(msg.created_at * 1000);
      const key = d.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
      if (!_byMonthCache[key]) _byMonthCache[key] = [];
      _byMonthCache[key].push(msg);
    });
  }

  const months = Object.keys(_byMonthCache).reverse();

  for (const month of months) {
    let monthSep = body.querySelector(`.gallery-month:last-of-type`);
    let grid = body.querySelector(`.gallery-grid:last-of-type`);

    if (!monthSep) {
      monthSep = document.createElement('div');
      monthSep.className = 'gallery-month';
      monthSep.textContent = month;
      body.appendChild(monthSep);
      grid = document.createElement('div');
      grid.className = 'gallery-grid';
      body.appendChild(grid);
    }

    for (const msg of _byMonthCache[month]) {
      const src = `/media/${msg.id}?token=${encodeURIComponent(STATE.token)}`;
      const thumbSrc = `/media/${msg.id}/thumb?token=${encodeURIComponent(STATE.token)}`;
      const mime = (msg.mime_type || '').toLowerCase();
      const isVideo = mime.startsWith('video/');

      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.setAttribute('role', 'button');
      const d = new Date(msg.created_at * 1000);
      const dateStr = d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
      const ariaLabel = `${mime.startsWith('video/') ? 'Video' : 'Image'} shared on ${dateStr}`;

      if (isVideo) {
        const vid = document.createElement('video');
        vid.src = src;
        vid.preload = 'metadata';
        vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        vid.setAttribute('aria-label', ariaLabel);
        item.appendChild(vid);

        const badge = document.createElement('div');
        badge.className = 'gallery-item-gif';
        badge.textContent = '▶ VID';
        item.appendChild(badge);

        item.addEventListener('click', () => {
          const overlay = document.createElement('div');
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
          const v = document.createElement('video');
          v.src = src;
          v.controls = true;
          v.autoplay = true;
          v.setAttribute('aria-label', 'Fullscreen video');
          v.style.cssText = 'max-width:90vw;max-height:90vh;border:2px solid var(--color-accent);';
          overlay.appendChild(v);
          overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
          document.body.appendChild(overlay);
        });
      } else {
        const img = document.createElement('img');
        img.src = thumbSrc;
        img.alt = ariaLabel;
        img.loading = 'lazy';
        item.appendChild(img);
        item.setAttribute('aria-label', ariaLabel);
        item.addEventListener('click', () => showLightbox(src));
      }

      grid.appendChild(item);
    }
  }

  if (_mediaOffset < _mediaTotal) {
    const galleryBody = document.getElementById('gallery-body');
    _lazyScrollHandler = () => {
      clearTimeout(_galleryScrollTimer);
      _galleryScrollTimer = setTimeout(() => {
        if (galleryBody.scrollTop + galleryBody.clientHeight >= galleryBody.scrollHeight - 200) {
          loadNextBatch('media');
        }
      }, 150);
    };
    galleryBody.addEventListener('scroll', _lazyScrollHandler);
  }
}

let _filesRendered = 0;
let _filesScrollHandler = null;

function renderFilesTab(body, reset = true) {
  const empty = document.getElementById('gallery-empty');

  if (reset) {
    body.querySelectorAll('.gallery-month, .gallery-grid, .gallery-files-list').forEach(el => el.remove());
    _filesRendered = 0;
    if (_filesScrollHandler) {
      document.getElementById('gallery-body').removeEventListener('scroll', _filesScrollHandler);
      _filesScrollHandler = null;
    }
  }

  if (!_fileList.length) {
    empty.style.display = 'block';
    empty.innerHTML = '📁 NO FILES YET<br>SHARE SOME DOCUMENTS!';
    return;
  }
  empty.style.display = 'none';

  let list = body.querySelector('.gallery-files-list:last-of-type');
  if (!list) {
    list = document.createElement('div');
    list.className = 'gallery-files-list';
    body.appendChild(list);
  }

  const sortedFiles = [..._fileList].sort((a, b) => b.created_at - a.created_at);
  let rendered = 0;

  for (let i = _filesRendered; i < sortedFiles.length; i++) {
    const msg = sortedFiles[i];
    const src = `/media/${msg.id}?token=${encodeURIComponent(STATE.token)}`;
    const mime = (msg.mime_type || '').toLowerCase();
    const ext = mime.split('/')[1] || 'file';
    const size = msg.size_bytes || 0;

    const item = document.createElement('div');
    item.className = 'gallery-file-item';

    let icon = '📄';
    if (mime.includes('pdf')) icon = '📕';
    else if (mime.includes('word') || mime.includes('document')) icon = '📝';
    else if (mime.includes('excel') || mime.includes('sheet')) icon = '📊';
    else if (mime.includes('zip') || mime.includes('rar') || mime.includes('archive')) icon = '📦';
    else if (mime.includes('audio')) icon = '🎵';
    else if (mime.includes('text')) icon = '📃';

    item.innerHTML = `
      <span class="gallery-file-icon">${icon}</span>
      <div class="gallery-file-info">
        <span class="gallery-file-name">${ext.toUpperCase()} FILE</span>
        <span class="gallery-file-size">${formatFileSize(size)}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      window.open(src, '_blank');
    });

    list.appendChild(item);
    _filesRendered++;
    rendered++;
  }

  if (_fileOffset < _fileTotal) {
    const galleryBody = document.getElementById('gallery-body');
    _filesScrollHandler = () => {
      clearTimeout(_filesScrollTimer);
      _filesScrollTimer = setTimeout(() => {
        if (galleryBody.scrollTop + galleryBody.clientHeight >= galleryBody.scrollHeight - 200) {
          loadNextBatch('files');
        }
      }, 150);
    };
    galleryBody.addEventListener('scroll', _filesScrollHandler);
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

window.switchGalleryTab = function(type) {
  _currentTab = type;

  // Update tab button styles + ARIA
  document.querySelectorAll('.gallery-tab').forEach(btn => {
    const isActive = btn.dataset.tab === type;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  // Re-render with fade transition
  if (_galleryLoaded) {
    const body = document.getElementById('gallery-body');
    body.classList.add('fade-out');
    setTimeout(() => {
      renderGalleryTab();
      body.classList.remove('fade-out');
    }, 200);
  }
};

function initGallery() {
  const galleryTablist = document.querySelector('.gallery-tabs');
  if (galleryTablist) {
    galleryTablist.setAttribute('role', 'tablist');
    galleryTablist.addEventListener('keydown', (e) => {
      const tabs = Array.from(galleryTablist.querySelectorAll('[role="tab"]'));
      const current = document.activeElement;
      const idx = tabs.indexOf(current);
      if (idx === -1) return;
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); next.focus(); }
    });
  }

  // Wire gallery tab buttons
  document.querySelectorAll('.gallery-tab').forEach(btn => {
    btn.addEventListener('click', () => switchGalleryTab(btn.dataset.tab));
  });
}

// ════════════════════════════════════════════════════════════