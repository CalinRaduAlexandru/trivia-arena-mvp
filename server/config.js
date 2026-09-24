const debug = process.env.DEBUG_GAME === 'true';
module.exports = {
  port: Number(process.env.PORT || 3000), jwtSecret: process.env.JWT_SECRET || 'trivia-arena-dev-secret', debug,
  arena: { width: 2400, height: 1400, roundMs: debug ? 90_000 : 300_000, tickMs: 50, speed: 310, maxSpeed: 310, netSpeed: 680, netRange: 240, minMass: 28, duelMs: debug ? 12_000 : 8_000, cooldownMs: 2_000, transfer: 10, wrongPenalty: 3, baseMass: 52 },
  skins: [
    { id: 'default', name: 'Default', threshold: 0, color: '#6ee7f9' }, { id: 'rookie', name: 'Rookie', threshold: 10, color: '#a78bfa' },
    { id: 'electric', name: 'Electric', threshold: 100, color: '#facc15' }, { id: 'fire', name: 'Fire', threshold: 1000, color: '#fb7185' }, { id: 'legendary', name: 'Legendary', threshold: 10000, color: '#f59e0b' }
  ]
};
