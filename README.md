# CURON.EXE

A private two-user communication platform designed for intimacy, privacy, and desktop-style aesthetics.

## 🛠️ Stack

- **Runtime**: Node.js
- **Server**: Express + `ws` (WebSockets)
- **Database**: SQLite via `sql.js` (pure JS, no native deps)
- **Persistence**: Hybrid Storage (In-memory → Local File → Supabase Backup)
- **Storage**: Supabase Storage (media, avatars, thumbnails) + local disk fallback for large files (>45MB)
- **Auth**: bcrypt passwords + JWT (7-day expiry)
- **Calls**: WebRTC (signaling via WebSocket, supports STUN/TURN)
- **UI**: Monolithic `index.html` (Vanilla CSS, custom pixel-art components)

---

## 🚀 Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables:

```
PORT=3000
JWT_SECRET=replace_with_a_long_random_string
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

Optional variables (see `.env.example` for full list):

```
# Emoji admin (username who can upload custom emojis)
EMOJI_ADMIN=iron

# Seed passwords (overrides hardcoded defaults)
SEED_PASSWORD_IRON=your_password_here
SEED_PASSWORD_CUBBY=their_password_here

# Media cleanup interval (default: 6 hours)
MEDIA_CLEANUP_INTERVAL_MS=21600000
```

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Seed the database

```bash
npm run seed
```

This creates `server/curon.db` with both user accounts. Safe to re-run — skips existing users.

### 4. Run

```bash
# Development (Node 18+)
npm run dev

# Production
npm start
```

Open `http://localhost:3000` in your browser.

---

## 📁 Project Structure

```
├── client/
│   ├── js/
│   │   ├── chat.js          # Messaging & chat UI
│   │   ├── emojis.js        # Emoji picker, autocomplete & audio player
│   │   ├── emoji-data.js    # Standard emoji map (1967 entries, 9 categories)
│   │   ├── gallery.js       # Media gallery with starring, pagination
│   │   ├── calls.js         # WebRTC & signaling UI
│   │   ├── calendar.js      # Calendar & schedule
│   │   ├── notes.js         # Shared notes board
│   │   ├── search.js        # Chat search
│   │   ├── ui.js            # Shared layout, modals, settings, backup banner
│   │   ├── ws.js            # Client-side WebSocket manager
│   │   ├── auth_ui.js      # Login & password prompt UI
│   │   ├── state.js         # Client-side state management
│   │   ├── boot.js          # App initialization
│   │   └── utils.js         # Helper functions
│   ├── css/
│   │   ├── main.css         # All styles
│   │   └── icons.css        # Lucide icon styles
│   └── index.html           # Main HTML5 entry point
├── server/
│   ├── routes/
│   │   ├── auth.js          # JWT, login, user endpoints
│   │   ├── chat.js          # Messages, notes, search
│   │   ├── assets.js        # Media uploads, gallery, starring, backup
│   │   ├── events.js        # Calendar, schedule
│   │   └── search.js         # Chat search
│   ├── ws/
│   │   ├── handler.js       # WebSocket message dispatcher
│   │   ├── events.js        # WS event constants
│   │   ├── locks.js         # Cross-tab lock coordination
│   │   └── presence.js      # Online presence tracking
│   ├── helpers/
│   │   └── PresenceSync.js  # Cross-tab presence sync
│   ├── db.js                # sql.js wrapper & schema
│   ├── migrations/          # Database migrations
│   ├── supabase-storage.js  # Supabase Storage client
│   ├── economy.js           # Economy/wallet (MVP disabled)
│   ├── index.js             # Express app root, auto-cleanup interval
│   └── seed.js              # One-time USERS setup
├── config/                  # UI color profiles & static data
├── server/storage/          # Local file storage
│   ├── media/              # Large media files (>45MB)
│   ├── thumbnails/         # Local thumbnails
│   └── tmp/                # Temporary upload staging
├── .env                    # Your environment config (do not commit)
├── .env.example            # Template for environment variables
└── package.json
```

---

## 📁 Persistence & Backups

Curon uses a triple-layer persistence strategy to ensure you never lose your data, even on ephemeral platforms like Render:

1.  **Memory**: `sql.js` handles queries at lightning speed in RAM.
2.  **Local Cache**: Every change is written to `server/curon.db`.
3.  **Supabase**: The database file is backed up to Supabase Storage every 5 minutes and on server shutdown.

### Local Backups
You can download your entire database and media library from Supabase to your local computer at any time:

```bash
npm run backup           # Dry-run: see what will be downloaded from Supabase
npm run backup:confirm   # Actually download and clean up old media from Supabase
```

---

## 🔒 Security & Privacy

- **Password Hashing**: bcrypt with 12 rounds.
- **Session Security**: JWT tokens with 7-day expiry.
- **Server-Side Storage**: User data persisted in SQLite; media in Supabase Storage or local disk.
- **WebRTC Privacy**: Direct P2P calls with signaling over WebSocket.
- **Security Headers**: Helmet (X-Frame-Options, X-Content-Type-Options, HSTS).
- **XSS Protection**: Server-side sanitization on messages, notes, and calendar events.
- **IDOR Protection**: Calendar event deletion verifies ownership.
- **CORS**: Whitelist-based (localhost, deployed domain).
- **Password Security**: Passwords moved to environment variables (`SEED_PASSWORD_IRON`, `SEED_PASSWORD_CUBBY`) — never hardcoded.

---

## ✨ Core Features

### ✅ Implemented
- **Chat**: Real-time messaging with reactions, replies, search, and notes.
- **Emoji Picker**: Full 1967-standard-emoji grid with `:name:` autocomplete, plus custom emoji uploads (admin).
- **Shared Calendar & Schedule**: Relationship milestone tracking and routine sync.
- **Voice & Video**: WebRTC calls for desktop and mobile.
- **Notes Board**: Shared virtual sticky notes (formerly "Pinned").
- **Media Gallery**: Photo/video sharing with pagination, starring, and server-side thumbnails.
- **Media Starring**: Star/unstar media items for quick access. Starred items appear first.
- **Batch Upload**: Select multiple files at once — uploads sequentially with progress.
- **Image Paste**: Paste images directly from clipboard (Ctrl+V) in chat input.
- **Search**: Full-text chat search.
- **Auto-cleanup**: Automatic deletion of unstarred media older than 14 days (runs every 6 hours).
- **Local Storage Fallback**: Files >45MB stored locally (useful for deployment without large Supabase storage).
- **Backup Endpoint**: Admin can download all local-storage media as a ZIP file.
- **Sunday Backup Reminder**: Persistent banner on Sundays for admin if local files exist.

### 🔒 Disabled / Placeholder
- **House**: 2.5D isometric house UI disabled for MVP.
- **Economy**: Wallet system present in code but gated behind feature flag.
- **Cats**: UI stub present but functionality not wired up.

---

## ☁️ Deployment (Render.com)

1.  Create a **Web Service** on Render.
2.  Connect your GitHub repository.
3.  Set **Build Command**: `npm install`
4.  Set **Start Command**: `npm start`
5.  Add your `.env` variables to the Render **Environment** dashboard.
6.  (Optional) Set `RENDER_EXTERNAL_URL` to your app's URL for better CORS support.

---

## 🔧 Commands

```bash
npm run dev              # Start dev server with auto-restart
npm start                # Start production server
npm run seed             # Seed or re-seed the database
npm run backup           # Preview local backup from Supabase
npm run backup:confirm   # Execute local backup and clean remote storage
```

---

## ⚠️ Migration Note

If upgrading from an older version with an existing `curon.db`, the app automatically adds missing database columns on first run. No manual migration needed.

---

## 🐞 Known Issues

See `notes/audits/bugs.md` for the full issue tracker.