import { WebSocketServer } from 'ws';
import '../env.mjs';
import { broadcast } from './broadcast.mjs';

const port = process.env.WWS_PORT;

const wss = new WebSocketServer({ port: port });
console.log(`WebSocket server running on ws://localhost:${port}`);

function heartbeat() {
    this.isAlive = true;
}

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`ip: ${ip}`);

    ws.isAlive = true;
    ws.on('error', console.error);
    ws.on('pong', heartbeat);
    console.log('Client connected');
    broadcast({status:'connected'});
});


const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

export default wss;