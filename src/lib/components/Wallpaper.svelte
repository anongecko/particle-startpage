<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { AppSettings } from '$lib/storage';
	// This is an alias for the ColorThief library. You may need to install it:
	// pnpm add colorthief
	import ColorThief from 'colorthief';

	// --- Context and State ---
	const settings = getContext<Writable<AppSettings>>('settings');
	let wallpaperUrl: string;
	let isLoading = true;
	let imgElement: HTMLImageElement;

	// Subscribe to settings changes to update the local wallpaperUrl
	settings.subscribe(value => {
		if (wallpaperUrl !== value.activeWallpaper) {
			isLoading = true;
			wallpaperUrl = value.activeWallpaper;
		}
	});

	// --- Color Extraction Logic ---
	const updateThemeColor = () => {
		if (!imgElement || !imgElement.complete) {
			// If the image isn't fully loaded, wait for the onload event
			return;
		}
		try {
			const colorThief = new ColorThief();
			const dominantColor = colorThief.getColor(imgElement);
			// Format to a hex string: [r, g, b] -> #rrggbb
			const hexColor = `#${dominantColor.map((c: number) => c.toString(16).padStart(2, '0')).join('')}`;
			
			// Update the global settings store with the new theme color
			settings.update(current => ({ ...current, themeColor: hexColor }));
		} catch (e) {
			console.error("ColorThief Error: Could not get dominant color.", e);
		}
	};

	const handleImageLoad = () => {
		isLoading = false;
		updateThemeColor();
	};
</script>

<div class="wallpaper-container">
	<!-- 
      The `key` directive is crucial here. It tells Svelte to destroy the old
      image element and create a new one when the URL changes. This ensures
      the `onload` event fires reliably every time the wallpaper is updated.
    -->
	{#key wallpaperUrl}
		<img
			bind:this={imgElement}
			src={wallpaperUrl}
			alt="Dynamic background wallpaper"
			class:loading={isLoading}
			on:load={handleImageLoad}
			on:error={() => console.error(`Failed to load wallpaper: ${wallpaperUrl}`)}
			crossorigin="Anonymous"
		/>
	{/key}
</div>

<style>
	.wallpaper-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100vh;
		z-index: -1; /* Place it behind all other content */
		background-color: #111; /* Fallback color */
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover; /* Cover the screen without distortion */
		opacity: 1;
		transition: opacity 0.75s ease-in-out;
	}

	/* While the new image is loading, keep it transparent */
	img.loading {
		opacity: 0;
	}
</style>

