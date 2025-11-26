const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let players = new Map();
let nextId = 1;
let roundDuration = 30;
let breakDuration = 10;
let timeLeft = 0;
let roundRunning = false;
let tickInterval = null;

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

function startRound() {
  for (const p of players.values()) p.score = 0;
  timeLeft = roundDuration;
  roundRunning = true;
  broadcast({ type: 'round_start', timeLeft });

  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    timeLeft--;
    broadcastState();
    if (timeLeft <= 0) {
      clearInterval(tickInterval);
      endRound();
    }
  }, 1000);
}

function broadcastState() {
  const playersArr = Array.from(players.values()).map(p => ({
    id: p.id,
    name: p.name,
    score: p.score
  }));
  broadcast({ type: 'state', players: playersArr, timeLeft });
}

function endRound() {
  roundRunning = false;
  let maxScore = -Infinity;
  for (const p of players.values()) if (p.score > maxScore) maxScore = p.score;
  const winners = Array.from(players.values()).filter(p => p.score === maxScore && maxScore > -Infinity);
  const winnerNames = winners.length ? winners.map(w => w.name) : [];

  const scores = {};
  for (const p of players.values()) scores[p.name] = p.score;

  broadcast({ type: 'game_over', winner: winnerNames.length === 1 ? winnerNames[0] : winnerNames, scores });

  setTimeout(() => {
    if (players.size > 0) startRound();
  }, breakDuration * 1000);
}

wss.on('connection', (ws, req) => {
  const url = req.url || '';
  const params = new URL('http://x' + url).searchParams;
  const nameParam = params.get('name');

  const id = String(nextId++);
  const name = nameParam ? String(nameParam).slice(0, 20) : `Player${id}`;

  players.set(id, { id, name, score: 0, ws });

  ws.send(JSON.stringify({ type: 'assign_id', id, name }));
  broadcastState();

  if (!roundRunning) {
    setTimeout(() => {
      if (!roundRunning && players.size > 0) startRound();
    }, 1000);
  }

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    if (msg.type === 'click') {
      const p = players.get(id);
      if (p && roundRunning) p.score += 1;
      broadcastState();
    } else if (msg.type === 'set_name') {
      const p = players.get(id);
      if (p) {
        p.name = String(msg.name).slice(0, 20);
        broadcastState();
      }
    } else if (msg.type === 'start') {
      if (!roundRunning) startRound();
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcastState();
  });
});
