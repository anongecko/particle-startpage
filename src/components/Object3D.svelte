<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, getContext, tick } from 'svelte';
	import { browser } from '$app/environment';
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
	import { objects3DSettings, colorSettings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { ThreeRenderer } from '$lib/three-renderer';
	
	interface Props {
		bookmarkCategory?: BookmarkCategory | null;
		objectId?: string;
		position?: { x: number; y: number };
		size?: number;
		isActive?: boolean;
		config?: Object3DConfig | null;
		scale?: number;
		enableAnimation?: boolean;
		animationSpeed?: number;
		previewMode?: boolean;
		staticPreview?: boolean;
		customization?: any;
		dominantColor?: string;
		fallbackTo2D?: boolean;
		interactive?: boolean;
	}
	
	let {
		bookmarkCategory = null,
		objectId = '',
		position = { x: 0, y: 0 },
		size = 80,
		isActive = false,
		config = null,
		scale = 1.0,
		enableAnimation = true,
		animationSpeed = 1.0,
		previewMode = false,
		staticPreview = false,
		customization = null,
		dominantColor = '',
		fallbackTo2D = true,
		interactive = true
	}: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let canvasElement: HTMLCanvasElement = $state();
	let containerElement: HTMLElement = $state();
	let sharedRenderer: ThreeRenderer | null = $state();
	let dedicatedRenderer: THREE.WebGLRenderer | null = $state();
	let scene: THREE.Scene | null = $state();
	let camera: THREE.PerspectiveCamera | null = $state();
	let resizeObserver: ResizeObserver | null = $state();
	let objectInstance: Object3DInstance | null = $state();
	let objectConfig: Object3DConfig | null = $state();
	let performanceMonitor: PerformanceMonitor = $state();
	let isInitialized = $state(false);
	let hasError = $state(false);
	let errorMessage = $state('');
	let isHovered = $state(false);
	let lastFrameTime = $state(0);
	let animationFrameId = $state(0);
	let webGLSupported = $state(true);
	
	let componentMode = $derived(staticPreview ? 'static' : 
								previewMode ? 'preview' : 
								bookmarkCategory ? 'bookmark' : 'preview');
	
	let currentSettings = $derived($objects3DSettings);
	let colorPalette = $derived($colorStore);
	let currentDominantColor = $derived(dominantColor || colorPalette?.current || '#4a90e2');
	let effectiveObjectId = $derived(objectId || config?.id || bookmarkCategory?.objectId || '');
	let effectiveScale = $derived(scale * (currentSettings?.globalScale || 1.0));
	let shouldAnimate = $derived(enableAnimation && currentSettings?.enableAnimations && !staticPreview);
	let effectiveAnimationSpeed = $derived(animationSpeed * (currentSettings?.animationSpeed || 1.0));
	
	onMount(async () => {
		if (!browser) {
			handleError('Not in browser environment');
			return;
		}
		
		// Initialize performance monitor
		performanceMonitor = new PerformanceMonitor();
		
		// Get context values
		const contextRenderer = getContext('threeRenderer');
		const contextWebGL = getContext('webGLSupported');
		
		sharedRenderer = contextRenderer || null;
		webGLSupported = contextWebGL !== false;
		
		if (!webGLSupported) {
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
		const profileId = performanceMonitor?.startProfile('Object3D-init');
		
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
			
			setupResizeObserver();
			isInitialized = true;
			
		} catch (error) {
			console.error('Component initialization failed:', error);
			handleError(error instanceof Error ? error.message : 'Unknown error');
		} finally {
			if (profileId && performanceMonitor) {
				performanceMonitor.endProfile(profileId);
			}
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
			camera = new THREE.PerspectiveCamera(
				75, 
				canvasElement.clientWidth / canvasElement.clientHeight, 
				0.1, 
				1000
			);
			camera.position.z = 5;
			
			// Add lighting
			const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
			scene.add(ambientLight);
			
			const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
			directionalLight.position.set(5, 5, 5);
			if (currentSettings?.enableShadows) {
				directionalLight.castShadow = true;
			}
			scene.add(directionalLight);
			
			// Configure renderer settings
			if (currentSettings?.antiAliasing) {
				dedicatedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			}
			
			if (currentSettings?.enableShadows) {
				dedicatedRenderer.shadowMap.enabled = true;
				dedicatedRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
			}
			
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
			
			// Configure material based on settings
			const material = objectInstance.mesh.material as THREE.Material;
			if (currentSettings?.materialQuality) {
				configureMaterialQuality(material, currentSettings.materialQuality);
			}
			
			if (scene && componentMode !== 'bookmark') {
				scene.add(objectInstance.mesh);
			}
			
		} catch (error) {
			throw new Error(`Object creation failed: ${error}`);
		}
	}
	
	function configureMaterialQuality(material: THREE.Material, quality: string): void {
		if ('roughness' in material && 'metalness' in material) {
			const physicalMaterial = material as THREE.MeshPhysicalMaterial;
			switch (quality) {
				case 'low':
					physicalMaterial.roughness = 0.8;
					physicalMaterial.metalness = 0.2;
					break;
				case 'medium':
					physicalMaterial.roughness = 0.5;
					physicalMaterial.metalness = 0.5;
					break;
				case 'high':
					physicalMaterial.roughness = 0.2;
					physicalMaterial.metalness = 0.8;
					break;
			}
		}
	}
	
	function setupResizeObserver(): void {
		if (!containerElement) return;
		
		resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (canvasElement && camera) {
					canvasElement.width = width;
					canvasElement.height = height;
					camera.aspect = width / height;
					camera.updateProjectionMatrix();
					
					if (dedicatedRenderer) {
						dedicatedRenderer.setSize(width, height);
					}
				}
			}
		});
		
		resizeObserver.observe(containerElement);
	}
	
	function startRenderLoop(): void {
		const render = (time: number) => {
			if (!isInitialized || !dedicatedRenderer || !scene || !camera) return;
			
			const deltaTime = time - lastFrameTime;
			lastFrameTime = time;
			
			if (shouldAnimate && objectInstance) {
				AnimationSystem.update(objectInstance.id, deltaTime * effectiveAnimationSpeed);
			}
			
			dedicatedRenderer.render(scene, camera);
			
			if (shouldAnimate) {
				animationFrameId = requestAnimationFrame(render);
			}
		};
		
		animationFrameId = requestAnimationFrame(render);
	}
	
	function handleError(message: string): void {
		hasError = true;
		errorMessage = message;
		console.error('Object3D Error:', message);
		
		if (fallbackTo2D) {
			dispatch('fallback', { reason: message });
		} else {
			dispatch('error', { message });
		}
	}
	
	function handleClick(event: MouseEvent | KeyboardEvent): void {
		if (hasError || !interactive) return;
		dispatch('click', { 
			event, 
			objectId: effectiveObjectId, 
			instance: objectInstance,
			config: objectConfig
		});
	}
	
	function handleMouseEnter(): void {
		if (!interactive) return;
		isHovered = true;
		if (objectInstance) {
			objectInstance.state.isHovered = true;
			objectInstance.state.isIdle = false;
			
			if (currentSettings?.interaction?.enableHover) {
				const hoverScale = currentSettings.interaction.hoverScale || 1.1;
				objectInstance.mesh.scale.multiplyScalar(hoverScale);
			}
		}
	}
	
	function handleMouseLeave(): void {
		if (!interactive) return;
		isHovered = false;
		if (objectInstance) {
			objectInstance.state.isHovered = false;
			objectInstance.state.isIdle = !isActive;
			
			if (currentSettings?.interaction?.enableHover) {
				objectInstance.mesh.scale.setScalar(effectiveScale);
			}
		}
	}
	
	function handleContextMenu(event: MouseEvent): void {
		if (!interactive) return;
		event.preventDefault();
		dispatch('contextmenu', { 
			event, 
			objectId: effectiveObjectId, 
			instance: objectInstance,
			config: objectConfig
		});
	}
	
	function handleKeyDown(event: KeyboardEvent): void {
		if (!interactive) return;
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
						material.transparent = newConfig.opacity < 1;
					}
				}
			}
			
			renderFrame();
		} catch (error) {
			console.error('Configuration update failed:', error);
		}
	}
	
	export function getObjectInstance(): Object3DInstance | null {
		return objectInstance;
	}
	
	export function getPerformanceMetrics() {
		if (!objectInstance || !performanceMonitor) return null;
		return performanceMonitor.getMetrics({ name: objectInstance.id });
	}
	
	function renderFrame(): void {
		if (dedicatedRenderer && scene && camera) {
			dedicatedRenderer.render(scene, camera);
		}
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
		
		if (performanceMonitor) {
			performanceMonitor.destroy();
		}
		
		scene = null;
		camera = null;
		isInitialized = false;
	}
	
	// Reactive updates
	$effect(() => {
		if (isInitialized && currentDominantColor && objectInstance && ColorAdapter) {
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
			renderFrame();
		}
	});
	
	$effect(() => {
		if (isInitialized && effectiveScale && objectInstance) {
			objectInstance.mesh.scale.setScalar(effectiveScale);
			renderFrame();
		}
	});
	
	$effect(() => {
		if (isInitialized && objectInstance && isActive !== objectInstance.state.isActive) {
			objectInstance.state.isActive = isActive;
			objectInstance.state.isIdle = !isActive && !isHovered;
			
			if (currentSettings?.interaction?.enableClick && isActive) {
				const clickScale = currentSettings.interaction.clickScale || 0.95;
				objectInstance.mesh.scale.multiplyScalar(clickScale);
				setTimeout(() => {
					if (objectInstance) {
						objectInstance.mesh.scale.setScalar(effectiveScale);
					}
				}, 100);
			}
		}
	});
</script>

{#if componentMode === 'bookmark'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div 
		class="object-3d-bookmark"
		class:active={isActive}
		class:hovered={isHovered}
		class:error={hasError}
		class:interactive
		style="--object-size: {size}px;"
		bind:this={containerElement}
		onclick={handleClick}
		onkeydown={handleKeyDown}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		oncontextmenu={handleContextMenu}
		role={interactive ? 'button' : 'img'}
		tabindex={interactive ? 0 : -1}
		aria-label={bookmarkCategory ? `3D object for ${bookmarkCategory.name}` : '3D object'}
		aria-pressed={interactive ? isActive : undefined}
		aria-describedby={hasError ? 'error-description' : undefined}
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
		aria-describedby={hasError ? 'error-description' : undefined}
	>
		<canvas
			bind:this={canvasElement}
			width={size}
			height={size}
			aria-hidden="true"
		></canvas>
		
		{#if hasError}
			<div class="error-overlay" role="alert">
				<div class="error-icon" aria-hidden="true">⚠️</div>
				<div class="error-message" id="error-description">
					{errorMessage || '3D object failed to load'}
				</div>
				{#if fallbackTo2D}
					<div class="fallback-2d">
						<div class="fallback-icon" aria-hidden="true">📦</div>
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
		transition: transform 0.2s ease;
		outline: none;
		border-radius: 8px;
	}
	
	.object-3d-bookmark.interactive {
		cursor: pointer;
	}
	
	.object-3d-bookmark:focus-visible {
		outline: 2px solid #4a90e2;
		outline-offset: 2px;
	}
	
	.object-3d-bookmark.interactive:hover {
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
		border-radius: inherit;
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
		padding: 16px;
		text-align: center;
	}
	
	.error-icon {
		font-size: 2rem;
		margin-bottom: 8px;
	}
	
	.error-message {
		font-size: 0.875rem;
		line-height: 1.4;
		margin-bottom: 16px;
		max-width: 200px;
	}
	
	@media (prefers-reduced-motion: reduce) {
		.object-3d-bookmark {
			transition: none;
		}
		
		.object-3d-bookmark.interactive:hover {
			transform: none;
		}
	}
</style>
