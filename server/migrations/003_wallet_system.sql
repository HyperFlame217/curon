-- 003_wallet_system.sql
-- Add economy tracking fields to the user_coins table

-- 1. Daily Message Cap Tracking
-- Tracks how many chat messages awarded coins today
ALTER TABLE user_coins ADD COLUMN daily_msg_count INTEGER DEFAULT 0;

-- 2. Daily Reset Timestamp
-- Stores the Unix timestamp of when the daily counter was last reset
ALTER TABLE user_coins ADD COLUMN last_msg_reset INTEGER DEFAULT (strftime('%s','now'));

-- 3. User Timezone Preference
-- Used for the midnight reset logic (tied to User 2 / Partner's timezone)
ALTER TABLE user_coins ADD COLUMN user_timezone TEXT DEFAULT 'UTC';
