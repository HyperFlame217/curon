    // ════════════════════════════════════════════════════════════
    //  WEBRTC CALLS
    // ════════════════════════════════════════════════════════════

    const STUN = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      // Prefer local candidates for LAN calls — reduces latency significantly
      iceCandidatePoolSize: 2,
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

    const CALL = {
      pc: null,   // RTCPeerConnection
      localStream: null,   // MediaStream (mic + optional camera)
      screenStream: null,   // MediaStream (screen share)
      isVideo: false,
      isCaller: false,
      timerInterval: null,
      timerSeconds: 0,
      pendingOffer: null, // stored offer while waiting for user to accept
      muted: false,
      camOff: false,
      sharing: false,
      _iceBuffer: [],
      _iceTimer: null,
    };

    // ── WS event handlers ─────────────────────────────────────────
    function onCallOffer(msg) {
      if (CALL.pc) return; // already in a call
      CALL.pendingOffer = msg;
      const type = msg.isVideo ? '🎥 video call' : '📞 voice call';
      document.getElementById('call-incoming-type').textContent = type;
      document.getElementById('call-incoming-name').textContent = STATE.otherName?.toUpperCase() || 'INCOMING CALL';
      document.getElementById('call-incoming').classList.add('show');
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

    function onCallEnded() {
      showToast('CALL ENDED');
      endCall(false);
    }

    // ── Start a call ──────────────────────────────────────────────
    async function startCall(isVideo) {
      if (CALL.pc) { showToast('ALREADY IN A CALL'); return; }
      CALL.isVideo = isVideo;
      CALL.isCaller = true;

      try {
        CALL.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            latency: 0,      // request minimum latency
          },
          video: isVideo ? { facingMode: 'user' } : false,
        });
      } catch {
        showToast('MIC/CAM ACCESS DENIED'); return;
      }

      setupPeerConnection();
      CALL.localStream.getTracks().forEach(t => CALL.pc.addTrack(t, CALL.localStream));

      const offerRaw = await CALL.pc.createOffer();
      const offer = { ...offerRaw, sdp: preferOpus(offerRaw.sdp) };
      await CALL.pc.setLocalDescription(offer);

      wsSend('call_offer', { offer, isVideo });
      showCallOverlay(false); // show overlay in "calling" state
    }

    // ── Accept incoming call ──────────────────────────────────────
    async function acceptCall() {
      document.getElementById('call-incoming').classList.remove('show');
      const msg = CALL.pendingOffer;
      CALL.isVideo = msg.isVideo;
      CALL.isCaller = false;

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

      await CALL.pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answerRaw = await CALL.pc.createAnswer();
      const answer = { ...answerRaw, sdp: preferOpus(answerRaw.sdp) };
      await CALL.pc.setLocalDescription(answer);

      wsSend('call_answer', { answer });
      showCallOverlay(true);
    }

    // ── Decline ───────────────────────────────────────────────────
    function declineCall() {
      document.getElementById('call-incoming').classList.remove('show');
      CALL.pendingOffer = null;
      wsSend('call_end');
    }

    // ── RTCPeerConnection setup ───────────────────────────────────
    function setupPeerConnection() {
      CALL.pc = new RTCPeerConnection(STUN);

      CALL.pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        
        // Bundle ICE candidates to reduce signaling overhead
        CALL._iceBuffer.push(e.candidate);
        if (!CALL._iceTimer) {
          CALL._iceTimer = setTimeout(() => {
            if (CALL._iceBuffer.length > 0) {
              wsSend('call_ice_candidate', { candidates: CALL._iceBuffer });
              CALL._iceBuffer = [];
            }
            CALL._iceTimer = null;
          }, 150);
        }
      };

      CALL.pc.ontrack = (e) => {
        if (!e.streams[0]) return;
        const stream = e.streams[0];

        // Set video element for video track
        const remoteVideo = document.getElementById('call-video-remote');
        if (remoteVideo.srcObject !== stream) {
          remoteVideo.srcObject = stream;
          remoteVideo.muted = true; // mute video element to avoid echo — audio handled separately
          remoteVideo.play().catch(() => { });
        }

        // Use dedicated audio element for audio — bypasses autoplay restrictions better
        ensureRemoteAudio(stream);
      };

      CALL.pc.onconnectionstatechange = () => {
        const state = CALL.pc?.connectionState;
        if (state === 'connected') {
          document.getElementById('call-voice-status').textContent = 'connected';
          startCallTimer();
        } else if (state === 'disconnected' || state === 'failed') {
          endCall(false);
        }
      };
    }

    // ── Show call overlay ─────────────────────────────────────────
    // Dedicated audio element for remote audio — more reliable than video element audio
    let _remoteAudio = null;

    function ensureRemoteAudio(stream) {
      if (!_remoteAudio) {
        _remoteAudio = document.createElement('audio');
        _remoteAudio.autoplay = true;
        _remoteAudio.muted = false;
        document.body.appendChild(_remoteAudio);
      }
      _remoteAudio.srcObject = stream;

      // Resume audio context first if suspended, then play
      const tryPlay = () => {
        _remoteAudio.play().then(() => {
          document.getElementById('tap-unmute')?.remove();
        }).catch(() => showTapToUnmute());
      };

      // If there's a suspended AudioContext, resume it first
      if (window._audioCtx && window._audioCtx.state === 'suspended') {
        window._audioCtx.resume().then(tryPlay);
      } else {
        tryPlay();
      }
    }

    function showTapToUnmute() {
      const existing = document.getElementById('tap-unmute');
      if (existing) return;
      const el = document.createElement('div');
      el.id = 'tap-unmute';
      el.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#30253e;color:#c3c88c;border:2px solid #c3c88c;font-family:"Press Start 2P",monospace;font-size:7px;padding:8px 14px;cursor:pointer;z-index:9999;';
      el.textContent = '▶ TAP TO ENABLE AUDIO';
      el.addEventListener('click', () => {
        _remoteAudio?.play();
        el.remove();
      });
      document.getElementById('call-overlay')?.appendChild(el);
    }

    function showCallOverlay(connected) {
      const overlay = document.getElementById('call-overlay');
      overlay.classList.add('show');

      // Show/hide video vs voice UI
      const isVideo = CALL.isVideo;
      document.getElementById('call-videos').style.display = isVideo ? 'flex' : 'none';
      document.getElementById('call-voice-ui').style.display = isVideo ? 'none' : 'flex';

      // Show camera + screen share controls for video calls
      document.getElementById('ctrl-cam').style.display = isVideo ? 'flex' : 'none';
      document.getElementById('ctrl-screen').style.display = isVideo ? 'flex' : 'none';

      // Set local video
      if (isVideo && CALL.localStream) {
        document.getElementById('call-video-local').srcObject = CALL.localStream;
      }

      // Voice name + avatar
      document.getElementById('call-voice-name').textContent = STATE.otherName?.toUpperCase() || 'CONNECTED';
      document.getElementById('call-voice-status').textContent = connected ? 'connected' : 'calling...';
      const _vcAvatar = getOtherAvatar();
      const _vcEl = document.getElementById('call-voice-emoji');
      if (_vcEl) {
        if (_vcAvatar) { _vcEl.innerHTML = `<img src="${_vcAvatar}" style="width:100%;height:100%;object-fit:cover;display:block;">`; }
        else { _vcEl.textContent = '👾'; }
      }

      if (connected) startCallTimer();
    }

    // ── End call ──────────────────────────────────────────────────
    function endCall(notifyOther = true) {
      if (notifyOther) wsSend('call_end');

      // Stop all tracks
      CALL.localStream?.getTracks().forEach(t => t.stop());
      CALL.screenStream?.getTracks().forEach(t => t.stop());
      CALL.pc?.close();

      CALL.pc = null;
      CALL.localStream = null;
      CALL.screenStream = null;
      CALL.muted = false;
      CALL.camOff = false;
      CALL.sharing = false;
      CALL.pendingOffer = null;
      
      if (CALL._iceTimer) clearTimeout(CALL._iceTimer);
      CALL._iceTimer = null;
      CALL._iceBuffer = [];

      // Clean up remote audio element
      if (_remoteAudio) {
        _remoteAudio.srcObject = null;
        _remoteAudio.remove();
        _remoteAudio = null;
      }
      document.getElementById('tap-unmute')?.remove();

      stopCallTimer();

      document.getElementById('call-overlay').classList.remove('show', 'fullscreen-mode');
      document.getElementById('call-mini').classList.remove('show');
      document.getElementById('call-incoming').classList.remove('show');

      // Reset controls
      document.getElementById('ctrl-mute').classList.add('active');
      document.getElementById('ctrl-mute').textContent = '🎤';
      document.getElementById('ctrl-cam').classList.add('active');
      document.getElementById('ctrl-cam').textContent = '📷';
      document.getElementById('ctrl-screen').classList.remove('active');
    }

    // ── Timer ─────────────────────────────────────────────────────
    function startCallTimer() {
      CALL.timerSeconds = 0;
      clearInterval(CALL.timerInterval);
      CALL.timerInterval = setInterval(() => {
        CALL.timerSeconds++;
        const m = String(Math.floor(CALL.timerSeconds / 60)).padStart(2, '0');
        const s = String(CALL.timerSeconds % 60).padStart(2, '0');
        const t = `${m}:${s}`;
        document.getElementById('call-timer').textContent = t;
        document.getElementById('call-mini-timer').textContent = t;
      }, 1000);
    }

    function stopCallTimer() {
      clearInterval(CALL.timerInterval);
      document.getElementById('call-timer').textContent = '00:00';
      document.getElementById('call-mini-timer').textContent = '00:00';
    }

    // ── Controls ──────────────────────────────────────────────────
    function toggleMute() {
      CALL.muted = !CALL.muted;
      CALL.localStream?.getAudioTracks().forEach(t => { t.enabled = !CALL.muted; });
      const btn = document.getElementById('ctrl-mute');
      btn.textContent = CALL.muted ? '🔇' : '🎤';
      btn.classList.toggle('active', !CALL.muted);
      btn.classList.toggle('off', CALL.muted);
      // Re-add label
      btn.innerHTML = (CALL.muted ? '🔇' : '🎤') + '<div class="call-ctrl-label">MUTE</div>';
    }

    function toggleCamera() {
      CALL.camOff = !CALL.camOff;
      CALL.localStream?.getVideoTracks().forEach(t => { t.enabled = !CALL.camOff; });
      const btn = document.getElementById('ctrl-cam');
      btn.innerHTML = (CALL.camOff ? '🚫' : '📷') + '<div class="call-ctrl-label">CAM</div>';
      btn.classList.toggle('active', !CALL.camOff);
      btn.classList.toggle('off', CALL.camOff);
    }

    async function toggleScreenShare() {
      if (!CALL.sharing) {
        try {
          CALL.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = CALL.screenStream.getVideoTracks()[0];

          // Replace camera track with screen track in peer connection
          const sender = CALL.pc?.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);

          // Show screen in local video preview
          const localVid = document.getElementById('call-video-local');
          const screenStream = new MediaStream([screenTrack]);
          localVid.srcObject = screenStream;

          // When user stops sharing via browser UI
          screenTrack.onended = () => { if (CALL.sharing) toggleScreenShare(); };

          CALL.sharing = true;
          document.getElementById('ctrl-screen').classList.add('active');
          document.getElementById('ctrl-screen').innerHTML = '🖥<div class="call-ctrl-label">STOP</div>';
        } catch {
          showToast('SCREEN SHARE CANCELLED');
        }
      } else {
        // Switch back to camera
        CALL.screenStream?.getTracks().forEach(t => t.stop());
        CALL.screenStream = null;

        const camTrack = CALL.localStream?.getVideoTracks()[0];
        const sender = CALL.pc?.getSenders().find(s => s.track?.kind === 'video');
        if (sender && camTrack) sender.replaceTrack(camTrack);

        document.getElementById('call-video-local').srcObject = CALL.localStream;
        CALL.sharing = false;
        document.getElementById('ctrl-screen').classList.remove('active');
        document.getElementById('ctrl-screen').innerHTML = '🖥<div class="call-ctrl-label">SHARE</div>';
      }
    }

    function toggleFullscreen() {
      const overlay = document.getElementById('call-overlay');
      overlay.classList.toggle('fullscreen-mode');
      const btn = document.getElementById('ctrl-fullscreen');
      btn.innerHTML = overlay.classList.contains('fullscreen-mode')
        ? '⛶<div class="call-ctrl-label">EXIT</div>'
        : '⛶<div class="call-ctrl-label">FULL</div>';
    }

    function minimizeCall() {
      document.getElementById('call-overlay').classList.remove('show');
      document.getElementById('call-mini').classList.add('show');
    }

    function maximizeCall() {
      document.getElementById('call-mini').classList.remove('show');
      document.getElementById('call-overlay').classList.add('show');
    }

    // End call if user closes/refreshes the tab
    window.addEventListener('beforeunload', () => {
      if (CALL.pc) endCall(true);
    });

    // ── Init call controls ────────────────────────────────────────
    function initCalls() {
      // Incoming call buttons
      document.getElementById('call-accept').addEventListener('click', acceptCall);
      document.getElementById('call-decline').addEventListener('click', declineCall);

      // Control buttons
      document.getElementById('ctrl-mute').addEventListener('click', toggleMute);
      document.getElementById('ctrl-cam').addEventListener('click', toggleCamera);
      document.getElementById('ctrl-screen').addEventListener('click', toggleScreenShare);
      document.getElementById('ctrl-fullscreen').addEventListener('click', toggleFullscreen);
      document.getElementById('ctrl-minimize').addEventListener('click', minimizeCall);
      document.getElementById('ctrl-hangup').addEventListener('click', () => endCall(true));

      // Call buttons in sidebar and mobile header
      document.querySelectorAll('.sb-btn, .mh-btn, .act-btn').forEach(btn => {
        const text = btn.textContent.trim();
        if (text.includes('📞') || text.includes('CALL')) {
          btn.addEventListener('click', () => startCall(false));
        } else if (text.includes('🎥') || text.includes('VIDEO')) {
          btn.addEventListener('click', () => startCall(true));
        }
      });

      // WS call events handled in handleWsEvent switch
    }
