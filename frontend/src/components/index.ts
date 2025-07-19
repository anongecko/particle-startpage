// Core System Components
export { default as Background } from './Background.svelte';
export { default as ParticleSystem } from './ParticleSystem.svelte';
export { default as ErrorBoundary } from './ErrorBoundary.svelte';

// UI Interface Components  
export { default as SearchBar } from './SearchBar.svelte';
export { default as SettingsPanel } from './SettingsPanel.svelte';
export { default as SetupWizard } from './SetupWizard.svelte';

// Bookmark System Components
export { default as BookmarkGrid } from './BookmarkGrid.svelte';
export { default as BookmarkFolder } from './BookmarkFolder.svelte';
export { default as BookmarkItem } from './BookmarkItem.svelte';

// 3D Object System Components
export { default as Object3D } from './Object3D.svelte';
export { default as ContextMenu } from './ContextMenu.svelte';
export { default as ObjectSelector } from './ObjectSelector.svelte';

// Utility Components
export { default as ColorPicker } from './ColorPicker.svelte';
export { default as ThemeSelector } from './ThemeSelector.svelte';
export { default as NotificationToast } from './NotificationToast.svelte';

// Component Groups for Organized Imports
export const CoreComponents = {
	Background,
	ParticleSystem,
	ErrorBoundary
} as const;

export const UIComponents = {
	SearchBar,
	SettingsPanel,
	SetupWizard
} as const;

export const BookmarkComponents = {
	BookmarkGrid,
	BookmarkFolder,
	BookmarkItem
} as const;

export const ThreeDComponents = {
	Object3D,
	ContextMenu,
	ObjectSelector
} as const;

export const UtilityComponents = {
	ColorPicker,
	ThemeSelector,
	NotificationToast
} as const;

// Component Configuration Helpers
export interface ComponentConfig {
	enableAnimations: boolean;
	useGPUAcceleration: boolean;
	performanceMode: 'high' | 'balanced' | 'low';
	debugMode: boolean;
}

export const DEFAULT_COMPONENT_CONFIG: ComponentConfig = {
	enableAnimations: true,
	useGPUAcceleration: true,
	performanceMode: 'high',
	debugMode: false
};

// Component Initialization Helper
export function createComponentConfig(overrides: Partial<ComponentConfig> = {}): ComponentConfig {
	return {
		...DEFAULT_COMPONENT_CONFIG,
		...overrides
	};
}

// Performance-based Configuration Presets
export const COMPONENT_PRESETS = {
	high: createComponentConfig({
		enableAnimations: true,
		useGPUAcceleration: true,
		performanceMode: 'high'
	}),
	balanced: createComponentConfig({
		enableAnimations: true,
		useGPUAcceleration: true,
		performanceMode: 'balanced'
	}),
	low: createComponentConfig({
		enableAnimations: false,
		useGPUAcceleration: false,
		performanceMode: 'low'
	}),
	debug: createComponentConfig({
		enableAnimations: true,
		useGPUAcceleration: true,
		performanceMode: 'high',
		debugMode: true
	})
} as const;

// Component Prop Types (for TypeScript support)
export interface BaseComponentProps {
	class?: string;
	style?: string;
	config?: Partial<ComponentConfig>;
}

export interface InteractiveComponentProps extends BaseComponentProps {
	disabled?: boolean;
	loading?: boolean;
	onClick?: () => void;
	onFocus?: () => void;
	onBlur?: () => void;
}

export interface ColorAwareComponentProps extends BaseComponentProps {
	dominantColor?: string;
	palette?: import('$stores/color').ColorPalette;
	useColorTransitions?: boolean;
}

export interface AnimatedComponentProps extends BaseComponentProps {
	animationDuration?: number;
	animationEasing?: string;
	reduceMotion?: boolean;
}

// 3D-Specific Component Props
export interface ThreeDComponentProps extends BaseComponentProps {
	enable3D?: boolean;
	fallbackTo2D?: boolean;
	webGLContext?: WebGLRenderingContext | null;
	performanceLevel?: 'high' | 'medium' | 'low';
	lodEnabled?: boolean;
}

export interface Object3DProps extends ThreeDComponentProps, ColorAwareComponentProps, AnimatedComponentProps {
	objectId: string;
	position: { x: number; y: number };
	size?: number;
	customization?: import('$stores/bookmarks').Object3DCustomization;
	isActive?: boolean;
	onError?: () => void;
}

export interface ContextMenuProps extends BaseComponentProps {
	x: number;
	y: number;
	visible: boolean;
	category?: any;
	onClose?: () => void;
}

export interface ObjectSelectorProps extends BaseComponentProps {
	visible: boolean;
	currentObjectId?: string;
	category?: any;
	onSelect?: (objectId: string) => void;
	onClose?: () => void;
}

// Component Factory Functions
export function createColorAwareComponent<T extends ColorAwareComponentProps>(
	defaultProps: Partial<T> = {}
) {
	return function(props: T): T {
		return {
			useColorTransitions: true,
			...defaultProps,
			...props
		};
	};
}

export function createAnimatedComponent<T extends AnimatedComponentProps>(
	defaultProps: Partial<T> = {}
) {
	return function(props: T): T {
		return {
			animationDuration: 200,
			animationEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			reduceMotion: false,
			...defaultProps,
			...props
		};
	};
}

export function createThreeDComponent<T extends ThreeDComponentProps>(
	defaultProps: Partial<T> = {}
) {
	return function(props: T): T {
		return {
			enable3D: true,
			fallbackTo2D: true,
			performanceLevel: 'high',
			lodEnabled: true,
			...defaultProps,
			...props
		};
	};
}

// Component Validation Helpers
export function validateComponentProps<T extends BaseComponentProps>(
	props: T,
	requiredProps: (keyof T)[] = []
): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];
	
	for (const prop of requiredProps) {
		if (props[prop] === undefined || props[prop] === null) {
			errors.push(`Required prop '${String(prop)}' is missing`);
		}
	}
	
	return {
		isValid: errors.length === 0,
		errors
	};
}

export function validate3DComponentProps<T extends ThreeDComponentProps>(
	props: T,
	requiredProps: (keyof T)[] = []
): { isValid: boolean; errors: string[]; warnings: string[] } {
	const validation = validateComponentProps(props, requiredProps);
	const warnings: string[] = [];
	
	// 3D-specific validations
	if (props.enable3D && !props.fallbackTo2D) {
		warnings.push('3D enabled without fallback may cause issues on unsupported devices');
	}
	
	if (props.performanceLevel === 'high' && !props.lodEnabled) {
		warnings.push('High performance mode without LOD may impact frame rate');
	}
	
	return {
		...validation,
		warnings
	};
}

// Component Registry for Dynamic Loading
export const COMPONENT_REGISTRY = {
	// Core System
	'background': () => import('./Background.svelte'),
	'particle-system': () => import('./ParticleSystem.svelte'),
	'error-boundary': () => import('./ErrorBoundary.svelte'),
	
	// UI Interface
	'search-bar': () => import('./SearchBar.svelte'),
	'settings-panel': () => import('./SettingsPanel.svelte'),
	'setup-wizard': () => import('./SetupWizard.svelte'),
	
	// Bookmark System
	'bookmark-grid': () => import('./BookmarkGrid.svelte'),
	'bookmark-folder': () => import('./BookmarkFolder.svelte'),
	'bookmark-item': () => import('./BookmarkItem.svelte'),
	
	// 3D Object System
	'object-3d': () => import('./Object3D.svelte'),
	'context-menu': () => import('./ContextMenu.svelte'),
	'object-selector': () => import('./ObjectSelector.svelte'),
	
	// Utilities
	'color-picker': () => import('./ColorPicker.svelte'),
	'theme-selector': () => import('./ThemeSelector.svelte'),
	'notification-toast': () => import('./NotificationToast.svelte')
} as const;

export type ComponentName = keyof typeof COMPONENT_REGISTRY;

// Dynamic Component Loader
export async function loadComponent(name: ComponentName) {
	try {
		const componentModule = await COMPONENT_REGISTRY[name]();
		return componentModule.default;
	} catch (error) {
		console.error(`Failed to load component: ${name}`, error);
		return null;
	}
}

// Component Bundle Loader for Performance
export async function loadComponentBundle(names: ComponentName[]) {
	const promises = names.map(name => loadComponent(name));
	const components = await Promise.allSettled(promises);
	
	const loaded: Record<string, any> = {};
	const failed: string[] = [];
	
	components.forEach((result, index) => {
		const name = names[index];
		if (result.status === 'fulfilled' && result.value) {
			loaded[name] = result.value;
		} else {
			failed.push(name);
		}
	});
	
	return { loaded, failed };
}

// 3D Component Bundle Loader
export async function load3DComponentBundle() {
	return loadComponentBundle(['object-3d', 'context-menu', 'object-selector']);
}

// Component Performance Monitor
export class ComponentPerformanceMonitor {
	private static instance: ComponentPerformanceMonitor;
	private metrics = new Map<string, { renderTime: number; updateCount: number; last3DRender?: number }>();
	private threeDMetrics = new Map<string, { frameTime: number; memoryUsage: number; drawCalls: number }>();
	
	static getInstance(): ComponentPerformanceMonitor {
		if (!ComponentPerformanceMonitor.instance) {
			ComponentPerformanceMonitor.instance = new ComponentPerformanceMonitor();
		}
		return ComponentPerformanceMonitor.instance;
	}
	
	startRender(componentName: string): () => void {
		const startTime = performance.now();
		
		return () => {
			const endTime = performance.now();
			const renderTime = endTime - startTime;
			
			const existing = this.metrics.get(componentName) || { renderTime: 0, updateCount: 0 };
			this.metrics.set(componentName, {
				renderTime: (existing.renderTime + renderTime) / (existing.updateCount + 1),
				updateCount: existing.updateCount + 1,
				last3DRender: componentName.includes('3d') ? endTime : existing.last3DRender
			});
		};
	}
	
	record3DMetrics(objectId: string, frameTime: number, memoryUsage: number, drawCalls: number) {
		this.threeDMetrics.set(objectId, { frameTime, memoryUsage, drawCalls });
	}
	
	getMetrics(componentName?: string) {
		if (componentName) {
			return this.metrics.get(componentName);
		}
		return Object.fromEntries(this.metrics);
	}
	
	get3DMetrics(objectId?: string) {
		if (objectId) {
			return this.threeDMetrics.get(objectId);
		}
		return Object.fromEntries(this.threeDMetrics);
	}
	
	getOverallPerformance() {
		const allMetrics = Array.from(this.metrics.values());
		const threeDMetrics = Array.from(this.threeDMetrics.values());
		
		return {
			averageRenderTime: allMetrics.reduce((sum, m) => sum + m.renderTime, 0) / allMetrics.length || 0,
			totalComponents: allMetrics.length,
			active3DObjects: threeDMetrics.length,
			average3DFrameTime: threeDMetrics.reduce((sum, m) => sum + m.frameTime, 0) / threeDMetrics.length || 0,
			total3DMemoryUsage: threeDMetrics.reduce((sum, m) => sum + m.memoryUsage, 0),
			total3DDrawCalls: threeDMetrics.reduce((sum, m) => sum + m.drawCalls, 0)
		};
	}
	
	reset() {
		this.metrics.clear();
		this.threeDMetrics.clear();
	}
}

// WebGL Support Detection
export function detectWebGLSupport(): { webgl: boolean; webgl2: boolean; extensions: string[] } {
	try {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		const gl2 = canvas.getContext('webgl2');
		
		const extensions: string[] = [];
		if (gl) {
			const availableExtensions = gl.getSupportedExtensions();
			if (availableExtensions) {
				extensions.push(...availableExtensions);
			}
		}
		
		return {
			webgl: !!gl,
			webgl2: !!gl2,
			extensions
		};
	} catch (error) {
		return { webgl: false, webgl2: false, extensions: [] };
	}
}

// 3D Performance Optimizer
export class ThreeDPerformanceOptimizer {
	private static instance: ThreeDPerformanceOptimizer;
	private currentLevel: 'high' | 'medium' | 'low' = 'high';
	private frameRateHistory: number[] = [];
	private readonly maxHistoryLength = 60; // 1 second at 60fps
	
	static getInstance(): ThreeDPerformanceOptimizer {
		if (!ThreeDPerformanceOptimizer.instance) {
			ThreeDPerformanceOptimizer.instance = new ThreeDPerformanceOptimizer();
		}
		return ThreeDPerformanceOptimizer.instance;
	}
	
	recordFrameRate(fps: number) {
		this.frameRateHistory.push(fps);
		if (this.frameRateHistory.length > this.maxHistoryLength) {
			this.frameRateHistory.shift();
		}
		
		this.adjustPerformanceLevel();
	}
	
	private adjustPerformanceLevel() {
		if (this.frameRateHistory.length < 30) return; // Wait for enough data
		
		const averageFPS = this.frameRateHistory.reduce((sum, fps) => sum + fps, 0) / this.frameRateHistory.length;
		
		if (averageFPS < 30 && this.currentLevel !== 'low') {
			this.currentLevel = 'low';
			this.notifyPerformanceLevelChange();
		} else if (averageFPS < 45 && this.currentLevel === 'high') {
			this.currentLevel = 'medium';
			this.notifyPerformanceLevelChange();
		} else if (averageFPS > 55 && this.currentLevel !== 'high') {
			this.currentLevel = 'high';
			this.notifyPerformanceLevelChange();
		}
	}
	
	private notifyPerformanceLevelChange() {
		window.dispatchEvent(new CustomEvent('3d-performance-level-change', {
			detail: { level: this.currentLevel }
		}));
	}
	
	getCurrentLevel() {
		return this.currentLevel;
	}
	
	getRecommendedSettings() {
		switch (this.currentLevel) {
			case 'high':
				return { maxObjects: 20, enableShadows: true, enablePostProcessing: true, lodDistance: 10 };
			case 'medium':
				return { maxObjects: 15, enableShadows: false, enablePostProcessing: false, lodDistance: 7 };
			case 'low':
				return { maxObjects: 10, enableShadows: false, enablePostProcessing: false, lodDistance: 5 };
		}
	}
}

// Component Hot Reload Helper (Development)
export function enableComponentHotReload() {
	if (import.meta.hot) {
		import.meta.hot.accept((newModule) => {
			console.log('Components hot reloaded');
		});
	}
}

// Export utilities for easier access
export const componentUtils = {
	createComponentConfig,
	createColorAwareComponent,
	createAnimatedComponent,
	createThreeDComponent,
	validateComponentProps,
	validate3DComponentProps,
	loadComponent,
	loadComponentBundle,
	load3DComponentBundle,
	detectWebGLSupport,
	ComponentPerformanceMonitor,
	ThreeDPerformanceOptimizer
};

// Re-export component imports for direct usage
import Background from './Background.svelte';
import ParticleSystem from './ParticleSystem.svelte';
import ErrorBoundary from './ErrorBoundary.svelte';
import SearchBar from './SearchBar.svelte';
import SettingsPanel from './SettingsPanel.svelte';
import SetupWizard from './SetupWizard.svelte';
import BookmarkGrid from './BookmarkGrid.svelte';
import BookmarkFolder from './BookmarkFolder.svelte';
import BookmarkItem from './BookmarkItem.svelte';
import Object3D from './Object3D.svelte';
import ContextMenu from './ContextMenu.svelte';
import ObjectSelector from './ObjectSelector.svelte';
import ColorPicker from './ColorPicker.svelte';
import ThemeSelector from './ThemeSelector.svelte';
import NotificationToast from './NotificationToast.svelte';
