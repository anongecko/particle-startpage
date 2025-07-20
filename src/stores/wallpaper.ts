import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export interface WallpaperImage {
	id: string;
	filename: string;
	path: string;
	thumbnailPath?: string;
	dimensions: { width: number; height: number };
	aspectRatio: number;
	fileSize: number;
	lastModified: number;
	dominantColor?: string;
	isLoaded: boolean;
	isPreloaded: boolean;
	loadPriority: number;
	errorCount: number;
}

export interface ThemeCategory {
	id: string;
	name: string;
	parentId?: string;
	children?: ThemeCategory[];
	imageCount: number;
	thumbnailPath?: string;
	description?: string;
	lastUsed?: number;
}

export interface WallpaperTheme {
	id: string;
	name: string;
	categoryId?: string;
	images: WallpaperImage[];
	thumbnailPath?: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
	lastUsed?: number;
	isDefault?: boolean;
}

export interface TransitionEffect {
	id: string;
	name: string;
	duration: number;
	easing: string;
	hasSpecialEffects: boolean;
	gpuAccelerated: boolean;
	minQuality: 'low' | 'medium' | 'high';
}

export interface PerformanceMetrics {
	averageLoadTime: number;
	averageTransitionTime: number;
	cacheHitRatio: number;
	networkLatency: number;
	lastMeasurement: number;
}

export interface LoadingState {
	isLoading: boolean;
	loadingPhase: 'initializing' | 'themes' | 'images' | 'preloading' | 'complete';
	progress: number;
	currentTask: string;
	estimatedTimeRemaining: number;
}

export interface WallpaperState {
	themes: WallpaperTheme[];
	categories: ThemeCategory[];
	currentTheme: string;
	currentImageIndex: number;
	currentImage: WallpaperImage | null;
	nextPreloadedImages: Map<number, HTMLImageElement>;
	shuffleHistory: Array<{ imageId: string; timestamp: number; colorDistance: number }>;
	isTransitioning: boolean;
	transitionType: string;
	enableSpecialEffects: boolean;
	cycleDuration: number;
	autoTransition: boolean;
	loadingState: LoadingState;
	performanceMetrics: PerformanceMetrics;
	error: string | null;
	lastInteraction: number;
	adaptiveQuality: boolean;
	connectionQuality: 'slow' | 'medium' | 'fast';
}

export interface ShuffleSettings {
	preventRecentRepeats: boolean;
	historySize: number;
	weightByRecency: boolean;
	preventSequentialSimilar: boolean;
	colorSimilarityThreshold: number;
	temporalWeighting: boolean;
}

export interface CacheEntry {
	image: HTMLImageElement;
	size: number;
	lastAccessed: number;
	accessCount: number;
	isOptimized: boolean;
}

const TRANSITION_EFFECTS: TransitionEffect[] = [
	{
		id: 'crossfade',
		name: 'Cross Fade',
		duration: 800,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
		hasSpecialEffects: false,
		gpuAccelerated: true,
		minQuality: 'low'
	},
	{
		id: 'slideLeft',
		name: 'Slide Left',
		duration: 1000,
		easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
		hasSpecialEffects: true,
		gpuAccelerated: true,
		minQuality: 'medium'
	},
	{
		id: 'slideRight',
		name: 'Slide Right',
		duration: 1000,
		easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
		hasSpecialEffects: true,
		gpuAccelerated: true,
		minQuality: 'medium'
	},
	{
		id: 'zoomIn',
		name: 'Zoom In',
		duration: 1200,
		easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
		hasSpecialEffects: true,
		gpuAccelerated: true,
		minQuality: 'medium'
	},
	{
		id: 'zoomOut',
		name: 'Zoom Out',
		duration: 1200,
		easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
		hasSpecialEffects: true,
		gpuAccelerated: true,
		minQuality: 'medium'
	},
	{
		id: 'dissolve',
		name: 'Particle Dissolve',
		duration: 1800,
		easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
		hasSpecialEffects: true,
		gpuAccelerated: true,
		minQuality: 'high'
	},
	{
		id: 'ripple',
		name: 'Ripple Wave',
		duration: 1500,
		easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
		hasSpecialEffects: true,
		gpuAccelerated: true,
		minQuality: 'high'
	}
];

const DEFAULT_SHUFFLE_SETTINGS: ShuffleSettings = {
	preventRecentRepeats: true,
	historySize: 12,
	weightByRecency: true,
	preventSequentialSimilar: true,
	colorSimilarityThreshold: 0.7,
	temporalWeighting: true
};

const DEFAULT_PERFORMANCE_METRICS: PerformanceMetrics = {
	averageLoadTime: 0,
	averageTransitionTime: 0,
	cacheHitRatio: 0,
	networkLatency: 0,
	lastMeasurement: 0
};

const DEFAULT_LOADING_STATE: LoadingState = {
	isLoading: false,
	loadingPhase: 'complete',
	progress: 0,
	currentTask: '',
	estimatedTimeRemaining: 0
};

const DEFAULT_STATE: WallpaperState = {
	themes: [],
	categories: [],
	currentTheme: 'default',
	currentImageIndex: 0,
	currentImage: null,
	nextPreloadedImages: new Map(),
	shuffleHistory: [],
	isTransitioning: false,
	transitionType: 'crossfade',
	enableSpecialEffects: true,
	cycleDuration: 60000,
	autoTransition: true,
	loadingState: DEFAULT_LOADING_STATE,
	performanceMetrics: DEFAULT_PERFORMANCE_METRICS,
	error: null,
	lastInteraction: Date.now(),
	adaptiveQuality: true,
	connectionQuality: 'medium'
};

class WallpaperStore {
	private store = writable<WallpaperState>(DEFAULT_STATE);
	private cacheKey = 'particle-nexus-wallpaper-state';
	private metricsKey = 'particle-nexus-wallpaper-metrics';
	private imageCache: Map<string, CacheEntry> = new Map();
	private maxCacheSize = 150 * 1024 * 1024; // 150MB cache limit
	private currentCacheSize = 0;
	private preloadQueue: Array<{ image: WallpaperImage; priority: number }> = [];
	private transitionTimer: NodeJS.Timeout | null = null;
	private preloadWorker: Worker | null = null;
	private shuffleSettings: ShuffleSettings = DEFAULT_SHUFFLE_SETTINGS;
	private resizeObserver: ResizeObserver | null = null;
	private currentDimensions = { width: 0, height: 0 };
	private performanceObserver: PerformanceObserver | null = null;
	private retryAttempts: Map<string, number> = new Map();
	private networkQualityTimer: NodeJS.Timeout | null = null;
	private batchProcessor: {
		queue: Array<() => Promise<void>>;
		isProcessing: boolean;
		maxConcurrent: number;
	} = { queue: [], isProcessing: false, maxConcurrent: 3 };

	subscribe = this.store.subscribe;

	async initialize(): Promise<void> {
		if (!browser) return;

		try {
			this.updateLoadingState('initializing', 0, 'Starting wallpaper system...');

			// Load cached metrics and state
			await this.loadCachedData();

			// Setup performance monitoring
			this.setupPerformanceMonitoring();

			// Setup resize observer
			this.setupResizeObserver();

			// Detect connection quality
			await this.detectConnectionQuality();

			// Load themes
			this.updateLoadingState('themes', 20, 'Loading wallpaper themes...');
			await this.loadAvailableThemes();

			// Initialize current theme
			const currentState = this.getCurrentState();
			if (currentState.currentTheme && currentState.themes.length > 0) {
				this.updateLoadingState('images', 60, 'Loading current theme...');
				await this.loadTheme(currentState.currentTheme);
			} else {
				// Load default theme
				await this.loadDefaultTheme();
			}

			// Start preloading
			this.updateLoadingState('preloading', 80, 'Preloading images...');
			this.initializePreloading();

			// Complete initialization
			this.updateLoadingState('complete', 100, 'Ready');
		} catch (error) {
			console.error('Failed to initialize wallpaper store:', error);
			this.setError('Failed to initialize wallpaper system');
		}
	}

	private async loadCachedData(): Promise<void> {
		try {
			// Load state
			const cached = localStorage.getItem(this.cacheKey);
			if (cached) {
				const parsedState = JSON.parse(cached);
				this.store.update((state) => ({
					...state,
					...parsedState,
					loadingState: DEFAULT_LOADING_STATE
				}));
			}

			// Load performance metrics
			const cachedMetrics = localStorage.getItem(this.metricsKey);
			if (cachedMetrics) {
				const metrics = JSON.parse(cachedMetrics);
				this.store.update((state) => ({ ...state, performanceMetrics: metrics }));
			}
		} catch (error) {
			console.warn('Failed to load cached data:', error);
		}
	}

	private setupPerformanceMonitoring(): void {
		if (!browser || !window.PerformanceObserver) return;

		try {
			this.performanceObserver = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				this.processPerformanceEntries(entries);
			});

			this.performanceObserver.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
		} catch (error) {
			console.warn('Performance monitoring not available:', error);
		}
	}

	private processPerformanceEntries(entries: PerformanceEntry[]): void {
		const imageEntries = entries.filter(
			(entry) =>
				entry.entryType === 'resource' &&
				(entry as PerformanceResourceTiming).initiatorType === 'img'
		);

		if (imageEntries.length > 0) {
			const avgLoadTime =
				imageEntries.reduce((sum, entry) => sum + entry.duration, 0) / imageEntries.length;

			this.store.update((state) => ({
				...state,
				performanceMetrics: {
					...state.performanceMetrics,
					averageLoadTime: (state.performanceMetrics.averageLoadTime + avgLoadTime) / 2,
					lastMeasurement: Date.now()
				}
			}));
		}
	}

	private async detectConnectionQuality(): Promise<void> {
		if (!browser) return;

		try {
			// Use Network Information API if available
			const connection =
				(navigator as any).connection ||
				(navigator as any).mozConnection ||
				(navigator as any).webkitConnection;

			if (connection) {
				const effectiveType = connection.effectiveType;
				let quality: 'slow' | 'medium' | 'fast' = 'medium';

				if (effectiveType === 'slow-2g' || effectiveType === '2g') {
					quality = 'slow';
				} else if (effectiveType === '4g') {
					quality = 'fast';
				}

				this.store.update((state) => ({ ...state, connectionQuality: quality }));
				return;
			}

			// Fallback: measure loading time of a small image
			const testStart = performance.now();
			const testImage = new Image();

			testImage.onload = () => {
				const loadTime = performance.now() - testStart;
				let quality: 'slow' | 'medium' | 'fast' = 'medium';

				if (loadTime > 2000) quality = 'slow';
				else if (loadTime < 500) quality = 'fast';

				this.store.update((state) => ({ ...state, connectionQuality: quality }));
			};

			testImage.src = '/api/wallpapers/test-connection?' + Date.now();
		} catch (error) {
			console.warn('Failed to detect connection quality:', error);
		}
	}

	private async loadAvailableThemes(): Promise<void> {
		try {
			const response = await this.fetchWithRetry('/api/wallpapers/themes');
			const { themes, categories } = await response.json();

			// Sort themes by usage and date
			const sortedThemes = themes.sort((a: WallpaperTheme, b: WallpaperTheme) => {
				if (a.isDefault) return -1;
				if (b.isDefault) return 1;
				return (b.lastUsed || 0) - (a.lastUsed || 0);
			});

			this.store.update((state) => ({
				...state,
				themes: sortedThemes,
				categories
			}));
		} catch (error) {
			console.error('Failed to load themes:', error);
			await this.loadDefaultTheme();
		}
	}

	private async loadDefaultTheme(): Promise<void> {
		try {
			const response = await this.fetchWithRetry('/api/wallpapers/themes/default');
			const defaultTheme: WallpaperTheme = await response.json();

			this.store.update((state) => ({
				...state,
				themes: [defaultTheme],
				currentTheme: 'default'
			}));

			if (defaultTheme.images.length > 0) {
				await this.changeToImage(0, false);
			}
		} catch (error) {
			console.error('Failed to load default theme:', error);
			this.setError('No wallpapers available');
		}
	}

	private async fetchWithRetry(url: string, maxRetries: number = 3): Promise<Response> {
		const retryKey = url;
		const attempts = this.retryAttempts.get(retryKey) || 0;

		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(10000) // 10 second timeout
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			// Reset retry count on success
			this.retryAttempts.delete(retryKey);
			return response;
		} catch (error) {
			if (attempts < maxRetries) {
				this.retryAttempts.set(retryKey, attempts + 1);

				// Exponential backoff
				const delay = Math.pow(2, attempts) * 1000;
				await new Promise((resolve) => setTimeout(resolve, delay));

				return this.fetchWithRetry(url, maxRetries);
			}

			throw error;
		}
	}

	async loadTheme(themeId: string): Promise<void> {
		try {
			const response = await this.fetchWithRetry(`/api/wallpapers/themes/${themeId}`);
			const theme: WallpaperTheme = await response.json();

			// Update theme usage
			theme.lastUsed = Date.now();

			this.store.update((state) => ({
				...state,
				currentTheme: themeId,
				currentImageIndex: 0,
				shuffleHistory: [],
				themes: state.themes.map((t) => (t.id === themeId ? theme : t))
			}));

			// Load first image
			if (theme.images.length > 0) {
				await this.changeToImage(0, false);
				this.initializePreloading();
				this.startAutoTransitionIfEnabled();
			}

			this.saveState();
		} catch (error) {
			console.error('Failed to load theme:', error);
			this.setError(`Failed to load theme: ${themeId}`);
		}
	}

	async changeToImage(index: number, useTransition: boolean = true): Promise<void> {
		const state = this.getCurrentState();
		const currentTheme = this.getCurrentTheme();

		if (!currentTheme || index < 0 || index >= currentTheme.images.length) {
			return;
		}

		if (state.isTransitioning) return;

		const image = currentTheme.images[index];
		const startTime = performance.now();

		// Check if image is already preloaded
		const preloadedImg = state.nextPreloadedImages.get(index);
		if (preloadedImg) {
			// Use preloaded image
			await this.performImageTransition(image, useTransition, preloadedImg);
		} else {
			// Load image with priority
			this.store.update((s) => ({ ...s, isTransitioning: true }));

			try {
				const loadedImg = await this.loadImageWithPriority(image, 1);
				await this.performImageTransition(image, useTransition, loadedImg);
			} catch (error) {
				console.error('Failed to load image:', error);
				this.handleImageError(image);
				return;
			}
		}

		const loadTime = performance.now() - startTime;
		this.updatePerformanceMetrics('imageLoad', loadTime);

		// Update state
		this.store.update((s) => ({
			...s,
			currentImageIndex: index,
			currentImage: image,
			isTransitioning: false,
			lastInteraction: Date.now()
		}));

		// Update shuffle history
		this.updateShuffleHistory(image);

		// Update preloading queue
		this.scheduleIntelligentPreloading();
	}

	private async performImageTransition(
		image: WallpaperImage,
		useTransition: boolean,
		loadedImg: HTMLImageElement
	): Promise<void> {
		const state = this.getCurrentState();
		const transitionType = useTransition ? state.transitionType : 'crossfade';
		const effect = TRANSITION_EFFECTS.find((e) => e.id === transitionType) || TRANSITION_EFFECTS[0];

		// Adapt transition based on performance
		const adaptedEffect = this.adaptTransitionForPerformance(effect);

		// Emit transition event
		window.dispatchEvent(
			new CustomEvent('wallpaper-transition', {
				detail: {
					image,
					loadedImg,
					effect: adaptedEffect,
					enableSpecialEffects: state.enableSpecialEffects && this.shouldUseSpecialEffects()
				}
			})
		);

		// Wait for transition
		return new Promise((resolve) => {
			setTimeout(() => {
				this.updatePerformanceMetrics('transition', adaptedEffect.duration);
				resolve();
			}, adaptedEffect.duration);
		});
	}

	private adaptTransitionForPerformance(effect: TransitionEffect): TransitionEffect {
		const state = this.getCurrentState();
		const metrics = state.performanceMetrics;

		// If performance is poor, use simpler effects
		if (metrics.averageLoadTime > 3000 || state.connectionQuality === 'slow') {
			return TRANSITION_EFFECTS[0]; // Default to crossfade
		}

		// If GPU acceleration not available, avoid complex effects
		if (!this.isGPUAccelerated()) {
			const simpleEffects = TRANSITION_EFFECTS.filter((e) => !e.hasSpecialEffects);
			return simpleEffects.find((e) => e.id === effect.id) || simpleEffects[0];
		}

		return effect;
	}

	private isGPUAccelerated(): boolean {
		if (!browser) return false;

		try {
			const canvas = document.createElement('canvas');
			const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
			return !!gl;
		} catch {
			return false;
		}
	}

	private shouldUseSpecialEffects(): boolean {
		const state = this.getCurrentState();
		return (
			state.enableSpecialEffects &&
			state.performanceMetrics.averageLoadTime < 2000 &&
			state.connectionQuality !== 'slow'
		);
	}

	async nextImage(useTransition: boolean = true): Promise<void> {
		const theme = this.getCurrentTheme();
		if (!theme || theme.images.length === 0) return;

		const nextIndex = await this.getIntelligentNextIndex();
		await this.changeToImage(nextIndex, useTransition);
	}

	private async getIntelligentNextIndex(): Promise<number> {
		const theme = this.getCurrentTheme();
		const state = this.getCurrentState();

		if (!theme) return 0;

		// Advanced shuffle algorithm with temporal weighting
		const now = Date.now();
		const recentCutoff = now - this.shuffleSettings.historySize * state.cycleDuration;

		// Filter out recently played images
		const recentImageIds = new Set(
			state.shuffleHistory
				.filter((entry) => entry.timestamp > recentCutoff)
				.map((entry) => entry.imageId)
		);

		const availableIndices = theme.images
			.map((_, index) => index)
			.filter((index) => !recentImageIds.has(theme.images[index].id));

		if (availableIndices.length === 0) {
			// Reset if all images have been shown recently
			this.resetShuffleHistory();
			return Math.floor(Math.random() * theme.images.length);
		}

		// Calculate weights for intelligent selection
		const weights = await Promise.all(
			availableIndices.map(async (index) => this.calculateImageWeight(index, theme, state))
		);

		// Weighted random selection
		return this.weightedRandomSelection(availableIndices, weights);
	}

	private async calculateImageWeight(
		index: number,
		theme: WallpaperTheme,
		state: WallpaperState
	): Promise<number> {
		const image = theme.images[index];
		let weight = 1.0;

		// Temporal weighting
		if (this.shuffleSettings.temporalWeighting) {
			const lastShown = state.shuffleHistory.find((entry) => entry.imageId === image.id);
			if (lastShown) {
				const timeSince = Date.now() - lastShown.timestamp;
				const cycleFactor = timeSince / state.cycleDuration;
				weight *= Math.min(2.0, cycleFactor * 0.5 + 0.5);
			}
		}

		// Color similarity weighting
		if (this.shuffleSettings.preventSequentialSimilar && state.currentImage) {
			const colorDistance = await this.calculateColorDistance(
				state.currentImage.dominantColor || '#ffffff',
				image.dominantColor || '#ffffff'
			);

			if (colorDistance < this.shuffleSettings.colorSimilarityThreshold) {
				weight *= 0.3; // Heavily penalize similar colors
			}
		}

		// Load priority weighting (prefer preloaded images)
		if (state.nextPreloadedImages.has(index)) {
			weight *= 1.5;
		}

		// File size weighting (prefer smaller files on slow connections)
		if (state.connectionQuality === 'slow') {
			const sizeFactor = Math.max(0.1, 1 - image.fileSize / (50 * 1024 * 1024)); // Penalize files > 50MB
			weight *= sizeFactor;
		}

		return Math.max(0.01, weight);
	}

	private async calculateColorDistance(color1: string, color2: string): Promise<number> {
		// Use LAB color space for perceptual distance
		try {
			// This would typically use chroma-js, but keeping it simple for now
			const rgb1 = this.hexToRgb(color1);
			const rgb2 = this.hexToRgb(color2);

			if (!rgb1 || !rgb2) return 0;

			const distance = Math.sqrt(
				Math.pow(rgb1.r - rgb2.r, 2) + Math.pow(rgb1.g - rgb2.g, 2) + Math.pow(rgb1.b - rgb2.b, 2)
			);

			return 1 - distance / (Math.sqrt(3) * 255);
		} catch {
			return 0;
		}
	}

	private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16)
				}
			: null;
	}

	private weightedRandomSelection(indices: number[], weights: number[]): number {
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		let random = Math.random() * totalWeight;

		for (let i = 0; i < indices.length; i++) {
			random -= weights[i];
			if (random <= 0) {
				return indices[i];
			}
		}

		return indices[indices.length - 1];
	}

	private updateShuffleHistory(image: WallpaperImage): void {
		const now = Date.now();
		const state = this.getCurrentState();

		// Calculate color distance from previous image
		let colorDistance = 0;
		if (state.currentImage && state.currentImage.dominantColor && image.dominantColor) {
			colorDistance = this.calculateColorDistanceSync(
				state.currentImage.dominantColor,
				image.dominantColor
			);
		}

		const historyEntry = {
			imageId: image.id,
			timestamp: now,
			colorDistance
		};

		this.store.update((s) => {
			const newHistory = [...s.shuffleHistory, historyEntry];
			const maxHistory = this.shuffleSettings.historySize * 3; // Keep extended history

			return {
				...s,
				shuffleHistory: newHistory.slice(-maxHistory)
			};
		});
	}

	private calculateColorDistanceSync(color1: string, color2: string): number {
		try {
			const rgb1 = this.hexToRgb(color1);
			const rgb2 = this.hexToRgb(color2);

			if (!rgb1 || !rgb2) return 0;

			const distance = Math.sqrt(
				Math.pow(rgb1.r - rgb2.r, 2) + Math.pow(rgb1.g - rgb2.g, 2) + Math.pow(rgb1.b - rgb2.b, 2)
			);

			return distance / (Math.sqrt(3) * 255);
		} catch {
			return 0;
		}
	}

	private resetShuffleHistory(): void {
		this.store.update((s) => ({ ...s, shuffleHistory: [] }));
	}

	private async loadImageWithPriority(
		image: WallpaperImage,
		priority: number
	): Promise<HTMLImageElement> {
		const cacheKey = this.getOptimizedImagePath(image);

		// Check cache first
		const cached = this.imageCache.get(cacheKey);
		if (cached) {
			cached.lastAccessed = Date.now();
			cached.accessCount++;
			this.updateCacheHitRatio(true);
			return cached.image;
		}

		this.updateCacheHitRatio(false);

		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';

			const timeout = setTimeout(() => {
				reject(new Error('Image load timeout'));
			}, this.getTimeoutForConnectionQuality());

			img.onload = () => {
				clearTimeout(timeout);

				// Add to cache
				this.addToCache(cacheKey, img, image.fileSize);

				// Mark as loaded
				this.updateImageLoadState(image.id, true);

				resolve(img);
			};

			img.onerror = () => {
				clearTimeout(timeout);
				this.handleImageError(image);
				reject(new Error(`Failed to load image: ${image.filename}`));
			};

			img.src = cacheKey;
		});
	}

	private getTimeoutForConnectionQuality(): number {
		const state = this.getCurrentState();
		switch (state.connectionQuality) {
			case 'slow':
				return 30000; // 30s
			case 'fast':
				return 5000; // 5s
			default:
				return 15000; // 15s
		}
	}

	private addToCache(key: string, img: HTMLImageElement, estimatedSize: number): void {
		// Estimate actual image size
		const canvas = document.createElement('canvas');
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const actualSize = canvas.width * canvas.height * 4; // RGBA
		canvas.remove();

		const entry: CacheEntry = {
			image: img,
			size: actualSize,
			lastAccessed: Date.now(),
			accessCount: 1,
			isOptimized: true
		};

		// Evict if necessary
		this.evictCacheIfNeeded(actualSize);

		this.imageCache.set(key, entry);
		this.currentCacheSize += actualSize;
	}

	private evictCacheIfNeeded(newEntrySize: number): void {
		while (this.currentCacheSize + newEntrySize > this.maxCacheSize && this.imageCache.size > 0) {
			// LRU eviction with access frequency consideration
			let lruKey = '';
			let lruScore = Infinity;

			for (const [key, entry] of this.imageCache.entries()) {
				// Score combines recency and frequency
				const recencyScore = Date.now() - entry.lastAccessed;
				const frequencyScore = 1 / (entry.accessCount + 1);
				const combinedScore = recencyScore * frequencyScore;

				if (combinedScore < lruScore) {
					lruScore = combinedScore;
					lruKey = key;
				}
			}

			if (lruKey) {
				const evicted = this.imageCache.get(lruKey);
				if (evicted) {
					this.currentCacheSize -= evicted.size;
				}
				this.imageCache.delete(lruKey);
			}
		}
	}

	private updateCacheHitRatio(hit: boolean): void {
		this.store.update((state) => {
			const currentRatio = state.performanceMetrics.cacheHitRatio;
			const newRatio = hit ? currentRatio * 0.9 + 0.1 : currentRatio * 0.9;

			return {
				...state,
				performanceMetrics: {
					...state.performanceMetrics,
					cacheHitRatio: Math.max(0, Math.min(1, newRatio))
				}
			};
		});
	}

	private initializePreloading(): void {
		this.scheduleIntelligentPreloading();
		this.startBatchProcessor();
	}

	private scheduleIntelligentPreloading(): void {
		const theme = this.getCurrentTheme();
		const state = this.getCurrentState();

		if (!theme) return;

		// Clear existing preloaded images that are no longer relevant
		const currentIndex = state.currentImageIndex;
		const relevantIndices = this.getPredictedNextIndices(5);

		// Remove irrelevant preloaded images
		for (const [index] of state.nextPreloadedImages) {
			if (!relevantIndices.includes(index)) {
				this.store.update((s) => {
					const newMap = new Map(s.nextPreloadedImages);
					newMap.delete(index);
					return { ...s, nextPreloadedImages: newMap };
				});
			}
		}

		// Queue new images for preloading
		relevantIndices.forEach((index, priority) => {
			if (!state.nextPreloadedImages.has(index) && index !== currentIndex) {
				this.queueImageForPreloading(theme.images[index], priority + 1);
			}
		});
	}

	private getPredictedNextIndices(count: number): number[] {
		const theme = this.getCurrentTheme();
		if (!theme) return [];

		const predictions: number[] = [];
		const maxPredictions = Math.min(count, theme.images.length - 1);

		// Simulate shuffle algorithm multiple times to predict likely next images
		for (
			let simulation = 0;
			simulation < 100 && predictions.length < maxPredictions;
			simulation++
		) {
			const predictedIndex = this.simulateNextIndex();
			if (predictedIndex !== -1 && !predictions.includes(predictedIndex)) {
				predictions.push(predictedIndex);
			}
		}

		return predictions;
	}

	private simulateNextIndex(): number {
		// Simplified simulation of the shuffle algorithm
		const theme = this.getCurrentTheme();
		const state = this.getCurrentState();

		if (!theme) return -1;

		const availableIndices = theme.images
			.map((_, index) => index)
			.filter((index) => {
				const imageId = theme.images[index].id;
				const recentHistory = state.shuffleHistory.slice(-this.shuffleSettings.historySize);
				return !recentHistory.some((entry) => entry.imageId === imageId);
			});

		if (availableIndices.length === 0) {
			return Math.floor(Math.random() * theme.images.length);
		}

		return availableIndices[Math.floor(Math.random() * availableIndices.length)];
	}

	private queueImageForPreloading(image: WallpaperImage, priority: number): void {
		this.preloadQueue.push({ image, priority });
		this.preloadQueue.sort((a, b) => a.priority - b.priority);
	}

	private startBatchProcessor(): void {
		if (this.batchProcessor.isProcessing) return;

		this.batchProcessor.isProcessing = true;
		this.processBatchQueue();
	}

	private async processBatchQueue(): Promise<void> {
		const state = this.getCurrentState();
		const maxConcurrent =
			state.connectionQuality === 'slow' ? 1 : state.connectionQuality === 'fast' ? 4 : 2;

		while (this.preloadQueue.length > 0) {
			const batch = this.preloadQueue.splice(0, maxConcurrent);

			const promises = batch.map(async ({ image, priority }) => {
				try {
					const loadedImg = await this.loadImageWithPriority(image, priority);

					// Add to preloaded images map
					const theme = this.getCurrentTheme();
					if (theme) {
						const index = theme.images.findIndex((img) => img.id === image.id);
						if (index !== -1) {
							this.store.update((s) => {
								const newMap = new Map(s.nextPreloadedImages);
								newMap.set(index, loadedImg);
								return { ...s, nextPreloadedImages: newMap };
							});
						}
					}
				} catch (error) {
					console.warn('Failed to preload image:', image.filename, error);
				}
			});

			await Promise.allSettled(promises);

			// Pause between batches to avoid overwhelming the connection
			if (this.preloadQueue.length > 0) {
				const pauseDuration = state.connectionQuality === 'slow' ? 2000 : 500;
				await new Promise((resolve) => setTimeout(resolve, pauseDuration));
			}
		}

		this.batchProcessor.isProcessing = false;
	}

	private getOptimizedImagePath(image: WallpaperImage): string {
		const { width, height } = this.currentDimensions;
		const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for performance
		const state = this.getCurrentState();

		// Adaptive quality based on connection and performance
		let quality = 90;
		if (state.connectionQuality === 'slow') quality = 70;
		else if (state.performanceMetrics.averageLoadTime > 3000) quality = 75;

		const targetWidth = Math.floor(width * devicePixelRatio);
		const targetHeight = Math.floor(height * devicePixelRatio);

		return `/api/wallpapers/image/${image.id}?w=${targetWidth}&h=${targetHeight}&fit=cover&quality=${quality}&format=webp`;
	}

	private setupResizeObserver(): void {
		if (!browser || !window.ResizeObserver) return;

		this.currentDimensions = {
			width: window.innerWidth,
			height: window.innerHeight
		};

		this.resizeObserver = new ResizeObserver(
			this.debounce((entries) => {
				const entry = entries[0];
				if (entry) {
					const oldDimensions = { ...this.currentDimensions };
					this.currentDimensions = {
						width: entry.contentRect.width,
						height: entry.contentRect.height
					};

					// Only clear cache if dimensions changed significantly
					const widthChange =
						Math.abs(oldDimensions.width - this.currentDimensions.width) / oldDimensions.width;
					const heightChange =
						Math.abs(oldDimensions.height - this.currentDimensions.height) / oldDimensions.height;

					if (widthChange > 0.1 || heightChange > 0.1) {
						this.clearImageCache();
						this.scheduleIntelligentPreloading();
					}
				}
			}, 250)
		);

		this.resizeObserver.observe(document.body);
	}

	private debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
		let timeout: NodeJS.Timeout;
		return ((...args: any[]) => {
			clearTimeout(timeout);
			timeout = setTimeout(() => func(...args), wait);
		}) as T;
	}

	private updateLoadingState(
		phase: LoadingState['loadingPhase'],
		progress: number,
		task: string
	): void {
		this.store.update((state) => ({
			...state,
			loadingState: {
				isLoading: phase !== 'complete',
				loadingPhase: phase,
				progress,
				currentTask: task,
				estimatedTimeRemaining: this.estimateTimeRemaining(progress)
			}
		}));
	}

	private estimateTimeRemaining(progress: number): number {
		if (progress <= 0) return 0;

		const state = this.getCurrentState();
		const elapsed = Date.now() - (state.loadingState.lastMeasurement || Date.now());
		const rate = progress / Math.max(elapsed, 1);
		const remaining = (100 - progress) / rate;

		return Math.max(0, remaining);
	}

	private updatePerformanceMetrics(type: 'imageLoad' | 'transition', duration: number): void {
		this.store.update((state) => {
			const metrics = { ...state.performanceMetrics };

			if (type === 'imageLoad') {
				metrics.averageLoadTime = (metrics.averageLoadTime + duration) / 2;
			} else if (type === 'transition') {
				metrics.averageTransitionTime = (metrics.averageTransitionTime + duration) / 2;
			}

			metrics.lastMeasurement = Date.now();

			// Save metrics periodically
			this.debouncedSaveMetrics(metrics);

			return { ...state, performanceMetrics: metrics };
		});
	}

	private debouncedSaveMetrics = this.debounce((metrics: PerformanceMetrics) => {
		try {
			localStorage.setItem(this.metricsKey, JSON.stringify(metrics));
		} catch (error) {
			console.warn('Failed to save performance metrics:', error);
		}
	}, 5000);

	private handleImageError(image: WallpaperImage): void {
		// Increment error count
		this.store.update((state) => ({
			...state,
			themes: state.themes.map((theme) => ({
				...theme,
				images: theme.images.map((img) =>
					img.id === image.id ? { ...img, errorCount: (img.errorCount || 0) + 1 } : img
				)
			}))
		}));

		// Show error notification
		window.dispatchEvent(
			new CustomEvent('wallpaper-error', {
				detail: { message: `Image missing: ${image.filename}` }
			})
		);

		// If too many errors, try next image
		if ((image.errorCount || 0) >= 3) {
			setTimeout(() => this.nextImage(), 1000);
		}
	}

	private updateImageLoadState(imageId: string, isLoaded: boolean): void {
		this.store.update((state) => ({
			...state,
			themes: state.themes.map((theme) => ({
				...theme,
				images: theme.images.map((img) => (img.id === imageId ? { ...img, isLoaded } : img))
			}))
		}));
	}

	private setError(error: string): void {
		this.store.update((state) => ({
			...state,
			error,
			loadingState: { ...state.loadingState, isLoading: false }
		}));
	}

	private getCurrentState(): WallpaperState {
		let currentState: WallpaperState;
		this.store.subscribe((state) => (currentState = state))();
		return currentState!;
	}

	private getCurrentTheme(): WallpaperTheme | null {
		const state = this.getCurrentState();
		return state.themes.find((t) => t.id === state.currentTheme) || null;
	}

	private saveState(): void {
		if (!browser) return;

		const state = this.getCurrentState();
		const stateToSave = {
			currentTheme: state.currentTheme,
			currentImageIndex: state.currentImageIndex,
			transitionType: state.transitionType,
			enableSpecialEffects: state.enableSpecialEffects,
			cycleDuration: state.cycleDuration,
			autoTransition: state.autoTransition,
			adaptiveQuality: state.adaptiveQuality,
			lastInteraction: state.lastInteraction
		};

		try {
			localStorage.setItem(this.cacheKey, JSON.stringify(stateToSave));
		} catch (error) {
			console.warn('Failed to save wallpaper state:', error);
		}
	}

	// Public API methods
	async previousImage(): Promise<void> {
		const state = this.getCurrentState();
		if (state.shuffleHistory.length > 1) {
			const previousEntry = state.shuffleHistory[state.shuffleHistory.length - 2];
			const theme = this.getCurrentTheme();
			const index = theme?.images.findIndex((img) => img.id === previousEntry.imageId) ?? 0;

			// Remove last two entries from history
			this.store.update((s) => ({
				...s,
				shuffleHistory: s.shuffleHistory.slice(0, -2)
			}));

			await this.changeToImage(index);
		}
	}

	setTransitionType(transitionType: string): void {
		this.store.update((state) => ({ ...state, transitionType }));
		this.saveState();
	}

	setSpecialEffects(enabled: boolean): void {
		this.store.update((state) => ({ ...state, enableSpecialEffects: enabled }));
		this.saveState();
	}

	setCycleDuration(duration: number): void {
		this.store.update((state) => ({ ...state, cycleDuration: duration }));
		this.restartAutoTransition();
		this.saveState();
	}

	setAutoTransition(enabled: boolean): void {
		this.store.update((state) => ({ ...state, autoTransition: enabled }));
		if (enabled) {
			this.startAutoTransitionIfEnabled();
		} else {
			this.stopAutoTransition();
		}
		this.saveState();
	}

	private startAutoTransitionIfEnabled(): void {
		this.stopAutoTransition();
		const state = this.getCurrentState();

		if (state.autoTransition && state.cycleDuration > 0) {
			this.transitionTimer = setTimeout(() => {
				this.nextImage();
				this.startAutoTransitionIfEnabled(); // Schedule next transition
			}, state.cycleDuration);
		}
	}

	private stopAutoTransition(): void {
		if (this.transitionTimer) {
			clearTimeout(this.transitionTimer);
			this.transitionTimer = null;
		}
	}

	private restartAutoTransition(): void {
		if (this.getCurrentState().autoTransition) {
			this.startAutoTransitionIfEnabled();
		}
	}

	async uploadImages(files: FileList, themeId?: string): Promise<void> {
		const formData = new FormData();

		for (let i = 0; i < files.length; i++) {
			formData.append('images', files[i]);
		}

		if (themeId) {
			formData.append('themeId', themeId);
		}

		try {
			this.updateLoadingState('images', 0, 'Uploading images...');

			const response = await fetch('/api/wallpapers/upload', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) throw new Error('Upload failed');

			// Monitor upload progress if supported
			this.updateLoadingState('images', 50, 'Processing images...');

			// Reload themes after upload
			await this.loadAvailableThemes();
			this.updateLoadingState('complete', 100, 'Upload complete');
		} catch (error) {
			console.error('Upload failed:', error);
			this.setError('Failed to upload images');
		}
	}

	clearImageCache(): void {
		this.imageCache.clear();
		this.currentCacheSize = 0;
		this.store.update((state) => ({
			...state,
			nextPreloadedImages: new Map()
		}));
	}

	getPerformanceStats(): PerformanceMetrics & { cacheSize: number; cacheEntries: number } {
		const state = this.getCurrentState();
		return {
			...state.performanceMetrics,
			cacheSize: this.currentCacheSize,
			cacheEntries: this.imageCache.size
		};
	}

	destroy(): void {
		this.stopAutoTransition();
		this.resizeObserver?.disconnect();
		this.performanceObserver?.disconnect();
		this.clearImageCache();
		this.preloadWorker?.terminate();

		if (this.networkQualityTimer) {
			clearTimeout(this.networkQualityTimer);
		}
	}
}

// Create store instance
export const wallpaperStore = new WallpaperStore();

// Enhanced derived stores
export const currentWallpaper = derived(wallpaperStore, ($store) => $store.currentImage);
export const isWallpaperLoading = derived(
	wallpaperStore,
	($store) => $store.loadingState.isLoading
);
export const wallpaperProgress = derived(wallpaperStore, ($store) => $store.loadingState.progress);
export const loadingPhase = derived(wallpaperStore, ($store) => $store.loadingState.loadingPhase);
export const currentTask = derived(wallpaperStore, ($store) => $store.loadingState.currentTask);
export const availableTransitions = derived(wallpaperStore, () => TRANSITION_EFFECTS);
export const performanceMetrics = derived(wallpaperStore, ($store) => $store.performanceMetrics);
export const connectionQuality = derived(wallpaperStore, ($store) => $store.connectionQuality);
