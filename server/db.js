const fs = require('fs'); const path = require('path'); const Database = require('better-sqlite3');
const dir = path.join(__dirname, '..', 'data'); fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'trivia-arena.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, correct INTEGER NOT NULL DEFAULT 0, answered INTEGER NOT NULL DEFAULT 0, duel_wins INTEGER NOT NULL DEFAULT 0, duel_losses INTEGER NOT NULL DEFAULT 0, equipped_skin TEXT NOT NULL DEFAULT 'default', unlocked_skins TEXT NOT NULL DEFAULT '["default"]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
db.exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
const stmts = { byName: db.prepare('SELECT * FROM users WHERE username = ?'), byId: db.prepare('SELECT * FROM users WHERE id = ?'), create: db.prepare('INSERT INTO users (username,password_hash) VALUES (?,?)'), update: db.prepare('UPDATE users SET correct=?,answered=?,duel_wins=?,duel_losses=?,equipped_skin=?,unlocked_skins=? WHERE id=?'), session: db.prepare('INSERT OR REPLACE INTO sessions(token,user_id) VALUES (?,?)'), getSession: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?'), deleteSession: db.prepare('DELETE FROM sessions WHERE token=?') };
function publicUser(u) { return { id:u.id, username:u.username, correct:u.correct, answered:u.answered, duelWins:u.duel_wins, duelLosses:u.duel_losses, equippedSkin:u.equipped_skin, unlockedSkins:JSON.parse(u.unlocked_skins) }; }
function saveUser(u) { stmts.update.run(u.correct,u.answered,u.duel_wins,u.duel_losses,u.equipped_skin,JSON.stringify(u.unlocked_skins),u.id); }
module.exports = { db, stmts, publicUser, saveUser };
