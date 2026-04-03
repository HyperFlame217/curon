    //  GIF PICKER
    // ════════════════════════════════════════════════════════════

    let _gifSearchTimer = null;

    function openGifPanel() {
      closeEmojiPanel();
      const panel = document.getElementById('gif-panel');
      const btn = document.getElementById('btn-gif');
      const rect = btn.getBoundingClientRect();

      let left = rect.left;
      if (left + 340 > window.innerWidth - 8) left = window.innerWidth - 348;
      if (left < 8) left = 8;

      panel.style.left = left + 'px';
      panel.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
      panel.style.top = 'auto';
      panel.style.width = '340px';
      panel.style.display = 'flex';

      // Load trending on open
      if (!document.querySelector('#gif-grid img')) loadGifs('');
      setTimeout(() => document.getElementById('gif-search')?.focus(), 50);
    }

    function closeGifPanel() {
      document.getElementById('gif-panel').style.display = 'none';
    }

    async function loadGifs(query) {
      const grid = document.getElementById('gif-grid');
      grid.innerHTML = '<div style="width:100%;text-align:center;padding:16px;font-family:&quot;Press Start 2P&quot;,monospace;font-size:6px;color:#638872;">LOADING...</div>';

      try {
        const endpoint = query ? `/gifs/search?q=${encodeURIComponent(query)}` : '/gifs/trending';
        const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${STATE.token}` } });
        const gifs = await res.json();

        if (!gifs.length) {
          grid.innerHTML = '<div style="width:100%;text-align:center;padding:16px;font-family:&quot;Press Start 2P&quot;,monospace;font-size:6px;color:#638872;">NO RESULTS</div>';
          return;
        }

        grid.innerHTML = '';
        // Two-column masonry: split GIFs into left and right columns
        const colL = document.createElement('div');
        const colR = document.createElement('div');
        colL.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;';
        colR.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;';
        grid.appendChild(colL);
        grid.appendChild(colR);

        gifs.forEach((gif, i) => {
          const col = i % 2 === 0 ? colL : colR;

          const cell = document.createElement('div');
          cell.style.cssText = 'cursor:pointer;overflow:hidden;background:#1a1226;position:relative;border:2px solid transparent;transition:border-color .08s;';

          const img = document.createElement('img');
          img.src = gif.preview || gif.url;
          img.alt = gif.title;
          img.loading = 'lazy';
          img.style.cssText = 'width:100%;display:block;transition:opacity .1s;';

          cell.appendChild(img);
          cell.addEventListener('click', () => sendGif(gif));
          cell.addEventListener('mouseenter', () => { cell.style.borderColor = '#c3c88c'; img.style.opacity = '0.85'; });
          cell.addEventListener('mouseleave', () => { cell.style.borderColor = 'transparent'; img.style.opacity = '1'; });
          col.appendChild(cell);
        });
      } catch {
        grid.innerHTML = '<div style="width:100%;text-align:center;padding:16px;font-family:&quot;Press Start 2P&quot;,monospace;font-size:6px;color:#c0392b;">ERROR LOADING GIFS</div>';
      }
    }

    async function sendGif(gif) {
      closeGifPanel();
      if (!STATE.otherPubKey) { showToast('OTHER USER NOT READY'); return; }

      // Always encrypt: slot A = user_a's key, slot B = user_b's key
      const amUserA = STATE.user.id === STATE.userAId;
      const pubKeyA = amUserA ? STATE.publicKey : STATE.otherPubKey;
      const pubKeyB = amUserA ? STATE.otherPubKey : STATE.publicKey;

      // Encrypt the GIF URL with a [gif] prefix tag so receiver renders it as image
      const cipher = await encryptMessage('[gif]' + gif.url, pubKeyA, pubKeyB);
      wsSend('message_send', { cipher, reply_to_id: REPLY_STATE.active ? REPLY_STATE.msgId : null });
      cancelReply();
    }

    function initGifPicker() {
      document.getElementById('btn-gif').addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('gif-panel');
        if (panel.style.display === 'flex') closeGifPanel();
        else openGifPanel();
      });

      document.getElementById('gif-close').addEventListener('click', closeGifPanel);

      document.getElementById('gif-search').addEventListener('input', (e) => {
        clearTimeout(_gifSearchTimer);
        _gifSearchTimer = setTimeout(() => loadGifs(e.target.value.trim()), 400);
      });

      document.getElementById('gif-search').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeGifPanel();
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        const panel = document.getElementById('gif-panel');
        const btn = document.getElementById('btn-gif');
        if (panel.style.display === 'flex' && !panel.contains(e.target) && e.target !== btn) {
          closeGifPanel();
        }
      });
    }

    // ════════════════════════════════════════════════════════════
    //  MEDIA — upload, record, render
    // ════════════════════════════════════════════════════════════

    // ── Upload a file to /media, returns { id, mime_type, size } ─
    async function uploadMedia(file) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STATE.token}` },
        body: form,
      });
      if (!res.ok) { showToast('UPLOAD FAILED'); return null; }
      return res.json();
    }

    // ── Send a media message ──────────────────────────────────────
    async function sendMediaMessage(file) {
      if (!STATE.otherPubKey) { showToast('OTHER USER NOT READY'); return; }

      showToast('UPLOADING...');
      const media = await uploadMedia(file);
      if (!media) return;

      // Always encrypt: slot A = user_a's key, slot B = user_b's key
      const amUserA = STATE.user.id === STATE.userAId;
      const pubKeyA = amUserA ? STATE.publicKey : STATE.otherPubKey;
      const pubKeyB = amUserA ? STATE.otherPubKey : STATE.publicKey;

      // Encrypt a placeholder text so the message row stores valid cipher
      const cipher = await encryptMessage(`[media:${media.id}]`, pubKeyA, pubKeyB).catch(() => null);
      if (!cipher) { showToast('ENCRYPT ERROR'); return; }

      // Override cipher content with media metadata (mime type in content fields)
      cipher.encrypted_content_a = media.mime_type;
      cipher.encrypted_content_b = media.mime_type;

      wsSend('message_send', { cipher, media_id: media.id, reply_to_id: REPLY_STATE.active ? REPLY_STATE.msgId : null });
      cancelReply();
      showToast('');
    }

    // ── Build inline media element for a message ─────────────────
    function buildMediaEl(mediaId, mimeType) {
      const src = `/media/${mediaId}?token=${encodeURIComponent(STATE.token)}`;

      if (mimeType && mimeType.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'media-img';
        img.src = src;
        img.alt = 'image';
        img.loading = 'lazy';
        img.addEventListener('click', () => showLightbox(src));
        return img;
      }

      if (mimeType && mimeType.startsWith('audio/')) {
        return buildAudioPlayer(src);
      }

      if (mimeType && mimeType.startsWith('video/')) {
        const vid = document.createElement('video');
        vid.src = src;
        vid.controls = true;
        vid.style.cssText = 'max-width:280px;border:2px solid #30253e;display:block;';
        return vid;
      }

      // Generic file download
      const wrap = document.createElement('div');
      wrap.className = 'file-attach';
      wrap.innerHTML = `
    <div class="file-icon">📎</div>
    <div>
      <div class="file-name">${escHtml(mimeType || 'file')}</div>
      <div class="file-size">click to download</div>
    </div>`;
      wrap.addEventListener('click', () => window.open(src, '_blank'));
      return wrap;
    }

    function buildAudioPlayer(src) {
      const wrap = document.createElement('div');
      wrap.className = 'ab';
      wrap.style.cssText = 'display:flex;align-items:center;gap:9px;padding:8px 12px;background:#fff;border:2px solid #30253e;box-shadow:2px 2px 0 #30253e;min-width:195px;';

      // Use a proper <audio> element in the DOM for best browser compat
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = src;
      audio.style.display = 'none';
      wrap.appendChild(audio); // must be in DOM for Firefox

      const playBtn = document.createElement('div');
      playBtn.className = 'aplay';
      playBtn.textContent = '▶';

      const info = document.createElement('div');
      info.innerHTML = `
    <div class="albl">VOICE MSG</div>
    <div class="abar" style="height:4px;background:#e0e0e0;border:1px solid #30253e;cursor:pointer;position:relative;">
      <div class="abar-fill" style="position:absolute;left:0;top:0;height:100%;width:0%;background:#80b9b1;"></div>
    </div>
    <div class="adur">0:00</div>`;

      const dur = info.querySelector('.adur');
      const barFill = info.querySelector('.abar-fill');
      const bar = info.querySelector('.abar');

      const updateDur = () => {
        if (audio.duration && isFinite(audio.duration)) {
          dur.textContent = fmtDur(audio.currentTime) + ' / ' + fmtDur(audio.duration);
          barFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        }
      };

      audio.addEventListener('loadedmetadata', updateDur);
      audio.addEventListener('durationchange', updateDur);
      audio.addEventListener('timeupdate', updateDur);
      audio.addEventListener('ended', () => { playBtn.textContent = '▶'; });
      audio.addEventListener('error', () => {
        dur.textContent = 'UNSUPPORTED';
        playBtn.textContent = '✕';
        playBtn.style.cursor = 'default';
      });

      playBtn.addEventListener('click', () => {
        if (audio.paused) {
          audio.play().then(() => {
            playBtn.textContent = '⏸';
          }).catch(err => {
            console.error('play failed:', err);
            dur.textContent = 'CLICK AGAIN';
          });
        } else {
          audio.pause();
          playBtn.textContent = '▶';
        }
      });

      bar.addEventListener('click', e => {
        if (!audio.duration) return;
        const rect = bar.getBoundingClientRect();
        audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
      });

      wrap.appendChild(playBtn);
      wrap.appendChild(info);
      return wrap;
    }

    function fmtDur(s) {
      if (!s || isNaN(s)) return '0:00';
      return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    }

    // ── Lightbox ──────────────────────────────────────────────────
    function showLightbox(src) {
      const lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.innerHTML = `<img src="${src}" alt="image"/>`;
      lb.addEventListener('click', () => lb.remove());
      document.body.appendChild(lb);
    }


    // ── WAV encoder ───────────────────────────────────────────────
    // Converts an AudioBuffer to a WAV Blob — universally playable
    function encodeWAVFromFloat32(samples, sampleRate) {
      const numChannels = 1; // mono recording
      const format = 1; // PCM
      const bitDepth = 16;

      // Convert Float32 to 16-bit PCM
      const pcm = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Build WAV header
      const dataLength = pcm.byteLength;
      const buffer = new ArrayBuffer(44 + dataLength);
      const view = new DataView(buffer);

      function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      }

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataLength, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, format, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
      view.setUint16(32, numChannels * (bitDepth / 8), true);
      view.setUint16(34, bitDepth, true);
      writeString(36, 'data');
      view.setUint32(40, dataLength, true);

      // Write PCM data
      const pcmView = new Int16Array(buffer, 44);
      pcmView.set(pcm);

      return new Blob([buffer], { type: 'audio/wav' });
    }
    // ── Voice recording (AudioContext-based — cross-browser compatible) ──
    let _audioCtxRec = null;
    let _recProcessor = null;
    let _recStream = null;
    let _recSamples = [];
    let _recordingStart = null;

    async function startRecording() {
      try {
        _recStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        showToast('MIC ACCESS DENIED');
        return;
      }

      _recSamples = [];
      _recordingStart = Date.now();
      // Don't force sample rate — use device's native rate to avoid resampling issues
      _audioCtxRec = new AudioContext();

      const source = _audioCtxRec.createMediaStreamSource(_recStream);

      // ScriptProcessorNode is deprecated but AudioWorklet requires an external file
      // which breaks our single-file approach. It works fine in all browsers for now.
      _recProcessor = _audioCtxRec.createScriptProcessor(4096, 1, 1);
      _recProcessor.onaudioprocess = (e) => {
        if (_audioCtxRec) {
          _recSamples.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        }
      };

      source.connect(_recProcessor);
      // Connect to destination to keep the audio graph alive (required by spec)
      _recProcessor.connect(_audioCtxRec.destination);

      document.getElementById('btn-mic').classList.add('recording');
      document.getElementById('rec-indicator').classList.add('show');
      document.getElementById('ifield').placeholder = 'recording...';
    }

    async function stopRecording() {
      if (!_audioCtxRec) return;

      if (Date.now() - _recordingStart < 500) {
        _cleanupRecorder();
        resetRecordingUI();
        showToast('HOLD LONGER TO RECORD');
        return;
      }

      _recProcessor.disconnect();
      _recStream.getTracks().forEach(t => t.stop());
      const actualSampleRate = _audioCtxRec.sampleRate;
      await _audioCtxRec.close();

      // Merge all chunks
      const totalLen = _recSamples.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of _recSamples) { merged.set(chunk, offset); offset += chunk.length; }

      _cleanupRecorder();
      resetRecordingUI();

      const wavBlob = encodeWAVFromFloat32(merged, actualSampleRate);
      const file = new File([wavBlob], 'voice-' + Date.now() + '.wav', { type: 'audio/wav' });
      await sendMediaMessage(file);
    }

    function _cleanupRecorder() {
      _audioCtxRec = null;
      _recProcessor = null;
      _recStream = null;
      _recSamples = [];
    }

    function resetRecordingUI() {
      document.getElementById('btn-mic').classList.remove('recording');
      document.getElementById('rec-indicator').classList.remove('show');
      document.getElementById('ifield').placeholder = 'type here_';
    }

    // ── Init media buttons ────────────────────────────────────────
    function initMediaButtons() {
      // Hidden file inputs
      const attachInput = document.createElement('input');
      attachInput.type = 'file';
      attachInput.accept = '*/*';
      attachInput.style.display = 'none';
      document.body.appendChild(attachInput);

      document.getElementById('btn-attach').addEventListener('click', () => attachInput.click());

      attachInput.addEventListener('change', () => {
        if (attachInput.files[0]) sendMediaMessage(attachInput.files[0]);
        attachInput.value = '';
      });

      // Mic — hold to record
      const micBtn = document.getElementById('btn-mic');

      // Desktop: mousedown/mouseup
      micBtn.addEventListener('mousedown', e => { e.preventDefault(); startRecording(); });
      micBtn.addEventListener('mouseup', () => stopRecording());
      micBtn.addEventListener('mouseleave', () => { if (_audioCtxRec) stopRecording(); });

      // Mobile: touchstart/touchend
      micBtn.addEventListener('touchstart', e => { e.preventDefault(); startRecording(); }, { passive: false });
      micBtn.addEventListener('touchend', e => { e.preventDefault(); stopRecording(); }, { passive: false });
    }

    // ════════════════════════════════════════════════════════════
    //  CUSTOM EMOJIS
    // ════════════════════════════════════════════════════════════

    const STANDARD_EMOJIS = [
      '😀', '😂', '🥹', '😍', '🥰', '😎', '🤔', '😴', '🤯', '😭', '😡', '🥳',
      '👍', '👎', '❤️', '🔥', '✨', '💯', '🎉', '👀', '🙏', '💀', '🫡', '🤝',
      '😤', '🫶', '💅', '🤌', '👏', '🤣', '😅', '😬', '🫠', '💔', '⭐', '🚀',
    ];

    let _customEmojis = []; // { id, name, filename }
    let _emojiTab = 'std';
    let _acIndex = -1; // selected autocomplete index
    let _acResults = []; // current autocomplete results
    let _acQuery = ''; // the :word being completed

    // ── Handle server emoji update broadcast ─────────────────────
    async function onEmojiUpdated() {
      await loadCustomEmojis();
      // Re-render all message bubbles that contain :name: patterns
      document.querySelectorAll('.b').forEach(bubble => {
        bubble.querySelectorAll('img.custom-emoji').forEach(img => img.remove());
        // Re-process text nodes
        const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        textNodes.forEach(node => {
          if (node.textContent.includes(':')) {
            const span = document.createElement('span');
            span.innerHTML = renderMessageText(node.textContent);
            node.parentNode.replaceChild(span, node);
          }
        });
      });
    }

    // ── Fetch emoji list from server ──────────────────────────────
    async function loadCustomEmojis() {
      try {
        const res = await fetch('/emojis', { headers: { Authorization: `Bearer ${STATE.token}` } });
        if (res.ok) _customEmojis = await res.json();
      } catch { }
    }

    // ── Emoji image URL ───────────────────────────────────────────
    function emojiImgUrl(filename) {
      return `/emojis/img/${encodeURIComponent(filename)}?token=${encodeURIComponent(STATE.token)}`;
    }

    // ── Parse message text and replace :name: with <img> ─────────
    function renderEmojiText(text) {
      if (!_customEmojis.length) return escHtml(text);
      const map = {};
      _customEmojis.forEach(e => { map[e.name] = e.filename; });
      // Split on :name: tokens
      return text.replace(/:[a-z0-9_]+:/g, token => {
        const name = token.slice(1, -1);
        if (map[name]) {
          return `<img class="custom-emoji" src="${emojiImgUrl(map[name])}" alt=":${name}:" title=":${name}:">`;
        }
        return escHtml(token);
      });
    }

    // ── Render message text with emoji substitution ───────────────
    // Replace escHtml in bubble with renderEmojiText
    function renderMessageText(text) {
      // escHtml the plain parts, but allow our <img> tags through
      if (!_customEmojis.length) return escHtml(text);
      const map = {};
      _customEmojis.forEach(e => { map[e.name] = e.filename; });

      const parts = text.split(/(:[a-z0-9_]+:)/g);
      return parts.map(part => {
        if (/^:[a-z0-9_]+:$/.test(part)) {
          const name = part.slice(1, -1);
          if (map[name]) {
            return `<img class="custom-emoji" src="${emojiImgUrl(map[name])}" alt=":${name}:" title=":${name}:">`;
          }
        }
        return escHtml(part);
      }).join('');
    }

    // ── Panel open/close ──────────────────────────────────────────
    function toggleEmojiPanel() {
      const panel = document.getElementById('emoji-panel');
      if (panel.classList.contains('open')) {
        closeEmojiPanel();
        return;
      }
      closeGifPanel(); // close GIF panel if open

      // Position above the emoji button using fixed coords
      const btn = document.getElementById('btn-emoji');
      const rect = btn.getBoundingClientRect();
      const panelW = 320;
      let left = rect.left;
      // Keep within viewport
      if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
      if (left < 8) left = 8;

      panel.style.left = left + 'px';
      panel.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
      panel.style.top = 'auto';

      panel.classList.add('open');
      renderEmojiGrid();
      setTimeout(() => document.getElementById('emoji-search')?.focus(), 50);
    }

    function closeEmojiPanel() {
      document.getElementById('emoji-panel')?.classList.remove('open');
    }

    function switchEmojiTab(tab) {
      _emojiTab = tab;
      document.getElementById('etab-std').classList.toggle('on', tab === 'std');
      document.getElementById('etab-custom').classList.toggle('on', tab === 'custom');
      document.getElementById('emoji-search').value = '';
      renderEmojiGrid();
    }

    function renderEmojiGrid(filter = '') {
      const grid = document.getElementById('emoji-grid');
      const isAdmin = STATE.user?.username === (STATE.emojiAdmin || '');

      // Show upload row for admin on custom tab
      const uploadRow = document.getElementById('emoji-upload-row');
      if (uploadRow) uploadRow.style.display = (_emojiTab === 'custom' && isAdmin) ? 'flex' : 'none';

      grid.innerHTML = '';

      if (_emojiTab === 'std') {
        const items = filter
          ? STANDARD_EMOJIS.filter(e => e.includes(filter))
          : STANDARD_EMOJIS;
        if (!items.length) { grid.innerHTML = '<div class="emoji-empty">NO RESULTS</div>'; return; }
        items.forEach(emoji => {
          const el = document.createElement('div');
          el.className = 'emoji-grid-item';
          el.textContent = emoji;
          el.addEventListener('click', () => insertEmojiText(emoji));
          grid.appendChild(el);
        });
      } else {
        const items = filter
          ? _customEmojis.filter(e => e.name.includes(filter.toLowerCase()))
          : _customEmojis;
        if (!items.length) {
          grid.innerHTML = `<div class="emoji-empty">${_customEmojis.length ? 'NO RESULTS' : 'NO CUSTOM EMOJIS YET'}</div>`;
          return;
        }
        items.forEach(emoji => {
          const el = document.createElement('div');
          el.className = 'emoji-grid-item';
          el.innerHTML = `
        <img src="${emojiImgUrl(emoji.filename)}" alt=":${emoji.name}:">
        <div class="emoji-tooltip">:${emoji.name}:</div>`;

          // Left click = insert into message
          el.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-delete')) insertEmojiText(`:${emoji.name}:`);
          });

          // Right click = delete (admin only)
          if (isAdmin) {
            el.title = 'Click to use • Right-click to delete';
            el.addEventListener('contextmenu', async (e) => {
              e.preventDefault();
              if (!confirm(`Delete :${emoji.name}:?`)) return;
              await deleteCustomEmoji(emoji.name);
            });
          }
          grid.appendChild(el);
        });
      }
    }

    // ── Insert emoji text into input field ───────────────────────
    function insertEmojiText(text) {
      const field = document.getElementById('ifield');
      const start = field.selectionStart;
      const end = field.selectionEnd;
      const val = field.value;
      field.value = val.slice(0, start) + text + val.slice(end);
      field.selectionStart = field.selectionEnd = start + text.length;
      field.focus();
      closeEmojiPanel();
    }

    // ── Search filter ─────────────────────────────────────────────
    function initEmojiSearch() {
      document.getElementById('emoji-search').addEventListener('input', e => {
        renderEmojiGrid(e.target.value.trim());
      });
      // Close panel on click outside
      // Use mousedown instead of click to close — fires before the button's click
      // and we can check the target reliably
      document.addEventListener('mousedown', e => {
        const panel = document.getElementById('emoji-panel');
        const btn = document.getElementById('btn-emoji');
        if (panel?.classList.contains('open') &&
          !panel.contains(e.target) &&
          !btn?.contains(e.target)) {
          closeEmojiPanel();
        }
      });
    }

    // ── Upload new emoji ──────────────────────────────────────────
    function initEmojiUpload() {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/png,image/jpeg,image/webp';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      document.getElementById('emoji-upload-btn').addEventListener('click', () => {
        const name = document.getElementById('emoji-name-input').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!name) { showToast('ENTER A NAME FIRST'); return; }
        fileInput.click();
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const name = document.getElementById('emoji-name-input').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const form = new FormData();
        form.append('file', file);
        form.append('name', name);
        const res = await fetch('/emojis', {
          method: 'POST',
          headers: { Authorization: `Bearer ${STATE.token}` },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error?.toUpperCase() || 'UPLOAD FAILED'); return; }
        showToast(`:${name}: ADDED!`);
        document.getElementById('emoji-name-input').value = '';
        fileInput.value = '';
        await loadCustomEmojis();
        renderEmojiGrid();
      });
    }

    // ── Delete emoji ──────────────────────────────────────────────
    async function deleteCustomEmoji(name) {
      const res = await fetch(`/emojis/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${STATE.token}` },
      });
      if (res.ok) {
        showToast(`:${name}: DELETED`);
        await loadCustomEmojis();
        renderEmojiGrid();
      } else {
        showToast('DELETE FAILED');
      }
    }

    // ── Autocomplete (:word triggers) ────────────────────────────
    function initEmojiAutocomplete() {
      const field = document.getElementById('ifield');
      const ac = document.getElementById('emoji-autocomplete');

      field.addEventListener('input', () => {
        if (_customEmojis.length === 0) { closeAutocomplete(); return; }

        const val = field.value;
        const cursor = field.selectionStart;
        const before = val.slice(0, cursor);

        // Match : followed by 0 or more valid chars (triggers on just ":")
        const match = before.match(/:([a-z0-9_]{0,30})$/);

        if (!match) { closeAutocomplete(); return; }

        _acQuery = match[1];
        // Show all if no query yet, otherwise filter
        _acResults = _acQuery
          ? _customEmojis.filter(e => e.name.startsWith(_acQuery))
          : _customEmojis.slice(0, 8);

        if (!_acResults.length) { closeAutocomplete(); return; }

        ac.innerHTML = '';
        _acIndex = -1;
        _acResults.slice(0, 8).forEach((emoji, i) => {
          const item = document.createElement('div');
          item.className = 'emoji-ac-item';
          item.dataset.idx = i;
          item.innerHTML = `<img src="${emojiImgUrl(emoji.filename)}" alt=""> :${emoji.name}:`;
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            applyAutocomplete(_acResults[i]);
          });
          ac.appendChild(item);
        });

        // Position above the input field
        const fieldRect = field.getBoundingClientRect();
        ac.style.left = fieldRect.left + 'px';
        ac.style.bottom = (window.innerHeight - fieldRect.top + 4) + 'px';
        ac.style.top = 'auto';
        ac.style.width = Math.min(220, fieldRect.width) + 'px';
        ac.classList.add('show');
      });

      field.addEventListener('keydown', (e) => {
        if (!ac.classList.contains('show')) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          _acIndex = Math.min(_acIndex + 1, _acResults.length - 1);
          updateAcSelection();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          _acIndex = Math.max(_acIndex - 1, -1);
          updateAcSelection();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (_acIndex >= 0) {
            e.preventDefault();
            applyAutocomplete(_acResults[_acIndex]);
          } else if (_acResults.length === 1) {
            e.preventDefault();
            applyAutocomplete(_acResults[0]);
          }
        } else if (e.key === 'Escape') {
          closeAutocomplete();
        }
      });

      field.addEventListener('blur', () => setTimeout(closeAutocomplete, 150));
    }

    function updateAcSelection() {
      document.querySelectorAll('.emoji-ac-item').forEach((el, i) => {
        el.classList.toggle('selected', i === _acIndex);
      });
    }

    function applyAutocomplete(emoji) {
      const field = document.getElementById('ifield');
      const val = field.value;
      const cursor = field.selectionStart;
      const before = val.slice(0, cursor);
      const after = val.slice(cursor);
      // Replace the :partial with :name:
      const newBefore = before.replace(/:([a-z0-9_]*)$/, `:${emoji.name}:`);
      field.value = newBefore + after;
      field.selectionStart = field.selectionEnd = newBefore.length;
      closeAutocomplete();
      field.focus();
    }

    function closeAutocomplete() {
      document.getElementById('emoji-autocomplete')?.classList.remove('show');
      _acIndex = -1;
      _acResults = [];
    }

    // ── Init all emoji features ───────────────────────────────────
    async function initEmojis() {
      await loadCustomEmojis();

      // Fetch emoji admin username from server
      try {
        const res = await fetch('/emojis/admin', { headers: { Authorization: `Bearer ${STATE.token}` } });
        if (res.ok) { const d = await res.json(); STATE.emojiAdmin = d.admin; }
      } catch { }

      // Wire emoji button
      document.getElementById('btn-emoji')?.addEventListener('click', () => {
        toggleEmojiPanel();
      });

      initEmojiSearch();
      initEmojiUpload();
      initEmojiAutocomplete();
    }

    // ════════════════════════════════════════════════════════════
    //  EMOJI REACTIONS
    // ════════════════════════════════════════════════════════════
    const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👍', '👎', '🎉'];

    let _pickerMsgId = null;
    let _pickerEl = null;

    function showReactionPicker(msgId, anchorEl) {
      closeReactionPicker();
      _pickerMsgId = msgId;

      const picker = document.createElement('div');
      picker.className = 'rxn-picker';
      picker.id = 'rxn-picker';
      picker.style.cssText += ';flex-wrap:wrap;max-width:320px;';

      // Standard emojis
      REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'rxn-pick-btn';
        btn.textContent = emoji;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          wsSend('message_react', { message_id: msgId, emoji });
          closeReactionPicker();
        });
        picker.appendChild(btn);
      });

      // Custom emojis
      _customEmojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'rxn-pick-btn';
        btn.title = `:${emoji.name}:`;
        btn.innerHTML = `<img src="${emojiImgUrl(emoji.filename)}" style="width:20px;height:20px;object-fit:contain;" alt=":${emoji.name}:">`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          wsSend('message_react', { message_id: msgId, emoji: `:${emoji.name}:` });
          closeReactionPicker();
        });
        picker.appendChild(btn);
      });

      document.body.appendChild(picker);
      _pickerEl = picker;

      // Position near the anchor element
      const rect = anchorEl.getBoundingClientRect();
      const pickerW = REACTION_EMOJIS.length * 38;
      let left = rect.left;
      let top = rect.top - 54;

      // Keep within viewport
      if (left + pickerW > window.innerWidth - 8) left = window.innerWidth - pickerW - 8;
      if (left < 8) left = 8;
      if (top < 8) top = rect.bottom + 6;

      picker.style.left = left + 'px';
      picker.style.top = top + 'px';
    }

    function closeReactionPicker() {
      if (_pickerEl) { _pickerEl.remove(); _pickerEl = null; }
      _pickerMsgId = null;
    }

    // Close picker on click outside
    document.addEventListener('click', (e) => {
      if (_pickerEl && !_pickerEl.contains(e.target)) closeReactionPicker();
    });

    // Close picker on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeReactionPicker();
    });

    // Attach reaction trigger to a message element
    function attachReactionTrigger(row, msgId) {
      const bubble = row.querySelector('.b');
      if (!bubble) return;

      let pressTimer = null;

      // Long press (mobile) — show context menu
      bubble.addEventListener('pointerdown', (e) => {
        pressTimer = setTimeout(() => {
          showContextMenu(e, msgId, row);
        }, 500);
      });
      bubble.addEventListener('pointerup', () => clearTimeout(pressTimer));
      bubble.addEventListener('pointerleave', () => clearTimeout(pressTimer));

      // Right click (desktop) — show context menu
      bubble.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, msgId, row);
      });
    }

    // ════════════════════════════════════════════════════════════