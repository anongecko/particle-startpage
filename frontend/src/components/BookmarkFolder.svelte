<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, elasticOut, backOut } from 'svelte/easing';
	import { bookmarkStore } from '$stores/bookmarks';
	import { debounce } from '$lib/utils';
	import BookmarkItem from './BookmarkItem.svelte';
	
	export let folder: any;
	export let dominantColor: string = '#ffffff';
	export let isHovered: boolean = false;
	export let isDragging: boolean = false;
	export let index: number = 0;
	
	const dispatch = createEventDispatcher();
	
	let folderElement: HTMLElement;
	let contextMenu: HTMLElement;
	let settingsPanel: HTMLElement;
	let isExpanded = false;
	let isContextMenuOpen = false;
	let showSettings = false;
	let searchQuery = '';
	let contextMenuPosition = { x: 0, y: 0 };
	let filteredBookmarks = [];
	let visibleBookmarks = [];
	let loadedCount = 20;
	let isLoading = false;
	
	// Animation states
	const hoverScale = spring(1, { stiffness: 0.3, damping: 0.8 });
	const hoverLift = spring(0, { stiffness: 0.4, damping: 0.9 });
	const glowIntensity = tweened(0, { duration: 300, easing: cubicOut });
	const rotationX = spring(0, { stiffness: 0.2, damping: 0.7 });
	const rotationY = spring(0, { stiffness: 0.2, damping: 0.7 });
	const expandScale = spring(0, { stiffness: 0.3, damping: 0.8 });
	const expandOpacity = tweened(0, { duration: 400, easing: cubicOut });
	
	// Folder settings
	let folderSettings = {
		layout: 'grid', // 'grid' | 'list'
		sortBy: 'name', // 'name' | 'dateAdded' | 'mostUsed' | 'domain'
		itemSize: 'medium', // 'small' | 'medium' | 'large'
		autoOrganize: false,
		showFavicons: true,
		customName: folder.name || ''
	};
	
	// Category icon mappings with CSS-based 3D objects
	const categoryIcons = {
		work: { type: 'briefcase', primary: '#4A90E2', accent: '#357ABD' },
		social: { type: 'chat', primary: '#F5A623', accent: '#E09615' },
		shopping: { type: 'bag', primary: '#7ED321', accent: '#6DB01C' },
		entertainment: { type: 'play', primary: '#D0021B', accent: '#B8001A' },
		news: { type: 'newspaper', primary: '#9013FE', accent: '#7C0FE0' },
		tools: { type: 'gear', primary: '#50E3C2', accent: '#46D4B0' },
		general: { type: 'star', primary: '#BD10E0', accent: '#A20EC4' },
		finance: { type: 'chart', primary: '#F8E71C', accent: '#E0D119' },
		education: { type: 'book', primary: '#FF6B35', accent: '#E65F30' },
		health: { type: 'heart', primary: '#FF4757', accent: '#E63946' }
	};
	
	$: categoryIcon = categoryIcons[folder.category?.toLowerCase()] || categoryIcons.general;
	$: adaptedColors = adaptColorsToBackground(dominantColor, categoryIcon);
	$: if (searchQuery) {
		filterBookmarks();
	} else {
		filteredBookmarks = folder.bookmarks || [];
	}
	$: visibleBookmarks = filteredBookmarks.slice(0, loadedCount);
	
	const debouncedSearch = debounce(filterBookmarks, 150);
	
	function adaptColorsToBackground(bgColor: string, icon: any) {
		const bgLuminance = getLuminance(bgColor);
		const isDark = bgLuminance < 0.5;
		
		// Ensure high contrast
		const contrastRatio = isDark ? 1.2 : 0.8;
		
		return {
			primary: adjustColorContrast(icon.primary, bgLuminance, contrastRatio),
			accent: adjustColorContrast(icon.accent, bgLuminance, contrastRatio),
			glow: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'
		};
	}
	
	function getLuminance(hex: string): number {
		const rgb = hexToRgb(hex);
		if (!rgb) return 0.5;
		
		const { r, g, b } = rgb;
		const [rs, gs, bs] = [r, g, b].map(c => {
			c = c / 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		});
		
		return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
	}
	
	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	}
	
	function adjustColorContrast(color: string, bgLuminance: number, ratio: number): string {
		const rgb = hexToRgb(color);
		if (!rgb) return color;
		
		const factor = bgLuminance < 0.5 ? ratio : 1 / ratio;
		const { r, g, b } = rgb;
		
		const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
		const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
		const newB = Math.min(255, Math.max(0, Math.round(b * factor)));
		
		return `rgb(${newR}, ${newG}, ${newB})`;
	}
	
	function handleMouseEnter(event: MouseEvent) {
		if (isDragging) return;
		
		isHovered = true;
		hoverScale.set(1.05);
		hoverLift.set(-8);
		glowIntensity.set(0.6);
		
		dispatch('hover', { folder, active: true });
		
		// Subtle 3D tilt based on mouse position
		const rect = folderElement.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const deltaX = (event.clientX - centerX) / rect.width;
		const deltaY = (event.clientY - centerY) / rect.height;
		
		rotationY.set(deltaX * 10);
		rotationX.set(-deltaY * 10);
	}
	
	function handleMouseLeave() {
		isHovered = false;
		hoverScale.set(1);
		hoverLift.set(0);
		glowIntensity.set(0);
		rotationX.set(0);
		rotationY.set(0);
		
		dispatch('hover', { folder, active: false });
	}
	
	function handleMouseMove(event: MouseEvent) {
		if (!isHovered || isDragging) return;
		
		const rect = folderElement.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const deltaX = (event.clientX - centerX) / rect.width;
		const deltaY = (event.clientY - centerY) / rect.height;
		
		rotationY.set(deltaX * 8);
		rotationX.set(-deltaY * 8);
	}
	
	function handleClick(event: MouseEvent) {
		if (isDragging) return;
		
		event.preventDefault();
		toggleExpanded();
		dispatch('interact', { type: 'click', folder });
	}
	
	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		
		contextMenuPosition = {
			x: event.clientX,
			y: event.clientY
		};
		
		isContextMenuOpen = true;
		dispatch('interact', { type: 'contextmenu', folder });
	}
	
	function toggleExpanded() {
		isExpanded = !isExpanded;
		
		if (isExpanded) {
			expandScale.set(1);
			expandOpacity.set(1);
			loadedCount = 20; // Reset pagination
		} else {
			expandScale.set(0);
			expandOpacity.set(0);
			searchQuery = ''; // Clear search when closing
		}
	}
	
	function closeExpanded() {
		isExpanded = false;
		expandScale.set(0);
		expandOpacity.set(0);
		searchQuery = '';
	}
	
	function filterBookmarks() {
		if (!searchQuery.trim()) {
			filteredBookmarks = folder.bookmarks || [];
			return;
		}
		
		const query = searchQuery.toLowerCase();
		filteredBookmarks = (folder.bookmarks || []).filter(bookmark =>
			bookmark.name.toLowerCase().includes(query) ||
			bookmark.url.toLowerCase().includes(query) ||
			bookmark.description?.toLowerCase().includes(query)
		);
	}
	
	function loadMoreBookmarks() {
		if (isLoading || visibleBookmarks.length >= filteredBookmarks.length) return;
		
		isLoading = true;
		setTimeout(() => {
			loadedCount += 20;
			isLoading = false;
		}, 100);
	}
	
	function sortBookmarks(sortBy: string) {
		folderSettings.sortBy = sortBy;
		
		const bookmarks = [...filteredBookmarks];
		switch (sortBy) {
			case 'name':
				bookmarks.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case 'dateAdded':
				bookmarks.sort((a, b) => new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime());
				break;
			case 'mostUsed':
				bookmarks.sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0));
				break;
			case 'domain':
				bookmarks.sort((a, b) => {
					const domainA = new URL(a.url).hostname;
					const domainB = new URL(b.url).hostname;
					return domainA.localeCompare(domainB);
				});
				break;
		}
		
		filteredBookmarks = bookmarks;
	}
	
	function updateFolderSettings() {
		dispatch('settingsUpdate', { folder, settings: folderSettings });
		showSettings = false;
	}
	
	function closeContextMenu() {
		isContextMenuOpen = false;
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (isExpanded) {
				closeExpanded();
			} else if (isContextMenuOpen) {
				closeContextMenu();
			}
		}
	}
	
	onMount(() => {
		if (browser) {
			document.addEventListener('click', closeContextMenu);
			document.addEventListener('keydown', handleKeydown);
		}
	});
	
	onDestroy(() => {
		if (browser) {
			document.removeEventListener('click', closeContextMenu);
			document.removeEventListener('keydown', handleKeydown);
		}
	});
	
	$: if (isHovered) {
		dispatch('hover', { folder, active: true });
	}
</script>

<div 
	class="bookmark-folder"
	class:expanded={isExpanded}
	class:dragging={isDragging}
	bind:this={folderElement}
	on:mouseenter={handleMouseEnter}
	on:mouseleave={handleMouseLeave}
	on:mousemove={handleMouseMove}
	on:click={handleClick}
	on:contextmenu={handleContextMenu}
	role="button"
	tabindex="0"
	on:keydown={(e) => e.key === 'Enter' && handleClick(e)}
	aria-label="Open {folder.name} folder"
	style="
		--primary-color: {adaptedColors.primary};
		--accent-color: {adaptedColors.accent};
		--glow-color: {adaptedColors.glow};
		--hover-scale: {$hoverScale};
		--hover-lift: {$hoverLift}px;
		--glow-intensity: {$glowIntensity};
		--rotation-x: {$rotationX}deg;
		--rotation-y: {$rotationY}deg;
		--folder-index: {index};
	"
>
	<div class="folder-object">
		<div class="object-container">
			{#if categoryIcon.type === 'briefcase'}
				<div class="briefcase">
					<div class="briefcase-body"></div>
					<div class="briefcase-handle"></div>
					<div class="briefcase-lock"></div>
				</div>
			{:else if categoryIcon.type === 'chat'}
				<div class="chat-bubble">
					<div class="bubble-main"></div>
					<div class="bubble-tail"></div>
					<div class="bubble-dots">
						<div class="dot"></div>
						<div class="dot"></div>
						<div class="dot"></div>
					</div>
				</div>
			{:else if categoryIcon.type === 'bag'}
				<div class="shopping-bag">
					<div class="bag-body"></div>
					<div class="bag-handles">
						<div class="handle left"></div>
						<div class="handle right"></div>
					</div>
				</div>
			{:else if categoryIcon.type === 'play'}
				<div class="play-button">
					<div class="play-circle"></div>
					<div class="play-triangle"></div>
				</div>
			{:else if categoryIcon.type === 'newspaper'}
				<div class="newspaper">
					<div class="paper-base"></div>
					<div class="headline"></div>
					<div class="text-lines">
						<div class="line"></div>
						<div class="line"></div>
						<div class="line"></div>
					</div>
				</div>
			{:else if categoryIcon.type === 'gear'}
				<div class="gear">
					<div class="gear-body"></div>
					<div class="gear-teeth"></div>
					<div class="gear-center"></div>
				</div>
			{:else if categoryIcon.type === 'star'}
				<div class="star">
					<div class="star-body"></div>
					<div class="star-inner"></div>
				</div>
			{:else if categoryIcon.type === 'chart'}
				<div class="chart">
					<div class="chart-base"></div>
					<div class="chart-bars">
						<div class="bar short"></div>
						<div class="bar medium"></div>
						<div class="bar tall"></div>
					</div>
				</div>
			{:else if categoryIcon.type === 'book'}
				<div class="book">
					<div class="book-spine"></div>
					<div class="book-pages"></div>
					<div class="book-cover"></div>
				</div>
			{:else if categoryIcon.type === 'heart'}
				<div class="heart">
					<div class="heart-left"></div>
					<div class="heart-right"></div>
					<div class="heart-point"></div>
				</div>
			{/if}
		</div>
		
		<div class="folder-glow"></div>
	</div>
	
	<div class="folder-label">
		{folder.name}
		<div class="bookmark-count">{folder.bookmarks?.length || 0}</div>
	</div>
</div>

<!-- Expanded View -->
{#if isExpanded}
	<div 
		class="folder-expanded"
		style="transform: scale({$expandScale}); opacity: {$expandOpacity}"
		on:click|stopPropagation
	>
		<div class="expanded-header">
			<div class="header-info">
				<h2>{folder.name}</h2>
				<span class="bookmark-count-large">{filteredBookmarks.length} bookmarks</span>
			</div>
			
			<div class="header-controls">
				<div class="search-container">
					<input 
						type="text" 
						placeholder="Search bookmarks..." 
						bind:value={searchQuery}
						on:input={debouncedSearch}
						class="search-input"
					/>
					<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8"/>
						<path d="m21 21-4.35-4.35"/>
					</svg>
				</div>
				
				<button class="settings-button" on:click={() => showSettings = !showSettings}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3"/>
						<path d="m12 1 0 6m0 6 0 6"/>
						<path d="m1 12 6 0m6 0 6 0"/>
					</svg>
				</button>
				
				<button class="close-button" on:click={closeExpanded}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
		</div>
		
		{#if showSettings}
			<div class="folder-settings" bind:this={settingsPanel}>
				<div class="settings-grid">
					<label>
						<span>Layout</span>
						<select bind:value={folderSettings.layout}>
							<option value="grid">Grid</option>
							<option value="list">List</option>
						</select>
					</label>
					
					<label>
						<span>Sort by</span>
						<select bind:value={folderSettings.sortBy} on:change={(e) => sortBookmarks(e.target.value)}>
							<option value="name">Name</option>
							<option value="dateAdded">Date Added</option>
							<option value="mostUsed">Most Used</option>
							<option value="domain">Domain</option>
						</select>
					</label>
					
					<label>
						<span>Item Size</span>
						<select bind:value={folderSettings.itemSize}>
							<option value="small">Small</option>
							<option value="medium">Medium</option>
							<option value="large">Large</option>
						</select>
					</label>
					
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={folderSettings.showFavicons} />
						<span>Show Favicons</span>
					</label>
					
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={folderSettings.autoOrganize} />
						<span>Auto-organize by Domain</span>
					</label>
				</div>
				
				<div class="settings-actions">
					<button class="apply-button" on:click={updateFolderSettings}>Apply Settings</button>
				</div>
			</div>
		{/if}
		
		<div class="bookmarks-container">
			{#if filteredBookmarks.length === 0}
				<div class="empty-state">
					{#if searchQuery}
						<p>No bookmarks match "{searchQuery}"</p>
					{:else}
						<p>This folder is empty</p>
					{/if}
				</div>
			{:else}
				<div 
					class="bookmarks-grid" 
					class:list-view={folderSettings.layout === 'list'}
					class:size-small={folderSettings.itemSize === 'small'}
					class:size-large={folderSettings.itemSize === 'large'}
				>
					{#each visibleBookmarks as bookmark (bookmark.id)}
						<BookmarkItem 
							{bookmark}
							layout={folderSettings.layout}
							size={folderSettings.itemSize}
							showFavicon={folderSettings.showFavicons}
							{dominantColor}
						/>
					{/each}
				</div>
				
				{#if visibleBookmarks.length < filteredBookmarks.length}
					<div class="load-more">
						<button 
							class="load-more-button" 
							on:click={loadMoreBookmarks}
							disabled={isLoading}
						>
							{#if isLoading}
								<span class="spinner"></span>
							{/if}
							Load More ({filteredBookmarks.length - visibleBookmarks.length} remaining)
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<!-- Context Menu -->
{#if isContextMenuOpen}
	<div 
		class="context-menu"
		bind:this={contextMenu}
		style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px"
		on:click|stopPropagation
	>
		<button class="context-item" on:click={() => { toggleExpanded(); closeContextMenu(); }}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
				<circle cx="12" cy="12" r="3"/>
			</svg>
			Open Folder
		</button>
		
		<button class="context-item" on:click={() => { showSettings = true; closeContextMenu(); }}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3"/>
				<path d="m12 1 0 6m0 6 0 6"/>
				<path d="m1 12 6 0m6 0 6 0"/>
			</svg>
			Folder Settings
		</button>
		
		<div class="context-divider"></div>
		
		<button class="context-item edit" on:click={() => { dispatch('edit', folder); closeContextMenu(); }}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
				<path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
			</svg>
			Edit Folder
		</button>
		
		<button class="context-item delete" on:click={() => { dispatch('delete', folder); closeContextMenu(); }}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="m3 6 3 0m0 0a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2m-12 0v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/>
				<line x1="10" y1="11" x2="10" y2="17"/>
				<line x1="14" y1="11" x2="14" y2="17"/>
			</svg>
			Delete Folder
		</button>
	</div>
{/if}

<style>
	.bookmark-folder {
		position: relative;
		cursor: pointer;
		user-select: none;
		transform: 
			scale(var(--hover-scale)) 
			translateY(var(--hover-lift))
			perspective(1000px)
			rotateX(var(--rotation-x))
			rotateY(var(--rotation-y));
		transform-style: preserve-3d;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		animation-delay: calc(var(--folder-index) * 50ms);
		animation: folderAppear 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
	}
	
	@keyframes folderAppear {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	
	.bookmark-folder.dragging {
		opacity: 0.7;
		transform: scale(1.1) rotate(5deg);
		z-index: 1000;
	}
	
	.folder-object {
		position: relative;
		width: 120px;
		height: 120px;
		margin: 0 auto 12px;
		transform-style: preserve-3d;
	}
	
	.object-container {
		position: relative;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
		filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.3));
	}
	
	.folder-glow {
		position: absolute;
		top: -10px;
		left: -10px;
		right: -10px;
		bottom: -10px;
		background: radial-gradient(circle, var(--glow-color) 0%, transparent 70%);
		opacity: var(--glow-intensity);
		border-radius: 50%;
		z-index: -1;
		transition: opacity 0.3s ease;
	}
	
	/* Briefcase */
	.briefcase {
		position: relative;
		width: 80px;
		height: 60px;
		margin: 20px auto;
		transform-style: preserve-3d;
	}
	
	.briefcase-body {
		width: 80px;
		height: 50px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 8px;
		position: relative;
		transform: rotateX(-10deg) rotateY(15deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.briefcase-handle {
		position: absolute;
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
		width: 20px;
		height: 8px;
		background: var(--accent-color);
		border-radius: 4px 4px 0 0;
		border: 2px solid var(--primary-color);
	}
	
	.briefcase-lock {
		position: absolute;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		width: 8px;
		height: 8px;
		background: var(--accent-color);
		border-radius: 2px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}
	
	/* Chat Bubble */
	.chat-bubble {
		position: relative;
		width: 70px;
		height: 70px;
		margin: 15px auto;
		transform-style: preserve-3d;
	}
	
	.bubble-main {
		width: 60px;
		height: 45px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 20px;
		position: relative;
		transform: rotateX(-5deg) rotateY(10deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.bubble-tail {
		position: absolute;
		bottom: -8px;
		left: 15px;
		width: 0;
		height: 0;
		border-left: 10px solid transparent;
		border-right: 10px solid transparent;
		border-top: 12px solid var(--accent-color);
		transform: rotateZ(-20deg);
	}
	
	.bubble-dots {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		gap: 4px;
	}
	
	.dot {
		width: 6px;
		height: 6px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		animation: bubblePulse 1.5s ease-in-out infinite;
	}
	
	.dot:nth-child(2) { animation-delay: 0.2s; }
	.dot:nth-child(3) { animation-delay: 0.4s; }
	
	@keyframes bubblePulse {
		0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
		30% { opacity: 1; transform: scale(1); }
	}
	
	/* Shopping Bag */
	.shopping-bag {
		position: relative;
		width: 70px;
		height: 80px;
		margin: 10px auto;
		transform-style: preserve-3d;
	}
	
	.bag-body {
		width: 60px;
		height: 65px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 0 0 12px 12px;
		position: relative;
		transform: rotateX(-10deg) rotateY(15deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.bag-handles {
		position: absolute;
		top: -5px;
		width: 100%;
		height: 20px;
	}
	
	.handle {
		position: absolute;
		width: 20px;
		height: 20px;
		border: 3px solid var(--accent-color);
		border-bottom: none;
		border-radius: 10px 10px 0 0;
		background: transparent;
	}
	
	.handle.left { left: 10px; }
	.handle.right { right: 10px; }
	
	/* Play Button */
	.play-button {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 10px auto;
		transform-style: preserve-3d;
	}
	
	.play-circle {
		width: 70px;
		height: 70px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 50%;
		position: relative;
		transform: rotateX(-10deg) rotateY(15deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.play-triangle {
		position: absolute;
		top: 50%;
		left: 52%;
		transform: translate(-50%, -50%);
		width: 0;
		height: 0;
		border-left: 16px solid rgba(255, 255, 255, 0.9);
		border-top: 12px solid transparent;
		border-bottom: 12px solid transparent;
	}
	
	/* Newspaper */
	.newspaper {
		position: relative;
		width: 70px;
		height: 85px;
		margin: 5px auto;
		transform-style: preserve-3d;
	}
	
	.paper-base {
		width: 60px;
		height: 75px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 4px;
		position: relative;
		transform: rotateX(-5deg) rotateY(10deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.headline {
		position: absolute;
		top: 8px;
		left: 6px;
		right: 6px;
		height: 12px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 2px;
	}
	
	.text-lines {
		position: absolute;
		top: 25px;
		left: 6px;
		right: 6px;
	}
	
	.line {
		height: 4px;
		background: rgba(255, 255, 255, 0.6);
		border-radius: 1px;
		margin-bottom: 4px;
	}
	
	.line:nth-child(2) { width: 80%; }
	.line:nth-child(3) { width: 90%; }
	
	/* Gear */
	.gear {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 10px auto;
		transform-style: preserve-3d;
		animation: gearSpin 8s linear infinite;
	}
	
	@keyframes gearSpin {
		to { transform: rotateZ(360deg); }
	}
	
	.gear-body {
		width: 60px;
		height: 60px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 50%;
		position: relative;
		margin: 10px auto;
		transform: rotateX(-10deg) rotateY(15deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.gear-teeth {
		position: absolute;
		top: 0;
		left: 0;
		width: 80px;
		height: 80px;
	}
	
	.gear-teeth::before,
	.gear-teeth::after {
		content: '';
		position: absolute;
		width: 12px;
		height: 12px;
		background: var(--accent-color);
		border-radius: 2px;
	}
	
	.gear-teeth::before {
		top: -3px;
		left: 50%;
		transform: translateX(-50%);
	}
	
	.gear-teeth::after {
		bottom: -3px;
		left: 50%;
		transform: translateX(-50%);
	}
	
	.gear-center {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 16px;
		height: 16px;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 50%;
	}
	
	/* Star */
	.star {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 10px auto;
		transform-style: preserve-3d;
	}
	
	.star-body {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) rotateX(-10deg) rotateY(15deg);
		width: 60px;
		height: 60px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.star-inner {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 20px;
		height: 20px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 50%;
	}
	
	/* Chart */
	.chart {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 10px auto;
		transform-style: preserve-3d;
	}
	
	.chart-base {
		width: 70px;
		height: 60px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 8px;
		position: relative;
		margin-top: 15px;
		transform: rotateX(-10deg) rotateY(15deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.chart-bars {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		align-items: flex-end;
	}
	
	.bar {
		width: 8px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 2px 2px 0 0;
	}
	
	.bar.short { height: 12px; }
	.bar.medium { height: 20px; }
	.bar.tall { height: 28px; }
	
	/* Book */
	.book {
		position: relative;
		width: 70px;
		height: 85px;
		margin: 5px auto;
		transform-style: preserve-3d;
	}
	
	.book-spine {
		width: 8px;
		height: 75px;
		background: var(--accent-color);
		position: absolute;
		left: 0;
		transform: rotateY(-15deg);
		border-radius: 0 2px 2px 0;
	}
	
	.book-cover {
		width: 55px;
		height: 75px;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 0 4px 4px 0;
		position: relative;
		margin-left: 8px;
		transform: rotateX(-5deg) rotateY(10deg);
		box-shadow: 
			inset 0 2px 8px rgba(255, 255, 255, 0.2),
			0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.book-pages {
		position: absolute;
		right: 2px;
		top: 3px;
		bottom: 3px;
		width: 3px;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 0 2px 2px 0;
	}
	
	/* Heart */
	.heart {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 10px auto;
		transform-style: preserve-3d;
		animation: heartBeat 2s ease-in-out infinite;
	}
	
	@keyframes heartBeat {
		0%, 70%, 100% { transform: scale(1) rotateX(-10deg) rotateY(15deg); }
		15%, 30% { transform: scale(1.1) rotateX(-10deg) rotateY(15deg); }
	}
	
	.heart-left,
	.heart-right {
		width: 26px;
		height: 40px;
		position: absolute;
		left: 50%;
		transform-origin: 0 100%;
		background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
		border-radius: 26px 26px 0 0;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}
	
	.heart-left {
		transform: translateX(-50%) rotate(-45deg);
	}
	
	.heart-right {
		transform: translateX(-50%) rotate(45deg);
	}
	
	.heart-point {
		position: absolute;
		top: 35px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 18px solid transparent;
		border-right: 18px solid transparent;
		border-top: 15px solid var(--accent-color);
	}
	
	.folder-label {
		text-align: center;
		color: rgba(255, 255, 255, 0.9);
		font-size: 14px;
		font-weight: 500;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	
	.bookmark-count {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.1);
		padding: 2px 8px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	/* Expanded View */
	.folder-expanded {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 90vw;
		height: 80vh;
		max-width: 1000px;
		max-height: 700px;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 24px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		box-shadow: 0 32px 64px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	
	.expanded-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px 32px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.header-info h2 {
		margin: 0;
		font-size: 24px;
		font-weight: 600;
		color: white;
	}
	
	.bookmark-count-large {
		font-size: 14px;
		color: rgba(255, 255, 255, 0.7);
	}
	
	.header-controls {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	
	.search-container {
		position: relative;
	}
	
	.search-input {
		padding: 8px 16px 8px 40px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
		width: 250px;
		transition: all 0.3s ease;
	}
	
	.search-input:focus {
		outline: none;
		border-color: rgba(255, 255, 255, 0.4);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
	}
	
	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}
	
	.search-icon {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: rgba(255, 255, 255, 0.5);
	}
	
	.settings-button,
	.close-button {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.8);
		width: 40px;
		height: 40px;
		border-radius: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
	}
	
	.settings-button:hover,
	.close-button:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}
	
	.folder-settings {
		padding: 20px 32px;
		background: rgba(255, 255, 255, 0.05);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
		margin-bottom: 16px;
	}
	
	.settings-grid label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.9);
	}
	
	.checkbox-label {
		flex-direction: row !important;
		align-items: center;
	}
	
	.checkbox-label input {
		margin-right: 8px;
		width: 16px;
		height: 16px;
		accent-color: var(--primary-color);
	}
	
	.settings-grid select {
		padding: 8px 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
	}
	
	.settings-actions {
		text-align: right;
	}
	
	.apply-button {
		background: var(--primary-color);
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.apply-button:hover {
		background: var(--accent-color);
	}
	
	.bookmarks-container {
		flex: 1;
		padding: 24px 32px;
		overflow-y: auto;
	}
	
	.empty-state {
		text-align: center;
		padding: 60px 20px;
		color: rgba(255, 255, 255, 0.6);
		font-size: 16px;
	}
	
	.bookmarks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 16px;
	}
	
	.bookmarks-grid.list-view {
		grid-template-columns: 1fr;
		gap: 8px;
	}
	
	.bookmarks-grid.size-small {
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 12px;
	}
	
	.bookmarks-grid.size-large {
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 20px;
	}
	
	.load-more {
		text-align: center;
		margin-top: 24px;
	}
	
	.load-more-button {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.8);
		padding: 12px 24px;
		border-radius: 12px;
		cursor: pointer;
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 auto;
		transition: all 0.3s ease;
	}
	
	.load-more-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}
	
	.load-more-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	/* Context Menu */
	.context-menu {
		position: fixed;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 8px 0;
		min-width: 160px;
		z-index: 2000;
		box-shadow: 0 16px 32px rgba(0, 0, 0, 0.4);
		animation: contextMenuAppear 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	@keyframes contextMenuAppear {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
	
	.context-item {
		width: 100%;
		padding: 8px 16px;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.8);
		font-size: 14px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: all 0.2s ease;
		text-align: left;
	}
	
	.context-item:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}
	
	.context-item.edit:hover {
		background: rgba(33, 150, 243, 0.2);
		color: #2196f3;
	}
	
	.context-item.delete:hover {
		background: rgba(244, 67, 54, 0.2);
		color: #f44336;
	}
	
	.context-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 4px 0;
	}
	
	@media (max-width: 768px) {
		.folder-expanded {
			width: 95vw;
			height: 85vh;
		}
		
		.expanded-header {
			padding: 16px 20px;
			flex-direction: column;
			gap: 16px;
			align-items: stretch;
		}
		
		.header-controls {
			flex-direction: column;
			gap: 12px;
		}
		
		.search-input {
			width: 100%;
		}
		
		.bookmarks-container {
			padding: 16px 20px;
		}
		
		.bookmarks-grid {
			grid-template-columns: 1fr;
		}
		
		.folder-settings {
			padding: 16px 20px;
		}
		
		.settings-grid {
			grid-template-columns: 1fr;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.bookmark-folder,
		.folder-object,
		.gear,
		.heart {
			animation: none !important;
		}
		
		.bookmark-folder:hover {
			transform: scale(1.02);
		}
	}
</style>
