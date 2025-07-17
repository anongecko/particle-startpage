import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface KeyboardModifier {
	keys: string[];
	label: string;
	code: string;
}

export interface ParticleSettings {
	count: number;
	speed: number;
	connectionDistance: number;
	mouseRepulsion: number;
	opacity: number;
	enabled: boolean;
}

export interface WallpaperSettings {
	transitionDuration: number; // ms
	cycleDuration: number; // ms (0 = never)
	currentTheme: string;
	autoTransition: boolean;
	preloadCount: number;
}

export interface SearchEngine {
	id: string;
	name: string;
	icon: string;
	url: string;
	placeholder?: string;
	isDefault: boolean;
	isCustom: boolean;
}

export interface UISettings {
	autoHideTimeout: number; // ms (0 = never)
	showClock: boolean;
	clockFormat: '12h' | '24h';
	reducedMotion: boolean;
}

export interface PerformanceSettings {
	mode: 'auto' | 'high' | 'balanced' | 'low';
	maxParticles: number;
	enableBlur: boolean;
	enableShadows: boolean;
	targetFPS: number;
}

export interface ThemeProfile {
	id: string;
	name: string;
	wallpaperTheme: string;
	particles: ParticleSettings;
	ui: Partial<UISettings>;
	dominantColor?: string;
	createdAt: number;
}

export interface Settings {
	version: string;
	keyboard: {
		modifier: KeyboardModifier;
		shortcuts: Record<string, string>;
	};
	particles: ParticleSettings;
	wallpaper: WallpaperSettings;
	searchEngines: SearchEngine[];
	ui: UISettings;
	performance: PerformanceSettings;
	profiles: ThemeProfile[];
	activeProfile?: string;
}

const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
	{
		id: 'brave',
		name: 'Brave Search',
		icon: '🦁',
		url: 'https://search.brave.com/search?q=%s',
		placeholder: 'Search with Brave...',
		isDefault: true,
		isCustom: false
	},
	{
		id: 'duckduckgo',
		name: 'DuckDuckGo',
		icon: '🦆',
		url: 'https://duckduckgo.com/?q=%s',
		placeholder: 'Search with DuckDuckGo...',
		isDefault: false,
		isCustom: false
	},
	{
		id: 'google',
		name: 'Google',
		icon: '🔍',
		url: 'https://www.google.com/search?q=%s',
		placeholder: 'Search with Google...',
		isDefault: false,
		isCustom: false
	}
];

const DEFAULT_SETTINGS: Settings = {
	version: '1.0.0',
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
			toggleParticles: 'p'
		}
	},
	particles: {
		count: 75,
		speed: 0.5,
		connectionDistance: 150,
		mouseRepulsion: 100,
		opacity: 0.6,
		enabled: true
	},
	wallpaper: {
		transitionDuration: 1000,
		cycleDuration: 60000, // 1 minute
		currentTheme: 'default',
		autoTransition: true,
		preloadCount: 3
	},
	searchEngines: DEFAULT_SEARCH_ENGINES,
	ui: {
		autoHideTimeout: 30000, // 30 seconds
		showClock: false,
		clockFormat: '24h',
		reducedMotion: false
	},
	performance: {
		mode: 'auto',
		maxParticles: 150,
		enableBlur: true,
		enableShadows: true,
		targetFPS: 60
	},
	profiles: []
};

class SettingsStore {
	private store = writable<Settings>(DEFAULT_SETTINGS);
	private storageKey = 'particle-nexus-settings';

	subscribe = this.store.subscribe;

	async initialize(): Promise<void> {
		if (!browser) return;

		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				const parsed = JSON.parse(stored);
				// Migrate old settings if version mismatch
				const migrated = this.migrateSettings(parsed);
				this.store.set(migrated);
			} else {
				// First time setup - detect optimal performance settings
				const detectedSettings = this.detectPerformanceSettings();
				this.store.update((s) => ({
					...s,
					performance: { ...s.performance, ...detectedSettings }
				}));
			}
		} catch (error) {
			console.warn('Failed to load settings:', error);
			this.store.set(DEFAULT_SETTINGS);
		}
	}

	update(updater: (settings: Settings) => Settings): void {
		this.store.update((settings) => {
			const newSettings = updater(settings);
			this.saveToStorage(newSettings);
			return newSettings;
		});
	}

	// Keyboard modifier detection
	captureModifier(): Promise<KeyboardModifier> {
		return new Promise((resolve) => {
			const handler = (event: KeyboardEvent) => {
				event.preventDefault();
				const keys: string[] = [];
				const labels: string[] = [];

				if (event.ctrlKey || event.metaKey) {
					keys.push(event.ctrlKey ? 'ctrl' : 'meta');
					labels.push(event.ctrlKey ? 'Ctrl' : navigator.platform.includes('Mac') ? '⌘' : 'Win');
				}
				if (event.altKey) {
					keys.push('alt');
					labels.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt');
				}
				if (event.shiftKey) {
					keys.push('shift');
					labels.push('⇧');
				}

				if (keys.length > 0) {
					const modifier: KeyboardModifier = {
						keys,
						label: labels.join(' + '),
						code: keys.join('+')
					};

					document.removeEventListener('keydown', handler);
					resolve(modifier);
				}
			};

			document.addEventListener('keydown', handler);

			// Auto-resolve after 10 seconds with default
			setTimeout(() => {
				document.removeEventListener('keydown', handler);
				resolve(DEFAULT_SETTINGS.keyboard.modifier);
			}, 10000);
		});
	}

	// Search engine management
	addSearchEngine(engine: Omit<SearchEngine, 'id'>): void {
		this.update((settings) => ({
			...settings,
			searchEngines: [
				...settings.searchEngines,
				{
					...engine,
					id: `custom_${Date.now()}`,
					isCustom: true
				}
			]
		}));
	}

	updateSearchEngine(id: string, updates: Partial<SearchEngine>): void {
		this.update((settings) => ({
			...settings,
			searchEngines: settings.searchEngines.map((engine) =>
				engine.id === id ? { ...engine, ...updates } : engine
			)
		}));
	}

	removeSearchEngine(id: string): void {
		this.update((settings) => ({
			...settings,
			searchEngines: settings.searchEngines.filter((engine) => engine.id !== id)
		}));
	}

	reorderSearchEngines(newOrder: string[]): void {
		this.update((settings) => {
			const engineMap = new Map(settings.searchEngines.map((e) => [e.id, e]));
			const reordered = newOrder.map((id) => engineMap.get(id)).filter(Boolean) as SearchEngine[];
			return { ...settings, searchEngines: reordered };
		});
	}

	setDefaultSearchEngine(id: string): void {
		this.update((settings) => ({
			...settings,
			searchEngines: settings.searchEngines.map((engine) => ({
				...engine,
				isDefault: engine.id === id
			}))
		}));
	}

	// Theme profile management
	saveProfile(name: string, settings: Settings): void {
		const profile: ThemeProfile = {
			id: `profile_${Date.now()}`,
			name,
			wallpaperTheme: settings.wallpaper.currentTheme,
			particles: { ...settings.particles },
			ui: {
				showClock: settings.ui.showClock,
				clockFormat: settings.ui.clockFormat
			},
			createdAt: Date.now()
		};

		this.update((s) => ({
			...s,
			profiles: [...s.profiles, profile]
		}));
	}

	loadProfile(profileId: string): void {
		this.update((settings) => {
			const profile = settings.profiles.find((p) => p.id === profileId);
			if (!profile) return settings;

			return {
				...settings,
				wallpaper: { ...settings.wallpaper, currentTheme: profile.wallpaperTheme },
				particles: { ...profile.particles },
				ui: { ...settings.ui, ...profile.ui },
				activeProfile: profileId
			};
		});
	}

	deleteProfile(profileId: string): void {
		this.update((settings) => ({
			...settings,
			profiles: settings.profiles.filter((p) => p.id !== profileId),
			activeProfile: settings.activeProfile === profileId ? undefined : settings.activeProfile
		}));
	}

	// Import/Export functionality
	exportSettings(): string {
		let currentSettings: Settings;
		this.store.subscribe((s) => (currentSettings = s))();
		return JSON.stringify(currentSettings!, null, 2);
	}

	importSettings(jsonString: string): boolean {
		try {
			const imported = JSON.parse(jsonString);
			const migrated = this.migrateSettings(imported);
			this.store.set(migrated);
			this.saveToStorage(migrated);
			return true;
		} catch (error) {
			console.error('Failed to import settings:', error);
			return false;
		}
	}

	// Reset to defaults
	reset(): void {
		this.store.set({ ...DEFAULT_SETTINGS });
		this.saveToStorage(DEFAULT_SETTINGS);
	}

	private detectPerformanceSettings(): Partial<PerformanceSettings> {
		if (!browser) return {};

		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		const devicePixelRatio = window.devicePixelRatio || 1;
		const screenArea = window.innerWidth * window.innerHeight;

		// Detect GPU capabilities
		const hasWebGL = !!gl;
		const isHighDPI = devicePixelRatio > 1.5;
		const isLargeScreen = screenArea > 1920 * 1080;

		// Performance heuristics
		let mode: PerformanceSettings['mode'] = 'balanced';
		let maxParticles = 100;

		if (hasWebGL && !isHighDPI && !isLargeScreen) {
			mode = 'high';
			maxParticles = 150;
		} else if (!hasWebGL || (isHighDPI && isLargeScreen)) {
			mode = 'low';
			maxParticles = 50;
		}

		return {
			mode,
			maxParticles,
			enableBlur: hasWebGL,
			enableShadows: hasWebGL && !isHighDPI,
			targetFPS: isHighDPI ? 30 : 60
		};
	}

	private migrateSettings(settings: any): Settings {
		// Handle version migrations
		const migrated = { ...DEFAULT_SETTINGS, ...settings };

		// Ensure search engines have required fields
		migrated.searchEngines =
			migrated.searchEngines?.map((engine: any) => ({
				...engine,
				isCustom: engine.isCustom ?? false,
				placeholder: engine.placeholder ?? `Search with ${engine.name}...`
			})) || DEFAULT_SEARCH_ENGINES;

		// Ensure at least one default search engine
		if (!migrated.searchEngines.some((e: SearchEngine) => e.isDefault)) {
			migrated.searchEngines[0].isDefault = true;
		}

		migrated.version = DEFAULT_SETTINGS.version;
		return migrated;
	}

	private saveToStorage(settings: Settings): void {
		if (!browser) return;

		try {
			localStorage.setItem(this.storageKey, JSON.stringify(settings));
		} catch (error) {
			console.warn('Failed to save settings:', error);
		}
	}
}

export const settingsStore = new SettingsStore();
