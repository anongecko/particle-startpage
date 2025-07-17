<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { colorStore } from '$stores/color';
	import { extractDominantColor } from '$lib/color';
	
	export let value: string = '#ffffff';
	export let opacity: number = 1;
	export let showOpacity: boolean = true;
	export let showEyedropper: boolean = true;
	export let showHarmony: boolean = true;
	export let autoHarmony: boolean = false;
	export let wallpaperImage: string = '';
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let label: string = '';
	
	const dispatch = createEventDispatcher();
	
	let colorWheelCanvas: HTMLCanvasElement;
	let colorWheelContainer: HTMLElement;
	let harmonyContainer: HTMLElement;
	let isDragging = false;
	let isEyedropperActive = false;
	let eyedropperSupported = false;
	let hexInput = value;
	let harmonyColors: string[] = [];
	let selectedHarmonyIndex = -1;
	
	// Color wheel state
	let hue = 0;
	let saturation = 100;
	let lightness = 50;
	let wheelRadius = 0;
	let wheelCenter = { x: 0, y: 0 };
	
	// Animation states
	const pickerScale = spring(1, { stiffness: 0.3, damping: 0.8 });
	const harmonyOpacity = tweened(0, { duration: 300, easing: cubicOut });
	const previewScale = spring(1, { stiffness: 0.4, damping: 0.9 });
	
	// Size configurations
	const sizeConfig = {
		small: { wheel: 120, preview: 32, spacing: 12 },
		medium: { wheel: 160, preview: 40, spacing: 16 },
		large: { wheel: 200, preview: 48, spacing: 20 }
	};
	
	$: config = sizeConfig[size];
	$: currentColor = hslToHex(hue, saturation, lightness);
	$: rgbaValue = hexToRgba(currentColor, opacity);
	$: if (currentColor !== value && !isDragging) {
		updateFromValue();
	}
	$: if (wallpaperImage && autoHarmony) {
		generateWallpaperHarmony();
	}
	
	interface ColorHarmony {
		name: string;
		colors: string[];
		description: string;
	}
	
	function updateFromValue() {
		const hsl = hexToHsl(value);
		if (hsl) {
			hue = hsl.h;
			saturation = hsl.s;
			lightness = hsl.l;
			hexInput = value;
			drawColorWheel();
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
		const radius = (size - 20) / 2;
		
		wheelRadius = radius;
		wheelCenter = { x: center, y: center };
		
		ctx.clearRect(0, 0, size, size);
		
		// Draw color wheel
		const imageData = ctx.createImageData(size, size);
		const data = imageData.data;
		
		for (let x = 0; x < size; x++) {
			for (let y = 0; y < size; y++) {
				const dx = x - center;
				const dy = y - center;
				const distance = Math.sqrt(dx * dx + dy * dy);
				
				if (distance <= radius) {
					const angle = Math.atan2(dy, dx);
					const hueValue = (angle + Math.PI) / (2 * Math.PI) * 360;
					const satValue = (distance / radius) * 100;
					
					const rgb = hslToRgb(hueValue, satValue, lightness);
					const index = (y * size + x) * 4;
					
					data[index] = rgb.r;
					data[index + 1] = rgb.g;
					data[index + 2] = rgb.b;
					data[index + 3] = 255;
				}
			}
		}
		
		ctx.putImageData(imageData, 0, 0);
		
		// Draw current color indicator
		const currentAngle = (hue / 360) * 2 * Math.PI - Math.PI;
		const currentRadius = (saturation / 100) * radius;
		const currentX = center + Math.cos(currentAngle) * currentRadius;
		const currentY = center + Math.sin(currentAngle) * currentRadius;
		
		ctx.beginPath();
		ctx.arc(currentX, currentY, 8, 0, 2 * Math.PI);
		ctx.strokeStyle = lightness > 50 ? '#000000' : '#ffffff';
		ctx.lineWidth = 3;
		ctx.stroke();
		
		ctx.beginPath();
		ctx.arc(currentX, currentY, 6, 0, 2 * Math.PI);
		ctx.strokeStyle = lightness > 50 ? '#ffffff' : '#000000';
		ctx.lineWidth = 2;
		ctx.stroke();
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
	
	function handleHexInput() {
		const cleanHex = hexInput.replace(/[^0-9a-fA-F#]/g, '');
		if (cleanHex.match(/^#?[0-9a-fA-F]{6}$/)) {
			const normalizedHex = cleanHex.startsWith('#') ? cleanHex : `#${cleanHex}`;
			const hsl = hexToHsl(normalizedHex);
			if (hsl) {
				hue = hsl.h;
				saturation = hsl.s;
				lightness = hsl.l;
				value = normalizedHex;
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
		const harmonies: ColorHarmony[] = [
			{
				name: 'Complementary',
				colors: [
					hslToHex(hue, saturation, lightness),
					hslToHex((hue + 180) % 360, saturation, lightness)
				],
				description: 'Opposite colors on the wheel'
			},
			{
				name: 'Triadic',
				colors: [
					hslToHex(hue, saturation, lightness),
					hslToHex((hue + 120) % 360, saturation, lightness),
					hslToHex((hue + 240) % 360, saturation, lightness)
				],
				description: 'Three evenly spaced colors'
			},
			{
				name: 'Analogous',
				colors: [
					hslToHex((hue - 30 + 360) % 360, saturation, lightness),
					hslToHex(hue, saturation, lightness),
					hslToHex((hue + 30) % 360, saturation, lightness)
				],
				description: 'Adjacent colors on the wheel'
			},
			{
				name: 'Split Complementary',
				colors: [
					hslToHex(hue, saturation, lightness),
					hslToHex((hue + 150) % 360, saturation, lightness),
					hslToHex((hue + 210) % 360, saturation, lightness)
				],
				description: 'Base color plus two adjacent to complement'
			}
		];
		
		harmonyColors = harmonies[0].colors; // Default to complementary
		harmonyOpacity.set(1);
	}
	
	async function generateWallpaperHarmony() {
		if (!wallpaperImage) return;
		
		try {
			const dominantColor = await extractDominantColor(wallpaperImage);
			const hsl = hexToHsl(dominantColor);
			
			if (hsl) {
				// Generate a harmony based on the wallpaper's dominant color
				const harmonyHue = (hsl.h + 60) % 360; // Use analogous harmony
				const newColor = hslToHex(harmonyHue, Math.min(hsl.s + 20, 100), Math.max(hsl.l - 10, 20));
				
				hue = harmonyHue;
				saturation = Math.min(hsl.s + 20, 100);
				lightness = Math.max(hsl.l - 10, 20);
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
		previewScale.set(1.1).then(() => previewScale.set(1));
		
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
</script>

<div 
	class="color-picker"
	class:size-small={size === 'small'}
	class:size-medium={size === 'medium'}
	class:size-large={size === 'large'}
	style="transform: scale({$pickerScale})"
>
	{#if label}
		<label class="picker-label">{label}</label>
	{/if}
	
	<div class="picker-content">
		<!-- Color Wheel -->
		<div class="wheel-section">
			<div 
				class="color-wheel-container" 
				bind:this={colorWheelContainer}
				style="width: {config.wheel}px; height: {config.wheel}px"
			>
				<canvas
					bind:this={colorWheelCanvas}
					class="color-wheel"
					on:mousedown={handleWheelClick}
					role="slider"
					aria-label="Color wheel - click and drag to select color"
					tabindex="0"
				></canvas>
			</div>
			
			<!-- Lightness Slider -->
			<div class="lightness-slider">
				<input
					type="range"
					min="0"
					max="100"
					bind:value={lightness}
					on:input={handleLightnessChange}
					class="slider lightness"
					style="background: linear-gradient(to right, 
						{hslToHex(hue, saturation, 0)}, 
						{hslToHex(hue, saturation, 50)}, 
						{hslToHex(hue, saturation, 100)})"
					aria-label="Lightness"
				/>
				<span class="slider-label">Lightness: {lightness}%</span>
			</div>
		</div>
		
		<!-- Controls -->
		<div class="controls-section">
			<!-- Color Preview -->
			<div 
				class="color-preview"
				style="background: {rgbaValue}; transform: scale({$previewScale})"
				title="Current color: {value}"
			>
				<div class="preview-checker"></div>
			</div>
			
			<!-- Hex Input -->
			<div class="hex-input-group">
				<label for="hex-input">Hex</label>
				<input
					id="hex-input"
					type="text"
					bind:value={hexInput}
					on:input={handleHexInput}
					on:blur={handleHexInput}
					class="hex-input"
					placeholder="#ffffff"
					maxlength="7"
				/>
			</div>
			
			<!-- Opacity Slider -->
			{#if showOpacity}
				<div class="opacity-slider">
					<label for="opacity-input">Opacity</label>
					<input
						id="opacity-input"
						type="range"
						min="0"
						max="1"
						step="0.01"
						bind:value={opacity}
						on:input={handleOpacityChange}
						class="slider opacity"
						style="background: linear-gradient(to right, 
							transparent, 
							{value})"
						aria-label="Opacity"
					/>
					<span class="slider-value">{Math.round(opacity * 100)}%</span>
				</div>
			{/if}
			
			<!-- Eyedropper -->
			{#if showEyedropper && eyedropperSupported}
				<button
					class="eyedropper-button"
					class:active={isEyedropperActive}
					on:click={startEyedropper}
					title="Pick color from screen"
					aria-label="Eyedropper tool"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="m2 22 1-1h3l9-9"/>
						<path d="M3 21v-3l9-9"/>
						<path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>
					</svg>
					{#if isEyedropperActive}
						<span class="spinner"></span>
					{/if}
				</button>
			{/if}
		</div>
		
		<!-- Color Harmony -->
		{#if showHarmony && harmonyColors.length > 0}
			<div 
				class="harmony-section" 
				bind:this={harmonyContainer}
				style="opacity: {$harmonyOpacity}"
			>
				<h4 class="harmony-title">Color Harmony</h4>
				<div class="harmony-colors">
					{#each harmonyColors as color, index}
						<button
							class="harmony-color"
							class:selected={selectedHarmonyIndex === index}
							style="background-color: {color}"
							on:click={() => selectHarmonyColor(color, index)}
							title="Use harmony color: {color}"
							aria-label="Harmony color {index + 1}: {color}"
						>
							{#if selectedHarmonyIndex === index}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<polyline points="20,6 9,17 4,12"/>
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
		
		<!-- Auto Harmony Toggle -->
		{#if autoHarmony && wallpaperImage}
			<div class="auto-harmony">
				<label class="auto-harmony-label">
					<input 
						type="checkbox" 
						checked={autoHarmony}
						on:change={(e) => {
							autoHarmony = e.target.checked;
							if (autoHarmony) generateWallpaperHarmony();
						}}
					/>
					<span>Auto-generate from wallpaper</span>
				</label>
			</div>
		{/if}
	</div>
</div>

<style>
	.color-picker {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 16px;
		padding: 20px;
		user-select: none;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.picker-label {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 12px;
	}
	
	.picker-content {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	
	.wheel-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	
	.color-wheel-container {
		position: relative;
		border-radius: 50%;
		overflow: hidden;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}
	
	.color-wheel {
		width: 100%;
		height: 100%;
		cursor: crosshair;
		border-radius: 50%;
		transition: all 0.3s ease;
	}
	
	.color-wheel:hover {
		box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
	}
	
	.lightness-slider {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: center;
	}
	
	.slider {
		width: 100%;
		height: 8px;
		border-radius: 4px;
		outline: none;
		border: 1px solid rgba(255, 255, 255, 0.2);
		cursor: pointer;
		background-size: 100% 100%;
		-webkit-appearance: none;
		appearance: none;
	}
	
	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgba(0, 0, 0, 0.2);
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
	}
	
	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}
	
	.slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgba(0, 0, 0, 0.2);
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
	}
	
	.slider-label,
	.slider-value {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}
	
	.controls-section {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 12px;
		align-items: center;
	}
	
	.color-preview {
		width: var(--preview-size, 40px);
		height: var(--preview-size, 40px);
		border-radius: 8px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		overflow: hidden;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	
	.preview-checker {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-image: 
			linear-gradient(45deg, #ccc 25%, transparent 25%), 
			linear-gradient(-45deg, #ccc 25%, transparent 25%), 
			linear-gradient(45deg, transparent 75%, #ccc 75%), 
			linear-gradient(-45deg, transparent 75%, #ccc 75%);
		background-size: 8px 8px;
		background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
		z-index: -1;
	}
	
	.hex-input-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}
	
	.hex-input-group label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}
	
	.hex-input {
		padding: 8px 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
		font-family: monospace;
		text-transform: uppercase;
		transition: all 0.3s ease;
	}
	
	.hex-input:focus {
		outline: none;
		border-color: rgba(255, 255, 255, 0.4);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
	}
	
	.hex-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}
	
	.opacity-slider {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
	}
	
	.opacity-slider label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}
	
	.opacity-slider .slider {
		background-image: 
			linear-gradient(45deg, #ccc 25%, transparent 25%), 
			linear-gradient(-45deg, #ccc 25%, transparent 25%), 
			linear-gradient(45deg, transparent 75%, #ccc 75%), 
			linear-gradient(-45deg, transparent 75%, #ccc 75%);
		background-size: 8px 8px;
		background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
	}
	
	.eyedropper-button {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.8);
		width: 40px;
		height: 40px;
		border-radius: 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		position: relative;
		overflow: hidden;
	}
	
	.eyedropper-button:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	
	.eyedropper-button.active {
		background: rgba(33, 150, 243, 0.3);
		border-color: rgba(33, 150, 243, 0.5);
		color: #2196f3;
	}
	
	.harmony-section {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 16px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.harmony-title {
		margin: 0 0 12px 0;
		font-size: 14px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}
	
	.harmony-colors {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	
	.harmony-color {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}
	
	.harmony-color:hover {
		transform: translateY(-2px) scale(1.05);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	}
	
	.harmony-color.selected {
		border-color: white;
		box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
	}
	
	.auto-harmony {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.auto-harmony-label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.9);
	}
	
	.auto-harmony-label input {
		width: 16px;
		height: 16px;
		accent-color: #4caf50;
	}
	
	.spinner {
		position: absolute;
		width: 12px;
		height: 12px;
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
		padding: 16px;
		--preview-size: 32px;
	}
	
	.color-picker.size-small .controls-section {
		grid-template-columns: auto 1fr;
		gap: 8px;
	}
	
	.color-picker.size-small .eyedropper-button {
		width: 32px;
		height: 32px;
	}
	
	.color-picker.size-large {
		padding: 24px;
		--preview-size: 48px;
	}
	
	.color-picker.size-large .controls-section {
		gap: 16px;
	}
	
	.color-picker.size-large .eyedropper-button {
		width: 48px;
		height: 48px;
	}
	
	@media (max-width: 768px) {
		.controls-section {
			grid-template-columns: 1fr;
			gap: 16px;
		}
		
		.opacity-slider {
			order: -1;
		}
		
		.harmony-colors {
			justify-content: center;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.color-picker,
		.color-wheel,
		.harmony-color,
		.eyedropper-button {
			transition: none !important;
			animation: none !important;
		}
	}
</style>
