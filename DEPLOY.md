# DEPLOY.md — Curon Deployment Guide

Deploys Curon on **Render.com** (free tier) with **Supabase Storage** for media and database backups.

**No credit card required anywhere.**

---

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Render.com (Free)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Node.js (Express)                               │   │
│  │                                                  │   │
│  │  • auth, chat, calls, search, events, house     │   │
│  │  • sql.js (SQLite in memory → persisted to R2)  │   │
│  │  • UptimeRobot → GET /ping (keeps alive)         │   │
│  └──────────────────────────────────────────────────┘   │
│          │ uploads (POST)      │ serves (GET → 302)      │
│          ▼                       ▼                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Supabase Storage (Free)              │   │
│  │                                                  │   │
│  │  Bucket: curon-media (PUBLIC)                    │   │
│  │    • media/{id}.{ext}          ← uploads         │   │
│  │    • thumbnails/{id}.jpg       ← thumbnails      │   │
│  │    • emojis/{name}.{ext}       ← custom emojis   │   │
│  │                                                  │   │
│  │  Bucket: curon-db (PRIVATE)                      │   │
│  │    • backups/curon.db         ← DB snapshots     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  UptimeRobot (Free) monitors GET /ping every 5 min       │
│  → Prevents Render's 15-min idle spin-down               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Your Local Machine (Every 7 Days)           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  scripts/pull-backup.js                          │   │
│  │  • Downloads DB from Supabase → local archive    │   │
│  │  • Downloads media >14 days old → local archive  │   │
│  │  • Deletes those old media from Supabase          │   │
│  │  • Keeps DB on Supabase (always current)          │   │
│  └──────────────────────────────────────────────────┘   │
│  Output:                                                 │
│    ./backups/curon-2026-05-11.db                         │
│    ./backups/media-2026-05-11/{files...}                 │
│                                                         │
│  Schedule: Windows Task Scheduler / cron / manual        │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Supabase Setup (Free, No CC)

### 1.1 Create Account
1. Go to [supabase.com](https://supabase.com) → **Start your project**
2. Sign up with GitHub or email (no credit card required)
3. Verify your email

### 1.2 Create Project
1. Click **New project**
2. Name: `curon` (or anything)
3. Set a secure database password (not needed for storage, but required)
4. Choose a region close to you
5. Click **Create new project** (takes ~2 minutes)

### 1.3 Get Credentials
1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **service_role key** (NOT anon public key — this is the secret one for server-side)
3. Save these — they go into `.env`

### 1.4 Create Storage Buckets
1. Go to **Storage** → **Buckets** → **Create bucket**
2. **Bucket 1 — Media (public)**
   - Name: `curon-media`
   - Public bucket: ✅ **Checked**
   - Click **Create**
3. **Bucket 2 — DB backups (private)**
   - Name: `curon-db`
   - Public bucket: ❌ **Unchecked**
   - Click **Create**

### 1.5 Set CORS (if needed)
If files don't load in the app, go to Storage → Settings → add CORS rule:
```json
[
  {
    "origin": ["*"],
    "methods": ["GET", "HEAD"],
    "headers": ["*"]
  }
]
```

---

## 2. Render Setup (Free, No CC)

### 2.1 Create Account
1. Go to [render.com](https://render.com) → **Get Started**
2. Sign up with GitHub (this is required — Render deploys from your repos)
3. No credit card needed

### 2.2 Prepare Your Repo
Before connecting to Render, ensure your repo has:
- `package.json` with `"start": "node server/index.js"` ✅ (already set)
- All code changes from this guide committed

### 2.3 Create Web Service
1. Dashboard → **New** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `curon` (or anything)
   - **Region**: Choose closest to you
   - **Branch**: `main` (or your branch)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Plan**: **Free** ($0/month)
4. Click **Create Web Service**

### 2.4 Set Environment Variables
In your Render dashboard → **Environment** → add:

| Key | Value |
|---|---|
| `JWT_SECRET` | Same as your local `.env` (or generate a new one) |
| `EMOJI_ADMIN` | Your username (e.g., `iron`) |
| `KLIPY_API_KEY` | Your Klipy key from `.env` |
| `SPOTIFY_CLIENT_ID` | Your Spotify client ID |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify client secret |
| `SPOTIFY_REDIRECT_URI` | `https://curon.onrender.com/spotify/callback` (replace with your actual Render URL once deployed) |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Your `service_role` key |
| `SUPABASE_MEDIA_BUCKET` | `curon-media` |
| `SUPABASE_DB_BUCKET` | `curon-db` |

### 2.5 Deploy
- Render auto-deploys on push to the connected branch
- First deploy takes 2-5 minutes
- After deploy, your app is at `https://curon.onrender.com`

### 2.6 Update SPOTIFY_REDIRECT_URI
Once you know your Render URL:
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Find your app → **Edit Settings**
3. Add `https://curon.onrender.com/spotify/callback` to Redirect URIs
4. Update the `SPOTIFY_REDIRECT_URI` env var in Render dashboard
5. Re-deploy (Render usually auto-deploys, or click **Manual Deploy** → **Deploy latest commit**)

---

## 3. UptimeRobot Setup (Free, No CC)

This prevents Render from spinning down after 15 minutes of inactivity.

### 3.1 Create Account
1. Go to [uptimerobot.com](https://uptimerobot.com) → **Sign Up Free**
2. No credit card required

### 3.2 Create Monitor
1. Dashboard → **Add New Monitor**
2. Configure:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: `Curon Keep-Alive`
   - **URL**: `https://curon.onrender.com/ping` (replace with your Render URL)
   - **Interval**: 5 minutes
3. Click **Create Monitor**

That's it. UptimeRobot will ping your app every 5 minutes, keeping Render awake.

---

## 4. Local Backup Setup

### 4.1 Install

```bash
npm install   # (dependencies already include @supabase/supabase-js)
```

### 4.2 Required .env vars for local script

The backup script reads from `.env` in the project root. Ensure these are set:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
SUPABASE_MEDIA_BUCKET=curon-media
SUPABASE_DB_BUCKET=curon-db
```

### 4.3 Run Manually

```bash
node scripts/pull-backup.js
```

Output:
```
backups/
├── curon-2026-05-11.db
└── media-2026-05-11/
    ├── 1712345678-a1b2c3.jpg
    ├── 1712345888-d4e5f6.png
    └── ...
```

Log output:
```
[backup] Downloaded DB → backups/curon-2026-05-11.db (312 KB)
[backup] Downloaded 14 media files → backups/media-2026-05-11/
[backup] Deleted 14 old media files from Supabase (≥14 days old)
[backup] Kept 3 recent media files on Supabase (<14 days old)
[backup] Done.
```

### 4.4 Schedule Automatically

**Windows (Task Scheduler):**
1. Open **Task Scheduler**
2. Create Basic Task → name `Curon Backup`
3. Trigger: **Weekly** (choose day)
4. Action: **Start a program**
   - Program: `node`
   - Arguments: `scripts/pull-backup.js`
   - Start in: `D:\Projects & Work\Web Dev\curon`
5. Finish

**macOS/Linux (cron):**
```bash
crontab -e
# Add: run every Sunday at 3am
0 3 * * 0 cd /path/to/curon && node scripts/pull-backup.js >> backups/cron.log 2>&1
```

### 4.5 Retention

The backup script:
- **Downloads** DB snapshot with date-stamped filename (keeps all local copies)
- **Downloads** media files older than 14 days
- **Deletes** those media files from Supabase
- **Keeps** DB on Supabase (always the latest snapshot)
- **Keeps** recent media (<14 days) on Supabase for in-app display

To change the retention window, edit `MEDIA_RETENTION_DAYS` in `scripts/pull-backup.js`.

---

## 5. File Reference

### New Files Created

| File | Purpose |
|---|---|
| `server/supabase-storage.js` | Supabase Storage client — upload, delete, list, download |
| `scripts/pull-backup.js` | Local backup script — pull DB + media, delete old media from cloud |

### Files Modified

| File | What Changed |
|---|---|
| `package.json` | Added `@supabase/supabase-js` dependency |
| `server/routes/assets.js` | Multer: `diskStorage` → `memoryStorage`. Upload to Supabase instead of local disk. Serve via 302 redirect to Supabase public URL. |
| `server/db.js` | After `persist()` → upload DB to Supabase (`curon-db/backups/curon.db`). On boot → if no local DB, restore from Supabase. |
| `server/index.js` | Added `app.set('trust proxy', 1)` after helmet. Added CORS middleware. Added `GET /ping` keepalive route (returns 200 OK). |
| `client/js/calls.js` | Replaced TURN placeholder with OpenRelayProject config (free, no CC, no account). |
| `.env` | Added `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_MEDIA_BUCKET`, `SUPABASE_DB_BUCKET`. Updated `SPOTIFY_REDIRECT_URI` placeholder. Removed old R2 vars (if any). |

### Files Removed / Deprecated

| File | Reason |
|---|---|
| `server/storage/media/` | No longer needed — media lives in Supabase |
| `server/storage/thumbnails/` | No longer needed — thumbnails live in Supabase |
| `server/storage/emojis/` | No longer needed — emojis live in Supabase |

> **Note:** `server/storage/` can be deleted from the repo and added to `.gitignore`. The `mkdir -p` calls in `assets.js` for these directories are also removed.

---

## 6. How It Works — Data Flow

### 6.1 Media Upload

```
Client POST /media (file)   →   Express (validate JWT)
    →   multer (memoryStorage)   →   req.file.buffer (in memory)
    →   sharp (optional thumbnail)   →   thumbnail buffer
    →   supabase-storage.upload('curon-media', 'media/{filename}', buffer)
    →   supabase-storage.upload('curon-media', 'thumbnails/{filename}', thumbBuffer)
    →   DB INSERT into media table with filename
    →   Response: { id, mime_type, filename, size }
```

**Key details:**
- Files never touch disk (except OS temp via multer internal)
- Filenames are already randomized: `{timestamp}-{random}.{ext}`
- Thumbnails are 300px JPEG, quality 80
- `storage_provider` column in DB: no change needed (defaults to `'local'`, but we treat it as Supabase now)

### 6.2 Media Serve

```
Client <img src="/media/123">   →   Express (validate JWT via query/header)
    →   DB lookup: SELECT filename FROM media WHERE id = 123
    →   supabase-storage.getPublicUrl('curon-media', 'media/{filename}')
    →   302 Redirect to Supabase CDN URL
    →   Browser loads from Supabase edge network
```

**Auth:** Only authenticated users can initiate the redirect. The Supabase public URL itself has no auth, but the filename is unguessable (`1712345678-a1b2c3.jpg`).

**Thumbnails:** Same flow but with `thumbnails/{filename}` path.

**Custom Emojis:** Same pattern — `emojis/{filename}` path in the media bucket.

### 6.3 Database Persistence

```
Every mutation (INSERT/UPDATE/DELETE):
    sql.js (in-memory)   →   persist()   →   write to local curon.db (ephemeral)
                                        →   upload to Supabase: backups/curon.db

Server boot:
    Is curon.db on disk?   →   YES   →   load it (normal boot)
                         →   NO    →   download from Supabase   →   load it
                                     (Render cold start after spin-down)
```

**Why both local + Supabase:**
- Local: normal operation, fast reads/writes
- Supabase: recovery on cold start or redeploy
- If Supabase is unavailable on boot, the server starts with a fresh empty DB (graceful fallback)

### 6.4 Media Cleanup (Local Backup Script)

```
Every 7 days (local machine):
    1. List all files in curon-media bucket
    2. For each file:
         a. Is it older than 14 days?   →   YES   →   download → delete from Supabase
                                         →   NO    →   skip (keep on Supabase)
    3. Download curon.db from curon-db bucket → save locally (DO NOT delete from Supabase)
    4. Log summary
```

**Why 14 days (not 7):**
- Script runs every 7 days
- Delete threshold is 14 days (2 cycles)
- Ensures no gap — even if the script is a few days late, nothing is lost
- Recent week's media is always available in the app

---

## 7. Cold Start Behavior

Render free tier spins down after 15 minutes of inactivity.

### What happens on cold start:

1. First HTTP request arrives (from you, your partner, or UptimeRobot)
2. Render boots the container (~10-30 seconds)
3. `node server/index.js` starts:
   - `db.js` checks for `curon.db` on disk → not found (ephemeral storage was wiped)
   - Downloads `backups/curon.db` from Supabase → restores DB state ✓
   - Express routes initialize
   - Server starts listening
4. Request is processed (~30 seconds total delay)
5. Subsequent requests are instant

### What is preserved vs. lost:

| Data | On cold start | On redeploy |
|---|---|---|
| User accounts + messages | ✅ Restored from Supabase DB backup | ✅ Restored from Supabase DB backup |
| Media files | ✅ Served from Supabase CDN | ✅ Served from Supabase CDN |
| Custom emojis | ✅ Served from Supabase CDN | ✅ Served from Supabase CDN |
| SQLite DB on disk | ❌ Ephemeral — restored from Supabase | ❌ Ephemeral — restored from Supabase |
| Uploaded temp files | ❌ Not applicable (uploaded directly to Supabase) | ❌ Not applicable |

### Graceful degradation

If Supabase is unavailable during cold start (e.g., network issue):
- `db.js` logs a warning
- Starts with a fresh empty in-memory DB
- On next DB mutation, the DB backup to Supabase will retry
- No crash, no data loss (mutations work in-memory, just not persisted to cloud until Supabase is back)

---

## 8. Environment Variables — Reference

### File: `.env`

```env
# ── Server ────────────────────────────────────────────
PORT=3000

# ── Auth ──────────────────────────────────────────────
JWT_SECRET=your-secret-key-here

# ── Features ──────────────────────────────────────────
EMOJI_ADMIN=iron            # Username allowed to upload emojis
KLIPY_API_KEY=your-key      # GIF search API key

# ── Spotify (optional) ────────────────────────────────
SPOTIFY_CLIENT_ID=your-id
SPOTIFY_CLIENT_SECRET=your-secret
SPOTIFY_REDIRECT_URI=https://curon.onrender.com/spotify/callback

# ── Supabase Storage ──────────────────────────────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_MEDIA_BUCKET=curon-media
SUPABASE_DB_BUCKET=curon-db
```

### Supabase: `service_role` key vs `anon` key

| Key | Used where | Can do |
|---|---|---|
| `anon` | Frontend (EXPOSED to client) | Limited to configured table policies |
| `service_role` | Server-side ONLY (KEEP SECRET) | Bypasses all RLS — full bucket access |

**You must use `service_role`** in `.env` because the server needs to upload, list, and delete files. Never expose this key to the frontend.

---

## 9. Security Notes

| Concern | Mitigation |
|---|---|
| Supabase service_role key leak | Stored in `.env` and Render env vars. Never sent to client. |
| Media files publicly accessible | Random filenames (unguessable). Server validates JWT before returning the URL. |
| DB backup in private bucket | `curon-db` bucket is PRIVATE. Only server can read/write via service_role key. |
| TURN credentials | OpenRelayProject is public (no auth needed). Safe to embed in client JS. |
| Render exposed PORT | Already handled — reads `process.env.PORT` (Render sets this). |
| Rate limiting behind proxy | `app.set('trust proxy', 1)` ensures rate-limiter sees real client IP. |

---

## 10. Troubleshooting

### Media not loading
1. Check if Supabase bucket is public (`curon-media`)
2. Check CORS settings in Supabase Storage settings
3. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in env vars
4. Check server logs for "Supabase upload failed" or "Supabase serve error"

### DB not persisting across cold starts
1. Check `curon-db` bucket exists and is private
2. Check `SUPABASE_DB_BUCKET` env var is set
3. Check server boot logs for "Restored DB from Supabase backup"
4. If it says "Starting with empty DB", there was no backup found

### First load is very slow
That's normal on Render free tier. Cold start takes ~30s. UptimeRobot prevents this after the first load.

### Backup script fails
1. Check `.env` has correct Supabase credentials
2. Check network connectivity
3. Run with `node scripts/pull-backup.js` to see error output
4. Common issue: `SUPABASE_SERVICE_KEY` has been reset (regenerate in Supabase dashboard)

### Rate limiting blocking legitimate requests
- The rate limiter uses IP address. Behind Render's proxy, `trust proxy` fixes this.
- Verify `app.set('trust proxy', 1)` is present in `server/index.js`

---

## 11. Quick-Start Checklist

- [ ] Supabase account created
- [ ] Supabase project created → URL + service_role key copied
- [ ] `curon-media` bucket created (public)
- [ ] `curon-db` bucket created (private)
- [ ] All 8 code changes implemented and committed to GitHub
- [ ] Render account created (no CC)
- [ ] Render Web Service created → GitHub connected
- [ ] All env vars added to Render dashboard
- [ ] First deploy succeeds
- [ ] Spotify redirect URI updated (if using Spotify)
- [ ] UptimeRobot account created
- [ ] UptimeRobot monitor created → pings `/ping` every 5 min
- [ ] `node scripts/pull-backup.js` runs successfully locally
- [ ] Weekly backup scheduled (Task Scheduler / cron)