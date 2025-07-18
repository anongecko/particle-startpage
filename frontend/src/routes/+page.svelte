<script lang="ts">
	import { onMount, onDestroy, tick, beforeUpdate, afterUpdate } from 'svelte';
	import { browser } from '$app/environment';
	import { spring, tweened } from 'svelte/motion';
	import { cubicOut, quintOut } from 'svelte/easing';
	
	import {
		Background,
		ParticleSystem,
		SearchBar,
		BookmarkGrid,
		SettingsPanel,
		SetupWizard,
		ErrorBoundary,
		componentUtils,
		COMPONENT_PRESETS
	} from '$components';
	
	import { settingsStore, type Settings } from '$stores/settings';
	import { wallpaperStore } from '$stores/wallpaper';
	import { bookmarkStore } from '$stores/bookmarks';
	import { colorStore } from '$stores/color';
	import { setupStore } from '$stores/setup';
	
	import { handleKeyboardShortcuts } from '$lib/keyboard';
	import { preloadWallpapers } from '$lib/wallpaper';
	import { 
		initializeColorSystem,
		extractDominantColor,
		setCSSColorProperties,
		clearColorCache,
		warmUpCache,
		colorUtils
	} from '$lib/color';
	import { debounce, throttle } from '$lib/utils';

	// Component state
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
	let isInitialized = false;

	// Performance monitoring
	const perfMonitor = componentUtils.ComponentPerformanceMonitor.getInstance();
	let frameCount = 0;
	let lastFrameTime = 0;
	let fps = 120;

	// Enhanced animations optimized for 120fps
	const uiOpacity = tweened(0, { 
		duration: 600, 
		easing: quintOut
	});
	const settingsOpacity = tweened(0, { 
		duration: 200, 
		easing: cubicOut 
	});
	const particleScale = spring(1, { 
		stiffness: 0.08, 
		damping: 0.82,
		precision: 0.001
	});
	const loadingProgress = tweened(0, {
		duration: 1200,
		easing: cubicOut
	});

	// Reactive declarations
	$: settings = $settingsStore;
	$: wallpapers = $wallpaperStore;
	$: bookmarks = $bookmarkStore;
	$: isSetupComplete = $setupStore.isComplete;
	$: dominantColor = $colorStore.current;
	$: colorPalette = $colorStore.palette;

	// Component configuration based on performance
	$: componentConfig = settings?.performance?.mode 
		? COMPONENT_PRESETS[settings.performance.mode]
		: COMPONENT_PRESETS.high;

	// Intelligent particle count with enhanced calculation
	$: particleCount = calculateOptimalParticleCount(windowWidth, windowHeight, fps);
	
	// Auto-hide UI with performance consideration
	$: if (settings?.ui?.autoHideTimeout && lastInteraction && !showSettings) {
		scheduleAutoHide();
	}

	// Font size reactive update
	$: if (settings?.ui?.fontSize && browser) {
		updateFontSize(settings.ui.fontSize);
	}

	// Color system integration
	$: if (colorPalette && mounted) {
		setCSSColorProperties(colorPalette);
	}

	const calculateOptimalParticleCount = (width: number, height: number, currentFps: number): number => {
		if (!width || !height) return 60;
		
		const screenArea = width * height;
		const pixelRatio = window.devicePixelRatio || 1;
		const memoryGB = (navigator as any).deviceMemory || 4;
		
		// Performance multipliers
		const pixelMultiplier = pixelRatio > 2 ? 0.7 : pixelRatio > 1 ? 0.85 : 1;
		const memoryMultiplier = memoryGB >= 8 ? 1.2 : memoryGB >= 4 ? 1 : 0.8;
		const fpsMultiplier = currentFps >= 100 ? 1.3 : currentFps >= 60 ? 1 : 0.7;
		
		// Base calculation with area scaling
		const baseCount = Math.sqrt(screenArea) / 25;
		const adjustedCount = Math.floor(
			baseCount * pixelMultiplier * memoryMultiplier * fpsMultiplier
		);
		
		// Performance mode adjustment
		const modeMultiplier = componentConfig.performanceMode === 'high' ? 1.2 : 
							  componentConfig.performanceMode === 'balanced' ? 1 : 0.6;
		
		return Math.max(30, Math.min(150, Math.floor(adjustedCount * modeMultiplier)));
	};

	const updateFontSize = (fontSize: string) => {
		if (!browser) return;
		document.body.setAttribute('data-font-size', fontSize);
	};

	const scheduleAutoHide = debounce(() => {
		const timeout = settings.ui?.autoHideTimeout || 30000;
		if (Date.now() - lastInteraction > timeout && !searchFocused && !showSettings) {
			uiOpacity.set(0.6);
		}
	}, 1000);

	const updateInteraction = () => {
		lastInteraction = Date.now();
		if ($uiOpacity < 1) {
			uiOpacity.set(1);
		}
	};

	const trackFPS = () => {
		const now = performance.now();
		frameCount++;
		
		if (now - lastFrameTime >= 1000) {
			fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
			frameCount = 0;
			lastFrameTime = now;
			
			// Adjust particle count if performance drops
			if (fps < 90 && particleCount > 40) {
				// Trigger recalculation with lower FPS
			}
		}
		
		if (mounted) {
			requestAnimationFrame(trackFPS);
		}
	};

	const keyboardHandler = (event: KeyboardEvent) => {
		if (!mounted || !isInitialized) return;
		updateInteraction();
		
		// Enhanced typing detection
		const isTyping = !event.ctrlKey && !event.altKey && !event.metaKey && 
			event.key.length === 1 && /^[a-zA-Z0-9\s\-_.,!?@#$%^&*()+=<>{}[\]|\\:;"'`~]$/.test(event.key);
		
		if (isTyping && !searchFocused && !showSettings && document.activeElement === document.body) {
			focusSearch();
			return;
		}
		
		const result = handleKeyboardShortcuts(event, {
			settings: settings,
			onToggleSettings: toggleSettings,
			onFocusSearch: focusSearch,
			onEscape: handleEscape,
			onClearCache: () => clearColorCache(),
			onTogglePerformanceMode: cyclePerformanceMode
		});
		
		if (result.preventDefault) {
			event.preventDefault();
		}
	};

	const focusSearch = async () => {
		if (!searchBarElement || searchFocused) return;
		
		searchFocused = true;
		await tick();
		
		// Enhanced focus with animation
		try {
			searchBarElement.focus();
			searchBarElement.scrollIntoView({ 
				behavior: 'smooth', 
				block: 'center' 
			});
		} catch (error) {
			console.warn('Failed to focus search:', error);
		}
	};

	const toggleSettings = async () => {
		const endRender = perfMonitor.startRender('settings-toggle');
		
		try {
			if (showSettings) {
				settingsOpacity.set(0);
				await new Promise(resolve => setTimeout(resolve, 200));
				showSettings = false;
			} else {
				showSettings = true;
				await tick();
				settingsOpacity.set(1);
			}
			
			// Smooth particle scaling with spring physics
			particleScale.set(showSettings ? 0.92 : 1);
		} finally {
			endRender();
		}
	};

	const handleEscape = () => {
		if (showSettings) {
			toggleSettings();
		} else if (searchFocused) {
			searchFocused = false;
			searchBarElement?.blur();
			document.body.focus();
		}
	};

	const cyclePerformanceMode = () => {
		const modes = ['high', 'balanced', 'low'] as const;
		const currentIndex = modes.indexOf(settings.performance?.mode || 'high');
		const nextMode = modes[(currentIndex + 1) % modes.length];
		
		settingsStore.update({
			...settings,
			performance: { ...settings.performance, mode: nextMode }
		});
	};

	const handleWallpaperChange = debounce(async (imagePath: string) => {
		if (!imagePath || imagePath === currentWallpaper || !mounted) return;
		
		const endRender = perfMonitor.startRender('wallpaper-change');
		currentWallpaper = imagePath;
		
		try {
			// Clear cache and extract new color
			clearColorCache();
			
			const color = await extractDominantColor(imagePath, {
				quality: componentConfig.performanceMode === 'high' ? 'high' : 'balanced'
			});
			
			// Update store which will trigger CSS property updates
			colorStore.setDominantColor(color);
			
			// Warm cache for the new palette
			if ($colorStore.palette) {
				warmUpCache($colorStore.palette);
			}
			
		} catch (error) {
			console.warn('Failed to extract color from wallpaper:', error);
			colorStore.setDominantColor('#4a90e2');
		} finally {
			endRender();
		}
	}, 120);

	const handleResize = throttle(() => {
		windowWidth = window.innerWidth;
		windowHeight = window.innerHeight;
		
		// Update CSS viewport variables
		if (browser) {
			const root = document.documentElement;
			root.style.setProperty('--window-width', `${windowWidth}px`);
			root.style.setProperty('--window-height', `${windowHeight}px`);
		}
	}, 50);

	const handleTouchStart = (event: TouchEvent) => {
		updateInteraction();
		
		// Enhanced gesture detection
		if (event.touches.length === 2) {
			event.preventDefault();
			toggleSettings();
		} else if (event.touches.length === 3) {
			event.preventDefault();
			cyclePerformanceMode();
		}
	};

	const handleVisibilityChange = () => {
		if (document.hidden) {
			// Pause animations when tab is hidden
			particleScale.set(0.8, { duration: 0 });
		} else {
			// Resume animations
			particleScale.set(showSettings ? 0.92 : 1);
			updateInteraction();
		}
	};

	const initializeApp = async () => {
		const endRender = perfMonitor.startRender('app-initialization');
		
		try {
			isLoading = true;
			loadingError = null;
			loadingProgress.set(0);

			// Initialize color system first
			await initializeColorSystem();
			loadingProgress.set(20);

			// Initialize stores in optimized order
			const storeInitPromises = [
				settingsStore.initialize(),
				setupStore.initialize()
			];
			
			await Promise.allSettled(storeInitPromises);
			loadingProgress.set(50);

			// Initialize wallpaper and bookmark stores
			const secondaryPromises = [
				wallpaperStore.initialize(),
				bookmarkStore.initialize()
			];
			
			await Promise.allSettled(secondaryPromises);
			loadingProgress.set(80);

			// Preload critical wallpapers
			if ($wallpaperStore.currentTheme && $wallpaperStore.images.length > 0) {
				const criticalImages = $wallpaperStore.images.slice(0, 2);
				await preloadWallpapers(criticalImages);
			}
			
			loadingProgress.set(95);

			// Apply initial font size if set
			if (settings?.ui?.fontSize) {
				updateFontSize(settings.ui.fontSize);
			}

			// Smooth UI entrance with stagger
			await tick();
			loadingProgress.set(100);
			
			// Staggered animation entrance
			setTimeout(() => uiOpacity.set(1), 100);
			
			isInitialized = true;

		} catch (error) {
			console.error('Failed to initialize app:', error);
			loadingError = 'Failed to load application. Please refresh the page.';
		} finally {
			isLoading = false;
			endRender();
		}
	};

	// Performance optimization hooks
	beforeUpdate(() => {
		if (mounted) {
			const endRender = perfMonitor.startRender('component-update');
			// Will be called after update completes
			tick().then(endRender);
		}
	});

	afterUpdate(() => {
		// Ensure smooth animations after updates
		if (mounted && componentConfig.useGPUAcceleration) {
			const elements = document.querySelectorAll('.gpu, .animate-smooth');
			elements.forEach(el => {
				(el as HTMLElement).style.transform += ' translateZ(0)';
			});
		}
	});

	onMount(async () => {
		if (!browser) return;
		
		mounted = true;
		handleResize();
		
		// Start FPS tracking
		requestAnimationFrame(trackFPS);
		
		// Enhanced event listeners with optimized options
		const eventOptions = { passive: true, capture: false };
		const nonPassiveOptions = { passive: false, capture: false };
		
		window.addEventListener('keydown', keyboardHandler, nonPassiveOptions);
		window.addEventListener('resize', handleResize, eventOptions);
		window.addEventListener('mousemove', updateInteraction, eventOptions);
		window.addEventListener('touchstart', handleTouchStart, nonPassiveOptions);
		window.addEventListener('click', updateInteraction, eventOptions);
		window.addEventListener('wheel', updateInteraction, eventOptions);
		document.addEventListener('visibilitychange', handleVisibilityChange, eventOptions);

		// Initialize application
		await initializeApp();

		// Enable hot reload in development
		if (import.meta.env.DEV) {
			colorUtils.componentUtils.enableComponentHotReload();
		}
	});

	onDestroy(() => {
		if (!browser) return;
		
		mounted = false;
		
		// Clean up event listeners
		window.removeEventListener('keydown', keyboardHandler);
		window.removeEventListener('resize', handleResize);
		window.removeEventListener('mousemove', updateInteraction);
		window.removeEventListener('touchstart', handleTouchStart);
		window.removeEventListener('click', updateInteraction);
		window.removeEventListener('wheel', updateInteraction);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		
		// Clean up performance monitoring
		perfMonitor.reset();
		
		// Clean up color cache
		clearColorCache();
	});
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<main 
	class="start-page gpu color-transition"
	class:setup-mode={!isSetupComplete}
	class:settings-open={showSettings}
	class:loading={isLoading}
	class:high-performance={componentConfig.performanceMode === 'high'}
	style="
		--ui-opacity: {$uiOpacity}; 
		--particle-scale: {$particleScale};
		--loading-progress: {$loadingProgress}%;
		--fps: {fps};
	"
>
	{#if isLoading}
		<div class="loading-screen glass-light flex-center">
			<div class="loading-content text-center">
				<div class="loading-spinner animate-spin"></div>
				<h2 class="text-xl m-4">Initializing Particle Nexus</h2>
				<div class="progress-bar">
					<div 
						class="progress-fill color-transition" 
						style="width: {$loadingProgress}%"
					></div>
				</div>
				<p class="text-secondary text-sm m-2">
					{$loadingProgress < 30 ? 'Loading color system...' :
					 $loadingProgress < 60 ? 'Initializing settings...' :
					 $loadingProgress < 90 ? 'Loading wallpapers...' : 'Almost ready...'}
				</p>
			</div>
		</div>
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
		{#if mounted && isSetupComplete && isInitialized}
			<div 
				class="particle-container gpu animate-smooth" 
				style="transform: scale({$particleScale})"
				role="presentation"
				aria-hidden="true"
			>
				<ParticleSystem
					count={particleCount}
					{windowWidth}
					{windowHeight}
					{dominantColor}
					settings={settings.particles}
					config={componentConfig}
				/>
			</div>
		{/if}
		
		<!-- UI Layer -->
		{#if isSetupComplete && isInitialized}
			<div class="ui-layer animate-smooth" style="opacity: var(--ui-opacity)">
				<div class="main-content">
					<SearchBar
						bind:element={searchBarElement}
						bind:focused={searchFocused}
						{dominantColor}
						{settings}
						config={componentConfig}
						on:focus={updateInteraction}
						on:blur={() => searchFocused = false}
						on:search={updateInteraction}
					/>
					
					<BookmarkGrid
						bookmarks={$bookmarkStore}
						{dominantColor}
						{settings}
						config={componentConfig}
						on:interact={updateInteraction}
						on:bookmark-click={updateInteraction}
					/>
				</div>
				
				<!-- Enhanced Settings Toggle -->
				<button
					class="settings-toggle glass hover-lift hover-glow animate-smooth"
					class:active={showSettings}
					on:click={toggleSettings}
					title="Settings ({settings.keyboard?.modifierKey || 'Ctrl'} + S)"
					aria-label="Open settings panel"
					aria-expanded={showSettings}
				>
					<div class="settings-icon" class:spinning={showSettings}>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="3"/>
							<path d="m12 1 0 6m0 6 0 6"/>
							<path d="m1 12 6 0m6 0 6 0"/>
						</svg>
					</div>
				</button>
				
				<!-- Performance indicator (dev mode) -->
				{#if import.meta.env.DEV && componentConfig.debugMode}
					<div class="performance-indicator fixed top-4 left-4 text-xs text-tertiary">
						<div>FPS: {fps}</div>
						<div>Particles: {particleCount}</div>
						<div>Mode: {componentConfig.performanceMode}</div>
					</div>
				{/if}
			</div>
			
			<!-- Settings Panel Overlay -->
			{#if showSettings}
				<div 
					class="settings-overlay glass-ultra animate-fast" 
					style="opacity: {$settingsOpacity}"
					role="dialog"
					aria-modal="true"
					aria-labelledby="settings-title"
				>
					<SettingsPanel
						{settings}
						wallpapers={$wallpaperStore}
						config={componentConfig}
						on:close={toggleSettings}
						on:settingsUpdate={(e) => settingsStore.update(e.detail)}
						on:font-size-change={(e) => updateFontSize(e.detail)}
					/>
				</div>
			{/if}
		{:else}
			<!-- Setup Wizard -->
			<SetupWizard
				config={componentConfig}
				on:complete={() => setupStore.markComplete()}
				on:skip={() => setupStore.markComplete()}
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
		background: var(--neutral-black);
		color: var(--neutral-white);
		transition: filter var(--duration-normal) var(--easing-ease);
	}
	
	.start-page.settings-open {
		filter: blur(1px) brightness(0.8);
	}
	
	.start-page.high-performance {
		transform: translate3d(0, 0, 0);
		backface-visibility: hidden;
	}
	
	.particle-container {
		transform-origin: center;
		transition: transform var(--duration-slower) var(--easing-spring);
		will-change: transform;
	}
	
	.ui-layer {
		position: relative;
		z-index: var(--z-base);
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		pointer-events: none;
		transition: opacity var(--duration-normal) var(--easing-ease);
		will-change: opacity;
	}
	
	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-8);
		padding: var(--space-8);
		pointer-events: none;
	}
	
	.main-content > :global(*) {
		pointer-events: auto;
	}
	
	.settings-toggle {
		position: fixed;
		top: var(--space-6);
		right: var(--space-6);
		z-index: var(--z-sticky);
		width: 2.5rem;
		height: 2.5rem;
		border: none;
		border-radius: var(--radius-full);
		background: var(--glass-surface-2);
		backdrop-filter: var(--blur-lg);
		color: var(--neutral-gray-300);
		cursor: pointer;
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-lg);
		border: 1px solid var(--glass-border-1);
		transition: all var(--duration-normal) var(--easing-spring);
	}
	
	.settings-toggle:hover {
		background: var(--glass-surface-3);
		color: var(--neutral-white);
		transform: translateY(-2px) scale(1.05);
		box-shadow: var(--shadow-xl);
	}
	
	.settings-toggle:active {
		transform: translateY(0) scale(0.95);
	}
	
	.settings-toggle.active {
		background: var(--glass-surface-3);
		color: var(--neutral-white);
		box-shadow: var(--shadow-glow);
	}
	
	.settings-icon {
		transition: transform var(--duration-slow) var(--easing-spring);
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
		z-index: var(--z-overlay);
		backdrop-filter: var(--blur-md);
		background: rgba(0, 0, 0, 0.3);
		transition: opacity var(--duration-normal) var(--easing-ease);
		will-change: opacity;
	}
	
	.setup-mode {
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
	}
	
	/* Loading Screen Styles */
	.loading-screen {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: var(--z-modal);
		backdrop-filter: var(--blur-xl);
	}
	
	.loading-content {
		max-width: 300px;
	}
	
	.loading-spinner {
		width: 3rem;
		height: 3rem;
		border: 3px solid var(--neutral-gray-700);
		border-top: 3px solid var(--color-vibrant);
		border-radius: var(--radius-full);
		margin: 0 auto var(--space-4);
	}
	
	.progress-bar {
		width: 100%;
		height: 4px;
		background: var(--neutral-gray-800);
		border-radius: var(--radius-full);
		overflow: hidden;
		margin: var(--space-4) 0;
	}
	
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--color-vibrant), var(--color-accent));
		border-radius: var(--radius-full);
		transition: width var(--duration-normal) var(--easing-ease);
	}
	
	.performance-indicator {
		background: var(--glass-surface-1);
		backdrop-filter: var(--blur-sm);
		padding: var(--space-2);
		border-radius: var(--radius-md);
		border: 1px solid var(--glass-border-1);
		font-family: monospace;
		pointer-events: none;
		z-index: var(--z-tooltip);
	}
	
	/* Animation utilities */
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	
	.animate-spin {
		animation: spin 1s linear infinite;
	}
	
	/* Responsive design */
	@media (max-width: 768px) {
		.main-content {
			gap: var(--space-6);
			padding: var(--space-4);
		}
		
		.settings-toggle {
			top: var(--space-4);
			right: var(--space-4);
			width: 2.25rem;
			height: 2.25rem;
		}
	}
	
	@media (max-width: 480px) {
		.main-content {
			gap: var(--space-4);
			padding: var(--space-3);
		}
		
		.settings-toggle {
			width: 2rem;
			height: 2rem;
		}
	}
	
	/* Touch device optimizations */
	@media (hover: none) and (pointer: coarse) {
		.settings-toggle:hover {
			transform: none;
		}
		
		.settings-toggle:active {
			transform: scale(0.95);
		}
	}
	
	/* High refresh rate optimizations */
	@media (min-refresh-rate: 90hz) {
		.start-page.high-performance * {
			animation-fill-mode: both;
		}
	}
	
	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.settings-icon,
		.particle-container,
		.loading-spinner {
			animation: none !important;
			transition: none !important;
		}
		
		.settings-icon.spinning {
			transform: rotate(45deg);
		}
	}
</style>
