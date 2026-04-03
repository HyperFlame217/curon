    // ════════════════════════════════════════════════════════════
    //  ISO ENGINE CONSTANTS & HELPERS (Block 1)
    // ════════════════════════════════════════════════════════════
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
    window.addEventListener('resize', recalcViewScale);

    // ════════════════════════════════════════════════════════════
    //  HOUSE SYSTEM (Block 4.5 + 5)
    // ════════════════════════════════════════════════════════════
    const HOUSE_STATE = {
      blueprintMode: false,
      inventoryOpen: false,
      rooms: [],      // From rooms.json + DB overrides
      placement: [],  // [{ id, config_id, x, y, z }]
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
        selectedId: null
      }
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
      renderHouse();
    }

    async function initHouseSystem() {
      // Character Assignment
      if (STATE.user && STATE.user.id != STATE.userAId) {
        HOUSE_STATE.player.outfit = ['👧'];
        HOUSE_STATE.partner.outfit = ['🚶'];
        HOUSE_STATE.player.x = 5; HOUSE_STATE.player.y = 5;
        HOUSE_STATE.partner.x = 0; HOUSE_STATE.partner.y = 0;
      }

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

      // Load initial data, then apply scale
      await refreshHouseData();
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
      const placedIds = new Set(HOUSE_STATE.placement.map(p => p.config_id));

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
      
      wsSend('room_update', {
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

    function getSpriteHTML(val) {
      if (!val) return '❓';
      if (val.includes('.') || val.includes('/')) {
        return `<img src="${val}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;">`;
      }
      return val; // It's an emoji/text
    }

    async function refreshHouseData() {
      try {
        const res = await fetch('/house', {
          headers: { Authorization: `Bearer ${STATE.token}` }
        });
        const data = await res.json();

        // 1. Load Rooms (Merge DB overrides into CONFIG.ROOMS)
        const configRooms = CONFIG.ROOMS || [];
        const dbRooms = data.rooms || [];
        console.log("[House] Loaded DB Rooms:", dbRooms);
        
        HOUSE_STATE.rooms = configRooms.map(cRoom => {
          const dbRoom = dbRooms.find(r => r.id === cRoom.id);
          if (dbRoom) {
            console.log(`[House] Overriding room ${cRoom.id} with DB traits`);
            return {
              ...cRoom,
              wall_sprite: dbRoom.wall_sprite !== null ? dbRoom.wall_sprite : cRoom.wall_sprite,
              floor_sprite: dbRoom.floor_sprite !== null ? dbRoom.floor_sprite : cRoom.floor_sprite
            };
          }
          return cRoom;
        });

        // 2. Load Furniture
        HOUSE_STATE.placement = (data?.placement || []).map(p => ({
          ...p,
          config_id: p.item_id, 
          dir: p.dir || 0
        }));

        renderHouse();
      } catch (e) {
        console.error("[House] Load failed", e);
        HOUSE_STATE.rooms = CONFIG.ROOMS || [{ id: 'default_room', name: 'Main Room', grid_size: [10, 10] }];
        renderHouse();
      }
    }

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

      HOUSE_STATE.placement.push(newItem);
      renderHouse();
      renderInventory();
      HOUSE_STATE._drag.selectedId = newItem.id;
      await syncHouseItem(newItem);
    }

    function renderHouse() {
      const container = document.getElementById('house-grid');
      if (!container) return;

      const isDraft = HOUSE_STATE.blueprintMode;
      const activeRoom = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
      const cols = activeRoom.width  || activeRoom.grid_size?.[0] || 10;
      const rows = activeRoom.height || activeRoom.grid_size?.[1] || 10;

      // ── Container sizing ─────────────────────────────────────
      if (isDraft) {
        container.style.width  = (cols * 32) + 'px';
        container.style.height = (rows * 32) + 'px';
        container.style.gridTemplateColumns = `repeat(${cols}, 32px)`;
        container.style.gridTemplateRows    = `repeat(${rows}, 32px)`;
        container.style.display = 'grid';
      } else {
        const { w, h } = ISO.roomBounds(cols, rows);
        container.style.width  = w + 'px';
        container.style.height = h + 'px';
        container.style.display = 'block';
      }

      // ISO origin — the top-centre of the room diamond, offset down by wall height
      const isoOriginX = rows * (ISO.TW / 2);  // horizontal offset to centre
      const isoOriginY = ISO.WALL_H;            // leave room for walls above

      container.innerHTML = '<div id="house-ghost"></div>';

      // ── 1. FLOOR TILES ───────────────────────────────────────
      const floorTex = activeRoom.floor_sprite || activeRoom.floorTexture || null;
      for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
          const tile = document.createElement('div');

          if (isDraft) {
            tile.className = 'house-tile draft-tile';
            tile.dataset.x = tx;
            tile.dataset.y = ty;
          } else {
            tile.className = 'house-tile';
            const { px, py } = ISO.toScreen(tx, ty);
            tile.style.left = (isoOriginX + px - ISO.TW / 2) + 'px';
            tile.style.top  = (isoOriginY + py) + 'px';
            tile.dataset.x = tx;
            tile.dataset.y = ty;
            if (floorTex) {
              const isUrl = floorTex.includes('.') || floorTex.includes('/');
              if (isUrl) {
                tile.style.backgroundImage  = `url('${floorTex}')`;
                tile.style.backgroundSize   = 'cover';
                tile.style.backgroundRepeat = 'no-repeat';
              } else {
                // Emoji-based tile — render as text overlay
                tile.style.fontSize = '20px';
                tile.style.display = 'flex';
                tile.style.alignItems = 'center';
                tile.style.justifyContent = 'center';
                tile.textContent = floorTex;
              }
              tile.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
            }
          }
          container.appendChild(tile);
        }
      }

      // ── 2. WALLS (ISO only) ──────────────────────────────────
      if (!isDraft) {
        const wallTex = activeRoom.wall_sprite || activeRoom.wallTexture || null;
        const wallH = ISO.WALL_H;

        // Helper: convert emoji to a tiled SVG background-image
        function emojiToWallBg(emoji, cellW, cellH) {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellH}">
            <text x="50%" y="70%" font-size="${Math.min(cellW, cellH) * 0.7}" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
          </svg>`;
          return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        }

        // North face: full span from (0,0) → (cols,0)
        const segN = document.createElement('div');
        segN.className = 'house-wall-n';
        segN.style.left   = isoOriginX + 'px';
        segN.style.top    = (isoOriginY - wallH) + 'px';
        segN.style.width  = (cols * (ISO.TW / 2)) + 'px';
        segN.style.height = wallH + 'px';
        segN.style.transform = 'skewY(26.57deg)';
        segN.style.transformOrigin = 'top left';
        if (wallTex) {
          const isWallUrl = wallTex.includes('.') || wallTex.includes('/');
          if (isWallUrl) {
            segN.style.backgroundImage = `url('${wallTex}')`;
            segN.style.backgroundSize = `${ISO.TW/2}px 100%`;
          } else {
            segN.style.backgroundImage = emojiToWallBg(wallTex, ISO.TW / 2, wallH / 2);
            segN.style.backgroundRepeat = 'repeat';
            segN.style.backgroundSize = `${ISO.TW/2}px ${wallH/2}px`;
          }
        }
        container.appendChild(segN);

        // West face: full span from (0,0) → (0,rows)
        const segW = document.createElement('div');
        segW.className = 'house-wall-w';
        segW.style.left   = (isoOriginX - rows * (ISO.TW / 2)) + 'px';
        segW.style.top    = (isoOriginY - wallH) + 'px';
        segW.style.width  = (rows * (ISO.TW / 2)) + 'px';
        segW.style.height = wallH + 'px';
        segW.style.transform = 'skewY(-26.57deg)';
        segW.style.transformOrigin = 'top right';
        if (wallTex) {
          const isWallUrl = wallTex.includes('.') || wallTex.includes('/');
          if (isWallUrl) {
            segW.style.backgroundImage = `url('${wallTex}')`;
            segW.style.backgroundSize = `${ISO.TW/2}px 100%`;
          } else {
            segW.style.backgroundImage = emojiToWallBg(wallTex, ISO.TW / 2, wallH / 2);
            segW.style.backgroundRepeat = 'repeat';
            segW.style.backgroundSize = `${ISO.TW/2}px ${wallH/2}px`;
          }
        }
        container.appendChild(segW);
      }

      // ── 3. FURNITURE ─────────────────────────────────────────
      // Depth sort: x+y for ISO (items deeper in screen drawn first)
      const sorted = [...HOUSE_STATE.placement].sort((a, b) => {
        if (a.id === b.parent_id) return -1;
        if (b.id === a.parent_id) return 1;
        return (a.x + a.y) - (b.x + b.y);
      });

      sorted.forEach(item => {
        const config = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);
        if (!config) return;

        const el = document.createElement('div');
        el.className = 'house-item';
        if (HOUSE_STATE._drag.itemId === item.id) el.classList.add('dragging');
        el.id = item.id;

        // ── Sprite selection ──────────────────────────────────
        let spriteVal = '❓';
        let useCssRotation = false;

        if (config.assets) {
          if (isDraft && config.assets.top) {
            // Drafting mode: show top-down blueprint sprite
            spriteVal = config.assets.top;
            useCssRotation = true; // Native CSS rotation is permitted for flat blueprints
          } else if (config.assets.iso) {
            // ISO mode: show directional sprite for current rotation
            const isoAssets = config.assets.iso;
            spriteVal = Array.isArray(isoAssets)
              ? (isoAssets[item.dir || 0] || isoAssets[0])
              : isoAssets;
            useCssRotation = false; // ISO sprites must be pre-drawn, never CSS rotated
          }
        }

        el.innerHTML = `
          ${getSpriteHTML(spriteVal)}
          <div class="house-item-actions">
            <div class="action-handle rotate-btn">🔄</div>
            <div class="action-handle danger delete-btn">🗑</div>
          </div>
        `;

        if (HOUSE_STATE._drag.selectedId === item.id) el.classList.add('selected');

        // ── Size (swap w/h on 90° or 270° rotation) ───────────
        let size = config.size || [1, 1];
        if (item.dir % 2 !== 0) size = [size[1], size[0]];

        // ── Positioning ───────────────────────────────────────
        let drawX, drawY, zBase;

        if (isDraft) {
          const { px, py } = ISO.toScreenDraft(item.x, item.y);
          drawX = px;
          drawY = py;
          zBase = item.y * 10;
          // In draft mode use exact grid-aligned sizes
          el.style.width  = (size[0] * 32) + 'px';
          el.style.height = (size[1] * 32) + 'px';
        } else {
          // ISO mode: anchor to the front-bottom of the footprint diamond
          // The "front" corner of a [w,d] footprint in ISO space is at tile (x+w, y+d)
          const frontX = item.x + size[0];
          const frontY = item.y + size[1];
          const { px, py } = ISO.toScreen(frontX, frontY);
          // Place the element so its bottom-center lands exactly on the front corner
          drawX = isoOriginX + px;
          drawY = isoOriginY + py;
          zBase = (item.x + item.y) * 10;
          // Let the sprite shrink-wrap naturally around its content
          el.style.width  = 'max-content';
          el.style.height = 'max-content';
          // Bottom-center anchor: shift left 50% and upward 100% from the anchor point
          el.style.transform = 'translate(-50%, -100%)';
        }

        // ── Visual Offset & Snapping (Block 20.3) ───────────────
        let offsetX = 0;
        let offsetY = 0;

        if (item.parent_id) {
          const parent = HOUSE_STATE.placement.find(p => p.id === item.parent_id);
          const parentCfg = (CONFIG.FURNITURE || []).find(f => f.id === parent?.config_id);
          
          if (parentCfg) {
            // Priority 1: Specific slot defined in the parent
            if (item.slot_index !== null && item.slot_index !== undefined && parentCfg.attachmentPoints?.[item.slot_index]) {
              const pt = parentCfg.attachmentPoints[item.slot_index];
              offsetX = pt.x || 0;
              offsetY = isDraft ? 0 : (pt.y || 0); // Ignore height in blueprint view
            } 
            // Priority 2: Generic surface height
            else if (parentCfg.isSurface) {
              offsetY = isDraft ? 0 : -12; // Ignore height in blueprint view
            }
          }
        }

        el.style.left    = (drawX + offsetX) + 'px';
        el.style.top     = (drawY + offsetY) + 'px';
        el.style.fontSize = '32px';
        el.style.zIndex  = zBase + (item.parent_id ? 105 : 100);

        // Interaction
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

        el.querySelector('.rotate-btn').addEventListener('mousedown', (e) => {
          e.stopPropagation(); e.preventDefault();
          handleRotateItem(item.id);
        });

        el.querySelector('.delete-btn').addEventListener('mousedown', async (e) => {
          e.stopPropagation(); e.preventDefault();
          if (confirm(`REMOVE ${config.name.toUpperCase()} AND ALL ITS CHILDREN?`)) {
            const idsToRemove = getDescendantIds(item.id);
            idsToRemove.add(item.id);
            await Promise.all([...idsToRemove].map(id => removeHouseItem(id)));
            HOUSE_STATE.placement = HOUSE_STATE.placement.filter(p => !idsToRemove.has(p.id));
            renderHouse();
            renderInventory();
          }
        });

        // CSS rotation only for emoji/single-sprite items in drafting mode
        if (useCssRotation && isDraft && item.dir !== 0) {
          el.style.transform = `rotateZ(${item.dir * 90}deg)`;
        }

        container.appendChild(el);
      });

      renderCharacters();
    }

    function renderCharacters() {
      const container = document.getElementById('house-grid');
      if (!container) return;

      // Hide characters in drafting mode
      if (HOUSE_STATE.blueprintMode) {
        document.querySelectorAll('.house-player').forEach(p => p.style.display = 'none');
        return;
      }

      const activeRoom = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
      const cols = activeRoom.width  || activeRoom.grid_size?.[0] || 10;
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

        // Multi-layer outfit rendering
        pEl.innerHTML = (char.outfit || []).map((layer, idx) => {
          if (typeof layer === 'string' && (layer.startsWith('data:') || layer.startsWith('http'))) {
            return `<div class="char-layer" style="z-index:${idx}"><img src="${layer}" style="width:32px;height:64px;object-fit:contain;image-rendering:pixelated;"></div>`;
          }
          return `<div class="char-layer" style="z-index:${idx};font-size:28px;">${layer}</div>`;
        }).join('');

        pEl.style.display = 'flex';

        // ── Visual Offset & Snapping (Characters) ───────────────
        let offsetX = 0;
        let offsetY = 0;

        if (char.parent_id) {
          const parent = HOUSE_STATE.placement.find(p => p.id === char.parent_id);
          const parentCfg = (CONFIG.FURNITURE || []).find(f => f.id === parent?.config_id);
          
          if (parentCfg) {
            if (char.slot_index !== null && char.slot_index !== undefined && parentCfg.attachmentPoints?.[char.slot_index]) {
              const pt = parentCfg.attachmentPoints[char.slot_index];
              offsetX = pt.x || 0;
              offsetY = pt.y || 0;
            } else {
              offsetY = -12; // Default sitting height
            }
          }
        }

        // ISO position — anchor feet to the tile origin point
        const { px, py } = ISO.toScreen(char.x, char.y);
        // Character sprite (32x64) centred on the tile's top point
        pEl.style.left   = (isoOriginX + px - 16 + offsetX) + 'px';  // -16 to centre 32px sprite
        pEl.style.top    = (isoOriginY + py - 32 + offsetY) + 'px';  // -32 so feet sit on tile

        // Z-sort by x+y (same rule as furniture) + sitting depth boost
        pEl.style.zIndex = (char.x + char.y) * 10 + (char.parent_id ? 115 : 110);

        // Social context menu (partner only)
        if (id === 'them') {
          pEl.style.cursor = 'pointer';
          let lpTimer = null;
          const triggerSoc = (x, y) => showSocialMenu(x, y);
          pEl.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); triggerSoc(e.clientX, e.clientY); };
          pEl.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            lpTimer = setTimeout(() => { triggerSoc(touch.clientX, touch.clientY); lpTimer = null; }, 600);
          }, { passive: true });
          pEl.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
        }
      };

      drawChar('me', HOUSE_STATE.player);
      drawChar('them', HOUSE_STATE.partner);
    }

    async function handleRotateItem(id) {
      const item = HOUSE_STATE.placement.find(p => p.id === id);
      if (!item) return;
      item.dir = (item.dir + 1) % 4;
      renderHouse();
      await syncHouseItem(item);
      showToast("ROTATED FURNITURE");
    }

    // 🧮 A* Pathfinding Logic (Block 7.1)
    const PathFinder = {
      findPath(start, end, excludeCharId) {
        const grid = this.getCollisionGrid(excludeCharId);
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
            if (grid[neighbor.y][neighbor.x] === 1) continue; // Blocked by furniture
            if (closedSet.has(`${neighbor.x},${neighbor.y}`)) continue;

            const gScore = current.g + 1;
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
      getCollisionGrid(excludeCharId) {
        const room = HOUSE_STATE.rooms[0] || { grid_size: [20, 20] };
        const [cols, rows] = room.grid_size || [20, 20];
        const grid = Array.from({ length: rows }, () => Array(cols).fill(0));

        HOUSE_STATE.placement.forEach(item => {
          const cfg = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);
          if (!cfg) return;

          // Items that block characters:
          // 1. Floor items that AREN'T explicitly walkable (like rugs)
          // 2. Tabletop items that are on the floor (no parent) and AREN'T walkable
          const isBlocking = (cfg.type === 'floor' && !cfg.isWalkable) || 
                             (cfg.type === 'tabletop' && !item.parent_id && !cfg.isWalkable);
          
          if (!isBlocking) return;

          let [w, h] = cfg.size || [1, 1];
          if (item.dir % 2 !== 0) [w, h] = [h, w];
          for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
              const ty = item.y + r;
              const tx = item.x + c;
              if (ty >= 0 && ty < rows && tx >= 0 && tx < cols) grid[ty][tx] = 1;
            }
          }
        });

        // Add other characters as obstacles (Block 7.6)
        ['player', 'partner'].forEach(id => {
          if (id !== excludeCharId) {
            const c = HOUSE_STATE[id];
            if (c && c.y >= 0 && c.y < rows && c.x >= 0 && c.x < cols) grid[c.y][c.x] = 1;
          }
        });

        return grid;
      }
    };

    function handleRoomClick(e) {
      if (HOUSE_STATE.blueprintMode || HOUSE_STATE._drag.active) return;
      if (e.target.closest('.house-item')) return;

      // Clear selection
      if (HOUSE_STATE._drag.selectedId) {
        HOUSE_STATE._drag.selectedId = null;
        renderHouse();
      }

      const room = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
      const rCols = room.width  || room.grid_size?.[0] || 10;
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
        const rect   = gridEl.getBoundingClientRect();
        const isoOriginX = rRows * (ISO.TW / 2);
        // Pixel relative to grid element, then subtract the ISO origin
        const relX = (e.clientX - rect.left)  / VIEW_SCALE - isoOriginX;
        const relY = (e.clientY - rect.top)   / VIEW_SCALE - ISO.WALL_H;
        const hit  = ISO.fromScreen(relX, relY);
        tx = hit.x;
        ty = hit.y;
      }

      if (isNaN(tx) || isNaN(ty) || tx < 0 || tx >= rCols || ty < 0 || ty >= rRows) return;

      const char = HOUSE_STATE.player;
      if (char.roamTimer) clearTimeout(char.roamTimer);

      const grid = PathFinder.getCollisionGrid('player');
      if (grid[ty]?.[tx] === 1) return;

      const path = PathFinder.findPath({ x: char.x, y: char.y }, { x: tx, y: ty }, 'player');
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
          wsSend('presence_update', { userId: STATE.user.id, parent_id: null, slot_index: null });
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
            fetch('/auth/keys/char-pos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STATE.token}` },
              body: JSON.stringify({ x: char.x, y: char.y }),
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
           wsSend('char_move', { 
             userId: STATE.user.id, 
             x: char.x, 
             y: char.y, 
             charId: 'partner',
             parent_id: char.parent_id || null,
             slot_index: char.slot_index !== undefined ? char.slot_index : null
           });
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
          const isMaster = STATE.user.id == STATE.userAId;
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
         wsSend('social_interaction', { kind, userId: STATE.user.id });
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
      fx.style.top  = (ISO.WALL_H + py - 32) + 'px';

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
        const furnitureUnder = HOUSE_STATE.placement.find(f => f.x === p.x && f.y === p.y);
        if (furnitureUnder) {
           const fCfg = (CONFIG.FURNITURE || []).find(it => it.id === furnitureUnder.config_id);
           p.parent_id = furnitureUnder.id;
           // Use first available point if it exists
           p.slot_index = (fCfg && fCfg.attachmentPoints && fCfg.attachmentPoints.length > 0) ? 0 : null;
           p.path = [];
           if (p.moveTimeout) clearTimeout(p.moveTimeout);
           p.isMoving = false;
           
           wsSend('char_move', { 
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
        wsSend('presence_update', { userId: STATE.user.id, parent_id: null, slot_index: null });
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
      const path = PathFinder.findPath({ x: p.x, y: p.y }, goal, 'player');

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
      const furnitureUnder = HOUSE_STATE.placement.find(f => f.x === p.x && f.y === p.y);
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
        btn.style.cssText = 'padding:4px 8px; cursor:pointer; background:#f0f0f0; border:1px solid #ccc; font-size:10px; font-weight:bold;';
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
    setTimeout(() => {
      startRoamTimer('player');
    }, 5000);

    // Block 7.8: Tab Visibility Sync
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log("[House] Tab woke up — sending position sync");
        const p = HOUSE_STATE.player;
        wsSend('char_move', { userId: STATE.user.id, x: p.x, y: p.y, charId: 'partner' });
      }
    });

    // ── Drag Logic (Block 5.3 + 5.5) ───────────────────────────
    function handleDragStart(e, id) {
      if (e.button !== 0) return; // Left click only
      const item = HOUSE_STATE.placement.find(p => p.id === id);
      if (!item) return;

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
      const room    = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
      const rCols   = room.width  || room.grid_size?.[0] || 10;
      const rRows   = room.height || room.grid_size?.[1] || 10;

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

      const parent = HOUSE_STATE.placement.find(p => p.id === HOUSE_STATE._drag.itemId);
      if (!parent) return;

      const cfg  = (CONFIG.FURNITURE || []).find(f => f.id === parent.config_id);
      let size   = cfg?.size || [1, 1];
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
            ghost.style.left   = (parent.x * 32) + 'px';
            ghost.style.top    = (parent.y * 32) + 'px';
            ghost.style.width  = (size[0] * 32) + 'px';
            ghost.style.height = (size[1] * 32) + 'px';
            ghost.style.clipPath = 'none';
            ghost.style.outline = '2px dashed #638872';
          } else {
            const isoOriginX = rRows * (ISO.TW / 2);
            const { px, py } = ISO.toScreen(parent.x, parent.y);
            const gW = (size[0] + size[1]) * (ISO.TW / 2);
            const gH = (size[0] + size[1]) * (ISO.TH / 2);
            ghost.style.left   = (isoOriginX + px - size[1] * (ISO.TW / 2)) + 'px';
            ghost.style.top    = (ISO.WALL_H  + py) + 'px';
            ghost.style.width  = gW + 'px';
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
            el.style.left   = (parent.x * 32) + 'px';
            el.style.top    = (parent.y * 32) + 'px';
            el.style.zIndex = (parent.y * 10) + 100;
          } else {
            const isoOriginX = rRows * (ISO.TW / 2);
            const { px, py } = ISO.toScreen(parent.x, parent.y);
            const elW = (size[0] + size[1]) * (ISO.TW / 2);
            el.style.left   = (isoOriginX + px - size[1] * (ISO.TW / 2)) + 'px';
            el.style.top    = (ISO.WALL_H  + py - 32) + 'px';
            el.style.zIndex = (parent.x + parent.y) * 10 + 100;
          }
        }
      }
    }

    // Helper functions for Block 6.5
    function moveDescendants(parentId, dx, dy) {
      const isDraft    = HOUSE_STATE.blueprintMode;
      const room       = HOUSE_STATE.rooms[0] || { grid_size: [10, 10] };
      const rRows      = room.height || room.grid_size?.[1] || 10;
      const isoOriginX = rRows * (ISO.TW / 2);

      const children = HOUSE_STATE.placement.filter(p => p.parent_id === parentId);
      children.forEach(child => {
        child.x += dx;
        child.y += dy;
        const childEl = document.getElementById(child.id);
        if (childEl) {
          const config    = (CONFIG.FURNITURE || []).find(f => f.id === child.config_id);
          const parent    = HOUSE_STATE.placement.find(p => p.id === child.parent_id);
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
            childEl.style.left   = (child.x * 32 + offsetX) + 'px';
            childEl.style.top    = (child.y * 32 + offsetY) + 'px';
            childEl.style.zIndex = (child.y * 10) + 105;
          } else {
            const frontX = child.x + 1; // tabletop is usually 1x1
            const frontY = child.y + 1;
            const { px, py } = ISO.toScreen(frontX, frontY);
            childEl.style.left   = (isoOriginX + px + offsetX) + 'px';
            childEl.style.top    = (ISO.WALL_H  + py + offsetY) + 'px';
            childEl.style.zIndex = (child.x + child.y) * 10 + 105;
          }
        }
        moveDescendants(child.id, dx, dy);
      });
    }

    function getDescendantIds(parentId, set = new Set()) {
      const children = HOUSE_STATE.placement.filter(p => p.parent_id === parentId);
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

      const item = HOUSE_STATE.placement.find(p => p.id === HOUSE_STATE._drag.itemId);
      const config = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);

      if (item && config.type === 'tabletop') {
        const others = HOUSE_STATE.placement.filter(p => p.id !== item.id);
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
        renderHouse();
        return;
      }

      // ── Persistence Sync (Block 6.2) ──────────────────
      if (item) {
        const children = getDescendantIds(item.id);
        const syncPromises = [syncHouseItem(item)];

        for (const childId of children) {
          const childObj = HOUSE_STATE.placement.find(p => p.id === childId);
          if (childObj) syncPromises.push(syncHouseItem(childObj));
        }

        await Promise.all(syncPromises);
      }

      const el = document.getElementById(HOUSE_STATE._drag.itemId);
      if (el) el.classList.remove('dragging');

      HOUSE_STATE._drag.active = false;
      HOUSE_STATE._drag.itemId = null;
      renderHouse();
    }

    // ── Persistence Helpers ─────────────────────────────
    function syncHouseItem(item) {
      console.log("[House] Sending furniture update:", item.id);
      wsSend('house_update', {
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
      wsSend('house_update', { action: 'remove', item: { id } });
    }

    // ── Helper Logic ────────────────────────────────────
    function canPlaceItem(item, x, y, dir) {
      const config = (CONFIG.FURNITURE || []).find(f => f.id === item.config_id);
      if (!config) return true;
      let size = config.size || [1, 1];
      if (dir % 2 !== 0) size = [size[1], size[0]];

      // Check against all other items
      for (const other of HOUSE_STATE.placement) {
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
