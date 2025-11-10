import './env.mjs';
import amqp from 'amqplib';
import { handleInsertion } from './services/pocketbase-for-yt.mjs';
import { broadcast } from './socket/broadcast.mjs';
import { pluginManager } from './plugin-manager.mjs';

const RABBITMQ_URL = process.env.RABBIT_MQ_URL || 'amqp://localhost';
const QUEUE_NAME = process.env.DOWNLOAD_QUEUE || 'download_queue';

async function startWorker() {
    try {
        console.log('Loading plugins...');
        await pluginManager.loadPlugins();
        console.log('Plugins loaded successfully');


        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        channel.prefetch(1);

        console.log('Worker waiting for downloads...');

        channel.consume(QUEUE_NAME, async (msg) => {
            if (msg !== null) {
                const { vid_id } = JSON.parse(msg.content.toString());

                console.log(`Processing: ${vid_id}`);
                broadcast(`Processing: ${vid_id}`);

                try {
                    await startDownload(vid_id);
                    console.log(`Completed: ${vid_id}`);
                    broadcast(`Completed: ${vid_id}`);
                    channel.ack(msg);
                } catch (error) {
                    console.error(`Failed: ${vid_id}`, error);
                    broadcast(`Failed: ${vid_id}`);
                    channel.nack(msg, false, false);
                }
            }
        });
    } catch (error) {
        console.error('Worker error:', error);
        broadcast(`Worker error: ${error}`);
        setTimeout(startWorker, 5000);
    }
}

async function startDownload(vid_id) {
    try {
        await handleInsertion(vid_id);
    } catch (error) {
        throw error;
    }
}

startWorker().catch(console.error);