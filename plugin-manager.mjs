import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.pluginsDir = path.join(__dirname, 'plugins');
        this.marketplaceCache = null;
        this.marketplaceCacheTime = null;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        
        console.log('=== PLUGIN MANAGER DEBUG ===');
        console.log('__filename:', __filename);
        console.log('__dirname:', __dirname);
        console.log('pluginsDir:', this.pluginsDir);
        console.log('pluginsDir exists:', fs.existsSync(this.pluginsDir));
        console.log('===========================');
    }

    async loadPlugins() {
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true });
            console.log('Created plugins directory');
        }

        const pluginDirs = fs.readdirSync(this.pluginsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const pluginDir of pluginDirs) {
            await this.loadPlugin(pluginDir);
        }

        console.log(`Loaded ${this.plugins.size} plugin(s)`);
    }

    async loadPlugin(pluginName) {
        try {
            const pluginPath = path.join(this.pluginsDir, pluginName);
            const manifestPath = path.join(pluginPath, 'plugin.json');

            if (!fs.existsSync(manifestPath)) {
                console.warn(`Plugin ${pluginName} missing plugin.json`);
                return false;
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

            if (!manifest.enabled) {
                console.log(`Plugin ${pluginName} is disabled`);
                return false;
            }

            const entryPoint = path.join(pluginPath, manifest.entry || 'index.mjs');
            
            // Use cache for hot reload
            const entryUrl = `file://${entryPoint}?t=${Date.now()}`;
            const pluginModule = await import(entryUrl);

            const plugin = {
                name: manifest.name,
                version: manifest.version,
                description: manifest.description,
                manifest,
                module: pluginModule,
                path: pluginPath
            };

            // Initialize plugin if it has an init method
            if (pluginModule.default?.init) {
                await pluginModule.default.init();
            }

            this.plugins.set(manifest.name, plugin);
            console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`);
            return true;

        } catch (error) {
            console.error(`Failed to load plugin ${pluginName}:`, error.message);
            return false;
        }
    }

    async fetchMarketplace(githubOrg, githubToken = null) {
        const now = Date.now();
        
        // Return cached data if available and fresh
        if (this.marketplaceCache && this.marketplaceCacheTime && 
            (now - this.marketplaceCacheTime) < this.CACHE_DURATION) {
            return this.marketplaceCache;
        }

        try {
            const headers = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Plugin-Manager'
            };

            if (githubToken) {
                headers['Authorization'] = `token ${githubToken}`;
            }

            // Fetch all repos from organization
            const response = await axios.get(
                `https://api.github.com/orgs/${githubOrg}/repos`,
                { headers, params: { per_page: 100, type: 'public' } }
            );

            const pluginRepos = [];

            for (const repo of response.data) {
                // Check if repo has plugin.json
                try {
                    const manifestResponse = await axios.get(
                        `https://raw.githubusercontent.com/${githubOrg}/${repo.name}/main/plugin.json`,
                        { headers }
                    );

                    const manifest = manifestResponse.data;
                    
                    // Check if already installed
                    const isInstalled = this.plugins.has(manifest.name);
                    const installedVersion = isInstalled ? 
                        this.plugins.get(manifest.name).version : null;

                    pluginRepos.push({
                        id: manifest.name,
                        name: manifest.name,
                        displayName: manifest.displayName || manifest.name,
                        version: manifest.version,
                        description: manifest.description,
                        author: manifest.author || repo.owner.login,
                        repository: repo.html_url,
                        repoName: repo.name,
                        stars: repo.stargazers_count,
                        downloads: manifest.downloads || 0,
                        category: manifest.category || 'other',
                        tags: manifest.tags || [],
                        dependencies: manifest.dependencies || {},
                        isInstalled,
                        installedVersion,
                        needsUpdate: isInstalled && installedVersion !== manifest.version
                    });
                } catch (error) {
                    // Repo doesn't have plugin.json or it's not accessible
                    continue;
                }
            }

            this.marketplaceCache = pluginRepos;
            this.marketplaceCacheTime = now;

            return pluginRepos;

        } catch (error) {
            console.error('Failed to fetch marketplace:', error.message);
            throw error;
        }
    }

    async installPlugin(pluginId, githubOrg, githubToken = null) {
        try {
            console.log(`Installing plugin: ${pluginId}...`);

            // Check if already installed
            if (this.plugins.has(pluginId)) {
                throw new Error(`Plugin ${pluginId} is already installed`);
            }

            const pluginPath = path.join(this.pluginsDir, pluginId);
            const zipPath = path.join(this.pluginsDir, `${pluginId}.zip`);

            // Create plugins directory if it doesn't exist
            if (!fs.existsSync(this.pluginsDir)) {
                fs.mkdirSync(this.pluginsDir, { recursive: true });
            }

            // Download ZIP from GitHub
            const zipUrl = `https://github.com/${githubOrg}/${pluginId}/archive/refs/heads/main.zip`;
            console.log(`Downloading from ${zipUrl}...`);

            const headers = {
                'User-Agent': 'Plugin-Manager'
            };
            if (githubToken) {
                headers['Authorization'] = `token ${githubToken}`;
            }

            const response = await axios({
                method: 'get',
                url: zipUrl,
                responseType: 'arraybuffer',
                headers
            });

            // Save ZIP file
            fs.writeFileSync(zipPath, response.data);

            // Extract ZIP
            console.log('Extracting plugin...');
            await execAsync(`unzip -q "${zipPath}" -d "${this.pluginsDir}"`);

            // GitHub zips extract to folder-name-branch format
            const extractedDir = path.join(this.pluginsDir, `${pluginId}-main`);
            
            // Rename to remove -main suffix
            if (fs.existsSync(extractedDir)) {
                await execAsync(`mv "${extractedDir}" "${pluginPath}"`);
            }

            // Delete ZIP file
            fs.unlinkSync(zipPath);

            // Read manifest to check if it's valid
            const manifestPath = path.join(pluginPath, 'plugin.json');
            if (!fs.existsSync(manifestPath)) {
                // Cleanup
                await execAsync(`rm -rf "${pluginPath}"`);
                throw new Error('Invalid plugin: plugin.json not found');
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

            // Check if package.json exists, if not create one from manifest dependencies
            const packageJsonPath = path.join(pluginPath, 'package.json');
            if (!fs.existsSync(packageJsonPath) && manifest.dependencies) {
                console.log('Creating package.json from manifest...');
                const packageJson = {
                    name: manifest.name,
                    version: manifest.version,
                    type: "module",
                    dependencies: manifest.dependencies
                };
                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            }

            // Install dependencies if package.json exists
            if (fs.existsSync(packageJsonPath)) {
                console.log('Installing plugin dependencies...');
                try {
                    await execAsync(`cd "${pluginPath}" && npm install --production`);
                    console.log('Dependencies installed successfully');
                } catch (error) {
                    console.error('Failed to install dependencies:', error.message);
                    throw new Error(`Failed to install plugin dependencies: ${error.message}`);
                }
            }

            // Load the plugin
            const loaded = await this.loadPlugin(pluginId);

            if (!loaded) {
                throw new Error('Failed to load plugin after installation');
            }

            console.log(`Successfully installed plugin: ${manifest.name} v${manifest.version}`);

            return {
                success: true,
                plugin: {
                    id: manifest.name,
                    name: manifest.displayName || manifest.name,
                    version: manifest.version,
                    description: manifest.description
                }
            };

        } catch (error) {
            console.error(`Failed to install plugin ${pluginId}:`, error.message);
            
            // Cleanup on failure
            const pluginPath = path.join(this.pluginsDir, pluginId);
            const zipPath = path.join(this.pluginsDir, `${pluginId}.zip`);
            
            if (fs.existsSync(pluginPath)) {
                await execAsync(`rm -rf "${pluginPath}"`).catch(() => {});
            }
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }

            throw error;
        }
    }

    async uninstallPlugin(pluginId) {
        try {
            console.log(`Uninstalling plugin: ${pluginId}...`);

            const plugin = this.plugins.get(pluginId);
            if (!plugin) {
                throw new Error(`Plugin ${pluginId} is not installed`);
            }

            // Call cleanup if available
            if (plugin.module.default?.cleanup) {
                await plugin.module.default.cleanup();
            }

            // Remove from memory
            this.plugins.delete(pluginId);

            // Remove from filesystem
            const pluginPath = path.join(this.pluginsDir, pluginId);
            await execAsync(`rm -rf "${pluginPath}"`);

            console.log(`Successfully uninstalled plugin: ${pluginId}`);

            return {
                success: true,
                message: `Plugin ${pluginId} uninstalled successfully`
            };

        } catch (error) {
            console.error(`Failed to uninstall plugin ${pluginId}:`, error.message);
            throw error;
        }
    }

    async updatePlugin(pluginId, githubOrg) {
        try {
            console.log(`Updating plugin: ${pluginId}...`);

            const plugin = this.plugins.get(pluginId);
            if (!plugin) {
                throw new Error(`Plugin ${pluginId} is not installed`);
            }

            const pluginPath = path.join(this.pluginsDir, pluginId);
            const zipPath = path.join(this.pluginsDir, `${pluginId}-update.zip`);
            const tempPath = path.join(this.pluginsDir, `${pluginId}-temp`);

            // Download latest ZIP from GitHub
            const zipUrl = `https://github.com/${githubOrg}/${pluginId}/archive/refs/heads/main.zip`;
            console.log('Downloading latest version...');

            const response = await axios({
                method: 'get',
                url: zipUrl,
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Plugin-Manager' }
            });

            // Save ZIP file
            fs.writeFileSync(zipPath, response.data);

            // Extract to temp directory
            console.log('Extracting update...');
            await execAsync(`unzip -q "${zipPath}" -d "${this.pluginsDir}"`);

            // GitHub zips extract to folder-name-branch format
            const extractedDir = path.join(this.pluginsDir, `${pluginId}-main`);
            
            if (fs.existsSync(extractedDir)) {
                await execAsync(`mv "${extractedDir}" "${tempPath}"`);
            }

            // Delete ZIP
            fs.unlinkSync(zipPath);

            // Remove old plugin directory
            await execAsync(`rm -rf "${pluginPath}"`);

            // Move temp to final location
            await execAsync(`mv "${tempPath}" "${pluginPath}"`);

            // Check if package.json exists, if not create one from manifest dependencies
            const manifestPath = path.join(pluginPath, 'plugin.json');
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            
            const packageJsonPath = path.join(pluginPath, 'package.json');
            if (!fs.existsSync(packageJsonPath) && manifest.dependencies) {
                console.log('Creating package.json from manifest...');
                const packageJson = {
                    name: manifest.name,
                    version: manifest.version,
                    type: "module",
                    dependencies: manifest.dependencies
                };
                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            }

            // Update dependencies if needed before reloading
            if (fs.existsSync(packageJsonPath)) {
                console.log('Updating dependencies...');
                try {
                    await execAsync(`cd "${pluginPath}" && npm install --production`);
                    console.log('Dependencies updated successfully');
                } catch (error) {
                    console.error('Failed to update dependencies:', error.message);
                }
            }

            // Reload the plugin
            await this.unloadPlugin(pluginId);
            const loaded = await this.loadPlugin(pluginId);

            if (!loaded) {
                throw new Error('Failed to reload plugin after update');
            }

            const newPlugin = this.plugins.get(pluginId);

            console.log(`Successfully updated plugin: ${pluginId} to v${newPlugin.version}`);

            return {
                success: true,
                plugin: {
                    id: newPlugin.name,
                    name: newPlugin.manifest.displayName || newPlugin.name,
                    version: newPlugin.version,
                    description: newPlugin.description
                }
            };

        } catch (error) {
            console.error(`Failed to update plugin ${pluginId}:`, error.message);
            
            // Cleanup temp files on failure
            const zipPath = path.join(this.pluginsDir, `${pluginId}-update.zip`);
            const tempPath = path.join(this.pluginsDir, `${pluginId}-temp`);
            
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }
            if (fs.existsSync(tempPath)) {
                await execAsync(`rm -rf "${tempPath}"`).catch(() => {});
            }
            
            throw error;
        }
    }

    async unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return false;

        // Call cleanup if available
        if (plugin.module.default?.cleanup) {
            await plugin.module.default.cleanup();
        }

        this.plugins.delete(pluginId);
        return true;
    }

    getPlugin(name) {
        return this.plugins.get(name);
    }

    hasPlugin(name) {
        return this.plugins.has(name);
    }

    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    clearMarketplaceCache() {
        this.marketplaceCache = null;
        this.marketplaceCacheTime = null;
    }
}

export const pluginManager = new PluginManager();