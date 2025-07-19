<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick, setContext } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, backOut, sineInOut } from 'svelte/easing';
	import type { BookmarkCategory, BookmarkItem } from '$stores/bookmarks';
	import { bookmarkStore } from '$stores/bookmarks';
	import { settingsStore, objects3DSettings } from '$stores/settings';
	import { ThreeRenderer } from '$lib/three-renderer';
	
	// ✅ FIXED: Updated imports for new 3D system
	import { Object3DRegistry, getAllObjects, getObject } from '$lib/objects3d';
	import { OBJECT_CATEGORIES } from '$lib/objects';
	
	import Object3D from './Object3D.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import ObjectSelector from './ObjectSelector.svelte';
	import NotificationToast from './NotificationToast.svelte';
	
	// Props
	export let bookmarks: any;
	export let dominantColor: string = '#ffffff';
	export let settings: any;
	export let config: any = {};
	
	// Event dispatcher
	const dispatch = createEventDispatcher();
	
	// DOM references
	let gridContainer: HTMLElement;
	let threeCanvas: HTMLCanvasElement;
	
	// Three.js state
	let threeRenderer: ThreeRenderer | null = null;
	let webGLSupported = true;
	let webGLInitialized = false;
	let performanceLevel: 'high' | 'medium' | 'low' = 'high';
	
	// UI state
	let openCategoryId: string | null = null;
	let hoveredCategoryId: string | null = null;
	let keyboardFocusIndex = -1;
	let showEmptyToast = false;
	
	// Category state management
	let categoryStates = new Map<string, {
		isOpen: boolean;
		isHovered: boolean;
		animating: boolean;
		object3DError: boolean;
		lastInteraction: number;
	}>();
	
	// Touch handling
	let touchStartTime = 0;
	let lastTapTime = 0;
	let longPressTimer: NodeJS.Timeout | null = null;
	
	// Context menu state
	let contextMenuVisible = false;
	let contextMenuX = 0;
	let contextMenuY = 0;
	let contextMenuCategory: BookmarkCategory | null = null;
	
	// Object selector state
	let objectSelectorVisible = false;
	let objectSelectorCategory: BookmarkCategory | null = null;
	
	// Performance monitoring
	let frameCount = 0;
	let lastFrameTime = performance.now();
	let currentFPS = 60;
	
	// Intersection observer for viewport culling
	let intersectionObserver: IntersectionObserver;
	let visibleCategories3D = new Set<string>();
	
	// Animation stores
	const colorTransition = tweened(dominantColor, { 
		duration: 800, 
		easing: cubicOut 
	});
	
	const gridScale = spring(1, { 
		stiffness: 0.1, 
		damping: 0.8 
	});
	
	// Computed values with performance optimizations
	$: visibleCategories = bookmarks?.categories?.filter((cat: BookmarkCategory) => cat.isVisible) || [];
	$: hasBookmarksAtAll = visibleCategories.length > 0 && 
		visibleCategories.some((cat: BookmarkCategory) => cat.bookmarks.length > 0);
	$: bookmarkSize = settings?.ui?.bookmarkSize || 1;
	$: folderSize = settings?.ui?.folderSize || 1;
	$: enable3D = settings?.objects3d?.enabled !== false && 
		webGLSupported && 
		webGLInitialized && 
		config?.enable3D !== false;
	
	// Enhanced grid configuration with responsive design
	$: gridConfig = calculateGridConfig(folderSize);
	$: textColor = getContrastColor(dominantColor);
	
	// Watch for color changes and update Three.js renderer
	$: if (threeRenderer && dominantColor) {
		colorTransition.set(dominantColor);
		threeRenderer.updateWallpaperColors(dominantColor);
	}
	
	// Initialize category states
	function initializeCategoryStates(): void {
		visibleCategories.forEach(category => {
			if (!categoryStates.has(category.id)) {
				categoryStates.set(category.id, {
					isOpen: false,
					isHovered: false,
					animating: false,
					object3DError: false,
					lastInteraction: 0
				});
			}
		});
		categoryStates = new Map(categoryStates);
	}
	
	function updateCategoryState(categoryId: string, updates: Partial<typeof categoryStates extends Map<string, infer T> ? T : never>): void {
		const current = categoryStates.get(categoryId) || {
			isOpen: false,
			isHovered: false,
			animating: false,
			object3DError: false,
			lastInteraction: 0
		};
		
		categoryStates.set(categoryId, { ...current, ...updates });
		categoryStates = new Map(categoryStates);
	}
	
	// Grid configuration calculation
	function calculateGridConfig(folderSize: number) {
		const baseSize = 100 * folderSize;
		const minSpacing = 20;
		const maxColumns = Math.floor((window?.innerWidth || 1200) / (baseSize + minSpacing));
		
		return {
			maxColumns: Math.max(2, Math.min(8, maxColumns)),
			itemSize: baseSize,
			spacing: minSpacing
		};
	}
	
	// Performance tracking
	function trackPerformance(): void {
		const currentTime = performance.now();
		const deltaTime = currentTime - lastFrameTime;
		frameCount++;
		
		if (deltaTime > 1000) { // Update every second
			currentFPS = Math.round((frameCount * 1000) / deltaTime);
			frameCount = 0;
			lastFrameTime = currentTime;
			
			// Adjust performance level based on FPS
			if (currentFPS < 30 && performanceLevel !== 'low') {
				performanceLevel = 'low';
				console.log('Performance adjusted to low due to low FPS:', currentFPS);
			} else if (currentFPS > 50 && performanceLevel !== 'high') {
				performanceLevel = 'high';
			}
		}
		
		requestAnimationFrame(trackPerformance);
	}
	
	// Three.js initialization
	async function initializeThreeJS(): Promise<void> {
		if (!browser || !threeCanvas) return;
		
		try {
			console.log('Initializing Three.js renderer...');
			
			threeRenderer = new ThreeRenderer(threeCanvas);
			webGLInitialized = true;
			
			// Update context immediately
			setContext('threeRenderer', threeRenderer);
			
			// Setup performance monitoring
			if (threeRenderer) {
				threeRenderer.onPerformanceChange = (newLevel: string) => {
					performanceLevel = newLevel as 'high' | 'medium' | 'low';
				};
			}
			
			// Setup viewport culling
			setupIntersectionObserver();
			
			// Apply current colors
			if (dominantColor && threeRenderer) {
				threeRenderer.updateWallpaperColors(dominantColor);
			}
			
			console.log('Three.js renderer initialized successfully');
			
		} catch (error) {
			console.warn('Three.js initialization failed:', error);
			webGLSupported = false;
			webGLInitialized = false;
			
			// Dispatch error event for parent components
			dispatch('webglError', { error: error.message });
		}
	}
	
	// Optimized intersection observer
	function setupIntersectionObserver(): void {
		if (intersectionObserver) {
			intersectionObserver.disconnect();
		}
		
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				let hasChanges = false;
				
				entries.forEach(entry => {
					const categoryId = entry.target.getAttribute('data-category-id');
					if (!categoryId) return;
					
					if (entry.isIntersecting) {
						if (!visibleCategories3D.has(categoryId)) {
							visibleCategories3D.add(categoryId);
							hasChanges = true;
						}
					} else {
						if (visibleCategories3D.has(categoryId)) {
							visibleCategories3D.delete(categoryId);
							hasChanges = true;
						}
					}
				});
				
				// Only trigger reactivity if there were actual changes
				if (hasChanges) {
					visibleCategories3D = new Set(visibleCategories3D);
				}
			},
			{
				root: null,
				rootMargin: '100px',
				threshold: 0.1
			}
		);
	}
	
	// Enhanced category interaction handling
	async function handleCategoryClick(category: BookmarkCategory, event: MouseEvent): Promise<void> {
		event.stopPropagation();
		
		// Clear any pending long press
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		
		// Handle empty category
		if (category.bookmarks.length === 0) {
			showEmptyToast = true;
			setTimeout(() => {
				showEmptyToast = false;
				dispatch('openSettings', { section: 'bookmarks', category: category.id });
			}, 2000);
			return;
		}
		
		const wasOpen = openCategoryId === category.id;
		
		// Close currently open category with animation
		if (openCategoryId && openCategoryId !== category.id) {
			await closeCategory(openCategoryId);
		}
		
		if (wasOpen) {
			await closeCategory(category.id);
		} else {
			await openCategory(category.id);
		}
		
		// Update analytics
		try {
			bookmarkStore.updateCategoryAnalytics?.(category.id, { 
				totalClicks: 1 
			});
		} catch (error) {
			console.warn('Failed to update analytics:', error);
		}
		
		dispatch('category-click', { category, wasOpen });
	}
	
	async function openCategory(categoryId: string): Promise<void> {
		updateCategoryState(categoryId, { isOpen: true, animating: true });
		openCategoryId = categoryId;
		
		// Wait for animation
		await new Promise(resolve => setTimeout(resolve, 300));
		updateCategoryState(categoryId, { animating: false });
		
		dispatch('category-open', { categoryId });
	}
	
	async function closeCategory(categoryId: string): Promise<void> {
		updateCategoryState(categoryId, { animating: true });
		
		// Wait for animation
		await new Promise(resolve => setTimeout(resolve, 200));
		
		updateCategoryState(categoryId, { isOpen: false, animating: false });
		
		if (openCategoryId === categoryId) {
			openCategoryId = null;
		}
		
		dispatch('category-close', { categoryId });
	}
	
	// Right-click context menu
	function handleRightClick(category: BookmarkCategory, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		
		contextMenuX = event.clientX;
		contextMenuY = event.clientY;
		contextMenuCategory = category;
		contextMenuVisible = true;
	}
	
	// Touch handling for mobile
	function handleTouchStart(category: BookmarkCategory, event: TouchEvent): void {
		touchStartTime = Date.now();
		
		// Long press for context menu
		longPressTimer = setTimeout(() => {
			if (touchStartTime > 0) { // Still touching
				const touch = event.touches[0];
				handleRightClick(category, {
					preventDefault: () => {},
					stopPropagation: () => {},
					clientX: touch.clientX,
					clientY: touch.clientY
				} as MouseEvent);
			}
		}, 500);
	}
	
	function handleTouchEnd(category: BookmarkCategory, event: TouchEvent): void {
		const touchDuration = Date.now() - touchStartTime;
		touchStartTime = 0;
		
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		
		// Handle tap
		if (touchDuration < 500) {
			const currentTime = Date.now();
			const timeSinceLastTap = currentTime - lastTapTime;
			
			if (timeSinceLastTap < 300) {
				// Double tap - open category
				handleCategoryClick(category, new MouseEvent('click'));
			}
			
			lastTapTime = currentTime;
		}
	}
	
	// Hover handling
	function handleCategoryHover(category: BookmarkCategory, isHovering: boolean): void {
		updateCategoryState(category.id, { 
			isHovered: isHovering,
			lastInteraction: Date.now()
		});
		
		if (isHovering) {
			hoveredCategoryId = category.id;
		} else if (hoveredCategoryId === category.id) {
			hoveredCategoryId = null;
		}
	}
	
	// Enhanced Object3D event handlers
	function handleObject3DClick(event: CustomEvent): void {
		const { category } = event.detail;
		handleCategoryClick(category, new MouseEvent('click'));
	}
	
	function handleObject3DHover(event: CustomEvent): void {
		const { category, isHovering } = event.detail;
		handleCategoryHover(category, isHovering);
	}
	
	function handleObject3DContextMenu(event: CustomEvent): void {
		const { category, clientX, clientY } = event.detail;
		handleRightClick(category, {
			preventDefault: () => {},
			stopPropagation: () => {},
			clientX,
			clientY
		} as MouseEvent);
	}
	
	function handleObject3DError(category: BookmarkCategory): void {
		console.warn(`3D object failed to load for category: ${category.name}`);
		updateCategoryState(category.id, { object3DError: true });
		
		dispatch('object3DError', { 
			categoryId: category.id, 
			objectId: category.objectId 
		});
	}
	
	// Context menu handlers
	function closeContextMenu(): void {
		contextMenuVisible = false;
		contextMenuCategory = null;
	}
	
	function handleChangeObject(event: CustomEvent): void {
		const { category } = event.detail;
		objectSelectorCategory = category;
		objectSelectorVisible = true;
		closeContextMenu();
	}
	
	function handleRenameFolder(event: CustomEvent): void {
		const { category } = event.detail;
		const newName = prompt('Enter new folder name:', category.name);
		if (newName && newName.trim() !== category.name) {
			try {
				bookmarkStore.updateCategory?.(category.id, { name: newName.trim() });
			} catch (error) {
				console.error('Failed to rename category:', error);
			}
		}
		closeContextMenu();
	}
	
	function handleAddBookmark(event: CustomEvent): void {
		const { category } = event.detail;
		dispatch('openSettings', { section: 'bookmarks', category: category.id });
		closeContextMenu();
	}
	
	function handleRemoveFolder(event: CustomEvent): void {
		const { category } = event.detail;
		if (confirm(`Are you sure you want to delete "${category.name}" and all its bookmarks?`)) {
			try {
				bookmarkStore.deleteCategory?.(category.id);
			} catch (error) {
				console.error('Failed to delete category:', error);
			}
		}
		closeContextMenu();
	}
	
	function handleUpdateCustomization(event: CustomEvent): void {
		const { category, customization } = event.detail;
		try {
			bookmarkStore.updateObjectCustomization?.(category.id, customization);
		} catch (error) {
			console.error('Failed to update customization:', error);
		}
	}
	
	// Object selector handlers
	function closeObjectSelector(): void {
		objectSelectorVisible = false;
		objectSelectorCategory = null;
	}
	
	function handleObjectSelect(event: CustomEvent): void {
		const { category, objectId } = event.detail;
		try {
			bookmarkStore.setObjectForCategory?.(category.id, objectId);
		} catch (error) {
			console.error('Failed to set object for category:', error);
		}
		closeObjectSelector();
	}
	
	// Bookmark click handling
	function handleBookmarkClick(bookmark: BookmarkItem, event: MouseEvent): void {
		event.stopPropagation();
		
		// Update analytics
		try {
			bookmarkStore.recordBookmarkAccess?.(bookmark.id);
		} catch (error) {
			console.warn('Failed to record bookmark access:', error);
		}
		
		// Handle modifier keys
		const url = bookmark.url;
		if (event.ctrlKey || event.metaKey) {
			window.open(url, '_blank');
		} else if (event.shiftKey) {
			window.open(url, '_blank');
		} else {
			window.location.href = url;
		}
		
		dispatch('bookmark-click', { bookmark, modifierKey: event.ctrlKey || event.metaKey });
	}
	
	// Enhanced keyboard navigation
	function handleKeyDown(event: KeyboardEvent): void {
		if (!visibleCategories.length) return;
		
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				event.preventDefault();
				keyboardFocusIndex = Math.min(keyboardFocusIndex + 1, visibleCategories.length - 1);
				focusCategory(keyboardFocusIndex);
				break;
				
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault();
				keyboardFocusIndex = Math.max(keyboardFocusIndex - 1, 0);
				focusCategory(keyboardFocusIndex);
				break;
				
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (keyboardFocusIndex >= 0 && keyboardFocusIndex < visibleCategories.length) {
					const category = visibleCategories[keyboardFocusIndex];
					handleCategoryClick(category, new MouseEvent('click'));
				}
				break;
				
			case 'Escape':
				event.preventDefault();
				if (contextMenuVisible) {
					closeContextMenu();
				} else if (objectSelectorVisible) {
					closeObjectSelector();
				} else if (openCategoryId) {
					closeCategory(openCategoryId);
				}
				keyboardFocusIndex = -1;
				break;
				
			case 'Tab':
				// Let default tab behavior work, but track focus
				if (!event.shiftKey) {
					keyboardFocusIndex = Math.min(keyboardFocusIndex + 1, visibleCategories.length - 1);
				} else {
					keyboardFocusIndex = Math.max(keyboardFocusIndex - 1, 0);
				}
				break;
		}
	}
	
	function focusCategory(index: number): void {
		const elements = gridContainer?.querySelectorAll('.bookmark-folder, .object-3d-container');
		const element = elements?.[index] as HTMLElement;
		element?.focus();
	}
	
	// Click outside handler
	function handleClickOutside(event: MouseEvent): void {
		if (!gridContainer?.contains(event.target as Node)) {
			if (openCategoryId) {
				closeCategory(openCategoryId);
			}
		}
		
		if (contextMenuVisible) {
			closeContextMenu();
		}
	}
	
	// Utility functions
	function getContrastColor(backgroundColor: string): string {
		try {
			const hex = backgroundColor.replace('#', '');
			const r = parseInt(hex.substr(0, 2), 16);
			const g = parseInt(hex.substr(2, 2), 16);
			const b = parseInt(hex.substr(4, 2), 16);
			const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
			return luminance > 0.5 ? '#000000' : '#ffffff';
		} catch {
			return '#000000';
		}
	}
	
	function getCategoryIcon(category: BookmarkCategory): string {
		// Enhanced fallback emoji mapping
		const iconMap: Record<string, string> = {
			// Development
			'development/computer': '💻',
			'development/git-tree': '🌳',
			'development/docker': '📦',
			'development/coffee': '☕',
			'development/server': '🖥️',
			
			// Learning
			'learning/graduation-cap': '🎓',
			'learning/textbooks': '📚',
			'learning/microscope': '🔬',
			'learning/brain': '🧠',
			'learning/owl': '🦉',
			
			// Creative
			'creative/dice': '🎲',
			'creative/treasure-chest': '💰',
			'creative/magic-8-ball': '🎱',
			
			// Geometric
			'geometric/diamond': '💎',
			'geometric/sphere': '⚪',
			'geometric/octahedron': '🔷',
			
			// Legacy icons
			'code-brackets': '💻',
			'play-button': '🎬',
			'productivity-gears': '⚙️',
			'social-network': '👥',
			'education-book': '📚',
			'shopping-cart': '🛒',
			'game-controller': '🎮',
			'design-palette': '🎨',
			'business-chart': '📈',
			'star-favorite': '⭐'
		};
		
		return iconMap[category.objectId || category.iconId || ''] || '📁';
	}
	
	// ✅ FIXED: Updated to use new 3D system API
	function shouldUse3D(category: BookmarkCategory): boolean {
		if (!enable3D || !category.objectId) return false;
		
		const state = categoryStates.get(category.id);
		if (state?.object3DError) return false;
		
		// ✅ FIXED: Use Object3DRegistry.getObject instead of getObjectById
		const objectConfig = Object3DRegistry.getObject(category.objectId);
		if (!objectConfig) return false;
		
		// Check if category is in viewport
		return visibleCategories3D.has(category.id);
	}
	
	// Component lifecycle
	onMount(async () => {
		if (!browser) return;
		
		console.log('BookmarkGrid mounting...');
		
		// ✅ FIXED: Initialize Object3D registry
		await Object3DRegistry.initialize();
		
		// Initialize state
		initializeCategoryStates();
		
		// Start performance tracking
		requestAnimationFrame(trackPerformance);
		
		// Initialize Three.js if enabled
		if (enable3D) {
			await tick(); // Wait for DOM
			await initializeThreeJS();
		}
		
		// Setup event listeners
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', handleClickOutside);
		
		// Apply initial colors to Three.js renderer
		if (threeRenderer && dominantColor) {
			threeRenderer.updateWallpaperColors(dominantColor);
		}
		
		console.log('BookmarkGrid mounted successfully');
	});
	
	onDestroy(() => {
		// Cleanup Three.js
		if (threeRenderer) {
			threeRenderer.dispose();
		}
		
		// Cleanup event listeners
		document.removeEventListener('keydown', handleKeyDown);
		document.removeEventListener('click', handleClickOutside);
		
		// Cleanup intersection observer
		if (intersectionObserver) {
			intersectionObserver.disconnect();
		}
		
		// Clear timers
		if (longPressTimer) {
			clearTimeout(longPressTimer);
		}
		
		console.log('BookmarkGrid destroyed');
	});
	
	// Svelte action for intersection observer
	function intersectionObserver(element: HTMLElement) {
		if (intersectionObserver) {
			intersectionObserver.observe(element);
		}
		
		return {
			destroy() {
				if (intersectionObserver) {
					intersectionObserver.unobserve(element);
				}
			}
		};
	}
</script>

<div 
	class="bookmark-grid-container"
	bind:this={gridContainer}
	style="--text-color: {textColor}; --grid-scale: {$gridScale};"
>
	<!-- Three.js Canvas for shared 3D rendering -->
	{#if enable3D}
		<canvas
			bind:this={threeCanvas}
			style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1;"
			aria-hidden="true"
		></canvas>
	{/if}

	{#if !hasBookmarksAtAll}
		<!-- Enhanced empty state -->
		<div class="empty-state">
			<div class="empty-folder" class:faded={true}>
				<div class="folder-object">
					<div class="folder-face folder-front">📁</div>
					<div class="folder-face folder-top"></div>
					<div class="folder-face folder-right"></div>
				</div>
			</div>
			<h2 class="empty-title">No bookmarks yet</h2>
			<p class="empty-message">
				Create your first bookmark folder to get started with your personalized homepage
			</p>
			<button 
				class="empty-action-button"
				on:click={() => dispatch('openSettings', { section: 'bookmarks' })}
			>
				Add Bookmarks
			</button>
		</div>
	{:else}
		<div class="bookmark-grid" style="--columns: {gridConfig.maxColumns};">
			{#each visibleCategories as category, index (category.id)}
				{@const state = categoryStates.get(category.id)}
				{@const isEmpty = category.bookmarks.length === 0}
				{@const use3D = shouldUse3D(category)}
				
				<div 
					class="bookmark-category"
					class:open={state?.isOpen}
					class:animating={state?.animating}
					class:focused={keyboardFocusIndex === index}
					class:empty={isEmpty}
					data-category-id={category.id}
					use:intersectionObserver
					style="--category-index: {index};"
				>
					<!-- 3D Object or CSS Fallback -->
					{#if use3D}
						<Object3D
							bookmarkCategory={category}
							objectId={category.objectId}
							position={{ 
								x: index % gridConfig.maxColumns, 
								y: Math.floor(index / gridConfig.maxColumns) 
							}}
							size={Math.floor(80 * folderSize)}
							isActive={state?.isHovered || state?.isOpen}
							on:click={handleObject3DClick}
							on:hover={handleObject3DHover}
							on:contextmenu={handleObject3DContextMenu}
							on:error={() => handleObject3DError(category)}
						/>
					{:else}
						<!-- Enhanced CSS 3D Fallback -->
						<div 
							class="bookmark-folder"
							class:hovered={state?.isHovered}
							class:empty={isEmpty}
							class:webgl-fallback={!webGLSupported || state?.object3DError}
							class:performance-reduced={performanceLevel === 'low'}
							style="transform: scale({folderSize});"
							on:click={(e) => handleCategoryClick(category, e)}
							on:contextmenu={(e) => handleRightClick(category, e)}
							on:mouseenter={() => handleCategoryHover(category, true)}
							on:mouseleave={() => handleCategoryHover(category, false)}
							on:touchstart={(e) => handleTouchStart(category, e)}
							on:touchend={(e) => handleTouchEnd(category, e)}
							role="button"
							tabindex="0"
							aria-label="Open {category.name} folder"
							aria-expanded={state?.isOpen}
						>
							<div class="folder-icon">
								{getCategoryIcon(category)}
							</div>
							<div class="folder-glow" style="background: {category.customColor || dominantColor};"></div>
							<div class="folder-name">{category.name}</div>
							{#if category.bookmarks.length > 0}
								<div class="bookmark-count">{category.bookmarks.length}</div>
							{/if}
						</div>
					{/if}
					
					<!-- Bookmark dropdown (only when open) -->
					{#if state?.isOpen && category.bookmarks.length > 0}
						<div class="bookmark-dropdown" class:animating={state?.animating}>
							<div class="bookmark-list">
								{#each category.bookmarks as bookmark (bookmark.id)}
									<button 
										class="bookmark-item"
										on:click={(e) => handleBookmarkClick(bookmark, e)}
										title="{bookmark.title} - {bookmark.url}"
									>
										<div class="bookmark-favicon">
											{#if bookmark.favicon}
												<img src={bookmark.favicon} alt="" aria-hidden="true" />
											{:else if bookmark.customIcon}
												<span class="custom-icon" aria-hidden="true">{bookmark.customIcon}</span>
											{:else}
												<span class="default-favicon" aria-hidden="true">🔗</span>
											{/if}
										</div>
										<div class="bookmark-info">
											<span class="bookmark-title">{bookmark.title}</span>
											{#if bookmark.description}
												<span class="bookmark-description">{bookmark.description}</span>
											{/if}
											{#if bookmark.metadata?.domain}
												<span class="bookmark-domain">{bookmark.metadata.domain}</span>
											{/if}
										</div>
									</button>
								{/each}
							</div>
							
							<button 
								class="collapse-button"
								on:click={() => closeCategory(category.id)}
								aria-label="Collapse {category.name}"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
									<polyline points="18,15 12,9 6,15"></polyline>
								</svg>
								<span class="sr-only">Collapse</span>
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	
	<!-- Enhanced Quick Add Button -->
	<button 
		class="quick-add-button"
		on:click={() => dispatch('openSettings', { section: 'bookmarks' })}
		aria-label="Add new bookmark category"
		title="Add bookmarks (Ctrl+N)"
	>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
		<span class="sr-only">Add new bookmark</span>
	</button>
</div>

<!-- Context Menu -->
<ContextMenu
	x={contextMenuX}
	y={contextMenuY}
	category={contextMenuCategory}
	bind:visible={contextMenuVisible}
	on:close={closeContextMenu}
	on:changeObject={handleChangeObject}
	on:renameFolder={handleRenameFolder}
	on:addBookmark={handleAddBookmark}
	on:removeFolder={handleRemoveFolder}
	on:updateCustomization={handleUpdateCustomization}
/>

<!-- Object Selector Modal -->
<ObjectSelector
	bind:visible={objectSelectorVisible}
	currentObjectId={objectSelectorCategory?.objectId || ''}
	category={objectSelectorCategory}
	on:close={closeObjectSelector}
	on:select={handleObjectSelect}
/>

<!-- Toast notification for empty bookmarks -->
{#if showEmptyToast}
	<NotificationToast 
		message="This folder is empty. Add some bookmarks to get started!"
		type="info"
		duration={2000}
		on:close={() => showEmptyToast = false}
	/>
{/if}

<style>
	.bookmark-grid-container {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		transition: transform 0.3s ease;
		transform: scale(var(--grid-scale, 1));
	}
	
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		max-width: 400px;
		margin: 0 auto;
		opacity: 0;
		animation: fadeInUp 0.6s ease forwards;
	}
	
	.empty-folder {
		margin-bottom: 2rem;
		position: relative;
		transform-style: preserve-3d;
		transition: all 0.4s ease;
	}
	
	.empty-folder.faded {
		opacity: 0.7;
		filter: grayscale(0.3);
	}
	
	.folder-object {
		position: relative;
		width: 80px;
		height: 80px;
		transform-style: preserve-3d;
		animation: gentleFloat 4s ease-in-out infinite;
	}
	
	.folder-face {
		position: absolute;
		width: 80px;
		height: 80px;
		background: var(--text-color, #ffffff);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		opacity: 0.8;
	}
	
	.folder-front {
		transform: translateZ(20px);
	}
	
	.folder-top {
		transform: rotateX(90deg) translateZ(20px);
		background: rgba(255, 255, 255, 0.3);
	}
	
	.folder-right {
		transform: rotateY(90deg) translateZ(60px);
		background: rgba(255, 255, 255, 0.2);
		width: 40px;
	}
	
	.empty-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--text-color, #ffffff);
		margin: 0 0 1rem 0;
	}
	
	.empty-message {
		font-size: 1rem;
		color: var(--text-color, #ffffff);
		opacity: 0.8;
		margin: 0 0 2rem 0;
		line-height: 1.5;
	}
	
	.empty-action-button {
		padding: 0.75rem 1.5rem;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 8px;
		color: var(--text-color, #ffffff);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
		backdrop-filter: blur(10px);
	}
	
	.empty-action-button:hover {
		background: rgba(255, 255, 255, 0.3);
		border-color: rgba(255, 255, 255, 0.5);
		transform: translateY(-2px);
	}
	
	.bookmark-grid {
		display: grid;
		grid-template-columns: repeat(var(--columns, 4), 1fr);
		gap: 2rem;
		max-width: 1200px;
		width: 100%;
		place-items: center;
	}
	
	.bookmark-category {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: all 0.3s ease;
		animation: categoryFadeIn 0.5s ease forwards;
		animation-delay: calc(var(--category-index, 0) * 0.1s);
		opacity: 0;
	}
	
	.bookmark-category.focused {
		outline: 2px solid rgba(255, 255, 255, 0.5);
		outline-offset: 4px;
		border-radius: 12px;
	}
	
	.bookmark-folder {
		position: relative;
		width: 100px;
		height: 100px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 16px;
		transition: all 0.3s ease;
		transform-style: preserve-3d;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	.bookmark-folder:hover {
		transform: translateY(-4px) scale(1.05);
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}
	
	.bookmark-folder.hovered {
		transform: translateY(-6px) scale(1.1);
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
	}
	
	.bookmark-folder.empty {
		opacity: 0.7;
		border-style: dashed;
	}
	
	.bookmark-folder.webgl-fallback {
		border: 2px solid rgba(255, 193, 7, 0.5);
	}
	
	.bookmark-folder.performance-reduced {
		transition: none;
		transform: none !important;
	}
	
	.folder-icon {
		font-size: 2rem;
		margin-bottom: 0.5rem;
		transition: transform 0.3s ease;
	}
	
	.bookmark-folder:hover .folder-icon {
		transform: scale(1.1) rotateY(15deg);
	}
	
	.folder-glow {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		border-radius: 16px;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
		filter: blur(20px);
		z-index: -1;
	}
	
	.bookmark-folder:hover .folder-glow {
		opacity: 0.3;
	}
	
	.folder-name {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-color, #ffffff);
		text-align: center;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.bookmark-count {
		position: absolute;
		top: -8px;
		right: -8px;
		background: rgba(255, 255, 255, 0.9);
		color: #333;
		border-radius: 50%;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 600;
		border: 2px solid rgba(255, 255, 255, 0.3);
	}
	
	.bookmark-dropdown {
		position: absolute;
		top: 110px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(20px);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.3);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		min-width: 280px;
		max-width: 400px;
		max-height: 300px;
		overflow: hidden;
		z-index: 10;
		opacity: 0;
		animation: dropdownFadeIn 0.3s ease forwards;
	}
	
	.bookmark-dropdown.animating {
		opacity: 0;
		transform: translateX(-50%) translateY(-10px);
	}
	
	.bookmark-list {
		max-height: 240px;
		overflow-y: auto;
		padding: 0.5rem;
	}
	
	.bookmark-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border: none;
		background: none;
		border-radius: 8px;
		cursor: pointer;
		transition: background-color 0.2s ease;
		text-align: left;
	}
	
	.bookmark-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	
	.bookmark-favicon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	
	.bookmark-favicon img {
		width: 16px;
		height: 16px;
		border-radius: 2px;
	}
	
	.custom-icon, .default-favicon {
		font-size: 14px;
	}
	
	.bookmark-info {
		flex: 1;
		min-width: 0;
	}
	
	.bookmark-title {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: #333;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.bookmark-description {
		display: block;
		font-size: 0.75rem;
		color: #666;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
	}
	
	.bookmark-domain {
		display: block;
		font-size: 0.7rem;
		color: #888;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
	}
	
	.collapse-button {
		width: 100%;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
		color: #666;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		transition: background-color 0.2s ease;
	}
	
	.collapse-button:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #333;
	}
	
	.quick-add-button {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		width: 56px;
		height: 56px;
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		color: var(--text-color, #ffffff);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		z-index: 5;
	}
	
	.quick-add-button:hover {
		background: rgba(255, 255, 255, 0.3);
		border-color: rgba(255, 255, 255, 0.5);
		transform: scale(1.1);
	}
	
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	
	/* Animations */
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	@keyframes categoryFadeIn {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	
	@keyframes dropdownFadeIn {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
	
	@keyframes gentleFloat {
		0%, 100% {
			transform: translateY(0) rotateY(0deg);
		}
		50% {
			transform: translateY(-10px) rotateY(5deg);
		}
	}
	
	/* Responsive design */
	@media (max-width: 768px) {
		.bookmark-grid-container {
			padding: 1rem;
		}
		
		.bookmark-grid {
			grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
			gap: 1.5rem;
		}
		
		.bookmark-dropdown {
			min-width: 240px;
			max-width: 90vw;
		}
		
		.quick-add-button {
			bottom: 1rem;
			right: 1rem;
			width: 48px;
			height: 48px;
		}
	}
	
	/* Performance optimizations */
	@media (prefers-reduced-motion: reduce) {
		*, *::before, *::after {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
