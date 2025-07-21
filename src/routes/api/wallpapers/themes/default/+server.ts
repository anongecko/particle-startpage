import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';

export async function GET() {
	try {
		const manifestData = await readFile('static/wallpapers/manifest.json', 'utf8');
		const manifest = JSON.parse(manifestData);

		// Get first theme as default
		const firstThemeId = Object.keys(manifest.themes)[0];
		const firstTheme = manifest.themes[firstThemeId];

		if (!firstTheme) {
			throw new Error('No themes found');
		}

		const wallpapers = firstTheme.wallpapers.map((filename: string) => ({
			id: `${firstThemeId}_${filename}`,
			url: `/wallpapers/${firstThemeId}/${filename}`,
			filename,
			theme: firstThemeId
		}));

		return json({
			success: true,
			theme: {
				id: firstThemeId,
				name: firstTheme.name,
				description: firstTheme.description,
				wallpapers
			}
		});
	} catch (error) {
		console.error('Failed to load default theme:', error);
		return json({ success: false, error: 'Failed to load default theme' }, { status: 500 });
	}
}
