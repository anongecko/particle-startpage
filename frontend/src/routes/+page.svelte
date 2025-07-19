<script lang="ts">
	import { onMount, onDestroy, tick, setContext, beforeUpdate, afterUpdate } from 'svelte';
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
		COMPONENT_PRESETS,
		ThreeDComponents
	} from '$components';
	
	import { settingsStore, type Settings } from '$stores/settings';
	import { wallpaperStore } from '$stores/wallpaper';
	import { bookmarkStore, migrationStatus, object3DAnalytics } from '$stores/bookmarks';
	import { colorStore } from '$stores/color';
	import { setupStore } from '$stores/setup';
	
	import { ThreeRenderer } from '$lib/three-renderer';
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

	// Enhanced component state with 3D support
	let mounted = false;
	let isLoading = true;
	let loadingError: string | null = null;
	let webGLError: string | null = null;
	let searchFocused = false;
	let showSettings = false;
	let currentWallpaper = '';
	let windowWidth = 0;
	let windowHeight = 0;
	let lastInteraction = Date.now();
	let searchBarElement: HTMLElement;
	let isInitialized = false;

	// 3D System state
	let sharedThreeRenderer: ThreeRenderer | null = null;
	let webGLSupported = true;
	let webGLInitialized = false;
	let threeDEnabled = true;

	// Performance monitoring with 3D metrics
	const perfMonitor = componentUtils.ComponentPerformanceMonitor.getInstance();
	const threeDOptimizer = componentUtils.ThreeDPerformanceOptimizer.getInstance();
	let frameCount = 0;
	let lastFrameTime = 0;
	let fps = 120;
	let object3DCount = 0;
	let memoryUsage = 0;

	// Enhanced animations optimized for 120fps + 3D
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
	const threeDTransition = spring(1, {
		stiffness: 0.1,
		damping: 0.8
	});

	// Reactive declarations with 3D integration
	$: settings = $settingsStore;
	$: wallpapers = $wallpaperStore;
	$: bookmarks = $bookmarkStore;
	$: isSetupComplete = $setupStore.isComplete;
	$: dominantColor = $colorStore.current;
	$: colorPalette = $colorStore.palette;
	$: migration = $migrationStatus;
	$: threeDStats = $object3DAnalytics;

	// Enhanced component configuration with 3D support
	$: componentConfig = {
		...COMPONENT_PRESETS[settings?.performance?.mode || 'high'],
		enable3D: threeDEnabled && webGLSupported,
		fallbackTo2D: true,
		performanceLevel: settings?.performance3D || 'high',
		lodEnabled: true
	};

	// Intelligent particle count with 3D consideration
	$: particleCount = calculateOptimalParticleCount(windowWidth, windowHeight, fps, object3DCount);
	
	// Auto-hide UI with enhanced consideration for 3D interactions
	$: if (settings?.ui?.autoHideTimeout && lastInteraction && !showSettings && !searchFocused) {
		scheduleAutoHide();
	}

	// Font size reactive update
	$: if (settings?.ui?.fontSize && browser) {
		updateFontSize(settings.ui.fontSize);
	}

	// Color system integration with 3D renderer
	$: if (colorPalette && mounted) {
		setCSSColorProperties(colorPalette);
		if (sharedThreeRenderer) {
			sharedThreeRenderer.updateWallpaperColors(dominantColor);
		}
	}

	// 3D performance monitoring
	$: if (sharedThreeRenderer && mounted) {
		const metrics = sharedThreeRenderer.getPerformanceMetrics();
		object3DCount = Object.keys(threeDStats.usage || {}).length;
		memoryUsage = metrics.memoryUsage || 0;
		
		// Feed FPS data to optimizer
		threeDOptimizer.recordFrameRate(metrics.fps || fps);
	}

	// Set up Three.js context for child components
	setContext('threeRenderer', sharedThreeRenderer);
	setContext('webGLSupported', webGLSupported);
	setContext('threeDConfig', componentConfig);

	const calculateOptimalParticleCount = (width: number, height: number, currentFps: number, activeObjects: number): number => {
		if (!width || !height) return 40;
		
		const screenArea = width * height;
		const pixelRatio = window.devicePixelRatio || 1;
		const memoryGB = (navigator as any).deviceMemory || 4;
		
		// Enhanced multipliers considering 3D objects
		const pixelMultiplier = pixelRatio > 2 ? 0.6 : pixelRatio > 1 ? 0.8 : 1;
		const memoryMultiplier = memoryGB >= 8 ? 1.2 : memoryGB >= 4 ? 1 : 0.7;
		const fpsMultiplier = currentFps >= 100 ? 1.3 : currentFps >= 60 ? 1 : 0.6;
		const objectMultiplier = Math.max(0.3, 1 - (activeObjects * 0.05)); // Reduce particles with more 3D objects
		
		// Base calculation with area scaling
		const baseCount = Math.sqrt(screenArea) / 30; // Slightly reduced base
		const adjustedCount = Math.floor(
			baseCount * pixelMultiplier * memoryMultiplier * fpsMultiplier * objectMultiplier
		);
		
		// Performance mode adjustment with 3D consideration
		const modeMultiplier = componentConfig.performanceLevel === 'high' ? 1.1 : 
							  componentConfig.performanceLevel === 'medium' ? 0.9 : 0.5;
		
		return Math.max(20, Math.min(120, Math.floor(adjustedCount * modeMultiplier)));
	};

	const initializeThreeJS = async (): Promise<boolean> => {
		if (!browser || !threeDEnabled) return false;
		
		try {
			// Create invisible canvas for shared renderer
			const canvas = document.createElement('canvas');
			canvas.style.position = 'absolute';
			canvas.style.top = '0';
			canvas.style.left = '0';
			canvas.style.width = '100%';
			canvas.style.height = '100%';
			canvas.style.pointerEvents = 'none';
			canvas.style.zIndex = '-1';
			
			// Append to document for WebGL context
			document.body.appendChild(canvas);
			
			// Initialize renderer
			sharedThreeRenderer = new ThreeRenderer(canvas);
			webGLInitialized = true;
			
			// Update context
			setContext('threeRenderer', sharedThreeRenderer);
			
			console.log('Shared Three.js renderer initialized successfully');
			return true;
			
		} catch (error) {
			console.warn('Three.js initialization failed:', error);
			webGLSupported = false;
			webGLError = 'WebGL not supported on this device';
			setContext('webGLSupported', false);
			return false;
		}
	};

	const updateFontSize = (fontSize: string) => {
		if (!browser) return;
		document.body.setAttribute('data-font-size', fontSize);
		
		// Update CSS custom property for 3D object scaling
		document.documentElement.style.setProperty('--font-size-multiplier', 
			fontSize === 'xs' ? '0.8' :
			fontSize === 'sm' ? '0.9' :
			fontSize === 'lg' ? '1.1' :
			fontSize === 'xl' ? '1.2' :
			fontSize === '2xl' ? '1.3' : '1.0'
		);
	};

	const scheduleAutoHide = debounce(() => {
		const timeout = settings.ui?.autoHideTimeout || 30000;
		if (Date.now() - lastInteraction > timeout && !searchFocused && !showSettings) {
			uiOpacity.set(0.6);
			// Reduce 3D activity when UI is hidden
			threeDTransition.set(0.8);
		}
	}, 1000);

	const updateInteraction = () => {
		lastInteraction = Date.now();
		if ($uiOpacity < 1) {
			uiOpacity.set(1);
			threeDTransition.set(1);
		}
	};

	const trackFPS = () => {
		const now = performance.now();
		frameCount++;
		
		if (now - lastFrameTime >= 1000) {
			fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
			frameCount = 0;
			lastFrameTime = now;
			
			// Auto-adjust 3D quality based on performance
			if (fps < 45 && componentConfig.performanceLevel === 'high') {
				console.log('Performance degraded, reducing 3D quality');
				settingsStore.update({
					...settings,
					performance3D: 'medium'
				});
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
			onTogglePerformanceMode: cyclePerformanceMode,
			onToggle3D: () => toggle3DMode(),
			onResetThreeJS: () => reinitializeThreeJS()
		});
		
		if (result.preventDefault) {
			event.preventDefault();
		}
	};

	const focusSearch = async () => {
		if (!searchBarElement || searchFocused) return;
		
		searchFocused = true;
		await tick();
		
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
			
			// Enhanced particle and 3D scaling
			particleScale.set(showSettings ? 0.88 : 1);
			threeDTransition.set(showSettings ? 0.9 : 1);
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
		const modes = ['high', 'medium', 'low'] as const;
		const currentIndex = modes.indexOf(settings.performance?.mode || 'high');
		const nextMode = modes[(currentIndex + 1) % modes.length];
		
		settingsStore.update({
			...settings,
			performance: { ...settings.performance, mode: nextMode }
		});
	};

	const toggle3DMode = () => {
		threeDEnabled = !threeDEnabled;
		settingsStore.update({
			...settings,
			enable3DObjects: threeDEnabled
		});
		
		if (threeDEnabled && !webGLInitialized) {
			initializeThreeJS();
		}
	};

	const reinitializeThreeJS = async () => {
		if (sharedThreeRenderer) {
			sharedThreeRenderer.dispose();
			sharedThreeRenderer = null;
		}
		
		webGLError = null;
		await initializeThreeJS();
	};

	const handleWallpaperChange = debounce(async (imagePath: string) => {
		if (!imagePath || imagePath === currentWallpaper || !mounted) return;
		
		const endRender = perfMonitor.startRender('wallpaper-change');
		currentWallpaper = imagePath;
		
		try {
			clearColorCache();
			
			const color = await extractDominantColor(imagePath, {
				quality: componentConfig.performanceLevel === 'high' ? 'high' : 'balanced'
			});
			
			colorStore.setDominantColor(color);
			
			// Update 3D renderer colors
			if (sharedThreeRenderer) {
				sharedThreeRenderer.updateWallpaperColors(color);
			}
			
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
		
		if (browser) {
			const root = document.documentElement;
			root.style.setProperty('--window-width', `${windowWidth}px`);
			root.style.setProperty('--window-height', `${windowHeight}px`);
		}
		
		// Update Three.js renderer size
		if (sharedThreeRenderer) {
			// Renderer will handle resize internally via resize observer
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
			toggle3DMode();
		}
	};

	const handleVisibilityChange = () => {
		if (document.hidden) {
			particleScale.set(0.7, { duration: 0 });
			threeDTransition.set(0.5, { duration: 0 });
		} else {
			particleScale.set(showSettings ? 0.88 : 1);
			threeDTransition.set(showSettings ? 0.9 : 1);
			updateInteraction();
		}
	};

	const handle3DPerformanceLevelChange = (event: CustomEvent) => {
		const { level } = event.detail;
		console.log(`3D performance level auto-adjusted to: ${level}`);
		
		// Update settings store
		settingsStore.update({
			...settings,
			performance3D: level
		});
	};

	const handleObjectSelectorOpen = (event: CustomEvent) => {
		updateInteraction();
		// This will be handled by BookmarkGrid component
	};

	const initializeApp = async () => {
		const endRender = perfMonitor.startRender('app-initialization');
		
		try {
			isLoading = true;
			loadingError = null;
			loadingProgress.set(0);

			// Initialize color system first
			await initializeColorSystem();
			loadingProgress.set(15);

			// Initialize WebGL/3D system early
			if (threeDEnabled) {
				await initializeThreeJS();
			}
			loadingProgress.set(30);

			// Initialize stores in optimized order
			const storeInitPromises = [
				settingsStore.initialize(),
				setupStore.initialize()
			];
			
			await Promise.allSettled(storeInitPromises);
			loadingProgress.set(55);

			// Initialize secondary stores
			const secondaryPromises = [
				wallpaperStore.initialize(),
				bookmarkStore.initialize()
			];
			
			await Promise.allSettled(secondaryPromises);
			loadingProgress.set(75);

			// Handle 3D migration if needed
			if (migration.hasLegacyIcons && !migration.migrationCompleted) {
				console.log('Starting 3D object migration...');
				// Migration is handled automatically in bookmark store
			}
			loadingProgress.set(85);

			// Preload critical wallpapers
			if ($wallpaperStore.currentTheme && $wallpaperStore.images.length > 0) {
				const criticalImages = $wallpaperStore.images.slice(0, 2);
				await preloadWallpapers(criticalImages);
			}
			loadingProgress.set(95);

			// Apply initial font size
			if (settings?.ui?.fontSize) {
				updateFontSize(settings.ui.fontSize);
			}

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
		
		// Enhanced event listeners
		const eventOptions = { passive: true, capture: false };
		const nonPassiveOptions = { passive: false, capture: false };
		
		window.addEventListener('keydown', keyboardHandler, nonPassiveOptions);
		window.addEventListener('resize', handleResize, eventOptions);
		window.addEventListener('mousemove', updateInteraction, eventOptions);
		window.addEventListener('touchstart', handleTouchStart, nonPassiveOptions);
		window.addEventListener('click', updateInteraction, eventOptions);
		window.addEventListener('wheel', updateInteraction, eventOptions);
		document.addEventListener('visibilitychange', handleVisibilityChange, eventOptions);
		
		// 3D-specific event listeners
		window.addEventListener('3d-performance-level-change', handle3DPerformanceLevelChange);
		window.addEventListener('open-object-selector', handleObjectSelectorOpen);

		// Initialize application
		await initializeApp();

		// Enable hot reload in development
		if (import.meta.env.DEV) {
			componentUtils.enableComponentHotReload();
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
		window.removeEventListener('3d-performance-level-change', handle3DPerformanceLevelChange);
		window.removeEventListener('open-object-selector', handleObjectSelectorOpen);
		
		// Clean up 3D renderer
		if (sharedThreeRenderer) {
			sharedThreeRenderer.dispose();
		}
		
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
	class:webgl-supported={webGLSupported}
	class:three-d-enabled={threeDEnabled && webGLInitialized}
	class:high-performance={componentConfig.performanceLevel === 'high'}
	style="
		--ui-opacity: {$uiOpacity}; 
		--particle-scale: {$particleScale};
		--three-d-scale: {$threeDTransition};
		--loading-progress: {$loadingProgress}%;
		--fps: {fps};
		--object-count: {object3DCount};
		--memory-usage: {memoryUsage};
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
					{$loadingProgress < 20 ? 'Loading color system...' :
					 $loadingProgress < 35 ? 'Initializing 3D engine...' :
					 $loadingProgress < 60 ? 'Loading settings...' :
					 $loadingProgress < 80 ? 'Migrating to 3D objects...' :
					 $loadingProgress < 95 ? 'Loading wallpapers...' : 'Almost ready...'}
				</p>
				{#if webGLError}
					<p class="text-warning text-xs mt-2">
						3D mode unavailable: {webGLError}
					</p>
				{/if}
			</div>
		</div>
	{:else if loadingError}
		<ErrorBoundary 
			error={loadingError} 
			onRetry={initializeApp}
			context="Application Initialization"
		/>
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
		
		<!-- UI Layer with 3D Support -->
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
						on:openSettings={(e) => {
							if (e.detail.section === 'bookmarks') {
								showSettings = true;
								settingsOpacity.set(1);
							}
						}}
						on:contextMenu={updateInteraction}
					/>
				</div>
				
				<!-- Enhanced Settings Toggle with 3D Status -->
				<button
					class="settings-toggle glass hover-lift hover-glow animate-smooth"
					class:active={showSettings}
					class:three-d-active={threeDEnabled && webGLInitialized}
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
					{#if threeDEnabled && webGLInitialized}
						<div class="three-d-indicator"></div>
					{/if}
				</button>
				
				<!-- 3D Performance Indicator (dev mode) -->
				{#if import.meta.env.DEV && componentConfig.debugMode}
					<div class="performance-indicator fixed top-4 left-4 text-xs text-tertiary">
						<div class="perf-grid">
							<span>FPS:</span><span>{fps}</span>
							<span>Particles:</span><span>{particleCount}</span>
							<span>3D Objects:</span><span>{object3DCount}</span>
							<span>Memory:</span><span>{(memoryUsage / 1024 / 1024).toFixed(1)}MB</span>
							<span>Mode:</span><span>{componentConfig.performanceLevel}</span>
							<span>3D:</span><span class="three-d-status" class:enabled={threeDEnabled && webGLInitialized}>
								{threeDEnabled && webGLInitialized ? 'ON' : 'OFF'}
							</span>
						</div>
					</div>
				{/if}
				
				<!-- 3D Migration Status (temporary) -->
				{#if migration.hasLegacyIcons && !migration.migrationCompleted}
					<div class="migration-indicator fixed bottom-4 left-4 glass text-xs text-info">
						<div class="flex items-center gap-2">
							<div class="migration-spinner animate-spin"></div>
							<span>Migrating to 3D objects...</span>
						</div>
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
						threeDStats={threeDStats}
						webGLSupported={webGLSupported}
						on:close={toggleSettings}
						on:settingsUpdate={(e) => settingsStore.update(e.detail)}
						on:font-size-change={(e) => updateFontSize(e.detail)}
						on:toggle3D={toggle3DMode}
						on:reinitialize3D={reinitializeThreeJS}
					/>
				</div>
			{/if}
		{:else}
			<!-- Setup Wizard -->
			<SetupWizard
				config={componentConfig}
				webGLSupported={webGLSupported}
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
	
	.start-page.three-d-enabled {
		transform: translate3d(0, 0, 0);
		backface-visibility: hidden;
		perspective: 1000px;
	}
	
	.start-page.high-performance {
		transform: translate3d(0, 0, 0);
		backface-visibility: hidden;
		will-change: transform;
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
		position: relative;
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
	
	.settings-toggle.three-d-active {
		border-color: var(--color-vibrant);
		box-shadow: var(--shadow-lg), 0 0 20px rgba(97, 218, 251, 0.3);
	}
	
	.settings-icon {
		transition: transform var(--duration-slow) var(--easing-spring);
	}
	
	.settings-icon.spinning {
		transform: rotate(180deg);
	}
	
	.three-d-indicator {
		position: absolute;
		top: -2px;
		right: -2px;
		width: 8px;
		height: 8px;
		background: var(--color-vibrant);
		border-radius: 50%;
		box-shadow: 0 0 6px var(--color-vibrant);
		animation: pulse-3d 2s ease-in-out infinite;
	}
	
	@keyframes pulse-3d {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.6; transform: scale(1.2); }
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
		max-width: 320px;
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
		min-width: 120px;
	}
	
	.perf-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-1) var(--space-2);
		font-size: 0.7rem;
	}
	
	.three-d-status.enabled {
		color: var(--color-vibrant);
		font-weight: bold;
	}
	
	.migration-indicator {
		background: var(--glass-surface-2);
		backdrop-filter: var(--blur-sm);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-info);
		z-index: var(--z-tooltip);
	}
	
	.migration-spinner {
		width: 12px;
		height: 12px;
		border: 1px solid var(--color-info);
		border-top: 1px solid transparent;
		border-radius: 50%;
	}
	
	/* Animation utilities */
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	
	.animate-spin {
		animation: spin 1s linear infinite;
	}
	
	/* WebGL specific styles */
	.webgl-supported {
		/* Enhanced GPU acceleration */
		transform: translate3d(0, 0, 0);
		will-change: transform;
	}
	
	.webgl-supported .gpu {
		transform: translateZ(0);
		backface-visibility: hidden;
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
		
		.performance-indicator {
			font-size: 0.6rem;
			padding: var(--space-1);
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
		
		.three-d-enabled .animate-smooth {
			transition-duration: 8ms;
		}
	}
	
	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.settings-icon,
		.particle-container,
		.loading-spinner,
		.migration-spinner,
		.three-d-indicator {
			animation: none !important;
			transition: none !important;
		}
		
		.settings-icon.spinning {
			transform: rotate(45deg);
		}
	}
	
	/* Memory usage optimization */
	@media (max-device-memory: 2GB) {
		.start-page {
			--particle-count-multiplier: 0.5;
		}
		
		.three-d-enabled {
			/* Reduce 3D quality on low memory devices */
			--object-lod-distance: 3;
		}
	}
</style>
