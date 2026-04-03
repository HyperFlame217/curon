    // ════════════════════════════════════════════════════════════
    //  SPOTIFY
    // ════════════════════════════════════════════════════════════

    let _spotifyConnected = false;

    function connectSpotify() {
      // Open OAuth in a small popup
      const w = window.open(
        `/spotify/connect?token=${encodeURIComponent(STATE.token)}`,
        'spotify-auth',
        'width=500,height=700,scrollbars=yes'
      );
      // Poll for popup close then refresh status
      const timer = setInterval(() => {
        if (w.closed) {
          clearInterval(timer);
          loadSpotifyStatus();
        }
      }, 500);
    }

    async function disconnectSpotify() {
      await fetch('/spotify/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STATE.token}` },
      });
      loadSpotifyStatus();
    }

    async function loadSpotifyStatus() {
      try {
        const res = await fetch('/spotify/status', {
          headers: { Authorization: `Bearer ${STATE.token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        updateSpotifyUI(data);
      } catch { }
    }

    function updateSpotifyUI(data) {
      const myId = STATE.user?.id;
      const otherId = STATE.otherId;

      updateSpotifySlot('me', data[myId], STATE.user?.username);
      updateSpotifySlot('them', data[otherId], STATE.otherName);

      // Hide connect button if I'm connected
      const connectRow = document.getElementById('spot-connect-row');
      if (connectRow) {
        connectRow.style.display = data[myId] !== undefined ? 'none' : '';
      }
    }

    function updateSpotifySlot(slot, np, username) {
      const song = document.getElementById(`spot-song-${slot}`);
      const artist = document.getElementById(`spot-artist-${slot}`);
      const art = document.getElementById(`spot-art-${slot}`);
      const bars = document.getElementById(`spot-bars-${slot}`);
      const progress = document.getElementById(`spot-progress-${slot}`);
      const bar = document.getElementById(`spot-bar-${slot}`);
      const label = document.getElementById(`spot-label-${slot}`);

      if (label && username) label.textContent = username.toUpperCase();

      if (!np) {
        // Not connected or nothing playing
        if (song) song.textContent = np === null ? 'NOTHING PLAYING' : 'NOT CONNECTED';
        if (artist) artist.textContent = '';
        if (bars) bars.style.display = 'none';
        if (progress) progress.style.display = 'none';
        if (art) {
          art.innerHTML = '🎵';
          art.style.backgroundImage = '';
        }
        return;
      }

      if (song) song.textContent = np.song || '';
      if (artist) artist.textContent = np.artist || '';

      // Album art
      if (art) {
        if (np.albumArt) {
          art.innerHTML = '';
          art.style.cssText += `;background-image:url('${np.albumArt}');background-size:cover;background-position:center;`;
        } else {
          art.innerHTML = '🎵';
          art.style.backgroundImage = '';
        }
      }

      // Bars animation — show only if playing
      if (bars) bars.style.display = np.playing ? 'flex' : 'none';

      // Progress bar
      if (progress && bar && np.duration) {
        progress.style.display = 'block';
        const pct = (np.progress / np.duration * 100).toFixed(1);
        bar.style.width = pct + '%';
      }
    }

    // Handle WS spotify update
    function onSpotifyUpdate(msg) {
      updateSpotifyUI(msg.data || {});
    }

    // Load on boot and add to WS dispatcher
    async function initSpotify() {
      await loadSpotifyStatus();
    }
