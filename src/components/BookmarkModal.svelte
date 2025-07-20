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
	
	export let category: BookmarkCategory;
	export let visible: boolean = false;
	
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
	let focusedElementBeforeModal: HTMLElement | null = null;
	
	let dragStartPosition = { x: 0, y: 0 };
	let dragOffset = { x: 0, y: 0 };
	let draggedElement: HTMLElement | null = null;
	let dropZones = new Set<string>();
	
	let filteredBookmarks: BookmarkItem[] = [];
	let searchActive = false;
	let typingTimeout: NodeJS.Timeout | null = null;
	
	let loadedFavicons = new Set<string>();
	let failedFavicons = new Set<string>();
	let visibleBookmarks = new Set<string>();
	let intersectionObserver: IntersectionObserver | null = null;
	
	const dispatch = createEventDispatcher();
	
	$: currentSettings = get(settings);
	$: colorPalette = get(colorStore);
	$: showLabels = currentSettings.showBookmarkLabels || false;
	$: filteredBookmarks = filterBookmarks(category.bookmarks, searchQuery);
	$: modalBackgroundColor = colorPalette.darkest || '#1a1a1a';
	$: modalBorderColor = colorPalette.accent || colorPalette.current || '#4a90e2';
	$: modalTextColor = getContrastColor(modalBackgroundColor);
	
	onMount(() => {
		if (!browser) return;
		
		focusedElementBeforeModal = document.activeElement as HTMLElement;
		setupEventListeners();
		setupIntersectionObserver();
		
		setTimeout(() => {
			if (searchInput && visible) {
				searchInput.focus();
			}
		}, 300);
		
		console.log('BookmarkModal initialized for category:', category.name);
	});
	
	onDestroy(() => {
		cleanup();
		if (focusedElementBeforeModal) {
			focusedElementBeforeModal.focus();
		}
	});
	
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
	
	function setupEventListeners(): void {
		document.addEventListener('keydown', handleGlobalKeyDown);
	}
	
	function handleGlobalKeyDown(event: KeyboardEvent): void {
		if (!visible) return;
		
		if (event.key === 'Escape') {
			event.preventDefault();
			closeModal();
		} else if (event.key === 'Enter' && event.target === searchInput) {
			event.preventDefault();
			if (filteredBookmarks.length > 0) {
				handleBookmarkActivate(filteredBookmarks[0], event);
			}
		}
	}
	
	function handleSearchInput(event: InputEvent): void {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;
		
		if (typingTimeout) clearTimeout(typingTimeout);
		
		typingTimeout = setTimeout(() => {
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
			searchInput.focus();
		}
	}
	
	function handleDragStart(bookmark: BookmarkItem, event: DragEvent): void {
		isDragging = true;
		draggedBookmark = bookmark;
		
		dragStartPosition = { x: event.clientX, y: event.clientY };
		draggedElement = (event.target as HTMLElement).closest('.bookmark-item');
		
		if (draggedElement) {
			const rect = draggedElement.getBoundingClientRect();
			dragOffset = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top
			};
			
			draggedElement.classList.add('dragging');
			draggedElement.setAttribute('aria-grabbed', 'true');
		}
		
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', bookmark.id);
			event.dataTransfer.setData('application/x-bookmark', JSON.stringify(bookmark));
		}
		
		dispatch('drag-start', { bookmark });
	}
	
	function handleDragOver(bookmark: BookmarkItem, event: DragEvent): void {
		if (!isDragging || !draggedBookmark || draggedBookmark.id === bookmark.id) return;
		
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		
		if (dropTarget?.id !== bookmark.id) {
			dropTarget = bookmark;
			
			if (hoverTimeout) clearTimeout(hoverTimeout);
			
			hoverTimeout = setTimeout(() => {
				if (dropTarget && draggedBookmark && dropTarget.id !== draggedBookmark.id) {
					showFolderCreationHint(dropTarget);
				}
			}, 800);
		}
	}
	
	function handleDrop(bookmark: BookmarkItem, event: DragEvent): void {
		if (!isDragging || !draggedBookmark || draggedBookmark.id === bookmark.id) return;
		
		event.preventDefault();
		
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
			draggedElement.setAttribute('aria-grabbed', 'false');
			draggedElement = null;
		}
		
		dropZones.clear();
		
		// Remove folder hint classes
		document.querySelectorAll('.folder-drop-target').forEach(el => {
			el.classList.remove('folder-drop-target');
		});
	}
	
	function createBookmarkFolder(bookmark1: BookmarkItem, bookmark2: BookmarkItem): void {
		const folderName = prompt('Enter folder name:', `${bookmark1.title} & ${bookmark2.title}`);
		
		if (folderName?.trim()) {
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
		const element = document.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
		if (element) {
			element.classList.add('folder-drop-target');
			setTimeout(() => {
				element.classList.remove('folder-drop-target');
			}, 2000);
		}
	}
	
	function handleBookmarkClick(bookmark: BookmarkItem, event: MouseEvent): void {
		handleBookmarkActivate(bookmark, event);
	}
	
	function handleBookmarkKeyDown(bookmark: BookmarkItem, event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleBookmarkActivate(bookmark, event);
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			handleBookmarkDelete(bookmark);
		}
	}
	
	function handleBookmarkActivate(bookmark: BookmarkItem, event: MouseEvent | KeyboardEvent): void {
		try {
			bookmarkStore.recordBookmarkAccess?.(bookmark.id);
		} catch (error) {
			console.warn('Failed to record bookmark access:', error);
		}
		
		const isModifiedClick = 'ctrlKey' in event ? (event.ctrlKey || event.metaKey) : false;
		const isShiftClick = 'shiftKey' in event ? event.shiftKey : false;
		
		if (isModifiedClick || isShiftClick) {
			window.open(bookmark.url, '_blank');
		} else {
			window.location.href = bookmark.url;
		}
		
		dispatch('bookmark-click', { bookmark, modifierKey: isModifiedClick });
		
		if (!isModifiedClick && !isShiftClick) {
			closeModal();
		}
	}
	
	function handleBookmarkContextMenu(bookmark: BookmarkItem, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		
		dispatch('bookmark-edit', { 
			bookmark, 
			position: { x: event.clientX, y: event.clientY } 
		});
	}
	
	function handleBookmarkDelete(bookmark: BookmarkItem): void {
		if (confirm(`Delete bookmark "${bookmark.title}"?`)) {
			try {
				bookmarkStore.removeBookmark?.(bookmark.id);
				dispatch('bookmark-deleted', { bookmark });
			} catch (error) {
				console.error('Failed to delete bookmark:', error);
			}
		}
	}
	
	function closeModal(): void {
		if (isClosing) return;
		
		isClosing = true;
		clearSearch();
		endDrag();
		
		dispatch('close');
		
		setTimeout(() => {
			isClosing = false;
		}, 300);
	}
	
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
	
	function setupIntersectionObserver(): void {
		if (!browser || typeof IntersectionObserver === 'undefined') return;
		
		intersectionObserver = new IntersectionObserver((entries) => {
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
		
		setTimeout(() => {
			const bookmarkElements = bookmarksContainer?.querySelectorAll('[data-bookmark-id]');
			bookmarkElements?.forEach(el => intersectionObserver!.observe(el));
		}, 100);
	}
	
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
	
	function handleModalKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Tab') {
			trapFocus(event);
		}
	}
	
	function trapFocus(event: KeyboardEvent): void {
		const focusableElements = modalElement?.querySelectorAll(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		
		if (!focusableElements?.length) return;
		
		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
		
		if (event.shiftKey) {
			if (document.activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus();
			}
		} else {
			if (document.activeElement === lastElement) {
				event.preventDefault();
				firstElement.focus();
			}
		}
	}
	
	function cleanup(): void {
		if (typingTimeout) clearTimeout(typingTimeout);
		if (hoverTimeout) clearTimeout(hoverTimeout);
		if (intersectionObserver) {
			intersectionObserver.disconnect();
			intersectionObserver = null;
		}
		document.removeEventListener('keydown', handleGlobalKeyDown);
		endDrag();
	}
</script>

{#if visible}
	<div 
		class="modal-overlay"
		transition:fade={{ duration: 200 }}
		on:click|self={closeModal}
		on:keydown={handleModalKeyDown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
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
			role="document"
			tabindex="-1"
		>
			<div class="modal-header">
				<div class="header-content">
					<h2 id="modal-title" class="category-title">{category.name}</h2>
					<div class="bookmark-stats" role="status" aria-live="polite">
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
					<div class="search-container" class:active={searchActive || searchQuery}>
						<label for="bookmark-search" class="sr-only">Search bookmarks</label>
						<div class="search-icon" aria-hidden="true">🔍</div>
						<input
							id="bookmark-search"
							bind:this={searchInput}
							bind:value={searchQuery}
							on:input={handleSearchInput}
							on:focus={() => searchActive = true}
							on:blur={() => searchActive = !!searchQuery}
							placeholder="Search bookmarks..."
							class="search-input"
							type="text"
							aria-label="Search bookmarks"
						/>
						{#if searchQuery}
							<button 
								class="clear-search"
								on:click={clearSearch}
								aria-label="Clear search"
								type="button"
							>
								×
							</button>
						{/if}
					</div>
					
					<div class="view-controls">
						<button 
							class="toggle-labels"
							class:active={showLabels}
							on:click={() => showLabels = !showLabels}
							aria-label="Toggle bookmark labels"
							aria-pressed={showLabels}
							title="Toggle Labels"
							type="button"
						>
							<span aria-hidden="true">📝</span>
						</button>
					</div>
					
					<button 
						class="close-button"
						on:click={closeModal}
						aria-label="Close bookmark modal"
						type="button"
					>
						<span aria-hidden="true">×</span>
					</button>
				</div>
			</div>
			
			<div class="modal-content">
				{#if filteredBookmarks.length === 0}
					<div class="empty-bookmarks" role="status">
						{#if searchQuery}
							<div class="empty-icon" aria-hidden="true">🔍</div>
							<h3>No bookmarks found</h3>
							<p>Try adjusting your search terms</p>
							<button 
								class="clear-search-btn" 
								on:click={clearSearch}
								type="button"
							>
								Clear Search
							</button>
						{:else}
							<div class="empty-icon" aria-hidden="true">📌</div>
							<h3>No bookmarks yet</h3>
							<p>Add some bookmarks to get started</p>
						{/if}
					</div>
				{:else}
					<div 
						class="bookmarks-grid"
						bind:this={bookmarksContainer}
						class:dragging={isDragging}
						role="grid"
						aria-label="Bookmarks"
					>
						{#each filteredBookmarks as bookmark, index (bookmark.id)}
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
								on:keydown={(e) => handleBookmarkKeyDown(bookmark, e)}
								on:contextmenu={(e) => handleBookmarkContextMenu(bookmark, e)}
								transition:fly={{ 
									y: 20, 
									duration: 200, 
									delay: Math.min(index * 50, 500) 
								}}
								role="gridcell"
								tabindex="0"
								aria-label="Bookmark: {bookmark.title}"
								aria-describedby="bookmark-desc-{bookmark.id}"
								aria-grabbed="false"
							>
								<div class="bookmark-favicon">
									{#if !failedFavicons.has(bookmark.id)}
										<img
											src={getFaviconUrl(bookmark)}
											alt=""
											loading="lazy"
											on:load={() => handleFaviconLoad(bookmark)}
											on:error={() => handleFaviconError(bookmark)}
											class="favicon-image"
											aria-hidden="true"
										/>
									{:else}
										<div class="favicon-fallback" aria-hidden="true">
											{getFallbackIcon(bookmark)}
										</div>
									{/if}
								</div>
								
								{#if showLabels}
									<div 
										class="bookmark-label" 
										transition:fade={{ duration: 150 }}
										id="bookmark-desc-{bookmark.id}"
									>
										<span class="bookmark-title">{bookmark.title}</span>
										{#if bookmark.description}
											<span class="bookmark-description">{bookmark.description}</span>
										{/if}
									</div>
								{/if}
								
								<div 
									class="drag-handle" 
									title="Drag to reorder or create folder"
									aria-hidden="true"
								>
									⋮⋮
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			
			<div class="modal-footer">
				<div class="footer-info">
					<span class="hint" role="note">
						<span aria-hidden="true">💡</span> 
						Drag bookmarks to reorder or create folders
					</span>
				</div>
				<div class="footer-actions">
					<button 
						class="action-btn secondary" 
						on:click={clearSearch}
						type="button"
						disabled={!searchQuery}
					>
						Clear Search
					</button>
					<button 
						class="action-btn primary" 
						on:click={closeModal}
						type="button"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
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
		outline: none;
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
		padding: 24px 32px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		position: relative;
		z-index: 2;
	}
	
	.header-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	
	.category-title {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		color: var(--modal-text);
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
	
	.bookmark-stats {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}
	
	.header-controls {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	
	.search-container {
		position: relative;
		display: flex;
		align-items: center;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 20px;
		padding: 8px 16px;
		transition: all 0.3s ease;
		min-width: 200px;
	}
	
	.search-container.active {
		background: rgba(255, 255, 255, 0.15);
		border-color: var(--modal-accent);
		box-shadow: 0 0 0 2px rgba(var(--modal-accent), 0.2);
	}
	
	.search-icon {
		margin-right: 8px;
		font-size: 14px;
		opacity: 0.7;
	}
	
	.search-input {
		background: none;
		border: none;
		outline: none;
		color: var(--modal-text);
		font-size: 14px;
		width: 100%;
		min-width: 0;
	}
	
	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}
	
	.clear-search {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		font-size: 18px;
		line-height: 1;
		margin-left: 8px;
		padding: 2px 4px;
		border-radius: 4px;
		transition: all 0.3s ease;
	}
	
	.clear-search:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}
	
	.clear-search:focus {
		outline: 2px solid var(--modal-accent);
		outline-offset: 2px;
	}
	
	.view-controls {
		display: flex;
		gap: 8px;
	}
	
	.toggle-labels {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 16px;
		padding: 8px;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.toggle-labels:hover {
		background: rgba(255, 255, 255, 0.15);
		color: white;
	}
	
	.toggle-labels:focus {
		outline: 2px solid var(--modal-accent);
		outline-offset: 2px;
	}
	
	.toggle-labels.active {
		background: var(--modal-accent);
		color: white;
		border-color: var(--modal-accent);
	}
	
	.close-button {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 20px;
		line-height: 1;
		padding: 8px;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
	}
	
	.close-button:hover {
		background: rgba(255, 255, 255, 0.15);
		color: white;
	}
	
	.close-button:focus {
		outline: 2px solid var(--modal-accent);
		outline-offset: 2px;
	}
	
	.modal-content {
		flex: 1;
		overflow: hidden;
		position: relative;
		z-index: 1;
	}
	
	.empty-bookmarks {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
		padding: 40px;
	}
	
	.empty-icon {
		font-size: 48px;
		margin-bottom: 16px;
		opacity: 0.7;
	}
	
	.empty-bookmarks h3 {
		margin: 0 0 8px 0;
		font-size: 18px;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.empty-bookmarks p {
		margin: 0 0 20px 0;
		font-size: 14px;
	}
	
	.clear-search-btn {
		background: var(--modal-accent);
		border: none;
		border-radius: 8px;
		color: white;
		cursor: pointer;
		font-size: 14px;
		padding: 8px 16px;
		transition: all 0.3s ease;
	}
	
	.clear-search-btn:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}
	
	.clear-search-btn:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
	}
	
	.bookmarks-grid {
		padding: 24px;
		height: 100%;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 16px;
		align-content: start;
	}
	
	.bookmarks-grid.dragging {
		user-select: none;
	}
	
	.bookmark-item {
		background: rgba(255, 255, 255, 0.08);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 16px 12px;
		position: relative;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		min-height: 120px;
		overflow: hidden;
	}
	
	.bookmark-item:hover {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
		box-shadow: 
			0 8px 25px rgba(0, 0, 0, 0.3),
			0 0 0 1px var(--modal-accent);
	}
	
	.bookmark-item:focus {
		outline: 2px solid var(--modal-accent);
		outline-offset: 2px;
		background: rgba(255, 255, 255, 0.12);
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
		pointer-events: none;
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
		z-index: 2;
	}
	
	.footer-info {
		flex: 1;
	}
	
	.hint {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.5);
		font-style: italic;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	
	.footer-actions {
		display: flex;
		gap: 12px;
	}
	
	.action-btn {
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
		border: 1px solid transparent;
	}
	
	.action-btn:focus {
		outline: 2px solid var(--modal-accent);
		outline-offset: 2px;
	}
	
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.action-btn.secondary {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.8);
	}
	
	.action-btn.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		color: white;
	}
	
	.action-btn.primary {
		background: var(--modal-accent);
		color: white;
	}
	
	.action-btn.primary:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}
	
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}
	
	@keyframes folderPulse {
		0% { transform: scale(1); }
		50% { transform: scale(1.05); }
		100% { transform: scale(1); }
	}

	@media (max-width: 768px) {
		.bookmark-modal {
			width: 95vw;
			height: 90vh;
			margin: 0;
		}
		
		.modal-header {
			padding: 16px 20px 12px;
			flex-direction: column;
			gap: 16px;
		}
		
		.header-controls {
			width: 100%;
			justify-content: space-between;
		}
		
		.search-container {
			flex: 1;
			min-width: 0;
		}
		
		.bookmarks-grid {
			padding: 16px;
			grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
			gap: 12px;
		}
		
		.bookmark-item {
			min-height: 100px;
			padding: 12px 8px;
		}
		
		.modal-footer {
			padding: 12px 16px;
			flex-direction: column;
			gap: 12px;
		}
		
		.footer-actions {
			width: 100%;
			justify-content: space-between;
		}
		
		.action-btn {
			flex: 1;
		}
	}
</style>
