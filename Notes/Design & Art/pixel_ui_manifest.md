# Pixel UI Asset Manifest — Curon

> What pixel art to make and what gets customized via `theme.css`.
> **Updated: 2026-05-11** — audit passed, icon count reduced from 61 → 47.

---

## Table of Contents

1. [Project Structure Reference](#1-project-structure-reference)
2. [Theme.css Customization](#2-themecss-customization)
3. [Icon Spritesheet](#3-icon-spritesheet)
4. [UI Elements Kept as CSS](#4-ui-elements-kept-as-css)
5. [Code Changes — New Files](#5-code-changes--new-files)
6. [Code Changes — Modified Files](#6-code-changes--modified-files)
7. [Implementation Order](#7-implementation-order)
8. [Sprite Sheet Layout Guide](#8-sprite-sheet-layout-guide)
9. [Theme Integration](#9-theme-integration)
10. [Checklist Summary](#10-checklist-summary)

---

## 1. Project Structure Reference

```
client/
  assets/                          ← spritesheets live here
    themes/
      classic/
        icons.png                   ← all pixel art UI icons (47 icons)
  css/
    theme.css                       ← MODIFY — add sprite path var + customization tokens
    main.css                        ← no structural changes needed
    icons.css                       ← already wired (v1 in index.html)
  js/
    AssetManager.js                 ← already wired (v1 in index.html, boot.js preloads it)
    boot.js                         ← AssetManager.preload() already in place
    chat.js                         ← MODIFY — replace emoji with icon spans
    search.js                       ← MODIFY — replace emoji
    emojis.js                       ← MODIFY — replace emoji
    calls.js                        ← MODIFY — replace emoji
    ui.js                           ← MODIFY — replace emoji
    notes.js                        ← MODIFY — replace emoji
    gallery.js                      ← MODIFY — replace emoji
    calendar.js                      ← MODIFY — replace emoji
    auth_ui.js                      ← MODIFY — replace emoji
    integrations.js                 ← MODIFY — replace emoji
    avatars.js                      ← MODIFY — replace emoji
  index.html                        ← MODIFY — replace emoji, AssetManager.js already linked
config/
  assets.json                       ← NEW — icon coordinates
  themes.json                       ← already has icons path
```

**Already complete (no action needed):**
- ✅ `client/js/AssetManager.js` — preloader + `icon()` helper
- ✅ `client/css/icons.css` — sprite background-position classes (v1, needs pruning for removed icons)
- ✅ `client/css/theme.css` — `--sprite-icons` variable already set
- ✅ `client/index.html` — `icons.css` linked, `AssetManager.js` loaded before UI scripts
- ✅ `client/js/boot.js` — `AssetManager.preload()` called before bootApp()

---

## 2. Theme.css Customization

Chrome surfaces (windows, buttons, status dots) are **not** being replaced with pixel art sprites. They stay as pure CSS, which gives instant theme-ability through `theme.css`. Every visual surface is already controlled by CSS custom properties — no sprites needed.

### 2a. Buttons — Customization Tokens

Buttons already have a pixel-perfect look via `box-shadow` offsets and hard borders. Add these to `theme.css` to make them themeable:

```css
:root {
  /* ── Button Surfaces ── */
  --btn-bg: var(--color-base);
  --btn-border: var(--color-dark);
  --btn-shadow: var(--color-dark);
  --btn-text: var(--color-dark);
  --btn-font: 'VT323', monospace;

  /* Hover */
  --btn-hover-bg: var(--color-primary);
  --btn-hover-shadow: var(--color-dark);

  /* Active (pressed) */
  --btn-active-bg: var(--color-dark);
  --btn-active-text: var(--color-primary);

  /* Variants */
  --btn-primary-bg: var(--color-accent);
  --btn-primary-text: var(--color-base);
  --btn-danger-border: var(--color-danger);
  --btn-danger-shadow: var(--color-danger);
  --btn-danger-hover-bg: var(--color-danger);
  --btn-danger-hover-text: var(--color-base);

  /* Sizes */
  --btn-icon-size: 36px;
  --btn-call-size: 60px;
  --btn-mini-size: 24px;
  --btn-padding: 8px 16px;
}
```

**Affects**: `.sb-btn`, `.settings-btn`, `.act-btn`, `.ia`, `.sendbtn`, `.ni`, `.call-ctrl`, `.board-nav-btn`, `.cal-nav-btn`, `.mh-menu`, `.mh-btn`, `.app-settings-btn`, `.schedule-add-btn`, `.milestone-add-btn`, `.tz-save-btn`, `.emoji-upload-btn`, `.avatar-upload-btn`, `.notes-modal-pin`, `.notes-modal-cancel`, `.notes-add-btn`, `.event-popup-btn`, `.event-modal-btn`, `.call-bar-join`, `.call-bar-leave`, plus all mini/modal buttons.

### 2b. Windows & Panels — Customization Tokens

Window chrome (`.win`, `.win-bar`, `.win-body`) is already pure CSS. Theme tokens:

```css
:root {
  /* ── Window Chrome ── */
  --win-bg: var(--color-base);
  --win-border: var(--color-dark);
  --win-shadow: var(--color-dark);
  --win-bar-bg: var(--color-dark);
  --win-bar-text: var(--color-base);
  --win-bar-accent: var(--color-accent);
  --win-body-bg: var(--color-base);

  /* Panel variants */
  --panel-floating-bg: var(--color-base);
  --panel-floating-border: var(--color-dark);
  --panel-floating-shadow: var(--color-dark);
  --panel-slide-bg: var(--color-base);
  --panel-slide-border: var(--color-dark);

  /* Input surfaces */
  --input-bg: var(--color-base);
  --input-border: var(--color-dark);
  --input-shadow: var(--color-dark);
  --input-focus-border: var(--color-surface-sidebar);
}
```

**Affects**: `.win` (all ~15 windows), `.win-bar`, `.win-body`, `.sidebar`, `.emoji-panel`, `#gif-panel`, `.msg-context-menu`, `.settings-panel`, `.event-popup`, `.event-modal-box`, `.notes-modal-box`, `.stats-modal-box`, `.schedule-panel-box`, `.ibox`, `.ifield`.

### 2c. Chat Bubbles — Customization Tokens

```css
:root {
  /* ── Chat Bubbles ── */
  --bubble-them-bg: var(--color-base);
  --bubble-them-border: var(--color-dark);
  --bubble-them-text: var(--color-dark);

  --bubble-me-bg: var(--color-primary);
  --bubble-me-border: var(--color-dark);
  --bubble-me-text: var(--color-dark);

  --bubble-shadow: var(--color-dark);
  --bubble-radius: 0;      /* keep 0 for pixel style */
  --bubble-padding: 10px 14px;
}
```

### 2d. Status Dots — Customization Tokens

Status dots are pure `background-color` swatches. Already fully themeable via existing `--color-online`, `--color-idle`, `--color-away`, `--color-offline` variables. No sprites needed.

```css
:root {
  --color-online: #00ff73;
  --color-idle: #FACC15;
  --color-away: #FB923C;
  --color-offline: #999999;
}
```

**Affects**: `.sdot.on`, `.sdot.idl`, `.sdot.away`, `.sdot.offline`, `.rec-dot`, `.app-dot`, `.call-bar-dot`, `.call-mini-dot`, `.status-dot`, `.mh-dot`.

### 2e. Additional UI Surfaces — Customization Tokens

```css
:root {
  /* ── Scrollbar ── */
  --scrollbar-width: 12px;
  --scrollbar-track: var(--color-soft);
  --scrollbar-thumb: var(--color-primary);
  --scrollbar-border: var(--color-dark);

  /* ── Tabs ── */
  --tab-bg: var(--color-base);
  --tab-active-bg: var(--color-primary);
  --tab-border: var(--color-primary);

  /* ── Corkboard ── */
  --cork-bg: #b5813c;
  --cork-shadow: rgba(0,0,0,0.03);

  /* ── Toast ── */
  --toast-bg: var(--color-dark);
  --toast-text: var(--color-accent);
  --toast-border: var(--color-accent);

  /* ── Context Menu ── */
  --ctx-bg: var(--color-dark);
  --ctx-text: var(--color-accent);
  --ctx-border: var(--color-accent);
  --ctx-hover: var(--color-forest);
}
```

### Summary of Theme Scope

| Category | Pixel Art? | Theme.css? | Why |
|---|---|---|---|
| **Icons** (47) | Yes | — | Emoji are inconsistent, pixel art gives cohesive identity |
| **Buttons** (all types) | No | Yes | CSS shadows + borders already pixel-perfect |
| **Windows** (`.win` etc.) | No | Yes | CSS border + shadow is the pixel look |
| **Chat bubbles** (`.b`) | No | Yes | CSS with hard borders |
| **Status dots** | No | Yes | Pure color circles via `--color-online` etc. |
| **Scrollbars** | No | Yes | CSS colors only |
| **Tabs** | No | Yes | CSS borders + bg colors |
| **Corkboard** | No | Yes | CSS gradient texture |
| **Pushpin** | No | Yes | CSS pseudo-elements |

---

## 3. Icon Spritesheet

The only pixel art you need to create: **47 icons** (reduced from 61 after audit).

> **Note on `ico-video`:** The status bar camera icon and the gallery file-type video icon both existed in the original plan as `ico-video`. They represent different visuals (video camera vs. play button over film) and live in different contexts. They are now split:
> - `ico-video` — status bar: camera/video call button (18×18)
> - `ico-file-video` — gallery: video file type badge (18×18)

### Navigation (4 icons — house/games removed)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 1 | `ico-chat` | 💬 | 18×18 | Nav |
| 2 | `ico-gallery` | 🖼 | 18×18 | Nav |
| 3 | `ico-pinned` | 📌 | 18×18 | Nav |
| 4 | `ico-dates` | 🗓 | 18×18 | Nav |

### Status Bar / Actions (5 icons)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 5 | `ico-call` | 📞 | 18×18 | Sidebar, status bar, mobile, call |
| 6 | `ico-video` | 🎥 | 18×18 | Sidebar, status bar, mobile (camera icon) |
| 7 | `ico-search` | 🔍 | 18×18 | Status bar, mobile |
| 8 | `ico-delete` | 🗑 | 18×18 | Status bar, mobile, settings |
| 9 | `ico-close` | ✕ | 18×18 | Everywhere |

### Header / Sidebar (4 icons)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 10 | `ico-settings` | ⚙ | 18×18 | App header |
| 11 | `ico-menu` | ☰ | 18×18 | Mobile header |
| 12 | `ico-spotify` | 🎵 | 18×18 | Spotify widget |
| 13 | `ico-connect` | ♫ | 16×16 | Spotify connect |

### Message Input (5 icons)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 14 | `ico-attach` | 📎 | 18×18 | Input bar |
| 15 | `ico-gif` | GIF | 18×18 | Input bar (text label) |
| 16 | `ico-mic` | 🎙 | 18×18 | Input bar |
| 17 | `ico-emoji` | :) | 18×18 | Input bar (emoji picker) |
| 18 | `ico-send` | ▶ | 18×18 | Send button, audio play |

### Context Menu (3 icons)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 19 | `ico-reply` | ↩ | 16×16 | Context menu |
| 20 | `ico-copy` | 📋 | 16×16 | Context menu |
| 21 | `ico-react` | 😊 | 16×16 | Context menu |

### Event / Calendar (3 icons — clock removed)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 22 | `ico-edit` | ✏ | 16×16 | Event popup |
| 23 | `ico-calendar` | 📅 | 16×16 | Event modal |
| 24 | `ico-routine` | ⚙ | 16×16 | Schedule bar |

### Call Controls (8 icons — expanded from 6)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 25 | `ico-mute-on` | 🎤 | 18×18 | Call overlay (mic unmuted) |
| 26 | `ico-mute-off` | 🔇 | 18×18 | Call overlay (mic muted) |
| 27 | `ico-cam-on` | 📷 | 18×18 | Call overlay (camera on) |
| 28 | `ico-cam-off` | 🚫 | 18×18 | Call overlay (camera off) |
| 29 | `ico-screen` | 🖥 | 18×18 | Call overlay (screen share) |
| 30 | `ico-minimize` | ▼ | 18×18 | Call overlay |
| 31 | `ico-hangup` | 📞 | 18×18 | Call overlay (end call, red) |
| 32 | `ico-call-avatar` | 👾 | 48×48 | Call voice UI |

### Settings (6 icons — palette removed)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 33 | `ico-logout` | ⏻ | 16×16 | Settings |
| 34 | `ico-export` | 📤 | 16×16 | Settings (admin) |
| 35 | `ico-bell` | 🔔 | 16×16 | Notification toggle |
| 36 | `ico-upload` | 📁 | 18×18 | Avatar upload |
| 37 | `ico-save` | 💾 | 16×16 | Timezone save |
| 38 | `ico-globe` | 🌐 | 16×16 | Timezone |

### Special (3 icons — star/check removed)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 39 | `ico-heart` | ♥ | 16×16 | Stats modal |
| 40 | `ico-plus` | + | 16×16 | Add buttons |

### Navigation Arrows (2 icons — up/down removed)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 41 | `ico-arrow-prev` | ◀ | 12×12 | Calendar, board nav |
| 42 | `ico-arrow-next` | ▶ | 12×12 | Calendar, board nav |

### File Type Icons (4 icons)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 43 | `ico-file` | 📄 | 18×18 | Gallery files |
| 44 | `ico-image` | 🖼 | 18×18 | Gallery media |
| 45 | `ico-file-video` | ▶ VID | 18×18 | Gallery video badge |
| 46 | `ico-audio` | 🎵 | 18×18 | Audio messages |

### Empty / States (1 icon — loader removed)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| 47 | `ico-empty-gallery` | 📷 | 48×48 | Gallery empty state |

### Avatar Placeholders (3 icons)
| # | Name | Replaces | Size | Used In |
|---|---|---|---|---|
| — | `ico-avatar-you` | 🧑 | 32×32 | Sidebar pair |
| — | `ico-avatar-her` | 👧 | 32×32 | Sidebar pair |
| — | `ico-avatar-mobile` | 👧 | 36×36 | Mobile header |

> Avatar placeholders are placed at the end of the spritesheet and share the `ico-` prefix for consistency. No numbered row needed.

### NOT NEEDED (14 icons — removed from plan)

| Icon | Reason |
|---|---|
| `ico-house` | Nav button commented out (`<!-- DISABLED P22-A -->`) |
| `ico-games` | Nav button hidden (`display: none !important;`) |
| `ico-palette` | Theme button `disabled` + `cursor: not-allowed` |
| `ico-coin` | Wallet feature fully disabled (script/HTML/boot all commented) |
| `ico-arrow-up` | Marked "Spare" in original plan |
| `ico-arrow-down` | Marked "Spare" in original plan |
| `ico-star` | ★ not used in codebase; marked "optional" |
| `ico-check` | ✓ not used anywhere in codebase |
| `ico-clock` | ⏰ single-use; can remain as emoji |
| `ico-loader` | CSS animation handles loading state |
| `ico-badge-new` | For games nav (which is hidden) |
| `ico-badge-pin` | Small 10×14px; not worth pixel art |

---

## 4. UI Elements Kept as CSS

Everything except icons stays as pure CSS, fully themeable via `theme.css`.

| Category | Classes | CSS Controls |
|---|---|---|
| **Windows** | `.win`, `.win-bar`, `.win-body`, `.win-title`, `.win-btn` | `--color-dark`, `--color-base`, `--color-accent` |
| **Sidebar** | `.sidebar`, `.app-header`, `.nav-body` | `--color-secondary`, `--color-deep`, `--color-accent` |
| **Status bar** | `.status-bar`, `.mobile-header` | `--color-primary`, `--color-dark` |
| **Chat bubbles** | `.b`, `.bw`, `.row.them .b`, `.row.me .b` | `--color-base`, `--color-primary`, `--color-dark` |
| **Message input** | `.input-win`, `.ibox`, `.ifield`, `.sendbtn` | `--color-base`, `--color-dark`, `--color-accent` |
| **Buttons** | `.sb-btn`, `.act-btn`, `.ia`, `.ni`, `.call-ctrl`, `.settings-btn`, `.board-nav-btn`, `.cal-nav-btn`, `.mh-btn`, `.mh-menu`, `.app-settings-btn`, `.schedule-add-btn`, `.milestone-add-btn`, `.tz-save-btn`, `.emoji-upload-btn`, `.avatar-upload-btn`, `.notes-modal-pin`, `.notes-modal-cancel`, `.notes-add-btn`, `.event-popup-btn`, `.event-modal-btn` | `--color-base`, `--color-dark`, `--color-primary`, `--color-accent`, `--color-danger` |
| **Status dots** | `.sdot.on`, `.sdot.idl`, `.sdot.away`, `.sdot.offline`, `.rec-dot`, `.app-dot`, `.call-bar-dot`, `.call-mini-dot`, `.status-dot`, `.mh-dot` | `--color-online`, `--color-idle`, `--color-away`, `--color-offline`, `--color-danger`, `--color-highlight` |
| **Panels** | `.emoji-panel`, `#gif-panel`, `.msg-context-menu`, `.rxn-picker`, `.event-popup`, `.event-modal-box`, `.notes-modal-box`, `.stats-modal-box`, `.schedule-panel-box`, `.settings-panel` | `--color-base`, `--color-dark`, `--color-accent`, `--color-primary` |
| **Tabs** | `.gallery-tab`, `.emoji-tab`, `.cal-view-tab`, `.schedule-day-tab` | `--color-base`, `--color-primary`, `--color-deep`, `--color-accent` |
| **Scrollbars** | `.msgs::-webkit-scrollbar-*`, `.sidebar::-webkit-scrollbar-*` | `--color-soft`, `--color-dark`, `--color-primary` |
| **Corkboard** | `.notes-win .win-body` | CSS gradient + `--cork-bg` |
| **Pushpin** | `.sticky-pin` | CSS pseudo-elements, `--color-danger` |
| **Audio player** | `.ab`, `.aplay`, `.abar` | `--color-base`, `--color-deep`, `--color-highlight`, `--color-sky` |
| **Typing indicator** | `.tybub` | `--color-base`, `--color-deep`, `--color-sky` |
| **Context menu** | `.msg-context-menu`, `.ctx-item` | `--color-deep`, `--color-accent`, `--color-forest` |
| **Lightbox** | `.lightbox` | `rgba(0,0,0,0.92)` + `--color-accent` |
| **Search** | `.search-bar`, `.search-highlight` | `--color-deep`, `--color-accent`, `--color-highlight` |
| **Call UI** | `.call-overlay`, `.call-ctrl`, `.call-bar`, `.call-mini`, `.call-soundwave` | `--color-overlay`, `--color-deep`, `--color-forest`, `--color-accent`, `--color-highlight` |
| **Reactions** | `.rxn`, `.rxn.mine` | `--color-base`, `--color-dark`, `--color-accent` |
| **Sticky notes** | `.sticky-note.color-0` through `color-4` | Per-color CSS hex values |
| **Calendar** | `.cal-day`, `.cal-day.today`, `.cal-event-bar` | `--color-soft`, `--color-highlight`, per-event colors |
| **Milestones** | `.milestone-row`, `.milestone-add-btn` | `--color-offwhite`, `--color-deep`, `--color-highlight` |
| **Schedule** | `.schedule-block-item`, `.schedule-block-color` | `--color-offwhite`, `--color-deep`, per-variable colors |
| **Modals** | `.stats-modal`, `.notes-modal`, `.event-modal` | `rgba(0,0,0,0.7)` + surface colors |
| **Toasts** | `showToast()` | `--color-dark`, `--color-accent` |

---

## 5. Code Changes — New Files

### `client/assets/themes/classic/icons.png`
The only pixel art asset. **47 icons** packed into a single spritesheet.

### `config/assets.json` — Icon Coordinates
```json
{
  "theme": "classic",
  "sheet": "assets/themes/classic/icons.png",
  "grid": 20,
  "icons": {
    "chat":        { "col": 0, "row": 0, "w": 18, "h": 18 },
    "gallery":     { "col": 1, "row": 0, "w": 18, "h": 18 },
    "pinned":      { "col": 2, "row": 0, "w": 18, "h": 18 },
    "dates":       { "col": 3, "row": 0, "w": 18, "h": 18 },
    "call":        { "col": 4, "row": 0, "w": 18, "h": 18 },
    "video":       { "col": 5, "row": 0, "w": 18, "h": 18 },
    "search":      { "col": 6, "row": 0, "w": 18, "h": 18 },
    "delete":      { "col": 7, "row": 0, "w": 18, "h": 18 },
    "close":       { "col": 8, "row": 0, "w": 18, "h": 18 }
    /* ... all 47 icons by (col, row) */
  }
}
```

### `client/css/icons.css` — Updated sprite classes

The existing `icons.css` has classes for all 61 icons (including the removed ones). After the spritesheet is ready, prune it to only include the 47 active icons. Also fix the `ico-video` collision:

```css
/* ── Icon base ── */
.ico {
  display: inline-block;
  background-image: var(--sprite-icons);
  background-size: auto;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
  flex-shrink: 0;
}

/* ── Navigation ── */
.ico-chat    { width: 18px; height: 18px; background-position:   0px   0px; }
.ico-gallery { width: 18px; height: 18px; background-position: -20px   0px; }
.ico-pinned  { width: 18px; height: 18px; background-position: -40px   0px; }
.ico-dates   { width: 18px; height: 18px; background-position: -60px   0px; }

/* ── Status bar / Actions ── */
.ico-call    { width: 18px; height: 18px; background-position:  -80px   0px; }
.ico-video   { width: 18px; height: 18px; background-position: -100px   0px; }  /* camera icon */
.ico-search  { width: 18px; height: 18px; background-position: -120px   0px; }
.ico-delete  { width: 18px; height: 18px; background-position: -140px   0px; }
.ico-close   { width: 18px; height: 18px; background-position: -160px   0px; }

/* ── Header / Sidebar ── */
.ico-settings { width: 18px; height: 18px; background-position:    0px -20px; }
.ico-menu     { width: 18px; height: 18px; background-position:  -20px -20px; }
.ico-spotify  { width: 18px; height: 18px; background-position:  -40px -20px; }
.ico-connect  { width: 16px; height: 16px; background-position:  -60px -20px; }

/* ── Message input ── */
.ico-attach { width: 18px; height: 18px; background-position: 0px -40px; }
.ico-gif    { width: 18px; height: 18px; background-position: -20px -40px; }
.ico-mic    { width: 18px; height: 18px; background-position: -40px -40px; }
.ico-emoji  { width: 18px; height: 18px; background-position: -60px -40px; }
.ico-send   { width: 18px; height: 18px; background-position: -80px -40px; }

/* ── Context menu ── */
.ico-reply { width: 16px; height: 16px; background-position: 0px -60px; }
.ico-copy  { width: 16px; height: 16px; background-position: -20px -60px; }
.ico-react { width: 16px; height: 16px; background-position: -40px -60px; }

/* ── Event / Calendar ── */
.ico-edit     { width: 16px; height: 16px; background-position: 0px -80px; }
.ico-calendar { width: 16px; height: 16px; background-position: -20px -80px; }
.ico-routine  { width: 16px; height: 16px; background-position: -40px -80px; }

/* ── Call controls ── */
.ico-mute-on    { width: 18px; height: 18px; background-position: 0px -100px; }
.ico-mute-off   { width: 18px; height: 18px; background-position: -20px -100px; }
.ico-cam-on     { width: 18px; height: 18px; background-position: -40px -100px; }
.ico-cam-off    { width: 18px; height: 18px; background-position: -60px -100px; }
.ico-screen     { width: 18px; height: 18px; background-position: -80px -100px; }
.ico-minimize   { width: 18px; height: 18px; background-position: -100px -100px; }
.ico-hangup     { width: 18px; height: 18px; background-position: -120px -100px; }
.ico-call-avatar { width: 48px; height: 48px; background-position: 0px -120px; }

/* ── Settings ── */
.ico-logout { width: 16px; height: 16px; background-position: 0px -180px; }
.ico-export { width: 16px; height: 16px; background-position: -20px -180px; }
.ico-bell   { width: 16px; height: 16px; background-position: -40px -180px; }
.ico-upload { width: 18px; height: 18px; background-position: -60px -180px; }
.ico-save   { width: 16px; height: 16px; background-position: -80px -180px; }
.ico-globe  { width: 16px; height: 16px; background-position: -100px -180px; }

/* ── Special ── */
.ico-heart { width: 16px; height: 16px; background-position: 0px -200px; }
.ico-plus  { width: 16px; height: 16px; background-position: -20px -200px; }

/* ── Arrows ── */
.ico-arrow-prev { width: 12px; height: 12px; background-position: 0px -220px; }
.ico-arrow-next { width: 12px; height: 12px; background-position: -20px -220px; }

/* ── File type ── */
.ico-file       { width: 18px; height: 18px; background-position: 0px -240px; }
.ico-image      { width: 18px; height: 18px; background-position: -20px -240px; }
.ico-file-video { width: 18px; height: 18px; background-position: -40px -240px; }
.ico-audio      { width: 18px; height: 18px; background-position: -60px -240px; }

/* ── Empty / States ── */
.ico-empty-gallery { width: 48px; height: 48px; background-position: 0px -260px; }

/* ── Avatars ── */
.ico-avatar-you     { width: 32px; height: 32px; background-position: 0px -300px; }
.ico-avatar-her     { width: 32px; height: 32px; background-position: -34px -300px; }
.ico-avatar-mobile  { width: 36px; height: 36px; background-position: -68px -300px; }
```

---

## 6. Code Changes — Modified Files

### `client/index.html`
Replace emoji with `<span class="ico ico-{name}"></span>`. AssetManager.js and icons.css are already linked.

### JavaScript Files — Emoji → Icon Replacements

```javascript
// BEFORE:
html += `📞 CALL`;
// AFTER:
html += `${AssetManager.icon('call')} CALL`;

// BEFORE:
html += '📷';  // camera toggle
// AFTER:
html += AssetManager.icon('cam-on');   // camera on
html += AssetManager.icon('cam-off');  // camera off

// BEFORE:
html += '🎤';  // mute toggle
// AFTER:
html += AssetManager.icon('mute-on');  // mic unmuted
html += AssetManager.icon('mute-off');  // mic muted
```

| File | Replacements |
|---|---|
| **`chat.js`** | ~30 |
| **`search.js`** | ~15 |
| **`emojis.js`** | ~25 |
| **`calls.js`** | ~40 |
| **`ui.js`** | ~25 |
| **`notes.js`** | ~10 |
| **`gallery.js`** | ~10 |
| **`calendar.js`** | ~30 |
| **`auth_ui.js`** | ~2 |
| **`integrations.js`** | ~5 |
| **`avatars.js`** | ~3 |
| **Total** | **~195** |

### `config/themes.json`
Already has `icons: "assets/themes/classic/icons.png"` — no change needed.

---

## 7. Implementation Order

### Phase 1 — Icon Spritesheet ✅ (IN PROGRESS)
- [ ] Create `client/assets/themes/classic/` directory
- [ ] Draw **47 icons** in `icons.png` (Aseprite / Pyxel / Procreate)
- [ ] Write `config/assets.json` with col/row coordinates

### Phase 2 — Infrastructure ✅ (COMPLETE)
- [x] `client/js/AssetManager.js` — preloader + `icon()` helper
- [x] `client/css/icons.css` — sprite classes (v1, needs pruning after spritesheet)
- [x] `client/css/theme.css` — `--sprite-icons` variable
- [x] `client/index.html` — icons.css + AssetManager.js linked
- [x] `client/js/boot.js` — `AssetManager.preload()`

### Phase 3 — Icon Migration (JS files) ⬜
- [ ] `calls.js` — 40 replacements (biggest visual change)
- [ ] `chat.js` — 30 replacements
- [ ] `calendar.js` — 30 replacements
- [ ] `ui.js` — 25 replacements
- [ ] `emojis.js` — 25 replacements
- [ ] `search.js` — 15 replacements
- [ ] `notes.js` — 10 replacements
- [ ] `gallery.js` — 10 replacements
- [ ] `integrations.js` — 5 replacements
- [ ] `avatars.js` — 3 replacements
- [ ] `auth_ui.js` — 2 replacements

### Phase 4 — Theme.css Tokens (optional, can be incremental)
- [ ] Add button customization tokens
- [ ] Add window chrome tokens
- [ ] Add bubble color tokens
- [ ] Add remaining surface tokens

### Phase 5 — Polish
- [ ] Test icon rendering in Chrome, Firefox, Edge
- [ ] Verify `image-rendering: pixelated` is respected
- [ ] Clean up `icons.css` — remove unused `.ico-*` classes (house, games, etc.)
- [ ] Wire theme system to swap `--sprite-icons` URL

---

## 8. Sprite Sheet Layout Guide

### `icons.png` Layout

**47 icons** on a 20px grid. Canvas size: **180×360px**

```
Row 0 (y=0):     chat  gallery  pinned  dates  call  video  search  delete  close  (9 icons, 18px)
Row 1 (y=-20):   settings  menu  spotify  connect                       (4 icons)
Row 2 (y=-40):   attach  gif  mic  emoji  send                          (5 icons)
Row 3 (y=-60):   reply  copy  react                                        (3 icons, 16px)
Row 4 (y=-80):   edit  calendar  routine                                   (3 icons, 16px)
Row 5 (y=-100):  mute-on  mute-off  cam-on  cam-off  screen  minimize  hangup  (7 icons, 18px)
Row 6 (y=-120):  call-avatar ────────────────┐                           (1 large, 48×48)
                                          ← extends to -168px →
Row 7 (y=-140):  [GAP - overlaps with call-avatar]
Row 8 (y=-160):  [GAP - overlaps with call-avatar]
Row 9 (y=-180):  logout  export  bell  upload  save  globe                 (6 icons)
Row 10 (y=-200): heart  plus                                                 (2 icons, 16px)
Row 11 (y=-220): arrow-prev  arrow-next                                     (2 icons, 12px)
Row 12 (y=-240): file  image  file-video  audio                           (4 icons, 18px)
Row 13 (y=-260): empty-gallery ──────────┐                                (1 large, 48×48)
                                       ← extends to -308px →
Row 14 (y=-280):  [GAP - overlaps with empty-gallery]
Row 15 (y=-300):  [GAP - overlaps with empty-gallery]
Row 16 (y=-320): avatar-you  avatar-her  avatar-mobile                     (3 avatars, 32/32/36px)
```

### Height calculation (accounting for 48px icons)

- Rows 0-5: y=0 to y=-118
- call-avatar at y=-120, height 48 → ends at -168
- Next row at -180 (gap of 12px)
- Rows 9-12: y=-180 to y=-258
- empty-gallery at y=-260, height 48 → ends at -308
- Next row at -320 (gap of 12px)
- Avatars at y=-320, max height 36 → ends at -356

**Total height: ~360px**

### Width

Row 0 has 9 icons (col 8 at x=-160 + 18px = 178px) → **180px**

### CSS Background Positioning

Most icons follow `(col × 20px, row × 20px)`:

```css
.ico-chat    { background-position:    0px    0px; }  /* col 0, row 0 */
.ico-gallery { background-position:  -20px    0px; }  /* col 1, row 0 */
```

**Exception**: Avatars use tighter spacing (34px) to avoid overlap:

```css
.ico-avatar-you    { background-position:   0px -320px; }  /* col 0, x=0 */
.ico-avatar-her    { background-position: -34px -320px; }  /* col 1, x=34 (not 20!) */
.ico-avatar-mobile { background-position: -68px -320px; }  /* col 2, x=68 (not 40!) */
```

The `col` values in `config/assets.json` are grid references, not exact pixel positions.

---

## 9. Theme Integration

### Current state
```json
// config/themes.json
{
  "id": "curon_classic",
  "icons": "assets/themes/classic/icons.png"
}
```

### How themes swap icons
```javascript
// In ui.js or AssetManager:
function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId);
  document.documentElement.style.setProperty('--sprite-icons', `url('${theme.icons}')`);
}
```

### Theme variants
| Theme | Icons palette | Chrome palette (theme.css) |
|---|---|---|
| Classic Curon | Warm peach/cream icons | Green/cream surfaces |
| Cherry Blossom | Pink/red icons | Pink/cream surfaces |

All chrome recoloring happens through CSS custom properties (section 2), not sprites.

---

## 10. Checklist Summary

### Pixel Art to Create
- [ ] **`icons.png`** — **47 icons** (reduced from 61)
  - [ ] 4 navigation (house/games removed)
  - [ ] 5 status bar/actions
  - [ ] 4 header/sidebar
  - [ ] 5 message input
  - [ ] 3 context menu
  - [ ] 3 event/calendar (clock removed)
  - [ ] 8 call controls (added mute-off, cam-off)
  - [ ] 6 settings (palette removed)
  - [ ] 3 special (star/check/arrow-right removed)
  - [ ] 2 arrows (up/down removed)
  - [ ] 4 file types (video renamed to ico-file-video)
  - [ ] 1 empty state (loader removed)
  - [ ] 3 avatar placeholders

### New Files to Create
- [ ] `client/assets/themes/classic/icons.png` — the one and only asset

### Files to Modify
- [ ] `client/css/icons.css` — prune unused classes (house, games, palette, coin, arrow-up, arrow-down, star, check, clock, loader, badge-new, badge-pin), fix `ico-video` collision → `ico-file-video`
- [ ] `client/js/chat.js` (~30 replacements)
- [ ] `client/js/search.js` (~15)
- [ ] `client/js/emojis.js` (~25)
- [ ] `client/js/calls.js` (~40)
- [ ] `client/js/ui.js` (~25)
- [ ] `client/js/notes.js` (~10)
- [ ] `client/js/gallery.js` (~10)
- [ ] `client/js/calendar.js` (~30)
- [ ] `client/js/auth_ui.js` (~2)
- [ ] `client/js/integrations.js` (~5)
- [ ] `client/js/avatars.js` (~3)
- [ ] `config/assets.json` — write icon coordinates

### What's NOT Changing
- `main.css` — no structural overhauls
- Buttons — stay CSS, get theme tokens
- Windows — stay CSS, get theme tokens
- Status dots — stay CSS, already themeable
- Chat bubbles — stay CSS, get theme tokens
- All decorative elements — stay CSS or removed
- 9-slice, border-image, sprites.css — removed from plan

### Already Complete
- ✅ `client/js/AssetManager.js` — preloader + `icon()` helper
- ✅ `client/css/icons.css` — sprite background-position classes (v1)
- ✅ `client/css/theme.css` — `--sprite-icons` variable
- ✅ `client/index.html` — icons.css + AssetManager.js linked
- ✅ `client/js/boot.js` — `AssetManager.preload()` called on boot

---

*Last updated: 2026-05-11*
*Scope: 47 icons (reduced from 61 after codebase audit). Icons for disabled/hidden features removed. Infrastructure files already complete.*