import { browser } from '$app/environment';
import { createErrorHandler } from './utils';

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

export interface StorageStats {
	totalSize: number;
	itemCount: number;
	oldestItem: number;
	newestItem: number;
	compressionRatio: number;
	hitRate: number;
}

export interface StorageEvent<T = any> {
	key: string;
	oldValue: T | null;
	newValue: T | null;
	timestamp: number;
	source: 'local' | 'session' | 'memory';
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
	private stats: StorageStats = {
		totalSize: 0,
		itemCount: 0,
		oldestItem: Date.now(),
		newestItem: Date.now(),
		compressionRatio: 1,
		hitRate: 0
	};
	private accessCount = 0;
	private hitCount = 0;

	constructor(storageType: 'local' | 'session' = 'local', config: Partial<StorageConfig> = {}) {
		this.config = {
			namespace: 'app',
			compress: false,
			encrypt: false,
			ttl: 0, // No TTL by default
			maxSize: 5 * 1024 * 1024, // 5MB
			autoCleanup: true,
			...config
		};

		if (!browser) {
			// Use memory storage for SSR
			this.storage = new MemoryStorage();
		} else {
			this.storage = storageType === 'local' ? localStorage : sessionStorage;
		}

		this.initializeStorage();
	}

	/**
	 * Initialize storage and cleanup expired items
	 */
	private initializeStorage(): void {
		if (this.config.autoCleanup) {
			this.cleanupExpiredItems();
		}
		this.updateStats();
	}

	/**
	 * Set item with optional TTL
	 */
	async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
		try {
			const fullKey = this.getFullKey(key);
			const oldValue = await this.get<T>(key);

			let processedValue = value;
			let compressed = false;
			let encrypted = false;

			// Serialize value
			let serialized = JSON.stringify(processedValue);

			// Compress if enabled
			if (this.config.compress) {
				serialized = await this.compress(serialized);
				compressed = true;
			}

			// Encrypt if enabled
			if (this.config.encrypt) {
				serialized = await this.encrypt(serialized);
				encrypted = true;
			}

			const item: StorageItem<T> = {
				value: processedValue,
				timestamp: Date.now(),
				ttl: ttl || this.config.ttl,
				compressed,
				encrypted,
				size: serialized.length
			};

			// Check storage size limit
			if (this.config.maxSize > 0 && serialized.length > this.config.maxSize) {
				throw new Error('Item too large for storage');
			}

			// Store in main storage
			this.storage.setItem(fullKey, JSON.stringify(item));

			// Update memory cache
			this.memoryCache.set(fullKey, item);

			// Update stats
			this.updateStats();

			// Emit change event
			this.emitStorageEvent(key, oldValue, value);

			return true;
		} catch (error) {
			this.errorHandler(error, { key, value });
			return false;
		}
	}

	/**
	 * Get item with automatic expiration check
	 */
	async get<T>(key: string, defaultValue?: T): Promise<T | null> {
		try {
			this.accessCount++;
			const fullKey = this.getFullKey(key);

			// Check memory cache first
			let item = this.memoryCache.get(fullKey);

			if (!item) {
				// Load from storage
				const stored = this.storage.getItem(fullKey);
				if (!stored) {
					return defaultValue ?? null;
				}

				item = JSON.parse(stored);
				this.memoryCache.set(fullKey, item);
			} else {
				this.hitCount++;
			}

			// Check TTL
			if (item.ttl && item.ttl > 0) {
				const isExpired = Date.now() - item.timestamp > item.ttl;
				if (isExpired) {
					await this.remove(key);
					return defaultValue ?? null;
				}
			}

			// Process value (decrypt, decompress)
			let processedValue = item.value;

			if (item.encrypted) {
				processedValue = await this.decrypt(processedValue);
			}

			if (item.compressed) {
				processedValue = await this.decompress(processedValue);
			}

			return processedValue;
		} catch (error) {
			this.errorHandler(error, { key });
			return defaultValue ?? null;
		}
	}

	/**
	 * Remove item
	 */
	async remove(key: string): Promise<boolean> {
		try {
			const fullKey = this.getFullKey(key);
			const oldValue = await this.get(key);

			this.storage.removeItem(fullKey);
			this.memoryCache.delete(fullKey);

			this.updateStats();
			this.emitStorageEvent(key, oldValue, null);

			return true;
		} catch (error) {
			this.errorHandler(error, { key });
			return false;
		}
	}

	/**
	 * Check if key exists
	 */
	async has(key: string): Promise<boolean> {
		const value = await this.get(key);
		return value !== null;
	}

	/**
	 * Get all keys
	 */
	async keys(): Promise<string[]> {
		const keys: string[] = [];
		const prefix = this.getFullKey('');

		for (let i = 0; i < this.storage.length; i++) {
			const key = this.storage.key(i);
			if (key && key.startsWith(prefix)) {
				keys.push(key.substring(prefix.length));
			}
		}

		return keys;
	}

	/**
	 * Clear all items
	 */
	async clear(): Promise<void> {
		const keys = await this.keys();

		for (const key of keys) {
			await this.remove(key);
		}

		this.memoryCache.clear();
		this.updateStats();
	}

	/**
	 * Get storage statistics
	 */
	getStats(): StorageStats {
		this.stats.hitRate = this.accessCount > 0 ? this.hitCount / this.accessCount : 0;
		return { ...this.stats };
	}

	/**
	 * Listen to storage changes
	 */
	onStorageChange(key: string, callback: (event: StorageEvent) => void): () => void {
		if (!this.listeners.has(key)) {
			this.listeners.set(key, new Set());
		}

		this.listeners.get(key)!.add(callback);

		// Return unsubscribe function
		return () => {
			this.listeners.get(key)?.delete(callback);
		};
	}

	/**
	 * Batch operations
	 */
	async batch(
		operations: Array<{
			operation: 'set' | 'get' | 'remove';
			key: string;
			value?: any;
			ttl?: number;
		}>
	): Promise<any[]> {
		const results: any[] = [];

		for (const op of operations) {
			switch (op.operation) {
				case 'set':
					results.push(await this.set(op.key, op.value, op.ttl));
					break;
				case 'get':
					results.push(await this.get(op.key));
					break;
				case 'remove':
					results.push(await this.remove(op.key));
					break;
			}
		}

		return results;
	}

	/**
	 * Export all data
	 */
	async export(): Promise<Record<string, any>> {
		const keys = await this.keys();
		const data: Record<string, any> = {};

		for (const key of keys) {
			data[key] = await this.get(key);
		}

		return data;
	}

	/**
	 * Import data
	 */
	async import(data: Record<string, any>, overwrite: boolean = false): Promise<void> {
		for (const [key, value] of Object.entries(data)) {
			if (overwrite || !(await this.has(key))) {
				await this.set(key, value);
			}
		}
	}

	/**
	 * Cleanup expired items
	 */
	private cleanupExpiredItems(): void {
		const now = Date.now();
		const keysToRemove: string[] = [];

		for (let i = 0; i < this.storage.length; i++) {
			const key = this.storage.key(i);
			if (!key || !key.startsWith(this.getFullKey(''))) continue;

			try {
				const item: StorageItem = JSON.parse(this.storage.getItem(key)!);
				if (item.ttl && item.ttl > 0 && now - item.timestamp > item.ttl) {
					keysToRemove.push(key);
				}
			} catch (error) {
				// Remove corrupted items
				keysToRemove.push(key);
			}
		}

		keysToRemove.forEach((key) => {
			this.storage.removeItem(key);
			this.memoryCache.delete(key);
		});
	}

	/**
	 * Update statistics
	 */
	private updateStats(): void {
		let totalSize = 0;
		let itemCount = 0;
		let oldestItem = Date.now();
		let newestItem = 0;
		let totalOriginalSize = 0;
		let totalCompressedSize = 0;

		for (const [key, item] of this.memoryCache) {
			if (key.startsWith(this.getFullKey(''))) {
				itemCount++;
				totalSize += item.size;

				if (item.timestamp < oldestItem) {
					oldestItem = item.timestamp;
				}
				if (item.timestamp > newestItem) {
					newestItem = item.timestamp;
				}

				if (item.compressed) {
					totalCompressedSize += item.size;
					// Estimate original size (rough approximation)
					totalOriginalSize += item.size * 1.5;
				}
			}
		}

		this.stats = {
			totalSize,
			itemCount,
			oldestItem,
			newestItem,
			compressionRatio: totalOriginalSize > 0 ? totalOriginalSize / totalCompressedSize : 1,
			hitRate: this.stats.hitRate
		};
	}

	/**
	 * Emit storage change event
	 */
	private emitStorageEvent<T>(key: string, oldValue: T | null, newValue: T | null): void {
		const event: StorageEvent<T> = {
			key,
			oldValue,
			newValue,
			timestamp: Date.now(),
			source: this.storage === localStorage ? 'local' : 'session'
		};

		this.listeners.get(key)?.forEach((callback) => {
			try {
				callback(event);
			} catch (error) {
				this.errorHandler(error, { key, event });
			}
		});
	}

	/**
	 * Get full key with namespace
	 */
	private getFullKey(key: string): string {
		return `${this.config.namespace}:${key}`;
	}

	/**
	 * Compress data (simple implementation)
	 */
	private async compress(data: string): Promise<string> {
		// Simple compression using base64 encoding
		// In production, use a proper compression library
		return btoa(data);
	}

	/**
	 * Decompress data
	 */
	private async decompress(data: string): Promise<string> {
		return atob(data);
	}

	/**
	 * Encrypt data (simple implementation)
	 */
	private async encrypt(data: string): Promise<string> {
		// Simple encryption using base64 encoding
		// In production, use proper encryption
		return btoa(data);
	}

	/**
	 * Decrypt data
	 */
	private async decrypt(data: string): Promise<string> {
		return atob(data);
	}
}

/**
 * Memory storage implementation for SSR
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
		const keys = Array.from(this.store.keys());
		return keys[index] || null;
	}

	removeItem(key: string): void {
		this.store.delete(key);
	}

	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
}

/**
 * Storage manager for different storage types
 */
export class StorageManager {
	private storages: Map<string, EnhancedStorage> = new Map();

	/**
	 * Get or create storage instance
	 */
	getStorage(
		name: string,
		type: 'local' | 'session' = 'local',
		config?: Partial<StorageConfig>
	): EnhancedStorage {
		const key = `${name}:${type}`;

		if (!this.storages.has(key)) {
			this.storages.set(
				key,
				new EnhancedStorage(type, {
					...config,
					namespace: name
				})
			);
		}

		return this.storages.get(key)!;
	}

	/**
	 * Get all storage instances
	 */
	getAllStorages(): EnhancedStorage[] {
		return Array.from(this.storages.values());
	}

	/**
	 * Clear all storages
	 */
	async clearAll(): Promise<void> {
		const promises = Array.from(this.storages.values()).map((storage) => storage.clear());
		await Promise.all(promises);
	}

	/**
	 * Get combined statistics
	 */
	getCombinedStats(): StorageStats {
		const allStats = Array.from(this.storages.values()).map((storage) => storage.getStats());

		return allStats.reduce(
			(combined, stats) => ({
				totalSize: combined.totalSize + stats.totalSize,
				itemCount: combined.itemCount + stats.itemCount,
				oldestItem: Math.min(combined.oldestItem, stats.oldestItem),
				newestItem: Math.max(combined.newestItem, stats.newestItem),
				compressionRatio: (combined.compressionRatio + stats.compressionRatio) / 2,
				hitRate: (combined.hitRate + stats.hitRate) / 2
			}),
			{
				totalSize: 0,
				itemCount: 0,
				oldestItem: Date.now(),
				newestItem: 0,
				compressionRatio: 1,
				hitRate: 0
			}
		);
	}
}

/**
 * Reactive storage wrapper
 */
export class ReactiveStorage<T> {
	private storage: EnhancedStorage;
	private key: string;
	private listeners: Set<(value: T | null) => void> = new Set();
	private currentValue: T | null = null;

	constructor(storage: EnhancedStorage, key: string, defaultValue?: T) {
		this.storage = storage;
		this.key = key;
		this.currentValue = defaultValue ?? null;

		// Load initial value
		this.loadValue();

		// Listen to storage changes
		this.storage.onStorageChange(key, (event) => {
			this.currentValue = event.newValue;
			this.notifyListeners();
		});
	}

	/**
	 * Load value from storage
	 */
	private async loadValue(): Promise<void> {
		this.currentValue = await this.storage.get<T>(this.key);
		this.notifyListeners();
	}

	/**
	 * Get current value
	 */
	get value(): T | null {
		return this.currentValue;
	}

	/**
	 * Set new value
	 */
	async setValue(value: T, ttl?: number): Promise<void> {
		await this.storage.set(this.key, value, ttl);
		this.currentValue = value;
		this.notifyListeners();
	}

	/**
	 * Subscribe to value changes
	 */
	subscribe(callback: (value: T | null) => void): () => void {
		this.listeners.add(callback);
		callback(this.currentValue); // Emit current value

		return () => {
			this.listeners.delete(callback);
		};
	}

	/**
	 * Notify all listeners
	 */
	private notifyListeners(): void {
		this.listeners.forEach((callback) => {
			try {
				callback(this.currentValue);
			} catch (error) {
				console.error('Error in reactive storage listener:', error);
			}
		});
	}
}

/**
 * Global storage manager instance
 */
export const storageManager = new StorageManager();

/**
 * Default storage instances
 */
export const localStorage = storageManager.getStorage('app', 'local', {
	compress: false,
	autoCleanup: true,
	ttl: 0
});

export const sessionStorage = storageManager.getStorage('app', 'session', {
	compress: false,
	autoCleanup: true,
	ttl: 3600000 // 1 hour
});

export const cacheStorage = storageManager.getStorage('cache', 'local', {
	compress: true,
	autoCleanup: true,
	ttl: 300000, // 5 minutes
	maxSize: 10 * 1024 * 1024 // 10MB
});

/**
 * Storage utilities
 */
export const StorageUtils = {
	/**
	 * Create reactive storage
	 */
	reactive<T>(
		key: string,
		defaultValue?: T,
		storageType: 'local' | 'session' = 'local'
	): ReactiveStorage<T> {
		const storage = storageType === 'local' ? localStorage : sessionStorage;
		return new ReactiveStorage(storage, key, defaultValue);
	},

	/**
	 * Migrate data between storage types
	 */
	async migrate(
		fromStorage: EnhancedStorage,
		toStorage: EnhancedStorage,
		keys?: string[]
	): Promise<void> {
		const keysToMigrate = keys || (await fromStorage.keys());

		for (const key of keysToMigrate) {
			const value = await fromStorage.get(key);
			if (value !== null) {
				await toStorage.set(key, value);
			}
		}
	},

	/**
	 * Sync storage across tabs
	 */
	syncAcrossTabs(storage: EnhancedStorage): void {
		if (!browser) return;

		window.addEventListener('storage', (event) => {
			if (event.key && event.newValue) {
				// Handle storage change from other tabs
				storage.onStorageChange(event.key, {
					key: event.key,
					oldValue: event.oldValue ? JSON.parse(event.oldValue) : null,
					newValue: event.newValue ? JSON.parse(event.newValue) : null,
					timestamp: Date.now(),
					source: 'local'
				});
			}
		});
	},

	/**
	 * Create storage backup
	 */
	async createBackup(storage: EnhancedStorage): Promise<string> {
		const data = await storage.export();
		return JSON.stringify({
			version: '1.0',
			timestamp: Date.now(),
			data
		});
	},

	/**
	 * Restore from backup
	 */
	async restoreBackup(storage: EnhancedStorage, backup: string): Promise<void> {
		const parsed = JSON.parse(backup);
		await storage.import(parsed.data, true);
	}
};
