import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGINS_DIR = path.resolve(__dirname, 'plugins');

const pluginCache = new Map();

export async function loadPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) {
        console.warn(`Plugins directory not found: ${PLUGINS_DIR}`);
        return [];
    }

    const files = fs.readdirSync(PLUGINS_DIR)
        .filter(f => f.endsWith('Plugin.js') || f.endsWith('Plugin.mjs'));

    const plugins = [];

    for (const file of files) {
        try {
            const pluginPath = path.join(PLUGINS_DIR, file);
            const module = await import(`file://${pluginPath}`);
            const plugin = module.default;

            if (!plugin || typeof plugin.fetch !== 'function') {
                console.warn(`Plugin ${file} does not export a valid fetch function`);
                continue;
            }

            if (!plugin.name || !plugin.category) {
                console.warn(`Plugin ${file} missing required name or category`);
                continue;
            }

            plugins.push(plugin);
            pluginCache.set(plugin.name, plugin);
            console.log(`Loaded plugin: ${plugin.name} (${plugin.category})`);
        } catch (err) {
            console.error(`Failed to load plugin ${file}:`, err.message);
        }
    }

    return plugins;
}

export function getPlugin(name) {
    return pluginCache.get(name);
}

export function getAllPlugins() {
    return Array.from(pluginCache.values());
}

export async function fetchAllPlugins() {
    const plugins = getAllPlugins();
    const results = await Promise.allSettled(
        plugins.map(async (plugin) => {
            try {
                const items = await plugin.fetch();
                return items.map(item => ({
                    ...item,
                    plugin: plugin.name,
                    category: item.category || plugin.category,
                }));
            } catch (err) {
                console.error(`Plugin ${plugin.name} fetch failed:`, err.message);
                return [];
            }
        })
    );

    const allItems = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            allItems.push(...result.value);
        }
    }

    return allItems;
}