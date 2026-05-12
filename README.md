# CURON.EXE

A private two-user communication platform designed for intimacy, privacy, and desktop-style aesthetics.

## 🛠️ Stack

- **Runtime**: Node.js
- **Server**: Express + `ws` (WebSockets)
- **Database**: SQLite via `sql.js` (pure JS, no native deps)
- **Storage**: Supabase Storage (media, avatars, thumbnails)
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

Edit `.env`:

```
PORT=3000
JWT_SECRET=replace_with_a_long_random_string
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
# SPOTIFY_CLIENT_ID=... (optional)
# SPOTIFY_CLIENT_SECRET=... (optional)
```

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Set your usernames and passwords

Edit `server/seed.js` — change the `USERS` array:

```js
const USERS = [
  { username: 'alice', password: 'your_strong_password' },
  { username: 'bob',   password: 'their_strong_password' },
];
```

### 4. Seed the database

```bash
npm run seed
```

This creates `server/curon.db` with both user accounts. Safe to re-run — skips existing users.

### 5. Run

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
│   │   ├── gallery.js       # Media gallery with pagination
│   │   ├── calls.js         # WebRTC & signaling UI
│   │   ├── calendar.js      # Calendar & schedule
│   │   ├── notes.js         # Shared notes board
│   │   ├── search.js        # Chat search
│   │   ├── ui.js            # Shared layout, modals & settings
│   │   ├── ws.js            # Client-side WebSocket manager
│   │   └── utils.js         # Helper functions
│   ├── css/
│   │   └── main.css         # All styles
│   └── index.html           # Main HTML5 entry point
├── server/
│   ├── routes/
│   │   ├── auth.js          # JWT, login, user endpoints
│   │   ├── chat.js          # Messages, notes, search
│   │   ├── assets.js        # Media uploads, gallery, emojis
│   │   ├── events.js        # Calendar, Spotify integration
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
│   ├── index.js             # Express app root
│   └── seed.js              # One-time USERS setup
├── config/                  # UI color profiles & static data
└── storage/                 # Legacy local media uploads (deprecated)
```

---

## 🔒 Security & Privacy

- **Password Hashing**: bcrypt with 12 rounds.
- **Session Security**: JWT tokens with 7-day expiry.
- **Server-Side Storage**: User data persisted in SQLite; media in Supabase Storage.
- **WebRTC Privacy**: Direct P2P calls with signaling over WebSocket.
- **Rate Limiting**: 30 req/min on media uploads.
- **Security Headers**: Helmet (X-Frame-Options, X-Content-Type-Options, HSTS).
- **XSS Protection**: Server-side sanitization on messages, notes, and calendar events.

---

## ✨ Core Features

### ✅ Implemented
- **Chat**: Real-time messaging with reactions, replies, search, and notes.
- **Emoji Picker**: Full 1967-standard-emoji grid with `:name:` autocomplete, plus custom emoji uploads (admin).
- **Shared Calendar & Schedule**: Relationship milestone tracking and routine sync.
- **Spotify Sync**: Live playback visibility for partners.
- **Voice & Video**: WebRTC calls for desktop and mobile.
- **Notes Board**: Shared virtual sticky notes.
- **Media Gallery**: Photo/video sharing with pagination and server-side thumbnails.
- **Search**: Full-text chat search.

### 🔒 Disabled / Placeholder
- **House**: 2.5D isometric house UI disabled for MVP.
- **Economy**: Wallet system present in code but gated behind feature flag.
- **Cats**: UI stub present but functionality not wired up.

---

## 🔧 Commands

```bash
npm run dev              # Start dev server with auto-restart
npm start                # Start production server
npm run seed             # Seed or re-seed the database
npm run backup           # Dry-run DB backup to Supabase
npm run backup:confirm   # Execute DB backup to Supabase
npm run backup:dry       # Alias for backup
```

---

## 🐞 Known Issues

See `notes/audits/bugs.md` for the full issue tracker.