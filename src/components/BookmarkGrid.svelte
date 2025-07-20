<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, getContext, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { spring, tweened } from 'svelte/motion';
	import { cubicOut, elasticOut, quintOut } from 'svelte/easing';
	
	import Object3D from './Object3D.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import ObjectSelector from './ObjectSelector.svelte';
	import BookmarkModal from './BookmarkModal.svelte';
	
	import type { BookmarkCategory, BookmarkItem } from '$stores/bookmarks';
	import { bookmarkStore, type InteractionState } from '$stores/bookmarks';
	import { objects3DSettings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { Object3DRegistry } from '$lib';
	import { ThreeRenderer } from '$lib';
	import { debounce, throttle } from '$lib';
	
	interface Props {
		categories?: BookmarkCategory[];
		searchQuery?: string;
		className?: string;
	}
	
	let {
		categories = [],
		searchQuery = '',
		className = ''
	}: Props = $props();
	
	let gridContainer: HTMLElement = $state();
	let modalContainer: HTMLElement = $state();
	let isInitialized = $state(false);
	let webGLSupported = $state(true);
	let sharedRenderer: ThreeRenderer | null = $state();
	
	let hoveredCategoryId: string | null = $state(null);
	let selectedCategoryId: string | null = $state(null);
	let draggedCategoryId: string | null = $state(null);
	let contextMenuVisible = $state(false);
	let contextMenuPosition = $state({ x: 0, y: 0 });
	let contextMenuCategory: BookmarkCategory | null = $state(null);
	let objectSelectorVisible = $state(false);
	let objectSelectorCategory: BookmarkCategory | null = $state(null);
	let modalVisible = $state(false);
	let modalCategory: BookmarkCategory | null = $state(null);
	let focusedCategoryIndex = $state(-1);
	
	let gridColumns = $state(6);
	let gridRows = $state(3);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let objectSize = $state(120);
	let gridGap = $state(24);
	
	let visibleCategories = $state(new Set<string>());
	let categoryPositions = $state(new Map<string, { x: number; y: number }>());
	let dragStartPosition = $state({ x: 0, y: 0 });
	let isDragging = $state(false);
	let animationFrame = $state(0);
	let lastResizeTime = $state(0);
	let intersectionObserver: IntersectionObserver | null = $state();
	
	const hoverScale = spring(1, { stiffness: 0.4, damping: 0.8 });
	const dragOffset = spring({ x: 0, y: 0 }, { stiffness: 0.2, damping: 0.9 });
	const gridOpacity = tweened(0, { duration: 600, easing: cubicOut });
	const focusScale = spring(1, { stiffness: 0.3, damping: 0.7 });
	
	const dispatch = createEventDispatcher();
	
	let currentSettings = $derived($objects3DSettings);
	let currentColorPalette = $derived($colorStore);
	let enable3D = $derived(currentSettings?.enabled && webGLSupported);
	let filteredCategories = $derived(filterCategories(categories, searchQuery));
	let maxVisibleCategories = $derived(gridColumns * gridRows);
	let displayCategories = $derived(filteredCategories.slice(0, maxVisibleCategories));
	let gridStyle = $derived(calculateGridStyle());
	
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
		document.addEventListener('keydown', handleGlobalKeyPress);
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
				visibleCategories = new Set(visibleCategories); // Trigger reactivity
			},
			{ threshold: 0.1 }
		);
		
		tick().then(() => {
			const categoryElements = gridContainer?.querySelectorAll('.category-container');
			categoryElements?.forEach(el => intersectionObserver?.observe(el));
		});
	}
	
	function handleCategoryClick(category: BookmarkCategory, event: MouseEvent | KeyboardEvent) {
		event.preventDefault();
		event.stopPropagation();
		
		if (isDragging) return;
		
		selectedCategoryId = category.id;
		modalCategory = category;
		modalVisible = true;
		
		dispatch('categoryClick', { category, event });
	}
	
	function handleCategoryKeyDown(category: BookmarkCategory, event: KeyboardEvent, index: number) {
		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				handleCategoryClick(category, event);
				break;
			case 'ArrowRight':
				event.preventDefault();
				navigateToCategory(index + 1);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				navigateToCategory(index - 1);
				break;
			case 'ArrowDown':
				event.preventDefault();
				navigateToCategory(index + gridColumns);
				break;
			case 'ArrowUp':
				event.preventDefault();
				navigateToCategory(index - gridColumns);
				break;
			case 'Home':
				event.preventDefault();
				navigateToCategory(0);
				break;
			case 'End':
				event.preventDefault();
				navigateToCategory(displayCategories.length - 1);
				break;
			case 'Escape':
				event.preventDefault();
				closeAllModals();
				break;
		}
	}
	
	function navigateToCategory(newIndex: number) {
		if (newIndex < 0 || newIndex >= displayCategories.length) return;
		
		focusedCategoryIndex = newIndex;
		const categoryElement = gridContainer?.querySelector(`[data-category-index="${newIndex}"]`) as HTMLElement;
		categoryElement?.focus();
	}
	
	function handleCategoryHover(category: BookmarkCategory, isHovering: boolean) {
		if (isDragging) return;
		
		hoveredCategoryId = isHovering ? category.id : null;
		hoverScale.set(isHovering ? 1.05 : 1);
		
		dispatch('categoryHover', { category, isHovering });
	}
	
	function handleCategoryFocus(category: BookmarkCategory, index: number) {
		focusedCategoryIndex = index;
		hoveredCategoryId = category.id;
		focusScale.set(1.02);
	}
	
	function handleCategoryBlur() {
		hoveredCategoryId = null;
		focusScale.set(1);
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
		if (!currentSettings?.enableDragReorder) return;
		
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
	
	function handleGlobalKeyPress(event: KeyboardEvent) {
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
		focusedCategoryIndex = -1;
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
		document.removeEventListener('keydown', handleGlobalKeyPress);
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
	style="--object-size: {objectSize}px; --grid-gap: {gridGap}px; --hover-scale: {$hoverScale}; --focus-scale: {$focusScale};"
	role="grid"
	aria-label="Bookmark categories"
>
	{#if displayCategories.length === 0}
		<div class="empty-state" role="status" aria-live="polite">
			<div class="empty-icon" aria-hidden="true">📁</div>
			<h3>No bookmark folders found</h3>
			<p>{searchQuery ? 'Try adjusting your search terms' : 'Create your first bookmark folder to get started'}</p>
		</div>
	{:else}
		<div 
			class="categories-grid"
			style={gridStyle}
			role="presentation"
		>
			{#each displayCategories as category, index (category.id)}
				{@const isHovered = hoveredCategoryId === category.id}
				{@const isFocused = focusedCategoryIndex === index}
				{@const isDraggedCategory = draggedCategoryId === category.id}
				{@const isVisible = visibleCategories.has(category.id)}
				{@const position = categoryPositions.get(category.id)}
				
				<div 
					class="category-container"
					class:hovered={isHovered}
					class:focused={isFocused}
					class:dragging={isDraggedCategory}
					class:visible={isVisible}
					data-category-id={category.id}
					data-category-index={index}
					style="
						--category-index: {index};
						--hover-scale: {isHovered ? 1.05 : 1};
						--focus-scale: {isFocused ? 1.02 : 1};
						--drag-x: {isDraggedCategory ? $dragOffset.x : 0}px;
						--drag-y: {isDraggedCategory ? $dragOffset.y : 0}px;
					"
					role="gridcell"
					aria-rowindex={Math.floor(index / gridColumns) + 1}
					aria-colindex={(index % gridColumns) + 1}
				>
					{#if shouldUse3D(category)}
						<button 
							class="object-3d-container"
							onclick={(e) => handleCategoryClick(category, e)}
							onkeydown={(e) => handleCategoryKeyDown(category, e, index)}
							oncontextmenu={(e) => handleCategoryContextMenu(category, e)}
							onmouseenter={() => handleCategoryHover(category, true)}
							onmouseleave={() => handleCategoryHover(category, false)}
							onfocus={() => handleCategoryFocus(category, index)}
							onblur={handleCategoryBlur}
							onmousedown={(e) => handleDragStart(category, e)}
							tabindex={isFocused ? 0 : -1}
							aria-label={`Open ${category.name} bookmarks (${category.bookmarks.length} items)`}
							aria-describedby={`category-info-${category.id}`}
							type="button"
						>
							<Object3D
								bookmarkCategory={category}
								objectId={getObjectForCategory(category)}
								size={objectSize}
								isActive={isHovered || isFocused}
								enableAnimation={false}
								enableGlow={isHovered || isFocused}
								enableShadows={currentSettings?.enableShadows}
								dominantColor={currentColorPalette?.current}
								fallbackTo2D={false}
								scale={(isHovered || isFocused) ? 1.1 : 1}
								customization={{
									hoverGlow: isHovered || isFocused,
									pulseSpeed: 0.8,
									materialVariant: currentColorPalette?.accent
								}}
							/>
							
							<div class="category-overlay" aria-hidden="true">
								<div class="category-label">
									<span class="category-name">{category.name}</span>
									<span class="bookmark-count">{category.bookmarks.length}</span>
								</div>
								
								{#if isHovered || isFocused}
									<div class="interaction-hints">
										<div class="hint primary">Press Enter to open</div>
										<div class="hint secondary">Right-click for options</div>
									</div>
								{/if}
							</div>
							
							<div class="focus-ring" aria-hidden="true"></div>
							<div class="hover-glow" aria-hidden="true"></div>
						</button>
					{:else}
						<button 
							class="fallback-shape"
							class:hovered={isHovered}
							class:focused={isFocused}
							onclick={(e) => handleCategoryClick(category, e)}
							onkeydown={(e) => handleCategoryKeyDown(category, e, index)}
							oncontextmenu={(e) => handleCategoryContextMenu(category, e)}
							onmouseenter={() => handleCategoryHover(category, true)}
							onmouseleave={() => handleCategoryHover(category, false)}
							onfocus={() => handleCategoryFocus(category, index)}
							onblur={handleCategoryBlur}
							onmousedown={(e) => handleDragStart(category, e)}
							tabindex={isFocused ? 0 : -1}
							aria-label={`Open ${category.name} bookmarks (${category.bookmarks.length} items)`}
							aria-describedby={`category-info-${category.id}`}
							type="button"
						>
							<div class="shape-container" aria-hidden="true">
								<div class="simple-shape"></div>
								<div class="shape-gradient"></div>
								{#if isHovered || isFocused}
									<div class="shape-glow"></div>
								{/if}
							</div>
							
							<div class="category-info" id={`category-info-${category.id}`}>
								<span class="category-name">{category.name}</span>
								<span class="bookmark-count">{category.bookmarks.length} items</span>
							</div>
							
							<div class="focus-ring" aria-hidden="true"></div>
						</button>
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
		onclose={() => contextMenuVisible = false}
		onchangeObject={() => handleObjectSelectorOpen(contextMenuCategory)}
		oneditCategory={(e) => dispatch('editCategory', e.detail)}
		ondeleteCategory={(e) => dispatch('deleteCategory', e.detail)}
	/>
{/if}

{#if objectSelectorVisible && objectSelectorCategory}
	<ObjectSelector
		category={objectSelectorCategory}
		show={objectSelectorVisible}
		currentObjectId={objectSelectorCategory.objectId}
		onclose={() => objectSelectorVisible = false}
		onconfirm={handleObjectChange}
	/>
{/if}

{#if modalVisible && modalCategory}
	<BookmarkModal
		bind:this={modalContainer}
		category={modalCategory}
		visible={modalVisible}
		onclose={() => modalVisible = false}
		onbookmarkClick={(e) => dispatch('bookmarkClick', e.detail)}
		onbookmarkEdit={(e) => dispatch('bookmarkEdit', e.detail)}
		onbookmarkDelete={(e) => dispatch('bookmarkDelete', e.detail)}
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
		perspective: 1200px;
	}
	
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		opacity: 0.8;
		animation: fadeIn 0.6s ease-out;
	}
	
	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1.5rem;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
	}
	
	.empty-state h3 {
		margin: 0 0 0.75rem;
		font-size: 1.75rem;
		font-weight: 700;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	
	.empty-state p {
		margin: 0;
		opacity: 0.7;
		font-size: 1.1rem;
		line-height: 1.5;
		max-width: 400px;
	}
	
	.categories-grid {
		transform-style: preserve-3d;
		animation: gridSlideUp 0.8s cubic-bezier(0.23, 1, 0.320, 1);
	}
	
	.category-container {
		position: relative;
		cursor: pointer;
		transform: 
			scale(calc(var(--hover-scale, 1) * var(--focus-scale, 1)))
			translate3d(var(--drag-x, 0), var(--drag-y, 0), 0);
		transition: 
			transform 0.4s cubic-bezier(0.23, 1, 0.320, 1),
			filter 0.3s ease,
			z-index 0.2s ease;
		animation: categoryAppear 0.6s cubic-bezier(0.23, 1, 0.320, 1) forwards;
		animation-delay: calc(var(--category-index, 0) * 80ms);
		will-change: transform, filter;
		opacity: 0;
		transform-origin: center bottom;
	}
	
	.category-container.visible {
		opacity: 1;
	}
	
	.category-container.hovered,
	.category-container.focused {
		z-index: 10;
		filter: 
			drop-shadow(0 12px 40px rgba(0, 0, 0, 0.25))
			drop-shadow(0 4px 16px rgba(59, 130, 246, 0.15));
	}
	
	.category-container.dragging {
		z-index: 20;
		filter: 
			drop-shadow(0 20px 60px rgba(0, 0, 0, 0.35))
			drop-shadow(0 8px 24px rgba(59, 130, 246, 0.25));
		transition: filter 0.3s ease;
	}
	
	.object-3d-container,
	.fallback-shape {
		position: relative;
		width: var(--object-size);
		height: var(--object-size);
		border-radius: 20px;
		overflow: hidden;
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.15) 0%, 
			rgba(255, 255, 255, 0.08) 50%,
			rgba(255, 255, 255, 0.05) 100%);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.25);
		transition: all 0.4s cubic-bezier(0.23, 1, 0.320, 1);
		outline: none;
		font: inherit;
		cursor: pointer;
		transform-style: preserve-3d;
	}
	
	.object-3d-container:hover,
	.object-3d-container:focus-visible,
	.fallback-shape:hover,
	.fallback-shape:focus-visible {
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.2) 0%, 
			rgba(255, 255, 255, 0.12) 50%,
			rgba(255, 255, 255, 0.08) 100%);
		border-color: rgba(255, 255, 255, 0.4);
		transform: translateY(-2px) scale(1.02);
	}
	
	.object-3d-container:active,
	.fallback-shape:active {
		transform: translateY(0) scale(0.98);
		transition: transform 0.1s ease;
	}
	
	.category-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(transparent 0%, 
			rgba(0, 0, 0, 0.6) 60%, 
			rgba(0, 0, 0, 0.9) 100%);
		padding: 12px 16px;
		z-index: 2;
		backdrop-filter: blur(8px);
	}
	
	.category-label,
	.category-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
		color: white;
		gap: 8px;
	}
	
	.category-name {
		font-weight: 600;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		font-size: 0.95rem;
		letter-spacing: 0.3px;
	}
	
	.bookmark-count {
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.25) 0%, 
			rgba(255, 255, 255, 0.15) 100%);
		border-radius: 14px;
		padding: 4px 10px;
		font-size: 0.8rem;
		font-weight: 600;
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		white-space: nowrap;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	
	.interaction-hints {
		position: absolute;
		top: 12px;
		left: 12px;
		right: 12px;
		opacity: 0;
		animation: hintsSlideIn 0.3s ease-out 0.1s forwards;
	}
	
	.hint {
		background: rgba(0, 0, 0, 0.85);
		color: white;
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 0.75rem;
		font-weight: 500;
		margin-bottom: 4px;
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		text-shadow: none;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}
	
	.hint.primary {
		background: linear-gradient(135deg, 
			rgba(59, 130, 246, 0.9) 0%, 
			rgba(37, 99, 235, 0.9) 100%);
		border-color: rgba(59, 130, 246, 0.3);
	}
	
	.fallback-shape {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		padding: 20px 16px 16px;
		background: linear-gradient(135deg, 
			var(--primary-color, #667eea) 0%, 
			var(--secondary-color, #764ba2) 100%);
		border: 2px solid rgba(255, 255, 255, 0.25);
		box-shadow: 
			0 8px 32px rgba(0, 0, 0, 0.15),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}
	
	.fallback-shape.hovered,
	.fallback-shape.focused {
		background: linear-gradient(135deg, 
			var(--primary-color, #667eea) 0%, 
			var(--secondary-color, #764ba2) 80%,
			rgba(255, 255, 255, 0.1) 100%);
		box-shadow: 
			0 16px 48px rgba(0, 0, 0, 0.25),
			0 4px 16px rgba(102, 126, 234, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}
	
	.shape-container {
		position: relative;
		width: 64px;
		height: 64px;
		margin-bottom: 12px;
	}
	
	.simple-shape {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.9) 0%, 
			rgba(255, 255, 255, 0.7) 100%);
		border-radius: 50%;
		transition: all 0.4s cubic-bezier(0.23, 1, 0.320, 1);
		box-shadow: 
			0 4px 16px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	
	.shape-gradient {
		position: absolute;
		top: 2px;
		left: 2px;
		right: 2px;
		bottom: 2px;
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.3) 0%, 
			transparent 50%,
			rgba(0, 0, 0, 0.1) 100%);
		border-radius: 50%;
		pointer-events: none;
	}
	
	.shape-glow {
		position: absolute;
		top: -20%;
		left: -20%;
		right: -20%;
		bottom: -20%;
		background: radial-gradient(circle, 
			rgba(255, 255, 255, 0.6) 0%, 
			rgba(255, 255, 255, 0.3) 40%,
			transparent 80%);
		border-radius: 50%;
		animation: pulseGlow 2s ease-in-out infinite;
		z-index: -1;
	}
	
	.category-info {
		flex-direction: column;
		align-items: center;
		gap: 4px;
		text-align: center;
	}
	
	.category-info .category-name {
		font-size: 0.9rem;
		font-weight: 700;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		color: white;
		max-width: 100px;
	}
	
	.category-info .bookmark-count {
		background: rgba(255, 255, 255, 0.25);
		color: white;
		font-size: 0.75rem;
		padding: 2px 8px;
		font-weight: 500;
	}
	
	.focus-ring {
		position: absolute;
		top: -3px;
		left: -3px;
		right: -3px;
		bottom: -3px;
		border: 3px solid transparent;
		border-radius: 23px;
		transition: all 0.2s ease;
		pointer-events: none;
		z-index: -1;
	}
	
	.category-container.focused .focus-ring {
		border-color: rgba(59, 130, 246, 0.8);
		box-shadow: 
			0 0 0 1px rgba(59, 130, 246, 0.4),
			0 0 16px rgba(59, 130, 246, 0.3);
	}
	
	.hover-glow {
		position: absolute;
		top: -10px;
		left: -10px;
		right: -10px;
		bottom: -10px;
		background: radial-gradient(circle, 
			rgba(59, 130, 246, 0.2) 0%, 
			transparent 70%);
		border-radius: 30px;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
		z-index: -1;
	}
	
	.category-container.hovered .hover-glow {
		opacity: 1;
		animation: pulseGlow 2s ease-in-out infinite;
	}
	
	.fallback-mode .category-container {
		animation: slideUpFade 0.8s cubic-bezier(0.23, 1, 0.320, 1) forwards;
	}
	
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 0.8;
			transform: translateY(0);
		}
	}
	
	@keyframes gridSlideUp {
		from {
			opacity: 0;
			transform: translateY(40px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	
	@keyframes categoryAppear {
		from {
			opacity: 0;
			transform: translateY(30px) scale(0.9) rotateX(10deg);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1) rotateX(0deg);
		}
	}
	
	@keyframes hintsSlideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	@keyframes pulseGlow {
		0%, 100% {
			opacity: 0.4;
			transform: scale(1);
		}
		50% {
			opacity: 0.8;
			transform: scale(1.05);
		}
	}
	
	@keyframes slideUpFade {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	
	@media (max-width: 768px) {
		.bookmark-grid {
			--object-size: 100px;
			--grid-gap: 16px;
		}
		
		.category-name {
			max-width: 70px;
			font-size: 0.85rem;
		}
		
		.interaction-hints {
			display: none;
		}
		
		.shape-container {
			width: 56px;
			height: 56px;
		}
		
		.category-overlay,
		.category-info {
			padding: 8px 12px;
		}
	}
	
	@media (max-width: 480px) {
		.bookmark-grid {
			--object-size: 90px;
			--grid-gap: 12px;
		}
		
		.empty-state h3 {
			font-size: 1.5rem;
		}
		
		.empty-state p {
			font-size: 1rem;
		}
		
		.empty-icon {
			font-size: 3rem;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.category-container,
		.object-3d-container,
		.fallback-shape,
		.simple-shape,
		.hover-glow {
			transition: none;
			animation: none;
		}
		
		.categories-grid {
			animation: none;
		}
		
		.shape-glow {
			animation: none;
			opacity: 0.6;
		}
		
		.category-container {
			opacity: 1;
		}
	}
	
	@media (prefers-color-scheme: dark) {
		.object-3d-container,
		.fallback-shape {
			background: linear-gradient(135deg, 
				rgba(255, 255, 255, 0.08) 0%, 
				rgba(255, 255, 255, 0.04) 50%,
				rgba(255, 255, 255, 0.02) 100%);
			border-color: rgba(255, 255, 255, 0.15);
		}
		
		.object-3d-container:hover,
		.object-3d-container:focus-visible,
		.fallback-shape:hover,
		.fallback-shape:focus-visible {
			background: linear-gradient(135deg, 
				rgba(255, 255, 255, 0.12) 0%, 
				rgba(255, 255, 255, 0.08) 50%,
				rgba(255, 255, 255, 0.05) 100%);
			border-color: rgba(255, 255, 255, 0.25);
		}
	}
</style>
