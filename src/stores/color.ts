import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import chroma from 'chroma-js';

export interface ColorPalette {
	dominant: string;
	vibrant: string;
	muted: string;
	light: string;
	dark: string;
	accent: string;
	complementary: string;
	triadic: [string, string];
}

export interface ColorState {
	current: string;
	palette: ColorPalette;
	isExtracting: boolean;
	lastExtracted: string | null;
	cache: Map<string, ColorPalette>;
	extractionTime: number;
}

export interface ColorExtractionOptions {
	maxSize: number;
	sampleRate: number;
	minSaturation: number;
	useOffscreen: boolean;
	quality: 'fast' | 'balanced' | 'high';
}

const DEFAULT_PALETTE: ColorPalette = {
	dominant: '#4a90e2',
	vibrant: '#5ba3f5',
	muted: '#7a9bc1',
	light: '#a8c8f0',
	dark: '#2c5aa0',
	accent: '#ff6b6b',
	complementary: '#e2994a',
	triadic: ['#90e24a', '#e24a90']
};

const DEFAULT_STATE: ColorState = {
	current: DEFAULT_PALETTE.dominant,
	palette: DEFAULT_PALETTE,
	isExtracting: false,
	lastExtracted: null,
	cache: new Map(),
	extractionTime: 0
};

const DEFAULT_OPTIONS: ColorExtractionOptions = {
	maxSize: 64,
	sampleRate: 4,
	minSaturation: 0.2,
	useOffscreen: typeof OffscreenCanvas !== 'undefined',
	quality: 'balanced'
};

class ColorStore {
	private store = writable<ColorState>(DEFAULT_STATE);
	private cacheKey = 'particle-nexus-color-cache';
	private maxCacheSize = 100;
	private extractionOptions: ColorExtractionOptions = DEFAULT_OPTIONS;

	subscribe = this.store.subscribe;

	async initialize(): Promise<void> {
		if (!browser) return;

		try {
			const cached = localStorage.getItem(this.cacheKey);
			if (cached) {
				const parsedCache = JSON.parse(cached);
				this.store.update((state) => ({
					...state,
					cache: new Map(Object.entries(parsedCache))
				}));
			}

			// Detect optimal extraction settings based on device
			this.detectOptimalSettings();
		} catch (error) {
			console.warn('Failed to load color cache:', error);
		}
	}

	setExtractionQuality(quality: ColorExtractionOptions['quality']): void {
		const qualitySettings = {
			fast: { maxSize: 32, sampleRate: 8, minSaturation: 0.1 },
			balanced: { maxSize: 64, sampleRate: 4, minSaturation: 0.2 },
			high: { maxSize: 128, sampleRate: 2, minSaturation: 0.3 }
		};

		this.extractionOptions = {
			...this.extractionOptions,
			...qualitySettings[quality],
			quality
		};
	}

	setDominantColor(color: string): void {
		const palette = this.generateAdvancedPalette(color);
		this.store.update((state) => ({
			...state,
			current: color,
			palette,
			lastExtracted: color
		}));
	}

	async extractFromImage(
		imagePath: string,
		options?: Partial<ColorExtractionOptions>
	): Promise<string> {
		if (!browser) return DEFAULT_PALETTE.dominant;

		const extractionOptions = { ...this.extractionOptions, ...options };

		// Check cache first
		const cacheKey = `${imagePath}_${extractionOptions.quality}`;
		const state = this.getCurrentState();
		if (state.cache.has(cacheKey)) {
			const cachedPalette = state.cache.get(cacheKey)!;
			this.store.update((s) => ({
				...s,
				current: cachedPalette.dominant,
				palette: cachedPalette,
				lastExtracted: imagePath
			}));
			return cachedPalette.dominant;
		}

		// Start extraction with timing
		const startTime = performance.now();
		this.store.update((state) => ({ ...state, isExtracting: true }));

		try {
			const palette = await this.performAdvancedExtraction(imagePath, extractionOptions);
			const extractionTime = performance.now() - startTime;

			// Update cache
			this.updateCache(cacheKey, palette);

			// Update state
			this.store.update((state) => ({
				...state,
				current: palette.dominant,
				palette,
				isExtracting: false,
				lastExtracted: imagePath,
				extractionTime
			}));

			return palette.dominant;
		} catch (error) {
			console.warn('Color extraction failed:', error);

			// Intelligent fallback based on image name or URL
			const fallbackColor = this.generateFallbackColor(imagePath);
			const fallbackPalette = this.generateAdvancedPalette(fallbackColor);

			this.store.update((state) => ({
				...state,
				isExtracting: false,
				current: fallbackColor,
				palette: fallbackPalette,
				extractionTime: performance.now() - startTime
			}));

			return fallbackColor;
		}
	}

	private async performAdvancedExtraction(
		imagePath: string,
		options: ColorExtractionOptions
	): Promise<ColorPalette> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';

			const timeoutId = setTimeout(() => {
				reject(new Error('Image loading timeout'));
			}, 10000);

			img.onload = () => {
				clearTimeout(timeoutId);
				try {
					const palette = options.useOffscreen
						? this.extractWithOffscreenCanvas(img, options)
						: this.extractWithCanvas(img, options);
					resolve(palette);
				} catch (error) {
					reject(error);
				}
			};

			img.onerror = () => {
				clearTimeout(timeoutId);
				reject(new Error('Failed to load image'));
			};

			img.src = imagePath;
		});
	}

	private extractWithOffscreenCanvas(
		img: HTMLImageElement,
		options: ColorExtractionOptions
	): ColorPalette {
		const { maxSize } = options;
		const scale = Math.min(maxSize / img.width, maxSize / img.height);
		const width = Math.floor(img.width * scale);
		const height = Math.floor(img.height * scale);

		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext('2d')!;

		ctx.drawImage(img, 0, 0, width, height);
		const imageData = ctx.getImageData(0, 0, width, height);

		return this.analyzeImageDataAdvanced(imageData, options);
	}

	private extractWithCanvas(img: HTMLImageElement, options: ColorExtractionOptions): ColorPalette {
		const { maxSize } = options;
		const scale = Math.min(maxSize / img.width, maxSize / img.height);
		const width = Math.floor(img.width * scale);
		const height = Math.floor(img.height * scale);

		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

		canvas.width = width;
		canvas.height = height;

		ctx.drawImage(img, 0, 0, width, height);
		const imageData = ctx.getImageData(0, 0, width, height);

		// Cleanup
		canvas.width = 1;
		canvas.height = 1;

		return this.analyzeImageDataAdvanced(imageData, options);
	}

	private analyzeImageDataAdvanced(
		imageData: ImageData,
		options: ColorExtractionOptions
	): ColorPalette {
		const { sampleRate, minSaturation } = options;
		const data = imageData.data;
		const colorData: Array<{ color: chroma.Color; count: number; lab: [number, number, number] }> =
			[];
		const colorMap = new Map<string, number>();

		// Advanced sampling with LAB color space for better perceptual accuracy
		for (let i = 0; i < data.length; i += sampleRate * 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			const a = data[i + 3];

			// Enhanced filtering
			if (a < 128) continue;
			if (this.isGrayscale(r, g, b) && options.quality !== 'fast') continue;

			try {
				const color = chroma.rgb(r, g, b);
				const [l, a_val, b_val] = color.lab();

				// Skip very dark or very light colors
				if (l < 15 || l > 90) continue;

				const saturation = color.get('hsl.s');
				if (saturation < minSaturation && options.quality === 'high') continue;

				const hex = color.hex();
				const count = colorMap.get(hex) || 0;
				colorMap.set(hex, count + 1);

				if (count === 0) {
					colorData.push({ color, count: 1, lab: [l, a_val, b_val] });
				} else {
					const existing = colorData.find((c) => c.color.hex() === hex);
					if (existing) existing.count++;
				}
			} catch (e) {
				continue;
			}
		}

		if (colorData.length === 0) {
			return DEFAULT_PALETTE;
		}

		// Advanced color clustering using LAB distance
		const clusters = this.clusterColors(colorData, Math.min(8, colorData.length));

		// Find dominant color (largest cluster)
		const dominantCluster = clusters.sort((a, b) => b.totalCount - a.totalCount)[0];
		const dominant = dominantCluster.centroid;

		// Find vibrant color (highest chroma in LAB space)
		const vibrantColor =
			colorData
				.filter((c) => c.color.get('hcl.c') > 30)
				.sort((a, b) => b.color.get('hcl.c') - a.color.get('hcl.c'))[0]?.color || dominant;

		return this.generateAdvancedPalette(dominant.hex(), vibrantColor.hex());
	}

	private clusterColors(
		colorData: Array<{ color: chroma.Color; count: number; lab: [number, number, number] }>,
		k: number
	) {
		// Simple k-means clustering in LAB space
		const clusters: Array<{
			centroid: chroma.Color;
			colors: typeof colorData;
			totalCount: number;
		}> = [];

		// Initialize centroids
		const sortedByCount = [...colorData].sort((a, b) => b.count - a.count);
		for (let i = 0; i < k && i < sortedByCount.length; i++) {
			clusters.push({
				centroid: sortedByCount[i].color,
				colors: [],
				totalCount: 0
			});
		}

		// Assign colors to nearest centroid (simplified single iteration)
		for (const colorInfo of colorData) {
			let minDistance = Infinity;
			let closestCluster = 0;

			for (let i = 0; i < clusters.length; i++) {
				const distance = chroma.deltaE(colorInfo.color, clusters[i].centroid);
				if (distance < minDistance) {
					minDistance = distance;
					closestCluster = i;
				}
			}

			clusters[closestCluster].colors.push(colorInfo);
			clusters[closestCluster].totalCount += colorInfo.count;
		}

		return clusters;
	}

	private generateAdvancedPalette(dominantColor: string, vibrantColor?: string): ColorPalette {
		try {
			const base = chroma(dominantColor);
			const vibrant = vibrantColor ? chroma(vibrantColor) : base.saturate(0.5);

			// Advanced color harmony generation
			const hue = base.get('hsl.h');
			const saturation = base.get('hsl.s');
			const lightness = base.get('hsl.l');

			return {
				dominant: dominantColor,
				vibrant: vibrant.hex(),
				muted: base.desaturate(0.6).hex(),
				light: chroma.hsl(hue, saturation * 0.3, Math.min(0.9, lightness + 0.3)).hex(),
				dark: chroma.hsl(hue, saturation * 0.8, Math.max(0.1, lightness - 0.4)).hex(),
				accent: chroma
					.hsl((hue + 60) % 360, Math.max(0.7, saturation), lightness > 0.5 ? 0.3 : 0.7)
					.hex(),
				complementary: chroma.hsl((hue + 180) % 360, saturation, lightness).hex(),
				triadic: [
					chroma.hsl((hue + 120) % 360, saturation, lightness).hex(),
					chroma.hsl((hue + 240) % 360, saturation, lightness).hex()
				]
			};
		} catch (error) {
			console.warn('Failed to generate advanced palette:', error);
			return DEFAULT_PALETTE;
		}
	}

	private generateFallbackColor(imagePath: string): string {
		// Generate a color based on the image path/name
		const hash = this.simpleHash(imagePath);
		const hue = hash % 360;
		return chroma.hsl(hue, 0.6, 0.5).hex();
	}

	private simpleHash(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash);
	}

	private isGrayscale(r: number, g: number, b: number): boolean {
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		return max - min < 15;
	}

	private detectOptimalSettings(): void {
		if (!browser) return;

		const devicePixelRatio = window.devicePixelRatio || 1;
		const isHighDPI = devicePixelRatio > 1.5;
		const performanceMemory = (navigator as any).deviceMemory || 4;
		const isLowMemory = performanceMemory < 4;

		if (isHighDPI || isLowMemory) {
			this.setExtractionQuality('fast');
		} else if (performanceMemory >= 8) {
			this.setExtractionQuality('high');
		} else {
			this.setExtractionQuality('balanced');
		}
	}

	private updateCache(key: string, palette: ColorPalette): void {
		this.store.update((state) => {
			const newCache = new Map(state.cache);

			newCache.set(key, palette);

			// LRU cleanup
			if (newCache.size > this.maxCacheSize) {
				const entries = Array.from(newCache.entries());
				const toKeep = entries.slice(-this.maxCacheSize);
				newCache.clear();
				toKeep.forEach(([k, v]) => newCache.set(k, v));
			}

			// Debounced cache persistence
			this.debouncedSaveCache(newCache);

			return { ...state, cache: newCache };
		});
	}

	private debouncedSaveCache = this.debounce((cache: Map<string, ColorPalette>) => {
		try {
			const cacheObject = Object.fromEntries(cache);
			localStorage.setItem(this.cacheKey, JSON.stringify(cacheObject));
		} catch (error) {
			console.warn('Failed to save color cache:', error);
		}
	}, 1000);

	private debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
		let timeout: NodeJS.Timeout;
		return ((...args: any[]) => {
			clearTimeout(timeout);
			timeout = setTimeout(() => func(...args), wait);
		}) as T;
	}

	private getCurrentState(): ColorState {
		let currentState: ColorState;
		this.store.subscribe((state) => (currentState = state))();
		return currentState!;
	}

	// Public utility methods
	clearCache(): void {
		this.store.update((state) => ({ ...state, cache: new Map() }));
		if (browser) {
			localStorage.removeItem(this.cacheKey);
		}
	}

	getExtractionStats(): { cacheSize: number; lastExtractionTime: number } {
		const state = this.getCurrentState();
		return {
			cacheSize: state.cache.size,
			lastExtractionTime: state.extractionTime
		};
	}

	reset(): void {
		this.store.set(DEFAULT_STATE);
		this.clearCache();
	}
}

// Enhanced derived stores
export const colorStore = new ColorStore();

export const currentColor = derived(colorStore, ($store) => $store.current);
export const colorPalette = derived(colorStore, ($store) => $store.palette);
export const isExtractingColor = derived(colorStore, ($store) => $store.isExtracting);
export const extractionTime = derived(colorStore, ($store) => $store.extractionTime);

// Enhanced utility functions
export const getContrastColor = (backgroundColor: string): string => {
	try {
		const color = chroma(backgroundColor);
		const luminance = color.luminance();
		return luminance > 0.5 ? '#000000' : '#ffffff';
	} catch {
		return '#ffffff';
	}
};

export const getAlphaVariant = (color: string, alpha: number): string => {
	try {
		return chroma(color).alpha(alpha).css();
	} catch {
		return `rgba(255, 255, 255, ${alpha})`;
	}
};

export const blendWithBackground = (
	foregroundColor: string,
	backgroundColor: string,
	ratio: number = 0.5
): string => {
	try {
		return chroma.mix(backgroundColor, foregroundColor, ratio, 'lab').hex();
	} catch {
		return foregroundColor;
	}
};

export const getColorHarmony = (
	baseColor: string,
	type: 'complementary' | 'triadic' | 'analogous' = 'complementary'
): string[] => {
	try {
		const base = chroma(baseColor);
		const hue = base.get('hsl.h');
		const saturation = base.get('hsl.s');
		const lightness = base.get('hsl.l');

		switch (type) {
			case 'complementary':
				return [chroma.hsl((hue + 180) % 360, saturation, lightness).hex()];
			case 'triadic':
				return [
					chroma.hsl((hue + 120) % 360, saturation, lightness).hex(),
					chroma.hsl((hue + 240) % 360, saturation, lightness).hex()
				];
			case 'analogous':
				return [
					chroma.hsl((hue + 30) % 360, saturation, lightness).hex(),
					chroma.hsl((hue - 30 + 360) % 360, saturation, lightness).hex()
				];
			default:
				return [baseColor];
		}
	} catch {
		return [baseColor];
	}
};
