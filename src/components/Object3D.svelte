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
		WebGLContextManager
	} from '$lib/objects3d';
	import { PerformanceMonitor } from '$lib/performance';
	import { settings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { ThreeRenderer } from '$lib/three-renderer';
	
	export let bookmarkCategory: BookmarkCategory | null = null;
	export let objectId: string = '';
	export let position: { x: number; y: number } = { x: 0, y: 0 };
	export let size: number = 80;
	export let isActive: boolean = false;
	export let config: Object3DConfig | null = null;
	export let scale: number = 1.0;
	export let enableAnimation: boolean = true;
	export let animationSpeed: number = 1.0;
	export let previewMode: boolean = false;
	export let staticPreview: boolean = false;
	export let customization: any = null;
	export let dominantColor: string = '';
	export let fallbackTo2D: boolean = true;
	
	const dispatch = createEventDispatcher();
	const performanceMonitor = new PerformanceMonitor();
	
	$: componentMode = staticPreview ? 'static' : 
					  previewMode ? 'preview' : 
					  bookmarkCategory ? 'bookmark' : 'preview';
	
	let canvasElement: HTMLCanvasElement;
	let containerElement: HTMLElement;
	let sharedRenderer: ThreeRenderer | null = null;
	let dedicatedRenderer: THREE.WebGLRenderer | null = null;
	let scene: THREE.Scene | null = null;
	let camera: THREE.PerspectiveCamera | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let objectInstance: Object3DInstance | null = null;
	let objectConfig: Object3DConfig | null = null;
	let isInitialized = false;
	let hasError = false;
	let isHovered = false;
	let lastFrameTime = 0;
	let animationFrameId = 0;
	
	$: sharedRenderer = getContext('threeRenderer') || null;
	$: webGLSupported = getContext('webGLSupported') !== false;
	$: currentSettings = get(settings);
	$: colorPalette = get(colorStore);
	$: currentDominantColor = dominantColor || colorPalette.current || '#4a90e2';
	$: effectiveObjectId = objectId || config?.id || bookmarkCategory?.objectId || '';
	$: effectiveScale = scale * (currentSettings.globalScale || 1.0);
	$: shouldAnimate = enableAnimation && currentSettings.enableAnimations && !staticPreview;
	$: effectiveAnimationSpeed = animationSpeed * (currentSettings.animationSpeed || 1.0);
	
	onMount(async () => {
		if (!browser || !webGLSupported) {
			handleError('WebGL not supported');
			return;
		}
		
		try {
			await initializeComponent();
		} catch (error) {
			console.error('Object3D initialization failed:', error);
			handleError(error instanceof Error ? error.message : 'Unknown error');
		}
	});
	
	onDestroy(() => {
		cleanup();
	});
	
	async function initializeComponent(): Promise<void> {
		const profileId = performanceMonitor.startProfile('Object3D-init');
		
		try {
			if (!effectiveObjectId) {
				throw new Error('No object ID provided');
			}
			
			await loadObjectConfig();
			await setupRenderer();
			await createObjectInstance();
			
			if (shouldAnimate && objectInstance) {
				AnimationSystem.createIdleAnimation(objectInstance);
			}
			
			if (dedicatedRenderer && componentMode !== 'bookmark') {
				startRenderLoop();
			}
			
			isInitialized = true;
			
		} catch (error) {
			console.error('Component initialization failed:', error);
			await handleError(error instanceof Error ? error.message : 'Unknown error');
		} finally {
			performanceMonitor.endProfile(profileId);
		}
	}
	
	async function loadObjectConfig(): Promise<void> {
		if (config) {
			objectConfig = config;
			return;
		}
		
		try {
			const registry = Object3DRegistry;
			await registry.initialize();
			
			const foundConfig = registry.getObjectById?.(effectiveObjectId);
			if (!foundConfig) {
				throw new Error(`Object not found: ${effectiveObjectId}`);
			}
			
			objectConfig = foundConfig;
		} catch (error) {
			throw new Error(`Failed to load object config: ${error}`);
		}
	}
	
	async function setupRenderer(): Promise<void> {
		if (componentMode === 'bookmark' && sharedRenderer) {
			return;
		}
		
		if (!canvasElement) {
			throw new Error('Canvas element not available');
		}
		
		try {
			const webGL = WebGLContextManager.getInstance();
			dedicatedRenderer = webGL.createRenderer(canvasElement);
			
			scene = new THREE.Scene();
			camera = new THREE.PerspectiveCamera(75, canvasElement.width / canvasElement.height, 0.1, 1000);
			camera.position.z = 5;
			
			const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
			scene.add(ambientLight);
			
			const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
			directionalLight.position.set(5, 5, 5);
			scene.add(directionalLight);
			
		} catch (error) {
			throw new Error(`Renderer setup failed: ${error}`);
		}
	}
	
	async function createObjectInstance(): Promise<void> {
		if (!objectConfig) {
			throw new Error('No object configuration available');
		}
		
		try {
			const registry = Object3DRegistry;
			objectInstance = await registry.createInstance(objectConfig.id, {
				position: componentMode === 'bookmark' ? position : { x: 0, y: 0 },
				scale: effectiveScale,
				dominantColor: currentDominantColor,
				customization: customization || {}
			});
			
			if (!objectInstance) {
				throw new Error('Failed to create object instance');
			}
			
			if (scene && componentMode !== 'bookmark') {
				scene.add(objectInstance.mesh);
			}
			
		} catch (error) {
			throw new Error(`Object creation failed: ${error}`);
		}
	}
	
	function startRenderLoop(): void {
		const render = (time: number) => {
			if (!isInitialized || !dedicatedRenderer || !scene || !camera) return;
			
			const deltaTime = time - lastFrameTime;
			lastFrameTime = time;
			
			if (shouldAnimate && objectInstance) {
				AnimationSystem.update(objectInstance.id, deltaTime);
			}
			
			dedicatedRenderer.render(scene, camera);
			
			if (shouldAnimate) {
				animationFrameId = requestAnimationFrame(render);
			}
		};
		
		animationFrameId = requestAnimationFrame(render);
	}
	
	async function handleError(message: string): Promise<void> {
		hasError = true;
		console.error('Object3D Error:', message);
		
		if (fallbackTo2D) {
			dispatch('fallback', { reason: message });
		} else {
			dispatch('error', { message });
		}
	}
	
	function handleClick(event: MouseEvent | KeyboardEvent): void {
		if (hasError) return;
		dispatch('click', { event, objectId: effectiveObjectId, instance: objectInstance });
	}
	
	function handleMouseEnter(): void {
		isHovered = true;
		if (objectInstance) {
			objectInstance.state.isHovered = true;
			objectInstance.state.isIdle = false;
		}
	}
	
	function handleMouseLeave(): void {
		isHovered = false;
		if (objectInstance) {
			objectInstance.state.isHovered = false;
			objectInstance.state.isIdle = !isActive;
		}
	}
	
	function handleContextMenu(event: MouseEvent): void {
		event.preventDefault();
		dispatch('contextmenu', { event, objectId: effectiveObjectId, instance: objectInstance });
	}
	
	function handleKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick(event);
		}
	}
	
	export function updateConfiguration(newConfig: Partial<Object3DConfig>): void {
		try {
			if (objectConfig && objectInstance) {
				objectConfig = { ...objectConfig, ...newConfig };
				
				if (newConfig.scale !== undefined) {
					objectInstance.mesh.scale.setScalar(newConfig.scale * effectiveScale);
				}
				
				if (newConfig.opacity !== undefined) {
					const material = objectInstance.mesh.material as THREE.Material;
					if ('opacity' in material) {
						material.opacity = newConfig.opacity;
					}
				}
			}
			
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
		if (!objectInstance) return null;
		return performanceMonitor.getMetrics({ name: objectInstance.id });
	}
	
	function cleanup(): void {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = 0;
		}
		
		if (objectInstance) {
			AnimationSystem.dispose(objectInstance.id);
			Object3DRegistry.disposeInstance(objectInstance);
			objectInstance = null;
		}
		
		if (dedicatedRenderer) {
			dedicatedRenderer.dispose();
			dedicatedRenderer = null;
		}
		
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		
		scene = null;
		camera = null;
		isInitialized = false;
		performanceMonitor.destroy();
	}
	
	$: if (isInitialized && currentDominantColor && objectInstance) {
		ColorAdapter.adaptMaterial(
			objectInstance.mesh.material,
			{ ...colorPalette, dominant: currentDominantColor },
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
		objectInstance.mesh.scale.setScalar(effectiveScale);
	}
	
	$: if (isInitialized && isActive !== objectInstance?.state.isActive) {
		if (objectInstance) {
			objectInstance.state.isActive = isActive;
			objectInstance.state.isIdle = !isActive && !isHovered;
		}
	}
</script>

{#if componentMode === 'bookmark'}
	<div 
		class="object-3d-bookmark"
		class:active={isActive}
		class:hovered={isHovered}
		class:error={hasError}
		style="--object-size: {size}px;"
		bind:this={containerElement}
		on:click={handleClick}
		on:keydown={handleKeyDown}
		on:mouseenter={handleMouseEnter}
		on:mouseleave={handleMouseLeave}
		on:contextmenu={handleContextMenu}
		role="button"
		tabindex="0"
		aria-label={bookmarkCategory ? `3D object for ${bookmarkCategory.name}` : '3D object'}
		aria-pressed={isActive}
	>
		{#if hasError && fallbackTo2D}
			<div class="fallback-2d" aria-label="2D fallback representation">
				<div class="fallback-icon">📦</div>
			</div>
		{/if}
	</div>
{:else}
	<div 
		class="object-3d-container"
		class:preview-mode={previewMode}
		class:static-preview={staticPreview}
		class:error={hasError}
		bind:this={containerElement}
		role="img"
		aria-label={objectConfig ? `3D preview of ${objectConfig.name}` : '3D object preview'}
	>
		<canvas
			bind:this={canvasElement}
			width="400"
			height="400"
		></canvas>
		
		{#if hasError}
			<div class="error-overlay" role="alert">
				<div class="error-icon">⚠️</div>
				<div class="error-message">3D object failed to load</div>
				{#if fallbackTo2D}
					<div class="fallback-2d">
						<div class="fallback-icon">📦</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.object-3d-bookmark {
		position: absolute;
		width: var(--object-size);
		height: var(--object-size);
		cursor: pointer;
		transition: transform 0.2s ease;
		outline: none;
		border-radius: 8px;
	}
	
	.object-3d-bookmark:focus-visible {
		outline: 2px solid #4a90e2;
		outline-offset: 2px;
	}
	
	.object-3d-bookmark:hover {
		transform: scale(1.05);
	}
	
	.object-3d-bookmark.active {
		transform: scale(1.1);
	}
	
	.object-3d-bookmark.error {
		opacity: 0.6;
	}
	
	.object-3d-container {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.object-3d-container.preview-mode {
		border-radius: 12px;
		overflow: hidden;
	}
	
	canvas {
		display: block;
		max-width: 100%;
		max-height: 100%;
	}
	
	.fallback-2d {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		backdrop-filter: blur(10px);
	}
	
	.fallback-icon {
		font-size: 2rem;
		opacity: 0.7;
	}
	
	.error-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.8);
		color: white;
		border-radius: 8px;
	}
	
	.error-icon {
		font-size: 2rem;
		margin-bottom: 8px;
	}
	
	.error-message {
		font-size: 0.875rem;
		text-align: center;
		margin-bottom: 16px;
	}
</style>
