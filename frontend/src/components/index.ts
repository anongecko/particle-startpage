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

// Component Performance Monitor
export class ComponentPerformanceMonitor {
	private static instance: ComponentPerformanceMonitor;
	private metrics = new Map<string, { renderTime: number; updateCount: number }>();
	
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
				updateCount: existing.updateCount + 1
			});
		};
	}
	
	getMetrics(componentName?: string) {
		if (componentName) {
			return this.metrics.get(componentName);
		}
		return Object.fromEntries(this.metrics);
	}
	
	reset() {
		this.metrics.clear();
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
	validateComponentProps,
	loadComponent,
	loadComponentBundle,
	ComponentPerformanceMonitor
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
import ColorPicker from './ColorPicker.svelte';
import ThemeSelector from './ThemeSelector.svelte';
import NotificationToast from './NotificationToast.svelte';
