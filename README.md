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
curon/
├── server/
│   ├── index.js          # Entry point & route registration
│   ├── db.js             # sql.js wrapper + schema migrations
│   ├── auth.js           # JWT middleware
│   ├── crypto.js         # Server-side cipher validation
│   ├── seed.js           # One-time user setup
│   ├── routes/           # REST API (Notes, Stats, Calendar, Spotify, Emojis, Avatars)
│   └── ws/               # WebSocket handlers (Chat, Presence, Signaling)
├── client/
│   └── index.html        # Monolithic client (HTML/CSS/JS)
├── storage/              # Persistent media and avatar storage
├── .env
└── package.json
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
- [x] **Media Gallery**: Encrypted photo/video sharing and GIF support.
- [x] **Shared Calendar**: Manage events and recurring milestones.
- [x] **Sync Schedule**: Visual timeline for daily routines and timezones.
- [x] **Spotify Sync**: See what each other is listening to in real-time.
- [x] **Voice & Video**: High-quality WebRTC calls for both desktop and mobile.
- [x] **Notes Board**: Pin shared notes to a virtual board.
