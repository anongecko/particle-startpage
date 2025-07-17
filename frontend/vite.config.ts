import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		include: ['three', 'chroma-js', 'lucide-svelte'],
		exclude: ['@sveltejs/kit']
	},
	build: {
		target: 'esnext',
		minify: 'esbuild',
		cssMinify: 'esbuild',
		sourcemap: false,
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (id.includes('node_modules')) {
						if (id.includes('three')) return 'three';
						if (id.includes('chroma-js')) return 'color-utils';
						if (id.includes('lucide')) return 'icons';
						if (id.includes('svelte')) return 'svelte-vendor';
						return 'vendor';
					}
					if (id.includes('components')) return 'components';
				},
				assetFileNames: (assetInfo) => {
					const info = assetInfo.name.split('.');
					const extType = info[info.length - 1];
					if (/\.(png|jpe?g|webp|avif|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name)) {
						return `assets/images/[name]-[hash][extname]`;
					}
					if (/\.(css)$/i.test(assetInfo.name)) {
						return `assets/css/[name]-[hash][extname]`;
					}
					return `assets/[name]-[hash][extname]`;
				},
				chunkFileNames: 'assets/js/[name]-[hash].js',
				entryFileNames: 'assets/js/[name]-[hash].js'
			}
		},
		chunkSizeWarningLimit: 1000,
		assetsInlineLimit: 8192
	},
	css: {
		devSourcemap: true
	},
	server: {
		fs: {
			allow: ['..']
		},
		hmr: {
			overlay: false
		}
	},
	preview: {
		port: 4173,
		strictPort: true
	}
});
