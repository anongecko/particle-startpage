<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { fly, fade, scale } from 'svelte/transition';
	import { cubicOut, elasticOut } from 'svelte/easing';
	
	import Object3D from './Object3D.svelte';
	import type { BookmarkCategory } from '$stores/bookmarks';
	import { bookmarkStore } from '$stores/bookmarks';
	import { settings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { Object3DRegistry, type Object3DConfig, type Object3DCategory } from '$lib/objects3d';
	
	// Props
	export let category: BookmarkCategory;
	export let visible: boolean = false;
	
	// Component state
	let sidebarElement: HTMLElement;
	let searchInput: HTMLInputElement;
	let objectsContainer: HTMLElement;
	let isMinimized = false;
	let isClosing = false;
	let searchQuery = '';
	let selectedObject: Object3DConfig | null = null;
	let hoveredObject: Object3DConfig | null = null;
	let previewObject: Object3DConfig | null = null;
	
	// Data state
	let allCategories: Object3DCategory[] = [];
	let allObjects: Object3DConfig[] = [];
	let filteredObjects: Object3DConfig[] = [];
	let recentObjects: Object3DConfig[] = [];
	let favoriteObjects: Object3DConfig[] = [];
	let categorizedObjects: Record<string, Object3DConfig[]> = {};
	
	// UI state
	let sidebarWidth = 400;
	let gridColumns = 3;
	let visibleObjects = new Set<string>();
	let loadedPreviews = new Set<string>();
	let intersectionObserver: IntersectionObserver | null = null;
	
	// Performance state
	let animationFrame = 0;
	let searchTimeout: NodeJS.Timeout | null = null;
	let renderTimeout: NodeJS.Timeout | null = null;
	
	// Constants
	const SIDEBAR_WIDTH_DESKTOP = 420;
	const SIDEBAR_WIDTH_MOBILE = 320;
	const RECENT_LIMIT = 6;
	const FAVORITES_LIMIT = 8;
	const PREVIEW_SIZE = 80;
	const ANIMATION_DURATION = 300;
	
	const dispatch = createEventDispatcher();
	
	// Reactive computations
	$: currentSettings = get(settings);
	$: colorPalette = get(colorStore);
	$: modalBackgroundColor = colorPalette.darkest || '#1a1a1a';
	$: sidebarBackgroundColor = modalBackgroundColor;
	$: sidebarBorderColor = colorPalette.accent || colorPalette.current || '#4a90e2';
	$: categoryColor = colorPalette.current || '#4a90e2';
	$: sidebarWidth = browser && window.innerWidth < 768 ? SIDEBAR_WIDTH_MOBILE : SIDEBAR_WIDTH_DESKTOP;
	$: gridColumns = isMinimized ? 2 : (sidebarWidth > 380 ? 3 : 2);
	
	// Initialize component
	onMount(async () => {
		if (!browser) return;
		
		try {
			// Initialize Object3D registry
			await Object3DRegistry.initialize();
			
			// Load all data
			await loadObjectData();
			await loadUserData();
			
			// Setup UI
			setupIntersectionObserver();
			setupEventListeners();
			updateFilteredObjects();
			
			// Focus search after animation
			setTimeout(() => {
				if (searchInput && visible) {
					searchInput.focus();
				}
			}, ANIMATION_DURATION);
			
			console.log('ObjectSelector initialized with', allObjects.length, 'objects');
			
		} catch (error) {
			console.error('ObjectSelector initialization failed:', error);
		}
	});
	
	onDestroy(() => {
		cleanup();
	});
	
	// Data loading
	async function loadObjectData(): Promise<void> {
		try {
			// Get all categories and objects from registry
			allCategories = Object3DRegistry.getAllCategories();
			allObjects = Object3DRegistry.getAllObjects();
			
			// Organize objects by category
			categorizedObjects = {};
			allCategories.forEach(cat => {
				categorizedObjects[cat.id] = allObjects.filter(obj => obj.category === cat.id);
			});
			
			console.log('Loaded', allObjects.length, 'objects in', allCategories.length, 'categories');
			
		} catch (error) {
			console.error('Failed to load object data:', error);
			allCategories = [];
			allObjects = [];
		}
	}
	
	async function loadUserData(): Promise<void> {
		try {
			// Load recent objects
			const recentIds = await bookmarkStore.getRecentObjects?.(RECENT_LIMIT) || [];
			recentObjects = recentIds
				.map(item => Object3DRegistry.getObject(item.id))
				.filter(obj => obj !== null) as Object3DConfig[];
			
			// Load favorite objects
			const favoriteIds = await bookmarkStore.getFavoriteObjects?.(FAVORITES_LIMIT) || [];
			favoriteObjects = favoriteIds
				.map(id => Object3DRegistry.getObject(id))
				.filter(obj => obj !== null) as Object3DConfig[];
			
		} catch (error) {
			console.warn('Failed to load user data:', error);
			recentObjects = [];
			favoriteObjects = [];
		}
	}
	
	// Search and filtering
	function updateFilteredObjects(): void {
		if (!searchQuery.trim()) {
			filteredObjects = allObjects;
			return;
		}
		
		const query = searchQuery.toLowerCase();
		filteredObjects = allObjects.filter(obj => 
			obj.name.toLowerCase().includes(query) ||
			obj.description?.toLowerCase().includes(query) ||
			obj.category.toLowerCase().includes(query) ||
			obj.tags?.some(tag => tag.toLowerCase().includes(query))
		);
	}
	
	function handleSearchInput(event: Event): void {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;
		
		// Clear previous timeout
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		
		// Debounce search
		searchTimeout = setTimeout(() => {
			updateFilteredObjects();
		}, 200);
	}
	
	function clearSearch(): void {
		searchQuery = '';
		updateFilteredObjects();
		if (searchInput) {
			searchInput.focus();
		}
	}
	
	// Object interaction
	function handleObjectClick(object: Object3DConfig): void {
		selectedObject = object;
		previewObject = object;
		
		// Record usage
		try {
			bookmarkStore.recordObjectUsage?.(object.id);
		} catch (error) {
			console.warn('Failed to record object usage:', error);
		}
	}
	
	function handleObjectHover(object: Object3DConfig | null): void {
		hoveredObject = object;
	}
	
	async function toggleFavorite(object: Object3DConfig, event: MouseEvent): Promise<void> {
		event.stopPropagation();
		
		try {
			const isFavorite = favoriteObjects.some(fav => fav.id === object.id);
			
			if (isFavorite) {
				await bookmarkStore.removeFavoriteObject?.(object.id);
				favoriteObjects = favoriteObjects.filter(fav => fav.id !== object.id);
			} else {
				await bookmarkStore.addFavoriteObject?.(object.id);
				favoriteObjects = [...favoriteObjects, object];
			}
			
			// Haptic feedback
			if (navigator.vibrate) {
				navigator.vibrate(30);
			}
			
		} catch (error) {
			console.error('Failed to toggle favorite:', error);
		}
	}
	
	function isFavorite(object: Object3DConfig): boolean {
		return favoriteObjects.some(fav => fav.id === object.id);
	}
	
	// Sidebar control
	function toggleMinimize(): void {
		isMinimized = !isMinimized;
		
		// Update grid layout after animation
		setTimeout(() => {
			if (intersectionObserver) {
				updateVisibleObjects();
			}
		}, ANIMATION_DURATION);
	}
	
	function closeSidebar(): void {
		if (isClosing) return;
		
		isClosing = true;
		selectedObject = null;
		previewObject = null;
		clearSearch();
		
		dispatch('close');
		
		setTimeout(() => {
			isClosing = false;
		}, ANIMATION_DURATION);
	}
	
	function confirmSelection(): void {
		if (!selectedObject) return;
		
		dispatch('select', {
			category,
			objectId: selectedObject.id
		});
		
		closeSidebar();
	}
	
	// Performance optimization
	function setupIntersectionObserver(): void {
		if (!browser) return;
		
		intersectionObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				const objectId = entry.target.getAttribute('data-object-id');
				if (objectId) {
					if (entry.isIntersecting) {
						visibleObjects.add(objectId);
						loadedPreviews.add(objectId);
					} else {
						visibleObjects.delete(objectId);
					}
				}
			});
		}, {
			threshold: 0.1,
			rootMargin: '50px'
		});
		
		// Start observing after initial render
		setTimeout(updateVisibleObjects, 100);
	}
	
	function updateVisibleObjects(): void {
		if (!intersectionObserver || !objectsContainer) return;
		
		const objectElements = objectsContainer.querySelectorAll('[data-object-id]');
		objectElements.forEach(el => {
			intersectionObserver!.observe(el);
		});
	}
	
	// Event listeners
	function setupEventListeners(): void {
		if (!browser) return;
		
		// Keyboard navigation
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!visible) return;
			
			switch (event.key) {
				case 'Escape':
					event.preventDefault();
					if (selectedObject) {
						selectedObject = null;
						previewObject = null;
					} else {
						closeSidebar();
					}
					break;
					
				case 'Enter':
					event.preventDefault();
					if (selectedObject) {
						confirmSelection();
					}
					break;
					
				case '/':
					event.preventDefault();
					if (searchInput) {
						searchInput.focus();
					}
					break;
			}
		};
		
		// Click outside to close
		const handleClickOutside = (event: MouseEvent) => {
			if (visible && sidebarElement && !sidebarElement.contains(event.target as Node)) {
				closeSidebar();
			}
		};
		
		// Resize handler
		const handleResize = () => {
			if (renderTimeout) clearTimeout(renderTimeout);
			
			renderTimeout = setTimeout(() => {
				// Update layout on resize
				if (visible) {
					updateVisibleObjects();
				}
			}, 100);
		};
		
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', handleClickOutside);
		window.addEventListener('resize', handleResize);
		
		// Cleanup
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
			window.removeEventListener('resize', handleResize);
		};
	}
	
	// Utility functions
	function getCategoryDisplayName(categoryId: string): string {
		const category = allCategories.find(cat => cat.id === categoryId);
		return category?.name || categoryId;
	}
	
	function getObjectsForCategory(categoryId: string): Object3DConfig[] {
		if (!searchQuery.trim()) {
			return categorizedObjects[categoryId] || [];
		}
		
		return filteredObjects.filter(obj => obj.category === categoryId);
	}
	
	function shouldRenderPreview(object: Object3DConfig): boolean {
		return visibleObjects.has(object.id) || loadedPreviews.has(object.id);
	}
	
	function cleanup(): void {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		if (renderTimeout) {
			clearTimeout(renderTimeout);
		}
		if (intersectionObserver) {
			intersectionObserver.disconnect();
		}
		
		visibleObjects.clear();
		loadedPreviews.clear();
	}
</script>

{#if visible}
	<!-- Overlay -->
	<div 
		class="selector-overlay"
		transition:fade={{ duration: 200 }}
		on:click={closeSidebar}
	></div>
	
	<!-- Sidebar -->
	<div 
		class="object-selector"
		class:minimized={isMinimized}
		bind:this={sidebarElement}
		style="
			--sidebar-width: {sidebarWidth}px;
			--sidebar-bg: {sidebarBackgroundColor};
			--sidebar-border: {sidebarBorderColor};
			--category-color: {categoryColor};
			--grid-columns: {gridColumns};
		"
		transition:fly={{ 
			x: sidebarWidth, 
			duration: ANIMATION_DURATION, 
			easing: cubicOut 
		}}
		on:click|stopPropagation
	>
		<!-- Header -->
		<div class="selector-header">
			<div class="header-content">
				<button 
					class="minimize-button"
					class:minimized={isMinimized}
					on:click={toggleMinimize}
					title={isMinimized ? 'Expand' : 'Minimize'}
					aria-label={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
				>
					<div class="minimize-arrow">
						{isMinimized ? '→' : '←'}
					</div>
				</button>
				
				{#if !isMinimized}
					<div class="header-title">
						<h2>Choose Object</h2>
						<p>for "{category.name}"</p>
					</div>
				{/if}
				
				<button 
					class="close-button"
					on:click={closeSidebar}
					aria-label="Close object selector"
				>
					×
				</button>
			</div>
			
			{#if !isMinimized}
				<!-- Search Bar -->
				<div class="search-container">
					<div class="search-icon">🔍</div>
					<input
						bind:this={searchInput}
						bind:value={searchQuery}
						on:input={handleSearchInput}
						placeholder="Search objects..."
						class="search-input"
						type="text"
					/>
					{#if searchQuery}
						<button 
							class="clear-search"
							on:click={clearSearch}
							aria-label="Clear search"
						>
							×
						</button>
					{/if}
				</div>
			{/if}
		</div>
		
		<!-- Content -->
		<div class="selector-content">
			<div 
				class="objects-container"
				bind:this={objectsContainer}
			>
				{#if !isMinimized}
					<!-- Favorites Section -->
					{#if favoriteObjects.length > 0}
						<div class="objects-section favorites-section">
							<div class="section-header">
								<h3>⭐ Favorites</h3>
								<span class="section-count">{favoriteObjects.length}</span>
							</div>
							
							<div class="objects-grid favorites-grid">
								{#each favoriteObjects as object (object.id)}
									<div 
										class="object-item favorite-item"
										class:selected={selectedObject?.id === object.id}
										class:hovered={hoveredObject?.id === object.id}
										data-object-id={object.id}
										on:click={() => handleObjectClick(object)}
										on:mouseenter={() => handleObjectHover(object)}
										on:mouseleave={() => handleObjectHover(null)}
									>
										<div class="object-preview">
											{#if shouldRenderPreview(object)}
												<Object3D
													objectId={object.id}
													size={PREVIEW_SIZE}
													scale={0.8}
													enableAnimation={hoveredObject?.id === object.id}
													animationSpeed={0.3}
													staticPreview={hoveredObject?.id !== object.id}
													dominantColor={categoryColor}
													fallbackTo2D={true}
												/>
											{:else}
												<div class="preview-placeholder">
													{object.name.charAt(0)}
												</div>
											{/if}
										</div>
										
										<button 
											class="favorite-button active"
											on:click={(e) => toggleFavorite(object, e)}
											title="Remove from favorites"
										>
											⭐
										</button>
										
										{#if hoveredObject?.id === object.id}
											<div class="object-tooltip" transition:fade={{ duration: 150 }}>
												{object.name}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
					
					<!-- Recent Section -->
					{#if recentObjects.length > 0}
						<div class="objects-section recent-section">
							<div class="section-header">
								<h3>🕒 Recently Used</h3>
								<span class="section-count">{recentObjects.length}</span>
							</div>
							
							<div class="objects-grid recent-grid">
								{#each recentObjects as object (object.id)}
									<div 
										class="object-item recent-item"
										class:selected={selectedObject?.id === object.id}
										class:hovered={hoveredObject?.id === object.id}
										data-object-id={object.id}
										on:click={() => handleObjectClick(object)}
										on:mouseenter={() => handleObjectHover(object)}
										on:mouseleave={() => handleObjectHover(null)}
									>
										<div class="object-preview">
											{#if shouldRenderPreview(object)}
												<Object3D
													objectId={object.id}
													size={PREVIEW_SIZE}
													scale={0.8}
													enableAnimation={hoveredObject?.id === object.id}
													animationSpeed={0.3}
													staticPreview={hoveredObject?.id !== object.id}
													dominantColor={categoryColor}
													fallbackTo2D={true}
												/>
											{:else}
												<div class="preview-placeholder">
													{object.name.charAt(0)}
												</div>
											{/if}
										</div>
										
										<button 
											class="favorite-button"
											class:active={isFavorite(object)}
											on:click={(e) => toggleFavorite(object, e)}
											title={isFavorite(object) ? 'Remove from favorites' : 'Add to favorites'}
										>
											{isFavorite(object) ? '⭐' : '☆'}
										</button>
										
										{#if hoveredObject?.id === object.id}
											<div class="object-tooltip" transition:fade={{ duration: 150 }}>
												{object.name}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
				
				<!-- Categories -->
				{#each allCategories as objectCategory (objectCategory.id)}
					{@const categoryObjects = getObjectsForCategory(objectCategory.id)}
					{#if categoryObjects.length > 0}
						<div class="objects-section category-section">
							<div class="section-header">
								<h3>
									<span class="category-icon">{objectCategory.icon}</span>
									{objectCategory.name}
								</h3>
								<span class="section-count">{categoryObjects.length}</span>
							</div>
							
							<div class="objects-grid category-grid">
								{#each categoryObjects as object (object.id)}
									<div 
										class="object-item category-item"
										class:selected={selectedObject?.id === object.id}
										class:hovered={hoveredObject?.id === object.id}
										data-object-id={object.id}
										on:click={() => handleObjectClick(object)}
										on:mouseenter={() => handleObjectHover(object)}
										on:mouseleave={() => handleObjectHover(null)}
									>
										<div class="object-preview">
											{#if shouldRenderPreview(object)}
												<Object3D
													objectId={object.id}
													size={PREVIEW_SIZE}
													scale={0.8}
													enableAnimation={hoveredObject?.id === object.id}
													animationSpeed={0.3}
													staticPreview={hoveredObject?.id !== object.id}
													dominantColor={categoryColor}
													fallbackTo2D={true}
												/>
											{:else}
												<div class="preview-placeholder">
													{object.name.charAt(0)}
												</div>
											{/if}
										</div>
										
										{#if !isMinimized}
											<button 
												class="favorite-button"
												class:active={isFavorite(object)}
												on:click={(e) => toggleFavorite(object, e)}
												title={isFavorite(object) ? 'Remove from favorites' : 'Add to favorites'}
											>
												{isFavorite(object) ? '⭐' : '☆'}
											</button>
										{/if}
										
										{#if hoveredObject?.id === object.id}
											<div class="object-tooltip" transition:fade={{ duration: 150 }}>
												{object.name}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
		
		<!-- Preview & Actions -->
		{#if !isMinimized}
			<div class="selector-footer">
				{#if selectedObject}
					<div class="preview-section" transition:scale={{ duration: 200, easing: elasticOut }}>
						<div class="preview-container">
							<div class="preview-object">
								<Object3D
									objectId={selectedObject.id}
									size={120}
									scale={1.2}
									enableAnimation={true}
									animationSpeed={0.5}
									dominantColor={categoryColor}
									fallbackTo2D={true}
								/>
							</div>
							
							<div class="preview-info">
								<h4>{selectedObject.name}</h4>
								<p>{selectedObject.description || getCategoryDisplayName(selectedObject.category)}</p>
							</div>
						</div>
					</div>
				{/if}
				
				<div class="action-buttons">
					<button 
						class="action-btn secondary"
						on:click={closeSidebar}
					>
						Cancel
					</button>
					
					<button 
						class="action-btn primary"
						disabled={!selectedObject}
						on:click={confirmSelection}
					>
						Confirm
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.selector-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px);
		z-index: 1999;
	}
	
	.object-selector {
		position: fixed;
		top: 0;
		right: 0;
		width: var(--sidebar-width);
		height: 100vh;
		background: var(--sidebar-bg);
		border-left: 2px solid var(--sidebar-border);
		backdrop-filter: blur(20px);
		box-shadow: 
			-25px 0 50px rgba(0, 0, 0, 0.5),
			inset 1px 0 0 rgba(255, 255, 255, 0.1);
		display: flex;
		flex-direction: column;
		z-index: 2000;
		overflow: hidden;
		transition: width 0.3s ease;
	}
	
	.object-selector.minimized {
		width: 80px;
	}
	
	.object-selector::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.1) 0%,
			transparent 50%,
			rgba(0, 0, 0, 0.1) 100%
		);
		pointer-events: none;
	}
	
	.selector-header {
		padding: 24px 20px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		position: relative;
		z-index: 1;
		flex-shrink: 0;
	}
	
	.header-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}
	
	.minimize-button {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.3s ease;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.minimize-button:hover {
		background: rgba(255, 255, 255, 0.2);
		border-color: var(--sidebar-border);
		color: white;
		transform: scale(1.05);
	}
	
	.minimize-arrow {
		font-size: 14px;
		font-weight: bold;
		transition: transform 0.3s ease;
	}
	
	.minimize-button.minimized .minimize-arrow {
		transform: scaleX(-1);
	}
	
	.header-title {
		flex: 1;
		text-align: center;
		margin: 0 16px;
	}
	
	.header-title h2 {
		margin: 0 0 2px;
		font-size: 18px;
		font-weight: 700;
		color: white;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
	
	.header-title p {
		margin: 0;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}
	
	.close-button {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.8);
		font-size: 18px;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.close-button:hover {
		background: rgba(255, 0, 0, 0.2);
		border-color: rgba(255, 0, 0, 0.4);
		color: #ff6b6b;
		transform: scale(1.1);
	}
	
	.search-container {
		position: relative;
		display: flex;
		align-items: center;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 10px 12px;
		transition: all 0.3s ease;
	}
	
	.search-container:focus-within {
		background: rgba(255, 255, 255, 0.15);
		border-color: var(--sidebar-border);
		box-shadow: 0 0 0 2px rgba(var(--sidebar-border), 0.3);
	}
	
	.search-icon {
		font-size: 14px;
		margin-right: 10px;
		opacity: 0.7;
	}
	
	.search-input {
		background: none;
		border: none;
		outline: none;
		color: white;
		font-size: 14px;
		font-weight: 500;
		flex: 1;
		min-width: 0;
	}
	
	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}
	
	.clear-search {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		font-size: 16px;
		cursor: pointer;
		padding: 0;
		margin-left: 8px;
		transition: color 0.2s ease;
	}
	
	.clear-search:hover {
		color: rgba(255, 255, 255, 0.9);
	}
	
	.selector-content {
		flex: 1;
		overflow-y: auto;
		position: relative;
		z-index: 1;
	}
	
	.selector-content::-webkit-scrollbar {
		width: 6px;
	}
	
	.selector-content::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.1);
	}
	
	.selector-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.3);
		border-radius: 3px;
	}
	
	.objects-container {
		padding: 16px;
	}
	
	.objects-section {
		margin-bottom: 24px;
	}
	
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		padding: 0 4px;
	}
	
	.section-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: white;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	
	.category-icon {
		font-size: 16px;
	}
	
	.section-count {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.1);
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: 600;
	}
	
	.objects-grid {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		gap: 12px;
	}
	
	.object-selector.minimized .objects-grid {
		grid-template-columns: repeat(1, 1fr);
		gap: 8px;
	}
	
	.object-item {
		position: relative;
		aspect-ratio: 1;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.3s ease;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.object-item:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: var(--category-color);
		transform: translateY(-2px) scale(1.02);
		box-shadow: 
			0 8px 25px rgba(0, 0, 0, 0.3),
			0 0 0 1px var(--category-color);
	}
	
	.object-item.selected {
		background: rgba(var(--category-color), 0.2);
		border-color: var(--category-color);
		box-shadow: 
			0 8px 25px rgba(0, 0, 0, 0.4),
			0 0 0 2px var(--category-color);
	}
	
	.object-preview {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}
	
	.preview-placeholder {
		width: 60px;
		height: 60px;
		background: linear-gradient(135deg, var(--category-color), #667eea);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 24px;
		font-weight: bold;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
	
	.favorite-button {
		position: absolute;
		top: 4px;
		right: 4px;
		background: rgba(0, 0, 0, 0.6);
		border: none;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 12px;
		transition: all 0.3s ease;
		opacity: 0;
		transform: scale(0.8);
	}
	
	.object-item:hover .favorite-button,
	.favorite-button.active {
		opacity: 1;
		transform: scale(1);
	}
	
	.favorite-button:hover {
		background: rgba(0, 0, 0, 0.8);
		transform: scale(1.1);
	}
	
	.favorite-button.active {
		color: #ffd700;
		background: rgba(255, 215, 0, 0.2);
	}
	
	.object-tooltip {
		position: absolute;
		bottom: -32px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.9);
		color: white;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
		z-index: 10;
		pointer-events: none;
	}
	
	.selector-footer {
		padding: 20px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		position: relative;
		z-index: 1;
		flex-shrink: 0;
	}
	
	.preview-section {
		margin-bottom: 16px;
		padding: 16px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.preview-container {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	
	.preview-object {
		flex-shrink: 0;
		width: 80px;
		height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}
	
	.preview-info {
		flex: 1;
		min-width: 0;
	}
	
	.preview-info h4 {
		margin: 0 0 4px;
		font-size: 16px;
		font-weight: 700;
		color: white;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
	
	.preview-info p {
		margin: 0;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.3;
	}
	
	.action-buttons {
		display: flex;
		gap: 12px;
	}
	
	.action-btn {
		flex: 1;
		padding: 12px 16px;
		border: none;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.action-btn.secondary {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	.action-btn.secondary:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
		transform: translateY(-1px);
	}
	
	.action-btn.primary {
		background: var(--category-color);
		color: white;
	}
	
	.action-btn.primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
		filter: brightness(1.1);
	}
	
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none !important;
	}
	
	/* Mobile optimizations */
	@media (max-width: 768px) {
		.object-selector {
			width: 100vw !important;
			border-left: none;
		}
		
		.object-selector.minimized {
			width: 100px !important;
		}
		
		.objects-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 10px;
		}
		
		.object-selector.minimized .objects-grid {
			grid-template-columns: repeat(1, 1fr);
		}
		
		.selector-header {
			padding: 20px 16px 12px;
		}
		
		.objects-container {
			padding: 12px;
		}
		
		.selector-footer {
			padding: 16px;
		}
	}
	
	@media (max-width: 480px) {
		.header-title h2 {
			font-size: 16px;
		}
		
		.objects-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}
		
		.object-tooltip {
			font-size: 10px;
			bottom: -28px;
		}
	}
	
	/* Performance optimizations */
	@media (prefers-reduced-motion: reduce) {
		.object-selector,
		.object-item,
		.action-btn {
			transition: none;
		}
		
		.object-item:hover,
		.action-btn:hover {
			transform: none;
		}
	}
</style>
