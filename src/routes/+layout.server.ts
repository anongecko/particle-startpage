import fs from 'fs';
import path from 'path';
import type { LayoutServerLoad } from './$types';

// --- Type Definitions ---
// It's good practice to define the shape of the data you're working with.
export interface Wallpaper {
	name: string;
	path: string;
}

export interface WallpaperPack {
	name: string;
	wallpapers: Wallpaper[];
}

// --- Main Load Function ---
// This is the core of SvelteKit's server-side data loading.
// It runs on the server before the page is sent to the user.
export const load: LayoutServerLoad = async () => {
	const wallpaperPacks: WallpaperPack[] = [];
	const wallpapersPath = path.resolve('./static/wallpapers');
	const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

	try {
		// Check if the main wallpapers directory exists
		if (!fs.existsSync(wallpapersPath)) {
			console.warn('Wallpaper directory not found at:', wallpapersPath);
			// Return an empty array so the app doesn't crash
			return { wallpaperPacks: [] };
		}

		// Read all the directories inside /static/wallpapers (these are the packs)
		const packDirectories = fs
			.readdirSync(wallpapersPath, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name);

		// Iterate over each pack directory to find the wallpapers inside
		for (const packName of packDirectories) {
			const packPath = path.join(wallpapersPath, packName);
			const wallpaperFiles = fs.readdirSync(packPath);

			const wallpapers: Wallpaper[] = wallpaperFiles
				.filter((file) => supportedExtensions.includes(path.extname(file).toLowerCase()))
				.map((fileName) => ({
					name: fileName,
					// We construct the URL path that the browser will use
					path: `/wallpapers/${packName}/${fileName}`
				}));

			// Only add the pack if it contains valid images
			if (wallpapers.length > 0) {
				wallpaperPacks.push({
					name: packName,
					wallpapers: wallpapers
				});
			}
		}
	} catch (error) {
		console.error('Failed to load wallpaper packs:', error);
		// Return empty data in case of an unexpected error
		return { wallpaperPacks: [] };
	}

	// The data returned here is automatically passed to `+layout.svelte`
	// and is available to all child pages.
	return {
		wallpaperPacks
	};
};
