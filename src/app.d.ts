// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// ===== WEBGL AND 3D TYPES =====

	interface WebGLRenderingContext {
		readonly canvas: HTMLCanvasElement | OffscreenCanvas;
	}

	interface WebGL2RenderingContext {
		readonly canvas: HTMLCanvasElement | OffscreenCanvas;
	}

	// ===== MODERN WEB APIs =====

	interface EyeDropper {
		open(): Promise<{ sRGBHex: string }>;
	}

	interface Window {
		EyeDropper?: {
			new (): EyeDropper;
		};
	}

	// ===== PERFORMANCE APIs =====

	interface Navigator {
		hardwareConcurrency?: number;
		connection?: {
			effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
			downlink?: number;
			rtt?: number;
			saveData?: boolean;
		};
		deviceMemory?: number;
		gpu?: {
			requestAdapter(): Promise<GPUAdapter | null>;
		};
	}

	interface Screen {
		colorDepth?: number;
		availWidth?: number;
		availHeight?: number;
	}

	// ===== THREE.JS GLOBAL EXTENSIONS =====

	interface Window {
		__THREE_DEVTOOLS__?: boolean;
		__THREE_DEBUG__?: boolean;
		PARTICLE_NEXUS?: {
			version: string;
			build: string;
			features: {
				webgl: boolean;
				webgl2: boolean;
				particles: boolean;
				objects3d: boolean;
			};
		};
	}

	// ===== CSS CUSTOM PROPERTIES =====

	interface CSSStyleDeclaration {
		'--color-dominant'?: string;
		'--color-vibrant'?: string;
		'--color-muted'?: string;
		'--font-size-multiplier'?: string;
		'--webgl-supported'?: string;
		'--window-width'?: string;
		'--window-height'?: string;
		'--ui-opacity'?: string;
		'--particle-scale'?: string;
		'--three-d-scale'?: string;
	}

	// ===== ENVIRONMENT VARIABLES =====

	interface ImportMetaEnv {
		readonly VITE_3D_ENABLED?: string;
		readonly VITE_WEBGL_DEBUG?: string;
		readonly VITE_PERFORMANCE_MODE?: 'high' | 'medium' | 'low' | 'auto';
		readonly VITE_HTTPS?: string;
		readonly VITE_PARTICLE_COUNT?: string;
		readonly VITE_FALLBACK_2D?: string;
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv;
	}

	// ===== SVELTE COMPONENT TYPES =====

	declare namespace svelteHTML {
		interface HTMLAttributes<T> {
			'data-category-id'?: string;
			'data-object-id'?: string;
			'data-svelte'?: string;
			'data-font-size'?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
			'data-performance-mode'?: 'high' | 'medium' | 'low';
			'data-webgl-supported'?: boolean;
			'data-3d-enabled'?: boolean;
		}
	}

	// ===== GLOBAL CONSTANTS =====

	declare const __THREE_DEVTOOLS__: boolean;
	declare const __THREE_DEBUG__: boolean;

	// ===== EVENT TYPES =====

	interface CustomEventMap {
		webglcontextlost: WebGLContextEvent;
		webglcontextrestored: WebGLContextEvent;
		colorChange: CustomEvent<{ color: string; palette: any }>;
		wallpaperChange: CustomEvent<{ path: string; colors: string[] }>;
		settingsChange: CustomEvent<{ settings: any }>;
		'3dToggle': CustomEvent<{ enabled: boolean }>;
		performanceChange: CustomEvent<{ mode: string; fps: number }>;
	}

	interface WindowEventMap extends CustomEventMap {}
	interface DocumentEventMap extends CustomEventMap {}
	interface HTMLElementEventMap extends CustomEventMap {}

	// ===== UTILITY TYPES =====

	type WebGLContext = WebGLRenderingContext | WebGL2RenderingContext;

	type PerformanceMode = 'high' | 'medium' | 'low' | 'auto';

	type ThreeDCapability = 'full' | 'simplified' | 'disabled';

	type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'oklch';

	type AnimationEasing =
		| 'linear'
		| 'ease'
		| 'ease-in'
		| 'ease-out'
		| 'ease-in-out'
		| 'spring'
		| 'bounce';

	// ===== COMPONENT PROP HELPERS =====

	interface BaseComponentProps {
		class?: string;
		style?: string;
		'data-testid'?: string;
	}

	interface ThreeDComponentProps extends BaseComponentProps {
		webglSupported?: boolean;
		performanceMode?: PerformanceMode;
		fallbackTo2D?: boolean;
		simplified3D?: boolean;
	}

	interface InteractiveComponentProps extends BaseComponentProps {
		disabled?: boolean;
		loading?: boolean;
		variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
	}

	// ===== STORE TYPES =====

	interface AppState {
		isLoading: boolean;
		isInitialized: boolean;
		webglSupported: boolean;
		threeDEnabled: boolean;
		performanceMode: PerformanceMode;
		currentTheme: string;
		dominantColor: string;
	}

	// ===== ERROR TYPES =====

	interface WebGLError extends Error {
		context?: 'initialization' | 'rendering' | 'context-loss';
		recoverable?: boolean;
	}

	interface InitializationError extends Error {
		component?: string;
		phase?: 'startup' | 'webgl' | 'resources' | 'ui';
		fatal?: boolean;
	}

	// ===== BROWSER COMPATIBILITY =====

	interface Document {
		webkitFullscreenElement?: Element;
		mozFullScreenElement?: Element;
		msFullscreenElement?: Element;
	}

	interface HTMLElement {
		webkitRequestFullscreen?: () => Promise<void>;
		mozRequestFullScreen?: () => Promise<void>;
		msRequestFullscreen?: () => Promise<void>;
	}

	// ===== MODERN CSS FEATURES =====

	interface CSS {
		supports(property: string, value: string): boolean;
		registerProperty?(definition: {
			name: string;
			syntax: string;
			inherits: boolean;
			initialValue: string;
		}): void;
	}

	declare namespace CSS {
		function paintWorklet(): void;
	}

	// ===== INTERSECTION OBSERVER ENHANCEMENTS =====

	interface IntersectionObserverInit {
		rootMargin?: string;
		threshold?: number | number[];
		trackVisibility?: boolean;
		delay?: number;
	}

	// ===== RESIZE OBSERVER ENHANCEMENTS =====

	interface ResizeObserverEntry {
		readonly borderBoxSize?: readonly ResizeObserverSize[];
		readonly contentBoxSize?: readonly ResizeObserverSize[];
		readonly devicePixelContentBoxSize?: readonly ResizeObserverSize[];
	}
}

export {};
