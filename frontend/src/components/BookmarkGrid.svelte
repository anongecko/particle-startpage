<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, getContext, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	
	import Object3D from './Object3D.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import ObjectSelector from './ObjectSelector.svelte';
	import BookmarkModal from './BookmarkModal.svelte';
	
	import type { BookmarkCategory, BookmarkItem } from '$stores/bookmarks';
	import { bookmarkStore, type InteractionState } from '$stores/bookmarks';
	import { settings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { Object3DRegistry } from '$lib/objects3d';
	import { ThreeRenderer } from '$lib/three-renderer';
	
	// Props
	export let categories: BookmarkCategory[] = [];
	export let searchQuery: string = '';
	export let className: string = '';
	
	// Component state
	let gridContainer: HTMLElement;
	let modalContainer: HTMLElement;
	let isInitialized = false;
	let webGLSupported = true;
	let sharedRenderer: ThreeRenderer | null = null;
	
	// Interaction state
	let hoveredCategoryId: string | null = null;
	let openCategoryId: string | null = null;
	let contextMenuVisible = false;
	let contextMenuPosition = { x: 0, y: 0 };
	let contextMenuCategory: BookmarkCategory | null = null;
	let objectSelectorVisible = false;
	let objectSelectorCategory: BookmarkCategory | null = null;
	let modalVisible = false;
	let modalCategory: BookmarkCategory | null = null;
	
	// Grid layout state
	let gridColumns = 5;
	let gridRows = 2;
	let containerWidth = 0;
	let containerHeight = 0;
	let objectSize = 120;
	
	// Performance tracking
	let visibleCategories = new Set<string>();
	let animationFrame = 0;
	let lastResizeTime = 0;
	
	const dispatch = createEventDispatcher();
	
	// Reactive computations
	$: currentSettings = get(settings);
	$: currentColorPalette = get(colorStore);
	$: enable3D = currentSettings.enable3D && webGLSupported;
	$: filteredCategories = filterCategories(categories, searchQuery);
	$: visibleRows = Math.min(Math.ceil(filteredCategories.length / gridColumns), gridRows);
	$: maxVisibleCategories = gridColumns * gridRows;
	$: displayCategories = filteredCategories.slice(0, maxVisibleCategories);
	
	// Initialize component
	onMount(async () => {
		if (!browser) return;
		
		try {
			// Get shared Three.js renderer from context
			sharedRenderer = getContext('threeRenderer');
			webGLSupported = getContext('webGLSupported') !== false;
			
			// Initialize Object3D registry
			await Object3DRegistry.initialize();
			
			// Setup event listeners
			setupEventListeners();
			
			// Calculate initial layout
			updateLayout();
			
			// Start intersection observer for performance
			setupIntersectionObserver();
			
			isInitialized = true;
			console.log('BookmarkGrid initialized successfully');
			
		} catch (error) {
			console.error('BookmarkGrid initialization failed:', error);
			webGLSupported = false;
		}
	});
	
	onDestroy(() => {
		cleanup();
	});
	
	// Filter categories based on search query
	function filterCategories(cats: BookmarkCategory[], query: string): BookmarkCategory[] {
		if (!query.trim()) return cats;
		
		const searchTerm = query.toLowerCase();
		return cats.filter(category => 
			category.name.toLowerCase().includes(searchTerm) ||
			category.description?.toLowerCase().includes(searchTerm) ||
			category.bookmarks.some(bookmark => 
				bookmark.title.toLowerCase().includes(searchTerm) ||
				bookmark.url.toLowerCase().includes(searchTerm)
			)
		);
	}
	
	// Layout calculation
	function updateLayout(): void {
		if (!gridContainer) return;
		
		const containerRect = gridContainer.getBoundingClientRect();
		containerWidth = containerRect.width;
		containerHeight = containerRect.height;
		
		// Calculate optimal object size and grid layout
		const padding = 24;
		const minObjectSize = 80;
		const maxObjectSize = 150;
		
		// Calculate available space per object
		const availableWidth = containerWidth - (padding * 2);
		const availableHeight = containerHeight - (padding * 2);
		
		const optimalSizeByWidth = (availableWidth - (gridColumns - 1) * 20) / gridColumns;
		const optimalSizeByHeight = (availableHeight - (gridRows - 1) * 20) / gridRows;
		
		objectSize = Math.max(minObjectSize, Math.min(maxObjectSize, 
			Math.min(optimalSizeByWidth, optimalSizeByHeight)));
		
		// Adjust grid columns for small screens
		if (containerWidth < 600) {
			gridColumns = 3;
		} else if (containerWidth < 900) {
			gridColumns = 4;
		} else {
			gridColumns = 5;
		}
		
		// Update visible categories tracking
		updateVisibleCategories();
	}
	
	// Track which categories are visible for performance optimization
	function updateVisibleCategories(): void {
		visibleCategories.clear();
		displayCategories.forEach(category => {
			visibleCategories.add(category.id);
		});
	}
	
	// Setup intersection observer for performance
	function setupIntersectionObserver(): void {
		if (!browser || !gridContainer) return;
		
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				const categoryId = entry.target.getAttribute('data-category-id');
				if (categoryId) {
					if (entry.isIntersecting) {
						visibleCategories.add(categoryId);
					} else {
						visibleCategories.delete(categoryId);
					}
				}
			});
		}, {
			threshold: 0.1,
			rootMargin: '50px'
		});
		
		// Observe all category elements
		setTimeout(() => {
			const categoryElements = gridContainer.querySelectorAll('[data-category-id]');
			categoryElements.forEach(el => observer.observe(el));
		}, 100);
	}
	
	// Event listeners setup
	function setupEventListeners(): void {
		if (!browser) return;
		
		// Resize handler with throttling
		const handleResize = () => {
			const now = Date.now();
			if (now - lastResizeTime > 100) {
				lastResizeTime = now;
				updateLayout();
			}
		};
		
		// Click outside handler
		const handleClickOutside = (event: MouseEvent) => {
			if (!gridContainer?.contains(event.target as Node)) {
				closeAllInteractions();
			}
		};
		
		// Keyboard handler
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeAllInteractions();
			}
		};
		
		window.addEventListener('resize', handleResize);
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		
		// Store cleanup functions
		const cleanup = () => {
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
		
		// Return cleanup for onDestroy
		return cleanup;
	}
	
	// Category interaction handlers
	function handleCategoryClick(category: BookmarkCategory, event: MouseEvent): void {
		event.stopPropagation();
		
		// Close any existing interactions
		closeAllInteractions();
		
		// Open bookmark modal
		openBookmarkModal(category);
		
		// Update analytics
		try {
			bookmarkStore.recordCategoryAccess?.(category.id);
		} catch (error) {
			console.warn('Failed to record category access:', error);
		}
		
		dispatch('category-click', { category, event });
	}
	
	function handleCategoryHover(category: BookmarkCategory, isHovering: boolean): void {
		hoveredCategoryId = isHovering ? category.id : null;
		
		dispatch('category-hover', { category, isHovering });
	}
	
	function handleCategoryContextMenu(category: BookmarkCategory, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		
		// Close existing menus
		closeAllInteractions();
		
		// Open context menu
		contextMenuCategory = category;
		contextMenuPosition = { x: event.clientX, y: event.clientY };
		contextMenuVisible = true;
		
		dispatch('category-context-menu', { category, event });
	}
	
	// Modal handlers
	function openBookmarkModal(category: BookmarkCategory): void {
		modalCategory = category;
		modalVisible = true;
		openCategoryId = category.id;
	}
	
	function closeBookmarkModal(): void {
		modalVisible = false;
		modalCategory = null;
		openCategoryId = null;
	}
	
	// Context menu handlers
	function closeContextMenu(): void {
		contextMenuVisible = false;
		contextMenuCategory = null;
	}
	
	function handleContextMenuAction(event: CustomEvent): void {
		const { action, category } = event.detail;
		
		switch (action) {
			case 'change-object':
				openObjectSelector(category);
				break;
			case 'edit-name':
				editCategoryName(category);
				break;
			case 'customize-material':
				customizeMaterial(category);
				break;
			case 'delete-category':
				deleteCategory(category);
				break;
		}
		
		closeContextMenu();
	}
	
	// Object selector handlers
	function openObjectSelector(category: BookmarkCategory): void {
		objectSelectorCategory = category;
		objectSelectorVisible = true;
	}
	
	function closeObjectSelector(): void {
		objectSelectorVisible = false;
		objectSelectorCategory = null;
	}
	
	function handleObjectSelect(event: CustomEvent): void {
		const { objectId } = event.detail;
		
		if (objectSelectorCategory) {
			try {
				bookmarkStore.updateCategoryObject?.(objectSelectorCategory.id, objectId);
			} catch (error) {
				console.error('Failed to update category object:', error);
			}
		}
		
		closeObjectSelector();
	}
	
	// Category management
	function editCategoryName(category: BookmarkCategory): void {
		const newName = prompt('Enter new category name:', category.name);
		if (newName && newName.trim() !== category.name) {
			try {
				bookmarkStore.updateCategoryName?.(category.id, newName.trim());
			} catch (error) {
				console.error('Failed to update category name:', error);
			}
		}
	}
	
	function customizeMaterial(category: BookmarkCategory): void {
		// Open material customization panel
		dispatch('customize-material', { category });
	}
	
	function deleteCategory(category: BookmarkCategory): void {
		if (confirm(`Are you sure you want to delete "${category.name}"? This will also delete all bookmarks in this category.`)) {
			try {
				bookmarkStore.deleteCategory?.(category.id);
			} catch (error) {
				console.error('Failed to delete category:', error);
			}
		}
	}
	
	// Utility functions
	function closeAllInteractions(): void {
		closeContextMenu();
		closeObjectSelector();
		closeBookmarkModal();
		hoveredCategoryId = null;
	}
	
	function getObjectForCategory(category: BookmarkCategory): string {
		return category.objectId || 'geometric/sphere';
	}
	
	function getCategoryFallbackIcon(category: BookmarkCategory): string {
		const iconMap: Record<string, string> = {
			'development/computer': '💻',
			'development/git-tree': '🌳',
			'development/coffee': '☕',
			'learning/graduation-cap': '🎓',
			'learning/textbooks': '📚',
			'learning/brain': '🧠',
			'creative/dice': '🎲',
			'creative/treasure-chest': '💰',
			'geometric/diamond': '💎',
			'geometric/sphere': '⚪',
			'geometric/octahedron': '🔷'
		};
		
		return iconMap[category.objectId || ''] || '📁';
	}
	
	function shouldUse3D(category: BookmarkCategory): boolean {
		return enable3D && 
			   category.objectId && 
			   visibleCategories.has(category.id) &&
			   Object3DRegistry.getObject(category.objectId) !== null;
	}
	
	function cleanup(): void {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
		closeAllInteractions();
	}
</script>

<div 
	class="bookmark-grid {className}"
	bind:this={gridContainer}
	style="--grid-columns: {gridColumns}; --object-size: {objectSize}px; --grid-rows: {visibleRows};"
>
	{#if !isInitialized}
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<p>Loading bookmark folders...</p>
		</div>
	{:else if displayCategories.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📁</div>
			<h3>No bookmark folders found</h3>
			<p>{searchQuery ? 'Try adjusting your search terms' : 'Create your first bookmark folder to get started'}</p>
		</div>
	{:else}
		<div class="categories-grid">
			{#each displayCategories as category (category.id)}
				<div 
					class="category-container"
					data-category-id={category.id}
					class:hovered={hoveredCategoryId === category.id}
					class:open={openCategoryId === category.id}
				>
					{#if shouldUse3D(category)}
						<div 
							class="object-3d-container"
							on:click={(e) => handleCategoryClick(category, e)}
							on:contextmenu={(e) => handleCategoryContextMenu(category, e)}
							on:mouseenter={() => handleCategoryHover(category, true)}
							on:mouseleave={() => handleCategoryHover(category, false)}
							role="button"
							tabindex="0"
							aria-label={`Open ${category.name} bookmarks`}
						>
							<Object3D
								bookmarkCategory={category}
								objectId={getObjectForCategory(category)}
								size={objectSize}
								isActive={hoveredCategoryId === category.id}
								enableAnimation={currentSettings.enableAnimations}
								enableGlow={true}
								enableShadows={currentSettings.enableShadows}
								dominantColor={currentColorPalette.current}
								fallbackTo2D={true}
							/>
							
							<div class="category-label">
								<span class="category-name">{category.name}</span>
								<span class="bookmark-count">{category.bookmarks.length}</span>
							</div>
						</div>
					{:else}
						<!-- CSS Fallback -->
						<div 
							class="fallback-folder"
							class:hovered={hoveredCategoryId === category.id}
							on:click={(e) => handleCategoryClick(category, e)}
							on:contextmenu={(e) => handleCategoryContextMenu(category, e)}
							on:mouseenter={() => handleCategoryHover(category, true)}
							on:mouseleave={() => handleCategoryHover(category, false)}
							role="button"
							tabindex="0"
							aria-label={`Open ${category.name} bookmarks`}
							style="background: linear-gradient(135deg, {currentColorPalette.current}22, {currentColorPalette.current}44);"
						>
							<div class="fallback-icon">
								{getCategoryFallbackIcon(category)}
							</div>
							
							<div class="category-label">
								<span class="category-name">{category.name}</span>
								<span class="bookmark-count">{category.bookmarks.length}</span>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Bookmark Modal -->
{#if modalVisible && modalCategory}
	<BookmarkModal
		category={modalCategory}
		visible={modalVisible}
		on:close={closeBookmarkModal}
		on:bookmark-click
		on:bookmark-edit
		on:bookmark-delete
	/>
{/if}

<!-- Context Menu -->
{#if contextMenuVisible && contextMenuCategory}
	<ContextMenu
		category={contextMenuCategory}
		position={contextMenuPosition}
		visible={contextMenuVisible}
		on:action={handleContextMenuAction}
		on:close={closeContextMenu}
	/>
{/if}

<!-- Object Selector -->
{#if objectSelectorVisible && objectSelectorCategory}
	<ObjectSelector
		category={objectSelectorCategory}
		visible={objectSelectorVisible}
		on:select={handleObjectSelect}
		on:close={closeObjectSelector}
	/>
{/if}

<style>
	.bookmark-grid {
		width: 100%;
		height: 100%;
		padding: 24px;
		position: relative;
		overflow: hidden;
	}
	
	.loading-state, .empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top: 3px solid rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 16px;
	}
	
	.empty-icon {
		font-size: 64px;
		margin-bottom: 16px;
		opacity: 0.6;
	}
	
	.empty-state h3 {
		margin: 0 0 8px;
		font-size: 20px;
		font-weight: 600;
	}
	
	.empty-state p {
		margin: 0;
		font-size: 14px;
		opacity: 0.8;
	}
	
	.categories-grid {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		grid-template-rows: repeat(var(--grid-rows), var(--object-size));
		gap: 20px;
		align-items: center;
		justify-items: center;
		width: 100%;
		height: 100%;
		max-width: 1200px;
		margin: 0 auto;
	}
	
	.category-container {
		position: relative;
		width: var(--object-size);
		height: var(--object-size);
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: transform 0.2s ease;
	}
	
	.category-container.hovered {
		transform: scale(1.05);
		z-index: 10;
	}
	
	.object-3d-container {
		position: relative;
		width: 100%;
		height: calc(100% - 40px);
		cursor: pointer;
		border-radius: 12px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.3s ease;
	}
	
	.object-3d-container:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}
	
	.fallback-folder {
		position: relative;
		width: 100%;
		height: calc(100% - 40px);
		cursor: pointer;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		transition: all 0.3s ease;
		transform-style: preserve-3d;
	}
	
	.fallback-folder:hover {
		transform: scale(1.2) rotateY(10deg) rotateX(5deg);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		filter: brightness(1.2) drop-shadow(0 0 20px currentColor);
	}
	
	.fallback-folder.hovered {
		animation: gentleSpin 3s ease-in-out infinite;
	}
	
	.fallback-icon {
		font-size: 48px;
		margin-bottom: 8px;
		filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
		transition: transform 0.3s ease;
	}
	
	.fallback-folder:hover .fallback-icon {
		transform: scale(1.1);
	}
	
	.category-label {
		position: absolute;
		bottom: -32px;
		left: 50%;
		transform: translateX(-50%);
		text-align: center;
		width: 100%;
		padding: 4px 8px;
	}
	
	.category-name {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: white;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	
	.bookmark-count {
		display: block;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.7);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		margin-top: 2px;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	@keyframes gentleSpin {
		0%, 100% { transform: scale(1.2) rotateY(0deg); }
		50% { transform: scale(1.2) rotateY(360deg); }
	}
	
	/* Responsive adjustments */
	@media (max-width: 1200px) {
		.bookmark-grid {
			padding: 20px;
		}
		
		.categories-grid {
			gap: 16px;
		}
	}
	
	@media (max-width: 900px) {
		.bookmark-grid {
			padding: 16px;
		}
		
		.categories-grid {
			gap: 12px;
		}
		
		.category-name {
			font-size: 11px;
		}
		
		.bookmark-count {
			font-size: 9px;
		}
	}
	
	@media (max-width: 600px) {
		.bookmark-grid {
			padding: 12px;
		}
		
		.categories-grid {
			gap: 8px;
		}
		
		.fallback-icon {
			font-size: 36px;
		}
	}
</style>
