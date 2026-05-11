// ════════════════════════════════════════════════════════════
//  ISO ENGINE CONSTANTS & HELPERS (Block 1)
// ════════════════════════════════════════════════════════════
const DISABLE_HOUSE = true; // MVP Release: Disable background house logic to save RAM

const ISO = {
  TW: 64,   // tile pixel width (2:1 diamond)
  TH: 32,   // tile pixel height
  WALL_H: 120, // vertical wall height in pixels

  /** Grid → screen pixel (ISO diamond origin at top of diamond) */
  toScreen(x, y) {
    return {
      px: (x - y) * (this.TW / 2),
      py: (x + y) * (this.TH / 2)
    };
  },

  /** Drafting mode: Grid → screen pixel (simple square) */
  toScreenDraft(x, y) {
    return { px: x * 32, py: y * 32 };
  },

  /**
   * Screen pixel (relative to grid origin) → tile coords
   * Works for ISO diamond picking via the 2:1 inverse formula.
   */
  fromScreen(px, py) {
    const tx = (px / (this.TW / 2) + py / (this.TH / 2)) / 2;
    const ty = (py / (this.TH / 2) - px / (this.TW / 2)) / 2;
    return { x: Math.floor(tx), y: Math.floor(ty) };
  },

  /**
   * Used purely for measuring relative drag deltas symmetrically.
   */
  fromScreenDelta(px, py) {
    const tx = (px / (this.TW / 2) + py / (this.TH / 2)) / 2;
    const ty = (py / (this.TH / 2) - px / (this.TW / 2)) / 2;
    return { x: Math.round(tx), y: Math.round(ty) };
  },

  fromScreenDraft(px, py) {
    return { x: Math.floor(px / 32), y: Math.floor(py / 32) };
  },

  /**
   * Compute the pixel bounds of the entire room diamond
   * so we can size #house-grid accordingly.
   */
  roomBounds(cols, rows) {
    const w = (cols + rows) * (this.TW / 2);
    const h = (cols + rows) * (this.TH / 2) + this.WALL_H;
    return { w, h };
  }
};

/** Dynamic VIEW_SCALE — shrinks the room to fit the viewport */
let VIEW_SCALE = 1;
function recalcViewScale() {
  const cam = document.getElementById('house-camera');
  if (!cam) return;
  const room = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
  const cols = room.width || room.grid_size?.[0] || 10;
  const rows = room.height || room.grid_size?.[1] || 10;
  const { w, h } = ISO.roomBounds(cols, rows);

  // Fallback to window dimensions if camera is currently display:none during init
  const cW = cam.clientWidth || window.innerWidth;
  const cH = cam.clientHeight || window.innerHeight;

  const padH = 0.85, padV = 0.80;
  const scaleW = (cW * padH) / w;
  const scaleH = (cH * padV) / h;

  // Prevent scale from dropping to 0 or becoming absurdly small/large
  VIEW_SCALE = Math.max(0.1, Math.min(1, scaleW, scaleH));

  const el = document.getElementById('house-rooms-container');
  if (el) el.style.transform = `translate(-50%, -50%) scale(${VIEW_SCALE})`;
}
if (!DISABLE_HOUSE) {
  window.addEventListener('resize', recalcViewScale);
}

// ════════════════════════════════════════════════════════════
//  HOUSE SYSTEM (Block 4.5 + 5)
// ════════════════════════════════════════════════════════════
const HOUSE_STATE = {
  blueprintMode: false,
  inventoryOpen: false,
  _needsRender: true, // Signal to rAF loop
  rooms: [],      // From rooms.json + DB overrides
  furniture: [],  // [{ id, config_id, x, y, z }]
  cats: [],       // Placeholder for future cat system
  lastSocialTime: 0,
  player: {
    x: 0,
    y: 0,
    path: [],
    isMoving: false,
    roamTimer: null,
    moveTimeout: null,
    outfit: ['🚶']
  },
  partner: {
    x: 5,
    y: 5,
    path: [],
    isMoving: false,
    roamTimer: null,
    moveTimeout: null,
    outfit: ['👧']
  },
  _drag: {
    active: false,
    itemId: null,
    startX: 0,
    startY: 0,
    originalX: 0,
    originalY: 0,
    selectedId: null,
    justDropped: false
  },
  lockedFurniture: new Set(), // items locked by partner
  _forceFullSort: true, // Trigger full re-render on room change/blueprint toggle
};

function toggleBlueprint() {
  HOUSE_STATE.blueprintMode = !HOUSE_STATE.blueprintMode;
  const btn = document.getElementById('btn-architect');
  const grid = document.getElementById('house-grid');
  const container = document.getElementById('house-rooms-container');

  if (HOUSE_STATE.blueprintMode) {
    // ── Drafting (flat top-down) mode ──
    btn.classList.add('on');
    btn.textContent = '✏️ DRAFTING';
    grid.classList.remove('iso-grid');
    grid.classList.add('draft-grid');
    container.classList.add('drafting');
    showToast("DRAFTING MODE: ON");
  } else {
    // ── ISO (3/4 isometric) mode ──
    btn.classList.remove('on');
    btn.textContent = '🏡 BLUEPRINT';
    grid.classList.remove('draft-grid');
    grid.classList.add('iso-grid');
    container.classList.remove('drafting');
    showToast("DRAFTING MODE: OFF");
  }
  HOUSE_STATE._forceFullSort = true;
  renderHouse();
}

async function initHouseSystem() {
  if (DISABLE_HOUSE) {
    console.log("[House] System disabled for MVP release.");
    return;
  }
  
  // 1. Character/Outfit Assignment (Fallback Chain: Storage -> Sprite -> Emoji)
  const getAvatarOutfit = (isMe) => {
    const avatar = isMe ? (window.getMyAvatar ? getMyAvatar() : null) : (window.getOtherAvatar ? getOtherAvatar() : null);
    if (avatar) return [avatar]; // Priority: Avatar from DB/Storage

    const isUserA = (STATE.user && STATE.user.id === STATE.userAId);
    if (isMe) return [isUserA ? '🚶' : '👧'];
    return [isUserA ? '👧' : '🚶'];
  };

  HOUSE_STATE.player.outfit = getAvatarOutfit(true);
  HOUSE_STATE.partner.outfit = getAvatarOutfit(false);

  // Wire buttons
  document.getElementById('btn-architect')?.addEventListener('click', toggleBlueprint);
  document.getElementById('btn-inventory')?.addEventListener('click', toggleInventory);

  // Start in ISO view
  const grid = document.getElementById('house-grid');
  if (grid) grid.classList.add('iso-grid');

  // Drag listener for viewport
  const camera = document.getElementById('house-camera');
  camera?.addEventListener('mousemove', handleDragMove);
  camera?.addEventListener('touchmove', (e) => handleDragMove(e.touches[0]), { passive: false });
  window.addEventListener('mouseup', handleDragEnd);
  window.addEventListener('touchend', handleDragEnd);

  // Pathfinding listener
  document.getElementById('house-grid')?.addEventListener('click', handleRoomClick);

  // 1. Fetch character positions and setup defaults first
  let px = 1, py = 1, ox = 5, oy = 5;
  if (STATE.user) {
    try {
      const resp = await fetch('/auth/keys', { headers: { Authorization: `Bearer ${STATE.token}` } });
      const keys = await resp.json();

      // Seed defaults: 0 is fine, but -1 means "never set".
      const isPlayerEmpty = (keys.my_house_x === -1 || keys.my_house_x === null);
      const isPartnerEmpty = (keys.other_house_x === -1 || keys.other_house_x === null);

      px = !isPlayerEmpty ? keys.my_house_x : (STATE.user.id === STATE.userAId ? 1 : 5);
      py = !isPlayerEmpty ? keys.my_house_y : (STATE.user.id === STATE.userAId ? 1 : 5);
      ox = !isPartnerEmpty ? keys.other_house_x : (STATE.user.id === STATE.userAId ? 5 : 1);
      oy = !isPartnerEmpty ? keys.other_house_y : (STATE.user.id === STATE.userAId ? 5 : 1);
    } catch (e) {
      console.error("[SafeSpawn] Initial key fetch failed", e);
    }
  }

  HOUSE_STATE.player.x = px;
  HOUSE_STATE.player.y = py;
  HOUSE_STATE.partner.x = ox;
  HOUSE_STATE.partner.y = oy;

  // 2. Load Rooms/Furniture (calls renderHouse internally)
  await refreshHouseData();

  // 3. Final safety check (in case furniture was placed on spawn)
  relocateToSafeSpawn('player', px, py);
  relocateToSafeSpawn('partner', ox, oy);

  // 4. Initial Position Sync to Partner
  // This ensures if User A refreshes, User B sees them at the correct spot immediately
  // without User A needing to take the first step.
  if (window.wsSend && STATE.user) {
    wsSend(WS_EV.C_CHAR_MOVE, {
      userId: STATE.user.id,
      x: HOUSE_STATE.player.x,
      y: HOUSE_STATE.player.y,
      charId: 'partner' // Telling partner where we are
    });
  }

  // Force one last render to be absolutely sure
  renderHouse();

  recalcViewScale();
}

function toggleInventory() {
  const win = document.getElementById('inventory-win');
  win.classList.toggle('show');
  if (win.classList.contains('show')) {
    renderInventory();
  }
}

function renderInventory() {
  const grid = document.getElementById('inventory-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const items = CONFIG.FURNITURE || [];
  const placedIds = new Set(HOUSE_STATE.furniture.map(p => p.config_id));

  const categories = {};
  items.forEach(item => {
    const isTexture = (item.type === 'tile' || item.type === 'wallpaper');
    // Textures are infinite-use, never hidden. Regular furniture hides once placed.
    if (!isTexture && placedIds.has(item.id)) return;

    const cat = item.category || 'decor';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  });

  Object.entries(categories).forEach(([catName, catItems]) => {
    const header = document.createElement('div');
    header.className = 'inv-cat-header';
    header.innerHTML = `<span>📂 ${catName.toUpperCase()}</span> <span>(${catItems.length})</span>`;

    const container = document.createElement('div');
    container.className = 'inv-cat-items collapsed';

    header.addEventListener('click', () => {
      container.classList.toggle('collapsed');
    });

    catItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'inv-item';
      const isTexture = (item.type === 'tile' || item.type === 'wallpaper');
      let preview = item.assets?.iso?.[0] || '📦';
      // Add a ♾ badge to texture items
      const badge = isTexture ? `<div style="position:absolute;top:2px;right:2px;font-size:8px;opacity:0.8;">♾</div>` : '';
      el.style.position = 'relative';
      el.innerHTML = `${badge}<span>${getSpriteHTML(preview)}</span><label>${item.name}</label>`;
      el.addEventListener('click', () => {
        if (isTexture) {
          applyTexture(item);
        } else {
          spawnItem(item.id);
          showToast(`PLACED: ${item.name}`);
        }
      });
      container.appendChild(el);
    });

    grid.appendChild(header);
    grid.appendChild(container);
  });
}

function applyTexture(item) {
  const room = HOUSE_STATE.rooms[0];
  if (!room) {
    console.error("[House] No active room found to apply texture to.");
    return;
  }

  const target = item.applyTo;
  if (!target) return;

  const textureVal = item.assets?.url || item.assets?.iso?.[0] || null;
  console.log(`[House] Applying ${target} = ${textureVal} to room ${room.id}`);
  room[target] = textureVal;

  renderHouse();
  showToast(`APPLIED: ${item.name.toUpperCase()}`);

  wsSend(WS_EV.C_ROOM_UPDATE, {
    id: room.id,
    [target]: textureVal
  });
}

function onRoomUpdate(data) {
  const room = HOUSE_STATE.rooms.find(r => r.id === data.id);
  if (!room) return;

  if (data.wall_sprite !== undefined) room.wall_sprite = data.wall_sprite;
  if (data.floor_sprite !== undefined) room.floor_sprite = data.floor_sprite;

  renderHouse();
  showToast("ROOM UPDATED");
}

function onFurnitureLock(data) {
  if (data.itemId) {
    console.log("[Locks] Received Lock for", data.itemId);
    HOUSE_STATE.lockedFurniture.add(String(data.itemId));
    renderHouse();
  }
}

function onFurnitureUnlock(data) {
  if (data.itemId) {
    console.log("[Locks] Received Unlock for", data.itemId);
    HOUSE_STATE.lockedFurniture.delete(String(data.itemId));
    renderHouse();
  }
}

function getSpriteHTML(val) {
  if (!val) return '❓';
  if (val.includes('.') || val.includes('/')) {
    return `<img src="${val}" alt="house item" class="house-item-img">`;
  }
  return val; // It's an emoji/text
}

async function refreshHouseData() {
  try {
    console.log("[House] Synchronizing state...");
    const res = await fetch('/houses/sync', {
      headers: { Authorization: `Bearer ${STATE.token}` }
    });
    const data = await res.json();

    // 1. Load Rooms (Merge DB overrides into CONFIG.ROOMS)
    const configRooms = CONFIG.ROOMS || [];
    const dbRooms = data.rooms || [];

    HOUSE_STATE.rooms = configRooms.map(cRoom => {
      const dbRoom = dbRooms.find(r => r.id === cRoom.id);
      if (dbRoom) {
        return {
          ...cRoom,
          wall_sprite: dbRoom.wall_sprite !== null ? dbRoom.wall_sprite : cRoom.wall_sprite,
          floor_sprite: dbRoom.floor_sprite !== null ? dbRoom.floor_sprite : cRoom.floor_sprite
        };
      }
      return cRoom;
    });

    // 2. Load Furniture (Map DB 'item_id' to client 'config_id')
    HOUSE_STATE.furniture = (data?.furniture || []).map(p => ({
      ...p,
      config_id: p.item_id,
      dir: p.dir || 0
    }));

    // 3. Load Cats (Placeholder)
    HOUSE_STATE.cats = data?.cats || [];

    console.log("[House] Sync complete. Furniture:", HOUSE_STATE.furniture.length, "Cats:", HOUSE_STATE.cats.length);
    HOUSE_STATE._forceFullSort = true;
    renderHouse();
  } catch (e) {
    console.error("[House] Sync failed", e);
    HOUSE_STATE.rooms = CONFIG.ROOMS || [{ id: 'default_room', name: 'Main Room', grid_size: [10, 10] }];
    HOUSE_STATE._forceFullSort = true;
    renderHouse();
  }
}
window.refreshHouseData = refreshHouseData;

async function spawnItem(itemId) {
  const config = (CONFIG.FURNITURE || []).find(f => f.id === itemId);
  if (!config) return;

  const newItem = {
    id: "item-" + Date.now(),
    config_id: itemId,
    x: 5, // Default spawn center-aligned
    y: 5,
    dir: 0 // 0=North, 1=East, 2=South, 3=West
  };

  HOUSE_STATE.furniture.push(newItem);
  renderHouse();
  renderInventory();
  HOUSE_STATE._drag.selectedId = newItem.id;

  // Auto-nudge character if blocked after spawn
  relocateToSafeSpawn('player', HOUSE_STATE.player.x, HOUSE_STATE.player.y);
  relocateToSafeSpawn('partner', HOUSE_STATE.partner.x, HOUSE_STATE.partner.y);

  await syncHouseItem(newItem);
}

let _lastRoomId = null;
let _lastMode = null;

/** Throttled wrapper for rAF loop */
function renderHouse() {
  HOUSE_STATE._needsRender = true;
}

function syncRenderHouse() {
  const container = document.getElementById('house-grid');
  if (!container) return;

  const isDraft = HOUSE_STATE.blueprintMode;
  const activeRoom = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
  const cols = activeRoom.width || activeRoom.grid_size?.[0] || 10;
  const rows = activeRoom.height || activeRoom.grid_size?.[1] || 10;
  const roomId = activeRoom.id;

  // ── 1. BACKGROUND REBUILD (Tiles & Walls) ──────────────────
  if (_lastRoomId !== roomId || _lastMode !== isDraft) {
    console.log(`[House] Rebuilding grid background for Room:${roomId} Mode:${isDraft ? 'Draft' : 'ISO'}`);
    container.innerHTML = '<div id="house-ghost"></div>';

    if (isDraft) {
      container.style.width = (cols * 32) + 'px';
      container.style.height = (rows * 32) + 'px';
      container.style.gridTemplateColumns = `repeat(${cols}, 32px)`;
      container.style.gridTemplateRows = `repeat(${rows}, 32px)`;
      container.style.display = 'grid';
    } else {
      const { w, h } = ISO.roomBounds(cols, rows);
      container.style.width = w + 'px';
      container.style.height = h + 'px';
      container.style.display = 'block';
    }

    const isoOriginX = rows * (ISO.TW / 2);
    const isoOriginY = ISO.WALL_H;

    // Floor Tiles
    const floorTex = activeRoom.floor_sprite || activeRoom.floorTexture || null;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const tile = document.createElement('div');
        if (isDraft) {
          tile.className = 'house-tile draft-tile';
        } else {
          tile.className = 'house-tile';
          const { px, py } = ISO.toScreen(tx, ty);
          tile.style.left = (isoOriginX + px - ISO.TW / 2) + 'px';
          tile.style.top = (isoOriginY + py) + 'px';
          if (floorTex) {
            const isUrl = floorTex.includes('.') || floorTex.includes('/');
            if (isUrl) {
              tile.style.backgroundImage = `url('${floorTex}')`;
              tile.style.backgroundSize = 'cover';
            } else {
              tile.style.fontSize = '20px';
              tile.style.display = 'flex';
              tile.style.alignItems = 'center';
              tile.style.justifyContent = 'center';
              tile.textContent = floorTex;
            }
            tile.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
          }
        }
        tile.dataset.x = tx; tile.dataset.y = ty;
        tile.style.pointerEvents = 'none';
        container.appendChild(tile);
      }
    }

    // Walls
    if (!isDraft) {
      const wallTex = activeRoom.wall_sprite || activeRoom.wallTexture || null;
      const wallH = ISO.WALL_H;
      const emojiToWallBg = (emoji, cellW, cellH) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellH}"><text x="50%" y="70%" font-size="${Math.min(cellW, cellH) * 0.7}" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      };

      const createWall = (className, left, top, skew) => {
        const w = document.createElement('div');
        w.className = className;
        w.style.left = left + 'px';
        w.style.top = top + 'px';
        w.style.width = (className.includes('n') ? cols : rows) * (ISO.TW / 2) + 'px';
        w.style.height = wallH + 'px';
        w.style.transform = `skewY(${skew}deg)`;
        w.style.transformOrigin = className.includes('n') ? 'top left' : 'top right';
        if (wallTex) {
          const isUrl = wallTex.includes('.') || wallTex.includes('/');
          if (isUrl) {
            w.style.backgroundImage = `url('${wallTex}')`;
            w.style.backgroundSize = `${ISO.TW / 2}px 100%`;
          } else {
            w.style.backgroundImage = emojiToWallBg(wallTex, ISO.TW / 2, wallH / 2);
            w.style.backgroundSize = `${ISO.TW / 2}px ${wallH / 2}px`;
          }
        }
        container.appendChild(w);
      };
      createWall('house-wall-n', isoOriginX, isoOriginY - wallH, 26.57);
      createWall('house-wall-w', isoOriginX - rows * (ISO.TW / 2), isoOriginY - wallH, -26.57);
    }
    _lastRoomId = roomId; _lastMode = isDraft;
  }

  // ── 2. PLACEMENT SYNC (Items) ─────────────────────────────
  const isoOriginX = rows * (ISO.TW / 2);
  const isoOriginY = ISO.WALL_H;
  const currentItemIds = new Set();

  HOUSE_STATE.furniture.forEach(item => {
    currentItemIds.add(item.id);
    const config = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);
    if (!config) return;

    let el = document.getElementById(item.id);
    if (!el) {
      el = document.createElement('div');
      el.id = item.id;
      el.className = 'house-item';

      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.house-item').forEach(hi => hi.classList.remove('selected'));
        HOUSE_STATE._drag.selectedId = item.id;
        el.classList.add('selected');
        handleDragStart(e, item.id);
      });
      el.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.house-item').forEach(hi => hi.classList.remove('selected'));
        HOUSE_STATE._drag.selectedId = item.id;
        el.classList.add('selected');
        handleDragStart(e.touches[0], item.id);
      });
      container.appendChild(el);
    }

    const isDragging = HOUSE_STATE._drag.itemId === item.id;
    const isSelected = HOUSE_STATE._drag.selectedId === item.id;
    const isLocked = HOUSE_STATE.lockedFurniture.has(String(item.id));

    if (el.dataset.dragging !== String(isDragging)) { el.classList.toggle('dragging', isDragging); el.dataset.dragging = isDragging; }
    if (el.dataset.selected !== String(isSelected)) { el.classList.toggle('selected', isSelected); el.dataset.selected = isSelected; }
    if (el.dataset.locked !== String(isLocked)) {
      el.classList.toggle('locked-by-partner', isLocked);
      el.dataset.locked = isLocked;
      el.style.filter = isLocked ? 'grayscale(1) opacity(0.5)' : '';
      el.style.pointerEvents = isLocked ? 'all' : ''; // Still allow clicks for Toast rejection

      // Disable individual action handles for redundant safety
      const actions = el.querySelector('.house-item-actions');
      if (actions) {
        actions.style.pointerEvents = isLocked ? 'none' : 'auto';
        actions.style.opacity = isLocked ? '0.3' : '1';
      }
    }

    let spriteVal = '❓';
    let useCssRotation = false;
    if (config.assets) {
      if (isDraft && config.assets.top) {
        spriteVal = config.assets.top;
        useCssRotation = true;
      } else if (config.assets.iso) {
        const iso = config.assets.iso;
        spriteVal = Array.isArray(iso) ? (iso[item.dir || 0] || iso[0]) : iso;
      }
    }

    // 🧮 Sprite Diffing
    const spriteKey = `${spriteVal}|${isDraft}`;
    if (el.dataset.lastSprite !== spriteKey) {
      el.innerHTML = `
            ${getSpriteHTML(spriteVal)}
            <div class="house-item-actions">
              <div class="action-handle rotate-btn" data-id="${item.id}">🔄</div>
              <div class="action-handle danger delete-btn" data-id="${item.id}">🗑</div>
            </div>
          `;
      el.dataset.lastSprite = spriteKey;
      el.querySelector('.rotate-btn').onclick = (e) => { e.stopPropagation(); handleRotateItem(item.id); };
      el.querySelector('.delete-btn').onclick = async (e) => {
        e.stopPropagation();
        if (HOUSE_STATE.lockedFurniture.has(String(item.id))) {
          console.log("[Locks] Blocking DELETE button click for", item.id);
          showToast("PARTNER IS MOVING THIS ITEM");
          return;
        }
        if (confirm(`REMOVE ${config.name.toUpperCase()}?`)) {
          const idsToRemove = getDescendantIds(item.id);
          idsToRemove.add(item.id);
          await Promise.all([...idsToRemove].map(id => removeHouseItem(id)));
          HOUSE_STATE.furniture = HOUSE_STATE.furniture.filter(p => !idsToRemove.has(p.id));
          renderHouse(); renderInventory();
        }
      };
    }

    // 🧮 Z-index Boundary Gating (Block P1-H)
    const parent_id = item.parent_id || null;
    const slot_index = item.slot_index !== undefined ? item.slot_index : null;
    const stateKey = `${item.x}|${item.y}|${item.dir}|${isDragging}|${isSelected}|${isLocked}|${parent_id}|${slot_index}`;
    
    if (!HOUSE_STATE._forceFullSort && el.dataset.state === stateKey) return; 

    let size = config.size || [1, 1];
    if (item.dir % 2 !== 0) size = [size[1], size[0]];

    let drawX, drawY, zBase, transform = '';
    if (isDraft) {
      const { px, py } = ISO.toScreenDraft(item.x, item.y);
      drawX = px; drawY = py; zBase = item.y * 10;
      el.style.width = (size[0] * 32) + 'px';
      el.style.height = (size[1] * 32) + 'px';
      if (useCssRotation && item.dir !== 0) transform = `rotateZ(${item.dir * 90}deg)`;
    } else {
      const frontX = item.x + size[0], frontY = item.y + size[1];
      const { px, py } = ISO.toScreen(frontX, frontY);
      drawX = isoOriginX + px; drawY = isoOriginY + py; zBase = (item.x + item.y) * 10;
      el.style.width = 'max-content'; el.style.height = 'max-content';
      transform = 'translate(-50%, -100%)';
    }

    let offsetX = 0, offsetY = 0;
    if (item.parent_id) {
      const parentCfg = (CONFIG.FURNITURE || []).find(f => f.id === HOUSE_STATE.furniture.find(p => p.id === item.parent_id)?.config_id);
      if (item.slot_index !== null && parentCfg?.attachmentPoints?.[item.slot_index]) {
        const pt = parentCfg.attachmentPoints[item.slot_index];
        offsetX = pt.x || 0; offsetY = isDraft ? 0 : (pt.y || 0);
      } else if (parentCfg?.isSurface) {
        offsetY = isDraft ? 0 : -12;
      }
    }

    // Positions
    const finalX = drawX + offsetX;
    const finalY = drawY + offsetY;
    const finalZ = zBase + (item.parent_id ? 105 : 100);

    // Apply styles directly (already filtered by stateKey update check)
    el.style.left = finalX + 'px';
    el.style.top = finalY + 'px';
    el.style.zIndex = finalZ;
    el.style.transform = transform;
    el.dataset.state = stateKey;
  });

  HOUSE_STATE._forceFullSort = false;

  container.querySelectorAll('.house-item').forEach(el => {
    if (!currentItemIds.has(el.id)) el.remove();
  });

  renderCharacters();
}

function renderCharacters() {
  const container = document.getElementById('house-grid');
  if (!container || HOUSE_STATE.blueprintMode) {
    document.querySelectorAll('.house-player').forEach(p => p.style.display = 'none');
    return;
  }

  const activeRoom = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
  const rows = activeRoom.height || activeRoom.grid_size?.[1] || 10;
  const isoOriginX = rows * (ISO.TW / 2);
  const isoOriginY = ISO.WALL_H;

  const drawChar = (id, char) => {
    let pEl = document.getElementById('char-' + id);
    if (!pEl) {
      pEl = document.createElement('div');
      pEl.id = 'char-' + id;
      pEl.className = 'house-player';
      container.appendChild(pEl);
    }

    // 🧮 Outfit Diffing
    const outfitKey = (char.outfit || []).join('|');
    if (pEl.dataset.outfit !== outfitKey) {
      pEl.innerHTML = (char.outfit || []).map((layer, idx) => {
        if (typeof layer === 'string' && (layer.startsWith('data:') || layer.startsWith('http'))) {
          return `<div class="char-layer" style="z-index:${idx}"><img src="${layer}" alt="character outfit layer" class="char-layer-img"></div>`;
        }
        return `<div class="char-layer" style="z-index:${idx};font-size:28px;">${layer}</div>`;
      }).join('');
      pEl.dataset.outfit = outfitKey;
    }

    // 🧮 Z-index Boundary Gating (Block P1-H)
    const char_parent_id = char.parent_id || null;
    const char_slot_index = char.slot_index !== undefined ? char.slot_index : null;
    const stateKey = `${char.x}|${char.y}|${char_parent_id}|${char_slot_index}|${outfitKey}`;

    if (!HOUSE_STATE._forceFullSort && pEl.dataset.state === stateKey) return;

    let offsetX = 0, offsetY = 0;
    if (char.parent_id) {
      const parent = HOUSE_STATE.furniture.find(p => p.id === char.parent_id);
      const parentCfg = (CONFIG.FURNITURE || []).find(f => f.id === parent?.config_id);
      if (parentCfg) {
        if (char.slot_index !== null && char.slot_index !== undefined && parentCfg.attachmentPoints?.[char.slot_index]) {
          const pt = parentCfg.attachmentPoints[char.slot_index];
          offsetX = pt.x || 0; offsetY = pt.y || 0;
        } else {
          offsetY = -12;
        }
      }
    }

    const { px, py } = ISO.toScreen(char.x, char.y);
    const finalX = isoOriginX + px - 16 + offsetX;
    const finalY = isoOriginY + py - 32 + offsetY;
    const finalZ = Math.round((char.x + char.y) * 10 + (char.parent_id ? 115 : 110));

    pEl.style.left = finalX + 'px';
    pEl.style.top = finalY + 'px';
    pEl.style.zIndex = finalZ;
    pEl.dataset.state = stateKey;
    if (pEl.style.display !== 'flex') pEl.style.display = 'flex';

    if (id === 'them' && !pEl.dataset.init) {
      pEl.style.cursor = 'pointer';
      let lpTimer = null;
      const triggerSoc = (x, y) => showSocialMenu(x, y);
      pEl.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); triggerSoc(e.clientX, e.clientY); };
      pEl.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        lpTimer = setTimeout(() => { triggerSoc(touch.clientX, touch.clientY); lpTimer = null; }, 600);
      }, { passive: true });
      pEl.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
      pEl.dataset.init = "true";
    }
  };

  drawChar('me', HOUSE_STATE.player);
  drawChar('them', HOUSE_STATE.partner);
}

async function handleRotateItem(id) {
  if (HOUSE_STATE.lockedFurniture.has(String(id))) {
    console.log("[Locks] Blocking ROTATE button click for", id);
    showToast("PARTNER IS MOVING THIS ITEM");
    return;
  }
  const item = HOUSE_STATE.furniture.find(p => p.id === id);
  if (!item) return;
  item.dir = (item.dir + 1) % 4;
  renderHouse();
  await syncHouseItem(item);
  showToast("ROTATED FURNITURE");
}

// 🧮 A* Pathfinding Logic (Block 7.1)
const PathFinder = {
  findPath(start, end, excludeCharId, softMode = false) {
    const grid = this.getCollisionGrid(excludeCharId, softMode);
    const rows = grid.length;
    const cols = grid[0].length;

    const openSet = [{ x: start.x, y: start.y, g: 0, h: this.dist(start, end), parent: null }];
    const closedSet = new Set();

    while (openSet.length > 0) {
      openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
      const current = openSet.shift();

      if (current.x === end.x && current.y === end.y) {
        const path = [];
        let temp = current;
        while (temp) { path.push({ x: temp.x, y: temp.y }); temp = temp.parent; }
        return path.reverse();
      }

      closedSet.add(`${current.x},${current.y}`);

      const neighbors = [
        { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }
      ];

      for (const neighbor of neighbors) {
        if (neighbor.x < 0 || neighbor.x >= cols || neighbor.y < 0 || neighbor.y >= rows) continue;
        if (grid[neighbor.y][neighbor.x] === 1) continue; // Blocked by hard collision
        if (closedSet.has(`${neighbor.x},${neighbor.y}`)) continue;

        const stepCost = grid[neighbor.y][neighbor.x] === 2 ? 10 : 1;
        const gScore = current.g + stepCost;
        let existing = openSet.find(o => o.x === neighbor.x && o.y === neighbor.y);

        if (!existing) {
          openSet.push({ ...neighbor, g: gScore, h: this.dist(neighbor, end), parent: current });
        } else if (gScore < existing.g) {
          existing.g = gScore;
          existing.parent = current;
        }
      }
    }
    return [];
  },
  dist(p1, p2) { return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y); },
  getCollisionGrid(excludeCharId, softMode = false) {
    const room = HOUSE_STATE.rooms[0] || { grid_size: [20, 20] };
    const rCols = room.width || room.grid_size?.[0] || 20;
    const rRows = room.height || room.grid_size?.[1] || 20;
    const grid = Array.from({ length: rRows }, () => Array(rCols).fill(0));

    HOUSE_STATE.furniture.forEach(item => {
      const cfg = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);
      if (!cfg) return;

      const isBlocking = !cfg.isWalkable && (cfg.type === 'floor' || (cfg.type === 'tabletop' && !item.parent_id));

      if (!isBlocking) return;

      let [w, h] = cfg.size || [1, 1];
      if (item.dir % 2 !== 0) [w, h] = [h, w];
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const ty = item.y + r;
          const tx = item.x + c;
          if (ty >= 0 && ty < rRows && tx >= 0 && tx < rCols) grid[ty][tx] = 1; // Hard collision for furniture
        }
      }
    });

    ['player', 'partner'].forEach(id => {
      if (id !== excludeCharId) {
        const c = HOUSE_STATE[id];
        // If softMode is true, represent the partner as 2 (high cost pass-through) instead of 1 (hard block)
        if (c && c.y >= 0 && c.y < rRows && c.x >= 0 && c.x < rCols) grid[c.y][c.x] = softMode ? 2 : 1;
      }
    });

    return grid;
  },
  findSafeSpawn(tx, ty, charId) {
    const grid = this.getCollisionGrid(charId);
    const room = HOUSE_STATE.rooms[0] || { grid_size: [20, 20] };
    const rCols = room.width || room.grid_size?.[0] || 20;
    const rRows = room.height || room.grid_size?.[1] || 20;

    // If current is safe, return it
    if (ty >= 0 && ty < rRows && tx >= 0 && tx < rCols && grid[ty][tx] === 0) {
      if (!(tx === 0 && ty === 0)) return { x: tx, y: ty };
      // If at 0,0, check if it's explicitly allowed (though user said "never 0,0 directly" as fallback)
    }

    // BFS outward (radius 5)
    const queue = [{ x: tx, y: ty, d: 0 }];
    const visited = new Set([`${tx},${ty}`]);
    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, // Cardinal
      { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 } // Diagonal
    ];

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d >= 5) break;

      for (const dir of dirs) {
        const nx = curr.x + dir.dx;
        const ny = curr.y + dir.dy;
        const key = `${nx},${ny}`;

        if (nx >= 0 && nx < rCols && ny >= 0 && ny < rRows && !visited.has(key)) {
          if (grid[ny][nx] === 0) {
            if (!(nx === 0 && ny === 0)) return { x: nx, y: ny };
          }
          visited.add(key);
          queue.push({ x: nx, y: ny, d: curr.d + 1 });
        }
      }
    }

    // Fallback: room default spawn
    const def = room.default_spawn || [2, 2];
    return { x: def[0], y: def[1] };
  }
};

function relocateToSafeSpawn(charId, tx, ty) {
  const char = HOUSE_STATE[charId];
  if (!char) return;

  const safe = PathFinder.findSafeSpawn(tx, ty, charId);
  if (safe.x !== char.x || safe.y !== char.y) {
    console.log(`[SafeSpawn] Relocating ${charId} from ${char.x},${char.y} to ${safe.x},${safe.y}`);
    char.x = safe.x;
    char.y = safe.y;
    char.path = [];
    if (char.moveTimeout) clearTimeout(char.moveTimeout);
    char.isMoving = false;

    if (charId === 'player') {
      wsSend(WS_EV.C_CHAR_MOVE, {
        userId: STATE.user.id,
        x: char.x,
        y: char.y,
        charId: 'partner',
        parent_id: null,
        slot_index: null
      });
      fetch('/auth/char-pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STATE.token}` },
        body: JSON.stringify({ x: char.x, y: char.y }),
        keepalive: true,
      }).catch(console.error);
    }
    renderCharacters();
  }
}

function handleRoomClick(e) {
  if (HOUSE_STATE.blueprintMode || HOUSE_STATE._drag.active || HOUSE_STATE._drag.justDropped) return;
  if (e.target.closest('.house-item')) return;

  // Clear selection
  if (HOUSE_STATE._drag.selectedId) {
    HOUSE_STATE._drag.selectedId = null;
    renderHouse();
  }

  const room = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
  const rCols = room.width || room.grid_size?.[0] || 10;
  const rRows = room.height || room.grid_size?.[1] || 10;

  let tx, ty;

  // 1. Diamond tile hit via dataset (most accurate)
  const tile = e.target.closest('.house-tile');
  if (tile && tile.dataset.x !== undefined) {
    tx = parseInt(tile.dataset.x);
    ty = parseInt(tile.dataset.y);
  } else {
    // 2. Fallback: convert screen pixel → ISO grid
    const gridEl = document.getElementById('house-grid');
    const rect = gridEl.getBoundingClientRect();
    const isoOriginX = rRows * (ISO.TW / 2);
    // Pixel relative to grid element, then subtract the ISO origin
    const relX = (e.clientX - rect.left) / VIEW_SCALE - isoOriginX;
    const relY = (e.clientY - rect.top) / VIEW_SCALE - ISO.WALL_H;
    const hit = ISO.fromScreen(relX, relY);
    tx = hit.x;
    ty = hit.y;
  }

  if (isNaN(tx) || isNaN(ty) || tx < 0 || tx >= rCols || ty < 0 || ty >= rRows) return;

  const char = HOUSE_STATE.player;
  if (char.roamTimer) clearTimeout(char.roamTimer);

  const grid = PathFinder.getCollisionGrid('player', true); // Pass softMode=true to see if tile is ANY kind of blocked
  // Still reject if they clicked on a deeply un-walkable space (like a solid table), but allow clicking ON the other player (which is 2).
  if (grid[ty]?.[tx] === 1) return;

  let path = PathFinder.findPath({ x: char.x, y: char.y }, { x: tx, y: ty }, 'player', false);

  // AFK Soft-Collision Pathfinding Fallback
  if (path.length === 0) {
    path = PathFinder.findPath({ x: char.x, y: char.y }, { x: tx, y: ty }, 'player', true);
    if (path.length === 0) {
      showToast("NO PATH TO DESTINATION");
      return;
    }
  }

  if (path.length > 0) {
    char.path = path.slice(1);
    movePlayerAlongPath('player');
  }
}

function movePlayerAlongPath(charId = 'player', onComplete = null) {
  if (HOUSE_STATE.isInteracting) return;
  const char = HOUSE_STATE[charId];
  if (!char || char.path.length === 0) {
    if (onComplete) onComplete();
    return;
  }

  // If moving, we must "Stand up" if we are sitting
  if (char.parent_id) {
    char.parent_id = null;
    char.slot_index = null;
    if (charId === 'player') {
      wsSend(WS_EV.C_PRESENCE_UPDATE, { userId: STATE.user.id, parent_id: null, slot_index: null }, { batch: true });
    }
  }

  // Stop existing loop if any
  if (char.moveTimeout) clearTimeout(char.moveTimeout);
  char.isMoving = true;

  const nextStep = () => {
    if (char.path.length === 0) {
      char.isMoving = false;
      char.moveTimeout = null;
      if (onComplete) onComplete();

      // Block 7.9: Persist position to DB (only for local player)
      if (charId === 'player') {
        fetch('/auth/char-pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STATE.token}` },
          body: JSON.stringify({ x: char.x, y: char.y }),
          keepalive: true,
        }).catch(console.error);
      }

      // Set new roam timer after finishing move
      startRoamTimer(charId);
      return;
    }
    const nextCoord = char.path.shift();
    char.x = nextCoord.x;
    char.y = nextCoord.y;

    // Update backend/remote
    if (charId === 'player') {
      wsSend(WS_EV.C_CHAR_MOVE, {
        userId: STATE.user.id,
        x: char.x,
        y: char.y,
        charId: 'partner',
        parent_id: char.parent_id || null,
        slot_index: char.slot_index !== undefined ? char.slot_index : null
      }, { batch: true });
    }

    renderCharacters();

    // 🫂 Block 8.1: Proximity Check
    checkProximity();

    char.moveTimeout = setTimeout(nextStep, 200);
  };
  nextStep();
}

function checkProximity() {
  const p1 = HOUSE_STATE.player;
  const p2 = HOUSE_STATE.partner;
  const dx = Math.abs(p1.x - p2.x);
  const dy = Math.abs(p1.y - p2.y);
  // Only interact if perfectly adjacent (dist 1)
  const dist = dx + dy;

  if (dist <= 1) {
    const now = Date.now();
    if (now - HOUSE_STATE.lastSocialTime > 15000) { // 15s cooldown per encounter
      HOUSE_STATE.lastSocialTime = now;

      // Only the 'Master' (User A) triggers the AUTONOMOUS random chance to avoid double messages
      const isMaster = STATE.user.id === STATE.userAId;
      const chance = Math.random();

      if (isMaster && chance < 0.3) {
        const pick = Math.random();
        const emoji = pick < 0.5 ? '❤️' : (pick < 0.75 ? '🫂' : '💋');
        showSocialInteractionFX(emoji, true);
      }
    }
  }
}

function showSocialHeart(broadcast = true) {
  showSocialInteractionFX('❤️', broadcast);
}

function showSocialInteractionFX(emoji, broadcast = true) {
  const grid = document.getElementById('house-grid');
  const p1 = HOUSE_STATE.player;
  const p2 = HOUSE_STATE.partner;

  // Lock characters in place for 3 seconds
  HOUSE_STATE.isInteracting = true;
  [p1, p2].forEach(p => {
    p.path = [];
    if (p.moveTimeout) clearTimeout(p.moveTimeout);
    p.isMoving = false;
  });

  if (broadcast) {
    const kind = emoji === '❤️' ? 'heart' : (emoji === '🫂' ? 'hug' : 'kiss');
    wsSend(WS_EV.C_SOCIAL_INTERACTION, { kind, userId: STATE.user.id });
  }

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  const fx = document.createElement('div');
  fx.className = 'social-interaction-fx';
  fx.textContent = emoji;

  // Position using ISO coordinates
  const room = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
  const rRows = room.height || room.grid_size?.[1] || 10;
  const isoOriginX = rRows * (ISO.TW / 2);
  const { px, py } = ISO.toScreen(midX, midY);
  fx.style.left = (isoOriginX + px - 16) + 'px';
  fx.style.top = (ISO.WALL_H + py - 32) + 'px';

  grid.appendChild(fx);
  setTimeout(() => fx.remove(), 2500);

  // Release lock after 3 seconds
  setTimeout(() => {
    HOUSE_STATE.isInteracting = false;
    // Resume roaming
    startRoamTimer('player');
    startRoamTimer('partner');
  }, 3000);
}


function initiateSocialAction(kind) {
  const p = HOUSE_STATE.player;
  const t = HOUSE_STATE.partner;

  if (kind === 'sit') {
    const furnitureUnder = HOUSE_STATE.furniture.find(f => f.x === p.x && f.y === p.y);
    if (furnitureUnder) {
      const fCfg = (CONFIG.FURNITURE || []).find(it => it.id === furnitureUnder.config_id);
      p.parent_id = furnitureUnder.id;
      // Use first available point if it exists
      p.slot_index = (fCfg && fCfg.attachmentPoints && fCfg.attachmentPoints.length > 0) ? 0 : null;
      p.path = [];
      if (p.moveTimeout) clearTimeout(p.moveTimeout);
      p.isMoving = false;

      wsSend(WS_EV.C_CHAR_MOVE, {
        userId: STATE.user.id,
        x: p.x,
        y: p.y,
        charId: 'partner',
        parent_id: p.parent_id,
        slot_index: p.slot_index
      });

      renderHouse();
      showToast("SITTING DOWN");
    }
    return;
  }

  if (kind === 'stand') {
    p.parent_id = null;
    p.slot_index = null;
    wsSend(WS_EV.C_PRESENCE_UPDATE, { userId: STATE.user.id, parent_id: null, slot_index: null });
    renderHouse();
    showToast("STANDING UP");
    return;
  }

  const dx = Math.abs(p.x - t.x);
  const dy = Math.abs(p.y - t.y);

  // If already adjacent or on same spot, just do it
  if (dx + dy <= 1) {
    showSocialInteractionFX(kind === 'hug' ? '🫂' : '💋', true);
    return;
  }

  // Find best neighbor to walk to
  const grid = PathFinder.getCollisionGrid('player');
  const neighbors = [
    { x: t.x + 1, y: t.y }, { x: t.x - 1, y: t.y },
    { x: t.x, y: t.y + 1 }, { x: t.x, y: t.y - 1 }
  ];

  const walkable = neighbors.filter(n => grid[n.y] && grid[n.y][n.x] === 0);
  if (walkable.length === 0) {
    // No room to hug? Show heart anyway if close-ish or Toast
    showToast("NO CLEAR PATH TO HUG");
    return;
  }

  // Pick closest walkable to current player pos
  walkable.sort((a, b) => {
    const d1 = Math.abs(a.x - p.x) + Math.abs(a.y - p.y);
    const d2 = Math.abs(b.x - p.x) + Math.abs(b.y - p.y);
    return d1 - d2;
  });

  const goal = walkable[0];
  let path = PathFinder.findPath({ x: p.x, y: p.y }, goal, 'player', false);
  if (path.length === 0) {
    path = PathFinder.findPath({ x: p.x, y: p.y }, goal, 'player', true);
    if (path.length === 0) {
      showToast("NO CLEAR PATH TO PARTNER");
      return;
    }
  }

  if (path.length > 1) {
    p.path = path.slice(1);
    movePlayerAlongPath('player', () => {
      showSocialInteractionFX(kind === 'hug' ? '🫂' : '💋', true);
    });
  } else {
    showSocialInteractionFX(kind === 'hug' ? '🫂' : '💋', true);
  }
}

function showSocialMenu(x, y) {
  // Remove any existing
  document.getElementById('social-popup-menu')?.remove();

  const menu = document.createElement('div');
  menu.id = 'social-popup-menu';
  menu.style.cssText = `position:fixed; left:${x}px; top:${y}px; z-index:10000; background:white; border:2px solid black; padding:4px; display:flex; flex-direction:column; gap:4px; font-family:var(--font-display);`;

  const items = [
    { label: '🫂 HUG', kind: 'hug' },
    { label: '💋 KISS', kind: 'kiss' }
  ];

  // Check if standing on a chair/sofa
  const p = HOUSE_STATE.player;
  const furnitureUnder = HOUSE_STATE.furniture.find(f => f.x === p.x && f.y === p.y);
  const fCfg = (CONFIG.FURNITURE || []).find(it => it.id === furnitureUnder?.config_id);

  if (fCfg && (fCfg.interaction === 'sit' || fCfg.attachmentPoints)) {
    if (!p.parent_id) {
      items.push({ label: '🪑 SIT HERE', kind: 'sit' });
    } else {
      items.push({ label: '🚶 STAND UP', kind: 'stand' });
    }
  }

  items.forEach(it => {
    const btn = document.createElement('button');
    btn.textContent = it.label;
    btn.style.cssText = 'padding:4px 8px; cursor:pointer; background:var(--color-base); border:1px solid var(--color-dark); font-size:var(--font-size-title); font-weight:bold;';
    btn.onclick = () => {
      initiateSocialAction(it.kind);
      menu.remove();
    };
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  const closeMenu = (e) => { if (e.target.closest('#social-popup-menu')) return; menu.remove(); window.removeEventListener('mousedown', closeMenu); };
  setTimeout(() => window.addEventListener('mousedown', closeMenu), 10);
}

function startRoamTimer(charId) {
  const char = HOUSE_STATE[charId];
  if (!char) return;
  if (char.roamTimer) clearTimeout(char.roamTimer);
  if (HOUSE_STATE.isInteracting) return;

  // Roam after 5-15 seconds of idleness
  const delay = 5000 + Math.random() * 10000;
  char.roamTimer = setTimeout(() => roamAction(charId), delay);
}

function roamAction(charId) {
  const char = HOUSE_STATE[charId];
  if (char.isMoving || HOUSE_STATE.blueprintMode) {
    startRoamTimer(charId);
    return;
  }

  const grid = PathFinder.getCollisionGrid(charId);

  const activeRoom = HOUSE_STATE.rooms[0] || { grid_size: [20, 20] };
  const [rW, rH] = activeRoom.grid_size || [20, 20];

  // Pick a random walkable tile within 5 tiles range
  let tx, ty, attempts = 0;
  do {
    tx = char.x + Math.floor(Math.random() * 11) - 5;
    ty = char.y + Math.floor(Math.random() * 11) - 5;
    attempts++;
  } while (
    (tx < 0 || tx >= rW || ty < 0 || ty >= rH || grid[ty] === undefined || grid[ty][tx] === 1)
    && attempts < 20
  );

  if (attempts < 20) {
    const path = PathFinder.findPath({ x: char.x, y: char.y }, { x: tx, y: ty }, charId);
    if (path.length > 1) {
      char.path = path.slice(1);
      movePlayerAlongPath(charId);
    } else {
      startRoamTimer(charId);
    }
  } else {
    startRoamTimer(charId);
  }
}

// Start roaming for your OWN character only at boot
if (!DISABLE_HOUSE) {
  setTimeout(() => {
    startRoamTimer('player');
  }, 5000);

  // Block 7.8: Tab Visibility Sync
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log("[House] Tab woke up — sending position sync");
      const p = HOUSE_STATE.player;
      wsSend(WS_EV.C_CHAR_MOVE, { userId: STATE.user.id, x: p.x, y: p.y, charId: 'partner' });
    }
  });
}

// ── Drag Logic (Block 5.3 + 5.5) ───────────────────────────
function handleDragStart(e, id) {
  if (e.button !== 0 && e.button !== undefined) return; // Left click only (allow touch undefined button)

  if (HOUSE_STATE.lockedFurniture.has(String(id))) {
    console.log("[Locks] Blocking drag start for", id);
    showToast("PARTNER IS MOVING THIS ITEM");
    return;
  }

  const item = HOUSE_STATE.furniture.find(p => p.id === id);
  if (!item) return;

  // Optimistic lock
  wsSend(WS_EV.C_FURNITURE_LOCK, { itemId: id });

  HOUSE_STATE._drag = {
    active: true,
    itemId: id,
    startX: e.clientX,
    startY: e.clientY,
    originalX: item.x,
    originalY: item.y
  };

  document.getElementById(id)?.classList.add('dragging');
}

function handleDragMove(e) {
  if (!HOUSE_STATE._drag.active) return;

  const isDraft = HOUSE_STATE.blueprintMode;
  const room = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
  const rCols = room.width || room.grid_size?.[0] || 10;
  const rRows = room.height || room.grid_size?.[1] || 10;

  // Convert raw screen drag delta → tile delta
  // ISO: dragging diagonally maps to x+y axes
  const sdx = (e.clientX - HOUSE_STATE._drag.startX) / VIEW_SCALE;
  const sdy = (e.clientY - HOUSE_STATE._drag.startY) / VIEW_SCALE;

  let tileDX, tileDY;
  if (isDraft) {
    tileDX = Math.round(sdx / 32);
    tileDY = Math.round(sdy / 32);
  } else {
    // ISO inverse: screen delta → tile delta (symmetric rounding)
    const isoD = ISO.fromScreenDelta(sdx, sdy);
    tileDX = isoD.x;
    tileDY = isoD.y;
  }

  const parent = HOUSE_STATE.furniture.find(p => p.id === HOUSE_STATE._drag.itemId);
  if (!parent) return;

  const cfg = (CONFIG.FURNITURE || []).find(f => f.id === parent.config_id);
  let size = cfg?.size || [1, 1];
  if (parent.dir % 2 !== 0) size = [size[1], size[0]];

  const nextX = Math.max(0, Math.min(rCols - size[0], HOUSE_STATE._drag.originalX + tileDX));
  const nextY = Math.max(0, Math.min(rRows - size[1], HOUSE_STATE._drag.originalY + tileDY));

  const actualDX = nextX - parent.x;
  const actualDY = nextY - parent.y;

  if (actualDX !== 0 || actualDY !== 0) {
    const isValid = canPlaceItem(parent, nextX, nextY, parent.dir);
    parent.x = nextX;
    parent.y = nextY;
    moveDescendants(parent.id, actualDX, actualDY);

    // Ghost positioning
    const ghost = document.getElementById('house-ghost');
    if (ghost) {
      ghost.style.display = 'block';
      ghost.classList.toggle('ghost-invalid', !isValid);

      if (isDraft) {
        ghost.style.left = (parent.x * 32) + 'px';
        ghost.style.top = (parent.y * 32) + 'px';
        ghost.style.width = (size[0] * 32) + 'px';
        ghost.style.height = (size[1] * 32) + 'px';
        ghost.style.clipPath = 'none';
        ghost.style.outline = '2px dashed var(--color-tertiary)';
      } else {
        const isoOriginX = rRows * (ISO.TW / 2);
        const { px, py } = ISO.toScreen(parent.x, parent.y);
        const gW = (size[0] + size[1]) * (ISO.TW / 2);
        const gH = (size[0] + size[1]) * (ISO.TH / 2);
        ghost.style.left = (isoOriginX + px - size[1] * (ISO.TW / 2)) + 'px';
        ghost.style.top = (ISO.WALL_H + py) + 'px';
        ghost.style.width = gW + 'px';
        ghost.style.height = gH + 'px';
        const rW = (size[0] / (size[0] + size[1])) * 100;
        const rH = (size[1] / (size[0] + size[1])) * 100;
        ghost.style.clipPath = `polygon(${rH}% 0%, 100% ${rW}%, ${rW}% 100%, 0% ${rH}%)`;
        ghost.style.outline = 'none';
      }
    }

    // Update the dragged item's visual position immediately
    const el = document.getElementById(parent.id);
    if (el) {
      if (isDraft) {
        el.style.left = (parent.x * 32) + 'px';
        el.style.top = (parent.y * 32) + 'px';
        el.style.zIndex = (parent.y * 10) + 100;
      } else {
        const isoOriginX = rRows * (ISO.TW / 2);
        const { px, py } = ISO.toScreen(parent.x, parent.y);
        const elW = (size[0] + size[1]) * (ISO.TW / 2);
        el.style.left = (isoOriginX + px - size[1] * (ISO.TW / 2)) + 'px';
        el.style.top = (ISO.WALL_H + py - 32) + 'px';
        el.style.zIndex = (parent.x + parent.y) * 10 + 100;
      }
    }
  }
}

// Helper functions for Block 6.5
function moveDescendants(parentId, dx, dy) {
  const isDraft = HOUSE_STATE.blueprintMode;
  const room = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
  const rRows = room.height || room.grid_size?.[1] || 10;
  const isoOriginX = rRows * (ISO.TW / 2);

  const children = HOUSE_STATE.furniture.filter(p => p.parent_id === parentId);
  children.forEach(child => {
    child.x += dx;
    child.y += dy;
    const childEl = document.getElementById(child.id);
    if (childEl) {
      const config = (CONFIG.FURNITURE || []).find(f => f.id === child.config_id);
      const parent = HOUSE_STATE.furniture.find(p => p.id === child.parent_id);
      const parentCfg = (CONFIG.FURNITURE || []).find(f => f.id === parent?.config_id);

      let offsetX = 0;
      let offsetY = 0;
      if (parentCfg) {
        if (child.slot_index !== null && child.slot_index !== undefined && parentCfg.attachmentPoints?.[child.slot_index]) {
          const pt = parentCfg.attachmentPoints[child.slot_index];
          offsetX = pt.x || 0;
          offsetY = isDraft ? 0 : (pt.y || 0);
        } else if (parentCfg.isSurface) {
          offsetY = isDraft ? 0 : -12;
        }
      }

      if (isDraft) {
        childEl.style.left = (child.x * 32 + offsetX) + 'px';
        childEl.style.top = (child.y * 32 + offsetY) + 'px';
        childEl.style.zIndex = (child.y * 10) + 105;
      } else {
        const frontX = child.x + 1; // tabletop is usually 1x1
        const frontY = child.y + 1;
        const { px, py } = ISO.toScreen(frontX, frontY);
        childEl.style.left = (isoOriginX + px + offsetX) + 'px';
        childEl.style.top = (ISO.WALL_H + py + offsetY) + 'px';
        childEl.style.zIndex = (child.x + child.y) * 10 + 105;
      }
    }
    moveDescendants(child.id, dx, dy);
  });
}

function getDescendantIds(parentId, set = new Set()) {
  const children = HOUSE_STATE.furniture.filter(p => p.parent_id === parentId);
  children.forEach(child => {
    set.add(child.id);
    getDescendantIds(child.id, set);
  });
  return set;
}

async function handleDragEnd() {
  if (!HOUSE_STATE._drag.active) return;

  const ghost = document.getElementById('house-ghost');
  if (ghost) ghost.style.display = 'none';

  const item = HOUSE_STATE.furniture.find(p => p.id === HOUSE_STATE._drag.itemId);
  const config = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);

  if (item && config.type === 'tabletop') {
    const others = HOUSE_STATE.furniture.filter(p => p.id !== item.id);
    let bestSurface = null;
    for (const other of others) {
      const otherCfg = (CONFIG.FURNITURE || []).find(f => f.id === other.config_id);
      if (!otherCfg || !otherCfg.isSurface) continue;

      let oSize = otherCfg.size || [1, 1];
      if (other.dir % 2 !== 0) oSize = [oSize[1], oSize[0]];

      if (item.x >= other.x && item.x < other.x + oSize[0] &&
        item.y >= other.y && item.y < other.y + oSize[1]) {
        bestSurface = other;
        break;
      }
    }

    if (bestSurface) {
      item.parent_id = bestSurface.id;
      const pCfg = (CONFIG.FURNITURE || []).find(f => f.id === bestSurface.config_id);
      if (pCfg.attachmentPoints && pCfg.attachmentPoints.length > 0) {
        // Smart Snapping: If 2-tiles wide, use X to choose slot 
        let oSize = pCfg.size || [1, 1];
        if (bestSurface.dir % 2 !== 0) oSize = [oSize[1], oSize[0]];

        if (oSize[0] > 1) {
          // Determine slot by which tile we are on relative to parent start
          const relX = item.x - bestSurface.x;
          item.slot_index = Math.min(relX, pCfg.attachmentPoints.length - 1);
        } else {
          item.slot_index = 0;
        }
      } else {
        item.slot_index = null;
      }
    } else {
      item.parent_id = null;
      item.slot_index = null;
    }
  }

  // ── Collision / Snap Back Check ────────────────────────
  const isValid = canPlaceItem(item, item.x, item.y, item.dir);
  if (!isValid) {
    showToast("INVALID PLACEMENT: COLLISION");
    const dx = HOUSE_STATE._drag.originalX - item.x;
    const dy = HOUSE_STATE._drag.originalY - item.y;
    item.x = HOUSE_STATE._drag.originalX;
    item.y = HOUSE_STATE._drag.originalY;
    moveDescendants(item.id, dx, dy);

    HOUSE_STATE._drag.active = false;
    HOUSE_STATE._drag.itemId = null;
    HOUSE_STATE._drag.justDropped = true;
    setTimeout(() => HOUSE_STATE._drag.justDropped = false, 100);
    renderHouse();
    return;
  }

  // ── Persistence Sync (Block 6.2) ──────────────────
  if (item) {
    const children = getDescendantIds(item.id);
    const syncPromises = [syncHouseItem(item)];

    for (const childId of children) {
      const childObj = HOUSE_STATE.furniture.find(p => p.id === childId);
      if (childObj) syncPromises.push(syncHouseItem(childObj));
    }

    await Promise.all(syncPromises);
  }

  const el = document.getElementById(HOUSE_STATE._drag.itemId);
  if (el) el.classList.remove('dragging');

  // Release lock
  wsSend(WS_EV.C_FURNITURE_UNLOCK, { itemId: HOUSE_STATE._drag.itemId });

  HOUSE_STATE._drag.active = false;
  HOUSE_STATE._drag.itemId = null;
  HOUSE_STATE._drag.justDropped = true;
  setTimeout(() => HOUSE_STATE._drag.justDropped = false, 100);

  // Auto-nudge character if blocked after move
  relocateToSafeSpawn('player', HOUSE_STATE.player.x, HOUSE_STATE.player.y);
  relocateToSafeSpawn('partner', HOUSE_STATE.partner.x, HOUSE_STATE.partner.y);

  renderHouse();
}

// ── Persistence Helpers ─────────────────────────────
function syncHouseItem(item) {
  console.log("[House] Sending furniture update:", item.id);
  wsSend(WS_EV.C_HOUSE_UPDATE, {
    action: 'place',
    userId: STATE.user.id,
    item: {
      id: item.id,
      room_id: 'default_room',
      item_id: item.config_id || item.item_id,
      config_id: item.config_id || item.item_id,
      x: item.x,
      y: item.y,
      dir: item.dir || 0,
      parent_id: item.parent_id || null,
      slot_index: item.slot_index !== undefined ? item.slot_index : null
    }
  });
}

function removeHouseItem(id) {
  wsSend(WS_EV.C_HOUSE_UPDATE, { action: 'remove', item: { id } });
}

// ── Helper Logic ────────────────────────────────────
function canPlaceItem(item, x, y, dir) {
  const config = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);
  if (!config) return true;
  let size = config.size || [1, 1];
  if (dir % 2 !== 0) size = [size[1], size[0]];

  // Check against all other items
  for (const other of HOUSE_STATE.furniture) {
    if (other.id === item.id) continue;
    // Children/Parents ignore collisions with each other for stacking
    if (other.id === item.parent_id || item.id === other.parent_id) continue;

    const otherCfg = (CONFIG.FURNITURE || []).find(f => f.id === other.config_id);
    if (!otherCfg) continue;
    let otherSize = otherCfg.size || [1, 1];
    if (other.dir % 2 !== 0) otherSize = [otherSize[1], otherSize[0]];

    // Box collision
    const overlap = (x < other.x + otherSize[0] &&
      x + size[0] > other.x &&
      y < other.y + otherSize[1] &&
      y + size[1] > other.y);

    if (overlap) {
      // Special Exception: Tabletop on Surface
      if (config.type === 'tabletop' && otherCfg.isSurface) continue;
      if (otherCfg.type === 'tabletop' && config.isSurface) continue;

      // Special Exception: Allow placing over rugs or other non-blocking items
      if (otherCfg.canPlaceOver) continue;

      return false; // Collision!
    }
  }
  return true;
}

// ── 3. ANIMATION LOOP (rAF) ───────────────────────────
function animateHouse() {
  if (HOUSE_STATE._needsRender) {
    syncRenderHouse();
    HOUSE_STATE._needsRender = false;
  }
  requestAnimationFrame(animateHouse);
}

// Start loop
if (!DISABLE_HOUSE) {
  animateHouse();
}

