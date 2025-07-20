<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, getContext, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { spring, tweened } from 'svelte/motion';
	import { cubicOut, elasticOut } from 'svelte/easing';
	
	import Object3D from './Object3D.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import ObjectSelector from './ObjectSelector.svelte';
	import BookmarkModal from './BookmarkModal.svelte';
	
	import type { BookmarkCategory, BookmarkItem } from '$stores/bookmarks';
	import { bookmarkStore, type InteractionState } from '$stores/bookmarks';
	import { settings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { Object3DRegistry } from '$lib';
	import { ThreeRenderer } from '$lib';
	import { debounce, throttle } from '$lib';
	
	export let categories: BookmarkCategory[] = [];
	export let searchQuery: string = '';
	export let className: string = '';
	
	let gridContainer: HTMLElement;
	let modalContainer: HTMLElement;
	let isInitialized = false;
	let webGLSupported = true;
	let sharedRenderer: ThreeRenderer | null = null;
	
	let hoveredCategoryId: string | null = null;
	let selectedCategoryId: string | null = null;
	let draggedCategoryId: string | null = null;
	let contextMenuVisible = false;
	let contextMenuPosition = { x: 0, y: 0 };
	let contextMenuCategory: BookmarkCategory | null = null;
	let objectSelectorVisible = false;
	let objectSelectorCategory: BookmarkCategory | null = null;
	let modalVisible = false;
	let modalCategory: BookmarkCategory | null = null;
	
	let gridColumns = 6;
	let gridRows = 3;
	let containerWidth = 0;
	let containerHeight = 0;
	let objectSize = 120;
	let gridGap = 24;
	
	let visibleCategories = new Set<string>();
	let categoryPositions = new Map<string, { x: number; y: number }>();
	let dragStartPosition = { x: 0, y: 0 };
	let isDragging = false;
	let animationFrame = 0;
	let lastResizeTime = 0;
	let intersectionObserver: IntersectionObserver | null = null;
	
	const hoverScale = spring(1, { stiffness: 0.4, damping: 0.8 });
	const dragOffset = spring({ x: 0, y: 0 }, { stiffness: 0.2, damping: 0.9 });
	const gridOpacity = tweened(0, { duration: 600, easing: cubicOut });
	
	const dispatch = createEventDispatcher();
	
	$: currentSettings = get(settings);
	$: currentColorPalette = get(colorStore);
	$: enable3D = currentSettings.enable3D && webGLSupported;
	$: filteredCategories = filterCategories(categories, searchQuery);
	$: maxVisibleCategories = gridColumns * gridRows;
	$: displayCategories = filteredCategories.slice(0, maxVisibleCategories);
	$: gridStyle = calculateGridStyle();
	
	onMount(async () => {
		if (!browser) return;
		
		try {
			sharedRenderer = getContext('threeRenderer');
			webGLSupported = getContext('webGLSupported') !== false;
			
			await Object3DRegistry.initialize();
			setupEventListeners();
			updateLayout();
			setupIntersectionObserver();
			calculateInitialPositions();
			
			gridOpacity.set(1);
			isInitialized = true;
			
			console.log('BookmarkGrid initialized with', displayCategories.length, 'categories');
		} catch (error) {
			console.error('BookmarkGrid initialization failed:', error);
			webGLSupported = false;
			gridOpacity.set(1);
		}
	});
	
	onDestroy(() => {
		cleanup();
	});
	
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
	
	function shouldUse3D(category: BookmarkCategory): boolean {
		return enable3D && category.objectId && Object3DRegistry.hasObject(category.objectId);
	}
	
	function getObjectForCategory(category: BookmarkCategory): string {
		if (category.objectId && Object3DRegistry.hasObject(category.objectId)) {
			return category.objectId;
		}
		
		const fallbackObjects = ['diamond', 'sphere', 'octahedron'];
		const index = Math.abs(category.name.charCodeAt(0)) % fallbackObjects.length;
		return fallbackObjects[index];
	}
	
	function calculateGridStyle(): string {
		const cols = Math.min(gridColumns, displayCategories.length);
		const itemSize = `${objectSize}px`;
		const gap = `${gridGap}px`;
		
		return `
			display: grid;
			grid-template-columns: repeat(${cols}, ${itemSize});
			gap: ${gap};
			justify-content: center;
			align-content: center;
			width: 100%;
			height: 100%;
			opacity: ${$gridOpacity};
			transform: translateZ(0);
		`;
	}
	
	function calculateInitialPositions() {
		categoryPositions.clear();
		displayCategories.forEach((category, index) => {
			const row = Math.floor(index / gridColumns);
			const col = index % gridColumns;
			const x = col * (objectSize + gridGap);
			const y = row * (objectSize + gridGap);
			categoryPositions.set(category.id, { x, y });
		});
	}
	
	function updateLayout() {
		if (!gridContainer) return;
		
		const rect = gridContainer.getBoundingClientRect();
		containerWidth = rect.width;
		containerHeight = rect.height;
		
		const availableWidth = containerWidth - (gridGap * 2);
		const availableHeight = containerHeight - (gridGap * 2);
		
		const maxCols = Math.floor(availableWidth / (objectSize + gridGap));
		const maxRows = Math.floor(availableHeight / (objectSize + gridGap));
		
		gridColumns = Math.max(1, Math.min(6, maxCols));
		gridRows = Math.max(1, Math.min(3, maxRows));
		
		calculateInitialPositions();
	}
	
	const debouncedUpdateLayout = debounce(updateLayout, 150);
	
	function setupEventListeners() {
		if (!browser) return;
		
		window.addEventListener('resize', debouncedUpdateLayout);
		document.addEventListener('keydown', handleKeyPress);
		document.addEventListener('click', handleDocumentClick);
	}
	
	function setupIntersectionObserver() {
		if (!browser || !window.IntersectionObserver) return;
		
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach(entry => {
					const categoryId = entry.target.getAttribute('data-category-id');
					if (!categoryId) return;
					
					if (entry.isIntersecting) {
						visibleCategories.add(categoryId);
					} else {
						visibleCategories.delete(categoryId);
					}
				});
			},
			{ threshold: 0.1 }
		);
		
		tick().then(() => {
			const categoryElements = gridContainer?.querySelectorAll('.category-container');
			categoryElements?.forEach(el => intersectionObserver?.observe(el));
		});
	}
	
	function handleCategoryClick(category: BookmarkCategory, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		
		if (isDragging) return;
		
		selectedCategoryId = category.id;
		modalCategory = category;
		modalVisible = true;
		
		dispatch('categoryClick', { category, event });
	}
	
	function handleCategoryHover(category: BookmarkCategory, isHovering: boolean) {
		if (isDragging) return;
		
		hoveredCategoryId = isHovering ? category.id : null;
		hoverScale.set(isHovering ? 1.1 : 1);
		
		dispatch('categoryHover', { category, isHovering });
	}
	
	function handleCategoryContextMenu(category: BookmarkCategory, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		
		contextMenuPosition = { x: event.clientX, y: event.clientY };
		contextMenuCategory = category;
		contextMenuVisible = true;
		
		dispatch('categoryContextMenu', { category, position: contextMenuPosition });
	}
	
	function handleDragStart(category: BookmarkCategory, event: MouseEvent) {
		if (!currentSettings.enableDragReorder) return;
		
		event.preventDefault();
		draggedCategoryId = category.id;
		dragStartPosition = { x: event.clientX, y: event.clientY };
		isDragging = false;
		
		document.addEventListener('mousemove', handleDragMove);
		document.addEventListener('mouseup', handleDragEnd);
	}
	
	function handleDragMove(event: MouseEvent) {
		if (!draggedCategoryId) return;
		
		const deltaX = event.clientX - dragStartPosition.x;
		const deltaY = event.clientY - dragStartPosition.y;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		
		if (!isDragging && distance > 5) {
			isDragging = true;
		}
		
		if (isDragging) {
			dragOffset.set({ x: deltaX, y: deltaY });
		}
	}
	
	function handleDragEnd(event: MouseEvent) {
		document.removeEventListener('mousemove', handleDragMove);
		document.removeEventListener('mouseup', handleDragEnd);
		
		if (isDragging && draggedCategoryId) {
			const finalPosition = {
				x: dragStartPosition.x + $dragOffset.x,
				y: dragStartPosition.y + $dragOffset.y
			};
			
			repositionCategory(draggedCategoryId, finalPosition);
		}
		
		draggedCategoryId = null;
		isDragging = false;
		dragOffset.set({ x: 0, y: 0 });
	}
	
	function repositionCategory(categoryId: string, newPosition: { x: number; y: number }) {
		const gridRect = gridContainer.getBoundingClientRect();
		const relativeX = newPosition.x - gridRect.left;
		const relativeY = newPosition.y - gridRect.top;
		
		const newCol = Math.round(relativeX / (objectSize + gridGap));
		const newRow = Math.round(relativeY / (objectSize + gridGap));
		
		const clampedCol = Math.max(0, Math.min(gridColumns - 1, newCol));
		const clampedRow = Math.max(0, Math.min(gridRows - 1, newRow));
		
		const newIndex = clampedRow * gridColumns + clampedCol;
		
		dispatch('categoryReposition', {
			categoryId,
			oldIndex: displayCategories.findIndex(c => c.id === categoryId),
			newIndex: Math.min(newIndex, displayCategories.length - 1)
		});
		
		calculateInitialPositions();
	}
	
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeAllModals();
		}
	}
	
	function handleDocumentClick(event: MouseEvent) {
		const target = event.target as Element;
		if (!gridContainer?.contains(target)) {
			closeAllModals();
		}
	}
	
	function closeAllModals() {
		contextMenuVisible = false;
		objectSelectorVisible = false;
		modalVisible = false;
		hoveredCategoryId = null;
		selectedCategoryId = null;
	}
	
	function handleObjectSelectorOpen(category: BookmarkCategory) {
		objectSelectorCategory = category;
		objectSelectorVisible = true;
		contextMenuVisible = false;
	}
	
	function handleObjectChange(event: CustomEvent) {
		const { category, objectId } = event.detail;
		
		bookmarkStore.updateCategory(category.id, {
			...category,
			objectId
		});
		
		objectSelectorVisible = false;
		dispatch('categoryObjectChange', { category, objectId });
	}
	
	function cleanup() {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
		
		if (intersectionObserver) {
			intersectionObserver.disconnect();
		}
		
		window.removeEventListener('resize', debouncedUpdateLayout);
		document.removeEventListener('keydown', handleKeyPress);
		document.removeEventListener('click', handleDocumentClick);
		document.removeEventListener('mousemove', handleDragMove);
		document.removeEventListener('mouseup', handleDragEnd);
	}
</script>

<div 
	class="bookmark-grid {className}"
	bind:this={gridContainer}
	class:webgl-supported={webGLSupported}
	class:fallback-mode={!enable3D}
	style="--object-size: {objectSize}px; --grid-gap: {gridGap}px;"
>
	{#if displayCategories.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📁</div>
			<h3>No bookmark folders found</h3>
			<p>{searchQuery ? 'Try adjusting your search terms' : 'Create your first bookmark folder to get started'}</p>
		</div>
	{:else}
		<div 
			class="categories-grid"
			style={gridStyle}
		>
			{#each displayCategories as category, index (category.id)}
				{@const isHovered = hoveredCategoryId === category.id}
				{@const isDraggedCategory = draggedCategoryId === category.id}
				{@const isVisible = visibleCategories.has(category.id)}
				{@const position = categoryPositions.get(category.id)}
				
				<div 
					class="category-container"
					class:hovered={isHovered}
					class:dragging={isDraggedCategory}
					class:visible={isVisible}
					data-category-id={category.id}
					style="
						--category-index: {index};
						--hover-scale: {isHovered ? 1.1 : 1};
						--drag-x: {isDraggedCategory ? $dragOffset.x : 0}px;
						--drag-y: {isDraggedCategory ? $dragOffset.y : 0}px;
					"
				>
					{#if shouldUse3D(category)}
						<div 
							class="object-3d-container"
							on:click={(e) => handleCategoryClick(category, e)}
							on:contextmenu={(e) => handleCategoryContextMenu(category, e)}
							on:mouseenter={() => handleCategoryHover(category, true)}
							on:mouseleave={() => handleCategoryHover(category, false)}
							on:mousedown={(e) => handleDragStart(category, e)}
							role="button"
							tabindex="0"
							aria-label={`Open ${category.name} bookmarks`}
						>
							<Object3D
								bookmarkCategory={category}
								objectId={getObjectForCategory(category)}
								size={objectSize}
								isActive={isHovered}
								enableAnimation={false}
								enableGlow={isHovered}
								enableShadows={currentSettings.enableShadows}
								dominantColor={currentColorPalette.current}
								fallbackTo2D={false}
								scale={isHovered ? 1.1 : 1}
								customization={{
									hoverGlow: isHovered,
									pulseSpeed: 0.8,
									materialVariant: currentColorPalette.accent
								}}
							/>
							
							<div class="category-overlay">
								<div class="category-label">
									<span class="category-name">{category.name}</span>
									<span class="bookmark-count">{category.bookmarks.length}</span>
								</div>
								
								{#if isHovered}
									<div class="hover-indicators">
										<div class="click-hint">Click to open</div>
										<div class="context-hint">Right-click for options</div>
									</div>
								{/if}
							</div>
						</div>
					{:else}
						<div 
							class="fallback-shape"
							class:hovered={isHovered}
							on:click={(e) => handleCategoryClick(category, e)}
							on:contextmenu={(e) => handleCategoryContextMenu(category, e)}
							on:mouseenter={() => handleCategoryHover(category, true)}
							on:mouseleave={() => handleCategoryHover(category, false)}
							on:mousedown={(e) => handleDragStart(category, e)}
							role="button"
							tabindex="0"
							aria-label={`Open ${category.name} bookmarks`}
						>
							<div class="shape-container">
								<div class="simple-shape"></div>
								{#if isHovered}
									<div class="shape-glow"></div>
								{/if}
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

{#if contextMenuVisible && contextMenuCategory}
	<ContextMenu
		category={contextMenuCategory}
		position={contextMenuPosition}
		visible={contextMenuVisible}
		on:close={() => contextMenuVisible = false}
		on:changeObject={() => handleObjectSelectorOpen(contextMenuCategory)}
		on:editCategory={(e) => dispatch('editCategory', e.detail)}
		on:deleteCategory={(e) => dispatch('deleteCategory', e.detail)}
	/>
{/if}

{#if objectSelectorVisible && objectSelectorCategory}
	<ObjectSelector
		category={objectSelectorCategory}
		visible={objectSelectorVisible}
		currentObjectId={objectSelectorCategory.objectId}
		on:close={() => objectSelectorVisible = false}
		on:objectSelect={handleObjectChange}
	/>
{/if}

{#if modalVisible && modalCategory}
	<BookmarkModal
		bind:this={modalContainer}
		category={modalCategory}
		visible={modalVisible}
		on:close={() => modalVisible = false}
		on:bookmarkClick={(e) => dispatch('bookmarkClick', e.detail)}
		on:bookmarkEdit={(e) => dispatch('bookmarkEdit', e.detail)}
		on:bookmarkDelete={(e) => dispatch('bookmarkDelete', e.detail)}
	/>
{/if}

<style>
	.bookmark-grid {
		position: relative;
		width: 100%;
		height: 100%;
		padding: var(--grid-gap);
		overflow: hidden;
		contain: layout style paint;
	}
	
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		opacity: 0.7;
	}
	
	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}
	
	.empty-state h3 {
		margin: 0 0 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
	}
	
	.empty-state p {
		margin: 0;
		opacity: 0.8;
	}
	
	.categories-grid {
		perspective: 1000px;
		transform-style: preserve-3d;
	}
	
	.category-container {
		position: relative;
		cursor: pointer;
		transform: 
			scale(var(--hover-scale, 1))
			translate3d(var(--drag-x, 0), var(--drag-y, 0), 0);
		transition: 
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			filter 0.2s ease;
		animation-delay: calc(var(--category-index, 0) * 50ms);
		will-change: transform;
	}
	
	.category-container.hovered {
		z-index: 10;
		filter: drop-shadow(0 8px 32px rgba(0, 0, 0, 0.3));
	}
	
	.category-container.dragging {
		z-index: 20;
		filter: drop-shadow(0 12px 48px rgba(0, 0, 0, 0.4));
		transition: none;
	}
	
	.object-3d-container {
		position: relative;
		width: var(--object-size);
		height: var(--object-size);
		border-radius: 16px;
		overflow: hidden;
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.1) 0%, 
			rgba(255, 255, 255, 0.05) 100%);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.category-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
		padding: 8px 12px;
		z-index: 2;
	}
	
	.category-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85rem;
		color: white;
	}
	
	.category-name {
		font-weight: 600;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 80px;
	}
	
	.bookmark-count {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 2px 6px;
		font-size: 0.75rem;
		font-weight: 500;
		backdrop-filter: blur(4px);
	}
	
	.hover-indicators {
		position: absolute;
		top: 8px;
		left: 8px;
		right: 8px;
		opacity: 0;
		animation: fadeInUp 0.3s ease forwards;
	}
	
	.click-hint,
	.context-hint {
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 0.7rem;
		margin-bottom: 4px;
		backdrop-filter: blur(4px);
	}
	
	.fallback-shape {
		position: relative;
		width: var(--object-size);
		height: var(--object-size);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border-radius: 16px;
		background: linear-gradient(135deg, 
			var(--primary-color, #4a90e2) 0%, 
			var(--secondary-color, #357abd) 100%);
		border: 2px solid rgba(255, 255, 255, 0.2);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
	}
	
	.fallback-shape.hovered {
		transform: scale(1.1);
		box-shadow: 0 8px 32px rgba(74, 144, 226, 0.4);
	}
	
	.shape-container {
		position: relative;
		width: 60%;
		height: 60%;
		margin-bottom: 8px;
	}
	
	.simple-shape {
		width: 100%;
		height: 100%;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		transition: all 0.3s ease;
	}
	
	.shape-glow {
		position: absolute;
		top: -10%;
		left: -10%;
		right: -10%;
		bottom: -10%;
		background: radial-gradient(circle, 
			rgba(255, 255, 255, 0.6) 0%, 
			transparent 70%);
		border-radius: 50%;
		animation: pulse 2s infinite;
	}
	
	.fallback-mode .category-container {
		animation: slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
		opacity: 0;
		transform: translateY(20px);
	}
	
	.fallback-mode .category-container.visible {
		opacity: 1;
		transform: translateY(0);
	}
	
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	@keyframes pulse {
		0%, 100% {
			opacity: 0.4;
			transform: scale(1);
		}
		50% {
			opacity: 0.8;
			transform: scale(1.1);
		}
	}
	
	@keyframes slideUp {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	@media (max-width: 768px) {
		.bookmark-grid {
			--object-size: 100px;
			--grid-gap: 16px;
		}
		
		.category-name {
			max-width: 60px;
		}
		
		.hover-indicators {
			display: none;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.category-container {
			transition: transform 0.1s ease;
		}
		
		.object-3d-container,
		.fallback-shape {
			transition: none;
		}
		
		.shape-glow {
			animation: none;
		}
	}
</style>
