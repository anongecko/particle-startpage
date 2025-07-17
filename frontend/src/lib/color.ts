import { browser } from '$app/environment';
import { colorStore } from '$stores/color';
import { debounce, memoize } from './utils';

export interface ColorAnalysis {
	dominant: string;
	vibrant: string;
	muted: string;
	light: string;
	dark: string;
	accent: string;
	complementary: string;
	triadic: [string, string];
	luminance: number;
	saturation: number;
	temperature: 'warm' | 'cool' | 'neutral';
}

export interface ColorExtractionOptions {
	quality: 'fast' | 'balanced' | 'high';
	maxSize: number;
	sampleRate: number;
	useCache: boolean;
	generateHarmony: boolean;
}

export interface ColorDistance {
	euclidean: number;
	deltaE: number;
	perceptual: number;
}

const DEFAULT_OPTIONS: ColorExtractionOptions = {
	quality: 'balanced',
	maxSize: 64,
	sampleRate: 4,
	useCache: true,
	generateHarmony: true
};

const extractionCache = new Map<
	string,
	{ color: string; timestamp: number; analysis: ColorAnalysis }
>();
const CACHE_TTL = 300000; // 5 minutes
const MAX_CACHE_SIZE = 100;

export async function extractDominantColor(
	imagePath: string,
	options: Partial<ColorExtractionOptions> = {}
): Promise<string> {
	if (!browser || !imagePath) {
		return '#4a90e2';
	}

	const opts = { ...DEFAULT_OPTIONS, ...options };
	const cacheKey = `${imagePath}_${opts.quality}`;

	if (opts.useCache && extractionCache.has(cacheKey)) {
		const cached = extractionCache.get(cacheKey)!;
		if (Date.now() - cached.timestamp < CACHE_TTL) {
			return cached.color;
		}
		extractionCache.delete(cacheKey);
	}

	try {
		const color = await colorStore.extractFromImage(imagePath, opts);

		if (opts.useCache) {
			const analysis = await analyzeColor(color);
			updateCache(cacheKey, color, analysis);
		}

		return color;
	} catch (error) {
		console.warn('Color extraction failed:', error);
		return generateFallbackColor(imagePath);
	}
}

export async function analyzeColor(color: string): Promise<ColorAnalysis> {
	try {
		const rgb = hexToRgb(color);
		if (!rgb) throw new Error('Invalid color format');

		const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
		const luminance = calculateLuminance(rgb.r, rgb.g, rgb.b);
		const temperature = getColorTemperature(hsl.h);

		return {
			dominant: color,
			vibrant: adjustSaturation(color, 0.8),
			muted: adjustSaturation(color, 0.3),
			light: adjustLightness(color, 0.8),
			dark: adjustLightness(color, 0.2),
			accent: getComplementaryColor(color),
			complementary: getComplementaryColor(color),
			triadic: getTriadicColors(color),
			luminance,
			saturation: hsl.s / 100,
			temperature
		};
	} catch (error) {
		console.warn('Color analysis failed:', error);
		return createDefaultAnalysis(color);
	}
}

export function getContrastColor(backgroundColor: string, threshold: number = 0.5): string {
	try {
		const rgb = hexToRgb(backgroundColor);
		if (!rgb) return '#ffffff';

		const luminance = calculateLuminance(rgb.r, rgb.g, rgb.b);
		return luminance > threshold ? '#000000' : '#ffffff';
	} catch {
		return '#ffffff';
	}
}

export function getColorHarmony(
	baseColor: string,
	type: 'complementary' | 'triadic' | 'analogous' | 'split' = 'complementary'
): string[] {
	try {
		const hsl = hexToHsl(baseColor);
		if (!hsl) return [baseColor];

		switch (type) {
			case 'complementary':
				return [getComplementaryColor(baseColor)];

			case 'triadic':
				return getTriadicColors(baseColor);

			case 'analogous':
				return getAnalogousColors(baseColor);

			case 'split':
				return getSplitComplementaryColors(baseColor);

			default:
				return [baseColor];
		}
	} catch {
		return [baseColor];
	}
}

export function calculateColorDistance(color1: string, color2: string): ColorDistance {
	try {
		const rgb1 = hexToRgb(color1);
		const rgb2 = hexToRgb(color2);

		if (!rgb1 || !rgb2) {
			return { euclidean: 0, deltaE: 0, perceptual: 0 };
		}

		const euclidean = Math.sqrt(
			Math.pow(rgb2.r - rgb1.r, 2) + Math.pow(rgb2.g - rgb1.g, 2) + Math.pow(rgb2.b - rgb1.b, 2)
		);

		const lab1 = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
		const lab2 = rgbToLab(rgb2.r, rgb2.g, rgb2.b);

		const deltaE = Math.sqrt(
			Math.pow(lab2.l - lab1.l, 2) + Math.pow(lab2.a - lab1.a, 2) + Math.pow(lab2.b - lab1.b, 2)
		);

		const perceptual = calculatePerceptualDistance(rgb1, rgb2);

		return {
			euclidean: euclidean / (Math.sqrt(3) * 255),
			deltaE: deltaE / 100,
			perceptual
		};
	} catch {
		return { euclidean: 0, deltaE: 0, perceptual: 0 };
	}
}

export function blendColors(color1: string, color2: string, ratio: number = 0.5): string {
	try {
		const rgb1 = hexToRgb(color1);
		const rgb2 = hexToRgb(color2);

		if (!rgb1 || !rgb2) return color1;

		const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * ratio);
		const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * ratio);
		const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * ratio);

		return rgbToHex(r, g, b);
	} catch {
		return color1;
	}
}

export function adjustColorBrightness(color: string, amount: number): string {
	try {
		const rgb = hexToRgb(color);
		if (!rgb) return color;

		const r = Math.max(0, Math.min(255, rgb.r + amount * 255));
		const g = Math.max(0, Math.min(255, rgb.g + amount * 255));
		const b = Math.max(0, Math.min(255, rgb.b + amount * 255));

		return rgbToHex(r, g, b);
	} catch {
		return color;
	}
}

export function adjustSaturation(color: string, saturation: number): string {
	try {
		const hsl = hexToHsl(color);
		if (!hsl) return color;

		return hslToHex(hsl.h, saturation * 100, hsl.l);
	} catch {
		return color;
	}
}

export function adjustLightness(color: string, lightness: number): string {
	try {
		const hsl = hexToHsl(color);
		if (!hsl) return color;

		return hslToHex(hsl.h, hsl.s, lightness * 100);
	} catch {
		return color;
	}
}

export const debouncedExtractColor = debounce(extractDominantColor, 150);

export const memoizedColorAnalysis = memoize(analyzeColor, {
	maxSize: 50,
	ttl: 300000,
	keyFn: (color: string) => color
});

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			}
		: null;
}

function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (c: number) =>
		Math.round(Math.max(0, Math.min(255, c)))
			.toString(16)
			.padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
	const rgb = hexToRgb(hex);
	return rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null;
}

function hslToHex(h: number, s: number, l: number): string {
	const hsl = hslToRgb(h, s, l);
	return rgbToHex(hsl.r, hsl.g, hsl.b);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	h /= 360;
	s /= 100;
	l /= 100;

	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};

	let r, g, b;

	if (s === 0) {
		r = g = b = l;
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}

	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255)
	};
}

function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
	let x = (r / 255) * 100;
	let y = (g / 255) * 100;
	let z = (b / 255) * 100;

	x = x > 8.856 ? Math.pow(x / 100, 1 / 3) : (7.787 * x) / 100 + 16 / 116;
	y = y > 8.856 ? Math.pow(y / 100, 1 / 3) : (7.787 * y) / 100 + 16 / 116;
	z = z > 8.856 ? Math.pow(z / 100, 1 / 3) : (7.787 * z) / 100 + 16 / 116;

	const l = 116 * y - 16;
	const a = 500 * (x - y);
	const b_val = 200 * (y - z);

	return { l, a, b: b_val };
}

function calculateLuminance(r: number, g: number, b: number): number {
	const [rs, gs, bs] = [r, g, b].map((c) => {
		c = c / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function calculatePerceptualDistance(
	rgb1: { r: number; g: number; b: number },
	rgb2: { r: number; g: number; b: number }
): number {
	const rMean = (rgb1.r + rgb2.r) / 2;
	const deltaR = rgb1.r - rgb2.r;
	const deltaG = rgb1.g - rgb2.g;
	const deltaB = rgb1.b - rgb2.b;

	const weightR = 2 + rMean / 256;
	const weightG = 4;
	const weightB = 2 + (255 - rMean) / 256;

	return (
		Math.sqrt(weightR * deltaR * deltaR + weightG * deltaG * deltaG + weightB * deltaB * deltaB) /
		765
	);
}

function getColorTemperature(hue: number): 'warm' | 'cool' | 'neutral' {
	if ((hue >= 0 && hue <= 60) || (hue >= 300 && hue <= 360)) return 'warm';
	if (hue >= 180 && hue <= 270) return 'cool';
	return 'neutral';
}

function getComplementaryColor(color: string): string {
	const hsl = hexToHsl(color);
	if (!hsl) return color;
	return hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l);
}

function getTriadicColors(color: string): [string, string] {
	const hsl = hexToHsl(color);
	if (!hsl) return [color, color];
	return [hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l), hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l)];
}

function getAnalogousColors(color: string): string[] {
	const hsl = hexToHsl(color);
	if (!hsl) return [color];
	return [
		hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l),
		hslToHex((hsl.h - 30 + 360) % 360, hsl.s, hsl.l)
	];
}

function getSplitComplementaryColors(color: string): string[] {
	const hsl = hexToHsl(color);
	if (!hsl) return [color];
	return [hslToHex((hsl.h + 150) % 360, hsl.s, hsl.l), hslToHex((hsl.h + 210) % 360, hsl.s, hsl.l)];
}

function generateFallbackColor(imagePath: string): string {
	const hash = imagePath.split('').reduce((a, b) => {
		a = (a << 5) - a + b.charCodeAt(0);
		return a & a;
	}, 0);

	const hue = Math.abs(hash) % 360;
	return hslToHex(hue, 60, 50);
}

function updateCache(key: string, color: string, analysis: ColorAnalysis): void {
	if (extractionCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = extractionCache.keys().next().value;
		extractionCache.delete(oldestKey);
	}

	extractionCache.set(key, {
		color,
		timestamp: Date.now(),
		analysis
	});
}

function createDefaultAnalysis(color: string): ColorAnalysis {
	return {
		dominant: color,
		vibrant: color,
		muted: color,
		light: color,
		dark: color,
		accent: color,
		complementary: color,
		triadic: [color, color],
		luminance: 0.5,
		saturation: 0.5,
		temperature: 'neutral'
	};
}

export function clearColorCache(): void {
	extractionCache.clear();
}

export function getColorCacheStats(): { size: number; maxSize: number; ttl: number } {
	return {
		size: extractionCache.size,
		maxSize: MAX_CACHE_SIZE,
		ttl: CACHE_TTL
	};
}
