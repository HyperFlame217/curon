    // ════════════════════════════════════════════════════════════
    //  WEBRTC CALLS — Persistent Room System
    // ════════════════════════════════════════════════════════════

    const STUN = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:openrelay.metered.ca:80' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      iceCandidatePoolSize: 10,
    };

    // Force opus codec for Firefox/Chrome interop
    function preferOpus(sdp) {
      const lines = sdp.split('\r\n');
      const result = [];
      let opusPt = null;
      for (const line of lines) {
        const m = line.match(/a=rtpmap:(\d+) opus/i);
        if (m) { opusPt = m[1]; break; }
      }
      if (!opusPt) return sdp;
      for (const line of lines) {
        if (line.startsWith('m=audio')) {
          const parts = line.split(' ');
          const pts = parts.slice(3).filter(function (p) { return p !== opusPt; });
          result.push(parts.slice(0, 3).concat([opusPt]).concat(pts).join(' '));
          continue;
        }
        result.push(line);
      }
      return result.join('\r\n');
    }

    // ── Local WebRTC peer state ───────────────────────────────────
    const CALL = {
      pc:           null,   // RTCPeerConnection
      localStream:  null,   // MediaStream (mic + optional camera)
      screenStream: null,   // MediaStream (screen share)
      isVideo:      false,
      muted:        false,
      camOff:       false,
      sharing:      false,
      _iceBuffer:   [],
      _iceTimer:    null,
    };

    // ── Persistent room state (mirrors server callRoom) ───────────
    const CALL_ROOM = {
      active:       false,
      participants: [],     // array of user IDs in the room
      isVideo:      false,
      startedAt:    null,   // epoch ms (server-provided) for timer sync
      timerInterval: null,
    };

    // ── Remote audio element ──────────────────────────────────────
    let _remoteAudio = null;

    // ════════════════════════════════════════════════════════════
    //  WS EVENT HANDLERS — Room lifecycle
    // ════════════════════════════════════════════════════════════

    function onCallRoomStarted(msg) {
      CALL_ROOM.active       = true;
      CALL_ROOM.isVideo      = !!msg.isVideo;
      CALL_ROOM.startedAt    = msg.startedAt;
      CALL_ROOM.participants = msg.participants || [];
      CALL.isVideo           = CALL_ROOM.isVideo;

      renderCallBar();
      startCallBarTimer();

      // Initiator auto-joins WebRTC
      if (msg.initiatorId === STATE.user?.id) {
        _acquireMediaAndWait();
      }
    }

    function onCallParticipantUpdate(msg) {
      CALL_ROOM.participants = msg.participants || [];
      renderCallBar();

      // If server removed me from the room and I have an active PC, tear it down
      if (!CALL_ROOM.participants.includes(STATE.user?.id) && CALL.pc) {
        _teardownWebRTC();
      }
    }

    function onCallRoomEnded() {
      _teardownWebRTC();
      CALL_ROOM.active       = false;
      CALL_ROOM.participants = [];
      CALL_ROOM.startedAt    = null;
      clearInterval(CALL_ROOM.timerInterval);
      CALL_ROOM.timerInterval = null;

      document.getElementById('call-bar').classList.remove('show');
      document.getElementById('call-overlay').classList.remove('show', 'fullscreen-mode');
      document.getElementById('call-mini').classList.remove('show');
      showToast('CALL ENDED');
    }

    function onCallRoomModified(msg) {
      CALL_ROOM.isVideo = !!msg.isVideo;
      CALL.isVideo = !!msg.isVideo;
      updateCallOverlay();
    }

    // Server asks THIS client (already in room w/ media) to send offer to joiner
    async function onCallSendOffer(msg) {
      if (!CALL.pc) return;
      try {
        const offerRaw = await CALL.pc.createOffer();
        const offer = { ...offerRaw, sdp: preferOpus(offerRaw.sdp) };
        await CALL.pc.setLocalDescription(offer);
        wsSend(WS_EV.C_CALL_OFFER, { offer, isVideo: CALL.isVideo });
      } catch (e) { console.error('[CALL] onCallSendOffer failed:', e); }
    }

    // ════════════════════════════════════════════════════════════
    //  WS EVENT HANDLERS — WebRTC signaling (unchanged logic)
    // ════════════════════════════════════════════════════════════

    function onCallOffer(msg) {
      if (!CALL.pc) return;
      CALL.pc.setRemoteDescription(new RTCSessionDescription(msg.offer))
        .then(() => CALL.pc.createAnswer())
        .then(answerRaw => {
          const answer = { ...answerRaw, sdp: preferOpus(answerRaw.sdp) };
          return CALL.pc.setLocalDescription(answer).then(() => answer);
        })
        .then(answer => wsSend(WS_EV.C_CALL_ANSWER, { answer }))
        .catch(console.error);
    }

    function onCallAnswer(msg) {
      if (!CALL.pc) return;
      CALL.pc.setRemoteDescription(new RTCSessionDescription(msg.answer)).catch(console.error);
    }

    function onCallIce(msg) {
      if (!CALL.pc) return;
      if (msg.candidates && Array.isArray(msg.candidates)) {
        console.log(`[ICE] Adding batch of ${msg.candidates.length} candidates`);
        msg.candidates.forEach(c => {
          if (c) CALL.pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
        });
      } else if (msg.candidate) {
        CALL.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(console.error);
      }
    }

    // ════════════════════════════════════════════════════════════
    //  ROOM ACTIONS
    // ════════════════════════════════════════════════════════════

    function startCallRoom(isVideo) {
      if (CALL_ROOM.active) {
        // Already in a call — upgrade/downgrade if type differs, else maximize
        if (!!isVideo !== CALL_ROOM.isVideo) {
          toggleCallVideo(!!isVideo);
        } else {
          joinCall();
        }
        return;
      }
      wsSend(WS_EV.C_CALL_ROOM_START, { isVideo: !!isVideo });
    }

    async function joinCall() {
      if (!CALL_ROOM.active) return;
      if (CALL_ROOM.participants.includes(STATE.user?.id)) {
        maximizeCall(); // already in — just show overlay
        return;
      }
      await _acquireMediaAndWait();
      wsSend(WS_EV.C_CALL_JOIN);
    }

    function leaveCall() {
      wsSend(WS_EV.C_CALL_LEAVE);
      _teardownWebRTC();
      // Bar stays; onCallParticipantUpdate re-renders it
    }

    // Global alias for legacy calls in ui.js and ws.js
    window.endCall = function(force = false) {
      console.log('[CALL] endCall triggered, force:', force);
      leaveCall();
      if (force) {
        document.getElementById('call-bar')?.classList.remove('show');
        document.getElementById('call-overlay')?.classList.remove('show', 'fullscreen-mode');
        document.getElementById('call-mini')?.classList.remove('show');
      }
    };

    // ════════════════════════════════════════════════════════════
    //  UPGRADE / DOWNGRADE (voice ↔ video mid-call)
    // ════════════════════════════════════════════════════════════

    async function toggleCallVideo(wantVideo) {
      if (!CALL.pc) return;

      if (wantVideo && !CALL.isVideo) {
        // Upgrade: voice → video
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          const videoTrack = stream.getVideoTracks()[0];
          CALL.localStream.addTrack(videoTrack);
          CALL.pc.addTrack(videoTrack, CALL.localStream);
          CALL.isVideo = true;
          CALL.camOff = false;

          const offer = await CALL.pc.createOffer();
          await CALL.pc.setLocalDescription(offer);
          wsSend(WS_EV.C_CALL_OFFER, { offer, isVideo: true });
          wsSend(WS_EV.C_CALL_ROOM_MODIFY, { isVideo: true });
          updateCallOverlay();
        } catch { showToast('CAMERA ACCESS DENIED'); }

      } else if (!wantVideo && CALL.isVideo) {
        // Downgrade: video → voice
        const videoTrack = CALL.localStream?.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          CALL.localStream.removeTrack(videoTrack);
        }
        const sender = CALL.pc?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) CALL.pc.removeTrack(sender);
        CALL.isVideo = false;
        CALL.camOff = false;

        const offer = await CALL.pc.createOffer();
        await CALL.pc.setLocalDescription(offer);
        wsSend(WS_EV.C_CALL_OFFER, { offer, isVideo: false });
        wsSend(WS_EV.C_CALL_ROOM_MODIFY, { isVideo: false });
        document.getElementById('call-video-remote').srcObject = null;
        updateCallOverlay();
      }
    }

    // ════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════════

    // Get mic/cam and set up PC. Don't send offer yet — wait for S_CALL_SEND_OFFER
    async function _acquireMediaAndWait() {
      if (CALL.pc) return; // already set up
      try {
        CALL.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            latency: 0,
          },
          video: CALL.isVideo ? { facingMode: 'user' } : false,
        });
      } catch {
        showToast('MIC/CAM ACCESS DENIED'); return;
      }
      setupPeerConnection();
      CALL.localStream.getTracks().forEach(t => CALL.pc.addTrack(t, CALL.localStream));
      if (CALL.isVideo && CALL.localStream) {
        document.getElementById('call-video-local').srcObject = CALL.localStream;
      }
      showCallOverlay();
    }

    function _teardownWebRTC() {
      CALL.localStream?.getTracks().forEach(t => t.stop());
      CALL.screenStream?.getTracks().forEach(t => t.stop());
      CALL.pc?.close();
      CALL.pc           = null;
      CALL.localStream  = null;
      CALL.screenStream = null;
      CALL.muted        = false;
      CALL.camOff       = false;
      CALL.sharing      = false;
      if (CALL._iceTimer) clearTimeout(CALL._iceTimer);
      CALL._iceTimer  = null;
      CALL._iceBuffer = [];

      if (_remoteAudio) {
        _remoteAudio.srcObject = null;
        _remoteAudio.remove();
        _remoteAudio = null;
      }
      document.getElementById('tap-unmute')?.remove();

      // Reset control UI
      const ctrlMute = document.getElementById('ctrl-mute');
      const ctrlCam = document.getElementById('ctrl-cam');
      const ctrlScreen = document.getElementById('ctrl-screen');
if (ctrlMute) { ctrlMute.classList.add('active'); ctrlMute.classList.remove('off'); ctrlMute.innerHTML = '<i class="icon-volume-2"></i><div class="call-ctrl-label">MUTE</div>'; }

      if (ctrlCam) { ctrlCam.classList.add('active'); ctrlCam.classList.remove('off'); ctrlCam.innerHTML = '<i class="icon-camera"></i><div class="call-ctrl-label">CAM</div>'; }

      if (ctrlScreen) { ctrlScreen.classList.remove('active'); ctrlScreen.innerHTML = '<i class="icon-monitor"></i><div class="call-ctrl-label">SHARE</div>'; }

      document.getElementById('call-overlay').classList.remove('show', 'fullscreen-mode');
      document.getElementById('call-mini').classList.remove('show');
    }

    // ════════════════════════════════════════════════════════════
    //  WEBRTC PEER CONNECTION SETUP (internals unchanged)
    // ════════════════════════════════════════════════════════════

    function setupPeerConnection() {
      CALL.pc = new RTCPeerConnection(STUN);

      CALL.pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        CALL._iceBuffer.push(e.candidate);
        if (!CALL._iceTimer) {
          CALL._iceTimer = setTimeout(() => {
            if (CALL._iceBuffer.length > 0) {
              wsSend(WS_EV.C_CALL_ICE, { candidates: CALL._iceBuffer });
              CALL._iceBuffer = [];
            }
            CALL._iceTimer = null;
          }, 150);
        }
      };

      CALL.pc.ontrack = (e) => {
        if (!e.streams[0]) return;
        const stream = e.streams[0];
        const remoteVideo = document.getElementById('call-video-remote');
        if (remoteVideo.srcObject !== stream) {
          remoteVideo.srcObject = stream;
          remoteVideo.muted = true;
          remoteVideo.play().catch(() => { });
        }
        ensureRemoteAudio(stream);
      };

      CALL.pc.onconnectionstatechange = () => {
        const state = CALL.pc?.connectionState;
        if (state === 'connected') {
          document.getElementById('call-voice-status').textContent = 'connected';
        } else if (state === 'disconnected' || state === 'failed') {
          leaveCall(); // graceful leave on peer drop
        }
      };
    }

    // ════════════════════════════════════════════════════════════
    //  REMOTE AUDIO
    // ════════════════════════════════════════════════════════════

    function ensureRemoteAudio(stream) {
      if (!_remoteAudio) {
        _remoteAudio = document.createElement('audio');
        _remoteAudio.autoplay = true;
        _remoteAudio.muted = false;
        document.body.appendChild(_remoteAudio);
      }
      _remoteAudio.srcObject = stream;
      const tryPlay = () => {
        _remoteAudio.play().then(() => {
          document.getElementById('tap-unmute')?.remove();
        }).catch(() => showTapToUnmute());
      };
      if (window._audioCtx && window._audioCtx.state === 'suspended') {
        window._audioCtx.resume().then(tryPlay);
      } else {
        tryPlay();
      }
    }

    function showTapToUnmute() {
      if (document.getElementById('tap-unmute')) return;
      const el = document.createElement('div');
      el.id = 'tap-unmute';
      el.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);background:var(--color-dark);color:var(--color-accent);border:2px solid var(--color-accent);font-family:var(--font-header);font-size:var(--font-size-sidebar-label);padding:8px 14px;cursor:pointer;z-index:9999;';
      el.innerHTML = '<i class="icon-send"></i> TAP TO ENABLE AUDIO';
      el.addEventListener('click', () => { _remoteAudio?.play(); el.remove(); });
      document.getElementById('call-overlay')?.appendChild(el);
    }

    // ════════════════════════════════════════════════════════════
    //  CALL OVERLAY (full-screen in-call UI)
    // ════════════════════════════════════════════════════════════

    function updateCallOverlay() {
      const isVideo = CALL.isVideo;
      document.getElementById('call-videos').style.display    = isVideo ? 'flex' : 'none';
      document.getElementById('call-voice-ui').style.display  = isVideo ? 'none' : 'flex';
      document.getElementById('ctrl-cam').style.display       = isVideo ? 'flex' : 'none';
      document.getElementById('ctrl-screen').style.display    = isVideo ? 'flex' : 'none';
      if (isVideo && CALL.localStream) {
        document.getElementById('call-video-local').srcObject = CALL.localStream;
      }
    }

    function showCallOverlay() {
      const overlay = document.getElementById('call-overlay');
      overlay.classList.add('show');

      updateCallOverlay();

      document.getElementById('call-voice-name').textContent   = STATE.otherName?.toUpperCase() || 'CONNECTED';
      document.getElementById('call-voice-status').textContent = 'connecting...';

      const _vcAvatar = getOtherAvatar();
      const _vcEl = document.getElementById('call-voice-emoji');
      if (_vcEl) {
        if (_vcAvatar) { _vcEl.innerHTML = `<img src="${_vcAvatar}" alt="${escAttr(STATE.otherName || 'THEM')} avatar" class="call-avatar-img">`; }
        else { _vcEl.textContent = '👾'; }
      }
    }

    // ════════════════════════════════════════════════════════════
    //  PERSISTENT CALL BAR
    // ════════════════════════════════════════════════════════════

    function renderCallBar() {
      const bar = document.getElementById('call-bar');
      if (!bar) return;

      if (!CALL_ROOM.active) {
        bar.classList.remove('show');
        return;
      }

      bar.classList.add('show');
      const myId      = STATE.user?.id;
      const iAmIn     = CALL_ROOM.participants.includes(myId);
      const otherName = (STATE.otherName || 'HER').toUpperCase();

      const participantsEl = document.getElementById('call-bar-participants');
      if (participantsEl) {
        if (iAmIn && CALL_ROOM.participants.length >= 2) {
          participantsEl.textContent = `YOU + ${otherName}`;
        } else if (iAmIn) {
          participantsEl.textContent = `WAITING FOR ${otherName}...`;
        } else {
          participantsEl.textContent = `${otherName} IS IN CALL`;
        }
      }

      const joinBtn   = document.getElementById('call-bar-join');
      const leaveBtn  = document.getElementById('call-bar-leave');
      const maxBtn    = document.getElementById('call-bar-max');
      const overlayHidden = !document.getElementById('call-overlay').classList.contains('show');
      if (joinBtn)  joinBtn.style.display  = iAmIn ? 'none' : 'inline-flex';
      if (leaveBtn) leaveBtn.style.display = iAmIn ? 'inline-flex' : 'none';
      if (maxBtn)   maxBtn.style.display   = (iAmIn && overlayHidden) ? 'inline-flex' : 'none';
    }

    // ════════════════════════════════════════════════════════════
    //  CALL BAR TIMER (synced to server startedAt)
    // ════════════════════════════════════════════════════════════

    function startCallBarTimer() {
      clearInterval(CALL_ROOM.timerInterval);
      CALL_ROOM.timerInterval = setInterval(() => {
        if (!CALL_ROOM.startedAt) return;
        const elapsed = Math.floor((Date.now() - CALL_ROOM.startedAt) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        const t = `${m}:${s}`;
        const timerEl = document.getElementById('call-bar-timer');
        if (timerEl) timerEl.textContent = t;
        const callTimer = document.getElementById('call-timer');
        if (callTimer) callTimer.textContent = t;
        const miniTimer = document.getElementById('call-mini-timer');
        if (miniTimer) miniTimer.textContent = t;
      }, 1000);
    }

    // ════════════════════════════════════════════════════════════
    //  IN-CALL CONTROLS
    // ════════════════════════════════════════════════════════════

    function toggleMute() {
      CALL.muted = !CALL.muted;
      CALL.localStream?.getAudioTracks().forEach(t => { t.enabled = !CALL.muted; });
      const btn = document.getElementById('ctrl-mute');
      btn.innerHTML = (CALL.muted ? '<i class="icon-volume-x"></i>' : '<i class="icon-volume-2"></i>') + '<div class="call-ctrl-label">MUTE</div>';
      btn.classList.toggle('active', !CALL.muted);
      btn.classList.toggle('off', CALL.muted);
    }

    function toggleCamera() {
      CALL.camOff = !CALL.camOff;
      CALL.localStream?.getVideoTracks().forEach(t => { t.enabled = !CALL.camOff; });
      const btn = document.getElementById('ctrl-cam');
      btn.innerHTML = (CALL.camOff ? '<i class="icon-camera-off"></i>' : '<i class="icon-camera"></i>') + '<div class="call-ctrl-label">CAM</div>';
      btn.classList.toggle('active', !CALL.camOff);
      btn.classList.toggle('off', CALL.camOff);
    }

    async function toggleScreenShare() {
      if (!CALL.sharing) {
        try {
          CALL.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = CALL.screenStream.getVideoTracks()[0];
          const sender = CALL.pc?.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
          const localVid = document.getElementById('call-video-local');
          localVid.srcObject = new MediaStream([screenTrack]);
          screenTrack.onended = () => { if (CALL.sharing) toggleScreenShare(); };
          CALL.sharing = true;
          document.getElementById('ctrl-screen').classList.add('active');
          document.getElementById('ctrl-screen').innerHTML = '<i class="icon-monitor"></i><div class="call-ctrl-label">STOP</div>';
        } catch { showToast('SCREEN SHARE CANCELLED'); }
      } else {
        CALL.screenStream?.getTracks().forEach(t => t.stop());
        CALL.screenStream = null;
        const camTrack = CALL.localStream?.getVideoTracks()[0];
        const sender   = CALL.pc?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          if (camTrack) {
            sender.replaceTrack(camTrack);
          } else {
            const canvas = document.createElement('canvas');
            canvas.width = 1; canvas.height = 1;
            const dummyTrack = canvas.captureStream().getVideoTracks()[0];
            dummyTrack.enabled = false;
            sender.replaceTrack(dummyTrack);
          }
        }
        document.getElementById('call-video-local').srcObject = CALL.localStream;
        CALL.sharing = false;
        document.getElementById('ctrl-screen').classList.remove('active');
        document.getElementById('ctrl-screen').innerHTML = '<i class="icon-monitor"></i><div class="call-ctrl-label">SHARE</div>';
      }
    }

    function minimizeCall() {
      document.getElementById('call-overlay').classList.remove('show');
      document.getElementById('call-mini').classList.add('show');
      renderCallBar();
    }

    function maximizeCall() {
      document.getElementById('call-mini').classList.remove('show');
      document.getElementById('call-overlay').classList.add('show');
      renderCallBar();
    }

    // ════════════════════════════════════════════════════════════
    //  INIT
    // ════════════════════════════════════════════════════════════

    let _callsInitialized = false;
function initCalls() {
  if (_callsInitialized) return;
  _callsInitialized = true;

      // Overlay controls
      document.getElementById('ctrl-mute')?.addEventListener('click', toggleMute);
      document.getElementById('ctrl-cam')?.addEventListener('click', toggleCamera);
      document.getElementById('ctrl-screen')?.addEventListener('click', toggleScreenShare);
      document.getElementById('ctrl-minimize')?.addEventListener('click', minimizeCall);
      document.getElementById('ctrl-hangup')?.addEventListener('click', leaveCall);
      document.getElementById('call-mini')?.addEventListener('click', maximizeCall);

      // Persistent call bar buttons
      document.getElementById('call-bar-join')?.addEventListener('click', joinCall);
      document.getElementById('call-bar-leave')?.addEventListener('click', leaveCall);
      document.getElementById('call-bar-max')?.addEventListener('click', maximizeCall);

      // Sidebar / mobile header / status bar call buttons
      document.querySelectorAll('.sb-btn, .mh-btn, .act-btn').forEach(btn => {
        const isPhone = btn.querySelector('.icon-phone');
        const isVideo = btn.querySelector('.icon-video');
        if (isPhone) {
          btn.addEventListener('click', () => startCallRoom(false));
        } else if (isVideo) {
          btn.addEventListener('click', () => startCallRoom(true));
        }
      });
    }
