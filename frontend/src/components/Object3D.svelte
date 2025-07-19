<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, getContext, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import * as THREE from 'three';
	
	import type { BookmarkCategory } from '$stores/bookmarks';
	import type { Object3DConfig, Object3DInstance } from '$lib/objects3d';
	import { 
		Object3DRegistry, 
		AnimationSystem, 
		ColorAdapter,
		WebGLContextManager,
		ComponentPerformanceMonitor
	} from '$lib/objects3d';
	import { objects3DSettings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { ThreeRenderer } from '$lib/three-renderer';
	
	// ===== PROPS =====
	
	// Bookmark mode props
	export let bookmarkCategory: BookmarkCategory | null = null;
	export let objectId: string = '';
	export let position: { x: number; y: number } = { x: 0, y: 0 };
	export let size: number = 80;
	export let isActive: boolean = false;
	
	// Preview mode props
	export let config: Object3DConfig | null = null;
	export let scale: number = 1.0;
	export let enableAnimation: boolean = true;
	export let animationSpeed: number = 1.0;
	export let enableGlow: boolean = true;
	export let enableShadows: boolean = true;
	export let previewMode: boolean = false;
	export let staticPreview: boolean = false;
	
	// Advanced props
	export let customization: any = null;
	export let dominantColor: string = '';
	export let fallbackTo2D: boolean = true;
	
	// ===== INTERNAL STATE =====
	
	const dispatch = createEventDispatcher();
	const performanceMonitor = ComponentPerformanceMonitor.getInstance();
	
	// Component mode detection
	$: componentMode = staticPreview ? 'static' : 
					  previewMode ? 'preview' : 
					  bookmarkCategory ? 'bookmark' : 'preview';
	
	// Canvas and renderer references
	let canvasElement: HTMLCanvasElement;
	let containerElement: HTMLElement;
	let sharedRenderer: ThreeRenderer | null = null;
	let dedicatedRenderer: THREE.WebGLRenderer | null = null;
	let scene: THREE.Scene | null = null;
	let camera: THREE.PerspectiveCamera | null = null;
	
	// 3D object state
	let objectInstance: Object3DInstance | null = null;
	let objectConfig: Object3DConfig | null = null;
	let isInitialized = false;
	let hasError = false;
	let isHovered = false;
	let lastFrameTime = 0;
	
	// Context
	$: sharedRenderer = getContext('threeRenderer') || null;
	$: webGLSupported = getContext('webGLSupported') !== false;
	
	// Reactive values
	$: settings = get(objects3DSettings);
	$: colorPalette = get(colorStore);
	$: currentDominantColor = dominantColor || colorPalette.current || '#4a90e2';
	$: effectiveObjectId = objectId || config?.id || bookmarkCategory?.objectId || '';
	$: effectiveScale = scale * (settings.globalScale || 1.0);
	$: shouldAnimate = enableAnimation && settings.enableAnimations && !staticPreview;
	$: effectiveAnimationSpeed = animationSpeed * (settings.animationSpeed || 1.0);
	
	// ===== LIFECYCLE =====
	
	onMount(async () => {
		if (!browser || !webGLSupported) {
			handleError('WebGL not supported');
			return;
		}
		
		try {
			await initializeComponent();
		} catch (error) {
			console.error('Object3D initialization failed:', error);
			handleError(error.message);
		}
	});
	
	onDestroy(() => {
		cleanup();
	});
	
	// ===== INITIALIZATION =====
	
	async function initializeComponent(): Promise<void> {
		const endPerformanceTracking = performanceMonitor.startRender('Object3D');
		
		try {
			// Load object configuration
			await loadObjectConfig();
			
			// Setup renderer based on mode
			await setupRenderer();
			
			// Create 3D object instance
			await createObjectInstance();
			
			// Setup animations if enabled
			if (shouldAnimate && objectInstance) {
				AnimationSystem.createIdleAnimation(objectInstance);
			}
			
			// Start render loop for dedicated renderer
			if (dedicatedRenderer && componentMode !== 'bookmark') {
				startRenderLoop();
			}
			
			isInitialized = true;
			
		} catch (error) {
			console.error('Component initialization failed:', error);
			await handleError(error.message);
		} finally {
			endPerformanceTracking();
		}
	}
	
	async function loadObjectConfig(): Promise<void> {
		// Try to get config from props first
		if (config) {
			objectConfig = config;
			return;
		}
		
		// Try to load from registry
		if (effectiveObjectId) {
			objectConfig = Object3DRegistry.getObject(effectiveObjectId);
			if (objectConfig) return;
		}
		
		// Fallback to a geometric shape
		console.warn(`Object not found: ${effectiveObjectId}, using fallback`);
		objectConfig = Object3DRegistry.getObject('geometric/sphere') || 
					  Object3DRegistry.getAllObjects().find(obj => obj.category === 'geometric');
		
		if (!objectConfig) {
			throw new Error('No fallback object available');
		}
	}
	
	async function setupRenderer(): Promise<void> {
		if (componentMode === 'bookmark' && sharedRenderer) {
			// Use shared renderer for bookmark mode
			scene = sharedRenderer.scene;
			camera = sharedRenderer.camera;
			return;
		}
		
		// Create dedicated renderer for preview modes
		await tick(); // Ensure canvas is mounted
		
		if (!canvasElement) {
			throw new Error('Canvas element not available');
		}
		
		// Setup camera
		camera = new THREE.PerspectiveCamera(
			50,
			canvasElement.clientWidth / canvasElement.clientHeight,
			0.1,
			1000
		);
		camera.position.set(0, 0, 3);
		
		// Setup scene
		scene = new THREE.Scene();
		scene.background = null; // Transparent background
		
		// Setup lighting
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambientLight);
		
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(5, 5, 5);
		if (settings.enableShadows && enableShadows) {
			directionalLight.castShadow = true;
			directionalLight.shadow.mapSize.setScalar(1024);
		}
		scene.add(directionalLight);
		
		// Setup renderer
		dedicatedRenderer = new THREE.WebGLRenderer({ 
			canvas: canvasElement,
			alpha: true,
			antialias: settings.antiAliasing !== false,
			powerPreference: settings.performanceMode === 'high' ? 'high-performance' : 'default'
		});
		
		dedicatedRenderer.setSize(canvasElement.clientWidth, canvasElement.clientHeight);
		dedicatedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.renderResolution || 1));
		dedicatedRenderer.shadowMap.enabled = settings.enableShadows && enableShadows;
		dedicatedRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
		
		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			if (dedicatedRenderer && camera && canvasElement) {
				const width = canvasElement.clientWidth;
				const height = canvasElement.clientHeight;
				
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
				dedicatedRenderer.setSize(width, height);
			}
		});
		resizeObserver.observe(canvasElement);
	}
	
	async function createObjectInstance(): Promise<void> {
		if (!objectConfig || !scene) {
			throw new Error('Missing object config or scene');
		}
		
		try {
			// Create instance using registry
			objectInstance = await Object3DRegistry.createInstance(
				objectConfig.id, 
				colorPalette.palette
			);
			
			if (!objectInstance) {
				throw new Error('Failed to create object instance');
			}
			
			// Apply customizations
			applyCustomizations();
			
			// Apply color adaptation
			if (currentDominantColor) {
				ColorAdapter.adaptMaterial(
					objectInstance.mesh.material,
					{ ...colorPalette.palette, dominant: currentDominantColor },
					objectConfig.colorAdaptation
				);
			}
			
			// Apply transformations
			objectInstance.mesh.scale.setScalar(effectiveScale);
			
			if (componentMode === 'bookmark') {
				// Position based on grid position
				objectInstance.mesh.position.set(
					(position.x - 2) * 2, 
					-(position.y - 1) * 2, 
					0
				);
			} else {
				// Center for preview modes
				objectInstance.mesh.position.set(0, 0, 0);
			}
			
			// Add to scene
			scene.add(objectInstance.mesh);
			
		} catch (error) {
			console.error('Object instance creation failed:', error);
			throw error;
		}
	}
	
	function applyCustomizations(): void {
		if (!objectInstance || !objectConfig) return;
		
		// Apply bookmark category customizations
		if (bookmarkCategory?.objectCustomization) {
			const custom = bookmarkCategory.objectCustomization;
			
			if (custom.scale !== undefined) {
				objectInstance.mesh.scale.multiplyScalar(custom.scale);
			}
			
			if (custom.rotation) {
				objectInstance.mesh.rotation.set(...custom.rotation);
			}
			
			// Apply material customizations
			if (custom.materialType && custom.materialType !== 'standard') {
				// Could implement material switching here
			}
		}
		
		// Apply component-level customizations
		if (customization) {
			// Apply any additional customizations passed as props
			Object.entries(customization).forEach(([key, value]) => {
				// Apply based on key type
			});
		}
	}
	
	// ===== RENDER LOOP =====
	
	function startRenderLoop(): void {
		if (!dedicatedRenderer || !scene || !camera) return;
		
		const animate = (time: number) => {
			if (!dedicatedRenderer || !scene || !camera) return;
			
			// Update animations
			const deltaTime = (time - lastFrameTime) / 1000;
			lastFrameTime = time;
			
			if (shouldAnimate) {
				AnimationSystem.update(deltaTime);
			}
			
			// Update object state
			if (objectInstance) {
				objectInstance.state.isHovered = isHovered;
				objectInstance.state.isIdle = !isActive && !isHovered;
			}
			
			// Render
			dedicatedRenderer.render(scene, camera);
			
			// Performance tracking
			if (objectInstance) {
				performanceMonitor.record3DMetrics(
					objectInstance.id,
					deltaTime * 1000,
					0, // Memory usage - would need to calculate
					1  // Draw calls - simplified
				);
			}
			
			requestAnimationFrame(animate);
		};
		
		requestAnimationFrame(animate);
	}
	
	// ===== EVENT HANDLERS =====
	
	function handleClick(event: MouseEvent): void {
		if (componentMode !== 'bookmark') return;
		
		event.stopPropagation();
		
		dispatch('click', {
			category: bookmarkCategory,
			objectId: effectiveObjectId,
			position,
			event
		});
	}
	
	function handleMouseEnter(event: MouseEvent): void {
		isHovered = true;
		
		if (objectInstance && settings.interaction.enableHover) {
			// Trigger hover animation
			AnimationSystem.createHoverAnimation(objectInstance);
		}
		
		dispatch('hover', {
			category: bookmarkCategory,
			objectId: effectiveObjectId,
			isHovering: true,
			event
		});
	}
	
	function handleMouseLeave(event: MouseEvent): void {
		isHovered = false;
		
		dispatch('hover', {
			category: bookmarkCategory,
			objectId: effectiveObjectId,
			isHovering: false,
			event
		});
	}
	
	function handleContextMenu(event: MouseEvent): void {
		if (componentMode !== 'bookmark') return;
		
		event.preventDefault();
		event.stopPropagation();
		
		dispatch('contextmenu', {
			category: bookmarkCategory,
			objectId: effectiveObjectId,
			clientX: event.clientX,
			clientY: event.clientY,
			event
		});
	}
	
	// ===== ERROR HANDLING =====
	
	async function handleError(errorMessage: string): Promise<void> {
		hasError = true;
		console.warn('Object3D error:', errorMessage);
		
		dispatch('error', {
			error: errorMessage,
			objectId: effectiveObjectId,
			category: bookmarkCategory
		});
		
		// Try to load fallback object
		if (!objectConfig || objectConfig.id !== 'geometric/sphere') {
			try {
				objectConfig = Object3DRegistry.getObject('geometric/sphere');
				if (objectConfig && scene) {
					await createObjectInstance();
					hasError = false;
				}
			} catch (fallbackError) {
				console.error('Fallback object creation failed:', fallbackError);
			}
		}
	}
	
	// ===== PUBLIC API =====
	
	export function updateConfiguration(newSettings: any): void {
		if (!objectInstance) return;
		
		try {
			// Update scale
			if (newSettings.globalScale !== undefined) {
				objectInstance.mesh.scale.setScalar(newSettings.globalScale);
			}
			
			// Update animations
			if (newSettings.enableAnimations !== undefined) {
				if (newSettings.enableAnimations && !shouldAnimate) {
					AnimationSystem.createIdleAnimation(objectInstance);
				} else if (!newSettings.enableAnimations && shouldAnimate) {
					AnimationSystem.dispose(objectInstance.id);
				}
			}
			
			// Update material properties based on settings
			if (newSettings.enableGlow !== undefined && objectInstance.mesh.material) {
				// Update emissive properties
				const material = objectInstance.mesh.material as THREE.MeshStandardMaterial;
				if (material.emissive) {
					material.emissiveIntensity = newSettings.enableGlow ? 0.3 : 0;
				}
			}
			
			// Force re-render
			if (dedicatedRenderer && scene && camera) {
				dedicatedRenderer.render(scene, camera);
			}
			
		} catch (error) {
			console.error('Configuration update failed:', error);
		}
	}
	
	export function getObjectInstance(): Object3DInstance | null {
		return objectInstance;
	}
	
	export function getPerformanceMetrics() {
		return performanceMonitor.get3DMetrics(objectInstance?.id);
	}
	
	// ===== CLEANUP =====
	
	function cleanup(): void {
		// Dispose animations
		if (objectInstance) {
			AnimationSystem.dispose(objectInstance.id);
		}
		
		// Dispose object instance
		if (objectInstance) {
			Object3DRegistry.disposeInstance(objectInstance);
			objectInstance = null;
		}
		
		// Dispose dedicated renderer
		if (dedicatedRenderer) {
			dedicatedRenderer.dispose();
			dedicatedRenderer = null;
		}
		
		// Clear references
		scene = null;
		camera = null;
		isInitialized = false;
	}
	
	// ===== REACTIVE UPDATES =====
	
	$: if (isInitialized && currentDominantColor && objectInstance) {
		// Update colors when wallpaper changes
		ColorAdapter.adaptMaterial(
			objectInstance.mesh.material,
			{ ...colorPalette.palette, dominant: currentDominantColor },
			objectConfig?.colorAdaptation || {
				mode: 'auto',
				intensity: 1,
				saturationBoost: 0.2,
				lightnessAdjust: 0,
				blendMode: 'normal',
				emissiveStrength: 0.3,
				transitionDuration: 800
			}
		);
	}
	
	$: if (isInitialized && effectiveScale && objectInstance) {
		// Update scale when settings change
		objectInstance.mesh.scale.setScalar(effectiveScale);
	}
	
	$: if (isInitialized && isActive !== objectInstance?.state.isIdle) {
		// Update active state
		if (objectInstance) {
			objectInstance.state.isIdle = !isActive;
		}
	}
</script>

<!-- Component markup based on mode -->
{#if componentMode === 'bookmark'}
	<!-- Bookmark mode: Invisible interaction layer over shared canvas -->
	<div 
		class="object-3d-bookmark"
		class:active={isActive}
		class:hovered={isHovered}
		class:error={hasError}
		style="--object-size: {size}px;"
		bind:this={containerElement}
		on:click={handleClick}
		on:mouseenter={handleMouseEnter}
		on:mouseleave={handleMouseLeave}
		on:contextmenu={handleContextMenu}
		role="button"
		tabindex="0"
		aria-label={bookmarkCategory ? `${bookmarkCategory.name} folder` : 'Bookmark folder'}
	>
		{#if hasError && fallbackTo2D}
			<!-- 2D fallback for bookmark mode -->
			<div class="fallback-icon">
				{bookmarkCategory?.iconId ? 
					(bookmarkCategory.iconId.includes('/') ? 
						bookmarkCategory.iconId.split('/')[1] : '📁') 
					: '📁'}
			</div>
		{/if}
	</div>
{:else}
	<!-- Preview modes: Dedicated canvas -->
	<div 
		class="object-3d-preview"
		class:static={staticPreview}
		class:preview={previewMode}
		class:error={hasError}
		bind:this={containerElement}
	>
		<canvas 
			bind:this={canvasElement}
			class="object-canvas"
			style="width: 100%; height: 100%;"
		></canvas>
		
		{#if hasError}
			<div class="error-overlay">
				<span class="error-icon">⚠️</span>
				<span class="error-text">Failed to load 3D object</span>
			</div>
		{/if}
		
		{#if !isInitialized && !hasError}
			<div class="loading-overlay">
				<div class="loading-spinner"></div>
				<span class="loading-text">Loading 3D object...</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.object-3d-bookmark {
		position: absolute;
		width: var(--object-size, 80px);
		height: var(--object-size, 80px);
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.3s ease;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.object-3d-bookmark:hover {
		transform: scale(1.1);
	}
	
	.object-3d-bookmark.active {
		transform: scale(1.2);
	}
	
	.object-3d-bookmark.error {
		background: rgba(255, 193, 7, 0.1);
		border: 2px dashed rgba(255, 193, 7, 0.5);
	}
	
	.fallback-icon {
		font-size: calc(var(--object-size, 80px) * 0.4);
		opacity: 0.8;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}
	
	.object-3d-preview {
		position: relative;
		width: 100%;
		height: 100%;
		border-radius: 8px;
		overflow: hidden;
		background: transparent;
	}
	
	.object-3d-preview.static {
		width: 120px;
		height: 120px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.object-3d-preview.preview {
		min-width: 200px;
		min-height: 200px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.object-3d-preview.error {
		border-color: rgba(239, 68, 68, 0.5);
		background: rgba(239, 68, 68, 0.1);
	}
	
	.object-canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	
	.error-overlay,
	.loading-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		color: white;
		font-size: 0.875rem;
		gap: 0.5rem;
	}
	
	.error-icon {
		font-size: 1.5rem;
	}
	
	.error-text {
		text-align: center;
		opacity: 0.9;
	}
	
	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	.loading-text {
		opacity: 0.8;
		font-size: 0.75rem;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	/* Responsive adjustments */
	@media (max-width: 768px) {
		.object-3d-bookmark {
			width: calc(var(--object-size, 80px) * 0.8);
			height: calc(var(--object-size, 80px) * 0.8);
		}
		
		.object-3d-preview.preview {
			min-width: 150px;
			min-height: 150px;
		}
	}
	
	/* Performance optimizations */
	@media (prefers-reduced-motion: reduce) {
		.object-3d-bookmark {
			transition: none;
		}
		
		.object-3d-bookmark:hover,
		.object-3d-bookmark.active {
			transform: none;
		}
		
		.loading-spinner {
			animation: none;
		}
	}
</style>
