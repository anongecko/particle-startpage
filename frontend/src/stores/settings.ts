import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { debounce } from '$lib/utils';

export interface KeyboardModifier {
	keys: string[];
	label: string;
	code: string;
}

export interface KeyboardShortcuts {
	toggleSettings: string;
	focusSearch: string;
	nextWallpaper: string;
	prevWallpaper: string;
	toggleParticles: string;
	clearCache: string;
	cyclePerformanceMode: string;
	exportSettings: string;
	importSettings: string;
	resetSettings: string;
	toggleDebugMode: string;
}

export interface ParticleSettings {
	enabled: boolean;
	count: number;
	speed: number;
	connectionDistance: number;
	connectionOpacity: number;
	mouseRepulsion: number;
	mouseAttraction: number;
	opacity: number;
	size: number;
	blur: boolean;
	glow: boolean;
	colorMode: 'dominant' | 'rainbow' | 'monochrome' | 'custom';
	customColor: string;
	physics: {
		gravity: number;
		friction: number;
		bounce: boolean;
	};
	interactions: {
		mouseRepulsion: boolean;
		mouseAttraction: boolean;
		clickRipple: boolean;
		edgeBounce: boolean;
	};
}

export interface WallpaperSettings {
	transitionDuration: number;
	cycleDuration: number;
	currentTheme: string;
	autoTransition: boolean;
	preloadCount: number;
	transitionType: 'fade' | 'slide' | 'zoom' | 'blur';
	quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
	scaling: 'cover' | 'contain' | 'fill' | 'scale-down';
	filters: {
		brightness: number;
		contrast: number;
		saturation: number;
		blur: number;
		sepia: number;
		grayscale: number;
	};
	randomization: {
		enabled: boolean;
		excludeCategories: string[];
		favoriteWeighting: number;
	};
}

export interface SearchEngine {
	id: string;
	name: string;
	icon: string;
	url: string;
	placeholder?: string;
	isDefault: boolean;
	isCustom: boolean;
	suggestions: boolean;
	category: 'web' | 'code' | 'academic' | 'media' | 'shopping' | 'custom';
	hotkey?: string;
}

export interface UISettings {
	fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
	fontWeight: 300 | 400 | 500 | 600 | 700;
	lineHeight: number;
	letterSpacing: number;
	autoHideTimeout: number;
	showClock: boolean;
	clockFormat: '12h' | '24h';
	clockPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
	showWeather: boolean;
	weatherLocation: string;
	showQuote: boolean;
	quoteCategory: 'inspirational' | 'tech' | 'random' | 'custom';
	customQuotes: string[];
	bookmarkSize: number;
	folderSize: number;
	gridColumns: number | 'auto';
	compactMode: boolean;
	animations: {
		enabled: boolean;
		speed: number;
		easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring' | 'bounce';
		reduceMotion: boolean;
		pageTransitions: boolean;
		hoverEffects: boolean;
		loadingAnimations: boolean;
	};
	glassmorphism: {
		intensity: number;
		blur: number;
		opacity: number;
		borderOpacity: number;
		shadows: boolean;
	};
	theme: {
		mode: 'auto' | 'light' | 'dark' | 'system';
		customColors: {
			primary: string;
			secondary: string;
			accent: string;
			background: string;
			surface: string;
			text: string;
		};
		colorAdaptation: boolean;
		highContrast: boolean;
	};
}

export interface PerformanceSettings {
	mode: 'auto' | 'high' | 'balanced' | 'low' | 'custom';
	targetFPS: number;
	maxParticles: number;
	enableBlur: boolean;
	enableShadows: boolean;
	enableGPUAcceleration: boolean;
	enableWebWorkers: boolean;
	cacheSize: number;
	preloadImages: number;
	lowMemoryMode: boolean;
	powerSaveMode: boolean;
	monitoring: {
		enabled: boolean;
		showFPS: boolean;
		showMemory: boolean;
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
	extractionQuality: 'fast' | 'balanced' | 'high';
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

const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
	{
		id: 'brave',
		name: 'Brave Search',
		icon: '🦁',
		url: 'https://search.brave.com/search?q=%s',
		placeholder: 'Search with Brave...',
		isDefault: true,
		isCustom: false,
		suggestions: true,
		category: 'web',
		hotkey: 'b'
	},
	{
		id: 'duckduckgo',
		name: 'DuckDuckGo',
		icon: '🦆',
		url: 'https://duckduckgo.com/?q=%s',
		placeholder: 'Search with DuckDuckGo...',
		isDefault: false,
		isCustom: false,
		suggestions: true,
		category: 'web',
		hotkey: 'd'
	},
	{
		id: 'google',
		name: 'Google',
		icon: '🔍',
		url: 'https://www.google.com/search?q=%s',
		placeholder: 'Search with Google...',
		isDefault: false,
		isCustom: false,
		suggestions: true,
		category: 'web',
		hotkey: 'g'
	},
	{
		id: 'github',
		name: 'GitHub',
		icon: '💻',
		url: 'https://github.com/search?q=%s',
		placeholder: 'Search GitHub...',
		isDefault: false,
		isCustom: false,
		suggestions: false,
		category: 'code',
		hotkey: 'h'
	},
	{
		id: 'youtube',
		name: 'YouTube',
		icon: '📺',
		url: 'https://www.youtube.com/results?search_query=%s',
		placeholder: 'Search YouTube...',
		isDefault: false,
		isCustom: false,
		suggestions: true,
		category: 'media',
		hotkey: 'y'
	}
];

const DEFAULT_SETTINGS: Settings = {
	version: '2.0.0',
	lastUpdated: Date.now(),
	migrationVersion: 1,
	keyboard: {
		modifier: {
			keys: ['ctrl'],
			label: 'Ctrl',
			code: 'ctrl'
		},
		shortcuts: {
			toggleSettings: 's',
			focusSearch: 'k',
			nextWallpaper: 'arrowright',
			prevWallpaper: 'arrowleft',
			toggleParticles: 'p',
			clearCache: 'delete',
			cyclePerformanceMode: 'm',
			exportSettings: 'e',
			importSettings: 'i',
			resetSettings: 'r',
			toggleDebugMode: 'f12'
		},
		customShortcuts: {},
		enableGlobalShortcuts: true
	},
	particles: {
		enabled: true,
		count: 75,
		speed: 0.5,
		connectionDistance: 150,
		connectionOpacity: 0.3,
		mouseRepulsion: 100,
		mouseAttraction: 50,
		opacity: 0.6,
		size: 2,
		blur: false,
		glow: true,
		colorMode: 'dominant',
		customColor: '#ffffff',
		physics: {
			gravity: 0,
			friction: 0.98,
			bounce: true
		},
		interactions: {
			mouseRepulsion: true,
			mouseAttraction: false,
			clickRipple: true,
			edgeBounce: true
		}
	},
	wallpaper: {
		transitionDuration: 1000,
		cycleDuration: 300000, // 5 minutes
		currentTheme: 'default',
		autoTransition: true,
		preloadCount: 3,
		transitionType: 'fade',
		quality: 'auto',
		scaling: 'cover',
		filters: {
			brightness: 100,
			contrast: 100,
			saturation: 100,
			blur: 0,
			sepia: 0,
			grayscale: 0
		},
		randomization: {
			enabled: true,
			excludeCategories: [],
			favoriteWeighting: 2
		}
	},
	searchEngines: DEFAULT_SEARCH_ENGINES,
	ui: {
		fontSize: 'base',
		fontWeight: 400,
		lineHeight: 1.6,
		letterSpacing: 0,
		autoHideTimeout: 30000,
		showClock: false,
		clockFormat: '24h',
		clockPosition: 'top-right',
		showWeather: false,
		weatherLocation: '',
		showQuote: false,
		quoteCategory: 'inspirational',
		customQuotes: [],
		bookmarkSize: 1,
		folderSize: 1,
		gridColumns: 'auto',
		compactMode: false,
		animations: {
			enabled: true,
			speed: 1,
			easing: 'ease-out',
			reduceMotion: false,
			pageTransitions: true,
			hoverEffects: true,
			loadingAnimations: true
		},
		glassmorphism: {
			intensity: 0.8,
			blur: 12,
			opacity: 0.1,
			borderOpacity: 0.2,
			shadows: true
		},
		theme: {
			mode: 'auto',
			customColors: {
				primary: '#4a90e2',
				secondary: '#5ba3f5',
				accent: '#ff6b6b',
				background: '#000000',
				surface: '#1a1a1a',
				text: '#ffffff'
			},
			colorAdaptation: true,
			highContrast: false
		}
	},
	performance: {
		mode: 'auto',
		targetFPS: 120,
		maxParticles: 150,
		enableBlur: true,
		enableShadows: true,
		enableGPUAcceleration: true,
		enableWebWorkers: true,
		cacheSize: 500,
		preloadImages: 5,
		lowMemoryMode: false,
		powerSaveMode: false,
		monitoring: {
			enabled: false,
			showFPS: false,
			showMemory: false,
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
		sessionTimeout: 3600000, // 1 hour
		secureHeaders: true,
		dataRetention: 2592000000, // 30 days
		anonymizeData: true
	},
	profiles: [],
	backup: {
		autoBackup: true,
		backupInterval: 86400000, // 24 hours
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

class SettingsStore {
	private store = writable<Settings>(DEFAULT_SETTINGS);
	private storageKey = 'particle-nexus-settings-v2';
	private backupKey = 'particle-nexus-settings-backup';
	private changeListeners = new Set<(settings: Settings) => void>();
	private debouncedSave = debounce(this.saveToStorage.bind(this), 1000);
	private validationRules = new Map<string, (value: any) => boolean>();

	subscribe = this.store.subscribe;

	constructor() {
		this.initializeValidationRules();
	}

	async initialize(): Promise<void> {
		if (!browser) return;

		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				const parsed = JSON.parse(stored);
				const migrated = this.migrateSettings(parsed);
				const validated = this.validateSettings(migrated);
				this.store.set(validated);
			} else {
				// Check for legacy settings
				const legacy = localStorage.getItem('particle-nexus-settings');
				if (legacy) {
					const migrated = this.migrateLegacySettings(JSON.parse(legacy));
					this.store.set(migrated);
					this.saveToStorage(migrated);
				} else {
					// First time setup - detect optimal settings
					const detectedSettings = await this.detectOptimalSettings();
					this.store.update(s => ({ ...s, ...detectedSettings }));
				}
			}

			// Start automatic backup if enabled
			this.startAutoBackup();

		} catch (error) {
			console.warn('Failed to load settings:', error);
			this.loadBackup();
		}
	}

	update(updater: (settings: Settings) => Settings): void {
		this.store.update(settings => {
			const newSettings = updater(settings);
			const validated = this.validateSettings(newSettings);
			validated.lastUpdated = Date.now();
			
			this.debouncedSave(validated);
			this.notifyChangeListeners(validated);
			
			return validated;
		});
	}

	// Enhanced setting methods
	updatePartial<K extends keyof Settings>(
		section: K, 
		updates: Partial<Settings[K]>
	): void {
		this.update(settings => ({
			...settings,
			[section]: { ...settings[section], ...updates }
		}));
	}

	batchUpdate(updates: Partial<Settings>): void {
		this.update(settings => ({ ...settings, ...updates }));
	}

	// Font size management
	setFontSize(size: UISettings['fontSize']): void {
		this.updatePartial('ui', { fontSize: size });
		
		// Apply immediately to DOM
		if (browser) {
			document.body.setAttribute('data-font-size', size);
		}
	}

	// Performance mode management
	setPerformanceMode(mode: PerformanceSettings['mode']): void {
		const modeSettings = this.getPerformanceModeSettings(mode);
		this.updatePartial('performance', { mode, ...modeSettings });
	}

	private getPerformanceModeSettings(mode: PerformanceSettings['mode']): Partial<PerformanceSettings> {
		switch (mode) {
			case 'high':
				return {
					targetFPS: 120,
					maxParticles: 150,
					enableBlur: true,
					enableShadows: true,
					enableGPUAcceleration: true,
					enableWebWorkers: true
				};
			case 'balanced':
				return {
					targetFPS: 60,
					maxParticles: 100,
					enableBlur: true,
					enableShadows: true,
					enableGPUAcceleration: true,
					enableWebWorkers: true
				};
			case 'low':
				return {
					targetFPS: 30,
					maxParticles: 50,
					enableBlur: false,
					enableShadows: false,
					enableGPUAcceleration: false,
					enableWebWorkers: false
				};
			default:
				return {};
		}
	}

	// Color settings management
	setColorExtractionQuality(quality: ColorSettings['extractionQuality']): void {
		this.updatePartial('color', { extractionQuality: quality });
	}

	// Glassmorphism management
	setGlassmorphismIntensity(intensity: number): void {
		const clampedIntensity = Math.max(0, Math.min(1, intensity));
		this.updatePartial('ui', {
			glassmorphism: {
				...get(this.store).ui.glassmorphism,
				intensity: clampedIntensity,
				blur: 4 + (clampedIntensity * 20),
				opacity: 0.05 + (clampedIntensity * 0.15)
			}
		});
	}

	// Search engine management
	addSearchEngine(engine: Omit<SearchEngine, 'id'>): void {
		const id = `custom_${Date.now()}_${Math.random().toString(36).substring(7)}`;
		const newEngine: SearchEngine = { ...engine, id, isCustom: true };
		
		this.update(settings => ({
			...settings,
			searchEngines: [...settings.searchEngines, newEngine]
		}));
	}

	updateSearchEngine(id: string, updates: Partial<SearchEngine>): void {
		this.update(settings => ({
			...settings,
			searchEngines: settings.searchEngines.map(engine =>
				engine.id === id ? { ...engine, ...updates } : engine
			)
		}));
	}

	removeSearchEngine(id: string): void {
		this.update(settings => ({
			...settings,
			searchEngines: settings.searchEngines.filter(engine => engine.id !== id)
		}));
	}

	setDefaultSearchEngine(id: string): void {
		this.update(settings => ({
			...settings,
			searchEngines: settings.searchEngines.map(engine => ({
				...engine,
				isDefault: engine.id === id
			}))
		}));
	}

	// Profile management
	saveProfile(profile: Omit<ThemeProfile, 'id' | 'createdAt' | 'updatedAt'>): void {
		const newProfile: ThemeProfile = {
			...profile,
			id: `profile_${Date.now()}_${Math.random().toString(36).substring(7)}`,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		this.update(settings => ({
			...settings,
			profiles: [...settings.profiles, newProfile]
		}));
	}

	loadProfile(profileId: string): void {
		const settings = get(this.store);
		const profile = settings.profiles.find(p => p.id === profileId);
		if (!profile) return;

		const updates: Partial<Settings> = {
			activeProfile: profileId
		};

		if (profile.particles) updates.particles = { ...settings.particles, ...profile.particles };
		if (profile.ui) updates.ui = { ...settings.ui, ...profile.ui };
		if (profile.color) updates.color = { ...settings.color, ...profile.color };
		if (profile.performance) updates.performance = { ...settings.performance, ...profile.performance };
		if (profile.wallpaperTheme) {
			updates.wallpaper = { ...settings.wallpaper, currentTheme: profile.wallpaperTheme };
		}

		this.batchUpdate(updates);
	}

	deleteProfile(profileId: string): void {
		this.update(settings => ({
			...settings,
			profiles: settings.profiles.filter(p => p.id !== profileId),
			activeProfile: settings.activeProfile === profileId ? undefined : settings.activeProfile
		}));
	}

	// Import/Export functionality
	exportSettings(includeProfiles = true, includeSearchEngines = true): string {
		const settings = get(this.store);
		const exportData = { ...settings };

		if (!includeProfiles) delete exportData.profiles;
		if (!includeSearchEngines) {
			exportData.searchEngines = exportData.searchEngines.filter(e => !e.isCustom);
		}

		// Remove sensitive data
		delete exportData.developer.apiEndpoint;
		delete exportData.security;
		delete exportData.sync;

		return JSON.stringify(exportData, null, 2);
	}

	async importSettings(jsonString: string, merge = false): Promise<boolean> {
		try {
			const imported = JSON.parse(jsonString);
			const migrated = this.migrateSettings(imported);
			const validated = this.validateSettings(migrated);

			if (merge) {
				const current = get(this.store);
				const merged = this.mergeSettings(current, validated);
				this.store.set(merged);
			} else {
				this.store.set(validated);
			}

			this.saveToStorage(get(this.store));
			return true;
		} catch (error) {
			console.error('Failed to import settings:', error);
			return false;
		}
	}

	// Backup and restore
	createBackup(): void {
		const settings = get(this.store);
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

	loadBackup(): boolean {
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
		
		// Fall back to defaults
		this.store.set({ ...DEFAULT_SETTINGS });
		return false;
	}

	// Reset functionality
	reset(section?: keyof Settings): void {
		if (section) {
			this.updatePartial(section, DEFAULT_SETTINGS[section] as any);
		} else {
			this.store.set({ ...DEFAULT_SETTINGS });
			this.saveToStorage(DEFAULT_SETTINGS);
			localStorage.removeItem(this.backupKey);
		}
	}

	// Change listeners
	addChangeListener(listener: (settings: Settings) => void): () => void {
		this.changeListeners.add(listener);
		return () => this.changeListeners.delete(listener);
	}

	private notifyChangeListeners(settings: Settings): void {
		this.changeListeners.forEach(listener => {
			try {
				listener(settings);
			} catch (error) {
				console.warn('Settings change listener error:', error);
			}
		});
	}

	// Device capability detection
	private async detectOptimalSettings(): Promise<Partial<Settings>> {
		const capabilities = await this.detectDeviceCapabilities();
		
		return {
			performance: {
				...DEFAULT_SETTINGS.performance,
				mode: capabilities.performance,
				targetFPS: capabilities.targetFPS,
				maxParticles: capabilities.maxParticles,
				enableBlur: capabilities.enableBlur,
				enableWebWorkers: capabilities.hasWebWorkers
			},
			ui: {
				...DEFAULT_SETTINGS.ui,
				animations: {
					...DEFAULT_SETTINGS.ui.animations,
					reduceMotion: capabilities.prefersReducedMotion
				}
			}
		};
	}

	private async detectDeviceCapabilities() {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		const devicePixelRatio = window.devicePixelRatio || 1;
		const screenArea = window.innerWidth * window.innerHeight;
		const memory = (navigator as any).deviceMemory || 4;
		const cores = navigator.hardwareConcurrency || 4;

		return {
			hasWebGL: !!gl,
			devicePixelRatio,
			screenArea,
			memory,
			cores,
			hasWebWorkers: typeof Worker !== 'undefined',
			prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
			performance: memory >= 8 && cores >= 8 ? 'high' : memory >= 4 ? 'balanced' : 'low',
			targetFPS: memory >= 8 ? 120 : 60,
			maxParticles: Math.min(150, Math.floor(screenArea / 10000)),
			enableBlur: memory >= 4 && !!gl
		};
	}

	// Validation
	private initializeValidationRules(): void {
		this.validationRules.set('ui.fontSize', (value) => 
			['xs', 'sm', 'base', 'lg', 'xl', '2xl'].includes(value)
		);
		this.validationRules.set('performance.mode', (value) => 
			['auto', 'high', 'balanced', 'low', 'custom'].includes(value)
		);
		this.validationRules.set('performance.targetFPS', (value) => 
			typeof value === 'number' && value >= 30 && value <= 240
		);
		this.validationRules.set('particles.count', (value) => 
			typeof value === 'number' && value >= 0 && value <= 500
		);
		// Add more validation rules as needed
	}

	private validateSettings(settings: Settings): Settings {
		const validated = { ...settings };

		// Validate using rules
		for (const [path, rule] of this.validationRules) {
			const value = this.getNestedValue(validated, path);
			if (value !== undefined && !rule(value)) {
				this.setNestedValue(validated, path, this.getNestedValue(DEFAULT_SETTINGS, path));
			}
		}

		return validated;
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

	// Settings migration
	private migrateSettings(settings: any): Settings {
		const migrated = { ...settings };

		// Version 1 to 2 migration
		if (!migrated.migrationVersion || migrated.migrationVersion < 1) {
			// Add new color settings
			if (!migrated.color) {
				migrated.color = DEFAULT_SETTINGS.color;
			}
			
			// Add new accessibility settings
			if (!migrated.accessibility) {
				migrated.accessibility = DEFAULT_SETTINGS.accessibility;
			}

			// Migrate old performance settings
			if (migrated.performance && !migrated.performance.monitoring) {
				migrated.performance.monitoring = DEFAULT_SETTINGS.performance.monitoring;
				migrated.performance.optimization = DEFAULT_SETTINGS.performance.optimization;
			}

			migrated.migrationVersion = 1;
		}

		return migrated;
	}

	private migrateLegacySettings(legacy: any): Settings {
		// Convert old settings format to new format
		return {
			...DEFAULT_SETTINGS,
			...legacy,
			version: DEFAULT_SETTINGS.version,
			migrationVersion: 1,
			lastUpdated: Date.now()
		};
	}

	private mergeSettings(current: Settings, imported: Settings): Settings {
		// Smart merge that preserves user customizations
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
			const existingIndex = merged.findIndex(e => e.id === engine.id);
			if (existingIndex >= 0) {
				merged[existingIndex] = { ...merged[existingIndex], ...engine };
			} else {
				merged.push(engine);
			}
		}
		
		return merged;
	}

	// Auto-backup
	private startAutoBackup(): void {
		const settings = get(this.store);
		if (!settings.backup.autoBackup) return;

		setInterval(() => {
			this.createBackup();
		}, settings.backup.backupInterval);
	}

	// Storage operations
	private saveToStorage(settings: Settings): void {
		if (!browser) return;

		try {
			localStorage.setItem(this.storageKey, JSON.stringify(settings));
		} catch (error) {
			console.warn('Failed to save settings:', error);
		}
	}

	// Cleanup
	destroy(): void {
		this.changeListeners.clear();
	}
}

// Create store instance
export const settingsStore = new SettingsStore();

// Derived stores for easy access to specific sections
export const keyboardSettings = derived(settingsStore, ($settings) => $settings.keyboard);
export const particleSettings = derived(settingsStore, ($settings) => $settings.particles);
export const wallpaperSettings = derived(settingsStore, ($settings) => $settings.wallpaper);
export const uiSettings = derived(settingsStore, ($settings) => $settings.ui);
export const performanceSettings = derived(settingsStore, ($settings) => $settings.performance);
export const colorSettings = derived(settingsStore, ($settings) => $settings.color);
export const accessibilitySettings = derived(settingsStore, ($settings) => $settings.accessibility);
export const developerSettings = derived(settingsStore, ($settings) => $settings.developer);

// Computed derived stores
export const isDebugMode = derived(settingsStore, ($settings) => $settings.developer.debugMode);
export const isHighPerformanceMode = derived(settingsStore, ($settings) => $settings.performance.mode === 'high');
export const shouldReduceMotion = derived(settingsStore, ($settings) => 
	$settings.ui.animations.reduceMotion || $settings.accessibility.reduceMotion
);
export const currentThemeProfile = derived(settingsStore, ($settings) => 
	$settings.profiles.find(p => p.id === $settings.activeProfile)
);
export const defaultSearchEngine = derived(settingsStore, ($settings) => 
	$settings.searchEngines.find(e => e.isDefault) || $settings.searchEngines[0]
);

// Settings utilities
export const createSettingsPreset = (name: string, overrides: Partial<Settings>): ThemeProfile => ({
	id: `preset_${name.toLowerCase().replace(/\s+/g, '_')}`,
	name,
	description: `Preset: ${name}`,
	version: '1.0.0',
	author: 'System',
	wallpaperTheme: overrides.wallpaper?.currentTheme || 'default',
	particles: overrides.particles || {},
	ui: overrides.ui || {},
	color: overrides.color || {},
	performance: overrides.performance || {},
	isBuiltIn: true,
	isActive: false,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	tags: ['preset']
});

// Export store instance and utilities
export default settingsStore;
