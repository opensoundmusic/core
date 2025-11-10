import express from 'express';
import { pluginManager } from '../plugin-manager.mjs';

const router = express.Router();

// GitHub configuration
const GITHUB_ORG = 'opensoundmusic';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;

// Get all installed plugins
router.get('/', (req, res) => {
    try {
        const plugins = pluginManager.getAllPlugins().map(p => ({
            id: p.name,
            name: p.manifest.displayName || p.name,
            version: p.version,
            description: p.description,
            author: p.manifest.author,
            enabled: p.manifest.enabled,
            category: p.manifest.category || 'other',
            tags: p.manifest.tags || []
        }));
        res.json({ success: true, plugins });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get marketplace/available plugins
router.get('/marketplace', async (req, res) => {
    try {
        const { refresh } = req.query;
        
        if (refresh === 'true') {
            pluginManager.clearMarketplaceCache();
        }

        const plugins = await pluginManager.fetchMarketplace(GITHUB_ORG, GITHUB_TOKEN);
        
        res.json({ 
            success: true, 
            organization: GITHUB_ORG,
            total: plugins.length,
            plugins 
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch marketplace', 
            message: error.message 
        });
    }
});

// Get specific plugin info
router.get('/:pluginId', (req, res) => {
    try {
        const { pluginId } = req.params;
        const plugin = pluginManager.getPlugin(pluginId);

        if (!plugin) {
            return res.status(404).json({ 
                error: 'Plugin not found',
                message: `Plugin ${pluginId} is not installed`
            });
        }

        res.json({
            success: true,
            plugin: {
                id: plugin.name,
                name: plugin.manifest.displayName || plugin.name,
                version: plugin.version,
                description: plugin.description,
                author: plugin.manifest.author,
                enabled: plugin.manifest.enabled,
                category: plugin.manifest.category || 'other',
                tags: plugin.manifest.tags || [],
                dependencies: plugin.manifest.dependencies || {},
                routes: plugin.manifest.routes || []
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Install plugin
router.post('/install', async (req, res) => {
    try {
        const { pluginId } = req.body;

        if (!pluginId) {
            return res.status(400).json({ 
                error: 'pluginId is required' 
            });
        }

        const result = await pluginManager.installPlugin(
            pluginId, 
            GITHUB_ORG, 
            GITHUB_TOKEN
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            error: 'Installation failed', 
            message: error.message 
        });
    }
});

// Uninstall plugin
router.post('/uninstall', async (req, res) => {
    try {
        const { pluginId } = req.body;

        if (!pluginId) {
            return res.status(400).json({ 
                error: 'pluginId is required' 
            });
        }

        const result = await pluginManager.uninstallPlugin(pluginId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            error: 'Uninstall failed', 
            message: error.message 
        });
    }
});

// Update plugin
router.post('/update', async (req, res) => {
    try {
        const { pluginId } = req.body;

        if (!pluginId) {
            return res.status(400).json({ 
                error: 'pluginId is required' 
            });
        }

        const result = await pluginManager.updatePlugin(pluginId, GITHUB_ORG);
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            error: 'Update failed', 
            message: error.message 
        });
    }
});

// Enable/Disable plugin
router.post('/:pluginId/toggle', async (req, res) => {
    try {
        const { pluginId } = req.params;
        const plugin = pluginManager.getPlugin(pluginId);

        if (!plugin) {
            return res.status(404).json({ 
                error: 'Plugin not found' 
            });
        }

        const manifestPath = path.join(plugin.path, 'plugin.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        
        manifest.enabled = !manifest.enabled;
        
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        res.json({
            success: true,
            message: `Plugin ${pluginId} ${manifest.enabled ? 'enabled' : 'disabled'}`,
            enabled: manifest.enabled
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
