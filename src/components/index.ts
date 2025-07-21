// ===== IMPORT ALL COMPONENTS FIRST =====
import Background from './Background.svelte';
import ParticleSystem from './ParticleSystem.svelte';
import ErrorBoundary from './ErrorBoundary.svelte';
import SearchBar from './SearchBar.svelte';
import SettingsPanel from './SettingsPanel.svelte';
import SetupWizard from './SetupWizard.svelte';
import BookmarkGrid from './BookmarkGrid.svelte';
import BookmarkItem from './BookmarkItem.svelte';
import BookmarkModal from './BookmarkModal.svelte';
import Object3D from './Object3D.svelte';
import ContextMenu from './ContextMenu.svelte';
import ObjectSelector from './ObjectSelector.svelte';
import ColorPicker from './ColorPicker.svelte';
import ThemeSelector from './ThemeSelector.svelte';
import NotificationToast from './NotificationToast.svelte';

// ===== RE-EXPORT COMPONENTS =====
export {
	Background,
	ParticleSystem,
	ErrorBoundary,
	SearchBar,
	SettingsPanel,
	SetupWizard,
	BookmarkGrid,
	BookmarkItem,
	BookmarkModal,
	Object3D,
	ContextMenu,
	ObjectSelector,
	ColorPicker,
	ThemeSelector,
	NotificationToast
};

// ===== COMPONENT GROUPS (Now variables are in scope) =====
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
	BookmarkItem,
	BookmarkModal
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

// ===== COMPONENT CONFIGURATION =====
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

export function createComponentConfig(overrides: Partial<ComponentConfig> = {}): ComponentConfig {
	return {
		...DEFAULT_COMPONENT_CONFIG,
		...overrides
	};
}

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

// ===== COMPONENT PROP TYPES =====
export interface BaseComponentProps {
	class?: string;
	style?: string;
	config?: Partial<ComponentConfig>;
}

export interface InteractiveComponentProps extends BaseComponentProps {
	disabled?: boolean;
}

export interface ThreeDComponentProps extends BaseComponentProps {
	webglSupported?: boolean;
	performanceMode?: 'high' | 'balanced' | 'low';
	fallbackTo2D?: boolean;
}

// ===== COMPONENT REGISTRY FOR DYNAMIC LOADING =====
export const COMPONENT_REGISTRY = {
	// Core System
	background: () => import('./Background.svelte'),
	'particle-system': () => import('./ParticleSystem.svelte'),
	'error-boundary': () => import('./ErrorBoundary.svelte'),

	// UI Interface
	'search-bar': () => import('./SearchBar.svelte'),
	'settings-panel': () => import('./SettingsPanel.svelte'),
	'setup-wizard': () => import('./SetupWizard.svelte'),

	// Bookmark System
	'bookmark-grid': () => import('./BookmarkGrid.svelte'),
	'bookmark-item': () => import('./BookmarkItem.svelte'),
	'bookmark-modal': () => import('./BookmarkModal.svelte'),

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

// ===== DYNAMIC COMPONENT LOADER =====
export async function loadComponent(name: ComponentName) {
	try {
		const componentModule = await COMPONENT_REGISTRY[name]();
		return componentModule.default;
	} catch (error) {
		console.error(`Failed to load component: ${name}`, error);
		return null;
	}
}

export async function loadComponentBundle(names: ComponentName[]) {
	const promises = names.map((name) => loadComponent(name));
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

export async function load3DComponentBundle() {
	return loadComponentBundle(['object-3d', 'context-menu', 'object-selector']);
}

// ===== WEBGL DETECTION =====
export function detectWebGLSupport(): boolean {
	try {
		const canvas = document.createElement('canvas');
		const webgl = canvas.getContext('webgl2') || canvas.getContext('webgl');
		return !!webgl;
	} catch {
		return false;
	}
}

// ===== COMPONENT UTILITIES =====
export const componentUtils = {
	createComponentConfig,
	loadComponent,
	loadComponentBundle,
	load3DComponentBundle,
	detectWebGLSupport
};
