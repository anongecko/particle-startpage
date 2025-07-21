<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import type { BookmarkCategory } from '$stores/bookmarks';
	import type { Object3DConfig, Object3DInstance } from '$lib/objects3d';
	import { 
		Object3DRegistry, 
		AnimationSystem, 
		ColorAdapter,
		WebGLContextManager
	} from '$lib/objects3d';
	import { PerformanceMonitor } from '$lib/performance';
	import { objects3DSettings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import type { ThreeRenderer } from '$lib/three-renderer';

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
	
	// Core component state
	let containerElement: HTMLElement = $state();
	let objectInstance: Object3DInstance | null = $state();
	let objectConfig: Object3DConfig | null = $state();
	let isInitialized = $state(false);
	let hasError = $state(false);
	let errorMessage = $state('');
	let isHovered = $state(false);
	
	// Context and renderer
	const sharedRenderer: ThreeRenderer | null = getContext('threeRenderer');
	const webGLSupported: boolean = getContext('webGLSupported') ?? true;
	const isMobile: boolean = getContext('isMobile') ?? false;
	const simplified3DMode: boolean = getContext('simplified3DMode') ?? false;

	// Performance monitoring
	let performanceMonitor: PerformanceMonitor;

	// Derived state
	const componentMode = $derived(
		staticPreview ? 'static' : 
		previewMode ? 'preview' : 
		bookmarkCategory ? 'bookmark' : 'preview'
	);
	
	const currentSettings = $derived($objects3DSettings);
	const colorPalette = $derived($colorStore);
	const currentDominantColor = $derived(dominantColor || colorPalette?.current || '#4a90e2');
	const effectiveObjectId = $derived(objectId || config?.id || bookmarkCategory?.objectId || '');
	const effectiveScale = $derived(scale * (currentSettings?.globalScale || 1.0));
	const shouldAnimate = $derived(
		enableAnimation && 
		currentSettings?.enableAnimations && 
		!staticPreview && 
		!simplified3DMode
	);
	const effectiveAnimationSpeed = $derived(animationSpeed * (currentSettings?.animationSpeed || 1.0));

	onMount(async () => {
		if (!browser || !webGLSupported) {
			handleError('WebGL not supported');
			return;
		}

		performanceMonitor = new PerformanceMonitor();
		
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

			// Always use shared renderer when available for better performance
			if (!sharedRenderer) {
				throw new Error('Shared renderer not available');
			}

			await loadObjectConfig();
			await createObjectInstance();

			if (shouldAnimate && objectInstance) {
				AnimationSystem.createIdleAnimation(objectInstance);
			}

			isInitialized = true;
		} catch (error) {
			throw error;
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
			await Object3DRegistry.initialize();
			const foundConfig = Object3DRegistry.getObjectById?.(effectiveObjectId);
			
			if (!foundConfig) {
				throw new Error(`Object not found: ${effectiveObjectId}`);
			}
			
			objectConfig = foundConfig;
		} catch (error) {
			throw new Error(`Failed to load object config: ${error}`);
		}
	}

	async function createObjectInstance(): Promise<void> {
		if (!objectConfig) {
			throw new Error('No object configuration available');
		}

		try {
			objectInstance = await Object3DRegistry.createInstance(objectConfig.id, {
				position,
				scale: effectiveScale,
				dominantColor: currentDominantColor,
				customization: customization || {}
			});

			if (!objectInstance) {
				throw new Error('Failed to create object instance');
			}

			// Configure material quality based on device capabilities
			const material = objectInstance.mesh.material;
			if (currentSettings?.materialQuality) {
				configureMaterialQuality(material, currentSettings.materialQuality);
			}

			// Add to shared renderer
			if (sharedRenderer && componentMode === 'bookmark') {
				sharedRenderer.addObject(objectInstance.id, objectInstance.mesh);
			}

		} catch (error) {
			throw new Error(`Object creation failed: ${error}`);
		}
	}

	function configureMaterialQuality(material: any, quality: string): void {
		if (!('roughness' in material && 'metalness' in material)) return;
		
		const settings = {
			low: { roughness: 0.8, metalness: 0.2 },
			medium: { roughness: 0.5, metalness: 0.5 },
			high: { roughness: 0.2, metalness: 0.8 }
		}[quality] || settings.medium;
		
		Object.assign(material, settings);
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

	function handleInteraction(event: Event, type: 'click' | 'contextmenu'): void {
		if (hasError || !interactive) return;
		
		dispatch(type, { 
			event, 
			objectId: effectiveObjectId, 
			instance: objectInstance,
			config: objectConfig
		});
	}

	function handleMouseEnter(): void {
		if (!interactive || hasError) return;
		
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

	function handleKeyDown(event: KeyboardEvent): void {
		if (!interactive || hasError) return;
		
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleInteraction(event, 'click');
		}
	}

	// Public API
	export function updateConfiguration(newConfig: Partial<Object3DConfig>): void {
		try {
			if (!objectConfig || !objectInstance) return;
			
			objectConfig = { ...objectConfig, ...newConfig };

			if (newConfig.scale !== undefined) {
				objectInstance.mesh.scale.setScalar(newConfig.scale * effectiveScale);
			}

			if (newConfig.opacity !== undefined) {
				const material = objectInstance.mesh.material as any;
				if ('opacity' in material) {
					material.opacity = newConfig.opacity;
					material.transparent = newConfig.opacity < 1;
					material.needsUpdate = true;
				}
			}
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

	function cleanup(): void {
		if (objectInstance) {
			if (shouldAnimate) {
				AnimationSystem.dispose(objectInstance.id);
			}
			
			if (sharedRenderer && componentMode === 'bookmark') {
				sharedRenderer.removeObject(objectInstance.id);
			}
			
			Object3DRegistry.disposeInstance(objectInstance);
			objectInstance = null;
		}

		performanceMonitor?.destroy();
		isInitialized = false;
	}

	// Reactive updates - optimized to prevent unnecessary work
	$effect(() => {
		if (isInitialized && currentDominantColor && objectInstance) {
			ColorAdapter.adaptMaterial(
				objectInstance.mesh.material,
				{ ...colorPalette, dominant: currentDominantColor },
				objectConfig?.colorAdaptation || {
					mode: 'auto',
					intensity: 1,
					saturationBoost: 0.2,
					lightnessAdjust: 0,
					emissiveStrength: 0.3,
					transitionDuration: 800
				}
			);
		}
	});

	$effect(() => {
		if (isInitialized && effectiveScale && objectInstance) {
			objectInstance.mesh.scale.setScalar(effectiveScale);
		}
	});

	$effect(() => {
		if (isInitialized && objectInstance) {
			const wasActive = objectInstance.state.isActive;
			objectInstance.state.isActive = isActive;
			objectInstance.state.isIdle = !isActive && !isHovered;

			if (currentSettings?.interaction?.enableClick && isActive && !wasActive) {
				const clickScale = currentSettings.interaction.clickScale || 0.95;
				const originalScale = objectInstance.mesh.scale.x;
				objectInstance.mesh.scale.multiplyScalar(clickScale);
				
				setTimeout(() => {
					if (objectInstance) {
						objectInstance.mesh.scale.setScalar(originalScale);
					}
				}, 100);
			}
		}
	});
</script>

{#if componentMode === 'bookmark'}
  {#if interactive}
    <div 
      class="object-3d-bookmark"
      class:active={isActive}
      class:hovered={isHovered}
      class:error={hasError}
      class:interactive
      style="--object-size: {size}px;"
      bind:this={containerElement}
      onclick={(e) => handleInteraction(e, 'click')}
      onkeydown={handleKeyDown}
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
      oncontextmenu={(e) => handleInteraction(e, 'contextmenu')}
      role="button"
      tabindex="0"
      aria-label={bookmarkCategory ? `3D object for ${bookmarkCategory.name}` : '3D object'}
      aria-pressed={isActive}
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
      class="object-3d-bookmark"
      class:active={isActive}
      class:hovered={isHovered}
      class:error={hasError}
      style="--object-size: {size}px;"
      bind:this={containerElement}
      role="img"
      aria-label={bookmarkCategory ? `3D object for ${bookmarkCategory.name}` : '3D object'}
      aria-describedby={hasError ? 'error-description' : undefined}
    >
      {#if hasError && fallbackTo2D}
        <div class="fallback-2d" aria-label="2D fallback representation">
          <div class="fallback-icon">📦</div>
        </div>
      {/if}
    </div>
  {/if}
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
		{#if hasError}
			<div class="error-overlay" role="alert">
				<div class="error-icon">⚠️</div>
				<div class="error-message" id="error-description">
					{errorMessage || '3D object failed to load'}
				</div>
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
