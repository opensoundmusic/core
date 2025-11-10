import express from 'express';
import { pluginManager } from '../plugin-manager.mjs';
import { channel, DOWNLOAD_QUEUE } from '../server.mjs';

const router = express.Router();

// Helper function to check if YouTube Music plugin is available
function checkYouTubeMusicPlugin(res) {
    const ytMusicPlugin = pluginManager.getPlugin('ytmusic-plugin');

    if (!ytMusicPlugin) {
        res.status(503).json({
            error: 'YouTube Music plugin not installed',
            message: 'Please install the youtube-music plugin to use this feature'
        });
        return null;
    }

    return ytMusicPlugin;
}

// Download single song
router.post('/download', async (req, res) => {
    try {
        const ytMusicPlugin = checkYouTubeMusicPlugin(res);
        if (!ytMusicPlugin) return;

        if (!req.body || !req.body.vid_id) {
            return res.status(400).send({
                error: "please provide the video id"
            });
        }

        const { vid_id } = req.body;

        // Send to queue
        const message = JSON.stringify({ vid_id, timestamp: Date.now() });
        channel.sendToQueue(DOWNLOAD_QUEUE, Buffer.from(message), {
            persistent: true
        });

        console.log(`Added to queue: ${vid_id}`);

        return res.status(202).send({
            success: true,
            message: 'Download queued successfully',
            vid_id
        });

    } catch (e) {
        console.error('Error:', e);
        return res.status(500).send({ error: e.message || e });
    }
});

// Download batch
router.post("/download-batch", async (req, res) => {
    try {
        const ytMusicPlugin = checkYouTubeMusicPlugin(res);
        if (!ytMusicPlugin) return;
        if (!req.body || !req.body.ids) {
            return res.status(400).send({
                error: "please provide the list of video id's to start the batch"
            });
        }

        const { ids } = req.body;
        let vidList = Array.from(ids);

        // Send to queue
        vidList.forEach(id => {
            const message = JSON.stringify({ vid_id: id, timestamp: Date.now() });
            channel.sendToQueue(DOWNLOAD_QUEUE, Buffer.from(message), {
                persistent: true
            });
        });

        console.log(`Added to queue: ${ids}`);

        return res.status(202).send({
            success: true,
            message: 'Download queued successfully',
            ids
        });

    } catch (e) {
        console.error('Error:', e);
        return res.status(500).send({ error: e.message || e });
    }
});

// Search songs - requires YouTube Music plugin
router.get('/search', async (req, res) => {
    const ytMusicPlugin = checkYouTubeMusicPlugin(res);
    if (!ytMusicPlugin) return;

    try {
        const { q, type } = req.query;

        if (!q) {
            return res.status(400).send({
                error: "please provide a search query"
            });
        }

        const result = await ytMusicPlugin.module.default.search(q, type);
        return res.status(200).send(result);
    } catch (e) {
        console.log(`Error:`, e);
        return res.status(500).send({ error: e.message || e });
    }
});

export default router;