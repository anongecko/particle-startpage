<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { fade, scale, fly } from 'svelte/transition';
	import { cubicOut, elasticOut } from 'svelte/easing';
	
	import type { BookmarkCategory, BookmarkItem } from '$stores/bookmarks';
	import { bookmarkStore } from '$stores/bookmarks';
	import { settings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	
	// Props
	export let category: BookmarkCategory;
	export let visible: boolean = false;
	
	// Component state
	let modalElement: HTMLElement;
	let searchInput: HTMLInputElement;
	let bookmarksContainer: HTMLElement;
	let isClosing = false;
	let searchQuery = '';
	let showLabels = false;
	let isDragging = false;
	let draggedBookmark: BookmarkItem | null = null;
	let dropTarget: BookmarkItem | null = null;
	let hoverTimeout: NodeJS.Timeout | null = null;
	
	// Drag and drop state
	let dragStartPosition = { x: 0, y: 0 };
	let dragOffset = { x: 0, y: 0 };
	let draggedElement: HTMLElement | null = null;
	let dropZones = new Set<string>();
	
	// Search and filter state
	let filteredBookmarks: BookmarkItem[] = [];
	let searchActive = false;
	let typingTimeout: NodeJS.Timeout | null = null;
	
	// Performance state
	let loadedFavicons = new Set<string>();
	let failedFavicons = new Set<string>();
	let visibleBookmarks = new Set<string>();
	
	const dispatch = createEventDispatcher();
	
	// Reactive computations
	$: currentSettings = get(settings);
	$: colorPalette = get(colorStore);
	$: showLabels = currentSettings.showBookmarkLabels || false;
	$: filteredBookmarks = filterBookmarks(category.bookmarks, searchQuery);
	$: modalBackgroundColor = colorPalette.darkest || '#1a1a1a';
	$: modalBorderColor = colorPalette.accent || colorPalette.current || '#4a90e2';
	$: modalTextColor = getContrastColor(modalBackgroundColor);
	
	// Initialize component
	onMount(() => {
		if (!browser) return;
		
		// Setup event listeners
		setupEventListeners();
		
		// Focus search input after animation
		setTimeout(() => {
			if (searchInput && visible) {
				searchInput.focus();
			}
		}, 300);
		
		// Initialize intersection observer for performance
		setupIntersectionObserver();
		
		console.log('BookmarkModal initialized for category:', category.name);
	});
	
	onDestroy(() => {
		cleanup();
	});
	
	// Search and filtering
	function filterBookmarks(bookmarks: BookmarkItem[], query: string): BookmarkItem[] {
		if (!query.trim()) return bookmarks;
		
		const searchTerm = query.toLowerCase();
		return bookmarks.filter(bookmark => 
			bookmark.title.toLowerCase().includes(searchTerm) ||
			bookmark.url.toLowerCase().includes(searchTerm) ||
			bookmark.description?.toLowerCase().includes(searchTerm) ||
			bookmark.tags.some(tag => tag.toLowerCase().includes(searchTerm))
		);
	}
	
	// Event listeners setup
	function setupEventListeners(): void {
		if (!browser) return;
		
		// Global keydown handler for search
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!visible) return;
			
			// Close modal on Escape
			if (event.key === 'Escape') {
				closeModal();
				return;
			}
			
			// Activate search on typing (if not already focused on input)
			if (document.activeElement !== searchInput && 
				!event.ctrlKey && !event.metaKey && !event.altKey &&
				event.key.length === 1 && /[a-zA-Z0-9\s]/.test(event.key)) {
				
				activateSearch(event.key);
			}
		};
		
		// Click outside to close
		const handleClickOutside = (event: MouseEvent) => {
			if (visible && modalElement && !modalElement.contains(event.target as Node)) {
				closeModal();
			}
		};
		
		// Touch handling for mobile
		const handleTouchStart = (event: TouchEvent) => {
			if (event.touches.length > 1) {
				event.preventDefault(); // Prevent zoom
			}
		};
		
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('touchstart', handleTouchStart, { passive: false });
		
		// Cleanup function
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('touchstart', handleTouchStart);
		};
	}
	
	// Search functionality
	function activateSearch(initialChar?: string): void {
		searchActive = true;
		if (initialChar) {
			searchQuery = initialChar;
		}
		
		tick().then(() => {
			if (searchInput) {
				searchInput.focus();
				if (initialChar) {
					searchInput.setSelectionRange(1, 1);
				}
			}
		});
	}
	
	function handleSearchInput(event: Event): void {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;
		
		// Clear previous timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}
		
		// Debounce search
		typingTimeout = setTimeout(() => {
			// Trigger search analytics
			if (searchQuery.trim()) {
				try {
					bookmarkStore.recordSearch?.(searchQuery);
				} catch (error) {
					console.warn('Failed to record search:', error);
				}
			}
		}, 500);
	}
	
	function clearSearch(): void {
		searchQuery = '';
		searchActive = false;
		if (searchInput) {
			searchInput.blur();
		}
	}
	
	// Drag and drop functionality
	function handleDragStart(bookmark: BookmarkItem, event: DragEvent | TouchEvent): void {
		isDragging = true;
		draggedBookmark = bookmark;
		
		// Store initial position
		const clientX = 'clientX' in event ? event.clientX : event.touches[0].clientX;
		const clientY = 'clientY' in event ? event.clientY : event.touches[0].clientY;
		dragStartPosition = { x: clientX, y: clientY };
		
		// Find the dragged element
		draggedElement = (event.target as HTMLElement).closest('.bookmark-item');
		
		if (draggedElement) {
			const rect = draggedElement.getBoundingClientRect();
			dragOffset = {
				x: clientX - rect.left,
				y: clientY - rect.top
			};
			
			// Add dragging class
			draggedElement.classList.add('dragging');
		}
		
		// Set drag data for browser drag and drop
		if ('dataTransfer' in event && event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', bookmark.id);
		}
		
		dispatch('drag-start', { bookmark });
	}
	
	function handleDragOver(bookmark: BookmarkItem, event: DragEvent | TouchEvent): void {
		if (!isDragging || !draggedBookmark || draggedBookmark.id === bookmark.id) return;
		
		event.preventDefault();
		
		// Update drop target
		if (dropTarget?.id !== bookmark.id) {
			dropTarget = bookmark;
			
			// Clear previous hover timeout
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
			}
			
			// Set hover timeout for folder creation
			hoverTimeout = setTimeout(() => {
				if (dropTarget && draggedBookmark && dropTarget.id !== draggedBookmark.id) {
					showFolderCreationHint(dropTarget);
				}
			}, 800);
		}
	}
	
	function handleDrop(bookmark: BookmarkItem, event: DragEvent | TouchEvent): void {
		if (!isDragging || !draggedBookmark || draggedBookmark.id === bookmark.id) return;
		
		event.preventDefault();
		
		// Determine action based on hover duration and position
		const shouldCreateFolder = hoverTimeout !== null;
		
		if (shouldCreateFolder) {
			createBookmarkFolder(draggedBookmark, bookmark);
		} else {
			reorderBookmarks(draggedBookmark, bookmark);
		}
		
		endDrag();
	}
	
	function handleDragEnd(): void {
		endDrag();
	}
	
	function endDrag(): void {
		isDragging = false;
		draggedBookmark = null;
		dropTarget = null;
		
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		
		if (draggedElement) {
			draggedElement.classList.remove('dragging');
			draggedElement = null;
		}
		
		// Clear all drop zones
		dropZones.clear();
	}
	
	// Bookmark management
	function createBookmarkFolder(bookmark1: BookmarkItem, bookmark2: BookmarkItem): void {
		const folderName = prompt('Enter folder name:', `${bookmark1.title} & ${bookmark2.title}`);
		
		if (folderName) {
			try {
				bookmarkStore.createBookmarkFolder?.(category.id, [bookmark1.id, bookmark2.id], folderName);
				dispatch('folder-created', { folder: folderName, bookmarks: [bookmark1, bookmark2] });
			} catch (error) {
				console.error('Failed to create bookmark folder:', error);
			}
		}
	}
	
	function reorderBookmarks(bookmark: BookmarkItem, targetBookmark: BookmarkItem): void {
		try {
			bookmarkStore.reorderBookmarks?.(category.id, bookmark.id, targetBookmark.id);
			dispatch('bookmark-reorder', { bookmark, target: targetBookmark });
		} catch (error) {
			console.error('Failed to reorder bookmarks:', error);
		}
	}
	
	function showFolderCreationHint(bookmark: BookmarkItem): void {
		// Visual feedback for folder creation
		const element = document.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
		if (element) {
			element.classList.add('folder-drop-target');
			setTimeout(() => {
				element.classList.remove('folder-drop-target');
			}, 2000);
		}
	}
	
	// Bookmark interaction handlers
	function handleBookmarkClick(bookmark: BookmarkItem, event: MouseEvent): void {
		event.preventDefault();
		
		// Update analytics
		try {
			bookmarkStore.recordBookmarkAccess?.(bookmark.id);
		} catch (error) {
			console.warn('Failed to record bookmark access:', error);
		}
		
		// Handle modifier keys
		if (event.ctrlKey || event.metaKey || event.button === 1) {
			window.open(bookmark.url, '_blank');
		} else if (event.shiftKey) {
			window.open(bookmark.url, '_blank');
		} else {
			window.location.href = bookmark.url;
		}
		
		dispatch('bookmark-click', { bookmark, modifierKey: event.ctrlKey || event.metaKey });
		
		// Close modal after navigation
		if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
			closeModal();
		}
	}
	
	function handleBookmarkContextMenu(bookmark: BookmarkItem, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		
		dispatch('bookmark-edit', { bookmark, position: { x: event.clientX, y: event.clientY } });
	}
	
	// Modal control
	function closeModal(): void {
		if (isClosing) return;
		
		isClosing = true;
		clearSearch();
		
		// Clean up any ongoing drags
		endDrag();
		
		dispatch('close');
		
		setTimeout(() => {
			isClosing = false;
		}, 300);
	}
	
	// Favicon handling
	function getFaviconUrl(bookmark: BookmarkItem): string {
		if (bookmark.favicon) return bookmark.favicon;
		if (bookmark.customIcon) return bookmark.customIcon;
		
		try {
			const domain = new URL(bookmark.url).hostname;
			return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
		} catch {
			return '';
		}
	}
	
	function handleFaviconLoad(bookmark: BookmarkItem): void {
		loadedFavicons.add(bookmark.id);
	}
	
	function handleFaviconError(bookmark: BookmarkItem): void {
		failedFavicons.add(bookmark.id);
	}
	
	function getFallbackIcon(bookmark: BookmarkItem): string {
		try {
			const domain = new URL(bookmark.url).hostname;
			return domain.charAt(0).toUpperCase();
		} catch {
			return '🔗';
		}
	}
	
	// Performance optimization
	function setupIntersectionObserver(): void {
		if (!browser || !bookmarksContainer) return;
		
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				const bookmarkId = entry.target.getAttribute('data-bookmark-id');
				if (bookmarkId) {
					if (entry.isIntersecting) {
						visibleBookmarks.add(bookmarkId);
					} else {
						visibleBookmarks.delete(bookmarkId);
					}
				}
			});
		}, {
			threshold: 0.1,
			rootMargin: '50px'
		});
		
		// Observe bookmark elements
		setTimeout(() => {
			const bookmarkElements = bookmarksContainer?.querySelectorAll('[data-bookmark-id]');
			bookmarkElements?.forEach(el => observer.observe(el));
		}, 100);
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
			return '#ffffff';
		}
	}
	
	function cleanup(): void {
		if (typingTimeout) clearTimeout(typingTimeout);
		if (hoverTimeout) clearTimeout(hoverTimeout);
		endDrag();
	}
</script>

{#if visible}
	<div 
		class="modal-overlay"
		transition:fade={{ duration: 200 }}
		on:click|self={closeModal}
	>
		<div 
			class="bookmark-modal"
			bind:this={modalElement}
			transition:scale={{ duration: 300, easing: elasticOut, start: 0.8 }}
			style="
				--modal-bg: {modalBackgroundColor};
				--modal-border: {modalBorderColor};
				--modal-text: {modalTextColor};
				--modal-accent: {colorPalette.accent || colorPalette.current};
			"
		>
			<!-- Modal Header -->
			<div class="modal-header">
				<div class="header-content">
					<h2 class="category-title">{category.name}</h2>
					<div class="bookmark-stats">
						{filteredBookmarks.length} 
						{filteredBookmarks.length === 1 ? 'bookmark' : 'bookmarks'}
						{#if searchQuery}
							{#if filteredBookmarks.length !== category.bookmarks.length}
								of {category.bookmarks.length}
							{/if}
						{/if}
					</div>
				</div>
				
				<div class="header-controls">
					<!-- Search Bar -->
					<div class="search-container" class:active={searchActive || searchQuery}>
						<div class="search-icon">🔍</div>
						<input
							bind:this={searchInput}
							bind:value={searchQuery}
							on:input={handleSearchInput}
							on:focus={() => searchActive = true}
							on:blur={() => searchActive = !!searchQuery}
							placeholder="Search bookmarks..."
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
					
					<!-- View Controls -->
					<div class="view-controls">
						<button 
							class="toggle-labels"
							class:active={showLabels}
							on:click={() => showLabels = !showLabels}
							aria-label="Toggle bookmark labels"
							title="Toggle Labels"
						>
							📝
						</button>
					</div>
					
					<!-- Close Button -->
					<button 
						class="close-button"
						on:click={closeModal}
						aria-label="Close modal"
					>
						×
					</button>
				</div>
			</div>
			
			<!-- Modal Content -->
			<div class="modal-content">
				{#if filteredBookmarks.length === 0}
					<div class="empty-bookmarks">
						{#if searchQuery}
							<div class="empty-icon">🔍</div>
							<h3>No bookmarks found</h3>
							<p>Try adjusting your search terms</p>
							<button class="clear-search-btn" on:click={clearSearch}>
								Clear Search
							</button>
						{:else}
							<div class="empty-icon">📌</div>
							<h3>No bookmarks yet</h3>
							<p>Add some bookmarks to get started</p>
						{/if}
					</div>
				{:else}
					<div 
						class="bookmarks-grid"
						bind:this={bookmarksContainer}
						class:dragging={isDragging}
					>
						{#each filteredBookmarks as bookmark (bookmark.id)}
							<div 
								class="bookmark-item"
								class:dragging={draggedBookmark?.id === bookmark.id}
								class:drop-target={dropTarget?.id === bookmark.id}
								data-bookmark-id={bookmark.id}
								draggable="true"
								on:dragstart={(e) => handleDragStart(bookmark, e)}
								on:dragover={(e) => handleDragOver(bookmark, e)}
								on:drop={(e) => handleDrop(bookmark, e)}
								on:dragend={handleDragEnd}
								on:click={(e) => handleBookmarkClick(bookmark, e)}
								on:contextmenu={(e) => handleBookmarkContextMenu(bookmark, e)}
								transition:fly={{ 
									y: 20, 
									duration: 200, 
									delay: Math.min(filteredBookmarks.indexOf(bookmark) * 50, 500) 
								}}
							>
								<div class="bookmark-favicon">
									{#if !failedFavicons.has(bookmark.id)}
										<img
											src={getFaviconUrl(bookmark)}
											alt={bookmark.title}
											loading="lazy"
											on:load={() => handleFaviconLoad(bookmark)}
											on:error={() => handleFaviconError(bookmark)}
											class="favicon-image"
										/>
									{:else}
										<div class="favicon-fallback">
											{getFallbackIcon(bookmark)}
										</div>
									{/if}
								</div>
								
								{#if showLabels}
									<div class="bookmark-label" transition:fade={{ duration: 150 }}>
										<span class="bookmark-title">{bookmark.title}</span>
										{#if bookmark.description}
											<span class="bookmark-description">{bookmark.description}</span>
										{/if}
									</div>
								{/if}
								
								<!-- Drag Handle -->
								<div class="drag-handle" title="Drag to reorder or create folder">
									⋮⋮
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			
			<!-- Modal Footer -->
			<div class="modal-footer">
				<div class="footer-info">
					<span class="hint">💡 Drag bookmarks to reorder or create folders</span>
				</div>
				<div class="footer-actions">
					<button class="action-btn secondary" on:click={clearSearch}>
						Clear Search
					</button>
					<button class="action-btn primary" on:click={closeModal}>
						Done
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}
	
	.bookmark-modal {
		width: 90vw;
		max-width: 800px;
		height: 80vh;
		max-height: 700px;
		background: var(--modal-bg);
		border: 2px solid var(--modal-border);
		border-radius: 20px;
		backdrop-filter: blur(20px);
		box-shadow: 
			0 25px 50px rgba(0, 0, 0, 0.5),
			0 0 0 1px rgba(255, 255, 255, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
	}
	
	.bookmark-modal::before {
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
		border-radius: inherit;
	}
	
	.modal-header {
		padding: 24px 24px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		position: relative;
		z-index: 1;
	}
	
	.header-content {
		flex: 1;
		min-width: 0;
	}
	
	.category-title {
		margin: 0 0 4px;
		font-size: 22px;
		font-weight: 700;
		color: var(--modal-text);
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.bookmark-stats {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}
	
	.header-controls {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	
	.search-container {
		position: relative;
		display: flex;
		align-items: center;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 8px 12px;
		transition: all 0.3s ease;
		min-width: 200px;
	}
	
	.search-container.active {
		background: rgba(255, 255, 255, 0.15);
		border-color: var(--modal-accent);
		box-shadow: 0 0 0 2px rgba(var(--modal-accent), 0.3);
	}
	
	.search-icon {
		font-size: 14px;
		margin-right: 8px;
		opacity: 0.7;
	}
	
	.search-input {
		background: none;
		border: none;
		outline: none;
		color: var(--modal-text);
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
		font-size: 18px;
		cursor: pointer;
		padding: 0;
		margin-left: 8px;
		transition: color 0.2s ease;
	}
	
	.clear-search:hover {
		color: rgba(255, 255, 255, 0.9);
	}
	
	.view-controls {
		display: flex;
		gap: 8px;
	}
	
	.toggle-labels {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 8px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.3s ease;
		font-size: 14px;
	}
	
	.toggle-labels.active {
		background: var(--modal-accent);
		border-color: var(--modal-accent);
		color: white;
		transform: scale(1.05);
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
		font-size: 20px;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.close-button:hover {
		background: rgba(255, 0, 0, 0.2);
		border-color: rgba(255, 0, 0, 0.4);
		color: #ff6b6b;
		transform: scale(1.1);
	}
	
	.modal-content {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
		position: relative;
		z-index: 1;
	}
	
	.modal-content::-webkit-scrollbar {
		width: 8px;
	}
	
	.modal-content::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
	}
	
	.modal-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.3);
		border-radius: 4px;
	}
	
	.modal-content::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.5);
	}
	
	.empty-bookmarks {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 300px;
		text-align: center;
		color: rgba(255, 255, 255, 0.7);
	}
	
	.empty-icon {
		font-size: 48px;
		margin-bottom: 16px;
		opacity: 0.6;
	}
	
	.empty-bookmarks h3 {
		margin: 0 0 8px;
		font-size: 18px;
		color: var(--modal-text);
	}
	
	.empty-bookmarks p {
		margin: 0 0 16px;
		font-size: 14px;
		opacity: 0.8;
	}
	
	.clear-search-btn {
		background: var(--modal-accent);
		border: none;
		border-radius: 8px;
		padding: 8px 16px;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.clear-search-btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	
	.bookmarks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
		gap: 16px;
		padding: 8px;
	}
	
	.bookmarks-grid.dragging {
		pointer-events: none;
	}
	
	.bookmarks-grid.dragging .bookmark-item:not(.dragging) {
		pointer-events: auto;
	}
	
	.bookmark-item {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.3s ease;
		backdrop-filter: blur(10px);
		user-select: none;
	}
	
	.bookmark-item:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: var(--modal-accent);
		transform: translateY(-2px) scale(1.02);
		box-shadow: 
			0 8px 25px rgba(0, 0, 0, 0.3),
			0 0 0 1px var(--modal-accent);
	}
	
	.bookmark-item.dragging {
		opacity: 0.7;
		transform: rotate(5deg) scale(1.05);
		z-index: 1000;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
	}
	
	.bookmark-item.drop-target {
		background: rgba(var(--modal-accent), 0.2);
		border-color: var(--modal-accent);
		animation: pulse 1s infinite;
	}
	
	.bookmark-item.folder-drop-target {
		background: rgba(255, 193, 7, 0.2);
		border-color: #ffc107;
		animation: folderPulse 0.5s ease-in-out;
	}
	
	.bookmark-favicon {
		width: 48px;
		height: 48px;
		border-radius: 8px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
		margin-bottom: 8px;
		transition: transform 0.3s ease;
	}
	
	.bookmark-item:hover .bookmark-favicon {
		transform: scale(1.1);
	}
	
	.favicon-image {
		width: 32px;
		height: 32px;
		object-fit: contain;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}
	
	.favicon-fallback {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--modal-accent), #667eea);
		color: white;
		font-weight: bold;
		font-size: 16px;
		border-radius: 4px;
	}
	
	.bookmark-label {
		text-align: center;
		width: 100%;
	}
	
	.bookmark-title {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: var(--modal-text);
		line-height: 1.2;
		margin-bottom: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}
	
	.bookmark-description {
		display: block;
		font-size: 9px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.drag-handle {
		position: absolute;
		top: 4px;
		right: 4px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.4);
		opacity: 0;
		transition: opacity 0.3s ease;
		cursor: grab;
		transform: rotate(90deg);
	}
	
	.bookmark-item:hover .drag-handle {
		opacity: 1;
	}
	
	.drag-handle:active {
		cursor: grabbing;
	}
	
	.modal-footer {
		padding: 16px 24px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: relative;
		z-index: 1;
	}
	
	.footer-info {
		flex: 1;
	}
	
	.hint {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
	}
	
	.footer-actions {
		display: flex;
		gap: 12px;
	}
	
	.action-btn {
		padding: 8px 16px;
		border: none;
		border-radius: 8px;
		font-size: 13px;
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
	}
	
	.action-btn.primary {
		background: var(--modal-accent);
		color: white;
	}
	
	.action-btn.primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		filter: brightness(1.1);
	}
	
	@keyframes pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.05); }
	}
	
	@keyframes folderPulse {
		0% { transform: scale(1); }
		50% { transform: scale(1.1); }
		100% { transform: scale(1); }
	}
	
	/* Responsive Design */
	@media (max-width: 768px) {
		.bookmark-modal {
			width: 95vw;
			height: 85vh;
			border-radius: 16px;
		}
		
		.modal-header {
			padding: 20px 20px 12px;
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
		
		.header-controls {
			justify-content: space-between;
		}
		
		.search-container {
			min-width: 150px;
			flex: 1;
		}
		
		.bookmarks-grid {
			grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
			gap: 12px;
		}
		
		.bookmark-item {
			padding: 8px;
		}
		
		.bookmark-favicon {
			width: 40px;
			height: 40px;
		}
		
		.favicon-image {
			width: 24px;
			height: 24px;
		}
		
		.favicon-fallback {
			width: 24px;
			height: 24px;
			font-size: 12px;
		}
		
		.modal-footer {
			flex-direction: column;
			gap: 12px;
			text-align: center;
		}
		
		.footer-actions {
			justify-content: center;
			width: 100%;
		}
	}
	
	@media (max-width: 480px) {
		.category-title {
			font-size: 18px;
		}
		
		.bookmarks-grid {
			grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
			gap: 8px;
		}
		
		.bookmark-favicon {
			width: 36px;
			height: 36px;
		}
		
		.favicon-image, .favicon-fallback {
			width: 20px;
			height: 20px;
		}
		
		.bookmark-title {
			font-size: 10px;
		}
		
		.bookmark-description {
			font-size: 8px;
		}
	}
</style>
