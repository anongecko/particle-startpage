import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte/preprocess';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: true
		}),
		prerender: {
			handleHttpError: 'warn'
		}
	}
};

export default config;
