// ===== CORE LIBRARY EXPORTS =====

// API & Networking
export * from './api';
export { default as api } from './api';

// Storage & Persistence
export * from './storage';
export { default as storage } from './storage';

// Utilities & Helpers
export * from './utils';
export { default as utils } from './utils';

// Validation & Type Checking
export * from './validation';
export { default as validation } from './validation';

// Performance & Optimization
export * from './performance';
export { default as performance } from './performance';

// Event System
export * from './events';
export { default as events } from './events';

// Keyboard Handling
export * from './keyboard';
export { default as keyboard } from './keyboard';

// ===== VISUAL & RENDERING SYSTEMS =====

// Color System
export * from './color';
export { default as color } from './color';

// Wallpaper System
export * from './wallpaper';
export { default as wallpaper } from './wallpaper';

// Particle System
export * from './particles';
export { default as particles } from './particles';

// Animation System
export * from './animations';
export { default as animations } from './animations';

// Object Animations
export * from './object-animations';
export { default as objectAnimations } from './object-animations';

// Three.js Renderer
export * from './three-renderer';
export { default as threeRenderer } from './three-renderer';

// ===== 3D OBJECT SYSTEM (PRIMARY) =====

// New Object3D System - Primary Export
export * from './objects3d';
export { default as objects3d } from './objects3d';

// Legacy Objects System - Backward Compatibility
export * from './objects';
export { default as objects } from './objects';

// ===== CONVENIENT GROUPED EXPORTS =====

// Core System Group
export const core = {
	api: () => import('./api'),
	storage: () => import('./storage'),
	utils: () => import('./utils'),
	validation: () => import('./validation'),
	performance: () => import('./performance'),
	events: () => import('./events'),
	keyboard: () => import('./keyboard')
} as const;

// Visual System Group
export const visual = {
	color: () => import('./color'),
	wallpaper: () => import('./wallpaper'),
	particles: () => import('./particles'),
	animations: () => import('./animations'),
	objectAnimations: () => import('./object-animations'),
	threeRenderer: () => import('./three-renderer')
} as const;

// 3D System Group
export const threeDSystem = {
	objects3d: () => import('./objects3d'),
	objects: () => import('./objects'),
	threeRenderer: () => import('./three-renderer'),
	objectAnimations: () => import('./object-animations')
} as const;

// ===== CONVENIENCE RE-EXPORTS =====

// Most commonly used exports for easy access
import { Object3DRegistry } from './objects3d';
import { ThreeRenderer } from './three-renderer';
import { debounce, throttle, formatFileSize, isImageFile } from './utils';
import { wallpaperAPI } from './api';
import { initializeColorSystem, extractDominantColor } from './color';
import { handleKeyboardShortcuts } from './keyboard';

export const common = {
	// 3D System
	Object3DRegistry,
	ThreeRenderer,

	// Utilities
	debounce,
	throttle,
	formatFileSize,
	isImageFile,

	// API
	wallpaperAPI,

	// Color
	initializeColorSystem,
	extractDominantColor,

	// Keyboard
	handleKeyboardShortcuts
} as const;

// ===== BACKWARD COMPATIBILITY LAYER =====

// Support for old import patterns
export {
	Object3DRegistry as OBJECT_REGISTRY,
	getAllObjects,
	getObjectsByCategory,
	searchObjects
} from './objects3d';

// Legacy object system re-exports for migration
export { getObjectById, getRandomObject, validateObject3DConfig } from './objects';

// ===== TYPE DEFINITIONS =====

// Re-export all important types
export type {
	// 3D System Types
	Object3DConfig,
	Object3DInstance,
	Object3DCategory,
	GeometryFunction,
	MaterialFunction,
	AnimationConfig,
	PerformanceConfig,

	// Renderer Types
	RendererConfig,
	RenderTarget,

	// Color Types
	ColorPalette,
	ColorScheme,
	DominantColors,

	// Utility Types
	DebounceOptions,
	ThrottleOptions,
	ValidationResult,

	// API Types
	APIResponse,
	WallpaperConfig,

	// Performance Types
	PerformanceMetrics,
	MemoryUsage
} from './objects3d';

// ===== INITIALIZATION HELPERS =====

export const initialize = {
	async all() {
		const results = await Promise.allSettled([
			this.objects3d(),
			this.colorSystem(),
			this.renderer()
		]);

		const failed = results
			.filter((r) => r.status === 'rejected')
			.map((r) => (r as PromiseRejectedResult).reason);

		if (failed.length > 0) {
			console.warn('Some systems failed to initialize:', failed);
		}

		return results.every((r) => r.status === 'fulfilled');
	},

	async objects3d() {
		try {
			await Object3DRegistry.initialize();
			return true;
		} catch (error) {
			console.error('Failed to initialize Object3D system:', error);
			return false;
		}
	},

	async colorSystem() {
		try {
			await initializeColorSystem();
			return true;
		} catch (error) {
			console.error('Failed to initialize color system:', error);
			return false;
		}
	},

	async renderer() {
		try {
			// ThreeRenderer initialization is handled per-instance
			return true;
		} catch (error) {
			console.error('Failed to initialize renderer:', error);
			return false;
		}
	}
} as const;

// ===== CLEANUP UTILITIES =====

export const cleanup = {
	all() {
		this.objects3d();
		this.renderer();
		this.colorSystem();
	},

	objects3d() {
		try {
			Object3DRegistry.cleanup?.();
		} catch (error) {
			console.error('Error during Object3D cleanup:', error);
		}
	},

	renderer() {
		try {
			ThreeRenderer.cleanup?.();
		} catch (error) {
			console.error('Error during renderer cleanup:', error);
		}
	},

	colorSystem() {
		try {
			// Color system cleanup if available
		} catch (error) {
			console.error('Error during color system cleanup:', error);
		}
	}
} as const;

// ===== DEFAULT EXPORT =====

export default {
	// Core systems
	core,
	visual,
	threeDSystem,

	// Common utilities
	common,

	// System management
	initialize,
	cleanup,

	// Individual modules
	api: () => import('./api'),
	storage: () => import('./storage'),
	utils: () => import('./utils'),
	validation: () => import('./validation'),
	performance: () => import('./performance'),
	events: () => import('./events'),
	keyboard: () => import('./keyboard'),
	color: () => import('./color'),
	wallpaper: () => import('./wallpaper'),
	particles: () => import('./particles'),
	animations: () => import('./animations'),
	objectAnimations: () => import('./object-animations'),
	threeRenderer: () => import('./three-renderer'),
	objects3d: () => import('./objects3d'),
	objects: () => import('./objects')
} as const;
