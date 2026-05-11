-- Migration: Performance Indexes (P1-L)
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_user_id ON schedule_blocks(user_id);
