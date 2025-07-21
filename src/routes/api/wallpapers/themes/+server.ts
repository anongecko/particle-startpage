import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';

export async function GET() {
	try {
		const manifestData = await readFile('static/wallpapers/manifest.json', 'utf8');
		const manifest = JSON.parse(manifestData);

		const themes = Object.entries(manifest.themes).map(([id, theme]: [string, any]) => ({
			id,
			name: theme.name,
			description: theme.description,
			wallpaperCount: theme.wallpapers.length
		}));

		return json({ success: true, themes });
	} catch (error) {
		console.error('Failed to load themes:', error);
		return json({ success: false, error: 'Failed to load themes' }, { status: 500 });
	}
}
