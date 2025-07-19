<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick, setContext } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, backOut, sineInOut } from 'svelte/easing';
	import type { BookmarkCategory, BookmarkItem } from '$stores/bookmarks';
	import { bookmarkStore } from '$stores/bookmarks';
	import { settingsStore } from '$stores/settings';
	import { ThreeRenderer } from '$lib/three-renderer';
	import { OBJECT_REGISTRY, getObjectById } from '$lib/objects';
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
	$: enable3D = settings?.enable3DObjects !== false && 
		webGLSupported && 
		webGLInitialized && 
		config?.enable3D !== false;
	
	// Enhanced grid configuration with responsive design
	$: gridConfig = calculateGridConfig(folderSize);
	$: textColor = getContrastColor($colorTransition);
	
	// Category state management
	interface CategoryState {
		id: string;
		isOpen: boolean;
		isHovered: boolean;
		dropdownHeight: number;
		animating: boolean;
		object3DLoaded: boolean;
		object3DError: boolean;
		lastInteraction: number;
	}
	
	let categoryStates = new Map<string, CategoryState>();
	
	// Set up Three.js context for child components
	$: {
		setContext('threeRenderer', threeRenderer);
		setContext('webGLSupported', webGLSupported);
		setContext('threeDConfig', {
			...config,
			enable3D,
			performanceLevel,
			fallbackTo2D: true
		});
	}
	
	// Performance calculation
	function calculateGridConfig(folderSize: number) {
		const windowWidth = globalThis.window?.innerWidth || 1200;
		const baseWidth = 120 * folderSize;
		const gap = Math.max(20, 24 * folderSize);
		const maxColumns = Math.min(8, Math.max(2, Math.floor(windowWidth / (baseWidth + gap))));
		
		return {
			minColumnWidth: baseWidth,
			gap,
			maxColumns,
			itemsPerRow: Math.min(maxColumns, visibleCategories.length)
		};
	}
	
	// Enhanced performance monitoring
	function trackPerformance(): void {
		const now = performance.now();
		frameCount++;
		
		if (now - lastFrameTime >= 1000) {
			currentFPS = Math.round((frameCount * 1000) / (now - lastFrameTime));
			frameCount = 0;
			lastFrameTime = now;
			
			// Auto-adjust performance level
			if (currentFPS < 30 && performanceLevel !== 'low') {
				performanceLevel = currentFPS < 20 ? 'low' : 'medium';
				console.log(`Performance auto-adjusted to: ${performanceLevel}`);
			} else if (currentFPS > 55 && performanceLevel === 'low') {
				performanceLevel = 'medium';
			} else if (currentFPS > 75 && performanceLevel === 'medium') {
				performanceLevel = 'high';
			}
		}
		
		if (browser) {
			requestAnimationFrame(trackPerformance);
		}
	}
	
	// Initialize category states
	function initializeCategoryStates(): void {
		const now = Date.now();
		categoryStates.clear();
		
		for (const category of visibleCategories) {
			categoryStates.set(category.id, {
				id: category.id,
				isOpen: false,
				isHovered: false,
				dropdownHeight: 0,
				animating: false,
				object3DLoaded: false,
				object3DError: false,
				lastInteraction: now
			});
		}
		
		// Trigger reactivity
		categoryStates = new Map(categoryStates);
	}
	
	// Update category state with batching
	function updateCategoryState(categoryId: string, updates: Partial<CategoryState>): void {
		const current = categoryStates.get(categoryId);
		if (!current) return;
		
		const newState = { 
			...current, 
			...updates, 
			lastInteraction: Date.now() 
		};
		
		categoryStates.set(categoryId, newState);
		categoryStates = new Map(categoryStates);
	}
	
	// Enhanced Three.js initialization with error handling
	async function initializeThreeJS(): Promise<void> {
		if (!browser || !threeCanvas || !enable3D) return;
		
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
			bookmarkStore.updateCategoryAnalytics?.(category.id, { totalClicks: 1 });
		} catch (error) {
			console.warn('Failed to update category analytics:', error);
		}
		
		dispatch('interact', { type: 'categoryClick', categoryId: category.id });
	}
	
	// Optimized category opening with smooth animations
	async function openCategory(categoryId: string): Promise<void> {
		const category = visibleCategories.find(c => c.id === categoryId);
		if (!category) return;
		
		openCategoryId = categoryId;
		updateCategoryState(categoryId, { isOpen: true, animating: true });
		
		// Calculate optimal dropdown height
		const itemHeight = Math.max(44, 48 * bookmarkSize);
		const padding = 16;
		const maxViewportHeight = (globalThis.window?.innerHeight || 800) * 0.4;
		const calculatedHeight = Math.min(
			maxViewportHeight,
			category.bookmarks.length * itemHeight + padding * 2
		);
		
		// Smooth height animation
		updateCategoryState(categoryId, { dropdownHeight: calculatedHeight });
		
		// Wait for animation completion
		await new Promise(resolve => setTimeout(resolve, 300));
		updateCategoryState(categoryId, { animating: false });
	}
	
	// Optimized category closing
	async function closeCategory(categoryId: string): Promise<void> {
		updateCategoryState(categoryId, { animating: true });
		updateCategoryState(categoryId, { dropdownHeight: 0 });
		
		await new Promise(resolve => setTimeout(resolve, 250));
		
		updateCategoryState(categoryId, { 
			isOpen: false, 
			animating: false,
			dropdownHeight: 0 
		});
		
		if (openCategoryId === categoryId) {
			openCategoryId = null;
		}
	}
	
	// Enhanced hover handling with debouncing
	let hoverDebounceTimer: NodeJS.Timeout | null = null;
	
	function handleCategoryHover(category: BookmarkCategory, isHovered: boolean, event?: MouseEvent): void {
		// Clear existing timer
		if (hoverDebounceTimer) {
			clearTimeout(hoverDebounceTimer);
		}
		
		// Debounce hover events for performance
		hoverDebounceTimer = setTimeout(() => {
			hoveredCategoryId = isHovered ? category.id : null;
			updateCategoryState(category.id, { isHovered });
			
			// Emit particle interaction event with throttling
			if (event && isHovered) {
				const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
				const centerX = rect.left + rect.width / 2;
				const centerY = rect.top + rect.height / 2;
				
				window.dispatchEvent(new CustomEvent('bookmark-hover', {
					detail: {
						categoryId: category.id,
						action: 'start',
						position: { x: centerX, y: centerY },
						effects: category.hoverEffects || {}
					}
				}));
			} else if (!isHovered) {
				window.dispatchEvent(new CustomEvent('bookmark-hover', {
					detail: { action: 'end' }
				}));
			}
			
			dispatch('interact', { type: 'categoryHover', categoryId: category.id, isHovered });
		}, isHovered ? 50 : 100); // Faster on hover enter, slower on leave
	}
	
	// Enhanced touch handling
	function handleTouchStart(category: BookmarkCategory, event: TouchEvent): void {
		touchStartTime = Date.now();
		
		// Long press detection for context menu
		longPressTimer = setTimeout(() => {
			if (Date.now() - touchStartTime >= 500) {
				const touch = event.touches[0];
				if (touch) {
					handleRightClick(category, {
						preventDefault: () => {},
						stopPropagation: () => {},
						clientX: touch.clientX,
						clientY: touch.clientY
					} as MouseEvent);
					
					// Haptic feedback
					if ('vibrate' in navigator) {
						navigator.vibrate(50);
					}
				}
			}
		}, 500);
	}
	
	function handleTouchEnd(category: BookmarkCategory, event: TouchEvent): void {
		// Clear long press timer
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		
		const touchDuration = Date.now() - touchStartTime;
		const timeSinceLastTap = Date.now() - lastTapTime;
		
		if (touchDuration < 500) { // Not a long press
			if (timeSinceLastTap < 300) {
				// Double tap - quick action
				handleCategoryClick(category, new MouseEvent('click'));
			} else {
				// Single tap with delay detection
				setTimeout(() => {
					if (Date.now() - lastTapTime >= 300) {
						handleCategoryClick(category, new MouseEvent('click'));
					}
				}, 300);
			}
			lastTapTime = Date.now();
		}
	}
	
	// Context menu handling
	function handleRightClick(category: BookmarkCategory, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		
		contextMenuCategory = category;
		contextMenuX = event.clientX;
		contextMenuY = event.clientY;
		contextMenuVisible = true;
		
		dispatch('interact', { type: 'contextMenu', categoryId: category.id });
	}
	
	// 3D object event handlers
	function handleObject3DHover(event: CustomEvent): void {
		const { category, position } = event.detail;
		handleCategoryHover(category, true, { 
			currentTarget: event.target,
			clientX: position?.x || 0,
			clientY: position?.y || 0
		} as MouseEvent);
	}
	
	function handleObject3DClick(event: CustomEvent): void {
		const { category } = event.detail;
		handleCategoryClick(category, event.detail.event || new MouseEvent('click'));
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
	
	function shouldUse3D(category: BookmarkCategory): boolean {
		if (!enable3D || !category.objectId) return false;
		
		const state = categoryStates.get(category.id);
		if (state?.object3DError) return false;
		
		// Check if object exists in registry
		const objectConfig = getObjectById(category.objectId);
		if (!objectConfig) return false;
		
		// Check if category is in viewport
		return visibleCategories3D.has(category.id);
	}
	
	// Component lifecycle
	onMount(async () => {
		if (!browser) return;
		
		console.log('BookmarkGrid mounting...');
		
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
		
		// Cleanup function
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
			
			if (intersectionObserver) {
				intersectionObserver.disconnect();
			}
			
			if (hoverDebounceTimer) {
				clearTimeout(hoverDebounceTimer);
			}
			
			if (longPressTimer) {
				clearTimeout(longPressTimer);
			}
		};
	});
	
	onDestroy(() => {
		if (!browser) return;
		
		console.log('BookmarkGrid destroying...');
		
		// Cleanup event listeners
		document.removeEventListener('keydown', handleKeyDown);
		document.removeEventListener('click', handleClickOutside);
		
		// Cleanup observers
		if (intersectionObserver) {
			intersectionObserver.disconnect();
		}
		
		// Cleanup timers
		if (hoverDebounceTimer) {
			clearTimeout(hoverDebounceTimer);
		}
		
		if (longPressTimer) {
			clearTimeout(longPressTimer);
		}
		
		// Cleanup Three.js renderer
		if (threeRenderer) {
			threeRenderer.dispose();
			threeRenderer = null;
		}
		
		console.log('BookmarkGrid destroyed');
	});
	
	// Reactive updates
	$: if (dominantColor) {
		colorTransition.set(dominantColor);
		if (threeRenderer) {
			threeRenderer.updateWallpaperColors(dominantColor);
		}
	}
	
	$: if (visibleCategories) {
		initializeCategoryStates();
	}
	
	// Expose debug info in development
	$: if (import.meta.env.DEV) {
		globalThis.bookmarkGridDebug = {
			categoryStates,
			visibleCategories3D,
			threeRenderer,
			webGLSupported,
			webGLInitialized,
			performanceLevel,
			currentFPS
		};
	}
</script>

<div 
	class="bookmark-grid-container"
	bind:this={gridContainer}
	style="
		--dominant-color: {$colorTransition};
		--text-color: {textColor};
		--folder-size: {folderSize};
		--bookmark-size: {bookmarkSize};
		--grid-gap: {gridConfig.gap}px;
		--min-column-width: {gridConfig.minColumnWidth}px;
		--performance-level: {performanceLevel};
	"
	role="main"
	aria-label="Bookmark categories"
>
	<!-- Shared Three.js Canvas (positioned absolutely) -->
	{#if webGLSupported && enable3D}
		<canvas 
			bind:this={threeCanvas}
			class="three-canvas"
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
							tabindex="0"
							role="button"
							aria-label="{category.name} bookmarks ({category.bookmarks.length} items)"
							aria-expanded={state?.isOpen}
							aria-haspopup="true"
							on:click={(e) => handleCategoryClick(category, e)}
							on:mouseenter={(e) => handleCategoryHover(category, true, e)}
							on:mouseleave={() => handleCategoryHover(category, false)}
							on:contextmenu={(e) => handleRightClick(category, e)}
							on:touchstart={(e) => handleTouchStart(category, e)}
							on:touchend={(e) => handleTouchEnd(category, e)}
							on:focus={() => keyboardFocusIndex = index}
						>
							<div class="folder-object">
								<div class="folder-face folder-front">
									<span class="folder-icon" aria-hidden="true">
										{getCategoryIcon(category)}
									</span>
									<span class="folder-label">
										{category.name}
									</span>
									{#if category.bookmarks.length > 0}
										<span class="folder-count" aria-label="{category.bookmarks.length} bookmarks">
											{category.bookmarks.length}
										</span>
									{/if}
								</div>
								<div class="folder-face folder-top"></div>
								<div class="folder-face folder-right"></div>
							</div>
							
							<!-- Enhanced breathing glow effect -->
							<div class="folder-glow" aria-hidden="true"></div>
						</div>
					{/if}
					
					<!-- Enhanced Dropdown Content -->
					{#if state?.isOpen}
						<div 
							class="bookmark-dropdown"
							style="height: {state.dropdownHeight}px;"
							role="menu"
							aria-label="{category.name} bookmarks"
						>
							<div class="dropdown-content">
								{#each category.bookmarks as bookmark (bookmark.id)}
									<button
										class="bookmark-item"
										role="menuitem"
										aria-label="Open {bookmark.title}"
										on:click={(e) => handleBookmarkClick(bookmark, e)}
									>
										<div class="bookmark-icon">
											{#if bookmark.favicon}
												<img 
													src={bookmark.favicon} 
													alt="" 
													loading="lazy"
													onerror="this.style.display='none'"
												/>
											{:else}
												<span class="bookmark-fallback" aria-hidden="true">🔗</span>
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
	/* Performance-optimized base styles */
	.bookmark-grid-container {
		position: relative;
		width: 100%;
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 clamp(16px, 4vw, 40px);
		overflow: visible;
		contain: layout style;
	}
	
	.three-canvas {
		position: absolute !important;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: -1;
		will-change: auto;
	}
	
	.bookmark-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(var(--min-column-width), 1fr));
		gap: var(--grid-gap);
		align-items: start;
		justify-content: center;
		position: relative;
		z-index: 1;
		contain: layout;
	}
	
	.bookmark-category {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		z-index: 2;
		contain: layout style;
		animation: slideIn 0.3s ease-out calc(var(--category-index) * 50ms);
	}
	
	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	/* Enhanced folder styling */
	.bookmark-folder {
		position: relative;
		cursor: pointer;
		perspective: 1000px;
		transform-style: preserve-3d;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		margin-bottom: 12px;
		z-index: 3;
		contain: layout style;
		will-change: transform;
	}
	
	.bookmark-folder:focus-visible {
		outline: 2px solid var(--dominant-color);
		outline-offset: 4px;
		border-radius: 8px;
	}
	
	.bookmark-folder.hovered {
		transform: translateY(-8px) rotateX(5deg) rotateY(-2deg) scale(1.05);
	}
	
	.bookmark-folder.empty {
		opacity: 0.3;
		filter: grayscale(0.8);
	}
	
	.bookmark-folder.performance-reduced.hovered {
		transform: translateY(-4px) scale(1.03);
	}
	
	.bookmark-folder.webgl-fallback {
		filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3));
	}
	
	.bookmark-folder.webgl-fallback.hovered {
		transform: translateY(-12px) rotateX(8deg) rotateY(-4deg) scale(1.1);
		filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.4));
	}
	
	.folder-object {
		position: relative;
		width: calc(80px * var(--folder-size));
		height: calc(60px * var(--folder-size));
		transform-style: preserve-3d;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		contain: layout;
	}
	
	.folder-face {
		position: absolute;
		border-radius: 8px;
		background: linear-gradient(135deg, 
			var(--dominant-color), 
			color-mix(in srgb, var(--dominant-color) 80%, black)
		);
		border: 1px solid color-mix(in srgb, var(--dominant-color) 70%, white);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
	}
	
	.folder-front {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		transform: translateZ(calc(15px * var(--folder-size)));
		padding: 4px;
	}
	
	.folder-top {
		width: 100%;
		height: calc(15px * var(--folder-size));
		top: calc(-15px * var(--folder-size));
		transform: rotateX(90deg);
		transform-origin: bottom;
		background: linear-gradient(180deg, 
			color-mix(in srgb, var(--dominant-color) 90%, white),
			var(--dominant-color)
		);
	}
	
	.folder-right {
		width: calc(15px * var(--folder-size));
		height: 100%;
		right: calc(-15px * var(--folder-size));
		transform: rotateY(90deg);
		transform-origin: left;
		background: linear-gradient(90deg, 
			var(--dominant-color),
			color-mix(in srgb, var(--dominant-color) 70%, black)
		);
	}
	
	.folder-icon {
		font-size: calc(20px * var(--folder-size));
		line-height: 1;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}
	
	.folder-label {
		font-size: calc(9px * var(--folder-size));
		font-weight: 600;
		color: var(--text-color);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.1;
	}
	
	.folder-count {
		font-size: calc(7px * var(--folder-size));
		background: rgba(255, 255, 255, 0.2);
		color: var(--text-color);
		padding: 1px 4px;
		border-radius: 6px;
		font-weight: 500;
		text-shadow: none;
	}
	
	/* Enhanced glow effect */
	.folder-glow {
		position: absolute;
		top: -20%;
		left: -20%;
		right: -20%;
		bottom: -20%;
		background: radial-gradient(circle, 
			color-mix(in srgb, var(--dominant-color) 30%, transparent) 0%,
			transparent 70%
		);
		border-radius: 50%;
		opacity: 0.6;
		animation: breathing-glow 4s ease-in-out infinite;
		z-index: -1;
		will-change: opacity, transform;
	}
	
	.bookmark-folder.hovered .folder-glow {
		opacity: 1;
		animation: none;
		background: radial-gradient(circle, 
			color-mix(in srgb, var(--dominant-color) 50%, transparent) 0%,
			transparent 70%
		);
	}
	
	@keyframes breathing-glow {
		0%, 100% { 
			opacity: 0.3; 
			transform: scale(0.9);
		}
		50% { 
			opacity: 0.6; 
			transform: scale(1.1);
		}
	}
	
	/* Enhanced dropdown */
	.bookmark-dropdown {
		width: 100%;
		max-width: min(320px, 90vw);
		background: rgba(0, 0, 0, 0.92);
		backdrop-filter: blur(20px);
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--dominant-color) 30%, transparent);
		overflow: hidden;
		transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 
			0 8px 32px rgba(0, 0, 0, 0.3),
			0 0 0 1px rgba(255, 255, 255, 0.05);
		z-index: 10;
		position: relative;
		contain: layout;
	}
	
	.dropdown-content {
		max-height: calc(100% - 40px);
		overflow-y: auto;
		padding: 8px;
		overscroll-behavior: contain;
	}
	
	.bookmark-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: calc(8px * var(--bookmark-size));
		background: transparent;
		border: none;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		position: relative;
	}
	
	.bookmark-item:hover {
		background: color-mix(in srgb, var(--dominant-color) 20%, transparent);
		color: white;
		transform: translateX(4px);
	}
	
	.bookmark-item:focus-visible {
		outline: 2px solid var(--dominant-color);
		outline-offset: -2px;
	}
	
	.bookmark-icon {
		width: calc(20px * var(--bookmark-size));
		height: calc(20px * var(--bookmark-size));
		border-radius: 4px;
		overflow: hidden;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
	}
	
	.bookmark-icon img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	
	.bookmark-fallback {
		font-size: calc(12px * var(--bookmark-size));
		opacity: 0.7;
	}
	
	.bookmark-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	
	.bookmark-title {
		font-weight: 500;
		font-size: calc(13px * var(--bookmark-size));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.2;
	}
	
	.bookmark-description {
		font-size: calc(11px * var(--bookmark-size));
		opacity: 0.7;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.2;
	}
	
	.bookmark-domain {
		font-size: calc(10px * var(--bookmark-size));
		opacity: 0.5;
		font-family: monospace;
	}
	
	.collapse-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		height: 32px;
		background: rgba(255, 255, 255, 0.05);
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 12px;
	}
	
	.collapse-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
	}
	
	/* Enhanced empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 60px 20px;
		text-align: center;
		max-width: 400px;
		margin: 0 auto;
	}
	
	.empty-folder {
		perspective: 1000px;
		transform-style: preserve-3d;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.empty-folder.faded {
		opacity: 0.4;
		filter: grayscale(0.8);
	}
	
	.empty-folder:hover {
		opacity: 0.7;
		transform: translateY(-4px) scale(1.1);
	}
	
	.empty-title {
		font-size: 24px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		margin: 0;
	}
	
	.empty-message {
		color: rgba(255, 255, 255, 0.7);
		font-size: 16px;
		line-height: 1.5;
		margin: 0;
	}
	
	.empty-action-button {
		background: var(--dominant-color);
		color: var(--text-color);
		border: none;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.empty-action-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	
	/* Enhanced quick add button */
	.quick-add-button {
		position: fixed;
		bottom: clamp(20px, 5vh, 40px);
		right: clamp(20px, 5vw, 40px);
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--dominant-color);
		border: none;
		color: var(--text-color);
		cursor: pointer;
		box-shadow: 
			0 8px 24px rgba(0, 0, 0, 0.3),
			0 0 0 1px rgba(255, 255, 255, 0.1);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(10px);
	}
	
	.quick-add-button:hover {
		transform: translateY(-2px) scale(1.05);
		box-shadow: 
			0 12px 32px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.2);
	}
	
	.quick-add-button:active {
		transform: translateY(0) scale(0.95);
	}
	
	.quick-add-button:focus-visible {
		outline: 2px solid var(--dominant-color);
		outline-offset: 4px;
	}
	
	/* Screen reader only content */
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
	
	/* Custom scrollbar */
	.dropdown-content::-webkit-scrollbar {
		width: 6px;
	}
	
	.dropdown-content::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}
	
	.dropdown-content::-webkit-scrollbar-thumb {
		background: var(--dominant-color);
		border-radius: 3px;
	}
	
	.dropdown-content::-webkit-scrollbar-thumb:hover {
		background: color-mix(in srgb, var(--dominant-color) 80%, white);
	}
	
	/* Performance optimizations */
	@media (prefers-reduced-motion: reduce) {
		.bookmark-folder,
		.folder-object,
		.folder-glow {
			animation: none !important;
			transition: none !important;
		}
		
		.bookmark-folder.hovered {
			transform: scale(1.02);
		}
		
		.bookmark-category {
			animation: none;
		}
	}
	
	/* Responsive design */
	@media (max-width: 768px) {
		.bookmark-grid {
			grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
			gap: 16px;
		}
		
		.quick-add-button {
			width: 48px;
			height: 48px;
		}
		
		.bookmark-folder.hovered {
			transform: translateY(-4px) scale(1.02);
		}
		
		.bookmark-dropdown {
			max-width: calc(100vw - 40px);
		}
	}
	
	@media (max-width: 480px) {
		.bookmark-grid-container {
			padding: 0 16px;
		}
		
		.bookmark-grid {
			gap: 12px;
		}
	}
	
	/* High DPI displays */
	@media (-webkit-min-device-pixel-ratio: 2) {
		.folder-face {
			border-width: 0.5px;
		}
	}
	
	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.bookmark-dropdown {
			background: rgba(10, 10, 10, 0.95);
		}
	}
</style>
