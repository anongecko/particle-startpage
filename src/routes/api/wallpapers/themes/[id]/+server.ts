import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const manifestPath = 'static/wallpapers/manifest.json';
		const manifestData = await readFile(manifestPath, 'utf8');
		const manifest = JSON.parse(manifestData);

		const theme = manifest.themes[params.id];
		if (!theme) {
			return json({ success: false, error: 'Theme not found' }, { status: 404 });
		}

		return json({
			success: true,
			theme: {
				id: params.id,
				name: theme.name,
				description: theme.description,
				wallpapers: theme.wallpapers.map((filename: string) => ({
					id: `${params.id}_${filename}`,
					url: `/wallpapers/${params.id}/${filename}`,
					filename,
					theme: params.id
				}))
			}
		});
	} catch (error) {
		return json({ success: false, error: 'Failed to load theme' }, { status: 500 });
	}
};
