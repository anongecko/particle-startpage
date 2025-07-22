import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

// --- Utility Functions ---
// A simple error handler to avoid undefined function errors.
const createErrorHandler = (context: string) => (error: unknown, details: object) => {
	console.error(`[${context}] Error:`, error, 'Details:', details);
};

// --- Your Original Feature-Rich Storage System ---

export interface StorageConfig {
	namespace: string;
	compress: boolean;
	encrypt: boolean;
	ttl: number; // Time to live in milliseconds
	maxSize: number; // Max storage size in bytes
	autoCleanup: boolean;
}

export interface StorageItem<T = any> {
	value: T;
	timestamp: number;
	ttl?: number;
	compressed?: boolean;
	encrypted?: boolean;
	size: number;
}

export interface StorageEvent<T = any> {
	key: string;
	oldValue: T | null;
	newValue: T | null;
	timestamp: number;
	source: 'local' | 'session' | 'memory';
}

/**
 * Memory storage implementation for SSR safety
 */
class MemoryStorage implements Storage {
	private store: Map<string, string> = new Map();
	get length(): number {
		return this.store.size;
	}
	clear(): void {
		this.store.clear();
	}
	getItem(key: string): string | null {
		return this.store.get(key) || null;
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] || null;
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
	[name: string]: any;
}

/**
 * Enhanced storage system with compression, encryption, and TTL
 */
export class EnhancedStorage {
	private config: StorageConfig;
	private storage: Storage;
	private memoryCache: Map<string, StorageItem> = new Map();
	private listeners: Map<string, Set<(event: StorageEvent) => void>> = new Map();
	private errorHandler = createErrorHandler('EnhancedStorage');

	constructor(storageType: 'local' | 'session' = 'local', config: Partial<StorageConfig> = {}) {
		this.config = {
			namespace: 'app',
			compress: false,
			encrypt: false,
			ttl: 0,
			maxSize: 5 * 1024 * 1024, // 5MB
			autoCleanup: true,
			...config
		};

		// Use MemoryStorage on server, real storage in browser
		this.storage = !browser
			? new MemoryStorage()
			: storageType === 'local'
				? window.localStorage
				: window.sessionStorage;
		this.initializeStorage();
	}

	private initializeStorage(): void {
		if (browser && this.config.autoCleanup) {
			this.cleanupExpiredItems();
		}
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
		try {
			const fullKey = this.getFullKey(key);
			let serialized = JSON.stringify(value);

			// Placeholder for compression/encryption logic
			if (this.config.compress) serialized = btoa(unescape(encodeURIComponent(serialized)));
			if (this.config.encrypt) serialized = btoa(serialized);

			const item: StorageItem<string> = {
				value: serialized,
				timestamp: Date.now(),
				ttl: ttl || this.config.ttl,
				compressed: this.config.compress,
				encrypted: this.config.encrypt,
				size: serialized.length
			};

			if (this.config.maxSize > 0 && item.size > this.config.maxSize) {
				throw new Error('Item exceeds max storage size');
			}

			this.storage.setItem(fullKey, JSON.stringify(item));
			this.memoryCache.set(fullKey, item);
			return true;
		} catch (error) {
			this.errorHandler(error, { key });
			return false;
		}
	}

	async get<T>(key: string, defaultValue: T | null = null): Promise<T | null> {
		try {
			const fullKey = this.getFullKey(key);
			let item = this.memoryCache.get(fullKey);

			if (!item) {
				const stored = this.storage.getItem(fullKey);
				if (!stored) return defaultValue;
				item = JSON.parse(stored) as StorageItem;
				this.memoryCache.set(fullKey, item);
			}

			if (item.ttl && item.ttl > 0 && Date.now() - item.timestamp > item.ttl) {
				await this.remove(key);
				return defaultValue;
			}

			let processedValue = item.value;
			if (item.encrypted) processedValue = atob(processedValue);
			if (item.compressed) processedValue = decodeURIComponent(escape(atob(processedValue)));

			return JSON.parse(processedValue) as T;
		} catch (error) {
			this.errorHandler(error, { key });
			// If there's a parsing error, the data might be corrupt, so remove it.
			await this.remove(key);
			return defaultValue;
		}
	}

	async remove(key: string): Promise<void> {
		const fullKey = this.getFullKey(key);
		this.storage.removeItem(fullKey);
		this.memoryCache.delete(fullKey);
	}

	private getFullKey(key: string): string {
		return `${this.config.namespace}:${key}`;
	}

	private cleanupExpiredItems(): void {
		for (let i = 0; i < this.storage.length; i++) {
			const key = this.storage.key(i);
			if (key && key.startsWith(this.config.namespace)) {
				this.get(key.substring(this.config.namespace.length + 1));
			}
		}
	}
}

export class StorageManager {
	private storages: Map<string, EnhancedStorage> = new Map();

	getStorage(
		name: string,
		type: 'local' | 'session' = 'local',
		config?: Partial<StorageConfig>
	): EnhancedStorage {
		const key = `${name}:${type}`;
		if (!this.storages.has(key)) {
			this.storages.set(key, new EnhancedStorage(type, { ...config, namespace: name }));
		}
		return this.storages.get(key)!;
	}
}

// --- NEW SVELTE STORE INTEGRATION (THE FIX) ---

export interface AppSettings {
	activeWallpaper: string;
	wallpaperPack: string;
	showParticles: boolean;
	showObjects: boolean;
	themeColor: string;
}

const defaultSettings: AppSettings = {
	activeWallpaper: '/wallpapers/Default/1.jpg',
	wallpaperPack: 'Default',
	showParticles: true,
	showObjects: true,
	themeColor: '#be95c4'
};

export const storageManager = new StorageManager();
const settingsStorage = storageManager.getStorage('app-main-settings', 'local');
const SETTINGS_KEY = 'user_preferences';

/**
 * Creates a Svelte-compatible store that is safe for Server-Side Rendering (SSR).
 */
function createAppSettingsStore() {
	const { subscribe, set, update } = writable<AppSettings>(defaultSettings);
	let isInitialized = false;

	return {
		subscribe,
		/**
		 * Initializes the store by loading data from EnhancedStorage.
		 * This should be called once from onMount in your root layout to prevent SSR issues.
		 */
		init: async () => {
			if (!browser || isInitialized) return;
			isInitialized = true;

			const storedSettings = await settingsStorage.get<AppSettings>(SETTINGS_KEY);
			if (storedSettings) {
				set({ ...defaultSettings, ...storedSettings });
			} else {
				await settingsStorage.set(SETTINGS_KEY, defaultSettings);
			}
		},
		set: (value: AppSettings) => {
			settingsStorage.set(SETTINGS_KEY, value);
			set(value);
		},
		update: (updater: (value: AppSettings) => AppSettings) => {
			update((currentValue) => {
				const newValue = updater(currentValue);
				settingsStorage.set(SETTINGS_KEY, newValue);
				return newValue;
			});
		}
	};
}

// This is the final, named export that the rest of your app will use.
export const settings = createAppSettingsStore();
