import '../env.mjs';
import PocketBase from 'pocketbase';
import fs from 'fs';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import path from 'path';
import { pathToFileURL } from 'url';
import fetch from 'node-fetch';
import { unlink } from 'fs/promises';
import { pluginManager } from '../plugin-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POCKETBASE_ADDR = process.env.POCKETBASE_ADDR;

const pb = new PocketBase(POCKETBASE_ADDR);
const email = process.env.EMAIL;
const password = process.env.PASSWORD;

// Helper function to get YouTube Music plugin
function getYouTubeMusicPlugin() {
    const plugin = pluginManager.getPlugin('ytmusic-plugin');
    if (!plugin) {
        throw new Error('YouTube Music plugin is required but not installed');
    }
    return plugin;
}

// Helper function to dynamically import plugin functions
async function getPluginFunctions() {
    const plugin = getYouTubeMusicPlugin();
    
    const songInfoPath = path.join(plugin.path, 'functions/song_info.mjs');
    const coverDownloadPath = path.join(plugin.path, 'functions/cover_download.mjs');
    const songDownloadPath = path.join(plugin.path, 'functions/song_download.js');
    
    const songInfoModule = await import(pathToFileURL(songInfoPath).href);
    const coverDownloadModule = await import(pathToFileURL(coverDownloadPath).href);
    const songDownloadModule = await import(pathToFileURL(songDownloadPath).href);
    
    return {
        getSongInfo: songInfoModule.getSongInfo,
        downloadCovers: coverDownloadModule.downloadCovers,
        downloadArtistAvatars: coverDownloadModule.downloadArtistAvatars,
        download: songDownloadModule.download
    };
}

export async function pocketbaseInit() {
    try {
        await pb.collection('_superusers').authWithPassword(email, password);
        console.log("pocketbase init complete...");
    } catch (error) {
        console.log(error);
    }
}

export async function insertSongData(data, downloadCovers) {
    try {
        const filePath = path.resolve(__dirname, '../plugins/ytmusic-plugin/downloads', `${data.yt_id}.mp3`);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const stats = fs.statSync(filePath);
        console.log(`File: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        const formData = new FormData();

        formData.append("title", data.title);
        formData.append("duration", data.duration);
        formData.append("artist", data.artistId);
        formData.append("yt_id", data.yt_id);
        formData.append("lyrics", data.lyrics);

        console.log('Downloading cover images...');
        const covers = await downloadCovers(data.cover);

        if (covers.cover_sm) {
            formData.append('cover_sm', covers.cover_sm.buffer, {
                filename: `${data.yt_id}_sm.jpg`,
                contentType: covers.cover_sm.contentType
            });
            console.log('Added cover_sm');
        }

        if (covers.cover_lg) {
            formData.append('cover_lg', covers.cover_lg.buffer, {
                filename: `${data.yt_id}_lg.jpg`,
                contentType: covers.cover_lg.contentType
            });
            console.log('Added cover_lg');
        }

        if (covers.cover_xl) {
            formData.append('cover_xl', covers.cover_xl.buffer, {
                filename: `${data.yt_id}_xl.jpg`,
                contentType: covers.cover_xl.contentType
            });
            console.log('Added cover_xl');
        }

        const fileStream = fs.createReadStream(filePath);
        formData.append('song', fileStream, {
            filename: `${data.yt_id}.mp3`,
            contentType: 'audio/mpeg',
            knownLength: stats.size
        });

        const response = await fetch(`${POCKETBASE_ADDR}/api/collections/songs/records`, {
            method: 'POST',
            headers: {
                ...formData.getHeaders(),
                'Authorization': pb.authStore.token
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }

        const record = await response.json();
        console.log(`song: ${data.title} successfully inserted (ID: ${record.id})`);

        console.log(`cleaning the audio file at: ${filePath}`);
        await unlink(filePath);

        return record;

    } catch (error) {
        console.error(`failed to insert song:`, error.message);
        throw error;
    }
}

export async function checkArtistAvailable(ytId) {
    try {
        const record = await pb.collection('artists').getFirstListItem(`yt_id = "${ytId}"`);
        console.log(`artist is found at id: ${record.id}`);

        return record;

    } catch (error) {
        console.log("artist is not found...");
        return null;
    }
}

export async function checkSongAvailable(ytId) {
    try {
        const record = await pb.collection('songs').getFirstListItem(`yt_id = "${ytId}"`);
        console.log(`song is found at id: ${record.id}`);

        return record;

    } catch (error) {
        console.log("song is not found...");
        return null;
    }
}

export async function insertNewArtist(data, downloadArtistAvatars) {
    try {
        const formData = new FormData();

        formData.append("name", data.name);
        formData.append("yt_id", data.yt_id);

        console.log('Downloading avatar images...');
        const avatars = await downloadArtistAvatars(data.avatar);

        if (avatars.avatar_sm) {
            formData.append('avatar_sm', avatars.avatar_sm.buffer, {
                filename: `${data.yt_id}_sm.jpg`,
                contentType: avatars.avatar_sm.contentType
            });
            console.log('Added avatar_sm');
        }

        if (avatars.avatar_lg) {
            formData.append('avatar_lg', avatars.avatar_lg.buffer, {
                filename: `${data.yt_id}_lg.jpg`,
                contentType: avatars.avatar_lg.contentType
            });
            console.log('Added avatar_lg');
        }

        if (avatars.avatar_xl) {
            formData.append('avatar_xl', avatars.avatar_xl.buffer, {
                filename: `${data.yt_id}_xl.jpg`,
                contentType: avatars.avatar_xl.contentType
            });
            console.log('Added avatar_xl');
        }

        const response = await fetch(`${POCKETBASE_ADDR}/api/collections/artists/records`, {
            method: 'POST',
            headers: {
                ...formData.getHeaders(),
                'Authorization': pb.authStore.token
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }

        const record = await response.json();
        console.log(`artist: ${data.name} successfully inserted (ID: ${record.id})`);

        return record;

    } catch (error) {
        console.log(error);
        throw error;
    }
}

export async function handleInsertion(id) {
    try {
        // Check if YouTube Music plugin is installed
        if (!pluginManager.hasPlugin('ytmusic-plugin')) {
            throw new Error('YouTube Music plugin is required for song insertion. Please install it first.');
        }

        const song = await checkSongAvailable(id);
        if (song) {
            console.log(`Song ${id} already exists, skipping...`);
            return;
        }

        // Get plugin functions dynamically
        const { getSongInfo, downloadCovers, downloadArtistAvatars, download } = await getPluginFunctions();

        console.log(`Downloading ${id}...`);
        await download(id);

        let data = await getSongInfo(id);
        const artistRecord = await checkArtistAvailable(data.artist.yt_id);
        let artistId = artistRecord?.id || null;

        if (!artistRecord) {
            const record = await insertNewArtist(data.artist, downloadArtistAvatars);
            artistId = record.id;
        }

        data.artistId = artistId;

        await insertSongData(data, downloadCovers);

    } catch (error) {
        console.log(error);
        throw error;
    }
}