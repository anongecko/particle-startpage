import { readdir, writeFile, stat } from 'fs/promises';
import { join, extname } from 'path';

const WALLPAPERS_DIR = 'static/wallpapers';
const MANIFEST_PATH = 'static/wallpapers/manifest.json';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];

async function isDirectory(path) {
	try {
		const stats = await stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function isImageFile(filename) {
	const ext = extname(filename).toLowerCase();
	return IMAGE_EXTENSIONS.includes(ext);
}

async function scanWallpapers() {
	const themes = {};

	try {
		const items = await readdir(WALLPAPERS_DIR);

		for (const item of items) {
			// Skip manifest.json and other non-directories
			if (item === 'manifest.json' || item.startsWith('.')) continue;

			const itemPath = join(WALLPAPERS_DIR, item);

			if (await isDirectory(itemPath)) {
				// This is a theme directory
				const wallpapers = [];
				const files = await readdir(itemPath);

				for (const file of files) {
					if (await isImageFile(file)) {
						wallpapers.push(file);
					}
				}

				if (wallpapers.length > 0) {
					themes[item] = {
						name: formatThemeName(item),
						description: `${wallpapers.length} wallpapers`,
						wallpapers: wallpapers.sort()
					};
				}
			} else if (await isImageFile(item)) {
				// Handle loose files at root level - put them in "default" theme
				if (!themes.default) {
					themes.default = {
						name: 'Default Collection',
						description: 'Mixed wallpapers',
						wallpapers: []
					};
				}
				themes.default.wallpapers.push(item);
			}
		}

		// Sort wallpapers in each theme
		Object.values(themes).forEach((theme) => {
			theme.wallpapers.sort();
		});
	} catch (error) {
		console.error('Error scanning wallpapers:', error);
		return {};
	}

	return themes;
}

function formatThemeName(dirname) {
	return dirname
		.split(/[-_\s]+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

async function generateManifest() {
	console.log('🔍 Scanning wallpapers directory...');

	const themes = await scanWallpapers();
	const themeCount = Object.keys(themes).length;
	const totalWallpapers = Object.values(themes).reduce(
		(sum, theme) => sum + theme.wallpapers.length,
		0
	);

	const manifest = {
		generated: new Date().toISOString(),
		themes
	};

	await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

	console.log(`✅ Generated manifest with ${themeCount} themes and ${totalWallpapers} wallpapers`);
	console.log(`📝 Manifest saved to ${MANIFEST_PATH}`);

	// Log themes for verification
	Object.entries(themes).forEach(([key, theme]) => {
		console.log(`   📁 ${theme.name}: ${theme.wallpapers.length} wallpapers`);
	});
}

// Run the script
generateManifest().catch(console.error);
