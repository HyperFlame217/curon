-- 002_extended_optimization.sql
-- Further index optimizations for Curon House and Core Systems

-- 1. Optimized Message Visibility Stats
-- Used for SELECT COUNT(*) WHERE deleted_by_a=0 AND deleted_by_b=0
CREATE INDEX IF NOT EXISTS idx_messages_visibility ON messages(deleted_by_a, deleted_by_b);

-- 2. Furniture Persistence & Hierarchy
-- Used for room-specific furniture fetching and attached item lookups
CREATE INDEX IF NOT EXISTS idx_houses_room_parent ON houses(room_id, parent_id);

-- 3. Milestones Timeline
-- Used for SELECT * FROM milestones ORDER BY date ASC
CREATE INDEX IF NOT EXISTS idx_milestones_date ON milestones(date);

-- 4. Calendar & Schedule Performance
-- Used for time-range lookups and user-specific day views
CREATE INDEX IF NOT EXISTS idx_events_time_range ON events(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_schedule_user_day ON schedule_blocks(user_id, day_type);

-- 5. General Notes Performance
-- Used for chronologically sorted notes
CREATE INDEX IF NOT EXISTS idx_notes_created_at_desc ON notes(created_at DESC);
