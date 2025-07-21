<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, elasticOut, backOut, expoOut } from 'svelte/easing';
	import { colorStore } from '$stores/color';
	import { extractDominantColor } from '$lib/color';
	
	interface Props {
		value?: string;
		opacity?: number;
		showOpacity?: boolean;
		showEyedropper?: boolean;
		showHarmony?: boolean;
		autoHarmony?: boolean;
		wallpaperImage?: string;
		size?: 'small' | 'medium' | 'large';
		label?: string;
		dominantColor?: string;
		livePreview?: boolean;
	}
	
	let {
		value = '#4a90e2',
		opacity = 1,
		showOpacity = true,
		showEyedropper = true,
		showHarmony = true,
		autoHarmony = false,
		wallpaperImage = '',
		size = 'medium',
		label = '',
		dominantColor = '#4a90e2',
		livePreview = true
	}: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let colorWheelCanvas: HTMLCanvasElement = $state();
	let colorWheelContainer: HTMLElement = $state();
	let harmonyContainer: HTMLElement = $state();
	let previewElement: HTMLElement = $state();
	let isDragging = $state(false);
	let isEyedropperActive = $state(false);
	let eyedropperSupported = $state(false);
	let hexInput = $state(value);
	let harmonyColors = $state([]);
	let selectedHarmonyIndex = $state(-1);
	let isHovered = $state(false);
	let activeHarmonyType = $state('complementary');
	
	// Color wheel state
	let hue = $state(0);
	let saturation = $state(100);
	let lightness = $state(50);
	let wheelRadius = $state(0);
	let wheelCenter = $state({ x: 0, y: 0 });
	let currentColorPosition = $state({ x: 0, y: 0 });
	
	// Animation states
	const pickerScale = spring(1, { stiffness: 0.3, damping: 0.8 });
	const harmonyOpacity = tweened(0, { duration: 400, easing: cubicOut });
	const previewScale = spring(1, { stiffness: 0.4, damping: 0.9 });
	const wheelGlow = tweened(0, { duration: 300, easing: cubicOut });
	const colorTransition = tweened(0, { duration: 200, easing: cubicOut });
	const harmonyReveal = tweened(0, { duration: 500, easing: backOut });
	
	// Size configurations
	const sizeConfig = {
		small: { wheel: 140, preview: 36, spacing: 12, padding: 16 },
		medium: { wheel: 180, preview: 44, spacing: 16, padding: 20 },
		large: { wheel: 220, preview: 52, spacing: 20, padding: 24 }
	};
	
	let config = $derived(sizeConfig[size]);
	let currentColor = $derived(hslToHex(hue, saturation, lightness));
	let rgbaValue = $derived(hexToRgba(currentColor, opacity));
	let gradientColors = $derived(getGradientColors());
	let textColor = $derived(getContrastColor(dominantColor));
	let isLightTheme = $derived(getContrastColor(dominantColor) === '#1a1a1a');
	
	interface ColorHarmony {
		name: string;
		colors: string[];
		description: string;
		icon: string;
	}
	
	const harmonyTypes: ColorHarmony[] = [
		{
			name: 'Complementary',
			colors: [],
			description: 'Opposite colors on the wheel',
			icon: '⚡'
		},
		{
			name: 'Triadic',
			colors: [],
			description: 'Three evenly spaced colors',
			icon: '🔺'
		},
		{
			name: 'Analogous', 
			colors: [],
			description: 'Adjacent colors on the wheel',
			icon: '🌊'
		},
		{
			name: 'Split Complementary',
			colors: [],
			description: 'Base color plus two adjacent to complement',
			icon: '✨'
		},
		{
			name: 'Tetradic',
			colors: [],
			description: 'Four colors forming a rectangle',
			icon: '⬜'
		}
	];
	
	function getGradientColors(): { primary: string; secondary: string; rgb: string } {
		const rgb = hexToRgb(dominantColor);
		if (!rgb) return { 
			primary: '#4a90e2', 
			secondary: '#357abd',
			rgb: '74, 144, 226'
		};
		
		const primary = dominantColor;
		const secondary = `rgb(${Math.max(0, rgb.r - 40)}, ${Math.max(0, rgb.g - 40)}, ${Math.max(0, rgb.b - 40)})`;
		const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
		
		return { primary, secondary, rgb: rgbString };
	}
	
	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	}
	
	function getContrastColor(backgroundColor: string): string {
		const rgb = hexToRgb(backgroundColor);
		if (!rgb) return '#ffffff';
		
		const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
		return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
	}
	
	function updateFromValue() {
		const hsl = hexToHsl(value);
		if (hsl) {
			hue = hsl.h;
			saturation = hsl.s;
			lightness = hsl.l;
			hexInput = value;
			drawColorWheel();
			updateColorPosition();
		}
	}
	
	function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) return null;
		
		const r = parseInt(result[1], 16) / 255;
		const g = parseInt(result[2], 16) / 255;
		const b = parseInt(result[3], 16) / 255;
		
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const diff = max - min;
		
		let h = 0;
		let s = 0;
		const l = (max + min) / 2;
		
		if (diff !== 0) {
			s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
			
			switch (max) {
				case r: h = (g - b) / diff + (g < b ? 6 : 0); break;
				case g: h = (b - r) / diff + 2; break;
				case b: h = (r - g) / diff + 4; break;
			}
			h /= 6;
		}
		
		return {
			h: Math.round(h * 360),
			s: Math.round(s * 100),
			l: Math.round(l * 100)
		};
	}
	
	function hslToHex(h: number, s: number, l: number): string {
		h = h % 360;
		s = Math.max(0, Math.min(100, s)) / 100;
		l = Math.max(0, Math.min(100, l)) / 100;
		
		const c = (1 - Math.abs(2 * l - 1)) * s;
		const x = c * (1 - Math.abs((h / 60) % 2 - 1));
		const m = l - c / 2;
		
		let r = 0, g = 0, b = 0;
		
		if (0 <= h && h < 60) {
			r = c; g = x; b = 0;
		} else if (60 <= h && h < 120) {
			r = x; g = c; b = 0;
		} else if (120 <= h && h < 180) {
			r = 0; g = c; b = x;
		} else if (180 <= h && h < 240) {
			r = 0; g = x; b = c;
		} else if (240 <= h && h < 300) {
			r = x; g = 0; b = c;
		} else if (300 <= h && h < 360) {
			r = c; g = 0; b = x;
		}
		
		r = Math.round((r + m) * 255);
		g = Math.round((g + m) * 255);
		b = Math.round((b + m) * 255);
		
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}
	
	function hexToRgba(hex: string, alpha: number): string {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) return 'rgba(255, 255, 255, 1)';
		
		const r = parseInt(result[1], 16);
		const g = parseInt(result[2], 16);
		const b = parseInt(result[3], 16);
		
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	
	function drawColorWheel() {
		if (!colorWheelCanvas || !browser) return;
		
		const ctx = colorWheelCanvas.getContext('2d');
		if (!ctx) return;
		
		const size = config.wheel;
		const center = size / 2;
		const radius = (size - 24) / 2;
		
		wheelRadius = radius;
		wheelCenter = { x: center, y: center };
		
		ctx.clearRect(0, 0, size, size);
		
		// Create radial gradient for smoother colors
		for (let angle = 0; angle < 360; angle += 0.5) {
			const startAngle = (angle - 0.25) * Math.PI / 180;
			const endAngle = (angle + 0.25) * Math.PI / 180;
			
			const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
			gradient.addColorStop(0, hslToHex(angle, 0, lightness));
			gradient.addColorStop(1, hslToHex(angle, 100, lightness));
			
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.moveTo(center, center);
			ctx.arc(center, center, radius, startAngle, endAngle);
			ctx.closePath();
			ctx.fill();
		}
		
		// Add subtle inner shadow
		const shadowGradient = ctx.createRadialGradient(center, center, radius - 5, center, center, radius);
		shadowGradient.addColorStop(0, 'transparent');
		shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
		ctx.fillStyle = shadowGradient;
		ctx.beginPath();
		ctx.arc(center, center, radius, 0, 2 * Math.PI);
		ctx.fill();
		
		updateColorPosition();
	}
	
	function updateColorPosition() {
		const currentAngle = (hue / 360) * 2 * Math.PI - Math.PI;
		const currentRadius = (saturation / 100) * wheelRadius;
		currentColorPosition = {
			x: wheelCenter.x + Math.cos(currentAngle) * currentRadius,
			y: wheelCenter.y + Math.sin(currentAngle) * currentRadius
		};
	}
	
	function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
		h = h % 360;
		s = s / 100;
		l = l / 100;
		
		const c = (1 - Math.abs(2 * l - 1)) * s;
		const x = c * (1 - Math.abs((h / 60) % 2 - 1));
		const m = l - c / 2;
		
		let r = 0, g = 0, b = 0;
		
		if (0 <= h && h < 60) {
			r = c; g = x; b = 0;
		} else if (60 <= h && h < 120) {
			r = x; g = c; b = 0;
		} else if (120 <= h && h < 180) {
			r = 0; g = c; b = x;
		} else if (180 <= h && h < 240) {
			r = 0; g = x; b = c;
		} else if (240 <= h && h < 300) {
			r = x; g = 0; b = c;
		} else if (300 <= h && h < 360) {
			r = c; g = 0; b = x;
		}
		
		return {
			r: Math.round((r + m) * 255),
			g: Math.round((g + m) * 255),
			b: Math.round((b + m) * 255)
		};
	}
	
	function handleWheelClick(event: MouseEvent) {
		if (!colorWheelCanvas) return;
		
		const rect = colorWheelCanvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		
		updateColorFromPosition(x, y);
		isDragging = true;
		
		// Visual feedback
		wheelGlow.set(1).then(() => {
			setTimeout(() => wheelGlow.set(0), 300);
		});
	}
	
	function handleWheelMove(event: MouseEvent) {
		if (!isDragging || !colorWheelCanvas) return;
		
		const rect = colorWheelCanvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		
		updateColorFromPosition(x, y);
	}
	
	function handleWheelUp() {
		isDragging = false;
	}
	
	function handleWheelKeyDown(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 1;
		let changed = false;
		
		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				saturation = Math.min(100, saturation + step);
				changed = true;
				break;
			case 'ArrowDown':
				event.preventDefault();
				saturation = Math.max(0, saturation - step);
				changed = true;
				break;
			case 'ArrowLeft':
				event.preventDefault();
				hue = (hue - step + 360) % 360;
				changed = true;
				break;
			case 'ArrowRight':
				event.preventDefault();
				hue = (hue + step) % 360;
				changed = true;
				break;
		}
		
		if (changed) {
			updateColor();
			drawColorWheel();
		}
	}
	
	function updateColorFromPosition(x: number, y: number) {
		const dx = x - wheelCenter.x;
		const dy = y - wheelCenter.y;
		const distance = Math.sqrt(dx * dx + dy * dy);
		
		if (distance <= wheelRadius) {
			const angle = Math.atan2(dy, dx);
			hue = ((angle + Math.PI) / (2 * Math.PI) * 360) % 360;
			saturation = Math.min(100, (distance / wheelRadius) * 100);
			
			updateColor();
			drawColorWheel();
		}
	}
	
	function updateColor() {
		const newColor = hslToHex(hue, saturation, lightness);
		value = newColor;
		hexInput = newColor;
		
		// Live preview effect
		if (livePreview) {
			colorTransition.set(1).then(() => {
				setTimeout(() => colorTransition.set(0), 200);
			});
		}
		
		dispatch('change', {
			color: newColor,
			opacity: opacity,
			rgba: rgbaValue,
			hsl: { h: hue, s: saturation, l: lightness }
		});
		
		if (showHarmony) {
			generateColorHarmony();
		}
	}
	
	function handleHexInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const cleanHex = target.value.replace(/[^0-9a-fA-F#]/g, '');
		
		if (cleanHex.match(/^#?[0-9a-fA-F]{6}$/)) {
			const normalizedHex = cleanHex.startsWith('#') ? cleanHex : `#${cleanHex}`;
			const hsl = hexToHsl(normalizedHex);
			
			if (hsl) {
				hue = hsl.h;
				saturation = hsl.s;
				lightness = hsl.l;
				value = normalizedHex;
				hexInput = normalizedHex;
				updateColor();
				drawColorWheel();
			}
		}
	}
	
	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		opacity = parseFloat(target.value);
		
		dispatch('change', {
			color: value,
			opacity: opacity,
			rgba: rgbaValue,
			hsl: { h: hue, s: saturation, l: lightness }
		});
	}
	
	function handleLightnessChange(event: Event) {
		const target = event.target as HTMLInputElement;
		lightness = parseInt(target.value);
		updateColor();
		drawColorWheel();
	}
	
	async function startEyedropper() {
		if (!eyedropperSupported) return;
		
		try {
			isEyedropperActive = true;
			pickerScale.set(0.95);
			
			// @ts-ignore - EyeDropper is not in TypeScript yet
			const eyeDropper = new EyeDropper();
			const result = await eyeDropper.open();
			
			if (result?.sRGBHex) {
				const hsl = hexToHsl(result.sRGBHex);
				if (hsl) {
					hue = hsl.h;
					saturation = hsl.s;
					lightness = hsl.l;
					value = result.sRGBHex;
					hexInput = result.sRGBHex;
					updateColor();
					drawColorWheel();
					
					// Visual feedback
					previewScale.set(1.15).then(() => previewScale.set(1));
				}
			}
		} catch (error) {
			console.warn('Eyedropper failed:', error);
		} finally {
			isEyedropperActive = false;
			pickerScale.set(1);
		}
	}
	
	function generateColorHarmony() {
		const harmonies = harmonyTypes.map(type => {
			let colors: string[] = [];
			
			switch (type.name) {
				case 'Complementary':
					colors = [
						hslToHex(hue, saturation, lightness),
						hslToHex((hue + 180) % 360, saturation, lightness)
					];
					break;
				case 'Triadic':
					colors = [
						hslToHex(hue, saturation, lightness),
						hslToHex((hue + 120) % 360, saturation, lightness),
						hslToHex((hue + 240) % 360, saturation, lightness)
					];
					break;
				case 'Analogous':
					colors = [
						hslToHex((hue - 30 + 360) % 360, saturation, lightness),
						hslToHex(hue, saturation, lightness),
						hslToHex((hue + 30) % 360, saturation, lightness),
						hslToHex((hue + 60) % 360, saturation, lightness)
					];
					break;
				case 'Split Complementary':
					colors = [
						hslToHex(hue, saturation, lightness),
						hslToHex((hue + 150) % 360, saturation, lightness),
						hslToHex((hue + 210) % 360, saturation, lightness)
					];
					break;
				case 'Tetradic':
					colors = [
						hslToHex(hue, saturation, lightness),
						hslToHex((hue + 90) % 360, saturation, lightness),
						hslToHex((hue + 180) % 360, saturation, lightness),
						hslToHex((hue + 270) % 360, saturation, lightness)
					];
					break;
			}
			
			return { ...type, colors };
		});
		
		const activeHarmony = harmonies.find(h => h.name.toLowerCase().includes(activeHarmonyType));
		harmonyColors = activeHarmony ? activeHarmony.colors : harmonies[0].colors;
		
		harmonyOpacity.set(1);
		harmonyReveal.set(1);
	}
	
	async function generateWallpaperHarmony() {
		if (!wallpaperImage) return;
		
		try {
			const dominantWallpaperColor = await extractDominantColor(wallpaperImage);
			const hsl = hexToHsl(dominantWallpaperColor);
			
			if (hsl) {
				// Generate a complementary harmony based on wallpaper
				const harmonyHue = (hsl.h + 120) % 360;
				const newColor = hslToHex(harmonyHue, Math.min(hsl.s + 15, 100), Math.max(hsl.l - 5, 15));
				
				hue = harmonyHue;
				saturation = Math.min(hsl.s + 15, 100);
				lightness = Math.max(hsl.l - 5, 15);
				value = newColor;
				hexInput = newColor;
				
				updateColor();
				drawColorWheel();
			}
		} catch (error) {
			console.warn('Failed to generate wallpaper harmony:', error);
		}
	}
	
	function selectHarmonyColor(color: string, index: number) {
		selectedHarmonyIndex = index;
		previewScale.set(1.2).then(() => previewScale.set(1));
		
		const hsl = hexToHsl(color);
		if (hsl) {
			hue = hsl.h;
			saturation = hsl.s;
			lightness = hsl.l;
			value = color;
			hexInput = color;
			updateColor();
			drawColorWheel();
		}
	}
	
	function switchHarmonyType(type: string) {
		activeHarmonyType = type;
		generateColorHarmony();
		harmonyReveal.set(0).then(() => {
			setTimeout(() => harmonyReveal.set(1), 100);
		});
	}
	
	function copyColorToClipboard(color: string = value) {
		navigator.clipboard?.writeText(color).then(() => {
			previewScale.set(1.1).then(() => previewScale.set(1));
		}).catch(err => {
			console.warn('Failed to copy color:', err);
		});
	}
	
	onMount(() => {
		if (!browser) return;
		
		// Check eyedropper support
		// @ts-ignore
		eyedropperSupported = 'EyeDropper' in window;
		
		// Initialize color wheel
		updateFromValue();
		
		// Set up canvas
		if (colorWheelCanvas) {
			colorWheelCanvas.width = config.wheel;
			colorWheelCanvas.height = config.wheel;
			drawColorWheel();
		}
		
		// Generate initial harmony
		if (showHarmony) {
			generateColorHarmony();
		}
		
		// Event listeners
		document.addEventListener('mousemove', handleWheelMove);
		document.addEventListener('mouseup', handleWheelUp);
		
		return () => {
			document.removeEventListener('mousemove', handleWheelMove);
			document.removeEventListener('mouseup', handleWheelUp);
		};
	});
	
	onDestroy(() => {
		if (browser) {
			document.removeEventListener('mousemove', handleWheelMove);
			document.removeEventListener('mouseup', handleWheelUp);
		}
	});
	
	$effect(() => {
		if (currentColor !== value && !isDragging) {
			updateFromValue();
		}
	});
	
	$effect(() => {
		if (wallpaperImage && autoHarmony) {
			generateWallpaperHarmony();
		}
	});
</script>

<div 
	class="color-picker"
	class:size-small={size === 'small'}
	class:size-medium={size === 'medium'}
	class:size-large={size === 'large'}
	class:is-hovered={isHovered}
	class:is-light-theme={isLightTheme}
	style:transform="scale({$pickerScale})"
	style:--primary-rgb={gradientColors.rgb}
	style:--primary-color={gradientColors.primary}
	style:--secondary-color={gradientColors.secondary}
	style:--text-color={textColor}
	style:--wheel-glow={$wheelGlow}
	style:--color-transition={$colorTransition}
	style:--harmony-reveal={$harmonyReveal}
	onmouseenter={() => isHovered = true}
	onmouseleave={() => isHovered = false}
>
	{#if label}
		<div class="picker-header">
			<label for="color-picker-hex" class="picker-label">{label}</label>
			<div class="quick-actions">
				<button
					class="quick-action-btn"
					onclick={() => copyColorToClipboard()}
					title="Copy color to clipboard"
					aria-label="Copy current color to clipboard"
					type="button"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
					</svg>
				</button>
			</div>
		</div>
	{/if}
	
	<div class="picker-content">
		<!-- Color Wheel Section -->
		<div class="wheel-section">
			<div 
				class="color-wheel-container" 
				bind:this={colorWheelContainer}
				style:width="{config.wheel}px"
				style:height="{config.wheel}px"
			>
				<canvas
					bind:this={colorWheelCanvas}
					class="color-wheel"
					onmousedown={handleWheelClick}
					onkeydown={handleWheelKeyDown}
					role="slider"
					aria-label="Color wheel - use arrow keys or click and drag to select color"
					aria-valuenow={hue}
					aria-valuemin="0"
					aria-valuemax="360"
					aria-valuetext="Hue {hue} degrees, Saturation {saturation}%, Lightness {lightness}%"
					tabindex="0"
				/>
				
				<!-- Color indicator with enhanced styling -->
				<div 
					class="color-indicator"
					style:left="{currentColorPosition.x}px"
					style:top="{currentColorPosition.y}px"
					style:background-color={currentColor}
				>
					<div class="indicator-ring"></div>
					<div class="indicator-dot"></div>
				</div>
				
				<!-- Wheel glow effect -->
				<div class="wheel-glow-effect"></div>
			</div>
			
			<!-- Lightness Slider -->
			<div class="lightness-control">
				<label for="lightness-slider" class="control-label">
					Lightness
					<span class="control-value">{lightness}%</span>
				</label>
				<input
					id="lightness-slider"
					type="range"
					min="0"
					max="100"
					bind:value={lightness}
					oninput={handleLightnessChange}
					class="modern-slider lightness-slider"
					style:background="linear-gradient(to right, 
						{hslToHex(hue, saturation, 0)}, 
						{hslToHex(hue, saturation, 50)}, 
						{hslToHex(hue, saturation, 100)})"
					aria-label="Adjust color lightness"
				/>
			</div>
		</div>
		
		<!-- Controls Section -->
		<div class="controls-section">
			<!-- Color Preview -->
			<div 
				class="color-preview-container"
				onclick={() => copyColorToClipboard()}
				title="Click to copy color"
				role="button"
				tabindex="0"
			>
				<div 
					bind:this={previewElement}
					class="color-preview"
					style:background={rgbaValue}
					style:transform="scale({$previewScale})"
				>
					<div class="preview-checker-pattern"></div>
					<div class="preview-transition-effect"></div>
				</div>
				<div class="preview-label">
					<span class="preview-hex">{value}</span>
					<span class="preview-rgba">rgba({hexToRgb(value)?.r}, {hexToRgb(value)?.g}, {hexToRgb(value)?.b}, {opacity.toFixed(2)})</span>
				</div>
			</div>
			
			<!-- Input Controls -->
			<div class="input-controls">
				<div class="hex-input-group">
					<label for="color-picker-hex" class="control-label">Hex Color</label>
					<input
						id="color-picker-hex"
						type="text"
						bind:value={hexInput}
						oninput={handleHexInput}
						onblur={handleHexInput}
						class="hex-input"
						placeholder="#ffffff"
						maxlength="7"
						aria-label="Hex color code input"
					/>
				</div>
				
				{#if showOpacity}
					<div class="opacity-control">
						<label for="opacity-slider" class="control-label">
							Opacity
							<span class="control-value">{Math.round(opacity * 100)}%</span>
						</label>
						<input
							id="opacity-slider"
							type="range"
							min="0"
							max="1"
							step="0.01"
							bind:value={opacity}
							oninput={handleOpacityChange}
							class="modern-slider opacity-slider"
							aria-label="Adjust color opacity"
						/>
					</div>
				{/if}
			</div>
			
			<!-- Action Buttons -->
			<div class="action-buttons">
				{#if showEyedropper && eyedropperSupported}
					<button
						class="action-btn eyedropper-btn"
						class:active={isEyedropperActive}
						onclick={startEyedropper}
						title="Pick color from screen"
						aria-label="Eyedropper tool - pick color from screen"
						type="button"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="m2 22 1-1h3l9-9"/>
							<path d="M3 21v-3l9-9"/>
							<path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>
						</svg>
						{#if isEyedropperActive}
							<div class="loading-spinner"></div>
						{/if}
					</button>
				{/if}
				
				<button
					class="action-btn copy-btn"
					onclick={() => copyColorToClipboard()}
					title="Copy color to clipboard"
					aria-label="Copy current color to clipboard"
					type="button"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
					</svg>
				</button>
			</div>
		</div>
		
		<!-- Color Harmony Section -->
		{#if showHarmony && harmonyColors.length > 0}
			<div 
				class="harmony-section" 
				bind:this={harmonyContainer}
				style:opacity={$harmonyOpacity}
			>
				<div class="harmony-header">
					<h4 class="harmony-title">Color Harmony</h4>
					<div class="harmony-type-selector">
						{#each harmonyTypes.slice(0, 4) as type}
							<button
								class="harmony-type-btn"
								class:active={activeHarmonyType === type.name.toLowerCase()}
								onclick={() => switchHarmonyType(type.name.toLowerCase())}
								title={type.description}
								aria-label="Switch to {type.name} harmony"
								type="button"
							>
								{type.icon}
							</button>
						{/each}
					</div>
				</div>
				
				<div 
					class="harmony-colors"
					style:transform="scale({$harmonyReveal})"
				>
					{#each harmonyColors as color, index}
						<button
							class="harmony-color"
							class:selected={selectedHarmonyIndex === index}
							style:background-color={color}
							onclick={() => selectHarmonyColor(color, index)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									selectHarmonyColor(color, index);
								}
							}}
							title="Use harmony color: {color}"
							aria-label="Harmony color {index + 1}: {color}"
							type="button"
							tabindex="0"
						>
							{#if selectedHarmonyIndex === index}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<polyline points="20,6 9,17 4,12"/>
								</svg>
							{/if}
							<div class="harmony-color-tooltip">{color}</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
		
		<!-- Wallpaper Auto Harmony -->
		{#if wallpaperImage}
			<div class="wallpaper-harmony">
				<label class="auto-harmony-label">
					<input 
						type="checkbox" 
						bind:checked={autoHarmony}
						onchange={() => {
							if (autoHarmony) generateWallpaperHarmony();
						}}
						class="modern-checkbox"
					/>
					<span>Auto-generate from wallpaper</span>
				</label>
			</div>
		{/if}
	</div>
</div>

<style>
	.color-picker {
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.1) 0%, 
			rgba(255, 255, 255, 0.05) 100%);
		backdrop-filter: blur(20px) saturate(1.2);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 20px;
		padding: var(--picker-padding, 20px);
		user-select: none;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		overflow: hidden;
		box-shadow: 
			0 8px 32px rgba(0, 0, 0, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}
	
	.color-picker::before {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 100px;
		height: 100px;
		background: radial-gradient(circle at center, 
			rgba(var(--primary-rgb), calc(var(--color-transition) * 0.3)) 0%,
			rgba(var(--primary-rgb), calc(var(--color-transition) * 0.1)) 50%,
			transparent 100%);
		border-radius: 50%;
		pointer-events: none;
		transition: all 0.3s ease;
	}
	
	.color-picker.is-hovered {
		border-color: rgba(var(--primary-rgb), 0.25);
		box-shadow: 
			0 12px 40px rgba(0, 0, 0, 0.15),
			0 0 0 1px rgba(var(--primary-rgb), 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.15);
	}
	
	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}
	
	.picker-label {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-color);
		margin: 0;
		letter-spacing: -0.01em;
	}
	
	.quick-actions {
		display: flex;
		gap: 8px;
	}
	
	.quick-action-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		padding: 6px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.quick-action-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.9);
		transform: scale(1.05);
	}
	
	.picker-content {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	
	.wheel-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}
	
	.color-wheel-container {
		position: relative;
		border-radius: 50%;
		overflow: visible;
		box-shadow: 
			0 8px 32px rgba(0, 0, 0, 0.2),
			0 0 0 1px rgba(255, 255, 255, 0.1);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.color-wheel-container:hover {
		box-shadow: 
			0 12px 40px rgba(0, 0, 0, 0.3),
			0 0 0 1px rgba(var(--primary-rgb), 0.3);
	}
	
	.color-wheel {
		width: 100%;
		height: 100%;
		cursor: crosshair;
		border-radius: 50%;
		transition: all 0.3s ease;
		outline: none;
	}
	
	.color-wheel:focus-visible {
		box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.4);
	}
	
	.color-indicator {
		position: absolute;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
		z-index: 10;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.indicator-ring {
		position: absolute;
		inset: -2px;
		border: 3px solid rgba(255, 255, 255, 0.9);
		border-radius: 50%;
		box-shadow: 
			0 0 0 1px rgba(0, 0, 0, 0.3),
			0 2px 8px rgba(0, 0, 0, 0.2);
	}
	
	.indicator-dot {
		position: absolute;
		inset: 6px;
		background: currentColor;
		border-radius: 50%;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
	}
	
	.wheel-glow-effect {
		position: absolute;
		inset: -4px;
		background: radial-gradient(circle at center, 
			rgba(var(--primary-rgb), calc(var(--wheel-glow) * 0.4)) 0%,
			rgba(var(--primary-rgb), calc(var(--wheel-glow) * 0.2)) 50%,
			transparent 100%);
		border-radius: 50%;
		pointer-events: none;
		z-index: -1;
	}
	
	.lightness-control {
		width: 100%;
		max-width: 280px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	
	.control-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		margin-bottom: 4px;
	}
	
	.control-value {
		font-family: monospace;
		color: rgba(var(--primary-rgb), 0.8);
		font-weight: 600;
	}
	
	.modern-slider {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		outline: none;
		border: 1px solid rgba(255, 255, 255, 0.15);
		cursor: pointer;
		background-size: 100% 100%;
		-webkit-appearance: none;
		appearance: none;
		transition: all 0.3s ease;
	}
	
	.modern-slider:hover {
		border-color: rgba(var(--primary-rgb), 0.3);
		box-shadow: 0 0 12px rgba(var(--primary-rgb), 0.15);
	}
	
	.modern-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgba(var(--primary-rgb), 0.6);
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.modern-slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
		border-color: rgba(var(--primary-rgb), 0.8);
		box-shadow: 0 4px 16px rgba(var(--primary-rgb), 0.3);
	}
	
	.modern-slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgba(var(--primary-rgb), 0.6);
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		transition: all 0.2s ease;
	}
	
	.lightness-slider {
		background-image: linear-gradient(to right, transparent, transparent);
	}
	
	.controls-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	
	.color-preview-container {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.color-preview-container:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
		transform: translateY(-1px);
	}
	
	.color-preview {
		width: var(--preview-size, 44px);
		height: var(--preview-size, 44px);
		border-radius: 12px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		position: relative;
		overflow: hidden;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		flex-shrink: 0;
		transition: all 0.3s cubic-bezier(0, 0, 0.2, 1);
	}
	
	.preview-checker-pattern {
		position: absolute;
		inset: 0;
		background-image: 
			linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), 
			linear-gradient(-45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), 
			linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%), 
			linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%);
		background-size: 8px 8px;
		background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
		z-index: -1;
	}
	
	.preview-transition-effect {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at center, 
			rgba(255, 255, 255, calc(var(--color-transition) * 0.3)) 0%,
			transparent 70%);
		pointer-events: none;
	}
	
	.preview-label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	
	.preview-hex {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-color);
		font-family: monospace;
		letter-spacing: 0.5px;
	}
	
	.preview-rgba {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		font-family: monospace;
		letter-spacing: 0.25px;
	}
	
	.input-controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	
	.hex-input-group,
	.opacity-control {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	
	.hex-input {
		padding: 10px 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-color);
		font-size: 14px;
		font-family: monospace;
		text-transform: uppercase;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		letter-spacing: 0.5px;
	}
	
	.hex-input:focus {
		outline: none;
		border-color: rgba(var(--primary-rgb), 0.5);
		background: rgba(255, 255, 255, 0.12);
		box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.15);
		transform: scale(1.02);
	}
	
	.hex-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}
	
	.opacity-slider {
		background: linear-gradient(to right, 
			transparent 0%,
			var(--current-color, #ffffff) 100%),
		linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), 
		linear-gradient(-45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%);
		background-size: 100% 100%, 8px 8px, 8px 8px;
		background-position: 0 0, 0 0, 4px 4px;
	}
	
	.action-buttons {
		display: flex;
		gap: 12px;
		justify-content: center;
	}
	
	.action-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.8);
		padding: 12px;
		border-radius: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		overflow: hidden;
		min-width: 44px;
		height: 44px;
	}
	
	.action-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.95);
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.25);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
	}
	
	.action-btn:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.eyedropper-btn.active {
		background: rgba(var(--primary-rgb), 0.2);
		border-color: rgba(var(--primary-rgb), 0.4);
		color: rgba(var(--primary-rgb), 0.9);
	}
	
	.copy-btn:hover {
		background: rgba(34, 197, 94, 0.15);
		border-color: rgba(34, 197, 94, 0.3);
		color: rgba(34, 197, 94, 0.9);
	}
	
	.harmony-section {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 16px;
		padding: 20px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(8px);
	}
	
	.harmony-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}
	
	.harmony-title {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-color);
		letter-spacing: -0.01em;
	}
	
	.harmony-type-selector {
		display: flex;
		gap: 4px;
	}
	
	.harmony-type-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 12px;
	}
	
	.harmony-type-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		transform: scale(1.05);
	}
	
	.harmony-type-btn.active {
		background: rgba(var(--primary-rgb), 0.2);
		border-color: rgba(var(--primary-rgb), 0.4);
		color: rgba(var(--primary-rgb), 0.9);
	}
	
	.harmony-colors {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.harmony-color {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		position: relative;
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
	}
	
	.harmony-color:hover {
		transform: translateY(-3px) scale(1.05);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
		border-color: rgba(255, 255, 255, 0.4);
	}
	
	.harmony-color:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.harmony-color.selected {
		border-color: white;
		box-shadow: 
			0 6px 20px rgba(0, 0, 0, 0.3),
			0 0 0 2px rgba(255, 255, 255, 0.6);
		transform: translateY(-2px);
	}
	
	.harmony-color-tooltip {
		position: absolute;
		bottom: -28px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.9);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 10px;
		font-family: monospace;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s ease;
		z-index: 100;
	}
	
	.harmony-color:hover .harmony-color-tooltip {
		opacity: 1;
	}
	
	.wallpaper-harmony {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	
	.auto-harmony-label {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.8);
		font-weight: 500;
	}
	
	.modern-checkbox {
		width: 18px;
		height: 18px;
		appearance: none;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
		position: relative;
		transition: all 0.2s ease;
	}
	
	.modern-checkbox:checked {
		background: rgba(var(--primary-rgb), 0.8);
		border-color: rgba(var(--primary-rgb), 0.8);
	}
	
	.modern-checkbox:checked::after {
		content: '✓';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: white;
		font-size: 12px;
		font-weight: bold;
	}
	
	.modern-checkbox:hover {
		border-color: rgba(var(--primary-rgb), 0.6);
		transform: scale(1.05);
	}
	
	.loading-spinner {
		position: absolute;
		width: 14px;
		height: 14px;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	/* Size variations */
	.color-picker.size-small {
		--picker-padding: 16px;
		--preview-size: 36px;
	}
	
	.color-picker.size-small .input-controls {
		grid-template-columns: 1fr;
		gap: 12px;
	}
	
	.color-picker.size-small .harmony-colors {
		gap: 8px;
	}
	
	.color-picker.size-small .harmony-color {
		width: 32px;
		height: 32px;
	}
	
	.color-picker.size-large {
		--picker-padding: 24px;
		--preview-size: 52px;
	}
	
	.color-picker.size-large .input-controls {
		gap: 20px;
	}
	
	.color-picker.size-large .harmony-colors {
		gap: 12px;
	}
	
	.color-picker.size-large .harmony-color {
		width: 40px;
		height: 40px;
	}
	
	@media (max-width: 768px) {
		.picker-header {
			flex-direction: column;
			gap: 12px;
			align-items: stretch;
		}
		
		.input-controls {
			grid-template-columns: 1fr;
			gap: 16px;
		}
		
		.action-buttons {
			justify-content: stretch;
		}
		
		.action-btn {
			flex: 1;
		}
		
		.harmony-colors {
			justify-content: center;
			gap: 8px;
		}
		
		.harmony-type-selector {
			justify-content: center;
		}
	}
	
	@media (max-width: 480px) {
		.color-preview-container {
			flex-direction: column;
			text-align: center;
			gap: 12px;
		}
		
		.harmony-colors {
			grid-template-columns: repeat(auto-fit, minmax(32px, 1fr));
			gap: 6px;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.color-picker,
		.color-wheel,
		.harmony-color,
		.action-btn,
		.modern-slider,
		.color-indicator {
			transition: none !important;
			animation: none !important;
		}
		
		.loading-spinner {
			animation: none !important;
		}
	}
	
	@media (hover: none) {
		.harmony-color:hover,
		.action-btn:hover {
			transform: none;
		}
		
		.harmony-color-tooltip {
			display: none;
		}
	}
</style>
