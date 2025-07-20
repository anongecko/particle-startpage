import { browser } from '$app/environment';
import { debounce, throttle, perfMonitor } from './utils';

export interface WallpaperImage {
	id: string;
	filename: string;
	path: string;
	width: number;
	height: number;
	aspectRatio: number;
	fileSize: number;
	lastModified: number;
}

export interface PreloadOptions {
	maxConcurrent: number;
	priority: 'high' | 'normal' | 'low';
	targetWidth?: number;
	targetHeight?: number;
	quality?: number;
	format?: 'webp' | 'jpeg' | 'png';
}

export interface ImageMetadata {
	width: number;
	height: number;
	aspectRatio: number;
	fileSize: number;
	format: string;
	isValid: boolean;
}

export interface PreloadResult {
	success: boolean;
	image?: HTMLImageElement;
	error?: string;
	loadTime: number;
	fromCache: boolean;
}

/**
 * Advanced image preloader with priority queue and optimization
 */
class WallpaperPreloader {
	private cache = new Map<string, HTMLImageElement>();
	private loadingQueue = new Map<string, Promise<PreloadResult>>();
	private maxCacheSize = 50;
	private currentLoads = 0;
	private maxConcurrentLoads = 3;
	private abortControllers = new Map<string, AbortController>();

	/**
	 * Preload a single wallpaper image
	 */
	async preload(imagePath: string, options: Partial<PreloadOptions> = {}): Promise<PreloadResult> {
		const opts: PreloadOptions = {
			maxConcurrent: 3,
			priority: 'normal',
			quality: 90,
			format: 'webp',
			...options
		};

		// Check cache first
		const cached = this.cache.get(imagePath);
		if (cached) {
			return {
				success: true,
				image: cached,
				loadTime: 0,
				fromCache: true
			};
		}

		// Check if already loading
		const existingLoad = this.loadingQueue.get(imagePath);
		if (existingLoad) {
			return existingLoad;
		}

		// Create load promise
		const loadPromise = this.loadImage(imagePath, opts);
		this.loadingQueue.set(imagePath, loadPromise);

		try {
			const result = await loadPromise;

			// Add to cache if successful
			if (result.success && result.image) {
				this.addToCache(imagePath, result.image);
			}

			return result;
		} finally {
			this.loadingQueue.delete(imagePath);
		}
	}

	/**
	 * Preload multiple images with priority management
	 */
	async preloadBatch(
		imagePaths: string[],
		options: Partial<PreloadOptions> = {}
	): Promise<PreloadResult[]> {
		const opts: PreloadOptions = {
			maxConcurrent: 3,
			priority: 'normal',
			...options
		};

		// Sort by priority and existing cache status
		const sortedPaths = this.sortByPriority(imagePaths, opts.priority);

		// Process in batches to respect concurrency limits
		const results: PreloadResult[] = [];

		for (let i = 0; i < sortedPaths.length; i += opts.maxConcurrent) {
			const batch = sortedPaths.slice(i, i + opts.maxConcurrent);
			const batchPromises = batch.map((path) => this.preload(path, opts));
			const batchResults = await Promise.allSettled(batchPromises);

			batchResults.forEach((result) => {
				if (result.status === 'fulfilled') {
					results.push(result.value);
				} else {
					results.push({
						success: false,
						error: result.reason?.message || 'Unknown error',
						loadTime: 0,
						fromCache: false
					});
				}
			});
		}

		return results;
	}

	/**
	 * Load individual image with optimization
	 */
	private async loadImage(imagePath: string, options: PreloadOptions): Promise<PreloadResult> {
		const startTime = performance.now();

		// Wait for available slot if at max concurrent loads
		await this.waitForSlot();

		this.currentLoads++;

		try {
			const optimizedPath = this.getOptimizedImagePath(imagePath, options);
			const result = await this.loadImageElement(optimizedPath, options);

			const loadTime = performance.now() - startTime;

			return {
				success: true,
				image: result,
				loadTime,
				fromCache: false
			};
		} catch (error) {
			const loadTime = performance.now() - startTime;

			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				loadTime,
				fromCache: false
			};
		} finally {
			this.currentLoads--;
		}
	}

	/**
	 * Load image element with timeout and abort support
	 */
	private loadImageElement(imagePath: string, options: PreloadOptions): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const abortController = new AbortController();
			this.abortControllers.set(imagePath, abortController);

			// Set up timeout
			const timeoutMs = this.getTimeoutForPriority(options.priority);
			const timeout = setTimeout(() => {
				abortController.abort();
				reject(new Error('Image load timeout'));
			}, timeoutMs);

			// Handle abort
			abortController.signal.addEventListener('abort', () => {
				clearTimeout(timeout);
				reject(new Error('Image load aborted'));
			});

			img.onload = () => {
				clearTimeout(timeout);
				this.abortControllers.delete(imagePath);
				resolve(img);
			};

			img.onerror = () => {
				clearTimeout(timeout);
				this.abortControllers.delete(imagePath);
				reject(new Error('Failed to load image'));
			};

			// Configure image loading
			img.crossOrigin = 'anonymous';
			img.decoding = 'async';
			img.loading = 'eager';
			img.src = imagePath;
		});
	}

	/**
	 * Wait for available loading slot
	 */
	private async waitForSlot(): Promise<void> {
		while (this.currentLoads >= this.maxConcurrentLoads) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	/**
	 * Get optimized image path with parameters
	 */
	private getOptimizedImagePath(imagePath: string, options: PreloadOptions): string {
		const url = new URL(imagePath, window.location.origin);

		if (options.targetWidth) {
			url.searchParams.set('w', options.targetWidth.toString());
		}

		if (options.targetHeight) {
			url.searchParams.set('h', options.targetHeight.toString());
		}

		if (options.quality) {
			url.searchParams.set('q', options.quality.toString());
		}

		if (options.format) {
			url.searchParams.set('f', options.format);
		}

		// Add cache busting for very recent images
		const lastModified = this.getImageLastModified(imagePath);
		if (lastModified && Date.now() - lastModified < 60000) {
			// 1 minute
			url.searchParams.set('v', lastModified.toString());
		}

		return url.toString();
	}

	/**
	 * Sort images by priority and cache status
	 */
	private sortByPriority(imagePaths: string[], priority: string): string[] {
		return imagePaths.sort((a, b) => {
			// Prioritize uncached images for high priority
			const aCached = this.cache.has(a);
			const bCached = this.cache.has(b);

			if (priority === 'high') {
				if (aCached && !bCached) return 1;
				if (!aCached && bCached) return -1;
			}

			return 0; // Maintain original order for same priority
		});
	}

	/**
	 * Get timeout based on priority
	 */
	private getTimeoutForPriority(priority: string): number {
		switch (priority) {
			case 'high':
				return 5000; // 5 seconds
			case 'low':
				return 30000; // 30 seconds
			default:
				return 15000; // 15 seconds
		}
	}

	/**
	 * Add image to cache with LRU eviction
	 */
	private addToCache(imagePath: string, image: HTMLImageElement): void {
		// Remove if already exists
		if (this.cache.has(imagePath)) {
			this.cache.delete(imagePath);
		}

		// Evict oldest if at capacity
		if (this.cache.size >= this.maxCacheSize) {
			const firstKey = this.cache.keys().next().value;
			this.cache.delete(firstKey);
		}

		this.cache.set(imagePath, image);
	}

	/**
	 * Get image last modified time (would be set from metadata)
	 */
	private getImageLastModified(imagePath: string): number | null {
		// This would typically come from image metadata
		// For now, return null
		return null;
	}

	/**
	 * Cancel preload operations
	 */
	cancelPreload(imagePath: string): void {
		const controller = this.abortControllers.get(imagePath);
		if (controller) {
			controller.abort();
			this.abortControllers.delete(imagePath);
		}
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; maxSize: number; hitRate: number } {
		// Simple implementation - in real app would track hits/misses
		return {
			size: this.cache.size,
			maxSize: this.maxCacheSize,
			hitRate: 0.8 // Placeholder
		};
	}
}

// Global preloader instance
export const wallpaperPreloader = new WallpaperPreloader();

/**
 * Preload wallpapers with smart prioritization
 */
export async function preloadWallpapers(
	images: string[],
	options: Partial<PreloadOptions> = {}
): Promise<PreloadResult[]> {
	perfMonitor.mark('wallpaperPreload');

	try {
		const results = await wallpaperPreloader.preloadBatch(images, options);
		return results;
	} finally {
		perfMonitor.measure('wallpaperPreload', 'wallpaperPreload');
	}
}

/**
 * Get optimal image dimensions for current viewport
 */
export function getOptimalImageDimensions(): { width: number; height: number } {
	if (!browser) return { width: 1920, height: 1080 };

	const pixelRatio = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x

	return {
		width: Math.ceil(window.innerWidth * pixelRatio),
		height: Math.ceil(window.innerHeight * pixelRatio)
	};
}

/**
 * Image format detection and optimization
 */
export function getSupportedImageFormat(): 'webp' | 'jpeg' {
	if (!browser) return 'jpeg';

	// Check WebP support
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;

	try {
		const webpData = canvas.toDataURL('image/webp');
		return webpData.startsWith('data:image/webp') ? 'webp' : 'jpeg';
	} catch {
		return 'jpeg';
	}
}

/**
 * Image metadata extraction
 */
export async function getImageMetadata(imagePath: string): Promise<ImageMetadata> {
	return new Promise((resolve, reject) => {
		const img = new Image();

		img.onload = () => {
			const metadata: ImageMetadata = {
				width: img.naturalWidth,
				height: img.naturalHeight,
				aspectRatio: img.naturalWidth / img.naturalHeight,
				fileSize: 0, // Would need to be provided by server
				format: getImageFormat(imagePath),
				isValid: img.naturalWidth > 0 && img.naturalHeight > 0
			};

			resolve(metadata);
		};

		img.onerror = () => {
			reject(new Error('Failed to load image metadata'));
		};

		img.src = imagePath;
	});
}

/**
 * Extract image format from path
 */
function getImageFormat(imagePath: string): string {
	const extension = imagePath.split('.').pop()?.toLowerCase();
	switch (extension) {
		case 'jpg':
		case 'jpeg':
			return 'jpeg';
		case 'png':
			return 'png';
		case 'webp':
			return 'webp';
		case 'gif':
			return 'gif';
		default:
			return 'unknown';
	}
}

/**
 * Image compression and optimization utilities
 */
export class ImageOptimizer {
	/**
	 * Resize image to target dimensions
	 */
	static async resizeImage(
		image: HTMLImageElement,
		targetWidth: number,
		targetHeight: number,
		quality: number = 0.9
	): Promise<Blob> {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;

		canvas.width = targetWidth;
		canvas.height = targetHeight;

		// Use image smoothing for better quality
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';

		// Draw resized image
		ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

		// Convert to blob
		return new Promise((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('Failed to create blob'))),
				'image/jpeg',
				quality
			);
		});
	}

	/**
	 * Create thumbnail from image
	 */
	static async createThumbnail(image: HTMLImageElement, size: number = 300): Promise<string> {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;

		// Calculate dimensions maintaining aspect ratio
		const aspectRatio = image.width / image.height;
		let width = size;
		let height = size;

		if (aspectRatio > 1) {
			height = size / aspectRatio;
		} else {
			width = size * aspectRatio;
		}

		canvas.width = width;
		canvas.height = height;

		ctx.drawImage(image, 0, 0, width, height);

		return canvas.toDataURL('image/jpeg', 0.8);
	}

	/**
	 * Apply image filters for aesthetic enhancement
	 */
	static async applyFilter(
		image: HTMLImageElement,
		filter: 'blur' | 'brightness' | 'contrast' | 'saturation',
		intensity: number
	): Promise<string> {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;

		canvas.width = image.width;
		canvas.height = image.height;

		// Apply CSS filter
		let filterString = '';
		switch (filter) {
			case 'blur':
				filterString = `blur(${intensity}px)`;
				break;
			case 'brightness':
				filterString = `brightness(${intensity})`;
				break;
			case 'contrast':
				filterString = `contrast(${intensity})`;
				break;
			case 'saturation':
				filterString = `saturate(${intensity})`;
				break;
		}

		ctx.filter = filterString;
		ctx.drawImage(image, 0, 0);

		return canvas.toDataURL('image/jpeg', 0.9);
	}
}

/**
 * Wallpaper transition effects
 */
export class WallpaperTransition {
	private static canvas: HTMLCanvasElement | null = null;
	private static ctx: CanvasRenderingContext2D | null = null;

	/**
	 * Initialize transition canvas
	 */
	private static initCanvas(): void {
		if (!this.canvas) {
			this.canvas = document.createElement('canvas');
			this.ctx = this.canvas.getContext('2d')!;
			this.canvas.style.position = 'fixed';
			this.canvas.style.top = '0';
			this.canvas.style.left = '0';
			this.canvas.style.zIndex = '-1';
			this.canvas.style.pointerEvents = 'none';
			document.body.appendChild(this.canvas);
		}

		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
	}

	/**
	 * Crossfade transition between images
	 */
	static async crossfade(
		fromImage: HTMLImageElement,
		toImage: HTMLImageElement,
		duration: number = 1000
	): Promise<void> {
		this.initCanvas();
		if (!this.canvas || !this.ctx) return;

		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Clear canvas
			this.ctx!.clearRect(0, 0, this.canvas!.width, this.canvas!.height);

			// Draw from image with decreasing opacity
			this.ctx!.globalAlpha = 1 - progress;
			this.drawImageFitCover(fromImage);

			// Draw to image with increasing opacity
			this.ctx!.globalAlpha = progress;
			this.drawImageFitCover(toImage);

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				// Reset alpha
				this.ctx!.globalAlpha = 1;
			}
		};

		requestAnimationFrame(animate);

		// Wait for animation to complete
		return new Promise((resolve) => {
			setTimeout(resolve, duration);
		});
	}

	/**
	 * Slide transition between images
	 */
	static async slide(
		fromImage: HTMLImageElement,
		toImage: HTMLImageElement,
		direction: 'left' | 'right' | 'up' | 'down' = 'left',
		duration: number = 1200
	): Promise<void> {
		this.initCanvas();
		if (!this.canvas || !this.ctx) return;

		const startTime = performance.now();
		const canvasWidth = this.canvas.width;
		const canvasHeight = this.canvas.height;

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = this.easeOutQuart(Math.min(elapsed / duration, 1));

			this.ctx!.clearRect(0, 0, canvasWidth, canvasHeight);

			let fromX = 0,
				fromY = 0,
				toX = 0,
				toY = 0;

			switch (direction) {
				case 'left':
					fromX = -canvasWidth * progress;
					toX = canvasWidth * (1 - progress);
					break;
				case 'right':
					fromX = canvasWidth * progress;
					toX = -canvasWidth * (1 - progress);
					break;
				case 'up':
					fromY = -canvasHeight * progress;
					toY = canvasHeight * (1 - progress);
					break;
				case 'down':
					fromY = canvasHeight * progress;
					toY = -canvasHeight * (1 - progress);
					break;
			}

			// Draw images at calculated positions
			this.ctx!.save();
			this.ctx!.translate(fromX, fromY);
			this.drawImageFitCover(fromImage);
			this.ctx!.restore();

			this.ctx!.save();
			this.ctx!.translate(toX, toY);
			this.drawImageFitCover(toImage);
			this.ctx!.restore();

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		requestAnimationFrame(animate);

		return new Promise((resolve) => {
			setTimeout(resolve, duration);
		});
	}

	/**
	 * Draw image to fit and cover canvas
	 */
	private static drawImageFitCover(image: HTMLImageElement): void {
		if (!this.canvas || !this.ctx) return;

		const canvasAspect = this.canvas.width / this.canvas.height;
		const imageAspect = image.width / image.height;

		let drawWidth = this.canvas.width;
		let drawHeight = this.canvas.height;
		let offsetX = 0;
		let offsetY = 0;

		if (imageAspect > canvasAspect) {
			// Image is wider, fit to height
			drawWidth = this.canvas.height * imageAspect;
			offsetX = (this.canvas.width - drawWidth) / 2;
		} else {
			// Image is taller, fit to width
			drawHeight = this.canvas.width / imageAspect;
			offsetY = (this.canvas.height - drawHeight) / 2;
		}

		this.ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
	}

	/**
	 * Easing function for smooth animations
	 */
	private static easeOutQuart(t: number): number {
		return 1 - Math.pow(1 - t, 4);
	}

	/**
	 * Cleanup transition canvas
	 */
	static cleanup(): void {
		if (this.canvas && this.canvas.parentNode) {
			this.canvas.parentNode.removeChild(this.canvas);
			this.canvas = null;
			this.ctx = null;
		}
	}
}

/**
 * Responsive image source management
 */
export function getResponsiveImageSrc(
	baseUrl: string,
	breakpoints: { width: number; density?: number }[] = []
): string {
	if (!browser) return baseUrl;

	const devicePixelRatio = window.devicePixelRatio || 1;
	const viewportWidth = window.innerWidth;

	// Default breakpoints if none provided
	const defaultBreakpoints = [
		{ width: 480, density: 1 },
		{ width: 768, density: 1 },
		{ width: 1024, density: 1 },
		{ width: 1440, density: 1 },
		{ width: 1920, density: 1 }
	];

	const points = breakpoints.length > 0 ? breakpoints : defaultBreakpoints;

	// Find appropriate breakpoint
	const targetBreakpoint =
		points.find((bp) => viewportWidth <= bp.width) || points[points.length - 1];

	// Calculate target dimensions
	const targetWidth = Math.ceil(
		targetBreakpoint.width * (targetBreakpoint.density || devicePixelRatio)
	);
	const format = getSupportedImageFormat();

	// Build optimized URL
	const url = new URL(baseUrl, window.location.origin);
	url.searchParams.set('w', targetWidth.toString());
	url.searchParams.set('f', format);
	url.searchParams.set('q', '90');

	return url.toString();
}

/**
 * Debounced viewport change handler for responsive images
 */
export const handleViewportChange = debounce((callback: () => void) => {
	callback();
}, 250);

/**
 * Throttled scroll handler for parallax effects
 */
export const handleParallaxScroll = throttle((callback: (scrollY: number) => void) => {
	callback(window.scrollY);
}, 16); // ~60fps
