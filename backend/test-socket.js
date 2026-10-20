// Quick Socket.IO test: joins the /live namespace and prints what it receives.
// Used for the Phase 4 acceptance check (run from backend/ so socket.io resolves).
const { io } = require('socket.io-client');

const shareId = process.argv[2];
if (!shareId) {
  console.error('usage: node test-socket.js <shareId>');
  process.exit(1);
}

const socket = io('http://localhost:3000/live', { transports: ['websocket'] });
let heard = 0;

socket.on('connect', () => {
  console.log('connected');
  socket.emit('join', shareId, (ack) => {
    console.log('join ack:', JSON.stringify(ack));
  });
});

socket.on('location', (payload) => {
  heard += 1;
  console.log('location event', heard, JSON.stringify(payload));
  if (heard >= 3) {
    socket.disconnect();
    process.exit(0);
  }
});

socket.on('session:ended', (payload) => {
  console.log('session:ended', JSON.stringify(payload));
});

socket.on('connect_error', (err) => {
  console.error('connect_error:', err.message);
});

setTimeout(() => {
  console.error('timeout: only heard', heard, 'locations');
  process.exit(1);
}, 30000);
