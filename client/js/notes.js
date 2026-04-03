    //  NOTES / CORKBOARD
    // ════════════════════════════════════════════════════════════

    const NOTE_COLORS = ['color-0', 'color-1', 'color-2', 'color-3', 'color-4'];
    const NOTES_PER_BOARD = 5;

    let _notesOpen = false;
    let _allNotes = [];  // all notes from server
    let _currentBoard = 0;   // 0 = most recent board

    // ── Seeded random for consistent non-overlapping positions ────
    function seededRand(seed, min, max) {
      const x = Math.sin(seed + 1) * 10000;
      return min + (x - Math.floor(x)) * (max - min);
    }

    // 5 fixed zones on the board — notes go in zones, no overlap
    function getZonePosition(zoneIndex, noteId, boardW, boardH) {
      // Divide board into a 2x3 grid (but only use 5 slots)
      const cols = 2, rows = 3;
      const zoneW = (boardW - 60) / cols;
      const zoneH = (boardH - 60) / rows;
      const col = zoneIndex % cols;
      const row = Math.floor(zoneIndex / cols);
      // Random offset within zone
      const offX = seededRand(noteId * 1.7, 10, zoneW - 200);
      const offY = seededRand(noteId * 2.3, 10, zoneH - 180);
      return {
        left: Math.round(30 + col * zoneW + offX),
        top: Math.round(30 + row * zoneH + offY),
      };
    }

    // ── Render a single sticky note ───────────────────────────────
    function buildNoteEl(note, zoneIndex) {
      const colorCls = NOTE_COLORS[note.id % NOTE_COLORS.length];
      const d = new Date(note.created_at * 1000);
      const dateStr = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      const timeStr = d.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' });
      const rotation = seededRand(note.id * 3.7, -8, 8).toFixed(1);

      const board = document.getElementById('notes-board');
      const boardW = board?.clientWidth || 600;
      const boardH = board?.clientHeight || 500;
      const pos = getZonePosition(zoneIndex, note.id, boardW, boardH);

      const el = document.createElement('div');
      el.className = `sticky-note ${colorCls}`;
      el.dataset.noteId = note.id;
      el.style.left = pos.left + 'px';
      el.style.top = pos.top + 'px';
      el.style.transform = `rotate(${rotation}deg)`;

      // Pushpin with confirm
      const pin = document.createElement('div');
      pin.className = 'sticky-pin';
      pin.title = 'Unpin note';
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        // Show confirm popup
        const existing = el.querySelector('.pin-confirm');
        if (existing) { existing.remove(); return; }
        const confirm = document.createElement('div');
        confirm.className = 'pin-confirm';
        confirm.innerHTML = `
      <span class="pin-confirm-text">UNPIN?</span>
      <span class="pin-confirm-yes" id="confirm-yes-${note.id}">YES</span>
      <span class="pin-confirm-no"  id="confirm-no-${note.id}">NO</span>
    `;
        el.appendChild(confirm);
        document.getElementById(`confirm-yes-${note.id}`)?.addEventListener('click', () => deleteNote(note.id));
        document.getElementById(`confirm-no-${note.id}`)?.addEventListener('click', () => confirm.remove());
      });
      el.appendChild(pin);

      const text = document.createElement('div');
      text.textContent = note.content;
      el.appendChild(text);

      const meta = document.createElement('div');
      meta.className = 'sticky-meta';
      meta.innerHTML = `${escHtml(note.author_name.toUpperCase())}<br>${dateStr} ${timeStr}`;
      el.appendChild(meta);

      return el;
    }

    // ── Render current board ──────────────────────────────────────
    // Board 1 = most recent notes, board 2 = older, etc.
    function renderBoard() {
      const board = document.getElementById('notes-board');
      const totalBoards = Math.max(1, Math.ceil(_allNotes.length / NOTES_PER_BOARD));

      // Clamp
      if (_currentBoard >= totalBoards) _currentBoard = totalBoards - 1;
      if (_currentBoard < 0) _currentBoard = 0;

      // _currentBoard 0 = newest = last chunk of _allNotes
      const reverseIdx = totalBoards - 1 - _currentBoard;
      const startIdx = reverseIdx * NOTES_PER_BOARD;
      const boardNotes = _allNotes.slice(startIdx, startIdx + NOTES_PER_BOARD);

      board.innerHTML = '';

      if (!boardNotes.length) {
        board.innerHTML = '<div style="width:100%;text-align:center;padding:40px;font-family:&quot;Press Start 2P&quot;,monospace;font-size:7px;color:rgba(255,255,255,0.5);line-height:2.5;">NO NOTES YET<br>PIN SOMETHING!</div>';
      } else {
        boardNotes.forEach((note, i) => board.appendChild(buildNoteEl(note, i)));
      }

      // Update nav — PREV goes to older (higher number), NEXT goes to newer (lower number)
      const label = document.getElementById('board-label');
      const prevBtn = document.getElementById('board-prev');
      const nextBtn = document.getElementById('board-next');
      if (label) label.textContent = `BOARD ${_currentBoard + 1} / ${totalBoards}`;
      if (prevBtn) prevBtn.disabled = _currentBoard >= totalBoards - 1; // no older boards
      if (nextBtn) nextBtn.disabled = _currentBoard === 0;              // already on newest
    }

    // ── Load all notes ────────────────────────────────────────────
    async function loadNotes() {
      const res = await fetch('/notes', {
        headers: { Authorization: `Bearer ${STATE.token}` },
      }).catch(() => null);
      if (!res || !res.ok) return;

      _allNotes = await res.json();
      _currentBoard = 0;
      if (_notesOpen) renderBoard();
    }

    // ── Add note ──────────────────────────────────────────────────
    async function submitNote() {
      const textarea = document.getElementById('notes-textarea');
      const text = textarea.value.trim();
      if (!text) return;

      const res = await fetch('/notes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STATE.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) { showToast('FAILED TO PIN NOTE'); return; }

      textarea.value = '';
      document.getElementById('notes-chars').textContent = '200';
      closeNoteModal();
    }

    // ── Delete note ───────────────────────────────────────────────
    async function deleteNote(id) {
      const res = await fetch(`/notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${STATE.token}` },
      });
      if (!res.ok) showToast('FAILED TO REMOVE NOTE');
    }

    // ── WS handlers ───────────────────────────────────────────────
    function onNoteAdd(msg) {
      _allNotes.push(msg.note);
      // Jump to newest board
      const total = Math.ceil(_allNotes.length / NOTES_PER_BOARD);
      _currentBoard = total - 1;
      if (_notesOpen) renderBoard();

      if (!_notesOpen) {
        document.getElementById('pinned-badge')?.classList.add('show');
        document.getElementById('pinned-badge-mob')?.classList.add('show');
      }
    }

    function onNoteDelete(msg) {
      _allNotes = _allNotes.filter(n => n.id !== msg.id);
      if (_notesOpen) renderBoard();
    }

    // ── Open / close ──────────────────────────────────────────────
    function openNotes() {
      _closeAllViews();
      _notesOpen = true;
      document.getElementById('notes-view').classList.add('show');
      document.getElementById('notes-add-btn').classList.remove('show'); // keep hidden until board ready
      document.getElementById('notes-add-btn').style.display = '';       // clear force-hide
      document.getElementById('notes-add-btn').classList.add('show');
      document.getElementById('board-nav').style.display = 'flex';
      document.getElementById('pinned-badge')?.classList.remove('show');
      document.getElementById('pinned-badge-mob')?.classList.remove('show');
      loadNotes();
    }

    function closeNotes() {
      _notesOpen = false;
      document.getElementById('notes-view').classList.remove('show');
      document.getElementById('notes-add-btn').classList.remove('show');
      document.getElementById('notes-add-btn').style.display = 'none';
      document.getElementById('board-nav').style.display = 'none';
    }

    function openNoteModal() {
      document.getElementById('notes-modal').classList.add('show');
      document.getElementById('notes-textarea').focus();
    }

    function closeNoteModal() {
      document.getElementById('notes-modal').classList.remove('show');
    }

    // ── Init ──────────────────────────────────────────────────────
    function initNotes() {
      document.getElementById('notes-add-btn').addEventListener('click', openNoteModal);
      document.getElementById('notes-modal-submit').addEventListener('click', submitNote);
      document.getElementById('notes-modal-cancel').addEventListener('click', closeNoteModal);

      document.getElementById('board-prev')?.addEventListener('click', () => {
        // OLDER = higher board index
        const total = Math.max(1, Math.ceil(_allNotes.length / NOTES_PER_BOARD));
        if (_currentBoard < total - 1) { _currentBoard++; renderBoard(); }
      });
      document.getElementById('board-next')?.addEventListener('click', () => {
        // NEWER = lower board index
        if (_currentBoard > 0) { _currentBoard--; renderBoard(); }
      });

      document.getElementById('notes-textarea').addEventListener('input', (e) => {
        document.getElementById('notes-chars').textContent = 200 - e.target.value.length;
      });

      document.getElementById('notes-textarea').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) submitNote();
        if (e.key === 'Escape') closeNoteModal();
      });

      document.getElementById('notes-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('notes-modal')) closeNoteModal();
      });
    }

    // ════════════════════════════════════════════════════════════
    //  VIEW MANAGER — single source of truth for showing/hiding views
    // ════════════════════════════════════════════════════════════

    function _closeAllViews() {
      if (_searchActive) closeSearch();
      const cw = document.querySelector('.chat-win');
      const iw = document.querySelector('.input-win');
      if (cw) cw.style.display = 'none';
      if (iw) iw.style.display = 'none';

      document.getElementById('gallery-view').classList.remove('show');
      document.getElementById('notes-view').classList.remove('show');
      document.getElementById('dates-view').classList.remove('show');

      const hv = document.getElementById('house-view');
      if (hv) {
        hv.classList.remove('show');
        hv.classList.add('hide');
      }

      document.getElementById('board-nav').style.display = 'none';
      document.getElementById('notes-add-btn').classList.remove('show');
      document.getElementById('notes-add-btn').style.display = 'none';
      _notesOpen = false;
    }

    function _showChat() {
      const cw = document.querySelector('.chat-win');
      const iw = document.querySelector('.input-win');
      if (cw) cw.style.display = 'flex';
      if (iw) iw.style.display = 'flex';
    }

    function openHouse() {
      _closeAllViews();
      const hv = document.getElementById('house-view');
      if (hv) {
        hv.classList.remove('hide');
        hv.classList.add('show');
      }
    }

    function closeHouse() {
      console.log("[House] Exiting view...");
      // RESET NAVIGATION CLASSES: highlight 'CHAT'
      document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
      document.querySelectorAll('.mn-item').forEach(m => m.classList.remove('on'));

      const chatDesk = document.querySelectorAll('.ni')[0];
      const chatMob = document.querySelectorAll('.mn-item')[0];
      if (chatDesk) chatDesk.classList.add('on');
      if (chatMob) chatMob.classList.add('on');

      // 2. Clear house view and restore chat
      _closeAllViews();
      _showChat();
    }

    // ════════════════════════════════════════════════════════════