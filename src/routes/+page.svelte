<script lang="ts">
	import { onMount, onDestroy, tick, setContext, beforeUpdate } from 'svelte';
	import { browser } from '$app/environment';
	import { spring, tweened } from 'svelte/motion';
	import { cubicOut, quintOut, elasticOut } from 'svelte/easing';
	
	// Updated component imports using new system
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
	
	// Store imports
	import { settingsStore } from '$stores/settings';
	import { wallpaperStore } from '$stores/wallpaper';
	import { bookmarkStore } from '$stores/bookmarks';
	import { colorStore } from '$stores/color';
	import { setupStore } from '$stores/setup';
	
	// Updated lib imports using new system
	import { 
		ThreeRenderer,
		Object3DRegistry,
		initialize,
		cleanup,
		common
	} from '$lib';
	
	// Individual utilities
	import { debounce, throttle } from '$lib/utils';
	import { handleKeyboardShortcuts } from '$lib/keyboard';
	
	// Core state management
	let mounted = false;
	let isLoading = true;
	let loadingError: string | null = null;
	let webGLError: string | null = null;
	let isInitialized = false;
	let isSetupComplete = false;
	
	// UI state
	let showSettings = false;
	let searchFocused = false;
	let windowWidth = 0;
	let windowHeight = 0;
	let isMobile = false;
	let searchBarElement: HTMLElement;
	
	// 3D system state
	let threeDEnabled = false;
	let webGLSupported = true;
	let webGLInitialized = false;
	let sharedThreeRenderer: ThreeRenderer | null = null;
	let object3DCount = 0;
	let simplified3DMode = false;
	
	// Performance state
	let componentConfig = COMPONENT_PRESETS.high;
	let currentFps = 60;
	let memoryUsage = 0;
	let lastInteraction = Date.now();
	
	// Animation state
	const loadingProgress = tweened(0, { duration: 300, easing: cubicOut });
	const uiOpacity = tweened(0, { duration: 600, easing: quintOut });
	const settingsOpacity = tweened(0, { duration: 400, easing: cubicOut });
	const particleScale = spring(1, { stiffness: 0.3, damping: 0.8 });
	const threeDTransition = spring(0, { stiffness: 0.2, damping: 0.9 });
	
	// Reactive computations
	$: currentSettings = $settingsStore;
	$: currentColorPalette = $colorStore;
	$: currentWallpapers = $wallpaperStore;
	$: currentBookmarks = $bookmarkStore;
	$: isSetupComplete = $setupStore.isComplete;
	$: threeDEnabled = currentSettings?.enable3D && webGLSupported;
	$: isMobile = windowWidth < 768;
	$: simplified3DMode = isMobile || componentConfig.performanceMode === 'low';
	$: particleCount = calculateOptimalParticleCount();
	$: dominantColor = currentColorPalette?.current || '#4a90e2';
	
	// Initialization sequence
	onMount(async () => {
		if (!browser) return;
		
		try {
			isLoading = true;
			loadingProgress.set(0);
			
			// Phase 1: Background and Core Systems (0-30%)
			await initializeBackground();
			loadingProgress.set(10);
			
			await initializeColorSystem();
			loadingProgress.set(20);
			
			await initializeSettings();
			loadingProgress.set(30);
			
			// Phase 2: 3D and WebGL Systems (30-60%)
			await detectDeviceCapabilities();
			loadingProgress.set(40);
			
			if (threeDEnabled && !simplified3DMode) {
				await initializeThreeJS();
			}
			loadingProgress.set(50);
			
			await initializeObject3DRegistry();
			loadingProgress.set(60);
			
			// Phase 3: Component Systems (60-90%)
			await initializeParticleSystem();
			loadingProgress.set(70);
			
			await initializeBookmarkSystem();
			loadingProgress.set(80);
			
			await initializeUIComponents();
			loadingProgress.set(90);
			
			// Phase 4: Finalization (90-100%)
			await finalizeInitialization();
			loadingProgress.set(100);
			
			// Delay for smooth transition
			await new Promise(resolve => setTimeout(resolve, 300));
			
			isLoading = false;
			isInitialized = true;
			uiOpacity.set(1);
			
			if (threeDEnabled) {
				threeDTransition.set(1);
			}
			
			console.log('Application initialized successfully');
			
		} catch (error) {
			console.error('Application initialization failed:', error);
			loadingError = error instanceof Error ? error.message : 'Unknown initialization error';
			handleInitializationFailure(error);
		}
		
		mounted = true;
	});
	
	onDestroy(() => {
		cleanupApplication();
	});
	
	// Initialization phases
	async function initializeBackground(): Promise<void> {
		try {
			// Background loads first as requested
			await wallpaperStore.initialize();
			console.log('Background system initialized');
		} catch (error) {
			console.warn('Background initialization failed:', error);
		}
	}
	
	async function initializeColorSystem(): Promise<void> {
		try {
			await initialize.colorSystem();
			console.log('Color system initialized');
		} catch (error) {
			console.warn('Color system initialization failed:', error);
		}
	}
	
	async function initializeSettings(): Promise<void> {
		try {
			await settingsStore.initialize?.();
			
			// Update component config based on settings
			const settingsData = $settingsStore;
			if (settingsData?.performance3D) {
				componentConfig = COMPONENT_PRESETS[settingsData.performance3D] || COMPONENT_PRESETS.balanced;
			}
			
			console.log('Settings system initialized');
		} catch (error) {
			console.warn('Settings initialization failed:', error);
		}
	}
	
	async function detectDeviceCapabilities(): Promise<void> {
		try {
			// Detect mobile devices
			isMobile = windowWidth < 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
			
			// Detect WebGL support
			const canvas = document.createElement('canvas');
			const webglContext = canvas.getContext('webgl2') || canvas.getContext('webgl');
			webGLSupported = !!webglContext;
			
			if (!webGLSupported) {
				webGLError = 'WebGL not supported';
				threeDEnabled = false;
			}
			
			// Set simplified mode for mobile or low-end devices
			if (isMobile) {
				simplified3DMode = true;
				componentConfig = COMPONENT_PRESETS.balanced;
				console.log('Mobile device detected - using simplified 3D mode');
			}
			
			// Set contexts for components
			setContext('webGLSupported', webGLSupported);
			setContext('isMobile', isMobile);
			setContext('simplified3DMode', simplified3DMode);
			
			console.log('Device capabilities detected:', { webGLSupported, isMobile, simplified3DMode });
			
		} catch (error) {
			console.warn('Device capability detection failed:', error);
			webGLSupported = false;
			threeDEnabled = false;
		}
	}
	
	async function initializeThreeJS(): Promise<void> {
		if (!threeDEnabled || !webGLSupported) return;
		
		try {
			// Create shared renderer canvas
			const canvas = document.createElement('canvas');
			canvas.style.cssText = `
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				pointer-events: none;
				z-index: -1;
				opacity: 0;
			`;
			
			document.body.appendChild(canvas);
			
			// Initialize with mobile optimizations
			const rendererConfig = {
				canvas,
				alpha: true,
				antialias: !simplified3DMode,
				powerPreference: simplified3DMode ? 'low-power' : 'high-performance',
				enable4K: !simplified3DMode,
				enableHDR: !simplified3DMode,
				enablePostProcessing: !simplified3DMode,
				enableShadows: !simplified3DMode,
				shadowMapSize: simplified3DMode ? 512 : 2048,
				maxLights: simplified3DMode ? 2 : 6
			};
			
			sharedThreeRenderer = ThreeRenderer.createInstance(rendererConfig);
			webGLInitialized = await sharedThreeRenderer.initialize();
			
			if (webGLInitialized) {
				setContext('threeRenderer', sharedThreeRenderer);
				sharedThreeRenderer.startRenderLoop();
				console.log('Three.js renderer initialized successfully');
			} else {
				throw new Error('Three.js renderer initialization failed');
			}
			
		} catch (error) {
			console.warn('Three.js initialization failed:', error);
			webGLError = error instanceof Error ? error.message : 'Three.js initialization failed';
			webGLInitialized = false;
			threeDEnabled = false;
			setContext('webGLSupported', false);
		}
	}
	
	async function initializeObject3DRegistry(): Promise<void> {
		try {
			await initialize.objects3d();
			
			// Get initial object count
			const allObjects = Object3DRegistry.getAllObjects();
			object3DCount = allObjects.length;
			
			console.log('Object3D registry initialized with', object3DCount, 'objects');
		} catch (error) {
			console.warn('Object3D registry initialization failed:', error);
		}
	}
	
	async function initializeParticleSystem(): Promise<void> {
		try {
			// Particle system will be initialized by component
			console.log('Particle system ready for initialization');
		} catch (error) {
			console.warn('Particle system initialization failed:', error);
		}
	}
	
	async function initializeBookmarkSystem(): Promise<void> {
		try {
			await bookmarkStore.initialize?.();
			
			// Migrate legacy icons to 3D objects if needed
			if (threeDEnabled) {
				await bookmarkStore.migrateToObject3D?.();
			}
			
			console.log('Bookmark system initialized');
		} catch (error) {
			console.warn('Bookmark system initialization failed:', error);
		}
	}
	
	async function initializeUIComponents(): Promise<void> {
		try {
			// Setup keyboard shortcuts
			if (browser) {
				handleKeyboardShortcuts((shortcut) => {
					switch (shortcut) {
						case 'settings':
							toggleSettings();
							break;
						case 'search':
							focusSearch();
							break;
						case 'escape':
							handleEscape();
							break;
					}
				});
			}
			
			console.log('UI components initialized');
		} catch (error) {
			console.warn('UI component initialization failed:', error);
		}
	}
	
	async function finalizeInitialization(): Promise<void> {
		try {
			// Final optimizations
			if (threeDEnabled && sharedThreeRenderer) {
				// Warm up 3D object cache
				await Object3DRegistry.preloadCommonObjects?.();
			}
			
			// Start performance monitoring
			startPerformanceMonitoring();
			
			console.log('Application finalization complete');
		} catch (error) {
			console.warn('Finalization failed:', error);
		}
	}
	
	function handleInitializationFailure(error: unknown): void {
		console.error('Critical initialization failure:', error);
		
		// Show setup wizard for recovery
		setupStore.markIncomplete();
		isSetupComplete = false;
		isLoading = false;
		
		// Disable 3D features if they caused the failure
		if (error instanceof Error && error.message.includes('WebGL')) {
			threeDEnabled = false;
			webGLSupported = false;
		}
	}
	
	function calculateOptimalParticleCount(): number {
		if (!mounted || !windowWidth || !windowHeight) return 50;
		
		const screenArea = windowWidth * windowHeight;
		const baseCount = Math.sqrt(screenArea) / 25;
		
		// Performance adjustments
		const mobileMultiplier = isMobile ? 0.4 : 1;
		const fpsMultiplier = currentFps >= 50 ? 1 : 0.6;
		const objectMultiplier = Math.max(0.3, 1 - (object3DCount * 0.03));
		const modeMultiplier = componentConfig.performanceMode === 'high' ? 1.2 : 
							  componentConfig.performanceMode === 'medium' ? 0.9 : 0.5;
		
		const finalCount = Math.floor(
			baseCount * mobileMultiplier * fpsMultiplier * objectMultiplier * modeMultiplier
		);
		
		return Math.max(isMobile ? 15 : 25, Math.min(isMobile ? 60 : 120, finalCount));
	}
	
	function startPerformanceMonitoring(): void {
		if (!browser) return;
		
		const monitor = () => {
			if (sharedThreeRenderer) {
				const metrics = sharedThreeRenderer.getPerformanceMetrics();
				currentFps = metrics.fps;
				memoryUsage = metrics.memoryUsage;
				
				// Auto-adjust performance if needed
				if (currentFps < 30 && componentConfig.performanceMode !== 'low') {
					console.warn('Low FPS detected, reducing performance settings');
					componentConfig = COMPONENT_PRESETS.low;
					simplified3DMode = true;
				}
			}
		};
		
		setInterval(monitor, 2000); // Check every 2 seconds
	}
	
	// Event handlers
	function toggleSettings(): void {
		showSettings = !showSettings;
		settingsOpacity.set(showSettings ? 1 : 0);
		
		if (showSettings) {
			particleScale.set(0.95);
		} else {
			particleScale.set(1);
		}
	}
	
	function focusSearch(): void {
		if (searchBarElement) {
			searchBarElement.focus();
			searchFocused = true;
		}
	}
	
	function handleEscape(): void {
		if (showSettings) {
			toggleSettings();
		} else if (searchFocused) {
			searchFocused = false;
			searchBarElement?.blur();
		}
	}
	
	function handleWallpaperChange(wallpaperPath: string): void {
		// Update dominant color from new wallpaper
		if (wallpaperPath && browser) {
			common.extractDominantColor?.(wallpaperPath)
				.then(color => {
					if (color) {
						colorStore.updateDominantColor(color);
					}
				})
				.catch(console.warn);
		}
	}
	
	function handleCategoryClick(event: CustomEvent): void {
		const { category } = event.detail;
		lastInteraction = Date.now();
		
		// Track 3D object usage
		if (category.objectId && threeDEnabled) {
			Object3DRegistry.recordUsage?.(category.objectId);
		}
	}
	
	function handleSettingsUpdate(event: CustomEvent): void {
		const newSettings = event.detail;
		
		// Handle 3D mode toggle
		if (newSettings.enable3D !== threeDEnabled) {
			if (newSettings.enable3D && webGLSupported) {
				initializeThreeJS();
			} else if (!newSettings.enable3D && sharedThreeRenderer) {
				sharedThreeRenderer.stopRenderLoop();
				threeDEnabled = false;
			}
		}
		
		// Update performance settings
		if (newSettings.performance3D) {
			componentConfig = COMPONENT_PRESETS[newSettings.performance3D] || componentConfig;
		}
	}
	
	function retryInitialization(): void {
		loadingError = null;
		isLoading = true;
		
		// Reset state and retry
		tick().then(() => {
			location.reload(); // Simple but effective recovery
		});
	}
	
	function cleanupApplication(): void {
		try {
			if (sharedThreeRenderer) {
				sharedThreeRenderer.dispose();
			}
			
			cleanup.all();
			console.log('Application cleanup complete');
		} catch (error) {
			console.warn('Cleanup error:', error);
		}
	}
	
	// Window resize handler
	const debouncedResize = debounce(() => {
		if (sharedThreeRenderer) {
			// Renderer handles its own resize
		}
		
		// Update mobile detection
		isMobile = windowWidth < 768;
		
		// Update simplified mode if needed
		if (isMobile && !simplified3DMode) {
			simplified3DMode = true;
			componentConfig = COMPONENT_PRESETS.balanced;
		}
	}, 250);
	
	$: if (windowWidth && windowHeight) {
		debouncedResize();
	}
</script>

<svelte:window 
	bind:innerWidth={windowWidth} 
	bind:innerHeight={windowHeight}
/>

<main 
	class="particle-nexus"
	class:loading={isLoading}
	class:setup-mode={!isSetupComplete}
	class:settings-open={showSettings}
	class:webgl-supported={webGLSupported}
	class:three-d-enabled={threeDEnabled && webGLInitialized}
	class:simplified-3d={simplified3DMode}
	class:mobile={isMobile}
	style="
		--ui-opacity: {$uiOpacity};
		--particle-scale: {$particleScale};
		--three-d-scale: {$threeDTransition};
		--loading-progress: {$loadingProgress}%;
		--window-width: {windowWidth}px;
		--window-height: {windowHeight}px;
	"
>
	{#if isLoading}
		<div class="loading-screen">
			<div class="loading-content">
				<div class="loading-logo">
					<div class="logo-3d">
						<div class="logo-face front">PN</div>
						<div class="logo-face back">3D</div>
					</div>
				</div>
				
				<h1 class="loading-title">Particle Nexus</h1>
				
				<div class="progress-container">
					<div class="progress-bar">
						<div 
							class="progress-fill" 
							style="width: {$loadingProgress}%"
						></div>
					</div>
					<div class="progress-text">
						{#if $loadingProgress < 10}
							Initializing background system...
						{:else if $loadingProgress < 20}
							Loading color engine...
						{:else if $loadingProgress < 30}
							Configuring settings...
						{:else if $loadingProgress < 40}
							Detecting device capabilities...
						{:else if $loadingProgress < 50}
							{threeDEnabled ? 'Initializing WebGL renderer...' : 'Setting up 2D fallback...'}
						{:else if $loadingProgress < 60}
							Loading 3D object registry...
						{:else if $loadingProgress < 70}
							Preparing particle system...
						{:else if $loadingProgress < 80}
							Initializing bookmarks...
						{:else if $loadingProgress < 90}
							Setting up user interface...
						{:else if $loadingProgress < 100}
							Finalizing experience...
						{:else}
							Ready!
						{/if}
					</div>
				</div>
				
				{#if webGLError}
					<div class="webgl-warning">
						<span class="warning-icon">⚠️</span>
						<span>3D features unavailable: {webGLError}</span>
					</div>
				{/if}
			</div>
		</div>
	{:else if loadingError}
		<ErrorBoundary 
			error={loadingError}
			onRetry={retryInitialization}
			context="Application Initialization"
		/>
	{:else}
		<!-- Background Layer (loads first) -->
		<Background
			settings={currentSettings}
			wallpapers={currentWallpapers}
			on:wallpaperChange={(e) => handleWallpaperChange(e.detail.path)}
		/>
		
		<!-- Particle System Layer -->
		{#if mounted && isSetupComplete && isInitialized}
			<div 
				class="particle-layer"
				style="transform: scale({$particleScale})"
				role="presentation"
				aria-hidden="true"
			>
				<ParticleSystem
					count={particleCount}
					{windowWidth}
					{windowHeight}
					{dominantColor}
					settings={currentSettings?.particles}
					config={componentConfig}
				/>
			</div>
		{/if}
		
		<!-- UI Layer -->
		{#if isSetupComplete && isInitialized}
			<div 
				class="ui-layer" 
				style="opacity: {$uiOpacity}"
			>
				<div class="main-content">
					<!-- Search Bar -->
					<SearchBar
						bind:this={searchBarElement}
						bind:focused={searchFocused}
						placeholder="Search bookmarks..."
						config={componentConfig}
					/>
					
					<!-- Bookmark Grid with 3D Objects -->
					<BookmarkGrid
						categories={currentBookmarks.categories || []}
						searchQuery=""
						className="main-grid"
						on:categoryClick={handleCategoryClick}
						on:categoryReposition={(e) => bookmarkStore.reorderCategories?.(e.detail)}
						on:categoryObjectChange={(e) => bookmarkStore.updateCategoryObject?.(e.detail)}
					/>
				</div>
				
				<!-- Settings Toggle -->
				<button 
					class="settings-toggle"
					class:active={showSettings}
					class:three-d-active={threeDEnabled}
					on:click={toggleSettings}
					aria-label="Toggle settings"
				>
					<span class="settings-icon" class:spinning={showSettings}>⚙️</span>
					{#if threeDEnabled}
						<div class="three-d-indicator"></div>
					{/if}
				</button>
			</div>
			
			<!-- Settings Panel Overlay -->
			{#if showSettings}
				<div 
					class="settings-overlay"
					style="opacity: {$settingsOpacity}"
					role="dialog"
					aria-modal="true"
				>
					<SettingsPanel
						settings={currentSettings}
						wallpapers={currentWallpapers}
						config={componentConfig}
						webGLSupported={webGLSupported}
						simplified3DMode={simplified3DMode}
						on:close={toggleSettings}
						on:settingsUpdate={handleSettingsUpdate}
					/>
				</div>
			{/if}
		{:else}
			<!-- Setup Wizard -->
			<SetupWizard
				config={componentConfig}
				webGLSupported={webGLSupported}
				isMobile={isMobile}
				on:complete={() => setupStore.markComplete()}
				on:skip={() => setupStore.markComplete()}
			/>
		{/if}
	{/if}
</main>

<style>
	.particle-nexus {
		position: relative;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background: var(--neutral-black, #000);
		color: var(--neutral-white, #fff);
		font-family: var(--font-family-sans);
		transition: filter 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.particle-nexus.settings-open {
		filter: blur(2px) brightness(0.7);
	}
	
	.particle-nexus.three-d-enabled {
		transform: translate3d(0, 0, 0);
		backface-visibility: hidden;
		perspective: 1000px;
	}
	
	.particle-nexus.simplified-3d {
		transform: translateZ(0);
	}
	
	/* Loading Screen */
	.loading-screen {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, 
			rgba(20, 20, 30, 0.95) 0%,
			rgba(40, 40, 60, 0.95) 100%);
		backdrop-filter: blur(20px);
		z-index: 1000;
	}
	
	.loading-content {
		text-align: center;
		max-width: 400px;
		padding: 2rem;
	}
	
	.loading-logo {
		margin-bottom: 2rem;
		perspective: 1000px;
	}
	
	.logo-3d {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 0 auto;
		transform-style: preserve-3d;
		animation: logoRotate 4s linear infinite;
	}
	
	.logo-face {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: bold;
		border-radius: 12px;
		background: linear-gradient(135deg, #4a90e2, #7b68ee);
		color: white;
		box-shadow: 0 4px 20px rgba(74, 144, 226, 0.3);
	}
	
	.logo-face.back {
		transform: rotateY(180deg);
		background: linear-gradient(135deg, #7b68ee, #4a90e2);
	}
	
	.loading-title {
		font-size: 2rem;
		font-weight: 300;
		margin-bottom: 2rem;
		background: linear-gradient(135deg, #4a90e2, #7b68ee);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	
	.progress-container {
		margin-bottom: 1rem;
	}
	
	.progress-bar {
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 1rem;
	}
	
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4a90e2, #7b68ee);
		border-radius: 2px;
		transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 0 10px rgba(74, 144, 226, 0.5);
	}
	
	.progress-text {
		font-size: 0.875rem;
		opacity: 0.8;
		animation: fadeInOut 2s ease-in-out infinite;
	}
	
	.webgl-warning {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.75rem;
		background: rgba(255, 193, 7, 0.1);
		border: 1px solid rgba(255, 193, 7, 0.3);
		border-radius: 8px;
		font-size: 0.75rem;
		color: rgba(255, 193, 7, 0.9);
	}
	
	/* Particle Layer */
	.particle-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 1;
		transform-origin: center;
		transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	/* UI Layer */
	.ui-layer {
		position: relative;
		z-index: 10;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		pointer-events: none;
		transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
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
	
	/* Settings Toggle */
	.settings-toggle {
		position: fixed;
		top: 1.5rem;
		right: 1.5rem;
		z-index: 20;
		width: 3rem;
		height: 3rem;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}
	
	.settings-toggle:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
		transform: translateY(-2px) scale(1.05);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}
	
	.settings-toggle:active {
		transform: translateY(0) scale(0.95);
	}
	
	.settings-toggle.active {
		background: rgba(74, 144, 226, 0.8);
		color: white;
		box-shadow: 0 0 20px rgba(74, 144, 226, 0.5);
	}
	
	.settings-toggle.three-d-active {
		border-color: rgba(123, 104, 238, 0.8);
	}
	
	.settings-icon {
		transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
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
		background: #7b68ee;
		border-radius: 50%;
		box-shadow: 0 0 8px #7b68ee;
		animation: pulse3D 2s ease-in-out infinite;
	}
	
	/* Settings Overlay */
	.settings-overlay {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(20px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}
	
	/* Animations */
	@keyframes logoRotate {
		0%, 50% { transform: rotateY(0deg); }
		51%, 100% { transform: rotateY(180deg); }
	}
	
	@keyframes fadeInOut {
		0%, 100% { opacity: 0.8; }
		50% { opacity: 1; }
	}
	
	@keyframes pulse3D {
		0%, 100% { 
			opacity: 0.8; 
			transform: scale(1); 
		}
		50% { 
			opacity: 1; 
			transform: scale(1.3); 
		}
	}
	
	/* Mobile Optimizations */
	@media (max-width: 768px) {
		.main-content {
			padding: 1rem;
			gap: 1.5rem;
		}
		
		.settings-toggle {
			top: 1rem;
			right: 1rem;
			width: 2.5rem;
			height: 2.5rem;
			font-size: 1rem;
		}
		
		.loading-title {
			font-size: 1.5rem;
		}
		
		.logo-3d {
			width: 60px;
			height: 60px;
		}
		
		.logo-face {
			font-size: 1.2rem;
		}
	}
	
	/* Reduced Motion */
	@media (prefers-reduced-motion: reduce) {
		.logo-3d {
			animation: none;
		}
		
		.settings-icon {
			transition: none;
		}
		
		.three-d-indicator {
			animation: none;
		}
		
		.progress-text {
			animation: none;
		}
	}
	
	/* High Contrast Mode */
	@media (prefers-contrast: high) {
		.settings-toggle {
			border: 2px solid white;
			background: black;
		}
		
		.progress-fill {
			background: white;
		}
	}
</style>
