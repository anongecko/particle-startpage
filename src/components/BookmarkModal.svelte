<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { fade, scale, fly } from 'svelte/transition';
	import { cubicOut, elasticOut, backOut, expoOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	
	import type { BookmarkCategory, BookmarkItem } from '$stores/bookmarks';
	import { bookmarkStore } from '$stores/bookmarks';
	import { settingsStore } from '$stores/settings';
	import { colorStore } from '$stores/color';
	
	interface Props {
		category: BookmarkCategory;
		visible?: boolean;
		dominantColor?: string;
	}
	
	let { 
		category, 
		visible = false, 
		dominantColor = '#4a90e2' 
	}: Props = $props();
	
	let modalElement: HTMLElement = $state();
	let searchInput: HTMLInputElement = $state();
	let bookmarksContainer: HTMLElement = $state();
	let isClosing = $state(false);
	let searchQuery = $state('');
	let showLabels = $state(false);
	let isDragging = $state(false);
	let draggedBookmark: BookmarkItem | null = $state(null);
	let dropTarget: BookmarkItem | null = $state(null);
	let hoverTimeout: NodeJS.Timeout | null = $state(null);
	let focusedElementBeforeModal: HTMLElement | null = $state(null);
	let isSearchFocused = $state(false);
	let selectedBookmarkIndex = $state(-1);
	
	let dragStartPosition = $state({ x: 0, y: 0 });
	let draggedElement: HTMLElement | null = $state(null);
	let dropIndicatorPosition = $state({ x: 0, y: 0, visible: false });
	
	let filteredBookmarksState = $state([]);
	let typingTimeout: NodeJS.Timeout | null = $state(null);
	
	let loadedFavicons = $state(new Set<string>());
	let failedFavicons = $state(new Set<string>());
	let visibleBookmarksSet = $state(new Set<string>());
	let intersectionObserver: IntersectionObserver | null = $state(null);
	
	const modalScale = tweened(0.85, { duration: 400, easing: backOut });
	const modalOpacity = tweened(0, { duration: 300, easing: cubicOut });
	const searchGlow = tweened(0, { duration: 300, easing: cubicOut });
	const dragIndicatorOpacity = tweened(0, { duration: 200, easing: cubicOut });
	
	const dispatch = createEventDispatcher();
	
	let currentSettings = $derived(get(settingsStore));
	let colorPalette = $derived(get(colorStore));
	let gradientColors = $derived(getGradientColors());
	let textColor = $derived(getContrastColor(dominantColor));
	let filteredBookmarksCount = $derived(filteredBookmarksState.length);
	let hasSearchQuery = $derived(searchQuery.trim().length > 0);
	let filteredBookmarksVisible = $derived(filteredBookmarksState.slice(0, 50)); // Performance optimization
	
	function getGradientColors(): { primary: string; secondary: string; rgb: string } {
		const rgb = hexToRgb(dominantColor);
		if (!rgb) return { 
			primary: '#4a90e2', 
			secondary: '#357abd',
			rgb: '74, 144, 226'
		};
		
		const primary = dominantColor;
		const secondary = `rgb(${Math.max(0, rgb.r - 50)}, ${Math.max(0, rgb.g - 50)}, ${Math.max(0, rgb.b - 50)})`;
		const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
		
		return { primary, secondary, rgb: rgbString };
	}
	
	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	}
	
	function getContrastColor(backgroundColor: string): string {
		const rgb = hexToRgb(backgroundColor);
		if (!rgb) return '#ffffff';
		
		const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
		return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
	}
	
	function filterBookmarks(bookmarks: BookmarkItem[], query: string): BookmarkItem[] {
		if (!query.trim()) return bookmarks;
		
		const searchTerm = query.toLowerCase();
		const results = bookmarks.filter(bookmark => {
			const titleMatch = bookmark.title.toLowerCase().includes(searchTerm);
			const urlMatch = bookmark.url.toLowerCase().includes(searchTerm);
			const descMatch = bookmark.description?.toLowerCase().includes(searchTerm) || false;
			const tagMatch = bookmark.tags.some(tag => tag.toLowerCase().includes(searchTerm));
			
			return titleMatch || urlMatch || descMatch || tagMatch;
		});
		
		// Sort by relevance (title matches first, then URL, etc.)
		return results.sort((a, b) => {
			const aTitle = a.title.toLowerCase();
			const bTitle = b.title.toLowerCase();
			const term = searchTerm;
			
			if (aTitle.startsWith(term) && !bTitle.startsWith(term)) return -1;
			if (!aTitle.startsWith(term) && bTitle.startsWith(term)) return 1;
			if (aTitle.includes(term) && !bTitle.includes(term)) return -1;
			if (!aTitle.includes(term) && bTitle.includes(term)) return 1;
			
			return a.title.localeCompare(b.title);
		});
	}
	
	function setupEventListeners(): void {
		document.addEventListener('keydown', handleGlobalKeyDown);
		document.addEventListener('click', handleClickOutside);
	}
	
	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		if (modalElement && !modalElement.contains(target)) {
			closeModal();
		}
	}
	
	function handleGlobalKeyDown(event: KeyboardEvent): void {
		if (!visible) return;
		
		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				closeModal();
				break;
			case 'Enter':
				if (event.target === searchInput) {
					event.preventDefault();
					if (filteredBookmarksVisible.length > 0) {
						const targetBookmark = selectedBookmarkIndex >= 0 ? 
							filteredBookmarksVisible[selectedBookmarkIndex] : 
							filteredBookmarksVisible[0];
						handleBookmarkActivate(targetBookmark, event);
					}
				}
				break;
			case 'ArrowDown':
				if (filteredBookmarksVisible.length > 0) {
					event.preventDefault();
					selectedBookmarkIndex = Math.min(selectedBookmarkIndex + 1, filteredBookmarksVisible.length - 1);
					scrollToSelectedBookmark();
				}
				break;
			case 'ArrowUp':
				if (filteredBookmarksVisible.length > 0) {
					event.preventDefault();
					selectedBookmarkIndex = Math.max(selectedBookmarkIndex - 1, -1);
					scrollToSelectedBookmark();
				}
				break;
			case '/':
				if (event.target !== searchInput) {
					event.preventDefault();
					searchInput?.focus();
				}
				break;
		}
	}
	
	function scrollToSelectedBookmark(): void {
		if (selectedBookmarkIndex < 0) return;
		
		const selectedElement = bookmarksContainer?.querySelector(
			`[data-bookmark-index="${selectedBookmarkIndex}"]`
		);
		
		if (selectedElement) {
			selectedElement.scrollIntoView({ 
				behavior: 'smooth', 
				block: 'nearest' 
			});
		}
	}
	
	function handleSearchInput(event: InputEvent): void {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;
		selectedBookmarkIndex = -1;
		
		// Visual feedback for search
		if (searchQuery.trim()) {
			searchGlow.set(1).then(() => {
				setTimeout(() => searchGlow.set(0), 600);
			});
		}
		
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
	
	function handleSearchFocus(): void {
		isSearchFocused = true;
		searchGlow.set(0.6);
	}
	
	function handleSearchBlur(): void {
		isSearchFocused = false;
		if (!hasSearchQuery) {
			searchGlow.set(0);
		}
	}
	
	function clearSearch(): void {
		searchQuery = '';
		selectedBookmarkIndex = -1;
		searchGlow.set(0);
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
			draggedElement.classList.add('is-dragging');
			draggedElement.setAttribute('aria-grabbed', 'true');
		}
		
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', bookmark.id);
			event.dataTransfer.setData('application/x-bookmark', JSON.stringify(bookmark));
		}
		
		// Visual feedback
		dragIndicatorOpacity.set(1);
		
		dispatch('drag-start', { bookmark });
	}
	
	function handleDragOver(bookmark: BookmarkItem, event: DragEvent): void {
		if (!isDragging || !draggedBookmark || draggedBookmark.id === bookmark.id) return;
		
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		
		// Update drop indicator position
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		dropIndicatorPosition = {
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
			visible: true
		};
		
		if (dropTarget?.id !== bookmark.id) {
			dropTarget = bookmark;
			
			if (hoverTimeout) clearTimeout(hoverTimeout);
			
			hoverTimeout = setTimeout(() => {
				if (dropTarget && draggedBookmark && dropTarget.id !== draggedBookmark.id) {
					showFolderCreationHint(dropTarget);
				}
			}, 1000);
		}
	}
	
	function handleDragLeave(): void {
		dropIndicatorPosition.visible = false;
		
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
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
		dropIndicatorPosition.visible = false;
		
		dragIndicatorOpacity.set(0);
		
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		
		if (draggedElement) {
			draggedElement.classList.remove('is-dragging');
			draggedElement.setAttribute('aria-grabbed', 'false');
			draggedElement = null;
		}
		
		// Remove visual hints
		document.querySelectorAll('.folder-creation-hint').forEach(el => {
			el.classList.remove('folder-creation-hint');
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
			element.classList.add('folder-creation-hint');
			setTimeout(() => {
				element.classList.remove('folder-creation-hint');
			}, 2000);
		}
	}
	
	function handleBookmarkClick(bookmark: BookmarkItem, event: MouseEvent, index: number): void {
		selectedBookmarkIndex = index;
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
		
		modalScale.set(0.85);
		modalOpacity.set(0);
		
		setTimeout(() => {
			dispatch('close');
			isClosing = false;
		}, 200);
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
		loadedFavicons = new Set([...loadedFavicons, bookmark.id]);
	}
	
	function handleFaviconError(bookmark: BookmarkItem): void {
		failedFavicons = new Set([...failedFavicons, bookmark.id]);
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
						visibleBookmarksSet = new Set([...visibleBookmarksSet, bookmarkId]);
					} else {
						const newSet = new Set(visibleBookmarksSet);
						newSet.delete(bookmarkId);
						visibleBookmarksSet = newSet;
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
		document.removeEventListener('click', handleClickOutside);
		endDrag();
	}
	
	onMount(() => {
		if (!browser) return;
		
		focusedElementBeforeModal = document.activeElement as HTMLElement;
		setupEventListeners();
		setupIntersectionObserver();
		
		modalScale.set(1);
		modalOpacity.set(1);
		
		setTimeout(() => {
			if (searchInput && visible) {
				searchInput.focus();
			}
		}, 300);
		
		console.log('BookmarkModal initialized for category:', category.name);
		
		return cleanup;
	});
	
	onDestroy(() => {
		cleanup();
		if (focusedElementBeforeModal) {
			focusedElementBeforeModal.focus();
		}
	});
	
	$effect(() => {
		filteredBookmarksState = filterBookmarks(category.bookmarks, searchQuery);
	});
	
	$effect(() => {
		showLabels = currentSettings.showBookmarkLabels || false;
	});
</script>

{#if visible}
	<div 
		class="modal-backdrop"
		transition:fade={{ duration: 300 }}
		onclick={closeModal}
		onkeydown={handleModalKeyDown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="0"
		style:--primary-rgb={gradientColors.rgb}
		style:--primary-color={gradientColors.primary}
		style:--secondary-color={gradientColors.secondary}
		style:--text-color={textColor}
		style:--search-glow={$searchGlow}
		style:--modal-scale={$modalScale}
		style:--modal-opacity={$modalOpacity}
		style:--drag-indicator-opacity={$dragIndicatorOpacity}
	>
		<div 
			bind:this={modalElement}
			class="bookmark-modal"
			style:transform="scale({$modalScale})"
			style:opacity={$modalOpacity}
			onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
			role="document"
		>
			<div class="modal-header">
				<div class="header-main">
					<div class="category-info">
						<h2 id="modal-title" class="category-title">{category.name}</h2>
						<div class="bookmark-count" role="status" aria-live="polite">
							{filteredBookmarksCount} 
							{filteredBookmarksCount === 1 ? 'bookmark' : 'bookmarks'}
							{#if hasSearchQuery && filteredBookmarksCount !== category.bookmarks.length}
								<span class="search-filter">of {category.bookmarks.length}</span>
							{/if}
						</div>
					</div>
					
					<div class="header-actions">
						<div class="search-wrapper">
							<div class="search-container" class:focused={isSearchFocused} class:has-query={hasSearchQuery}>
								<div class="search-icon" aria-hidden="true">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<circle cx="11" cy="11" r="8"/>
										<path d="m21 21-4.35-4.35"/>
									</svg>
								</div>
								<input
									bind:this={searchInput}
									bind:value={searchQuery}
									oninput={handleSearchInput}
									onfocus={handleSearchFocus}
									onblur={handleSearchBlur}
									placeholder="Search bookmarks..."
									class="search-input"
									type="text"
									autocomplete="off"
									aria-label="Search bookmarks"
								/>
								{#if hasSearchQuery}
									<button 
										class="clear-search-btn"
										onclick={clearSearch}
										aria-label="Clear search"
										type="button"
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="m6 6 12 12M6 18 18 6"/>
										</svg>
									</button>
								{/if}
								<div class="search-glow-effect"></div>
							</div>
							<div class="search-shortcut-hint">Press / to search</div>
						</div>
						
						<button 
							class="toggle-labels-btn"
							class:active={showLabels}
							onclick={() => showLabels = !showLabels}
							aria-label="Toggle bookmark labels"
							aria-pressed={showLabels}
							title="Toggle Labels"
							type="button"
						>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
								<polyline points="14,2 14,8 20,8"/>
								<line x1="16" y1="13" x2="8" y2="13"/>
								<line x1="16" y1="17" x2="8" y2="17"/>
								<polyline points="10,9 9,9 8,9"/>
							</svg>
						</button>
						
						<button 
							class="close-btn"
							onclick={closeModal}
							aria-label="Close bookmark modal"
							type="button"
						>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="m6 6 12 12M6 18 18 6"/>
							</svg>
						</button>
					</div>
				</div>
			</div>
			
			<div class="modal-body">
				{#if filteredBookmarksCount === 0}
					<div class="empty-state" role="status">
						{#if hasSearchQuery}
							<div class="empty-icon search-empty" aria-hidden="true">
								<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<circle cx="11" cy="11" r="8"/>
									<path d="m21 21-4.35-4.35"/>
								</svg>
							</div>
							<h3>No bookmarks found</h3>
							<p>Try adjusting your search terms or <button class="link-btn" onclick={clearSearch}>clear the search</button></p>
						{:else}
							<div class="empty-icon" aria-hidden="true">
								<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
								</svg>
							</div>
							<h3>No bookmarks yet</h3>
							<p>Add some bookmarks to this category to get started</p>
						{/if}
					</div>
				{:else}
					<div 
						bind:this={bookmarksContainer}
						class="bookmarks-grid"
						class:dragging={isDragging}
						role="grid"
						aria-label="Bookmarks grid"
					>
						{#each filteredBookmarksVisible as bookmark, index (bookmark.id)}
							<div 
								class="bookmark-item"
								class:is-dragging={draggedBookmark?.id === bookmark.id}
								class:drop-target={dropTarget?.id === bookmark.id}
								class:selected={selectedBookmarkIndex === index}
								data-bookmark-id={bookmark.id}
								data-bookmark-index={index}
								draggable="true"
								ondragstart={(e) => handleDragStart(bookmark, e)}
								ondragover={(e) => handleDragOver(bookmark, e)}
								ondragleave={handleDragLeave}
								ondrop={(e) => handleDrop(bookmark, e)}
								ondragend={handleDragEnd}
								onclick={(e) => handleBookmarkClick(bookmark, e, index)}
								onkeydown={(e) => handleBookmarkKeyDown(bookmark, e)}
								oncontextmenu={(e) => handleBookmarkContextMenu(bookmark, e)}
								in:fly={{ 
									y: 20, 
									duration: 300, 
									delay: Math.min(index * 30, 300),
									easing: backOut
								}}
								role="gridcell"
								tabindex="0"
								aria-label="Bookmark: {bookmark.title}"
								aria-describedby="bookmark-desc-{bookmark.id}"
								aria-grabbed="false"
							>
								<div class="bookmark-content">
									<div class="bookmark-favicon">
										{#if !failedFavicons.has(bookmark.id)}
											<img
												src={getFaviconUrl(bookmark)}
												alt=""
												loading="lazy"
												onload={() => handleFaviconLoad(bookmark)}
												onerror={() => handleFaviconError(bookmark)}
												class="favicon-image"
												aria-hidden="true"
											/>
										{:else}
											<div class="favicon-fallback" aria-hidden="true">
												{getFallbackIcon(bookmark)}
											</div>
										{/if}
										<div class="favicon-glow"></div>
									</div>
									
									{#if showLabels}
										<div class="bookmark-label" id="bookmark-desc-{bookmark.id}">
											<span class="bookmark-title">{bookmark.title}</span>
											{#if bookmark.description}
												<span class="bookmark-description">{bookmark.description}</span>
											{/if}
										</div>
									{/if}
								</div>
								
								<div class="bookmark-hover-overlay">
									<div class="quick-actions">
										<button 
											class="quick-action-btn"
											onclick={(e) => { e.stopPropagation(); window.open(bookmark.url, '_blank'); }}
											aria-label="Open in new tab"
											type="button"
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
												<polyline points="15,3 21,3 21,9"/>
												<line x1="10" y1="14" x2="21" y2="3"/>
											</svg>
										</button>
									</div>
								</div>
								
								<div class="drag-handle" aria-hidden="true">
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<circle cx="9" cy="12" r="1"/>
										<circle cx="9" cy="5" r="1"/>
										<circle cx="9" cy="19" r="1"/>
										<circle cx="15" cy="12" r="1"/>
										<circle cx="15" cy="5" r="1"/>
										<circle cx="15" cy="19" r="1"/>
									</svg>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			
			<div class="modal-footer">
				<div class="footer-info">
					<div class="keyboard-hints">
						<span class="hint-item">
							<kbd>↑↓</kbd> Navigate
						</span>
						<span class="hint-item">
							<kbd>Enter</kbd> Open
						</span>
						<span class="hint-item">
							<kbd>Ctrl+Enter</kbd> New tab
						</span>
						<span class="hint-item">
							<kbd>Esc</kbd> Close
						</span>
					</div>
				</div>
				<div class="footer-actions">
					<button 
						class="action-btn secondary" 
						onclick={clearSearch}
						disabled={!hasSearchQuery}
						type="button"
					>
						Clear Search
					</button>
					<button 
						class="action-btn primary" 
						onclick={closeModal}
						type="button"
					>
						Done
					</button>
				</div>
			</div>
		</div>
		
		{#if dropIndicatorPosition.visible}
			<div 
				class="drop-indicator"
				style:left="{dropIndicatorPosition.x}px"
				style:top="{dropIndicatorPosition.y}px"
				style:opacity={$dragIndicatorOpacity}
				aria-hidden="true"
			>
				<div class="drop-indicator-ring"></div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(12px) saturate(1.2);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 24px;
		animation: backdrop-enter 0.3s ease-out;
	}
	
	@keyframes backdrop-enter {
		from {
			background: rgba(0, 0, 0, 0);
			backdrop-filter: blur(0px);
		}
		to {
			background: rgba(0, 0, 0, 0.6);
			backdrop-filter: blur(12px) saturate(1.2);
		}
	}
	
	.bookmark-modal {
		width: 100%;
		max-width: 900px;
		height: 85vh;
		max-height: 700px;
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.12) 0%, 
			rgba(255, 255, 255, 0.08) 50%,
			rgba(255, 255, 255, 0.06) 100%);
		backdrop-filter: blur(24px) saturate(1.8);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 24px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
		box-shadow: 
			0 32px 64px rgba(0, 0, 0, 0.3),
			0 0 0 1px rgba(var(--primary-rgb), 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.15);
		animation: modal-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	
	@keyframes modal-enter {
		from {
			transform: scale(0.85);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
	
	.modal-header {
		padding: 28px 32px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.1) 0%, 
			rgba(255, 255, 255, 0.05) 100%);
		position: relative;
	}
	
	.header-main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
	}
	
	.category-info {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	
	.category-title {
		margin: 0;
		font-size: 28px;
		font-weight: 700;
		color: var(--text-color);
		letter-spacing: -0.02em;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}
	
	.bookmark-count {
		font-size: 14px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	
	.search-filter {
		color: rgba(255, 255, 255, 0.5);
		font-size: 13px;
	}
	
	.header-actions {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	
	.search-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
	}
	
	.search-container {
		position: relative;
		display: flex;
		align-items: center;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 18px;
		padding: 12px 16px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		min-width: 280px;
		overflow: hidden;
	}
	
	.search-container.focused {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(var(--primary-rgb), 0.4);
		box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.15);
		transform: scale(1.02);
	}
	
	.search-container.has-query {
		border-color: rgba(var(--primary-rgb), 0.3);
	}
	
	.search-icon {
		color: rgba(255, 255, 255, 0.5);
		margin-right: 12px;
		transition: color 0.3s ease;
	}
	
	.search-container.focused .search-icon {
		color: rgba(var(--primary-rgb), 0.8);
	}
	
	.search-input {
		background: none;
		border: none;
		outline: none;
		color: var(--text-color);
		font-size: 14px;
		width: 100%;
		min-width: 0;
		font-weight: 400;
	}
	
	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
		transition: color 0.3s ease;
	}
	
	.search-container.focused .search-input::placeholder {
		color: rgba(255, 255, 255, 0.6);
	}
	
	.clear-search-btn {
		background: rgba(255, 255, 255, 0.08);
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		border-radius: 8px;
		margin-left: 8px;
		padding: 6px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	
	.clear-search-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.9);
		transform: scale(1.05);
	}
	
	.search-glow-effect {
		position: absolute;
		inset: -2px;
		background: linear-gradient(135deg, 
			rgba(var(--primary-rgb), calc(var(--search-glow) * 0.4)) 0%,
			rgba(var(--primary-rgb), calc(var(--search-glow) * 0.1)) 50%,
			transparent 100%);
		border-radius: 20px;
		pointer-events: none;
		z-index: -1;
		transition: all 0.3s ease;
	}
	
	.search-shortcut-hint {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.4);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
		background: rgba(255, 255, 255, 0.06);
		padding: 4px 8px;
		border-radius: 6px;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}
	
	.search-wrapper:hover .search-shortcut-hint {
		opacity: 1;
	}
	
	.toggle-labels-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		padding: 12px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.toggle-labels-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.9);
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.25);
	}
	
	.toggle-labels-btn.active {
		background: rgba(var(--primary-rgb), 0.2);
		color: rgba(var(--primary-rgb), 0.9);
		border-color: rgba(var(--primary-rgb), 0.3);
		box-shadow: 0 0 12px rgba(var(--primary-rgb), 0.2);
	}
	
	.toggle-labels-btn:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.close-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		padding: 12px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.close-btn:hover {
		background: rgba(239, 68, 68, 0.15);
		color: rgba(239, 68, 68, 0.9);
		border-color: rgba(239, 68, 68, 0.3);
		transform: translateY(-2px);
	}
	
	.close-btn:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.modal-body {
		flex: 1;
		overflow: hidden;
		position: relative;
	}
	
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		padding: 48px 32px;
		color: rgba(255, 255, 255, 0.6);
	}
	
	.empty-icon {
		color: rgba(255, 255, 255, 0.3);
		margin-bottom: 20px;
		opacity: 0.8;
	}
	
	.empty-icon.search-empty {
		color: rgba(var(--primary-rgb), 0.4);
	}
	
	.empty-state h3 {
		margin: 0 0 12px 0;
		font-size: 20px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.empty-state p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.6);
	}
	
	.link-btn {
		background: none;
		border: none;
		color: rgba(var(--primary-rgb), 0.8);
		cursor: pointer;
		text-decoration: underline;
		font-size: inherit;
		padding: 0;
	}
	
	.link-btn:hover {
		color: rgba(var(--primary-rgb), 1);
	}
	
	.bookmarks-grid {
		padding: 28px;
		height: 100%;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 20px;
		align-content: start;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
	}
	
	.bookmarks-grid.dragging {
		user-select: none;
	}
	
	.bookmark-item {
		background: rgba(255, 255, 255, 0.06);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		cursor: pointer;
		position: relative;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		min-height: 140px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		backdrop-filter: blur(8px);
	}
	
	.bookmark-item::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.1) 0%, 
			transparent 50%,
			rgba(0, 0, 0, 0.05) 100%);
		opacity: 0;
		transition: opacity 0.3s ease;
		border-radius: inherit;
	}
	
	.bookmark-item:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-4px) scale(1.02);
		box-shadow: 
			0 12px 32px rgba(0, 0, 0, 0.2),
			0 0 0 1px rgba(var(--primary-rgb), 0.3);
	}
	
	.bookmark-item:hover::before {
		opacity: 1;
	}
	
	.bookmark-item.selected {
		border-color: rgba(var(--primary-rgb), 0.6);
		box-shadow: 
			0 8px 24px rgba(0, 0, 0, 0.15),
			0 0 0 2px rgba(var(--primary-rgb), 0.4);
		transform: translateY(-2px);
	}
	
	.bookmark-item:focus-visible {
		outline: none;
		border-color: rgba(var(--primary-rgb), 0.6);
		box-shadow: 
			0 8px 24px rgba(0, 0, 0, 0.15),
			0 0 0 2px rgba(var(--primary-rgb), 0.4);
	}
	
	.bookmark-item.is-dragging {
		opacity: 0.7;
		transform: rotate(3deg) scale(1.05);
		z-index: 1000;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
	}
	
	.bookmark-item.drop-target {
		background: rgba(var(--primary-rgb), 0.15);
		border-color: rgba(var(--primary-rgb), 0.5);
		animation: drop-target-pulse 1s infinite;
	}
	
	.bookmark-content {
		padding: 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		text-align: center;
		gap: 12px;
	}
	
	.bookmark-favicon {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.08);
		position: relative;
		transition: transform 0.3s ease;
	}
	
	.bookmark-item:hover .bookmark-favicon {
		transform: scale(1.1);
	}
	
	.favicon-image {
		width: 36px;
		height: 36px;
		object-fit: contain;
		filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
		transition: filter 0.3s ease;
	}
	
	.bookmark-item:hover .favicon-image {
		filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
	}
	
	.favicon-fallback {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, 
			rgba(var(--primary-rgb), 0.8) 0%, 
			rgba(var(--primary-rgb), 0.6) 100%);
		color: white;
		font-weight: 700;
		font-size: 18px;
		border-radius: 8px;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
	
	.favicon-glow {
		position: absolute;
		inset: -4px;
		background: radial-gradient(circle at center, 
			rgba(var(--primary-rgb), 0.2) 0%,
			transparent 70%);
		border-radius: 16px;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}
	
	.bookmark-item:hover .favicon-glow {
		opacity: 1;
	}
	
	.bookmark-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		min-width: 0;
	}
	
	.bookmark-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-color);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}
	
	.bookmark-description {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
	}
	
	.bookmark-hover-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		border-radius: inherit;
		opacity: 0;
		transition: opacity 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}
	
	.bookmark-item:hover .bookmark-hover-overlay {
		opacity: 1;
		pointer-events: auto;
	}
	
	.quick-actions {
		display: flex;
		gap: 8px;
	}
	
	.quick-action-btn {
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		padding: 8px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(8px);
	}
	
	.quick-action-btn:hover {
		background: rgba(255, 255, 255, 0.25);
		border-color: rgba(255, 255, 255, 0.4);
		transform: scale(1.05);
	}
	
	.drag-handle {
		position: absolute;
		top: 8px;
		right: 8px;
		color: rgba(255, 255, 255, 0.3);
		opacity: 0;
		transition: all 0.3s ease;
		cursor: grab;
		padding: 4px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(4px);
	}
	
	.bookmark-item:hover .drag-handle {
		opacity: 1;
	}
	
	.drag-handle:active {
		cursor: grabbing;
	}
	
	.modal-footer {
		padding: 20px 28px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.06) 0%, 
			rgba(255, 255, 255, 0.03) 100%);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
	}
	
	.footer-info {
		flex: 1;
	}
	
	.keyboard-hints {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}
	
	.hint-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.5);
	}
	
	kbd {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 10px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
		letter-spacing: 0.5px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}
	
	.footer-actions {
		display: flex;
		gap: 12px;
	}
	
	.action-btn {
		padding: 10px 18px;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		border: 1px solid transparent;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	
	.action-btn:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
	}
	
	.action-btn.secondary {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.8);
	}
	
	.action-btn.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.95);
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.25);
	}
	
	.action-btn.primary {
		background: linear-gradient(135deg, 
			rgba(var(--primary-rgb), 0.8) 0%, 
			rgba(var(--primary-rgb), 0.6) 100%);
		color: white;
		border-color: rgba(var(--primary-rgb), 0.3);
		box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.2);
	}
	
	.action-btn.primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(var(--primary-rgb), 0.3);
	}
	
	.drop-indicator {
		position: fixed;
		pointer-events: none;
		z-index: 1001;
		transform: translate(-50%, -50%);
	}
	
	.drop-indicator-ring {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(var(--primary-rgb), 0.8);
		border-radius: 50%;
		background: rgba(var(--primary-rgb), 0.2);
		backdrop-filter: blur(4px);
		animation: drop-indicator-pulse 1s infinite;
	}
	
	@keyframes drop-target-pulse {
		0%, 100% { 
			background: rgba(var(--primary-rgb), 0.15);
			border-color: rgba(var(--primary-rgb), 0.5);
		}
		50% { 
			background: rgba(var(--primary-rgb), 0.25);
			border-color: rgba(var(--primary-rgb), 0.7);
		}
	}
	
	@keyframes folder-hint-bounce {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.05); }
	}
	
	@keyframes drop-indicator-pulse {
		0%, 100% { 
			transform: scale(1);
			opacity: 1;
		}
		50% { 
			transform: scale(1.2);
			opacity: 0.7;
		}
	}
	
	@media (max-width: 1024px) {
		.bookmark-modal {
			width: 95vw;
			height: 90vh;
			margin: 12px;
		}
		
		.modal-header {
			padding: 24px 24px 16px;
		}
		
		.header-main {
			flex-direction: column;
			gap: 20px;
			align-items: stretch;
		}
		
		.header-actions {
			justify-content: space-between;
		}
		
		.search-container {
			flex: 1;
			min-width: 0;
		}
		
		.bookmarks-grid {
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
			gap: 16px;
			padding: 20px;
		}
		
		.bookmark-item {
			min-height: 120px;
		}
		
		.keyboard-hints {
			display: none;
		}
	}
	
	@media (max-width: 640px) {
		.bookmark-modal {
			width: 98vw;
			height: 95vh;
			margin: 8px;
			border-radius: 20px;
		}
		
		.modal-header {
			padding: 20px 20px 16px;
		}
		
		.category-title {
			font-size: 24px;
		}
		
		.search-container {
			min-width: 200px;
		}
		
		.bookmarks-grid {
			grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
			gap: 12px;
			padding: 16px;
		}
		
		.bookmark-item {
			min-height: 100px;
		}
		
		.bookmark-content {
			padding: 16px 12px;
			gap: 8px;
		}
		
		.bookmark-favicon {
			width: 48px;
			height: 48px;
		}
		
		.favicon-image,
		.favicon-fallback {
			width: 28px;
			height: 28px;
		}
		
		.modal-footer {
			padding: 16px 20px;
			flex-direction: column-reverse;
			gap: 16px;
		}
		
		.footer-actions {
			width: 100%;
			justify-content: space-between;
		}
		
		.action-btn {
			flex: 1;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.bookmark-modal,
		.bookmark-item,
		.search-container {
			animation: none;
			transition: none;
		}
		
		.bookmark-item:hover {
			transform: none;
		}
		
		.drop-indicator-ring {
			animation: none;
		}
	}
	
	@media (hover: none) {
		.bookmark-item:hover {
			transform: none;
		}
		
		.bookmark-hover-overlay {
			display: none;
		}
		
		.drag-handle {
			opacity: 1;
		}
	}
</style>
