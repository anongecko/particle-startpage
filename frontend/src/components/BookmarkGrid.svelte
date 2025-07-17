<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, backOut, sineInOut } from 'svelte/easing';
	import { bookmarkStore, type BookmarkCategory, type BookmarkItem } from '$stores/bookmarks';
	import { settingsStore } from '$stores/settings';
	import BookmarkFolder from './BookmarkFolder.svelte';
	import NotificationToast from './NotificationToast.svelte';
	
	export let bookmarks: any;
	export let dominantColor: string = '#ffffff';
	export let settings: any;
	
	const dispatch = createEventDispatcher();
	
	let gridContainer: HTMLElement;
	let openCategoryId: string | null = null;
	let hoveredCategoryId: string | null = null;
	let showEmptyToast = false;
	let keyboardFocusIndex = -1;
	let touchStartTime = 0;
	let lastTapTime = 0;
	
	// Animation stores
	const colorTransition = tweened(dominantColor, { duration: 800, easing: cubicOut });
	const gridScale = spring(1, { stiffness: 0.1, damping: 0.8 });
	
	// Computed values
	$: visibleCategories = bookmarks?.categories?.filter(cat => cat.isVisible) || [];
	$: hasBookmarksAtAll = visibleCategories.length > 0 && visibleCategories.some(cat => cat.bookmarks.length > 0);
	$: bookmarkSize = settings?.ui?.bookmarkSize || 1;
	$: folderSize = settings?.ui?.folderSize || 1;
	
	// Grid layout configuration
	$: gridConfig = {
		minColumnWidth: Math.max(120, 120 * folderSize),
		gap: Math.max(24, 24 * folderSize),
		maxColumns: Math.min(6, Math.max(3, Math.floor(window.innerWidth / (120 * folderSize + 24))))
	};
	
	interface CategoryState {
		id: string;
		isOpen: boolean;
		isHovered: boolean;
		dropdownHeight: number;
		animating: boolean;
	}
	
	let categoryStates = new Map<string, CategoryState>();
	
	function initializeCategoryStates(): void {
		categoryStates.clear();
		for (const category of visibleCategories) {
			categoryStates.set(category.id, {
				id: category.id,
				isOpen: false,
				isHovered: false,
				dropdownHeight: 0,
				animating: false
			});
		}
	}
	
	function updateCategoryState(categoryId: string, updates: Partial<CategoryState>): void {
		const current = categoryStates.get(categoryId);
		if (current) {
			categoryStates.set(categoryId, { ...current, ...updates });
			categoryStates = new Map(categoryStates); // Trigger reactivity
		}
	}
	
	async function handleCategoryClick(category: BookmarkCategory, event: MouseEvent): Promise<void> {
		event.stopPropagation();
		
		// Handle empty category
		if (category.bookmarks.length === 0) {
			showEmptyToast = true;
			setTimeout(() => {
				showEmptyToast = false;
				// Open bookmark settings
				dispatch('openSettings', { section: 'bookmarks', category: category.id });
			}, 2000);
			return;
		}
		
		const wasOpen = openCategoryId === category.id;
		
		// Close currently open category
		if (openCategoryId && openCategoryId !== category.id) {
			await closeCategory(openCategoryId);
		}
		
		if (wasOpen) {
			await closeCategory(category.id);
		} else {
			await openCategory(category.id);
		}
		
		dispatch('interact');
	}
	
	async function openCategory(categoryId: string): Promise<void> {
		openCategoryId = categoryId;
		updateCategoryState(categoryId, { isOpen: true, animating: true });
		
		// Calculate dropdown height
		const category = visibleCategories.find(c => c.id === categoryId);
		if (!category) return;
		
		const itemHeight = 48 * bookmarkSize;
		const padding = 16;
		const maxHeight = Math.min(
			window.innerHeight * 0.4, // Max 40% of screen height
			category.bookmarks.length * itemHeight + padding * 2
		);
		
		updateCategoryState(categoryId, { dropdownHeight: maxHeight });
		
		// Wait for animation
		await new Promise(resolve => setTimeout(resolve, 300));
		updateCategoryState(categoryId, { animating: false });
	}
	
	async function closeCategory(categoryId: string): Promise<void> {
		updateCategoryState(categoryId, { animating: true });
		
		// Animate close
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
	
	function handleCategoryHover(category: BookmarkCategory, isHovered: boolean, event?: MouseEvent): void {
		hoveredCategoryId = isHovered ? category.id : null;
		updateCategoryState(category.id, { isHovered });
		
		// Emit particle interaction event
		if (event) {
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			
			window.dispatchEvent(new CustomEvent('bookmark-hover', {
				detail: {
					categoryId: category.id,
					action: isHovered ? 'start' : 'end',
					position: { x: centerX, y: centerY }
				}
			}));
		}
		
		dispatch('interact');
	}
	
	function handleRightClick(category: BookmarkCategory, event: MouseEvent): void {
		event.preventDefault();
		
		dispatch('contextMenu', {
			category,
			position: { x: event.clientX, y: event.clientY }
		});
	}
	
	function handleBookmarkClick(bookmark: BookmarkItem, event: MouseEvent): void {
		event.stopPropagation();
		
		// Update analytics
		bookmarkStore.recordBookmarkAccess(bookmark.id);
		
		// Handle modifier keys
		if (event.ctrlKey || event.metaKey) {
			window.open(bookmark.url, '_blank');
		} else if (event.shiftKey) {
			window.open(bookmark.url, '_blank');
		} else {
			window.location.href = bookmark.url;
		}
	}
	
	// Keyboard navigation
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
				if (openCategoryId) {
					closeCategory(openCategoryId);
				}
				keyboardFocusIndex = -1;
				break;
		}
	}
	
	function focusCategory(index: number): void {
		const elements = gridContainer?.querySelectorAll('.bookmark-folder');
		const element = elements?.[index] as HTMLElement;
		element?.focus();
	}
	
	// Touch handling
	function handleTouchStart(category: BookmarkCategory, event: TouchEvent): void {
		touchStartTime = Date.now();
		
		// Long press detection
		setTimeout(() => {
			if (Date.now() - touchStartTime >= 500) {
				// Long press - show context menu
				const touch = event.touches[0];
				handleRightClick(category, {
					preventDefault: () => {},
					clientX: touch.clientX,
					clientY: touch.clientY
				} as MouseEvent);
				
				// Haptic feedback
				if ('vibrate' in navigator) {
					navigator.vibrate(50);
				}
			}
		}, 500);
	}
	
	function handleTouchEnd(category: BookmarkCategory, event: TouchEvent): void {
		const touchDuration = Date.now() - touchStartTime;
		const timeSinceLastTap = Date.now() - lastTapTime;
		
		if (touchDuration < 500) { // Not a long press
			if (timeSinceLastTap < 300) {
				// Double tap - quick open/close
				handleCategoryClick(category, new MouseEvent('click'));
			} else {
				// Single tap
				setTimeout(() => {
					if (Date.now() - lastTapTime >= 300) {
						handleCategoryClick(category, new MouseEvent('click'));
					}
				}, 300);
			}
			lastTapTime = Date.now();
		}
	}
	
	// Click outside to close
	function handleClickOutside(event: MouseEvent): void {
		if (!gridContainer?.contains(event.target as Node)) {
			if (openCategoryId) {
				closeCategory(openCategoryId);
			}
		}
	}
	
	// Helper functions
	function getContrastColor(backgroundColor: string): string {
		// Simple contrast calculation
		const hex = backgroundColor.replace('#', '');
		const r = parseInt(hex.substr(0, 2), 16);
		const g = parseInt(hex.substr(2, 2), 16);
		const b = parseInt(hex.substr(4, 2), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? '#000000' : '#ffffff';
	}
	
	function getCategoryIcon(category: BookmarkCategory): string {
		// Map category icons to appropriate 3D objects/emojis
		const iconMap: Record<string, string> = {
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
		
		return iconMap[category.iconId] || '📁';
	}
	
	onMount(() => {
		if (!browser) return;
		
		initializeCategoryStates();
		
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', handleClickOutside);
		
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
		};
	});
	
	onDestroy(() => {
		if (browser) {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
		}
	});
	
	// Reactive updates
	$: if (dominantColor) {
		colorTransition.set(dominantColor);
	}
	
	$: if (visibleCategories) {
		initializeCategoryStates();
	}
	
	$: textColor = getContrastColor($colorTransition);
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
	"
>
	{#if !hasBookmarksAtAll}
		<!-- Empty state -->
		<div class="empty-state">
			<div class="empty-folder" class:faded={true}>
				<div class="folder-object">
					<div class="folder-face folder-front">📁</div>
					<div class="folder-face folder-top"></div>
					<div class="folder-face folder-right"></div>
				</div>
			</div>
			<p class="empty-message">
				Click the folder above to get started with bookmarks
			</p>
		</div>
	{:else}
		<div class="bookmark-grid">
			{#each visibleCategories as category, index (category.id)}
				{@const state = categoryStates.get(category.id)}
				{@const isEmpty = category.bookmarks.length === 0}
				
				<div 
					class="bookmark-category"
					class:open={state?.isOpen}
					class:animating={state?.animating}
					class:focused={keyboardFocusIndex === index}
				>
					<!-- 3D Folder Object -->
					<div 
						class="bookmark-folder"
						class:hovered={state?.isHovered}
						class:empty={isEmpty}
						tabindex="0"
						role="button"
						aria-label="{category.name} bookmarks"
						aria-expanded={state?.isOpen}
						on:click={(e) => handleCategoryClick(category, e)}
						on:mouseenter={(e) => handleCategoryHover(category, true, e)}
						on:mouseleave={(e) => handleCategoryHover(category, false)}
						on:contextmenu={(e) => handleRightClick(category, e)}
						on:touchstart={(e) => handleTouchStart(category, e)}
						on:touchend={(e) => handleTouchEnd(category, e)}
					>
						<div class="folder-object">
							<div class="folder-face folder-front">
								<span class="folder-icon">{getCategoryIcon(category)}</span>
								<span class="folder-label">{category.name}</span>
							</div>
							<div class="folder-face folder-top"></div>
							<div class="folder-face folder-right"></div>
						</div>
						
						<!-- Breathing glow effect -->
						<div class="folder-glow"></div>
					</div>
					
					<!-- Dropdown Content -->
					{#if state?.isOpen}
						<div 
							class="bookmark-dropdown"
							style="height: {state.dropdownHeight}px"
						>
							<div class="dropdown-content">
								{#each category.bookmarks as bookmark (bookmark.id)}
									<button
										class="bookmark-item"
										on:click={(e) => handleBookmarkClick(bookmark, e)}
									>
										<div class="bookmark-icon">
											{#if bookmark.favicon}
												<img src={bookmark.favicon} alt="" loading="lazy" />
											{:else}
												<span class="bookmark-fallback">🔗</span>
											{/if}
										</div>
										<div class="bookmark-info">
											<span class="bookmark-title">{bookmark.title}</span>
											{#if bookmark.description}
												<span class="bookmark-description">{bookmark.description}</span>
											{/if}
										</div>
									</button>
								{/each}
							</div>
							
							<!-- Collapse button -->
							<button 
								class="collapse-button"
								on:click={() => closeCategory(category.id)}
								aria-label="Collapse {category.name}"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="18,15 12,9 6,15"></polyline>
								</svg>
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	
	<!-- Quick add button (always visible) -->
	<button 
		class="quick-add-button"
		on:click={() => dispatch('openSettings', { section: 'bookmarks' })}
		aria-label="Add new bookmark category"
		title="Add bookmarks"
	>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
	</button>
</div>

<!-- Toast notification for empty bookmarks -->
{#if showEmptyToast}
	<NotificationToast 
		message="You have no bookmarks yet. Import some or add them here!"
		type="info"
		duration={2000}
		on:close={() => showEmptyToast = false}
	/>
{/if}

<style>
	.bookmark-grid-container {
		position: relative;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 20px;
	}
	
	.bookmark-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(var(--min-column-width), 1fr));
		gap: var(--grid-gap);
		align-items: start;
		justify-content: center;
	}
	
	.bookmark-category {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	
	.bookmark-folder {
		position: relative;
		cursor: pointer;
		perspective: 1000px;
		transform-style: preserve-3d;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		margin-bottom: 10px;
	}
	
	.bookmark-folder:focus {
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
	
	.folder-object {
		position: relative;
		width: calc(80px * var(--folder-size));
		height: calc(60px * var(--folder-size));
		transform-style: preserve-3d;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
		gap: 4px;
		transform: translateZ(calc(15px * var(--folder-size)));
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
		font-size: calc(24px * var(--folder-size));
		line-height: 1;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}
	
	.folder-label {
		font-size: calc(10px * var(--folder-size));
		font-weight: 600;
		color: var(--text-color);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
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
	
	.bookmark-dropdown {
		width: 100%;
		max-width: 300px;
		background: rgba(0, 0, 0, 0.9);
		backdrop-filter: blur(20px);
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--dominant-color) 30%, transparent);
		overflow: hidden;
		transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}
	
	.dropdown-content {
		max-height: calc(100% - 40px);
		overflow-y: auto;
		padding: 8px;
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
	}
	
	.bookmark-item:hover {
		background: color-mix(in srgb, var(--dominant-color) 20%, transparent);
		color: white;
		transform: translateX(4px);
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
	}
	
	.bookmark-description {
		font-size: calc(11px * var(--bookmark-size));
		opacity: 0.7;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.collapse-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 32px;
		background: rgba(255, 255, 255, 0.05);
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.collapse-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
	}
	
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding: 40px;
		text-align: center;
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
	
	.empty-message {
		color: rgba(255, 255, 255, 0.7);
		font-size: 16px;
		max-width: 300px;
		line-height: 1.5;
	}
	
	.quick-add-button {
		position: fixed;
		bottom: 30px;
		right: 30px;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--dominant-color);
		border: none;
		color: var(--text-color);
		cursor: pointer;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.quick-add-button:hover {
		transform: translateY(-2px) scale(1.1);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
	}
	
	.quick-add-button:active {
		transform: translateY(0) scale(0.95);
	}
	
	/* Custom scrollbar for dropdown */
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
	}
	
	@media (max-width: 768px) {
		.bookmark-grid {
			grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
			gap: 16px;
		}
		
		.quick-add-button {
			bottom: 20px;
			right: 20px;
			width: 48px;
			height: 48px;
		}
		
		.bookmark-folder.hovered {
			transform: translateY(-4px) scale(1.02);
		}
	}
</style>
