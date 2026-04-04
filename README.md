# CURON.EXE

A private, end-to-end encrypted communication platform for exactly two users. Designed for intimacy, privacy, and desktop-style aesthetics.

## Stack

- **Runtime**: Node.js
- **Server**: Express + `ws` (WebSockets)
- **Database**: SQLite via `sql.js` (Pure JS, no native compilation required)
- **Auth**: bcrypt passwords + JWT (7-day expiry)
- **Encryption**: E2E via Web Crypto API (RSA-OAEP, AES-GCM)
- **Calls**: WebRTC (Signaling via WebSocket, supports STUN/TURN)
- **UI**: Monolithic `index.html` (Vanilla CSS, custom pixel-art components)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Edit `.env`:

```
PORT=3000
JWT_SECRET=replace_with_a_long_random_string
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

## Deploying to Railway

1. Push this repo to GitHub
2. Create a new Railway project → **Deploy from GitHub repo**
3. Set environment variables in Railway dashboard:
   - `JWT_SECRET` — your generated secret
   - `PORT` — Railway sets this automatically, but you can override
4. Add a **volume** mount at `/app/server/storage` for media persistence
5. Run the seed script once via Railway's shell:
   ```bash
   node server/seed.js
   ```

---

## Project Structure

```
├── client/
│   ├── js/
│   │   ├── calendar.js     # Shared calendar logic
│   │   ├── calls.js        # WebRTC & signaling UI
│   │   ├── chat.js         # Messaging & E2EE logic
│   │   ├── emojis.js       # Reaction & Emoji Picker
│   │   ├── gallery.js      # Media viewer & encryption
│   │   ├── house.js        # Isometric engine & furniture
│   │   ├── integrations.js # Spotify & external sync
│   │   ├── notes.js        # Virtual board & sticky notes
│   │   ├── search.js       # Message & global search
│   │   ├── ui.js           # Shared layout & modals
│   │   ├── utils.js        # Crypto & helper functions
│   │   └── ws.js           # Client-side WebSocket manager
│   └── index.html          # Main HTML5 entry point
├── server/
│   ├── routes/
│   │   ├── auth.js         # JWT & login endpoints
│   │   ├── calendar.js     # Shared event storage
│   │   ├── clearchat.js    # Data deletion utility
│   │   ├── emojis.js       # Custom reaction endpoints
│   │   ├── gifs.js         # Giphy integration API
│   │   ├── houses.js       # Persistence for House state
│   │   ├── keys.js         # E2EE key exchange endpoints
│   │   ├── media.js        # Encrypted storage & uploads
│   │   ├── messages.js     # Chat history & storage
│   │   ├── notes.js        # Sticky note persistence
│   │   ├── spotify.js      # OAuth & playback sync
│   │   └── stats.js        # Relationship milestones
│   ├── ws/
│   │   ├── events.js       # Shared event type constants
│   │   ├── handler.js      # WebSocket message dispatcher
│   │   └── presence.js     # Real-time activity tracking
│   ├── auth.js             # Token middleware
│   ├── crypto.js           # Server-side validation
│   ├── db.js               # sql.js wrapper & schema
│   ├── index.js            # Node/Express app root
│   ├── seed.js             # One-time USERS setup
│   └── curon.db            # Persistent binary database
├── config/
│   ├── cats.json           # Definitions for AI pets
│   ├── furniture.json      # Complete furniture catalog
│   ├── rooms.json          # Master room templates
│   ├── stories.json        # Shared memory history
│   └── themes.json         # Custom UI color profiles
├── Notes/                  # Dev guides & checklists
├── storage/                # Media, avatars, & GIF files
├── .env                    # Environment secrets
└── package.json            # Node dependencies & scripts
```

---

## Security & Privacy-First

- **Zero-Knowledge Storage**: Message content and private keys are never stored in plaintext on the server.
- **Hardware-Accelerated Crypto**: Uses the browser's Web Crypto API for secure RSA and AES operations.
- **Server-Side Avatars**: Replaces `localStorage` base64 storage with secure file uploads to prevent quota issues.
- **WebRTC Privacy**: Direct P2P calls with signaling over the encrypted WebSocket.

---

## Core Features

- [x] **E2E Chat**: Real-time messaging with reactions, replies, and search.
- [x] **Isometric House**: A 2.5D shared home with furniture placement and room customization.
- [x] **Persistence**: Full SQLite storage for room textures and furniture layouts.
- [x] **Real-time Sync**: WebSocket-driven movement and design updates for partners.
- [x] **Surface Stacking**: Intelligent "tabletop" logic for placing items on desks/tables.
- [x] **Shared Calendar**: Manage events and recurring milestones.
- [x] **Sync Schedule**: Visual timeline for daily routines and timezones.
- [x] **Spotify Sync**: See what each other is listening to in real-time.
- [x] **Voice & Video**: High-quality WebRTC calls for both desktop and mobile.
- [x] **Notes Board**: Pin shared notes to a virtual board.
- [x] **Media Gallery**: Encrypted photo/video sharing and GIF support.

---

## 🚧 Undergoing Operations

- **Modular Art Redesign**: Upgrading all assets to a **2-pixel base** (furniture) and **4-pixel base** (room tiles) for a premium, hand-crafted feel.
- **Custom Outfits**: Implementing a multi-layer PNG rendering engine for characters.
- **Inventory Expansion**: Populating the house catalog with 50+ unique items.

---

## 🗺️ Roadmap & Planned Features

- **Mansion Expansion**: Support for multiple interconnected rooms with working doors and transition triggers.
- **Cat AI**: Roaming felines that interact with furniture (loafing on sofas, sleeping on beds).
- **Dynamic Lighting**: Real-time Night Mode with window shadows and glowing lamp effects.
- **Shop System**: A "Universal Shop" for unlocking new furniture tiers based on message streaks.
- **Memory Wall**: A special room for displaying framed photos from the Media Gallery.
