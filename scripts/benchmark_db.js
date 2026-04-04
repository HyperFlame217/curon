const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// ── CONFIGURATION — DON'T TOUCH PRODUCTION DB ────────────────
const TEST_DB_PATH = 'benchmark.db';

async function runBenchmark() {
  const SQL = await initSqlJs();
  // Create a brand new in-memory database or load from a temp file
  const rawDb = new SQL.Database();
  
  // Setup the minimal schema needed for benchmarking
  rawDb.run(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      encrypted_content_a TEXT,
      encrypted_content_b TEXT,
      encrypted_key_a TEXT,
      encrypted_key_b TEXT,
      iv TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT,
      UNIQUE(message_id, user_id, emoji)
    );
     CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
     CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
     CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
  `);

  const iterations = 200;
  
  console.log(`[Safe-Benchmark] Running 200 iterations on ISOLATED temp DB...`);
  const results = [];
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    const iterStart = Date.now();
    
    rawDb.run(`
      INSERT INTO messages (sender_id, encrypted_content_a, encrypted_content_b, encrypted_key_a, encrypted_key_b, iv)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [1, `content_opt_${i}`, 'content_b', 'key_a', 'key_b', 'iv_test']);

    const rows = rawDb.exec('SELECT id FROM messages WHERE sender_id = 1 ORDER BY created_at DESC LIMIT 10');
    
    rawDb.run('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [i + 1, 1, '🔥']);
    
    results.push(Date.now() - iterStart);
  }

  const totalTime = Date.now() - start;
  const avgTime = totalTime / iterations;
  
  console.log(`[Safe-Benchmark] Completed: ${totalTime}ms total`);
  console.log(`[Safe-Benchmark] Average per iteration: ${avgTime.toFixed(2)}ms`); 
  
  return { totalTime, avgTime };
}

runBenchmark().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
