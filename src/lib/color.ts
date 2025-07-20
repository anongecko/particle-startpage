import { browser } from '$app/environment';
import chroma from 'chroma-js';
import type { ColorPalette } from '$stores/color';

export interface ColorConfig {
	enableWebWorker: boolean;
	cacheSize: number;
	interpolationSteps: number;
	enableModernCSS: boolean;
	fallbackColors: string[];
}

export interface ColorInterpolationOptions {
	steps: number;
	colorSpace: 'rgb' | 'hsl' | 'lab' | 'lch' | 'oklch';
	easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface ColorValidationResult {
	isValid: boolean;
	format: 'hex' | 'rgb' | 'hsl' | 'lab' | 'oklch' | 'unknown';
	normalized: string;
	error?: string;
}

const CONFIG: ColorConfig = {
	enableWebWorker: typeof Worker !== 'undefined',
	cacheSize: 500,
	interpolationSteps: 60,
	enableModernCSS: browser && CSS.supports('color', 'oklch(0.7 0.15 180)'),
	fallbackColors: ['#4a90e2', '#5ba3f5', '#7a9bc1', '#a8c8f0', '#2c5aa0']
};

class ColorCache {
	private cache = new Map<string, any>();
	private timestamps = new Map<string, number>();
	private readonly maxSize: number;
	private readonly ttl = 300000; // 5 minutes

	constructor(maxSize = CONFIG.cacheSize) {
		this.maxSize = maxSize;
	}

	get<T>(key: string): T | undefined {
		if (!this.cache.has(key)) return undefined;

		const timestamp = this.timestamps.get(key);
		if (timestamp && Date.now() - timestamp > this.ttl) {
			this.delete(key);
			return undefined;
		}

		return this.cache.get(key);
	}

	set(key: string, value: any): void {
		if (this.cache.size >= this.maxSize) {
			const oldestKey = this.getOldestKey();
			if (oldestKey) this.delete(oldestKey);
		}

		this.cache.set(key, value);
		this.timestamps.set(key, Date.now());
	}

	delete(key: string): boolean {
		this.timestamps.delete(key);
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
		this.timestamps.clear();
	}

	private getOldestKey(): string | undefined {
		let oldestKey: string | undefined;
		let oldestTime = Date.now();

		for (const [key, time] of this.timestamps) {
			if (time < oldestTime) {
				oldestTime = time;
				oldestKey = key;
			}
		}

		return oldestKey;
	}
}

class ColorWorkerManager {
	private worker: Worker | null = null;
	private readonly workerURL = this.createWorkerURL();

	private createWorkerURL(): string {
		const workerScript = `
			importScripts('https://cdnjs.cloudflare.com/ajax/libs/chroma-js/2.4.2/chroma.min.js');
			
			self.onmessage = function(e) {
				const { id, type, data } = e.data;
				
				try {
					let result;
					
					switch (type) {
						case 'interpolate':
							result = chroma.scale(data.colors)
								.mode(data.mode || 'lab')
								.colors(data.steps || 10);
							break;
						case 'palette':
							const base = chroma(data.color);
							result = {
								complementary: base.set('hsl.h', (base.get('hsl.h') + 180) % 360).hex(),
								triadic: [
									base.set('hsl.h', (base.get('hsl.h') + 120) % 360).hex(),
									base.set('hsl.h', (base.get('hsl.h') + 240) % 360).hex()
								],
								analogous: [
									base.set('hsl.h', (base.get('hsl.h') + 30) % 360).hex(),
									base.set('hsl.h', (base.get('hsl.h') - 30 + 360) % 360).hex()
								]
							};
							break;
						case 'deltaE':
							result = chroma.deltaE(data.color1, data.color2);
							break;
						default:
							throw new Error('Unknown operation type');
					}
					
					self.postMessage({ id, result });
				} catch (error) {
					self.postMessage({ id, error: error.message });
				}
			};
		`;

		return URL.createObjectURL(new Blob([workerScript], { type: 'application/javascript' }));
	}

	async initialize(): Promise<void> {
		if (!CONFIG.enableWebWorker || this.worker) return;

		try {
			this.worker = new Worker(this.workerURL);
		} catch (error) {
			console.warn('Failed to initialize color worker:', error);
			CONFIG.enableWebWorker = false;
		}
	}

	async processColors(type: string, data: any): Promise<any> {
		if (!this.worker) {
			return this.fallbackProcess(type, data);
		}

		return new Promise((resolve, reject) => {
			const id = Math.random().toString(36).substring(7);
			const timeout = setTimeout(() => reject(new Error('Worker timeout')), 5000);

			const handler = (e: MessageEvent) => {
				if (e.data.id === id) {
					clearTimeout(timeout);
					this.worker!.removeEventListener('message', handler);

					if (e.data.error) {
						reject(new Error(e.data.error));
					} else {
						resolve(e.data.result);
					}
				}
			};

			this.worker.addEventListener('message', handler);
			this.worker.postMessage({ id, type, data });
		});
	}

	private fallbackProcess(type: string, data: any): any {
		switch (type) {
			case 'interpolate':
				return chroma
					.scale(data.colors)
					.mode(data.mode || 'lab')
					.colors(data.steps || 10);
			case 'palette':
				const base = chroma(data.color);
				return {
					complementary: base.set('hsl.h', (base.get('hsl.h') + 180) % 360).hex(),
					triadic: [
						base.set('hsl.h', (base.get('hsl.h') + 120) % 360).hex(),
						base.set('hsl.h', (base.get('hsl.h') + 240) % 360).hex()
					],
					analogous: [
						base.set('hsl.h', (base.get('hsl.h') + 30) % 360).hex(),
						base.set('hsl.h', (base.get('hsl.h') - 30 + 360) % 360).hex()
					]
				};
			case 'deltaE':
				return chroma.deltaE(data.color1, data.color2);
			default:
				throw new Error('Unknown operation type');
		}
	}

	destroy(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		URL.revokeObjectURL(this.workerURL);
	}
}

const colorCache = new ColorCache();
const workerManager = new ColorWorkerManager();

export async function initializeColorSystem(): Promise<void> {
	if (!browser) return;

	await workerManager.initialize();
	detectColorFeatures();
}

export function clearColorCache(): void {
	colorCache.clear();
}

export function validateColor(color: string): ColorValidationResult {
	try {
		const normalized = chroma(color).hex();

		let format: ColorValidationResult['format'] = 'unknown';
		if (/^#[0-9a-f]{6}$/i.test(color)) format = 'hex';
		else if (color.startsWith('rgb')) format = 'rgb';
		else if (color.startsWith('hsl')) format = 'hsl';
		else if (color.startsWith('lab')) format = 'lab';
		else if (color.startsWith('oklch')) format = 'oklch';

		return { isValid: true, format, normalized };
	} catch (error) {
		return {
			isValid: false,
			format: 'unknown',
			normalized: CONFIG.fallbackColors[0],
			error: error instanceof Error ? error.message : 'Invalid color'
		};
	}
}

export async function interpolateColors(
	fromColor: string,
	toColor: string,
	options: Partial<ColorInterpolationOptions> = {}
): Promise<string[]> {
	const opts: ColorInterpolationOptions = {
		steps: CONFIG.interpolationSteps,
		colorSpace: 'lab',
		easing: 'ease-out',
		...options
	};

	const cacheKey = `interpolate_${fromColor}_${toColor}_${JSON.stringify(opts)}`;
	const cached = colorCache.get<string[]>(cacheKey);
	if (cached) return cached;

	try {
		const colors = await workerManager.processColors('interpolate', {
			colors: [fromColor, toColor],
			mode: opts.colorSpace,
			steps: opts.steps
		});

		const easedColors = applyEasing(colors, opts.easing);
		colorCache.set(cacheKey, easedColors);
		return easedColors;
	} catch (error) {
		console.warn('Color interpolation failed:', error);
		return [fromColor, toColor];
	}
}

function applyEasing(colors: string[], easing: string): string[] {
	if (easing === 'linear' || colors.length <= 2) return colors;

	const easingFunctions = {
		ease: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
		'ease-in': (t: number) => t * t,
		'ease-out': (t: number) => t * (2 - t),
		'ease-in-out': (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)
	};

	const easingFn = easingFunctions[easing as keyof typeof easingFunctions];
	if (!easingFn) return colors;

	const result: string[] = [];
	for (let i = 0; i < colors.length; i++) {
		const t = i / (colors.length - 1);
		const easedT = easingFn(t);
		const index = Math.round(easedT * (colors.length - 1));
		result.push(colors[Math.min(index, colors.length - 1)]);
	}

	return result;
}

export function setCSSColorProperties(palette: ColorPalette): void {
	if (!browser) return;

	const root = document.documentElement;
	const properties = {
		'--color-dominant': palette.dominant,
		'--color-vibrant': palette.vibrant,
		'--color-muted': palette.muted,
		'--color-light': palette.light,
		'--color-dark': palette.dark,
		'--color-accent': palette.accent,
		'--color-complementary': palette.complementary,
		'--color-triadic-1': palette.triadic[0],
		'--color-triadic-2': palette.triadic[1]
	};

	// Set basic properties
	for (const [prop, value] of Object.entries(properties)) {
		root.style.setProperty(prop, value);
	}

	// Generate alpha variants
	for (const [name, color] of Object.entries(properties)) {
		const baseName = name.replace('--color-', '');
		for (const alpha of [0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
			const alphaName = `--color-${baseName}-${Math.round(alpha * 100)}`;
			root.style.setProperty(alphaName, getAlphaVariant(color, alpha));
		}
	}

	// Modern CSS color features
	if (CONFIG.enableModernCSS) {
		setModernCSSProperties(palette);
	}
}

function setModernCSSProperties(palette: ColorPalette): void {
	const root = document.documentElement;

	try {
		// Convert to OKLCH for better perceptual uniformity
		const dominant = chroma(palette.dominant);
		const [l, c, h] = dominant.oklch();

		root.style.setProperty('--color-oklch-base', `oklch(${l} ${c} ${h})`);
		root.style.setProperty('--color-oklch-light', `oklch(${Math.min(1, l + 0.2)} ${c * 0.7} ${h})`);
		root.style.setProperty('--color-oklch-dark', `oklch(${Math.max(0, l - 0.2)} ${c * 1.2} ${h})`);

		// Color-mix for dynamic blending
		root.style.setProperty(
			'--color-blend-bg',
			`color-mix(in oklch, ${palette.dominant} 20%, transparent)`
		);
		root.style.setProperty(
			'--color-blend-text',
			`color-mix(in oklch, ${palette.dominant} 80%, white)`
		);
	} catch (error) {
		console.warn('Failed to set modern CSS properties:', error);
	}
}

export function getAlphaVariant(color: string, alpha: number): string {
	const cacheKey = `alpha_${color}_${alpha}`;
	const cached = colorCache.get<string>(cacheKey);
	if (cached) return cached;

	try {
		const result = chroma(color).alpha(alpha).css();
		colorCache.set(cacheKey, result);
		return result;
	} catch {
		const fallback = `rgba(74, 144, 226, ${alpha})`;
		colorCache.set(cacheKey, fallback);
		return fallback;
	}
}

export function blendColors(color1: string, color2: string, ratio = 0.5): string {
	const cacheKey = `blend_${color1}_${color2}_${ratio}`;
	const cached = colorCache.get<string>(cacheKey);
	if (cached) return cached;

	try {
		const result = chroma.mix(color1, color2, ratio, 'lab').hex();
		colorCache.set(cacheKey, result);
		return result;
	} catch {
		const fallback = ratio > 0.5 ? color2 : color1;
		colorCache.set(cacheKey, fallback);
		return fallback;
	}
}

export function getContrastRatio(fg: string, bg: string): number {
	const cacheKey = `contrast_${fg}_${bg}`;
	const cached = colorCache.get<number>(cacheKey);
	if (cached) return cached;

	try {
		const result = chroma.contrast(fg, bg);
		colorCache.set(cacheKey, result);
		return result;
	} catch {
		colorCache.set(cacheKey, 1);
		return 1;
	}
}

export function getOptimalTextColor(backgroundColor: string): string {
	const cacheKey = `text_${backgroundColor}`;
	const cached = colorCache.get<string>(cacheKey);
	if (cached) return cached;

	try {
		const bg = chroma(backgroundColor);
		const luminance = bg.luminance();
		const result = luminance > 0.5 ? '#000000' : '#ffffff';
		colorCache.set(cacheKey, result);
		return result;
	} catch {
		colorCache.set(cacheKey, '#ffffff');
		return '#ffffff';
	}
}

export async function getColorHarmony(baseColor: string): Promise<{
	complementary: string;
	triadic: string[];
	analogous: string[];
}> {
	const cacheKey = `harmony_${baseColor}`;
	const cached = colorCache.get<any>(cacheKey);
	if (cached) return cached;

	try {
		const result = await workerManager.processColors('palette', { color: baseColor });
		colorCache.set(cacheKey, result);
		return result;
	} catch (error) {
		console.warn('Color harmony generation failed:', error);
		const fallback = {
			complementary: baseColor,
			triadic: [baseColor, baseColor],
			analogous: [baseColor, baseColor]
		};
		colorCache.set(cacheKey, fallback);
		return fallback;
	}
}

export function generateGradient(colors: string[], direction = '45deg'): string {
	const validatedColors = colors.map((color) => validateColor(color).normalized);
	return `linear-gradient(${direction}, ${validatedColors.join(', ')})`;
}

export function generateRadialGradient(colors: string[], shape = 'circle'): string {
	const validatedColors = colors.map((color) => validateColor(color).normalized);
	return `radial-gradient(${shape}, ${validatedColors.join(', ')})`;
}

export async function pickColorFromScreen(): Promise<string | null> {
	if (!browser || !('EyeDropper' in window)) {
		console.warn('EyeDropper API not supported');
		return null;
	}

	try {
		const eyeDropper = new (window as any).EyeDropper();
		const result = await eyeDropper.open();
		return result.sRGBHex;
	} catch (error) {
		console.warn('Color picking failed:', error);
		return null;
	}
}

function detectColorFeatures(): void {
	if (!browser) return;

	const features = {
		colorMix: CSS.supports('color', 'color-mix(in srgb, red, blue)'),
		oklch: CSS.supports('color', 'oklch(0.7 0.15 180)'),
		p3: CSS.supports('color', 'color(display-p3 1 0 0)'),
		eyeDropper: 'EyeDropper' in window,
		hdr: window.screen && (window.screen as any).colorDepth > 24
	};

	console.log('Color features detected:', features);
	CONFIG.enableModernCSS = features.colorMix && features.oklch;
}

export function warmUpCache(palette: ColorPalette): void {
	// Pre-calculate common operations
	const colors = Object.values(palette).flat();

	colors.forEach((color) => {
		if (typeof color === 'string') {
			getOptimalTextColor(color);
			getAlphaVariant(color, 0.5);
			validateColor(color);
		}
	});
}

export const colorUtils = {
	cache: colorCache,
	worker: workerManager,
	config: CONFIG,
	initializeColorSystem,
	clearColorCache,
	validateColor,
	interpolateColors,
	setCSSColorProperties,
	getAlphaVariant,
	blendColors,
	getContrastRatio,
	getOptimalTextColor,
	getColorHarmony,
	generateGradient,
	generateRadialGradient,
	pickColorFromScreen,
	warmUpCache
};
