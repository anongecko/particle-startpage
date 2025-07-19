import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(async ({ command, mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const isProduction = mode === 'production';
	const isAnalyze = mode === 'analyze';
	const isDevelopment = command === 'serve';

	// Conditionally import visualizer
	const plugins = [sveltekit()];

	if (isAnalyze) {
		try {
			const { visualizer } = await import('rollup-plugin-visualizer');
			plugins.push(
				visualizer({
					filename: 'dist/bundle-analysis.html',
					open: true,
					gzipSize: true,
					brotliSize: true,
					template: 'treemap'
				})
			);
		} catch (e) {
			console.warn('rollup-plugin-visualizer not available, skipping bundle analysis');
		}
	}

	return {
		plugins,

		// ===== THREE.JS OPTIMIZATION =====
		optimizeDeps: {
			include: [
				// Core Three.js modules
				'three',
				'three/src/math/Vector3',
				'three/src/math/Matrix4',
				'three/src/math/Quaternion',
				'three/src/core/BufferGeometry',
				'three/src/core/BufferAttribute',
				'three/src/materials/MeshStandardMaterial',
				'three/src/materials/MeshPhysicalMaterial',
				'three/src/materials/MeshBasicMaterial',
				'three/src/geometries/BoxGeometry',
				'three/src/geometries/SphereGeometry',
				'three/src/geometries/CylinderGeometry',
				'three/src/renderers/WebGLRenderer',
				'three/src/cameras/PerspectiveCamera',
				'three/src/scenes/Scene',
				'three/src/lights/DirectionalLight',
				'three/src/lights/AmbientLight',
				'three/src/lights/PointLight',

				// Color utilities
				'chroma-js',

				// UI components
				'lucide-svelte'
			],
			exclude: [
				'@sveltejs/kit',
				// Exclude large Three.js modules that aren't used
				'three/examples/jsm/loaders/GLTFLoader',
				'three/examples/jsm/loaders/FBXLoader',
				'three/examples/jsm/controls/OrbitControls'
			],
			esbuildOptions: {
				// Optimize Three.js imports
				target: 'esnext',
				supported: {
					'top-level-await': true
				}
			}
		},

		// ===== DEFINE ENVIRONMENT VARIABLES =====
		define: {
			'import.meta.env.VITE_3D_ENABLED': JSON.stringify(env.VITE_3D_ENABLED !== 'false'),
			'import.meta.env.VITE_WEBGL_DEBUG': JSON.stringify(env.VITE_WEBGL_DEBUG === 'true'),
			'import.meta.env.VITE_PERFORMANCE_MODE': JSON.stringify(env.VITE_PERFORMANCE_MODE || 'auto'),
			// Global Three.js constants for better tree-shaking
			__THREE_DEVTOOLS__: !isProduction,
			__THREE_DEBUG__: isDevelopment
		},

		// ===== BUILD CONFIGURATION =====
		build: {
			target: ['esnext', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
			minify: 'esbuild',
			cssMinify: 'esbuild',
			sourcemap: isDevelopment ? 'inline' : false,

			// Enhanced asset handling
			assetsInlineLimit: 4096, // Inline smaller assets
			copyPublicDir: true,
			chunkSizeWarningLimit: isProduction ? 1000 : 2000,

			rollupOptions: {
				// ===== EXTERNAL DEPENDENCIES =====
				external: isProduction
					? [
							// Externalize heavy dependencies for CDN loading in production
						]
					: [],

				// ===== OUTPUT CONFIGURATION =====
				output: {
					// ===== MANUAL CHUNK SPLITTING =====
					manualChunks: (id) => {
						// Vendor chunks
						if (id.includes('node_modules')) {
							// Three.js core - separate chunk for caching
							if (
								id.includes('three/src/core') ||
								id.includes('three/src/math') ||
								id.includes('three/src/constants')
							) {
								return 'three-core';
							}

							// Three.js geometry - lazy loaded
							if (id.includes('three/src/geometries')) {
								return 'three-geometries';
							}

							// Three.js materials - lazy loaded
							if (id.includes('three/src/materials')) {
								return 'three-materials';
							}

							// Three.js loaders - lazy loaded
							if (
								id.includes('three/examples/jsm/loaders') ||
								id.includes('three/addons/loaders')
							) {
								return 'three-loaders';
							}

							// Three.js controls - lazy loaded
							if (
								id.includes('three/examples/jsm/controls') ||
								id.includes('three/addons/controls')
							) {
								return 'three-controls';
							}

							// Three.js postprocessing - lazy loaded
							if (
								id.includes('three/examples/jsm/postprocessing') ||
								id.includes('three/addons/postprocessing')
							) {
								return 'three-postprocessing';
							}

							// Main Three.js - critical
							if (id.includes('three')) {
								return 'three-main';
							}

							// Color utilities
							if (id.includes('chroma-js')) {
								return 'color-utils';
							}

							// Icons
							if (id.includes('lucide')) {
								return 'icons';
							}

							// Svelte framework
							if (id.includes('svelte')) {
								return 'svelte-vendor';
							}

							// Other vendor libraries
							return 'vendor';
						}

						// Application chunks
						if (id.includes('/stores/')) {
							return 'stores';
						}

						if (id.includes('/lib/objects/') || id.includes('/lib/objects3d')) {
							return 'objects3d';
						}

						if (id.includes('/lib/three-renderer') || id.includes('/lib/webgl')) {
							return 'three-renderer';
						}

						if (
							id.includes('/components/Object3D') ||
							id.includes('/components/ContextMenu') ||
							id.includes('/components/ObjectSelector')
						) {
							return 'components-3d';
						}

						if (id.includes('/components/')) {
							return 'components';
						}

						if (id.includes('/lib/')) {
							return 'lib';
						}
					},

					// ===== ASSET FILE NAMING =====
					assetFileNames: (assetInfo) => {
						const info = assetInfo.name?.split('.') || [];
						const extType = info[info.length - 1];

						// Images
						if (/\.(png|jpe?g|webp|avif|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name || '')) {
							return 'assets/images/[name]-[hash][extname]';
						}

						// 3D Models and textures
						if (/\.(gltf|glb|obj|fbx|dae|ply|stl)$/i.test(assetInfo.name || '')) {
							return 'assets/models/[name]-[hash][extname]';
						}

						// Textures
						if (/\.(hdr|exr|ktx|basis)$/i.test(assetInfo.name || '')) {
							return 'assets/textures/[name]-[hash][extname]';
						}

						// Audio
						if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(assetInfo.name || '')) {
							return 'assets/audio/[name]-[hash][extname]';
						}

						// Fonts
						if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name || '')) {
							return 'assets/fonts/[name]-[hash][extname]';
						}

						// CSS
						if (/\.(css)$/i.test(assetInfo.name || '')) {
							return 'assets/css/[name]-[hash][extname]';
						}

						// Data files
						if (/\.(json|csv|xml)$/i.test(assetInfo.name || '')) {
							return 'assets/data/[name]-[hash][extname]';
						}

						return 'assets/[name]-[hash][extname]';
					},

					// ===== CHUNK FILE NAMING =====
					chunkFileNames: (chunkInfo) => {
						// Critical chunks go in root for faster loading
						if (
							chunkInfo.name === 'three-core' ||
							chunkInfo.name === 'three-main' ||
							chunkInfo.name === 'svelte-vendor'
						) {
							return 'assets/js/critical/[name]-[hash].js';
						}

						// 3D chunks can be lazy loaded
						if (
							chunkInfo.name?.startsWith('three-') ||
							chunkInfo.name === 'objects3d' ||
							chunkInfo.name === 'components-3d'
						) {
							return 'assets/js/3d/[name]-[hash].js';
						}

						return 'assets/js/[name]-[hash].js';
					},

					entryFileNames: 'assets/js/[name]-[hash].js',
					format: 'es'
				},

				// ===== PERFORMANCE OPTIONS =====
				treeshake: {
					preset: 'recommended',
					moduleSideEffects: (id) => {
						// Three.js modules have side effects
						if (id.includes('three')) return true;
						return false;
					}
				}
			}
		},

		// ===== CSS CONFIGURATION =====
		css: {
			devSourcemap: isDevelopment,
			preprocessorOptions: {
				scss: {
					additionalData: `
						@import '/src/styles/variables.scss';
						@import '/src/styles/mixins.scss';
					`
				}
			}
		},

		// ===== DEVELOPMENT SERVER =====
		server: {
			host: '0.0.0.0',
			port: 5173,
			strictPort: true,
			fs: {
				allow: ['..']
			},
			hmr: {
				overlay: true,
				port: 24678
			},
			// Enable HTTPS for WebGL debugging
			https:
				isDevelopment && env.VITE_HTTPS === 'true'
					? {
							// Configure SSL certificates if needed
						}
					: false,
			cors: true,
			headers: {
				// Security headers for 3D content
				'Cross-Origin-Embedder-Policy': 'require-corp',
				'Cross-Origin-Opener-Policy': 'same-origin',
				// WebGL headers
				'Feature-Policy': 'webgl *',
				'Permissions-Policy':
					'accelerometer=(), camera=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
			}
		},

		// ===== PREVIEW SERVER =====
		preview: {
			host: '0.0.0.0',
			port: 4173,
			strictPort: true,
			headers: {
				// Production-like headers for 3D content
				'Cross-Origin-Embedder-Policy': 'require-corp',
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		},

		// ===== WORKER CONFIGURATION =====
		worker: {
			format: 'es',
			plugins: () => []
		},

		// ===== ENVIRONMENT VARIABLES =====
		envPrefix: ['VITE_', 'THREE_'],

		// ===== RESOLVE CONFIGURATION =====
		resolve: {
			alias: {
				// Three.js tree-shaking aliases
				'three/src': 'three/src',
				'three/examples': 'three/examples',
				'three/addons': 'three/examples/jsm',

				// Project aliases (existing ones preserved)
				$lib: './src/lib',
				$components: './src/components',
				$stores: './src/stores',
				$styles: './src/styles',
				$assets: './src/assets'
			},
			conditions: ['development', 'production']
		},

		// ===== ESBUILD CONFIGURATION =====
		esbuild: {
			target: 'esnext',
			supported: {
				'top-level-await': true,
				'import-meta': true
			},
			// Three.js specific optimizations
			treeShaking: true,
			define: {
				// Remove debug code in production
				'process.env.NODE_ENV': JSON.stringify(mode),
				DEBUG: isDevelopment ? 'true' : 'false'
			}
		},

		// ===== LOGGING =====
		logLevel: isDevelopment ? 'info' : 'warn'
	};
});
