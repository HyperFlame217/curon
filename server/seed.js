require('dotenv').config();
const bcrypt    = require('bcryptjs');
const dbPromise = require('./db');

const USERS = [
  { username: 'iron', password: '1' },
  { username: 'cubby', password: '2' },
];

(async () => {
  const db = await dbPromise;
  for (const u of USERS) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
    if (exists) { console.log(`  skip   ${u.username}`); continue; }
    const hash = await bcrypt.hash(u.password, 12);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(u.username, hash);
    console.log(`  seeded ${u.username}`);
  }
  console.log('\nDone.');
  process.exit(0);
})();
