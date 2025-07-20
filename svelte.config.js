import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({
		script: true, // Enable TypeScript preprocessing in script tags
		style: true
	}),

	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),
		alias: {
			$components: 'src/components',
			$stores: 'src/stores',
			$assets: 'src/assets'
		}
	}
};

export default config;
