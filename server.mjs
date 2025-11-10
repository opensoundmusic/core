import './env.mjs';
import { configDotenv } from "dotenv";
import amqp from 'amqplib';
import express from 'express';
import { pocketbaseInit } from "./services/pocketbase-for-yt.mjs";
import songRoutes from "./routes/songs.mjs";
import wss from './socket/websocket.mjs';
import { setWss, initBroadcastListener, wssInstance } from './socket/broadcast.mjs';
import { pluginManager } from './plugin-manager.mjs';
import pluginRoutes from './routes/plugins.mjs';

setWss(wss);

const app = express();
app.use(express.json());

configDotenv();
const PORT = process.env.PORT || 1212;

export const RABBITMQ_URL = process.env.RABBIT_MQ_URL || 'amqp://localhost';
export const DOWNLOAD_QUEUE = process.env.DOWNLOAD_QUEUE || 'download_queue';

export let channel;

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(DOWNLOAD_QUEUE, { durable: true });
        console.log('Connected to RabbitMQ');

        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
        });

        connection.on('close', () => {
            console.log('RabbitMQ connection closed, reconnecting...');
            setTimeout(connectRabbitMQ, 5000);
        });
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(connectRabbitMQ, 5000);
    }
}

async function loadPlugins() {
    await pluginManager.loadPlugins();

    const plugins = pluginManager.getAllPlugins();
    plugins.forEach(plugin => {
        if (plugin.module.default?.getRouter) {
            const router = plugin.module.default.getRouter();
            app.use(`/plugins/${plugin.name}`, router);
            console.log(`Registered routes for plugin: ${plugin.name}`);
        }
    });
}

app.get('/', (req, res) => {
    res.send('Hello from Express with ES Modules!');
});

app.use('/song', songRoutes);
app.use('/plugins', pluginRoutes);

app.get('/plugins', (req, res) => {
    const plugins = pluginManager.getAllPlugins().map(p => ({
        name: p.name,
        version: p.version,
        description: p.description,
        enabled: p.manifest.enabled
    }));
    res.json({ plugins });
});

app.get('/health', (req, res) => {
    res.send({ 
        status: 'ok', 
        queue: DOWNLOAD_QUEUE, 
        wss: (wssInstance !== null),
        plugins: pluginManager.getAllPlugins().length
    });
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await connectRabbitMQ();
    await initBroadcastListener();
    await pocketbaseInit();
    await loadPlugins();
});
