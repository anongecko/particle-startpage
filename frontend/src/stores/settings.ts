import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { debounce } from '$lib/utils';

// ===== TYPE DEFINITIONS =====

export type KeyboardModifier = 'ctrl' | 'cmd' | 'alt' | 'shift';
export type ThemeColorMode = 'auto' | 'light' | 'dark' | 'custom';
export type PerformanceMode = 'auto' | 'high' | 'balanced' | 'low';
export type Objects3DPerformanceMode = 'low' | 'medium' | 'high' | 'ultra';
export type MaterialType = 'standard' | 'physical' | 'phong' | 'lambert' | 'toon';
export type ColorAdaptationMode = 'auto' | 'dominant' | 'vibrant' | 'muted' | 'custom';

export interface KeyboardShortcuts {
	openSearch: string;
	openSettings: string;
	toggleFullscreen: string;
	nextWallpaper: string;
	previousWallpaper: string;
	toggleParticles: string;
	newBookmark: string;
	exportData: string;
	undo: string;
	redo: string;
}

export interface SearchEngine {
	id: string;
	name: string;
	url: string;
	icon?: string;
	isDefault: boolean;
	isCustom: boolean;
	suggestions?: boolean;
	shortcuts?: string[];
}

export interface ParticleSettings {
	enabled: boolean;
	count: number;
	speed: number;
	connectionDistance: number;
	opacity: number;
	size: number;
	color: string;
	responseRadius: number;
	maxConnections: number;
	enablePhysics: boolean;
	enableTrails: boolean;
	quality: 'low' | 'medium' | 'high';
	adaptToTheme: boolean;
	interactionStrength: number;
	fadeEdges: boolean;
}

export interface WallpaperSettings {
	currentTheme: string;
	autoCycle: boolean;
	cycleInterval: number;
	transitionType: string;
	preloadNext: boolean;
	maintainAspectRatio: boolean;
	backgroundBlur: number;
	dimming: number;
	saturation: number;
	contrast: number;
	enableColorExtraction: boolean;
	colorExtractionQuality: 'fast' | 'balanced' | 'quality';
	shuffleMode: boolean;
	favoriteThemes: string[];
}

export interface UISettings {
	opacity: number;
	blurIntensity: number;
	cornerRadius: number;
	colorMode: ThemeColorMode;
	adaptiveColors: boolean;
	customTheme: {
		primary: string;
		secondary: string;
		accent: string;
		background: string;
		text: string;
	};
	animations: {
		enabled: boolean;
		duration: number;
		easing: string;
		reduceMotion: boolean;
		enableHoverEffects: boolean;
		enableFocusEffects: boolean;
		staggerDelay: number;
	};
	layout: {
		maxWidth: number;
		spacing: number;
		verticalAlignment: 'top' | 'center' | 'bottom';
		horizontalAlignment: 'left' | 'center' | 'right';
	};
	responsiveness: {
		enableMobileOptimization: boolean;
		breakpoints: {
			mobile: number;
			tablet: number;
			desktop: number;
		};
	};
}

export interface PerformanceSettings {
	mode: PerformanceMode;
	targetFPS: number;
	enableGPUAcceleration: boolean;
	preloadImages: boolean;
	enableLazyLoading: boolean;
	memoryLimit: number;
	enableMetrics: boolean;
	adaptToDevice: boolean;
	monitoring: {
		enableFPSCounter: boolean;
		enableMemoryUsage: boolean;
		showLoadTimes: boolean;
		logPerformance: boolean;
	};
	optimization: {
		lazyLoading: boolean;
		imageCompression: boolean;
		bundleCompression: boolean;
		codesplitting: boolean;
		serviceworker: boolean;
	};
}

export interface ColorSettings {
	extractionQuality: 'fast' | 'balanced' | 'quality';
	cacheSize: number;
	updateInterval: number;
	smoothTransitions: boolean;
	adaptUI: boolean;
	adaptParticles: boolean;
	contrastEnhancement: boolean;
	colorBlindnessMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
	temperature: {
		warmth: number;
		coolness: number;
		autoAdjust: boolean;
	};
	harmony: {
		enabled: boolean;
		type: 'complementary' | 'triadic' | 'analogous' | 'split-complementary';
		strength: number;
	};
}

export interface AccessibilitySettings {
	screenReader: boolean;
	keyboardNavigation: boolean;
	highContrast: boolean;
	largeText: boolean;
	reduceMotion: boolean;
	focusIndicators: boolean;
	colorBlindSupport: boolean;
	audioFeedback: boolean;
	hapticFeedback: boolean;
	simplified: boolean;
}

export interface DeveloperSettings {
	debugMode: boolean;
	showPerformanceMetrics: boolean;
	enableHotReload: boolean;
	verboseLogging: boolean;
	experimentalFeatures: boolean;
	apiEndpoint: string;
	localStorageDebug: boolean;
	componentBoundaries: boolean;
	errorReporting: boolean;
	analytics: boolean;
}

export interface SecuritySettings {
	cookieConsent: boolean;
	trackingProtection: boolean;
	contentSecurityPolicy: boolean;
	localStorageEncryption: boolean;
	sessionTimeout: number;
	secureHeaders: boolean;
	dataRetention: number;
	anonymizeData: boolean;
}

export interface Objects3DSettings {
	enabled: boolean;
	performanceMode: Objects3DPerformanceMode;
	enableAnimations: boolean;
	enableGlow: boolean;
	enableShadows: boolean;
	enableReflections: boolean;
	globalScale: number;
	animationSpeed: number;
	autoMigration: boolean;
	fallbackTo2D: boolean;
	lodEnabled: boolean;
	shadowQuality: 'low' | 'medium' | 'high';
	lightingQuality: 'low' | 'medium' | 'high';
	antiAliasing: boolean;
	renderResolution: number;
	maxActiveObjects: number;
	cullingDistance: number;
	materialQuality: 'low' | 'medium' | 'high';
	defaultMaterial: MaterialType;
	colorAdaptation: {
		enabled: boolean;
		mode: ColorAdaptationMode;
		intensity: number;
		saturationBoost: number;
		lightnessAdjust: number;
		transitionDuration: number;
	};
	physics: {
		enabled: boolean;
		gravity: number;
		friction: number;
		bounciness: number;
	};
	interaction: {
		enableHover: boolean;
		enableClick: boolean;
		enableDrag: boolean;
		hoverScale: number;
		clickScale: number;
		responseTime: number;
	};
	optimization: {
		frustumCulling: boolean;
		occlusionCulling: boolean;
		instanceMerging: boolean;
		geometryOptimization: boolean;
		textureCompression: boolean;
		autoLOD: boolean;
	};
}

export interface ThemeProfile {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	wallpaperTheme: string;
	particles: Partial<ParticleSettings>;
	ui: Partial<UISettings>;
	color: Partial<ColorSettings>;
	performance: Partial<PerformanceSettings>;
	objects3d?: Partial<Objects3DSettings>;
	dominantColor?: string;
	isBuiltIn: boolean;
	isActive: boolean;
	createdAt: number;
	updatedAt: number;
	tags: string[];
	preview?: {
		thumbnail: string;
		colors: string[];
		description: string;
	};
}

export interface Settings {
	version: string;
	lastUpdated: number;
	migrationVersion: number;
	keyboard: {
		modifier: KeyboardModifier;
		shortcuts: KeyboardShortcuts;
		customShortcuts: Record<string, string>;
		enableGlobalShortcuts: boolean;
	};
	particles: ParticleSettings;
	wallpaper: WallpaperSettings;
	searchEngines: SearchEngine[];
	ui: UISettings;
	performance: PerformanceSettings;
	color: ColorSettings;
	accessibility: AccessibilitySettings;
	developer: DeveloperSettings;
	security: SecuritySettings;
	objects3d: Objects3DSettings;
	profiles: ThemeProfile[];
	activeProfile?: string;
	backup: {
		autoBackup: boolean;
		backupInterval: number;
		maxBackups: number;
		includeImages: boolean;
		cloudSync: boolean;
	};
	sync: {
		enabled: boolean;
		provider: 'none' | 'google' | 'github' | 'custom';
		endpoint?: string;
		lastSync: number;
		conflicts: 'local' | 'remote' | 'merge';
	};
}

// ===== DEFAULT SETTINGS =====

const DEFAULT_SETTINGS: Settings = {
	version: '2.1.0',
	lastUpdated: Date.now(),
	migrationVersion: 2,
	keyboard: {
		modifier: 'ctrl',
		shortcuts: {
			openSearch: 'ctrl+k',
			openSettings: 'ctrl+comma',
			toggleFullscreen: 'f11',
			nextWallpaper: 'ctrl+right',
			previousWallpaper: 'ctrl+left',
			toggleParticles: 'ctrl+p',
			newBookmark: 'ctrl+b',
			exportData: 'ctrl+e',
			undo: 'ctrl+z',
			redo: 'ctrl+y'
		},
		customShortcuts: {},
		enableGlobalShortcuts: true
	},
	particles: {
		enabled: true,
		count: 80,
		speed: 0.5,
		connectionDistance: 120,
		opacity: 0.6,
		size: 2,
		color: '#ffffff',
		responseRadius: 150,
		maxConnections: 3,
		enablePhysics: false,
		enableTrails: false,
		quality: 'medium',
		adaptToTheme: true,
		interactionStrength: 1.0,
		fadeEdges: true
	},
	wallpaper: {
		currentTheme: 'default',
		autoCycle: true,
		cycleInterval: 600000,
		transitionType: 'fade',
		preloadNext: true,
		maintainAspectRatio: true,
		backgroundBlur: 0,
		dimming: 0,
		saturation: 100,
		contrast: 100,
		enableColorExtraction: true,
		colorExtractionQuality: 'balanced',
		shuffleMode: false,
		favoriteThemes: []
	},
	searchEngines: [
		{
			id: 'google',
			name: 'Google',
			url: 'https://www.google.com/search?q=%s',
			isDefault: true,
			isCustom: false,
			suggestions: true,
			shortcuts: ['g', 'google']
		},
		{
			id: 'duckduckgo',
			name: 'DuckDuckGo',
			url: 'https://duckduckgo.com/?q=%s',
			isDefault: false,
			isCustom: false,
			suggestions: true,
			shortcuts: ['ddg', 'duck']
		}
	],
	ui: {
		opacity: 90,
		blurIntensity: 8,
		cornerRadius: 12,
		colorMode: 'auto',
		adaptiveColors: true,
		customTheme: {
			primary: '#4a90e2',
			secondary: '#7b68ee',
			accent: '#50c878',
			background: 'rgba(255, 255, 255, 0.1)',
			text: '#ffffff'
		},
		animations: {
			enabled: true,
			duration: 300,
			easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
			reduceMotion: false,
			enableHoverEffects: true,
			enableFocusEffects: true,
			staggerDelay: 50
		},
		layout: {
			maxWidth: 1200,
			spacing: 16,
			verticalAlignment: 'center',
			horizontalAlignment: 'center'
		},
		responsiveness: {
			enableMobileOptimization: true,
			breakpoints: {
				mobile: 768,
				tablet: 1024,
				desktop: 1440
			}
		}
	},
	performance: {
		mode: 'auto',
		targetFPS: 60,
		enableGPUAcceleration: true,
		preloadImages: true,
		enableLazyLoading: true,
		memoryLimit: 512,
		enableMetrics: false,
		adaptToDevice: true,
		monitoring: {
			enableFPSCounter: false,
			enableMemoryUsage: false,
			showLoadTimes: false,
			logPerformance: false
		},
		optimization: {
			lazyLoading: true,
			imageCompression: true,
			bundleCompression: true,
			codesplitting: true,
			serviceworker: true
		}
	},
	color: {
		extractionQuality: 'balanced',
		cacheSize: 100,
		updateInterval: 500,
		smoothTransitions: true,
		adaptUI: true,
		adaptParticles: true,
		contrastEnhancement: false,
		colorBlindnessMode: 'none',
		temperature: {
			warmth: 0,
			coolness: 0,
			autoAdjust: false
		},
		harmony: {
			enabled: true,
			type: 'complementary',
			strength: 0.7
		}
	},
	accessibility: {
		screenReader: false,
		keyboardNavigation: true,
		highContrast: false,
		largeText: false,
		reduceMotion: false,
		focusIndicators: true,
		colorBlindSupport: false,
		audioFeedback: false,
		hapticFeedback: false,
		simplified: false
	},
	developer: {
		debugMode: false,
		showPerformanceMetrics: false,
		enableHotReload: true,
		verboseLogging: false,
		experimentalFeatures: false,
		apiEndpoint: '/api',
		localStorageDebug: false,
		componentBoundaries: false,
		errorReporting: true,
		analytics: false
	},
	security: {
		cookieConsent: false,
		trackingProtection: true,
		contentSecurityPolicy: true,
		localStorageEncryption: false,
		sessionTimeout: 3600000,
		secureHeaders: true,
		dataRetention: 2592000000,
		anonymizeData: true
	},
	objects3d: {
		enabled: true,
		performanceMode: 'high',
		enableAnimations: true,
		enableGlow: true,
		enableShadows: true,
		enableReflections: false,
		globalScale: 1.0,
		animationSpeed: 1.0,
		autoMigration: true,
		fallbackTo2D: true,
		lodEnabled: true,
		shadowQuality: 'medium',
		lightingQuality: 'medium',
		antiAliasing: true,
		renderResolution: 1.0,
		maxActiveObjects: 50,
		cullingDistance: 1000,
		materialQuality: 'medium',
		defaultMaterial: 'standard',
		colorAdaptation: {
			enabled: true,
			mode: 'auto',
			intensity: 1.0,
			saturationBoost: 0.2,
			lightnessAdjust: 0.0,
			transitionDuration: 800
		},
		physics: {
			enabled: false,
			gravity: -9.81,
			friction: 0.8,
			bounciness: 0.3
		},
		interaction: {
			enableHover: true,
			enableClick: true,
			enableDrag: false,
			hoverScale: 1.1,
			clickScale: 0.95,
			responseTime: 200
		},
		optimization: {
			frustumCulling: true,
			occlusionCulling: false,
			instanceMerging: true,
			geometryOptimization: true,
			textureCompression: true,
			autoLOD: true
		}
	},
	profiles: [],
	backup: {
		autoBackup: true,
		backupInterval: 86400000,
		maxBackups: 10,
		includeImages: false,
		cloudSync: false
	},
	sync: {
		enabled: false,
		provider: 'none',
		lastSync: 0,
		conflicts: 'local'
	}
};

// ===== SETTINGS STORE CLASS =====

class SettingsStore {
	private store = writable<Settings>(DEFAULT_SETTINGS);
	private storageKey = 'particle-nexus-settings-v2.1';
	private backupKey = 'particle-nexus-settings-backup';
	private changeListeners = new Set<(settings: Settings) => void>();
	private debouncedSave = debounce(this.saveToStorage.bind(this), 1000);
	private validationRules = new Map<string, (value: any) => boolean>();

	constructor() {
		this.setupValidationRules();
		this.loadFromStorage();
		this.startAutoBackup();

		// Subscribe to store changes and save to storage
		this.store.subscribe((settings) => {
			this.debouncedSave(settings);
			this.notifyChangeListeners(settings);
		});
	}

	// Public API
	subscribe = this.store.subscribe;

	update(updater: (settings: Settings) => Settings): void {
		this.store.update((settings) => {
			const updated = updater(settings);
			return {
				...updated,
				lastUpdated: Date.now()
			};
		});
	}

	set(settings: Settings): void {
		const validated = this.validateSettings(settings);
		this.store.set({
			...validated,
			lastUpdated: Date.now()
		});
	}

	get(): Settings {
		return get(this.store);
	}

	// Settings updates
	updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
		this.update((settings) => ({
			...settings,
			[key]: value
		}));
	}

	updateNestedSetting(path: string, value: any): void {
		this.update((settings) => {
			const newSettings = { ...settings };
			this.setNestedValue(newSettings, path, value);
			return newSettings;
		});
	}

	// 3D Settings specific methods
	update3DSettings(updates: Partial<Objects3DSettings>): void {
		this.update((settings) => ({
			...settings,
			objects3d: {
				...settings.objects3d,
				...updates
			}
		}));
	}

	apply3DPerformancePreset(preset: Objects3DPerformanceMode): void {
		const presets: Record<Objects3DPerformanceMode, Partial<Objects3DSettings>> = {
			low: {
				enableAnimations: false,
				enableGlow: false,
				enableShadows: false,
				enableReflections: false,
				shadowQuality: 'low',
				lightingQuality: 'low',
				antiAliasing: false,
				renderResolution: 0.75,
				maxActiveObjects: 20,
				materialQuality: 'low',
				lodEnabled: true,
				optimization: {
					frustumCulling: true,
					occlusionCulling: true,
					instanceMerging: true,
					geometryOptimization: true,
					textureCompression: true,
					autoLOD: true
				}
			},
			medium: {
				enableAnimations: true,
				enableGlow: false,
				enableShadows: false,
				enableReflections: false,
				shadowQuality: 'low',
				lightingQuality: 'medium',
				antiAliasing: true,
				renderResolution: 0.9,
				maxActiveObjects: 35,
				materialQuality: 'medium',
				lodEnabled: true,
				optimization: {
					frustumCulling: true,
					occlusionCulling: false,
					instanceMerging: true,
					geometryOptimization: true,
					textureCompression: true,
					autoLOD: true
				}
			},
			high: {
				enableAnimations: true,
				enableGlow: true,
				enableShadows: true,
				enableReflections: false,
				shadowQuality: 'medium',
				lightingQuality: 'high',
				antiAliasing: true,
				renderResolution: 1.0,
				maxActiveObjects: 50,
				materialQuality: 'high',
				lodEnabled: true,
				optimization: {
					frustumCulling: true,
					occlusionCulling: false,
					instanceMerging: true,
					geometryOptimization: true,
					textureCompression: false,
					autoLOD: true
				}
			},
			ultra: {
				enableAnimations: true,
				enableGlow: true,
				enableShadows: true,
				enableReflections: true,
				shadowQuality: 'high',
				lightingQuality: 'high',
				antiAliasing: true,
				renderResolution: 1.25,
				maxActiveObjects: 100,
				materialQuality: 'high',
				lodEnabled: false,
				optimization: {
					frustumCulling: true,
					occlusionCulling: false,
					instanceMerging: false,
					geometryOptimization: false,
					textureCompression: false,
					autoLOD: false
				}
			}
		};

		const presetSettings = presets[preset];
		this.update3DSettings({
			performanceMode: preset,
			...presetSettings
		});
	}

	// WebGL support detection and auto-configuration
	configureFor3DSupport(webGLSupported: boolean, deviceCapabilities?: any): void {
		if (!webGLSupported) {
			this.update3DSettings({
				enabled: false,
				fallbackTo2D: true
			});
			return;
		}

		// Auto-detect performance mode based on device capabilities
		if (deviceCapabilities) {
			const { gpu, memory, cores } = deviceCapabilities;
			let recommendedMode: Objects3DPerformanceMode = 'medium';

			if (memory < 4096 || cores < 4) {
				recommendedMode = 'low';
			} else if (memory >= 8192 && cores >= 8 && gpu?.tier >= 2) {
				recommendedMode = 'high';
			} else if (memory >= 16384 && cores >= 12 && gpu?.tier >= 3) {
				recommendedMode = 'ultra';
			}

			this.apply3DPerformancePreset(recommendedMode);
		}
	}

	// Profile management
	createProfile(name: string, description: string): ThemeProfile {
		const currentSettings = this.get();
		const profile: ThemeProfile = {
			id: `profile_${Date.now()}`,
			name,
			description,
			version: currentSettings.version,
			author: 'User',
			wallpaperTheme: currentSettings.wallpaper.currentTheme,
			particles: currentSettings.particles,
			ui: currentSettings.ui,
			color: currentSettings.color,
			performance: currentSettings.performance,
			objects3d: currentSettings.objects3d,
			isBuiltIn: false,
			isActive: false,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			tags: []
		};

		this.update((settings) => ({
			...settings,
			profiles: [...settings.profiles, profile]
		}));

		return profile;
	}

	// Import/Export functionality
	exportSettings(includeProfiles = true, includeSearchEngines = true): string {
		const settings = this.get();
		const exportData = { ...settings };

		if (!includeProfiles) delete exportData.profiles;
		if (!includeSearchEngines) {
			exportData.searchEngines = exportData.searchEngines.filter((e) => !e.isCustom);
		}

		// Remove sensitive data
		delete (exportData.developer as any).apiEndpoint;
		delete (exportData as any).security;
		delete (exportData as any).sync;

		return JSON.stringify(exportData, null, 2);
	}

	async importSettings(jsonString: string, merge = false): Promise<boolean> {
		try {
			const imported = JSON.parse(jsonString);
			const migrated = this.migrateSettings(imported);
			const validated = this.validateSettings(migrated);

			if (merge) {
				const current = this.get();
				const merged = this.mergeSettings(current, validated);
				this.set(merged);
			} else {
				this.set(validated);
			}

			return true;
		} catch (error) {
			console.error('Failed to import settings:', error);
			return false;
		}
	}

	// Reset functionality
	reset(section?: keyof Settings): void {
		if (section) {
			this.updateSetting(section, DEFAULT_SETTINGS[section]);
		} else {
			this.set({ ...DEFAULT_SETTINGS });
		}
	}

	// Change listeners
	addChangeListener(callback: (settings: Settings) => void): () => void {
		this.changeListeners.add(callback);
		return () => this.changeListeners.delete(callback);
	}

	// Private methods
	private setupValidationRules(): void {
		this.validationRules.set('particles.count', (value) => value >= 10 && value <= 500);
		this.validationRules.set('ui.opacity', (value) => value >= 10 && value <= 100);
		this.validationRules.set('objects3d.globalScale', (value) => value >= 0.1 && value <= 5.0);
		this.validationRules.set('objects3d.animationSpeed', (value) => value >= 0.1 && value <= 10.0);
		this.validationRules.set(
			'objects3d.renderResolution',
			(value) => value >= 0.25 && value <= 2.0
		);
		this.validationRules.set('objects3d.maxActiveObjects', (value) => value >= 1 && value <= 200);
		this.validationRules.set('performance.targetFPS', (value) => value >= 15 && value <= 120);
	}

	private validateSettings(settings: any): Settings {
		// Deep validation of settings structure
		const validated = { ...DEFAULT_SETTINGS, ...settings };

		// Validate specific fields using validation rules
		for (const [path, validator] of this.validationRules.entries()) {
			const value = this.getNestedValue(validated, path);
			if (value !== undefined && !validator(value)) {
				this.setNestedValue(validated, path, this.getNestedValue(DEFAULT_SETTINGS, path));
			}
		}

		return validated;
	}

	private loadFromStorage(): void {
		if (!browser) return;

		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				const parsed = JSON.parse(stored);
				const migrated = this.migrateSettings(parsed);
				const validated = this.validateSettings(migrated);
				this.store.set(validated);
			}
		} catch (error) {
			console.warn('Failed to load settings from storage:', error);
			this.loadBackup();
		}
	}

	private getNestedValue(obj: any, path: string): any {
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}

	private setNestedValue(obj: any, path: string, value: any): void {
		const keys = path.split('.');
		const lastKey = keys.pop()!;
		const target = keys.reduce((current, key) => current[key], obj);
		target[lastKey] = value;
	}

	private migrateSettings(settings: any): Settings {
		const migrated = { ...settings };

		// Version 1 to 2 migration (existing migration)
		if (!migrated.migrationVersion || migrated.migrationVersion < 1) {
			if (!migrated.color) {
				migrated.color = DEFAULT_SETTINGS.color;
			}
			if (!migrated.accessibility) {
				migrated.accessibility = DEFAULT_SETTINGS.accessibility;
			}
			if (migrated.performance && !migrated.performance.monitoring) {
				migrated.performance.monitoring = DEFAULT_SETTINGS.performance.monitoring;
				migrated.performance.optimization = DEFAULT_SETTINGS.performance.optimization;
			}
			migrated.migrationVersion = 1;
		}

		// Version 2 migration - Add 3D settings
		if (migrated.migrationVersion < 2) {
			if (!migrated.objects3d) {
				migrated.objects3d = DEFAULT_SETTINGS.objects3d;
			}

			// Migrate any existing 3D-related settings if they exist elsewhere
			if (migrated.experimental?.enable3D !== undefined) {
				migrated.objects3d.enabled = migrated.experimental.enable3D;
				delete migrated.experimental?.enable3D;
			}

			// Update version info
			migrated.version = '2.1.0';
			migrated.migrationVersion = 2;
		}

		return migrated;
	}

	private mergeSettings(current: Settings, imported: Settings): Settings {
		return {
			...current,
			...imported,
			profiles: [...current.profiles, ...imported.profiles],
			searchEngines: this.mergeSearchEngines(current.searchEngines, imported.searchEngines),
			keyboard: {
				...current.keyboard,
				shortcuts: { ...current.keyboard.shortcuts, ...imported.keyboard.shortcuts }
			}
		};
	}

	private mergeSearchEngines(current: SearchEngine[], imported: SearchEngine[]): SearchEngine[] {
		const merged = [...current];

		for (const engine of imported) {
			const existingIndex = merged.findIndex((e) => e.id === engine.id);
			if (existingIndex >= 0) {
				merged[existingIndex] = { ...merged[existingIndex], ...engine };
			} else {
				merged.push(engine);
			}
		}

		return merged;
	}

	private startAutoBackup(): void {
		const settings = this.get();
		if (!settings.backup.autoBackup) return;

		setInterval(() => {
			this.createBackup();
		}, settings.backup.backupInterval);
	}

	private createBackup(): void {
		const settings = this.get();
		const backup = {
			timestamp: Date.now(),
			version: settings.version,
			settings: settings
		};

		try {
			localStorage.setItem(this.backupKey, JSON.stringify(backup));
		} catch (error) {
			console.warn('Failed to create settings backup:', error);
		}
	}

	private loadBackup(): boolean {
		try {
			const backup = localStorage.getItem(this.backupKey);
			if (backup) {
				const parsed = JSON.parse(backup);
				const validated = this.validateSettings(parsed.settings);
				this.store.set(validated);
				return true;
			}
		} catch (error) {
			console.warn('Failed to load backup:', error);
		}

		this.store.set({ ...DEFAULT_SETTINGS });
		return false;
	}

	private saveToStorage(settings: Settings): void {
		if (!browser) return;

		try {
			localStorage.setItem(this.storageKey, JSON.stringify(settings));
		} catch (error) {
			console.warn('Failed to save settings:', error);
		}
	}

	private notifyChangeListeners(settings: Settings): void {
		for (const listener of this.changeListeners) {
			try {
				listener(settings);
			} catch (error) {
				console.error('Settings change listener error:', error);
			}
		}
	}

	destroy(): void {
		this.changeListeners.clear();
	}
}

// ===== STORE INSTANCES AND DERIVED STORES =====

export const settingsStore = new SettingsStore();

// Section-specific derived stores
export const keyboardSettings = derived(settingsStore, ($settings) => $settings.keyboard);
export const particleSettings = derived(settingsStore, ($settings) => $settings.particles);
export const wallpaperSettings = derived(settingsStore, ($settings) => $settings.wallpaper);
export const uiSettings = derived(settingsStore, ($settings) => $settings.ui);
export const performanceSettings = derived(settingsStore, ($settings) => $settings.performance);
export const colorSettings = derived(settingsStore, ($settings) => $settings.color);
export const accessibilitySettings = derived(settingsStore, ($settings) => $settings.accessibility);
export const developerSettings = derived(settingsStore, ($settings) => $settings.developer);
export const objects3DSettings = derived(settingsStore, ($settings) => $settings.objects3d);

// Computed derived stores
export const isDebugMode = derived(settingsStore, ($settings) => $settings.developer.debugMode);
export const isHighPerformanceMode = derived(
	settingsStore,
	($settings) => $settings.performance.mode === 'high'
);
export const is3DEnabled = derived(settingsStore, ($settings) => $settings.objects3d.enabled);
export const shouldReduceMotion = derived(
	settingsStore,
	($settings) => $settings.ui.animations.reduceMotion || $settings.accessibility.reduceMotion
);
export const currentThemeProfile = derived(settingsStore, ($settings) =>
	$settings.profiles.find((p) => p.id === $settings.activeProfile)
);
export const defaultSearchEngine = derived(
	settingsStore,
	($settings) => $settings.searchEngines.find((e) => e.isDefault) || $settings.searchEngines[0]
);

// 3D-specific computed stores
export const effective3DSettings = derived(
	[settingsStore, performanceSettings],
	([$settings, $performance]) => {
		const objects3d = $settings.objects3d;

		// Auto-adjust 3D settings based on performance mode
		if ($performance.mode === 'low') {
			return {
				...objects3d,
				performanceMode: 'low' as Objects3DPerformanceMode,
				enableAnimations: false,
				enableGlow: false,
				enableShadows: false
			};
		}

		return objects3d;
	}
);

export const threeDCompatibilityMode = derived([settingsStore], ([$settings]) => ({
	webGLRequired: $settings.objects3d.enabled,
	fallbackEnabled: $settings.objects3d.fallbackTo2D,
	performanceMode: $settings.objects3d.performanceMode
}));

// Settings utilities
export const createSettingsPreset = (name: string, overrides: Partial<Settings>): ThemeProfile => ({
	id: `preset_${name.toLowerCase().replace(/\s+/g, '_')}`,
	name,
	description: `Preset: ${name}`,
	version: '2.1.0',
	author: 'System',
	wallpaperTheme: overrides.wallpaper?.currentTheme || 'default',
	particles: overrides.particles || {},
	ui: overrides.ui || {},
	color: overrides.color || {},
	performance: overrides.performance || {},
	objects3d: overrides.objects3d || {},
	isBuiltIn: true,
	isActive: false,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	tags: ['preset']
});

// Export store instance and utilities
export default settingsStore;
