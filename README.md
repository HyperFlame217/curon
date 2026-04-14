# CURON.EXE

A private, end-to-end encrypted communication platform for exactly two users. Designed for intimacy, privacy, and desktop-style aesthetics. Featuring a deep isometric "House" layer for shared digital cohabitation.

## 🛠️ Stack

- **Runtime**: Node.js
- **Server**: Express + `ws` (WebSockets)
- **Database**: SQLite via `sql.js` (Pure JS, no native compilation required)
- **Auth**: bcrypt passwords + JWT (7-day expiry)
- **Encryption**: E2E via Web Crypto API (RSA-OAEP, AES-GCM)
- **Calls**: WebRTC (Signaling via WebSocket, supports STUN/TURN)
- **UI**: Monolithic `index.html` (Vanilla CSS, custom pixel-art components)
- **Engine**: Custom 2.5D Isometric DOM-based rendering engine

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
│   │   ├── house.js        # Isometric engine & furniture logic
│   │   ├── chat.js         # Messaging & E2EE logic
│   │   ├── calls.js        # WebRTC & signaling UI
│   │   ├── ui.js           # Shared layout & modals
│   │   ├── ws.js           # Client-side WebSocket manager
│   │   └── utils.js        # Crypto & helper functions
│   └── index.html          # Main HTML5 entry point
├── server/
│   ├── routes/
│   │   ├── auth.js         # JWT & login endpoints
│   │   ├── houses.js       # persistence for House state
│   │   ├── wallet.js       # Individual coin & reward logic
│   │   ├── keys.js         # E2EE key exchange endpoints
│   │   └── media.js        # Encrypted storage & uploads
│   ├── ws/
│   │   ├── handler.js      # WebSocket message dispatcher
│   │   └── presence.js     # Real-time activity tracking
│   ├── db.js               # sql.js wrapper & schema
│   ├── index.js            # Node/Express app root
│   └── seed.js             # One-time USERS setup
├── config/
│   ├── cats.json           # Definitions for AI pets
│   ├── furniture.json      # Complete furniture catalog
│   ├── outfits.json        # Character clothing definitions
│   ├── rooms.json          # Master room templates
│   ├── games.json          # Minigame milestones & rewards
│   └── themes.json         # Custom UI color profiles
├── Notes/                  # Dev guides, research, & task lists
└── storage/                # Media, avatars, & GIF files (Encrypted)
```

---

## 🔒 Security & Privacy-First

- **Zero-Knowledge Storage**: Message content and private keys are never stored in plaintext on the server.
- **Hardware-Accelerated Crypto**: Uses the browser's Web Crypto API for secure RSA and AES operations.
- **Server-Side Avatars**: Uses secure file uploads to prevent `localStorage` quota issues.
- **WebRTC Privacy**: Direct P2P calls with signaling over the encrypted WebSocket.

---

## ✨ Core Features

### 🟢 Implemented
- [x] **E2E Chat**: Real-time messaging with reactions, replies, and search.
- [x] **2.5D Isometric House**: A shared home with persistent furniture placement.
- [x] **Hierarchy Engine**: Surface stacking (items on tables) with recursive movement/deletion.
- [x] **Grid Physics**: A* pathfinding, collision masking, and BFS-based Safe Spawn algorithm.
- [x] **Interaction Locks**: Networked mutexes to prevent modifying furniture while in-use.
- [x] **Dual Characters**: Real-time sync of user + partner movement and idle roaming.
- [x] **Shared Calendar & Schedule**: Relationship milestone tracking and routine sync.
- [x] **Spotify Sync**: Live playback visibility for partners.
- [x] **Voice & Video**: WebRTC calls for desktop and mobile.
- [x] **Notes Board**: Shared virtual sticky notes.
- [x] **Media Gallery**: Encrypted photo/video sharing.

### 🟡 Planned / In-Progress
- [ ] **Individual Economy**: Wallets with message-based caps and daily game tickets.
- [ ] **Universal Shop**: Unlockable furniture and outfit catalogues.
- [ ] **Cat Co-Parenting**: Shared AI pets with happiness decay and naming system.
- [ ] **Multi-Room Mansion**: Tile-trigger door transitions and room state management.
- [ ] **Memory Wall**: Shared relationship scrapbook with doodle-canvas support.
- [ ] **Wardrobe System**: Layered character outfit rendering and gifting.

---

## 📊 Current Status

### ✅ Completed Phases
- **Phase 1: Foundations & Config**: CSS tokens, config loaders, and asset manifests.
- **Phase 1.1: Engine Stability**: BFS Safe Spawn, Networked Interaction Locks, AFK Soft-collision, and WS Reconnection state.
- **Phase 1.2: House Engine**: Grid snapping, depth sorting, surface stacking, and rotation logic.

### 🚧 In Progress
- **Phase 2: Economy & Engine APIs**: Wallet architecture implementation and message-based coin rewards.

### 📋 Upcoming
- **Phase 3: Room Navigation**: Multi-room transition logic and doorway buffer zones.
- **Phase 4: progression & Shop**: Milestone tracker and Universal Shop UI.

---

## 🐞 Known Issues

- **Modular Art Redesign**: Ongoing upgrade of furniture to 2px base and room tiles to 4px base (visual inconsistency during transition).
- **Railway Volatility**: Free tier lacks persistent storage; media requires external R2/S3 volume mounting.
- **SQLite Latency**: Large database sizes may see minor lag in `sql.js` file-write operations.

---

## 🗺️ Roadmap

1.  **Economy Layer**: Finalize coin rewards, tickets, and the `WalletManager`.
2.  **Navigation Expansion**: Implement multi-room support and door transitions.
3.  **Metagame Foundations**: Build the Milestone Tracker and Universal Shop.
4.  **Avatar Customization**: Deploy the Wardrobe system and outfit gifting.
5.  **Cat AI**: Launch the shared pet system with autonomous roaming.
6.  **Memory Wall**: Finalize the doodle canvas and chronological scrapbook.

---

## 🔑 Critical Invariants

These rules must **never** be violated in any implementation:

1.  **JSON is Authority**: No hardcoded content or filename-based logic.
2.  **Individual Wallets**: Coin balances are strictly separate, never merged.
3.  **Multiplayer Anti-Spam**: Live multiplayer games **never** award coins.
4.  **Safe Spawn Validation**: Finder algorithm runs on every connect and furniture drop.
5.  **Step-Trigger Doors**: Transitions are triggered by tile entry, not clicks.
6.  **Hand-Drawn Perspective**: No CSS/GPU rotation on sprites; all 4 directions are explicit assets.
7.  **AFK Meat-Wall Prevention**: Soft-collision fallback ensures players are never trapped.
8.  **Timezone Synchronicity**: All daily resets follow User 2's timezone.
9.  **Platform Parity**: 100% feature equality between PC (Mouse/KB) and Mobile (Touch).
