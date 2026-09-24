# Trivia Arena

A runnable multiplayer trivia arena MVP built with vanilla HTML/CSS/JS, Canvas, Node.js, Express, Socket.IO, and SQLite.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000> in two browser windows. Create two accounts, create a room in the first window, join with the four-character code in the second, and start the game. Use WASD or arrow keys to collide. The authoritative server resolves movement, collisions, questions, duel timers, mass, and permanent progression.

For production-like local testing, use `npm start`. Optional `.env` values are documented in `.env.example`:

```bash
PORT=3000
JWT_SECRET=use-a-long-random-secret
DEBUG_GAME=false
```

`DEBUG_GAME=true` shortens rounds and duels for faster manual testing. Data is stored in `data/trivia-arena.sqlite`, which is intentionally ignored by git. A deployment host must support long-lived WebSocket connections and persistent disk for SQLite. Set a strong `JWT_SECRET` in deployment.

## Important files

- `server/server.js` — HTTP API, Socket.IO events, rooms, authoritative game loop and duels
- `server/db.js` — SQLite schema and persistence helpers
- `server/config.js` — arena tuning values and skin thresholds
- `server/questions.js` — local question bank and question selection
- `public/index.html`, `public/css/style.css`, `public/js/app.js` — UI, Canvas rendering, input, and networking

## MVP limitations

The server is designed for one Node process and SQLite is not horizontally shared. Refreshing requires rejoining a room. Touch controls, audio tones, room persistence across restarts, and deployment-specific database backups are not included. Late joins are rejected after a round starts.

## Good next improvements

1. Add reconnect tokens and graceful room rejoin.
2. Add generated Web Audio effects for collisions, answers, wins, and unlocks.
3. Move persistence behind a repository interface and add PostgreSQL support.
4. Add automated browser/socket integration tests for the acceptance flow.
5. Add touch joystick controls and accessibility polish for the duel overlay.
