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

    const EVENT_COLORS = [
      'var(--color-cal-1)',
      'var(--color-cal-2)',
      'var(--color-cal-3)',
      'var(--color-cal-4)',
      'var(--color-cal-5)',
      'var(--color-cal-6)'
    ];

    // ── Helpers ───────────────────────────────────────────────────
    function fmtDate(d) {
      return d.toLocaleDateString('default', { month: 'long', year: 'numeric' }).toUpperCase();
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
    function getEventsForDay(startTs, endTs) {
      return CAL.events.filter(e => {
        return (e.start_time < endTs && e.end_time > startTs);
      });
    }
    function getDayType(d, tz = null) {
      // NIGHT_BOUNDARY FIX: Shift time back by 4 hours to treat early morning
      // as part of the previous night's routine type.
      const adjusted = new Date(d.getTime() - (4 * 3600 * 1000));
      const dayStr = adjusted.toLocaleDateString('en-US', { timeZone: tz || undefined, weekday: 'short' });
      return (dayStr === 'Sat' || dayStr === 'Sun') ? 'weekend' : 'weekday';
    }


    // ── Schedule management panel ─────────────────────────────────
    let _schedDayType = 'weekday';
    let _schedColor = 'var(--color-cal-1)';

    function toggleRoutineDock() {
      const dock = document.getElementById('routine-dock');
      if (!dock) return;
      const isOpen = dock.classList.contains('open');
      if (isOpen) {
        dock.classList.remove('open');
      } else {
        dock.classList.add('open');
        renderScheduleList();
        selectEventColor(_schedColor, 'sched-colors');
      }
    }

    function renderScheduleList() {
      const list = document.getElementById('schedule-blocks-list');
      const myId = STATE.user?.id;
      const blocks = CAL.schedule.filter(b => b.user_id === myId && b.day_type === _schedDayType);

      if (!blocks.length) {
        list.innerHTML = `<div class="schedule-empty-state">
          <div class="schedule-empty-state-icon"><span class="ico ico-calendar"></span></div>
          <div class="schedule-empty-state-text">NO BLOCKS YET</div>
        </div>`;
        return;
      }

      list.innerHTML = '';
      blocks.sort((a, b) => a.start_minute - b.start_minute).forEach(b => {
        const item = document.createElement('div');
        item.className = 'schedule-block-item';
        item.innerHTML = `
          <div class="schedule-block-chip" style="background:${b.color};"></div>
          <div class="schedule-block-label">${escHtml(b.label)}</div>
          <div class="schedule-block-time">${minutesToTime(b.start_minute)} – ${minutesToTime(b.end_minute)}</div>
          <div class="schedule-block-del" data-id="${b.id}"><span class="ico ico-close"></span></div>
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
      document.getElementById('btn-manage-schedule')?.addEventListener('click', toggleRoutineDock);
      document.getElementById('btn-manage-schedule-mobile')?.addEventListener('click', toggleRoutineDock);
      document.getElementById('sched-add-btn').addEventListener('click', addScheduleBlock);

      // Day type tabs
      const dayTablist = document.querySelector('.routine-dock-tabs');
      if (dayTablist) {
        dayTablist.setAttribute('role', 'tablist');
        dayTablist.addEventListener('keydown', (e) => {
          const tabs = Array.from(dayTablist.querySelectorAll('[role="tab"]'));
          const idx = tabs.indexOf(document.activeElement);
          if (idx === -1) return;
          let next = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(idx + 1) % tabs.length];
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(idx - 1 + tabs.length) % tabs.length];
          else if (e.key === 'Home') next = tabs[0];
          else if (e.key === 'End') next = tabs[tabs.length - 1];
          if (next) { e.preventDefault(); next.focus(); }
        });
      }
      document.querySelectorAll('.schedule-day-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.schedule-day-tab').forEach(t => {
            t.classList.remove('on');
            t.setAttribute('aria-selected', 'false');
          });
          tab.classList.add('on');
          tab.setAttribute('aria-selected', 'true');
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

      // Color swatches in ADD EVENT modal
      document.querySelectorAll('#event-colors .event-color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          document.querySelectorAll('#event-colors .event-color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
          // _eventColor is handled by getSelectedColor('event-colors') during save
        });
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
      else { title.textContent = fmtDayLabel(CAL.date); renderDay(); }
    }

    // ── Month view ────────────────────────────────────────────────
    function renderMonth() {
      document.getElementById('dates-view').classList.remove('day-mode');
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
        const startTs = Math.floor(new Date(y, m, d, 0, 0, 0).getTime() / 1000);
        const endTs = Math.floor(new Date(y, m, d, 23, 59, 59).getTime() / 1000);
        const dayEvents = getEventsForDay(startTs, endTs);
        const eventBars = dayEvents.slice(0, 4).map(e => `<div class="cal-event-bar" style="background:${e.color};" title="${escHtml(e.title)}"></div>`).join('');
        html += `<div class="cal-day${todayCls}${selectedCls}" data-date="${date.toISOString()}">
      <div class="cal-day-num">${d}</div>
      <div class="cal-day-events">${eventBars}</div>
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
          const clicked = new Date(el.dataset.date);
          CAL.selectedDay = clicked;
          CAL.date = new Date(clicked); // keep in sync so DAY view navigates from here
          renderTimeline();
          // Update selected styling
          body.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
          el.classList.add('selected');
        });
      });
    }



    // ── Day view ──────────────────────────────────────────────────
    function renderDay() {
      document.getElementById('dates-view').classList.add('day-mode');
      CAL.selectedDay = new Date(CAL.date);
      renderTimeline();
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
        let _pendingSync = false;
        scroll.addEventListener('scroll', () => {
          if (!_pendingSync && headerScroll) {
            _pendingSync = true;
            requestAnimationFrame(() => {
              headerScroll.scrollLeft = scroll.scrollLeft;
              _pendingSync = false;
            });
          }
        });
        scroll._scrollSynced = true;
      }

      // Compute PX_PER_MIN so the full 24h track fills the scroll container.
      // Falls back to 2px/min (2880px) when the container has no width yet.
      const TOTAL_MINUTES = 1440;
      const scrollWidth = scroll.clientWidth > 0 ? scroll.clientWidth : 0;
      const MIN_PX_PER_MIN = 2;   // never compress below 2px/min (keeps it readable)
      const PX_PER_MIN = scrollWidth > 0
        ? Math.max(MIN_PX_PER_MIN, (scrollWidth - 80) / TOTAL_MINUTES)
        : MIN_PX_PER_MIN;
      const TRACK_WIDTH = Math.round(TOTAL_MINUTES * PX_PER_MIN);

      // Propagate track width to CSS so header and track stay in sync
      scroll.style.setProperty('--track-w', `${TRACK_WIDTH}px`);
      const hoursScrollEl = document.getElementById('timeline-header-scroll');
      if (hoursScrollEl) hoursScrollEl.style.setProperty('--track-w', `${TRACK_WIDTH}px`);

      // Register a ResizeObserver once to re-render when the container resizes
      // (e.g. switching between MON ↔ DAY expands/collapses the timeline pane)
      if (!scroll._resizeObserver) {
        scroll._resizeObserver = new ResizeObserver(() => {
          // Debounce to avoid thrashing during CSS transitions
          clearTimeout(scroll._resizeTimer);
          scroll._resizeTimer = setTimeout(() => renderTimeline(), 80);
        });
        scroll._resizeObserver.observe(scroll);
      }

      // Get UTC offset in minutes for a given timezone at a specific time
      function getUtcOffsetMin(tz, date) {
        try {
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
          }).formatToParts(date);
          const v = t => parseInt(parts.find(p => p.type === t).value);
          const tzDate = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'));
          return Math.round((tzDate - date.getTime()) / 60000);
        } catch { return 0; }
      }

      const activeTz = _tzViewMode === 'my' ? getMyTz() : getOtherTz();
      
      const dayStartTs = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime() / 1000);
      const dayEndTs = dayStartTs + 86400;
      const dayEvents = getEventsForDay(dayStartTs, dayEndTs);

      // Current time in the active timezone
      let nowMinTz = 0;
      try {
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: activeTz }));
        nowMinTz = nowInTz.getHours() * 60 + nowInTz.getMinutes();
      } catch { nowMinTz = new Date().getHours() * 60 + new Date().getMinutes(); }

      /**
       * Pre-process schedule blocks to handle cross-day shifting.
       * Since blocks are 0..1440, we create virtual "Yesterday" and "Tomorrow" versions
       * and shift them all into the active display timezone.
       */
      /**
       * Pre-process schedule blocks to handle cross-day shifting and continuity.
       * Uses a 4:00 AM 'Night Boundary' logic: any block starting between 00:00 and 04:00
       * is considered part of the previous night's routine.
       */
      function getShiftedSchedule(userId, ownerTz) {
        const ownerOffset = getUtcOffsetMin(ownerTz, d);
        const activeOffset = getUtcOffsetMin(activeTz, d);
        const shift = activeOffset - ownerOffset; // minutes to shift

        const blocks = [];

        // Check Yesterday, Today, Tomorrow
        [-1, 0, 1].forEach(dayOffset => {
          CAL.schedule.filter(b => b.user_id === userId).forEach(b => {
            // Determine the exact moment this block instance starts
            const occDate = new Date(d);
            occDate.setDate(occDate.getDate() + dayOffset);
            occDate.setMinutes(occDate.getMinutes() + b.start_minute);

            // Does this block instance's type match the owner's reality at this moment?
            if (b.day_type !== getDayType(occDate, ownerTz)) return;

            // Shift block relative to its original midnight, then add dayOffset
            const start = b.start_minute + shift + (dayOffset * 1440);
            const end = b.end_minute + shift + (dayOffset * 1440);
            
            // Only keep if it overlaps with today (0..1440)
            if (end > 0 && start < 1440) {
              blocks.push({ ...b, start_minute: start, end_minute: end });
            }
          });
        });
        return blocks;
      }

      function buildTrack(blocks, isSchedule, isFreeTime = false) {
        const opacity = isSchedule ? '0.75' : '1';
        let html = `<div class="timeline-track" data-type="${isSchedule ? 'routine' : 'event'}">`;
        for (let h = 0; h < 24; h++) {
          html += `<div class="timeline-hour-tick${h % 6 === 0 ? ' major' : ''}" style="left:${h * 60 * PX_PER_MIN}px;"></div>`;
        }

        const DAY_MIN = 1440;
        
        let processedBlocks = blocks.map(b => {
          let startMin, endMin;
          if (isSchedule) {
            startMin = b.start_minute;
            endMin = b.end_minute;
          } else {
            startMin = Math.floor((b.start_time - dayStartTs) / 60);
            endMin = Math.floor((b.end_time - dayStartTs) / 60);
          }
          return { ...b, computedStart: startMin, computedEnd: endMin, isConflict: false };
        }).filter(b => b.computedEnd > 0 && b.computedStart < DAY_MIN);

        processedBlocks.sort((a, b) => a.computedStart - b.computedStart);

        let maxEnd = -Infinity;
        let lastBlock = null;
        processedBlocks.forEach(b => {
          if (b.computedStart < maxEnd) {
            b.isConflict = true;
            if (lastBlock) lastBlock.isConflict = true;
          }
          if (b.computedEnd > maxEnd) {
            maxEnd = b.computedEnd;
            lastBlock = b;
          }
        });

        processedBlocks.forEach(b => {
          const clampedStart = Math.max(0, b.computedStart);
          const clampedEnd = Math.min(DAY_MIN, b.computedEnd);
          const w = Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 8);
          const splitStartCls = b.computedStart < 0 ? ' split-start' : '';
          const splitEndCls = b.computedEnd > DAY_MIN ? ' split-end' : '';
          const conflictCls = b.isConflict && !isFreeTime ? ' conflict' : '';
          const freeTimeCls = isFreeTime ? ' free-time' : '';
          
          html += `<div class="timeline-block${splitStartCls}${splitEndCls}${conflictCls}${freeTimeCls}" data-type="${isSchedule ? 'schedule' : 'event'}" data-id="${b.id}" style="left:${clampedStart * PX_PER_MIN}px;width:${w}px;background:${b.color};opacity:${opacity};">${escHtml(isSchedule ? b.label : b.title)}</div>`;
        });
        if (isToday(d)) {
          html += `<div class="timeline-now-line" style="left:${nowMinTz * PX_PER_MIN}px;"></div>`;
        }
        return html + '</div>';
      }

      const myScheduleShifted = getShiftedSchedule(myId, getMyTz());
      const otherScheduleShifted = getShiftedSchedule(otherId, getOtherTz());

      const myEvents = dayEvents.filter(e => e.created_by == myId);
      const otherEvents = dayEvents.filter(e => e.created_by == otherId);

      scroll.innerHTML =
        `<div class="timeline-row"><div class="timeline-user-label">${myName}<div class="timeline-user-sub">ROUTINE</div></div>${buildTrack(myScheduleShifted, true)}</div>` +
        `<div class="timeline-row"><div class="timeline-user-label">${myName}<div class="timeline-user-sub">EVENTS</div></div>${buildTrack(myEvents, false)}</div>` +
        `<div class="timeline-row"><div class="timeline-user-label">${otherName}<div class="timeline-user-sub">ROUTINE</div></div>${buildTrack(otherScheduleShifted, true)}</div>` +
        `<div class="timeline-row"><div class="timeline-user-label">${otherName}<div class="timeline-user-sub">EVENTS</div></div>${buildTrack(otherEvents, false)}</div>`;

      if (window._showFreeTime) {
        scroll.classList.add('freetime-active');
        
        let allBlocks = [];
        const extractBusy = (arr, isSched) => {
          arr.forEach(b => {
            let start, end;
            if (isSched) {
              start = b.start_minute;
              end = b.end_minute;
            } else {
              start = Math.floor((b.start_time - dayStartTs) / 60);
              end = Math.floor((b.end_time - dayStartTs) / 60);
            }
            if (end > 0 && start < 1440) {
              allBlocks.push({ start: Math.max(0, start), end: Math.min(1440, end) });
            }
          });
        };

        extractBusy(myScheduleShifted, true);
        extractBusy(otherScheduleShifted, true);
        extractBusy(dayEvents, false);

        allBlocks.sort((a, b) => a.start - b.start);

        let mergedBusy = [];
        let currentBusy = null;
        allBlocks.forEach(b => {
          if (!currentBusy) {
            currentBusy = { start: b.start, end: b.end };
          } else {
            if (b.start <= currentBusy.end) {
              currentBusy.end = Math.max(currentBusy.end, b.end);
            } else {
              mergedBusy.push(currentBusy);
              currentBusy = { start: b.start, end: b.end };
            }
          }
        });
        if (currentBusy) mergedBusy.push(currentBusy);

        let freeBlocks = [];
        let currentMin = 0;
        mergedBusy.forEach(busy => {
          if (busy.start > currentMin) {
            freeBlocks.push({
              id: 'free-' + currentMin,
              start_minute: currentMin,
              end_minute: busy.start,
              color: 'var(--color-success)',
              label: 'FREE TIME'
            });
          }
          currentMin = Math.max(currentMin, busy.end);
        });
        if (currentMin < 1440) {
          freeBlocks.push({
            id: 'free-' + currentMin,
            start_minute: currentMin,
            end_minute: 1440,
            color: 'var(--color-success)',
            label: 'FREE TIME'
          });
        }

        let freeHtml = `<div class="timeline-row free-time-row"><div class="timeline-user-label">MUTUAL<div class="timeline-user-sub">FREE TIME</div></div>${buildTrack(freeBlocks, true, true)}</div>`;
        scroll.innerHTML = freeHtml + scroll.innerHTML;
      } else {
        scroll.classList.remove('freetime-active');
      }

      // Scroll to current time if today
      if (isToday(d)) {
        setTimeout(() => {
          const trackEl = scroll.querySelector('.timeline-track');
          if (trackEl) scroll.scrollLeft = Math.max(0, nowMinTz * PX_PER_MIN - 200);
        }, 50);
      }

      // Block click handlers
      scroll.querySelectorAll('.timeline-block[data-type="event"]').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); showEventPopup(parseInt(el.dataset.id), e); });
      });

      // Drag-to-create scheduling logic
      scroll.querySelectorAll('.timeline-track').forEach(track => {
        function handleStart(clientX, e) {
          if (e.target !== track) return;
          if (e.cancelable) e.preventDefault();

          const SNAP_MIN = 15;
          const SNAP_PX = SNAP_MIN * PX_PER_MIN;
          const rect = track.getBoundingClientRect();
          
          let rawStartX = Math.max(0, clientX - rect.left);
          const startX = Math.round(rawStartX / SNAP_PX) * SNAP_PX;
          
          const ghost = document.createElement('div');
          ghost.className = 'timeline-block ghost-block';
          ghost.style.left = `${startX}px`;
          ghost.style.width = `${SNAP_PX * 4}px`; // Default 1 hour width

          const labelSpan = document.createElement('span');
          labelSpan.className = 'ghost-time-label';
          ghost.appendChild(labelSpan);
          track.appendChild(ghost);

          function formatTime(mins) {
            const h = Math.floor(mins / 60).toString().padStart(2, '0');
            const m = (mins % 60).toString().padStart(2, '0');
            return `${h}:${m}`;
          }

          function updateGhost(currentX) {
            currentX = Math.max(0, Math.min(currentX, rect.width));
            currentX = Math.round(currentX / SNAP_PX) * SNAP_PX;

            let left = Math.min(startX, currentX);
            let width = Math.abs(currentX - startX);
            
            if (width === 0) {
              width = SNAP_PX * 4; // 60 mins fallback if barely dragged
              // Adjust left if startX is near the right edge
              if (left + width > rect.width) {
                left = rect.width - width;
              }
            }

            ghost.style.left = `${left}px`;
            ghost.style.width = `${width}px`;

            const startMin = Math.floor(left / PX_PER_MIN);
            const endMin = startMin + Math.floor(width / PX_PER_MIN);
            labelSpan.textContent = `${formatTime(startMin)} - ${formatTime(endMin)}`;
            
            return { left, width };
          }

          // Initial render to show 1-hour block at click
          let lastValues = updateGhost(startX);

          function handleMove(ev) {
            const currentClientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
            lastValues = updateGhost(currentClientX - rect.left);
          }

          function handleEnd(ev) {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchend', handleEnd);

            ghost.remove();

            const startMin = Math.floor(lastValues.left / PX_PER_MIN);
            const durationMin = Math.floor(lastValues.width / PX_PER_MIN);

            const startH = Math.floor(startMin / 60);
            const startM = startMin % 60;
            const endMin = startMin + durationMin;
            const endH = Math.floor(endMin / 60);
            const endM = endMin % 60;

            const startDt = new Date(d);
            startDt.setHours(startH, startM, 0, 0);
            const endDt = new Date(d);
            endDt.setHours(endH, endM, 0, 0);

            if (track.dataset.type === 'routine') {
              const fmt = (h, m) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
              document.getElementById('sched-start').value = fmt(startH, startM);
              document.getElementById('sched-end').value = fmt(endH, endM);
              document.getElementById('routine-dock').classList.add('open');
              setTimeout(() => document.getElementById('sched-label').focus(), 100);
            } else {
              openEventModal(null, startDt, endDt);
            }
          }

          document.addEventListener('mousemove', handleMove);
          document.addEventListener('touchmove', handleMove, { passive: false });
          document.addEventListener('mouseup', handleEnd);
          document.addEventListener('touchend', handleEnd);
        }

        track.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return; // Only left click
          handleStart(e.clientX, e);
        });
        
        track.addEventListener('touchstart', (e) => {
          handleStart(e.touches[0].clientX, e);
        }, { passive: false });
      });
    }

    // ── Event popup ───────────────────────────────────────────────
    function showEventPopup(id, e) {
      const event = CAL.events.find(ev => ev.id === id);
      if (!event) return;
      CAL.popupEventId = id;

      document.getElementById('event-popup-title').textContent = event.title;
      document.getElementById('event-popup-color').style.backgroundColor = event.color;
      document.getElementById('event-popup-time').textContent =
        fmtTime(event.start_time) + ' – ' + fmtTime(event.end_time);
      document.getElementById('event-popup-notes').textContent = event.notes || '';

      const popup = document.getElementById('event-popup');
      popup.classList.add('show');
      // Position is now handled by centered CSS
      popup.style.left = '';
      popup.style.top = '';
    }

    function closeEventPopup() {
      document.getElementById('event-popup').classList.remove('show');
      CAL.popupEventId = null;
    }

    // ── Add/Edit event modal ──────────────────────────────────────
    function openEventModal(id, startDt, endDt) {
      MODAL.open('event-modal', {
        onOpen: () => {
          CAL.editingId = id;
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
      });
    }

    function toLocalDatetimeInput(d) {
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function selectEventColor(color, containerId = 'event-colors') {
      document.querySelectorAll(`#${containerId} .event-color-swatch`).forEach(sw => {
        sw.classList.toggle('selected', sw.dataset.color === color);
      });
    }

    function getSelectedColor(containerId = 'event-colors') {
      return document.querySelector(`#${containerId} .event-color-swatch.selected`)?.dataset.color || EVENT_COLORS[0];
    }

    function closeEventModal() {
      MODAL.close('event-modal');
      CAL.editingId = null;
    }

    async function saveEvent() {
      const title = document.getElementById('event-input-title').value.trim();
      const notes = document.getElementById('event-input-notes').value.trim();
      const dateVal = document.getElementById('event-input-date').value.replace(/\s/g, '');
      const startVal = document.getElementById('event-input-start').value.trim();
      const endVal = document.getElementById('event-input-end').value.trim();
      const recurrence = document.getElementById('event-input-recurrence').value;
      const color = getSelectedColor('event-colors');

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
      } else {
        // Play calendar chime and update badge
        if (typeof AudioManager !== 'undefined' && AudioManager.playCalendarChime) {
          AudioManager.playCalendarChime();
        }
        if (typeof BadgeManager !== 'undefined') {
          BadgeManager.handleIncoming('calendar');
        }
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
      if (document.getElementById('routine-dock').classList.contains('open')) renderScheduleList();
    }
    function onScheduleBlockUpdate(msg) {
      const idx = CAL.schedule.findIndex(b => b.id === msg.block.id);
      if (idx >= 0) CAL.schedule[idx] = msg.block; else CAL.schedule.push(msg.block);
      if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
    }
    function onScheduleBlockDelete(msg) {
      CAL.schedule = CAL.schedule.filter(b => b.id !== msg.id);
      if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      if (document.getElementById('routine-dock').classList.contains('open')) renderScheduleList();
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
      // View tab keyboard nav
      const calTablist = document.querySelector('.cal-view-tabs');
      if (calTablist) {
        calTablist.setAttribute('role', 'tablist');
        calTablist.addEventListener('keydown', (e) => {
          const tabs = Array.from(calTablist.querySelectorAll('[role="tab"]'));
          const idx = tabs.indexOf(document.activeElement);
          if (idx === -1) return;
          let next = null;
          if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
          else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
          else if (e.key === 'Home') next = tabs[0];
          else if (e.key === 'End') next = tabs[tabs.length - 1];
          if (next) { e.preventDefault(); next.focus(); }
        });
      }

      // View tabs
      document.querySelectorAll('.cal-view-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          console.log('[CAL] Tab clicked:', tab.dataset.view, 'classList:', tab.className);
          document.querySelectorAll('.cal-view-tab').forEach(t => {
            t.classList.remove('on');
            t.setAttribute('aria-selected', 'false');
          });
          tab.classList.add('on');
          tab.setAttribute('aria-selected', 'true');
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
        // Check if target is valid and has closest method (Document/Window don't)
        const isBlockClick = e.target && typeof e.target.closest === 'function' && e.target.closest('.timeline-block');
        if (popup && popup.classList.contains('show') && !popup.contains(e.target) && !isBlockClick) {
          closeEventPopup();
        }
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
          el.style.cssText = 'font-family:var(--font-header);font-size:var(--font-size-micro);color:var(--color-tertiary);text-align:center;padding:2px;';
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
          el.style.cssText = `font-family:var(--font-header);font-size:var(--font-size-micro);text-align:center;padding:3px 1px;cursor:pointer;border:1px solid transparent;${isToday ? 'background:var(--color-success);' : 'background:var(--color-base);'}`;
          el.textContent = d;
          el.addEventListener('mouseenter', () => { el.style.background = 'var(--color-tertiary)'; });
          el.addEventListener('mouseleave', () => { el.style.background = isToday ? 'var(--color-success)' : 'var(--color-base)'; });
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
      const dateInput = document.getElementById('event-input-date');
      const formatFn = (el) => {
        let v = el.value.replace(/\D/g, '').slice(0, 8);
        if (v.length >= 5) v = v.slice(0, 2) + ' / ' + v.slice(2, 4) + ' / ' + v.slice(4);
        else if (v.length >= 3) v = v.slice(0, 2) + ' / ' + v.slice(2);
        el.value = v;
      };

      dateInput.addEventListener('input', (e) => formatFn(e.target));
      dateInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        e.target.value = text.replace(/\D/g, '').slice(0, 8);
        formatFn(e.target);
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
        if (e.key === 'Escape') {
          if (document.getElementById('event-modal').classList.contains('show')) { closeEventModal(); return; }
          if (document.getElementById('event-popup').classList.contains('show')) { closeEventPopup(); return; }
        }
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