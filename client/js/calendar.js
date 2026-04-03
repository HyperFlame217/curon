    //  CALENDAR & SCHEDULE
    // ════════════════════════════════════════════════════════════

    const CAL = {
      view: 'month',   // month | week | day
      date: new Date(), // currently viewed date
      selectedDay: new Date(), // day shown in timeline
      events: [],
      schedule: [],
      editingId: null,      // event id being edited
      popupEventId: null,
    };

    const EVENT_COLORS = ['#80b9b1', '#94c784', '#c3c88c', '#638872', '#e8a0a0', '#a0b4e8'];

    // ── Helpers ───────────────────────────────────────────────────
    function fmtDate(d) {
      return d.toLocaleDateString('default', { month: 'long', year: 'numeric' }).toUpperCase();
    }
    function fmtWeekRange(d) {
      const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return mon.toLocaleDateString('default', { month: 'short', day: 'numeric' }).toUpperCase() +
        ' – ' + sun.toLocaleDateString('default', { month: 'short', day: 'numeric' }).toUpperCase();
    }
    function fmtTime(ts) {
      const d = new Date(ts * 1000);
      return d.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' });
    }
    function fmtDayLabel(d) {
      return d.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
    }
    function isToday(d) {
      const t = new Date();
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
    }
    function isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    function minutesToTime(mins) {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return h + ':' + m;
    }
    function getEventsForDay(d) {
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      return CAL.events.filter(e => {
        const es = e.start_time * 1000;
        return es >= start.getTime() && es <= end.getTime();
      });
    }
    function getDayType(d) {
      const day = d.getDay();
      return (day === 0 || day === 6) ? 'weekend' : 'weekday';
    }


    // ── Schedule management panel ─────────────────────────────────
    let _schedDayType = 'weekday';
    let _schedColor = '#94c784';

    function openSchedulePanel() {
      document.getElementById('schedule-panel').classList.add('show');
      renderScheduleList();
    }

    function closeSchedulePanel() {
      document.getElementById('schedule-panel').classList.remove('show');
    }

    function renderScheduleList() {
      const list = document.getElementById('schedule-blocks-list');
      const myId = STATE.user?.id;
      const blocks = CAL.schedule.filter(b => b.user_id === myId && b.day_type === _schedDayType);

      if (!blocks.length) {
        list.innerHTML = '<div style="font-family:&quot;Press Start 2P&quot;,monospace;font-size:6px;color:#638872;padding:16px;text-align:center;">NO BLOCKS YET</div>';
        return;
      }

      list.innerHTML = '';
      blocks.sort((a, b) => a.start_minute - b.start_minute).forEach(b => {
        const item = document.createElement('div');
        item.className = 'schedule-block-item';
        item.innerHTML = `
      <div class="schedule-block-color" style="background:${b.color};"></div>
      <div class="schedule-block-label">${escHtml(b.label)}</div>
      <div class="schedule-block-time">${minutesToTime(b.start_minute)} – ${minutesToTime(b.end_minute)}</div>
      <div class="schedule-block-del" data-id="${b.id}">✕</div>
    `;
        item.querySelector('.schedule-block-del').addEventListener('click', async () => {
          await fetch(`/calendar/schedule/${b.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${STATE.token}` },
          });
        });
        list.appendChild(item);
      });
    }

    async function addScheduleBlock() {
      const label = document.getElementById('sched-label').value.trim();
      const start = document.getElementById('sched-start').value;
      const end = document.getElementById('sched-end').value;

      if (!label || !start || !end) { showToast('FILL ALL FIELDS'); return; }

      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      if (endMin <= startMin) { showToast('END MUST BE AFTER START'); return; }

      const res = await fetch('/calendar/schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STATE.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label, color: _schedColor,
          start_minute: startMin, end_minute: endMin,
          day_type: _schedDayType,
        }),
      });
      if (!res.ok) { showToast('FAILED TO ADD BLOCK'); return; }

      document.getElementById('sched-label').value = '';
      document.getElementById('sched-start').value = '';
      document.getElementById('sched-end').value = '';
    }

    function initSchedulePanel() {
      document.getElementById('btn-manage-schedule')?.addEventListener('click', openSchedulePanel);
      document.getElementById('btn-manage-schedule-mobile')?.addEventListener('click', openSchedulePanel);
      document.getElementById('schedule-panel-close').addEventListener('click', closeSchedulePanel);
      document.getElementById('sched-add-btn').addEventListener('click', addScheduleBlock);

      // Day type tabs
      document.querySelectorAll('.schedule-day-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.schedule-day-tab').forEach(t => t.classList.remove('on'));
          tab.classList.add('on');
          _schedDayType = tab.dataset.dtype;
          renderScheduleList();
        });
      });

      // Color swatches in schedule panel
      document.querySelectorAll('#sched-colors .event-color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          document.querySelectorAll('#sched-colors .event-color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
          _schedColor = sw.dataset.color;
        });
      });

      // Close on overlay click
      document.getElementById('schedule-panel').addEventListener('click', (e) => {
        if (e.target === document.getElementById('schedule-panel')) closeSchedulePanel();
      });
    }
    // ── Load data ─────────────────────────────────────────────────
    async function loadCalendarData() {
      // Load events for a wide range (6 months back, 12 months forward)
      const now = Math.floor(Date.now() / 1000);
      const from = now - 60 * 86400;
      const to = now + 365 * 86400;
      const [evRes, schRes] = await Promise.all([
        fetch(`/calendar/events?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${STATE.token}` } }),
        fetch('/calendar/schedule', { headers: { Authorization: `Bearer ${STATE.token}` } }),
      ]);
      if (evRes.ok) CAL.events = await evRes.json();
      if (schRes.ok) CAL.schedule = await schRes.json();
      renderCalendar();
      renderTimeline();
    }

    // ── Render calendar ───────────────────────────────────────────
    function renderCalendar() {
      const title = document.getElementById('cal-title');
      if (CAL.view === 'month') { title.textContent = fmtDate(CAL.date); renderMonth(); }
      else if (CAL.view === 'week') { title.textContent = fmtWeekRange(CAL.date); renderWeek(); }
      else { title.textContent = fmtDayLabel(CAL.date); renderDay(); }
    }

    // ── Month view ────────────────────────────────────────────────
    function renderMonth() {
      const body = document.getElementById('cal-body');
      const y = CAL.date.getFullYear(), m = CAL.date.getMonth();
      const first = new Date(y, m, 1);
      const startDay = (first.getDay() + 6) % 7; // Monday start
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const today = new Date();

      let html = '<div class="cal-month"><div class="cal-month-grid">';
      ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach(d => {
        html += `<div class="cal-day-header">${d}</div>`;
      });

      // Previous month padding
      const prevDays = new Date(y, m, 0).getDate();
      for (let i = startDay - 1; i >= 0; i--) {
        html += `<div class="cal-day other-month"><div class="cal-day-num">${prevDays - i}</div></div>`;
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(y, m, d);
        const todayCls = isToday(date) ? ' today' : '';
        const selectedCls = isSameDay(date, CAL.selectedDay) ? ' selected' : '';
        const dayEvents = getEventsForDay(date);
        const dots = dayEvents.slice(0, 4).map(e => `<span class="cal-dot" style="background:${e.color};"></span>`).join('');
        html += `<div class="cal-day${todayCls}${selectedCls}" data-date="${date.toISOString()}">
      <div class="cal-day-num">${d}</div>
      <div>${dots}</div>
    </div>`;
      }

      // Next month padding
      const total = startDay + daysInMonth;
      const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
      for (let i = 1; i <= rem; i++) {
        html += `<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;
      }

      html += '</div></div>';
      body.innerHTML = html;

      // Click handlers
      body.querySelectorAll('.cal-day:not(.other-month)').forEach(el => {
        el.addEventListener('click', () => {
          CAL.selectedDay = new Date(el.dataset.date);
          renderTimeline();
          // Update selected styling
          body.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
          el.classList.add('selected');
        });
      });
    }

    // ── Week view ─────────────────────────────────────────────────
    function renderWeek() {
      const body = document.getElementById('cal-body');
      const mon = new Date(CAL.date);
      mon.setDate(CAL.date.getDate() - ((CAL.date.getDay() + 6) % 7));

      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
      });

      let html = '<div class="cal-week"><div class="cal-week-header"><div style="border-right:2px solid #30253e;"></div>';
      const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      days.forEach((d, i) => {
        const todayCls = isToday(d) ? ' today' : '';
        html += `<div class="cal-week-day-hd${todayCls}" data-date="${d.toISOString()}">${dayNames[i]}<br>${d.getDate()}</div>`;
      });
      html += '</div><div class="cal-week-body"><div class="cal-time-col">';

      for (let h = 0; h < 24; h++) {
        html += `<div class="cal-time-label">${h.toString().padStart(2, '0')}:00</div>`;
      }
      html += '</div>';

      days.forEach(d => {
        const todayCls = isToday(d) ? ' today-col' : '';
        const dayEvents = getEventsForDay(d);
        html += `<div class="cal-week-col${todayCls}">`;
        for (let h = 0; h < 24; h++) html += '<div class="cal-hour-line"></div>';
        dayEvents.forEach(e => {
          const startD = new Date(e.start_time * 1000);
          const endD = new Date(e.end_time * 1000);
          const topPct = ((startD.getHours() * 60 + startD.getMinutes()) / 1440) * 100;
          const heightPct = ((endD - startD) / 1000 / 60 / 1440) * 100;
          html += `<div class="timeline-block" data-id="${e.id}" style="position:absolute;top:${topPct}%;height:${Math.max(heightPct, 2)}%;left:2px;right:2px;background:${e.color};">${escHtml(e.title)}</div>`;
        });
        html += '</div>';
      });

      html += '</div></div>';
      body.innerHTML = html;

      // Click day header → select that day
      body.querySelectorAll('.cal-week-day-hd').forEach(el => {
        el.addEventListener('click', () => {
          CAL.selectedDay = new Date(el.dataset.date);
          renderTimeline();
        });
      });

      // Click events
      body.querySelectorAll('.timeline-block[data-id]').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); showEventPopup(parseInt(el.dataset.id), e); });
      });
    }

    // ── Day view ──────────────────────────────────────────────────
    function renderDay() {
      CAL.selectedDay = new Date(CAL.date);
      renderTimeline();
      // Show a simple message in cal body
      const body = document.getElementById('cal-body');
      body.innerHTML = '<div style="padding:20px;font-family:&quot;Press Start 2P&quot;,monospace;font-size:7px;color:#638872;text-align:center;">SEE TIMELINE BELOW</div>';
    }

    // ── Timeline ──────────────────────────────────────────────────
    function renderTimeline() {
      const scroll = document.getElementById('timeline-scroll');
      const label = document.getElementById('timeline-date-label');
      const d = CAL.selectedDay;
      const dayType = getDayType(d);

      label.textContent = fmtDayLabel(d);

      const myId = STATE.user?.id;
      const otherId = STATE.otherId;
      const myName = (STATE.user?.username || 'YOU').toUpperCase();
      const otherName = (STATE.otherName || 'THEM').toUpperCase();

      const mySchedule = CAL.schedule.filter(b => b.user_id === myId && b.day_type === dayType);
      const otherSchedule = CAL.schedule.filter(b => b.user_id === otherId && b.day_type === dayType);
      const dayEvents = getEventsForDay(d);

      // Hours header — rendered separately so it stays visible above scrollable tracks
      const hoursInner = document.getElementById('timeline-hours-inner');
      let hoursHtml = '';
      for (let h = 0; h < 24; h++) {
        hoursHtml += `<div class="timeline-hour-label">${h.toString().padStart(2, '0')}:00</div>`;
      }
      if (hoursInner) hoursInner.innerHTML = hoursHtml;

      // Sync horizontal scroll between header and tracks (only add once)
      const headerScroll = document.getElementById('timeline-header-scroll');
      if (!scroll._scrollSynced) {
        scroll.addEventListener('scroll', () => { if (headerScroll) headerScroll.scrollLeft = scroll.scrollLeft; });
        scroll._scrollSynced = true;
      }

      const PX_PER_MIN = 2; // 2px per minute = 120px per hour

      // Active display timezone (what the timeline's hour labels represent)
      const activeTz = _tzViewMode === 'my' ? getMyTz() : getOtherTz();

      // Get UTC offset in minutes for a given IANA timezone
      function getTzOffsetMin(tz) {
        try {
          // Compare what local midnight looks like in two timezones to get offset
          const ref = new Date(2000, 0, 1, 0, 0, 0); // fixed reference point
          const inTz = new Date(ref.toLocaleString('en-US', { timeZone: tz }));
          const inLocal = new Date(ref.toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
          return Math.round((inTz - inLocal) / 60000);
        } catch { return 0; }
      }

      // Offset of each user's TZ relative to the active display TZ.
      // Schedule blocks are stored in the owner's local TZ minutes.
      // To convert owner-local minutes → active-display minutes:
      //   displayMin = ownerMin - (ownerUTCOffset - activeUTCOffset)
      //              = ownerMin - ownerUTCOffset + activeUTCOffset
      // Example: Tokyo 02:00 (UTC+9), viewing in IST (UTC+5:30)
      //   displayMin = 120 - 540 + 330 = -90  →  23:30 previous day
      const myTzOffset = getTzOffsetMin(activeTz) - getTzOffsetMin(getMyTz());
      const otherTzOffset = getTzOffsetMin(activeTz) - getTzOffsetMin(getOtherTz());

      // Current time in the active timezone (for now-line + auto-scroll)
      let nowMinTz = 0;
      try {
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: activeTz }));
        nowMinTz = nowInTz.getHours() * 60 + nowInTz.getMinutes();
      } catch {
        nowMinTz = new Date().getHours() * 60 + new Date().getMinutes();
      }

      function buildTrack(blocks, label, isSchedule, ownerTzOffset) {
        const opacity = isSchedule ? '0.75' : '1';
        let html = `<div class="timeline-track">`;
        // Hour ticks
        for (let h = 0; h < 24; h++) {
          html += `<div class="timeline-hour-tick${h % 6 === 0 ? ' major' : ''}" style="left:${h * 60 * PX_PER_MIN}px;"></div>`;
        }
        blocks.forEach(b => {
          let startMin, endMin, title, id, color;
          if (isSchedule) {
            // Apply TZ offset: shift block position on the display axis
            startMin = b.start_minute + (ownerTzOffset || 0);
            endMin = b.end_minute + (ownerTzOffset || 0);
            title = b.label; id = b.id; color = b.color;
          } else {
            // Events are stored as UTC timestamps — convert to active display TZ
            const toActiveTz = ts => new Date(new Date(ts * 1000).toLocaleString('en-US', { timeZone: activeTz }));
            const sd = toActiveTz(b.start_time), ed = toActiveTz(b.end_time);
            startMin = sd.getHours() * 60 + sd.getMinutes();
            endMin = ed.getHours() * 60 + ed.getMinutes();
            title = b.title; id = b.id; color = b.color;
          }
          // Handle day-boundary overflow:
          // - Block spills in from previous day: startMin < 0, endMin > 0  → show 0..endMin
          // - Block spills out to next day:      startMin < 1440, endMin > 1440 → show startMin..1440
          // - Completely outside today: skip (nothing to show)
          const DAY = 1440;
          if (endMin <= 0 || startMin >= DAY) {
            // Completely off this day — skip
          } else {
            const clampedStart = Math.max(0, startMin);
            const clampedEnd = Math.min(DAY, endMin);
            const w = Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 8);
            // Dashed left edge = continues from previous day; dashed right = continues into next day
            const leftBorder = startMin < 0 ? 'border-left:3px dashed rgba(0,0,0,0.5);' : '';
            const rightBorder = endMin > DAY ? 'border-right:3px dashed rgba(0,0,0,0.5);' : '';
            html += `<div class="timeline-block" data-type="${isSchedule ? 'schedule' : 'event'}" data-id="${id}" style="left:${clampedStart * PX_PER_MIN}px;width:${w}px;background:${color};opacity:${opacity};${leftBorder}${rightBorder}">${escHtml(title)}</div>`;
          }
        });
        if (isToday(d)) {
          html += `<div class="timeline-now-line" style="left:${nowMinTz * PX_PER_MIN}px;"></div>`;
        }
        html += '</div>';
        return html;
      }

      // 4 rows: my schedule, my events, their schedule, their events
      scroll.innerHTML =
        `<div class="timeline-row"><div class="timeline-user-label">${myName}<br><span style="color:#80b9b1;font-size:4px;">ROUTINE</span></div>${buildTrack(mySchedule, myName, true, myTzOffset)}</div>` +
        `<div class="timeline-row"><div class="timeline-user-label">${myName}<br><span style="color:#80b9b1;font-size:4px;">EVENTS</span></div>${buildTrack(dayEvents, myName, false, myTzOffset)}</div>` +
        `<div class="timeline-row"><div class="timeline-user-label">${otherName}<br><span style="color:#80b9b1;font-size:4px;">ROUTINE</span></div>${buildTrack(otherSchedule, otherName, true, otherTzOffset)}</div>` +
        `<div class="timeline-row"><div class="timeline-user-label">${otherName}<br><span style="color:#80b9b1;font-size:4px;">EVENTS</span></div>${buildTrack(dayEvents, otherName, false, otherTzOffset)}</div>`;

      // Scroll to current time if today
      if (isToday(d)) {
        setTimeout(() => {
          const trackEl = scroll.querySelector('.timeline-track');
          if (trackEl) scroll.scrollLeft = Math.max(0, nowMinTz * 2 - 200);
        }, 50);
      }

      // Block click handlers
      scroll.querySelectorAll('.timeline-block[data-type="event"]').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); showEventPopup(parseInt(el.dataset.id), e); });
      });

      // Click empty timeline to add event
      scroll.querySelectorAll('.timeline-track').forEach(track => {
        track.addEventListener('click', (e) => {
          if (e.target !== track) return;
          const rect = track.getBoundingClientRect();
          const minute = Math.floor(e.clientX - rect.left);
          const h = Math.floor(minute / 60), m = minute % 60;
          const startDt = new Date(d);
          startDt.setHours(h, m, 0, 0);
          const endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
          openEventModal(null, startDt, endDt);
        });
      });
    }

    // ── Event popup ───────────────────────────────────────────────
    function showEventPopup(id, e) {
      const event = CAL.events.find(ev => ev.id === id);
      if (!event) return;
      CAL.popupEventId = id;

      document.getElementById('event-popup-title').textContent = event.title;
      document.getElementById('event-popup-time').textContent =
        fmtTime(event.start_time) + ' – ' + fmtTime(event.end_time);
      document.getElementById('event-popup-notes').textContent = event.notes || '';

      const popup = document.getElementById('event-popup');
      popup.classList.add('show');

      let x = e.clientX + 10, y = e.clientY + 10;
      if (x + 270 > window.innerWidth) x = window.innerWidth - 270;
      if (y + 150 > window.innerHeight) y = window.innerHeight - 150;
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    }

    function closeEventPopup() {
      document.getElementById('event-popup').classList.remove('show');
      CAL.popupEventId = null;
    }

    // ── Add/Edit event modal ──────────────────────────────────────
    function openEventModal(id, startDt, endDt) {
      CAL.editingId = id;
      const modal = document.getElementById('event-modal');
      modal.classList.add('show');

      document.getElementById('event-modal-title').textContent = id ? 'EDIT EVENT' : 'ADD EVENT';

      const pad2 = n => n.toString().padStart(2, '0');
      const fmtD = d => `${pad2(d.getDate())} / ${pad2(d.getMonth() + 1)} / ${d.getFullYear()}`;
      const fmtT = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

      if (id) {
        const ev = CAL.events.find(e => e.id === id);
        if (ev) {
          document.getElementById('event-input-title').value = ev.title;
          document.getElementById('event-input-notes').value = ev.notes || '';
          document.getElementById('event-input-recurrence').value = ev.recurrence;
          const sd = new Date(ev.start_time * 1000);
          const ed = new Date(ev.end_time * 1000);
          document.getElementById('event-input-date').value = fmtD(sd);
          document.getElementById('event-input-start').value = fmtT(sd);
          document.getElementById('event-input-end').value = fmtT(ed);
          selectEventColor(ev.color);
          _miniCalDate = new Date(sd);
        }
      } else {
        document.getElementById('event-input-title').value = '';
        document.getElementById('event-input-notes').value = '';
        document.getElementById('event-input-recurrence').value = 'none';
        const d = startDt || CAL.selectedDay || new Date();
        document.getElementById('event-input-date').value = fmtD(d);
        document.getElementById('event-input-start').value = startDt ? fmtT(startDt) : '';
        document.getElementById('event-input-end').value = endDt ? fmtT(endDt) : '';
        selectEventColor(EVENT_COLORS[0]);
        _miniCalDate = new Date(d);
      }
      document.getElementById('event-mini-cal').style.display = 'none';

      document.getElementById('event-input-title').focus();
    }

    function toLocalDatetimeInput(d) {
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function selectEventColor(color) {
      document.querySelectorAll('.event-color-swatch').forEach(sw => {
        sw.classList.toggle('selected', sw.dataset.color === color);
      });
    }

    function getSelectedColor() {
      return document.querySelector('.event-color-swatch.selected')?.dataset.color || EVENT_COLORS[0];
    }

    function closeEventModal() {
      document.getElementById('event-modal').classList.remove('show');
      CAL.editingId = null;
    }

    async function saveEvent() {
      const title = document.getElementById('event-input-title').value.trim();
      const notes = document.getElementById('event-input-notes').value.trim();
      const dateVal = document.getElementById('event-input-date').value.replace(/\s/g, '');
      const startVal = document.getElementById('event-input-start').value.trim();
      const endVal = document.getElementById('event-input-end').value.trim();
      const recurrence = document.getElementById('event-input-recurrence').value;
      const color = getSelectedColor();

      if (!title || !dateVal || !startVal || !endVal) { showToast('FILL IN ALL FIELDS'); return; }

      // Parse DD/MM/YYYY
      const dp = dateVal.split('/');
      if (dp.length !== 3) { showToast('INVALID DATE'); return; }
      const [dd, mm, yyyy] = dp.map(Number);
      const [sh, sm] = startVal.split(':').map(Number);
      const [eh, em] = endVal.split(':').map(Number);
      if ([dd, mm, yyyy, sh, sm, eh, em].some(isNaN)) { showToast('INVALID DATE/TIME'); return; }

      const start_time = Math.floor(new Date(yyyy, mm - 1, dd, sh, sm).getTime() / 1000);
      const end_time = Math.floor(new Date(yyyy, mm - 1, dd, eh, em).getTime() / 1000);
      if (end_time <= start_time) { showToast('END MUST BE AFTER START'); return; }

      const body = { title, notes, color, start_time, end_time, recurrence };

      const url = CAL.editingId ? `/calendar/events/${CAL.editingId}` : '/calendar/events';
      const method = CAL.editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${STATE.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { showToast('FAILED TO SAVE EVENT'); return; }
      closeEventModal();
    }

    async function deleteEvent(id) {
      const res = await fetch(`/calendar/events/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${STATE.token}` },
      });
      if (!res.ok) { showToast('FAILED TO DELETE'); return; }
      closeEventPopup();
    }

    // ── WS handlers ───────────────────────────────────────────────
    function onCalendarEventAdd(msg) {
      CAL.events.push(msg.event);
      if (document.getElementById('dates-view').classList.contains('show')) {
        renderCalendar(); renderTimeline();
      }
    }
    function onCalendarEventUpdate(msg) {
      const idx = CAL.events.findIndex(e => e.id === msg.event.id);
      if (idx >= 0) CAL.events[idx] = msg.event;
      else CAL.events.push(msg.event);
      if (document.getElementById('dates-view').classList.contains('show')) {
        renderCalendar(); renderTimeline();
      }
    }
    function onCalendarEventDelete(msg) {
      CAL.events = CAL.events.filter(e => e.id !== msg.id);
      if (document.getElementById('dates-view').classList.contains('show')) {
        renderCalendar(); renderTimeline();
      }
    }
    function onScheduleBlockAdd(msg) {
      CAL.schedule.push(msg.block);
      if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      if (document.getElementById('schedule-panel').classList.contains('show')) renderScheduleList();
    }
    function onScheduleBlockUpdate(msg) {
      const idx = CAL.schedule.findIndex(b => b.id === msg.block.id);
      if (idx >= 0) CAL.schedule[idx] = msg.block; else CAL.schedule.push(msg.block);
      if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
    }
    function onScheduleBlockDelete(msg) {
      CAL.schedule = CAL.schedule.filter(b => b.id !== msg.id);
      if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      if (document.getElementById('schedule-panel').classList.contains('show')) renderScheduleList();
    }

    // ── Open / close dates view ───────────────────────────────────
    function openDates() {
      _closeAllViews();
      document.getElementById('dates-view').classList.add('show');
      renderCalendar();
      renderTimeline();
      loadCalendarData();
    }

    function closeDates() {
      document.getElementById('dates-view').classList.remove('show');
    }

    // ── Init ──────────────────────────────────────────────────────
    function initCalendar() {
      // View tabs
      document.querySelectorAll('.cal-view-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.cal-view-tab').forEach(t => t.classList.remove('on'));
          tab.classList.add('on');
          CAL.view = tab.dataset.view;
          renderCalendar();
        });
      });

      // Prev/next
      document.getElementById('cal-prev').addEventListener('click', () => {
        if (CAL.view === 'month') {
          CAL.date = new Date(CAL.date.getFullYear(), CAL.date.getMonth() - 1, 1);
        } else if (CAL.view === 'week') {
          CAL.date.setDate(CAL.date.getDate() - 7);
        } else {
          CAL.date.setDate(CAL.date.getDate() - 1);
          CAL.selectedDay = new Date(CAL.date);
        }
        renderCalendar();
        if (CAL.view !== 'month') renderTimeline();
      });

      document.getElementById('cal-next').addEventListener('click', () => {
        if (CAL.view === 'month') {
          CAL.date = new Date(CAL.date.getFullYear(), CAL.date.getMonth() + 1, 1);
        } else if (CAL.view === 'week') {
          CAL.date.setDate(CAL.date.getDate() + 7);
        } else {
          CAL.date.setDate(CAL.date.getDate() + 1);
          CAL.selectedDay = new Date(CAL.date);
        }
        renderCalendar();
        if (CAL.view !== 'month') renderTimeline();
      });

      // Event popup
      document.getElementById('event-popup-close').addEventListener('click', closeEventPopup);
      document.getElementById('event-popup-edit').addEventListener('click', () => {
        const id = CAL.popupEventId;
        closeEventPopup();
        openEventModal(id);
      });
      document.getElementById('event-popup-delete').addEventListener('click', () => {
        if (CAL.popupEventId) deleteEvent(CAL.popupEventId);
      });

      // Close popup on outside click
      document.addEventListener('click', (e) => {
        const popup = document.getElementById('event-popup');
        if (popup.classList.contains('show') && !popup.contains(e.target)) closeEventPopup();
      });

      // Event modal
      document.getElementById('event-modal-close').addEventListener('click', closeEventModal);
      document.getElementById('event-modal-cancel').addEventListener('click', closeEventModal);
      document.getElementById('event-modal-save').addEventListener('click', saveEvent);
      document.getElementById('event-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('event-modal')) closeEventModal();
      });


      // ── Mini calendar picker ──────────────────────────────────
      let _miniCalDate = new Date();

      function renderMiniCal() {
        const y = _miniCalDate.getFullYear(), m = _miniCalDate.getMonth();
        const first = new Date(y, m, 1);
        const startDay = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

        document.getElementById('mini-cal-title').textContent = months[m] + ' ' + y;

        const grid = document.getElementById('mini-cal-grid');
        grid.innerHTML = '';

        // Day headers
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(d => {
          const el = document.createElement('div');
          el.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:5px;color:#638872;text-align:center;padding:2px;';
          el.textContent = d;
          grid.appendChild(el);
        });

        // Padding
        for (let i = 0; i < startDay; i++) {
          grid.appendChild(document.createElement('div'));
        }

        // Days
        const today = new Date();
        for (let d = 1; d <= daysInMonth; d++) {
          const el = document.createElement('div');
          const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
          el.style.cssText = `font-family:"Press Start 2P",monospace;font-size:5px;text-align:center;padding:3px 1px;cursor:pointer;border:1px solid transparent;${isToday ? 'background:#94c784;' : 'background:#f4f9f8;'}`;
          el.textContent = d;
          el.addEventListener('mouseenter', () => { el.style.background = '#80b9b1'; });
          el.addEventListener('mouseleave', () => { el.style.background = isToday ? '#94c784' : '#f4f9f8'; });
          el.addEventListener('click', () => {
            const pad2 = n => n.toString().padStart(2, '0');
            document.getElementById('event-input-date').value = `${pad2(d)} / ${pad2(m + 1)} / ${y}`;
            document.getElementById('event-mini-cal').style.display = 'none';
          });
          grid.appendChild(el);
        }
      }

      document.getElementById('event-cal-toggle').addEventListener('click', () => {
        const cal = document.getElementById('event-mini-cal');
        if (cal.style.display === 'none') {
          renderMiniCal();
          cal.style.display = 'block';
        } else {
          cal.style.display = 'none';
        }
      });

      document.getElementById('mini-cal-prev').addEventListener('click', () => {
        _miniCalDate = new Date(_miniCalDate.getFullYear(), _miniCalDate.getMonth() - 1, 1);
        renderMiniCal();
      });
      document.getElementById('mini-cal-next').addEventListener('click', () => {
        _miniCalDate = new Date(_miniCalDate.getFullYear(), _miniCalDate.getMonth() + 1, 1);
        renderMiniCal();
      });

      // Auto-format date input DD / MM / YYYY
      document.getElementById('event-input-date').addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 8);
        if (v.length >= 5) v = v.slice(0, 2) + ' / ' + v.slice(2, 4) + ' / ' + v.slice(4);
        else if (v.length >= 3) v = v.slice(0, 2) + ' / ' + v.slice(2);
        e.target.value = v;
      });

      // Auto-format time inputs HH:MM
      ['event-input-start', 'event-input-end'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
          let v = e.target.value.replace(/\D/g, '').slice(0, 4);
          if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
          e.target.value = v;
        });
      });

      // Color swatches
      document.querySelectorAll('.event-color-swatch').forEach(sw => {
        sw.addEventListener('click', () => selectEventColor(sw.dataset.color));
      });

      // Add event via + button (add btn already shown in notes, reuse concept via timeline click)
      // Keyboard shortcut: N for new event when dates view open
      document.addEventListener('keydown', (e) => {
        if (e.key === 'n' && document.getElementById('dates-view').classList.contains('show')
          && document.activeElement.tagName !== 'INPUT'
          && document.activeElement.tagName !== 'TEXTAREA') {
          const now = new Date();
          const end = new Date(now.getTime() + 3600000);
          openEventModal(null, now, end);
        }
      });
    }

    // ════════════════════════════════════════════════════════════