-- Phase 1: Add plaintext content column to messages
ALTER TABLE messages ADD COLUMN content TEXT; 

-- Phase 1.1: Create FTS4 virtual table for searching
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts4(content);

-- Triggers to keep FTS index in sync with the main messages table
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages WHEN new.content IS NOT NULL BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages WHEN new.content IS NOT NULL BEGIN
  DELETE FROM messages_fts WHERE rowid = old.id;
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;
