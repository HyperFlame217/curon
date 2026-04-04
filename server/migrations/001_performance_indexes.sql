-- 001_performance_indexes.sql
-- Optimizing Curon for high-frequency real-time messaging

-- Chat history and message searches
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON messages(reply_to_id);

-- Reaction sync speed
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON reactions(user_id);

-- House furniture fetching
CREATE INDEX IF NOT EXISTS idx_houses_room_id ON houses(room_id);
CREATE INDEX IF NOT EXISTS idx_houses_parent_id ON houses(parent_id);

-- User lookups for public keys
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Media gallery performance
CREATE INDEX IF NOT EXISTS idx_media_uploader_id ON media(uploader_id);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);

-- EMERGENCY REMEDIATION (Phase 1 Fix)
-- Purge benchmark-corrupted messages and their reactions
DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE iv = 'iv_test');
DELETE FROM messages WHERE iv = 'iv_test';

-- Clean up accidental reactions added to legitimate messages (IDs 1-200 targeted by benchmark)
-- Remove 🔥 from user 1 on original 39 messages
DELETE FROM reactions WHERE user_id = 1 AND emoji = '🔥' AND message_id <= 39;
