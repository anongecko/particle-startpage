import { browser } from '$app/environment';

/**
 * Performance-optimized debounce function with immediate execution option
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
	immediate: boolean = false
): T {
	let timeout: NodeJS.Timeout | null;
	let result: ReturnType<T>;

	const debounced = function (this: any, ...args: Parameters<T>) {
		const callNow = immediate && !timeout;

		const later = () => {
			timeout = null;
			if (!immediate) result = func.apply(this, args);
		};

		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(later, wait);

		if (callNow) result = func.apply(this, args);
		return result;
	} as T;

	// Add cancel method
	(debounced as any).cancel = () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	};

	return debounced;
}

/**
 * Performance-optimized throttle function with leading and trailing options
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
	options: { leading?: boolean; trailing?: boolean } = {}
): T {
	let timeout: NodeJS.Timeout | null;
	let previous = 0;
	let result: ReturnType<T>;

	const { leading = true, trailing = true } = options;

	const throttled = function (this: any, ...args: Parameters<T>) {
		const now = Date.now();

		if (!previous && !leading) previous = now;

		const remaining = wait - (now - previous);

		if (remaining <= 0 || remaining > wait) {
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			previous = now;
			result = func.apply(this, args);
		} else if (!timeout && trailing) {
			timeout = setTimeout(() => {
				previous = !leading ? 0 : Date.now();
				timeout = null;
				result = func.apply(this, args);
			}, remaining);
		}

		return result;
	} as T;

	// Add cancel method
	(throttled as any).cancel = () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
		previous = 0;
	};

	return throttled;
}

/**
 * RAF-based throttle for smooth animations
 */
export function rafThrottle<T extends (...args: any[]) => any>(func: T): T {
	let rafId: number | null = null;
	let lastArgs: Parameters<T>;

	const throttled = function (this: any, ...args: Parameters<T>) {
		lastArgs = args;

		if (rafId === null) {
			rafId = requestAnimationFrame(() => {
				func.apply(this, lastArgs);
				rafId = null;
			});
		}
	} as T;

	(throttled as any).cancel = () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	};

	return throttled;
}

/**
 * Memoization with TTL and size limits
 */
export function memoize<T extends (...args: any[]) => any>(
	func: T,
	options: {
		maxSize?: number;
		ttl?: number;
		keyFn?: (...args: Parameters<T>) => string;
	} = {}
): T {
	const { maxSize = 100, ttl = Infinity, keyFn = (...args) => JSON.stringify(args) } = options;
	const cache = new Map<string, { value: ReturnType<T>; timestamp: number }>();

	const memoized = function (this: any, ...args: Parameters<T>): ReturnType<T> {
		const key = keyFn(...args);
		const now = Date.now();
		const cached = cache.get(key);

		// Check if cached value is still valid
		if (cached && now - cached.timestamp < ttl) {
			return cached.value;
		}

		// Compute new value
		const result = func.apply(this, args);

		// Manage cache size
		if (cache.size >= maxSize) {
			// Remove oldest entries (simple FIFO)
			const firstKey = cache.keys().next().value;
			cache.delete(firstKey);
		}

		cache.set(key, { value: result, timestamp: now });
		return result;
	} as T;

	(memoized as any).clear = () => cache.clear();
	(memoized as any).delete = (key: string) => cache.delete(key);
	(memoized as any).size = () => cache.size;

	return memoized;
}

/**
 * Promise-based sleep function
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
	fn: () => Promise<T>,
	options: {
		maxAttempts?: number;
		delay?: number;
		backoff?: number;
		onRetry?: (attempt: number, error: Error) => void;
	} = {}
): Promise<T> {
	const { maxAttempts = 3, delay = 1000, backoff = 2, onRetry } = options;

	let lastError: Error;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			if (attempt === maxAttempts) {
				throw lastError;
			}

			if (onRetry) {
				onRetry(attempt, lastError);
			}

			const waitTime = delay * Math.pow(backoff, attempt - 1);
			await sleep(waitTime);
		}
	}

	throw lastError!;
}

/**
 * Type-safe event emitter
 */
export class TypedEventEmitter<T extends Record<string, any>> {
	private listeners = new Map<keyof T, Set<(...args: any[]) => void>>();

	on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(listener);
	}

	off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void {
		this.listeners.get(event)?.delete(listener);
	}

	emit<K extends keyof T>(event: K, ...args: T[K]): void {
		this.listeners.get(event)?.forEach((listener) => {
			try {
				listener(...args);
			} catch (error) {
				console.error(`Error in event listener for ${String(event)}:`, error);
			}
		});
	}

	once<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void {
		const onceListener = (...args: T[K]) => {
			this.off(event, onceListener);
			listener(...args);
		};
		this.on(event, onceListener);
	}

	removeAllListeners<K extends keyof T>(event?: K): void {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
	}
}

/**
 * URL validation and normalization
 */
export function isValidUrl(url: string): boolean {
	try {
		const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
		return ['http:', 'https:'].includes(urlObj.protocol);
	} catch {
		return false;
	}
}

export function normalizeUrl(url: string): string {
	try {
		if (!url.startsWith('http')) {
			url = `https://${url}`;
		}
		const urlObj = new URL(url);
		return urlObj.href;
	} catch {
		throw new Error('Invalid URL');
	}
}

/**
 * Deep object manipulation utilities
 */
export function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== 'object') return obj;
	if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
	if (obj instanceof Array) return obj.map((item) => deepClone(item)) as unknown as T;
	if (typeof obj === 'object') {
		const cloned = {} as T;
		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				cloned[key] = deepClone(obj[key]);
			}
		}
		return cloned;
	}
	return obj;
}

export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
	const result = { ...target };

	for (const key in source) {
		if (source.hasOwnProperty(key)) {
			const sourceValue = source[key];
			const targetValue = result[key];

			if (
				sourceValue &&
				typeof sourceValue === 'object' &&
				!Array.isArray(sourceValue) &&
				targetValue &&
				typeof targetValue === 'object' &&
				!Array.isArray(targetValue)
			) {
				result[key] = deepMerge(targetValue, sourceValue);
			} else {
				result[key] = sourceValue as T[Extract<keyof T, string>];
			}
		}
	}

	return result;
}

/**
 * Array utilities
 */
export function chunk<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

export function shuffle<T>(array: T[]): T[] {
	const result = [...array];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

export function unique<T>(array: T[], keyFn?: (item: T) => any): T[] {
	if (!keyFn) return [...new Set(array)];

	const seen = new Set();
	return array.filter((item) => {
		const key = keyFn(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function groupBy<T, K extends string | number>(
	array: T[],
	keyFn: (item: T) => K
): Record<K, T[]> {
	return array.reduce(
		(groups, item) => {
			const key = keyFn(item);
			if (!groups[key]) groups[key] = [];
			groups[key].push(item);
			return groups;
		},
		{} as Record<K, T[]>
	);
}

/**
 * Number and math utilities
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, factor: number): number {
	return start + (end - start) * factor;
}

export function mapRange(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number {
	return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

export function randomFloat(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * String utilities
 */
export function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function kebabCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[\s_]+/g, '-')
		.toLowerCase();
}

export function camelCase(str: string): string {
	return str
		.replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
		.replace(/^[A-Z]/, (char) => char.toLowerCase());
}

export function truncate(str: string, length: number, suffix: string = '...'): string {
	if (str.length <= length) return str;
	return str.slice(0, length - suffix.length) + suffix;
}

export function sanitizeHtml(str: string): string {
	const div = document.createElement('div');
	div.textContent = str;
	return div.innerHTML;
}

/**
 * Local storage utilities with error handling
 */
export function getStorageItem<T>(key: string, defaultValue: T): T {
	if (!browser) return defaultValue;

	try {
		const item = localStorage.getItem(key);
		return item ? JSON.parse(item) : defaultValue;
	} catch (error) {
		console.warn(`Failed to get storage item "${key}":`, error);
		return defaultValue;
	}
}

export function setStorageItem<T>(key: string, value: T): boolean {
	if (!browser) return false;

	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch (error) {
		console.warn(`Failed to set storage item "${key}":`, error);
		return false;
	}
}

export function removeStorageItem(key: string): boolean {
	if (!browser) return false;

	try {
		localStorage.removeItem(key);
		return true;
	} catch (error) {
		console.warn(`Failed to remove storage item "${key}":`, error);
		return false;
	}
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
	private marks = new Map<string, number>();
	private measures = new Map<string, number[]>();

	mark(name: string): void {
		this.marks.set(name, performance.now());
	}

	measure(name: string, startMark?: string): number {
		const endTime = performance.now();
		const startTime = startMark ? this.marks.get(startMark) || 0 : 0;
		const duration = endTime - startTime;

		if (!this.measures.has(name)) {
			this.measures.set(name, []);
		}
		this.measures.get(name)!.push(duration);

		return duration;
	}

	getAverage(name: string): number {
		const measurements = this.measures.get(name) || [];
		if (measurements.length === 0) return 0;
		return measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
	}

	clear(name?: string): void {
		if (name) {
			this.marks.delete(name);
			this.measures.delete(name);
		} else {
			this.marks.clear();
			this.measures.clear();
		}
	}
}

/**
 * File handling utilities
 */
export function formatFileSize(bytes: number): string {
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	if (bytes === 0) return '0 B';

	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const size = bytes / Math.pow(1024, i);

	return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
	return filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
}

export function isImageFile(filename: string): boolean {
	const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
	return imageExtensions.includes(getFileExtension(filename));
}

/**
 * Color utilities
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			}
		: null;
}

export function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (c: number) =>
		Math.round(clamp(c, 0, 255))
			.toString(16)
			.padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255;
	g /= 255;
	b /= 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			case b:
				h = (r - g) / d + 4;
				break;
		}
		h /= 6;
	}

	return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Device and environment detection
 */
export function isMobile(): boolean {
	if (!browser) return false;
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isTouch(): boolean {
	if (!browser) return false;
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function getDevicePixelRatio(): number {
	if (!browser) return 1;
	return window.devicePixelRatio || 1;
}

export function getViewportSize(): { width: number; height: number } {
	if (!browser) return { width: 1920, height: 1080 };
	return {
		width: window.innerWidth,
		height: window.innerHeight
	};
}

/**
 * Animation utilities
 */
export function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutQuart(t: number): number {
	return 1 - Math.pow(1 - t, 4);
}

export function easeInOutQuart(t: number): number {
	return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

/**
 * Error handling utilities
 */
export function createErrorHandler(context: string) {
	return (error: Error, additionalInfo?: any) => {
		console.error(`[${context}] Error:`, error);
		if (additionalInfo) {
			console.error(`[${context}] Additional info:`, additionalInfo);
		}

		// Emit error event for global error handling
		if (browser) {
			window.dispatchEvent(
				new CustomEvent('app-error', {
					detail: { context, error, additionalInfo }
				})
			);
		}
	};
}

/**
 * Global performance monitor instance
 */
export const perfMonitor = new PerformanceMonitor();

/**
 * Common type guards
 */
export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
	return typeof value === 'number' && !isNaN(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray<T>(value: unknown): value is T[] {
	return Array.isArray(value);
}

export function isFunction(value: unknown): value is Function {
	return typeof value === 'function';
}

export function isDefined<T>(value: T | undefined | null): value is T {
	return value !== undefined && value !== null;
}
