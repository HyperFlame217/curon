    //  GALLERY
    // ════════════════════════════════════════════════════════════

    let _galleryLoaded = false;

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

      loading.style.display = 'block';
      empty.style.display = 'none';

      // Fetch all messages in batches to find media
      let before = null;
      const allMedia = [];
      let done = false;

      while (!done) {
        const url = before
          ? `/messages?limit=100&before=${before}`
          : '/messages?limit=100';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${STATE.token}` },
        }).catch(() => null);
        if (!res || !res.ok) break;
        const msgs = await res.json();
        if (!msgs.length) break;

        for (const msg of msgs) {
          if (msg.media_id) {
            const mime = msg.encrypted_content || '';
            if (mime.startsWith('image/') || mime.startsWith('video/')) {
              allMedia.push(msg);
            }
          }
          // Also collect GIF messages (encrypted text starting with [gif])
          // We can't decrypt here easily so skip for now — only uploaded images
        }

        before = msgs[0].id;
        if (msgs.length < 100) done = true;
      }

      loading.style.display = 'none';

      if (!allMedia.length) {
        empty.style.display = 'block';
        _galleryLoaded = true;
        return;
      }

      // Group by month
      const byMonth = {};
      allMedia.forEach(msg => {
        const d = new Date(msg.created_at * 1000);
        const key = d.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(msg);
      });

      // Render — newest first
      const months = Object.keys(byMonth).reverse();
      months.forEach(month => {
        const sep = document.createElement('div');
        sep.className = 'gallery-month';
        sep.textContent = month;
        body.appendChild(sep);

        const grid = document.createElement('div');
        grid.className = 'gallery-grid';
        body.appendChild(grid);

        byMonth[month].forEach(msg => {
          const src = `/media/${msg.media_id}?token=${encodeURIComponent(STATE.token)}`;
          const mime = msg.encrypted_content || '';
          const isVideo = mime.startsWith('video/');

          const item = document.createElement('div');
          item.className = 'gallery-item';

          if (isVideo) {
            // Video — show thumbnail with play button overlay
            const vid = document.createElement('video');
            vid.src = src;
            vid.preload = 'metadata';
            vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            item.appendChild(vid);

            const badge = document.createElement('div');
            badge.className = 'gallery-item-gif';
            badge.textContent = '▶ VID';
            item.appendChild(badge);

            item.addEventListener('click', () => {
              // Open video in lightbox-style full overlay
              const overlay = document.createElement('div');
              overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
              const v = document.createElement('video');
              v.src = src;
              v.controls = true;
              v.autoplay = true;
              v.style.cssText = 'max-width:90vw;max-height:90vh;border:2px solid #c3c88c;';
              overlay.appendChild(v);
              overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
              document.body.appendChild(overlay);
            });
          } else {
            const img = document.createElement('img');
            img.src = src;
            img.alt = '';
            img.loading = 'lazy';
            item.appendChild(img);
            item.addEventListener('click', () => showLightbox(src));
          }

          grid.appendChild(item);
        });
      });

      _galleryLoaded = true;
    }

    function initGallery() {
      // Nav wiring is handled in initDrawer and initMobileNav
    }

    // ════════════════════════════════════════════════════════════