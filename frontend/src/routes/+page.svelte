<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { spring, tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	
	import Background from '$components/Background.svelte';
	import ParticleSystem from '$components/ParticleSystem.svelte';
	import SearchBar from '$components/SearchBar.svelte';
	import BookmarkGrid from '$components/BookmarkGrid.svelte';
	import SettingsPanel from '$components/SettingsPanel.svelte';
	import SetupWizard from '$components/SetupWizard.svelte';
	import LoadingScreen from '$components/LoadingScreen.svelte';
	import ErrorBoundary from '$components/ErrorBoundary.svelte';
	
	import { settingsStore, type Settings } from '$stores/settings';
	import { wallpaperStore } from '$stores/wallpaper';
	import { bookmarkStore } from '$stores/bookmarks';
	import { colorStore } from '$stores/color';
	import { setupStore } from '$stores/setup';
	
	import { handleKeyboardShortcuts } from '$lib/keyboard';
	import { preloadWallpapers } from '$lib/wallpaper';
	import { extractDominantColor } from '$lib/color';
	import { debounce, throttle } from '$lib/utils';

	let mounted = false;
	let isLoading = true;
	let loadingError: string | null = null;
	let searchFocused = false;
	let showSettings = false;
	let currentWallpaper = '';
	let windowWidth = 0;
	let windowHeight = 0;
	let lastInteraction = Date.now();
	let searchBarElement: HTMLElement;

	// Smooth animations for state transitions
	const uiOpacity = tweened(0, { duration: 800, easing: cubicOut });
	const settingsOpacity = tweened(0, { duration: 300, easing: cubicOut });
	const particleScale = spring(1, { stiffness: 0.1, damping: 0.8 });

	$: settings = $settingsStore;
	$: wallpapers = $wallpaperStore;
	$: bookmarks = $bookmarkStore;
	$: isSetupComplete = $setupStore.isComplete;
	$: dominantColor = $colorStore.current;

	// Intelligent particle count based on device capabilities and screen size
	$: particleCount = calculateOptimalParticleCount(windowWidth, windowHeight);
	
	// Auto-hide UI elements after inactivity (for immersive experience)
	$: if (settings?.ui?.autoHideTimeout && lastInteraction) {
		scheduleAutoHide();
	}

	const calculateOptimalParticleCount = (width: number, height: number): number => {
		if (!width || !height) return 75;
		
		const screenArea = width * height;
		const pixelRatio = window.devicePixelRatio || 1;
		const performanceMultiplier = pixelRatio > 2 ? 0.6 : pixelRatio > 1 ? 0.8 : 1;
		
		// Base calculation on screen area with performance adjustments
		const baseCount = Math.floor(screenArea / 30000);
		const adjustedCount = Math.floor(baseCount * performanceMultiplier);
		
		return Math.max(40, Math.min(120, adjustedCount));
	};

	const scheduleAutoHide = debounce(() => {
		if (Date.now() - lastInteraction > (settings.ui?.autoHideTimeout || 30000)) {
			if (!searchFocused && !showSettings) {
				uiOpacity.set(0.7);
			}
		}
	}, 1000);

	const updateInteraction = () => {
		lastInteraction = Date.now();
		if ($uiOpacity < 1) {
			uiOpacity.set(1);
		}
	};

	const keyboardHandler = (event: KeyboardEvent) => {
		if (!mounted) return;
		updateInteraction();
		
		// Enhanced typing detection for search focus
		const isTyping = !event.ctrlKey && !event.altKey && !event.metaKey && 
			event.key.length === 1 && /[a-zA-Z0-9\s]/.test(event.key);
		
		if (isTyping && !searchFocused && !showSettings && document.activeElement === document.body) {
			focusSearch();
			return; // Let the character be typed in search
		}
		
		const result = handleKeyboardShortcuts(event, {
			settings: settings,
			onToggleSettings: toggleSettings,
			onFocusSearch: focusSearch,
			onEscape: handleEscape
		});
		
		if (result.preventDefault) {
			event.preventDefault();
		}
	};

	const focusSearch = async () => {
		searchFocused = true;
		await tick();
		searchBarElement?.focus();
	};

	const toggleSettings = async () => {
		if (showSettings) {
			settingsOpacity.set(0);
			await new Promise(resolve => setTimeout(resolve, 300));
			showSettings = false;
		} else {
			showSettings = true;
			await tick();
			settingsOpacity.set(1);
		}
		particleScale.set(showSettings ? 0.95 : 1);
	};

	const handleEscape = () => {
		if (showSettings) {
			toggleSettings();
		} else if (searchFocused) {
			searchFocused = false;
			document.body.focus();
		}
	};

	const handleWallpaperChange = debounce(async (imagePath: string) => {
		if (!imagePath || imagePath === currentWallpaper) return;
		
		currentWallpaper = imagePath;
		try {
			const color = await extractDominantColor(imagePath);
			colorStore.setDominantColor(color);
		} catch (error) {
			console.warn('Failed to extract color from wallpaper:', error);
			// Fallback to default color
			colorStore.setDominantColor('#4a90e2');
		}
	}, 150);

	const handleResize = throttle(() => {
		windowWidth = window.innerWidth;
		windowHeight = window.innerHeight;
	}, 100);

	// Touch gesture support for mobile
	const handleTouchStart = (event: TouchEvent) => {
		updateInteraction();
		if (event.touches.length === 2) {
			// Two-finger tap to toggle settings
			event.preventDefault();
			toggleSettings();
		}
	};

	const initializeApp = async () => {
		try {
			isLoading = true;
			loadingError = null;

			// Initialize all stores in parallel
			const initPromises = [
				settingsStore.initialize(),
				wallpaperStore.initialize(),
				bookmarkStore.initialize(),
				setupStore.initialize()
			];

			await Promise.allSettled(initPromises);

			// Preload initial wallpapers
			if ($wallpaperStore.currentTheme && $wallpaperStore.images.length > 0) {
				preloadWallpapers($wallpaperStore.images.slice(0, 3));
			}

			// Smooth UI entrance
			await tick();
			uiOpacity.set(1);
			
		} catch (error) {
			console.error('Failed to initialize app:', error);
			loadingError = 'Failed to load application. Please refresh the page.';
		} finally {
			isLoading = false;
		}
	};

	onMount(async () => {
		if (!browser) return;
		
		mounted = true;
		handleResize();
		
		// Event listeners
		window.addEventListener('keydown', keyboardHandler);
		window.addEventListener('resize', handleResize);
		window.addEventListener('mousemove', updateInteraction);
		window.addEventListener('touchstart', handleTouchStart, { passive: false });
		window.addEventListener('click', updateInteraction);

		await initializeApp();
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', keyboardHandler);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('mousemove', updateInteraction);
			window.removeEventListener('touchstart', handleTouchStart);
			window.removeEventListener('click', updateInteraction);
		}
	});
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<main 
	class="start-page" 
	class:setup-mode={!isSetupComplete}
	class:settings-open={showSettings}
	style="--ui-opacity: {$uiOpacity}; --particle-scale: {$particleScale}"
>
	{#if isLoading}
		<LoadingScreen />
	{:else if loadingError}
		<ErrorBoundary error={loadingError} onRetry={initializeApp} />
	{:else}
		<!-- Background Layer -->
		<Background
			{settings}
			wallpapers={$wallpaperStore}
			on:wallpaperChange={(e) => handleWallpaperChange(e.detail.path)}
		/>
		
		<!-- Particle System Layer -->
		{#if mounted && isSetupComplete}
			<div class="particle-container" style="transform: scale({$particleScale})">
				<ParticleSystem
					count={particleCount}
					{windowWidth}
					{windowHeight}
					{dominantColor}
					settings={settings.particles}
				/>
			</div>
		{/if}
		
		<!-- UI Layer -->
		{#if isSetupComplete}
			<div class="ui-layer" style="opacity: var(--ui-opacity)">
				<div class="main-content">
					<SearchBar
						bind:element={searchBarElement}
						bind:focused={searchFocused}
						{dominantColor}
						{settings}
						on:focus={updateInteraction}
						on:blur={() => searchFocused = false}
					/>
					
					<BookmarkGrid
						bookmarks={$bookmarkStore}
						{dominantColor}
						{settings}
						on:interact={updateInteraction}
					/>
				</div>
				
				<!-- Enhanced Settings Toggle -->
				<button
					class="settings-toggle"
					class:active={showSettings}
					on:click={toggleSettings}
					title="Settings ({settings.keyboard?.modifierKey || 'Ctrl'} + S)"
					aria-label="Open settings panel"
				>
					<div class="settings-icon" class:spinning={showSettings}>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="3"/>
							<path d="m12 1 0 6m0 6 0 6"/>
							<path d="m1 12 6 0m6 0 6 0"/>
						</svg>
					</div>
				</button>
			</div>
			
			<!-- Settings Panel Overlay -->
			{#if showSettings}
				<div class="settings-overlay" style="opacity: {$settingsOpacity}">
					<SettingsPanel
						{settings}
						wallpapers={$wallpaperStore}
						on:close={toggleSettings}
						on:settingsUpdate={(e) => settingsStore.update(e.detail)}
					/>
				</div>
			{/if}
		{:else}
			<!-- Setup Wizard -->
			<SetupWizard
				on:complete={() => setupStore.markComplete()}
			/>
		{/if}
	{/if}
</main>

<style>
	.start-page {
		position: relative;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background: #000;
		color: #fff;
		transition: filter 0.3s ease;
	}
	
	.start-page.settings-open {
		filter: blur(1px) brightness(0.8);
	}
	
	.particle-container {
		transform-origin: center;
		transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: transform;
	}
	
	.ui-layer {
		position: relative;
		z-index: 100;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		pointer-events: none;
		transition: opacity 0.3s ease;
		will-change: opacity;
	}
	
	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		padding: 2rem;
		pointer-events: none;
	}
	
	.main-content > :global(*) {
		pointer-events: auto;
	}
	
	.settings-toggle {
		position: fixed;
		top: 1.5rem;
		right: 1.5rem;
		z-index: 200;
		width: 2.5rem;
		height: 2.5rem;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(20px);
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.settings-toggle:hover {
		background: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.9);
		transform: translateY(-2px) scale(1.05);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
	}
	
	.settings-toggle:active {
		transform: translateY(0) scale(0.95);
	}
	
	.settings-toggle.active {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
		transform: translateY(-2px) scale(1.05);
	}
	
	.settings-icon {
		transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.settings-icon.spinning {
		transform: rotate(180deg);
	}
	
	.settings-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 300;
		backdrop-filter: blur(10px);
		background: rgba(0, 0, 0, 0.2);
		transition: opacity 0.3s ease;
		will-change: opacity;
	}
	
	.setup-mode {
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
	}
	
	@media (max-width: 768px) {
		.main-content {
			gap: 1.5rem;
			padding: 1rem;
		}
		
		.settings-toggle {
			top: 1rem;
			right: 1rem;
			width: 2.25rem;
			height: 2.25rem;
		}
	}
	
	@media (max-width: 480px) {
		.main-content {
			gap: 1rem;
			padding: 0.75rem;
		}
		
		.settings-toggle {
			width: 2rem;
			height: 2rem;
		}
	}
	
	@media (hover: none) and (pointer: coarse) {
		.settings-toggle:hover {
			transform: none;
		}
	}
</style>
