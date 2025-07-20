<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, backOut } from 'svelte/easing';
	import { bookmarkStore } from '$stores/bookmarks';
	import { debounce } from '$lib/utils';
	
	export let bookmark: any;
	export let layout: 'grid' | 'list' | 'icon' = 'grid';
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let showFavicon: boolean = true;
	export let showTitle: boolean = true;
	export let dominantColor: string = '#ffffff';
	export let isDragging: boolean = false;
	export let dragIndex: number = -1;
	export let index: number = 0;
	
	const dispatch = createEventDispatcher();
	
	let itemElement: HTMLElement;
	let contextMenu: HTMLElement;
	let editDialog: HTMLElement;
	let fileInput: HTMLInputElement;
	let isHovered = false;
	let isContextMenuOpen = false;
	let showEditDialog = false;
	let isLoading = false;
	let faviconError = false;
	let contextMenuPosition = { x: 0, y: 0 };
	let customIconUrl = '';
	let editForm = {
		name: bookmark.name || '',
		url: bookmark.url || '',
		customIcon: bookmark.customIcon || '',
		useCustomIcon: !!bookmark.customIcon
	};
	
	// Animation states
	const hoverScale = spring(1, { stiffness: 0.4, damping: 0.8 });
	const hoverLift = spring(0, { stiffness: 0.3, damping: 0.9 });
	const dragScale = tweened(1, { duration: 200, easing: cubicOut });
	const dragOpacity = tweened(1, { duration: 200, easing: cubicOut });
	const editDialogScale = spring(0.8, { stiffness: 0.3, damping: 0.8 });
	const editDialogOpacity = tweened(0, { duration: 300, easing: cubicOut });
	
	// Favicon cache
	let faviconCache = new Map();
	let faviconUrl = '';
	
	// Size configurations
	const sizeConfig = {
		small: { icon: 24, spacing: 8, fontSize: '11px', padding: '8px' },
		medium: { icon: 32, spacing: 12, fontSize: '12px', padding: '12px' },
		large: { icon: 40, spacing: 16, fontSize: '14px', padding: '16px' }
	};
	
	$: config = sizeConfig[size];
	$: adaptedColors = adaptColorsToBackground(dominantColor);
	$: if (bookmark.customIcon) {
		faviconUrl = bookmark.customIcon;
		faviconError = false;
	} else {
		loadFavicon();
	}
	
	function adaptColorsToBackground(bgColor: string) {
		const bgLuminance = getLuminance(bgColor);
		const isDark = bgLuminance < 0.5;
		
		return {
			text: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
			textSecondary: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
			background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
			backgroundHover: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
			border: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
			shadow: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)'
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
	
	async function loadFavicon() {
		if (!bookmark.url) return;
		
		try {
			const domain = new URL(bookmark.url).hostname;
			const cacheKey = `favicon_${domain}`;
			
			// Check cache first
			if (faviconCache.has(cacheKey)) {
				faviconUrl = faviconCache.get(cacheKey);
				return;
			}
			
			// Try multiple favicon sources
			const faviconSources = [
				`https://icons.duckduckgo.com/ip3/${domain}.ico`,
				`https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
				`https://${domain}/favicon.ico`,
				`https://${domain}/apple-touch-icon.png`
			];
			
			for (const source of faviconSources) {
				try {
					await testImageUrl(source);
					faviconUrl = source;
					faviconCache.set(cacheKey, source);
					faviconError = false;
					return;
				} catch {
					continue;
				}
			}
			
			// If all fail, use fallback
			faviconError = true;
		} catch (error) {
			faviconError = true;
		}
	}
	
	function testImageUrl(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve();
			img.onerror = () => reject();
			img.src = url;
		});
	}
	
	function handleMouseEnter() {
		if (isDragging) return;
		
		isHovered = true;
		hoverScale.set(1.1);
		hoverLift.set(-2);
		
		dispatch('hover', { bookmark, active: true });
	}
	
	function handleMouseLeave() {
		isHovered = false;
		hoverScale.set(1);
		hoverLift.set(0);
		
		dispatch('hover', { bookmark, active: false });
	}
	
	function handleClick(event: MouseEvent) {
		if (isDragging || event.detail === 2) return; // Ignore if dragging or double-click
		
		event.preventDefault();
		window.open(bookmark.url, '_self');
		
		dispatch('click', { bookmark, event });
		dispatch('interact', { type: 'click', bookmark });
	}
	
	function handleDoubleClick(event: MouseEvent) {
		if (isDragging) return;
		
		event.preventDefault();
		window.open(bookmark.url, '_blank');
		
		dispatch('doubleClick', { bookmark, event });
		dispatch('interact', { type: 'doubleClick', bookmark });
	}
	
	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		
		contextMenuPosition = {
			x: event.clientX,
			y: event.clientY
		};
		
		isContextMenuOpen = true;
		dispatch('contextMenu', { bookmark, position: contextMenuPosition });
		dispatch('interact', { type: 'contextMenu', bookmark });
	}
	
	function handleDragStart(event: DragEvent) {
		if (!event.dataTransfer) return;
		
		isDragging = true;
		dragScale.set(0.95);
		dragOpacity.set(0.7);
		
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', JSON.stringify({
			type: 'bookmark',
			bookmark,
			sourceIndex: index
		}));
		
		dispatch('dragStart', { bookmark, index, event });
	}
	
	function handleDragEnd(event: DragEvent) {
		isDragging = false;
		dragScale.set(1);
		dragOpacity.set(1);
		
		dispatch('dragEnd', { bookmark, index, event });
	}
	
	function handleDragOver(event: DragEvent) {
		if (!event.dataTransfer) return;
		
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		
		dispatch('dragOver', { bookmark, index, event });
	}
	
	function handleDrop(event: DragEvent) {
		if (!event.dataTransfer) return;
		
		event.preventDefault();
		
		try {
			const dragData = JSON.parse(event.dataTransfer.getData('text/plain'));
			if (dragData.type === 'bookmark') {
				dispatch('drop', {
					sourceBookmark: dragData.bookmark,
					sourceIndex: dragData.sourceIndex,
					targetBookmark: bookmark,
					targetIndex: index,
					event
				});
			}
		} catch (error) {
			console.warn('Invalid drag data:', error);
		}
	}
	
	function openEditDialog() {
		editForm = {
			name: bookmark.name || '',
			url: bookmark.url || '',
			customIcon: bookmark.customIcon || '',
			useCustomIcon: !!bookmark.customIcon
		};
		
		showEditDialog = true;
		editDialogScale.set(1);
		editDialogOpacity.set(1);
		closeContextMenu();
	}
	
	function closeEditDialog() {
		editDialogScale.set(0.8);
		editDialogOpacity.set(0);
		setTimeout(() => {
			showEditDialog = false;
		}, 300);
	}
	
	async function saveChanges() {
		if (!editForm.name.trim() || !editForm.url.trim()) return;
		
		isLoading = true;
		
		try {
			const updatedBookmark = {
				...bookmark,
				name: editForm.name.trim(),
				url: editForm.url.trim(),
				customIcon: editForm.useCustomIcon ? editForm.customIcon : null
			};
			
			await bookmarkStore.updateBookmark(bookmark.id, updatedBookmark);
			
			// Update local bookmark data
			Object.assign(bookmark, updatedBookmark);
			
			dispatch('update', { bookmark: updatedBookmark });
			closeEditDialog();
		} catch (error) {
			console.error('Failed to save bookmark changes:', error);
		} finally {
			isLoading = false;
		}
	}
	
	function handleCustomIconUpload(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		
		if (!file.type.startsWith('image/')) {
			alert('Please select a valid image file');
			return;
		}
		
		if (file.size > 2 * 1024 * 1024) { // 2MB limit
			alert('Image file too large. Please select a file under 2MB');
			return;
		}
		
		const reader = new FileReader();
		reader.onload = (e) => {
			editForm.customIcon = e.target?.result as string;
			editForm.useCustomIcon = true;
		};
		reader.readAsDataURL(file);
	}
	
	function copyBookmarkUrl() {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(bookmark.url);
		} else {
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = bookmark.url;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
		}
		
		closeContextMenu();
		dispatch('interact', { type: 'copy', bookmark });
	}
	
	function deleteBookmark() {
		if (confirm(`Are you sure you want to delete "${bookmark.name}"?`)) {
			bookmarkStore.deleteBookmark(bookmark.id);
			dispatch('delete', { bookmark });
		}
		closeContextMenu();
	}
	
	function openInNewTab() {
		window.open(bookmark.url, '_blank');
		closeContextMenu();
		dispatch('interact', { type: 'openNewTab', bookmark });
	}
	
	function closeContextMenu() {
		isContextMenuOpen = false;
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (showEditDialog) {
				closeEditDialog();
			} else if (isContextMenuOpen) {
				closeContextMenu();
			}
		} else if (event.key === 'Enter' && showEditDialog) {
			saveChanges();
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
</script>

<div
	class="bookmark-item"
	class:layout-grid={layout === 'grid'}
	class:layout-list={layout === 'list'}
	class:layout-icon={layout === 'icon'}
	class:size-small={size === 'small'}
	class:size-medium={size === 'medium'}
	class:size-large={size === 'large'}
	class:dragging={isDragging}
	class:hovered={isHovered}
	bind:this={itemElement}
	on:mouseenter={handleMouseEnter}
	on:mouseleave={handleMouseLeave}
	on:click={handleClick}
	on:dblclick={handleDoubleClick}
	on:contextmenu={handleContextMenu}
	draggable="true"
	on:dragstart={handleDragStart}
	on:dragend={handleDragEnd}
	on:dragover={handleDragOver}
	on:drop={handleDrop}
	role="button"
	tabindex="0"
	on:keydown={(e) => e.key === 'Enter' && handleClick(e)}
	aria-label="Bookmark: {bookmark.name}"
	style="
		--text-color: {adaptedColors.text};
		--text-secondary: {adaptedColors.textSecondary};
		--bg-color: {adaptedColors.background};
		--bg-hover: {adaptedColors.backgroundHover};
		--border-color: {adaptedColors.border};
		--shadow-color: {adaptedColors.shadow};
		--icon-size: {config.icon}px;
		--spacing: {config.spacing}px;
		--font-size: {config.fontSize};
		--padding: {config.padding};
		--hover-scale: {$hoverScale};
		--hover-lift: {$hoverLift}px;
		--drag-scale: {$dragScale};
		--drag-opacity: {$dragOpacity};
	"
>
	<div class="bookmark-content">
		{#if showFavicon}
			<div class="favicon-container">
				{#if faviconError && !bookmark.customIcon}
					<div class="favicon-fallback">
						{bookmark.name?.charAt(0)?.toUpperCase() || '?'}
					</div>
				{:else}
					<img
						src={faviconUrl}
						alt=""
						class="favicon"
						on:error={() => faviconError = true}
						loading="lazy"
					/>
				{/if}
			</div>
		{/if}
		
		{#if showTitle && (layout === 'grid' || layout === 'list')}
			<div class="bookmark-title">
				{bookmark.name}
			</div>
		{/if}
		
		{#if layout === 'list'}
			<div class="bookmark-url">
				{new URL(bookmark.url).hostname}
			</div>
		{/if}
	</div>
</div>

<!-- Context Menu -->
{#if isContextMenuOpen}
	<div
		class="context-menu"
		bind:this={contextMenu}
		style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px"
		on:click|stopPropagation
	>
		<button class="context-item" on:click={openInNewTab}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
				<polyline points="15,3 21,3 21,9"/>
				<line x1="10" y1="14" x2="21" y2="3"/>
			</svg>
			Open in New Tab
		</button>
		
		<button class="context-item" on:click={copyBookmarkUrl}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
				<path d="m4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"/>
			</svg>
			Copy URL
		</button>
		
		<div class="context-divider"></div>
		
		<button class="context-item edit" on:click={openEditDialog}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
				<path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
			</svg>
			Edit Bookmark
		</button>
		
		<button class="context-item duplicate" on:click={() => { dispatch('duplicate', bookmark); closeContextMenu(); }}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
				<path d="m4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"/>
			</svg>
			Duplicate
		</button>
		
		<div class="context-divider"></div>
		
		<button class="context-item delete" on:click={deleteBookmark}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="m3 6 3 0m0 0a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2m-12 0v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/>
				<line x1="10" y1="11" x2="10" y2="17"/>
				<line x1="14" y1="11" x2="14" y2="17"/>
			</svg>
			Delete
		</button>
	</div>
{/if}

<!-- Edit Dialog -->
{#if showEditDialog}
	<div
		class="edit-modal"
		style="opacity: {$editDialogOpacity}"
		on:click={closeEditDialog}
	>
		<div
			class="edit-dialog"
			bind:this={editDialog}
			style="transform: scale({$editDialogScale})"
			on:click|stopPropagation
		>
			<div class="dialog-header">
				<h3>Edit Bookmark</h3>
				<button class="close-button" on:click={closeEditDialog}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			
			<div class="dialog-content">
				<div class="form-group">
					<label for="bookmark-name">Name</label>
					<input
						id="bookmark-name"
						type="text"
						bind:value={editForm.name}
						placeholder="Bookmark name"
						class="form-input"
					/>
				</div>
				
				<div class="form-group">
					<label for="bookmark-url">URL</label>
					<input
						id="bookmark-url"
						type="url"
						bind:value={editForm.url}
						placeholder="https://example.com"
						class="form-input"
					/>
				</div>
				
				<div class="form-group">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={editForm.useCustomIcon} />
						<span>Use custom icon</span>
					</label>
				</div>
				
				{#if editForm.useCustomIcon}
					<div class="custom-icon-section">
						<div class="icon-preview">
							{#if editForm.customIcon}
								<img src={editForm.customIcon} alt="Custom icon" class="preview-image" />
							{:else}
								<div class="preview-placeholder">No icon</div>
							{/if}
						</div>
						
						<div class="icon-inputs">
							<div class="form-group">
								<label for="icon-url">Icon URL</label>
								<input
									id="icon-url"
									type="url"
									bind:value={editForm.customIcon}
									placeholder="https://example.com/icon.png"
									class="form-input"
								/>
							</div>
							
							<div class="upload-section">
								<label class="upload-label">
									Or upload file
									<input
										type="file"
										accept="image/*"
										bind:this={fileInput}
										on:change={handleCustomIconUpload}
										class="file-input"
									/>
								</label>
							</div>
						</div>
					</div>
				{/if}
			</div>
			
			<div class="dialog-actions">
				<button class="cancel-button" on:click={closeEditDialog}>Cancel</button>
				<button
					class="save-button"
					class:loading={isLoading}
					on:click={saveChanges}
					disabled={isLoading || !editForm.name.trim() || !editForm.url.trim()}
				>
					{#if isLoading}
						<span class="spinner"></span>
					{/if}
					Save Changes
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.bookmark-item {
		position: relative;
		cursor: pointer;
		user-select: none;
		border-radius: 12px;
		border: 1px solid var(--border-color);
		background: var(--bg-color);
		backdrop-filter: blur(10px);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		transform: 
			scale(var(--hover-scale, 1))
			translateY(var(--hover-lift, 0px))
			scale(var(--drag-scale, 1));
		opacity: var(--drag-opacity, 1);
		overflow: hidden;
	}
	
	.bookmark-item:hover {
		background: var(--bg-hover);
		border-color: var(--text-secondary);
		box-shadow: 0 8px 24px var(--shadow-color);
	}
	
	.bookmark-item.dragging {
		z-index: 1000;
		box-shadow: 0 16px 32px rgba(0, 0, 0, 0.4);
		transform: rotate(2deg);
	}
	
	/* Layout: Grid */
	.bookmark-item.layout-grid {
		padding: var(--padding);
		min-height: 80px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	
	.bookmark-item.layout-grid .bookmark-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing);
		width: 100%;
	}
	
	/* Layout: List */
	.bookmark-item.layout-list {
		padding: calc(var(--padding) / 2) var(--padding);
		display: flex;
		align-items: center;
	}
	
	.bookmark-item.layout-list .bookmark-content {
		display: flex;
		align-items: center;
		gap: var(--spacing);
		width: 100%;
		min-height: calc(var(--icon-size) + 4px);
	}
	
	.bookmark-item.layout-list .bookmark-title {
		flex: 1;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.bookmark-item.layout-list .bookmark-url {
		color: var(--text-secondary);
		font-size: calc(var(--font-size) - 1px);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}
	
	/* Layout: Icon */
	.bookmark-item.layout-icon {
		padding: calc(var(--padding) / 2);
		width: calc(var(--icon-size) + var(--padding));
		height: calc(var(--icon-size) + var(--padding));
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.bookmark-item.layout-icon .bookmark-content {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.bookmark-item.layout-icon .bookmark-title {
		display: none;
	}
	
	/* Favicon */
	.favicon-container {
		position: relative;
		width: var(--icon-size);
		height: var(--icon-size);
		flex-shrink: 0;
	}
	
	.favicon {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 6px;
		background: var(--bg-color);
		border: 1px solid var(--border-color);
	}
	
	.favicon-fallback {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--text-color), var(--text-secondary));
		color: white;
		font-weight: 600;
		font-size: calc(var(--icon-size) * 0.4);
		border-radius: 6px;
		text-transform: uppercase;
	}
	
	/* Title */
	.bookmark-title {
		color: var(--text-color);
		font-size: var(--font-size);
		font-weight: 500;
		line-height: 1.3;
		word-break: break-word;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	
	.bookmark-item.layout-grid .bookmark-title {
		max-width: 100%;
		text-align: center;
	}
	
	/* Size variations */
	.bookmark-item.size-small .bookmark-title {
		-webkit-line-clamp: 1;
	}
	
	.bookmark-item.size-large .bookmark-title {
		-webkit-line-clamp: 3;
	}
	
	/* Context Menu */
	.context-menu {
		position: fixed;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 8px 0;
		min-width: 180px;
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
	
	.context-item.duplicate:hover {
		background: rgba(156, 39, 176, 0.2);
		color: #9c27b0;
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
	
	/* Edit Dialog */
	.edit-modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 3000;
		backdrop-filter: blur(4px);
	}
	
	.edit-dialog {
		width: 90vw;
		max-width: 500px;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		box-shadow: 0 32px 64px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}
	
	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.dialog-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: white;
	}
	
	.close-button {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.close-button:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}
	
	.dialog-content {
		padding: 24px;
		max-height: 400px;
		overflow-y: auto;
	}
	
	.form-group {
		margin-bottom: 16px;
	}
	
	.form-group label {
		display: block;
		margin-bottom: 6px;
		font-size: 14px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
	}
	
	.checkbox-label {
		display: flex !important;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	
	.checkbox-label input {
		width: 16px;
		height: 16px;
		accent-color: #4caf50;
	}
	
	.form-input {
		width: 100%;
		padding: 12px 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
		transition: all 0.3s ease;
	}
	
	.form-input:focus {
		outline: none;
		border-color: rgba(255, 255, 255, 0.4);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
	}
	
	.form-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}
	
	.custom-icon-section {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		padding: 16px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.icon-preview {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
	}
	
	.preview-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	
	.preview-placeholder {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}
	
	.icon-inputs {
		flex: 1;
	}
	
	.upload-section {
		margin-top: 12px;
	}
	
	.upload-label {
		display: inline-block;
		padding: 8px 16px;
		background: rgba(33, 150, 243, 0.2);
		color: #2196f3;
		border: 1px solid rgba(33, 150, 243, 0.3);
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.3s ease;
	}
	
	.upload-label:hover {
		background: rgba(33, 150, 243, 0.3);
	}
	
	.file-input {
		display: none;
	}
	
	.dialog-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		padding: 20px 24px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.cancel-button,
	.save-button {
		padding: 10px 20px;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	
	.cancel-button {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	.cancel-button:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}
	
	.save-button {
		background: #4caf50;
		color: white;
	}
	
	.save-button:hover:not(:disabled) {
		background: #45a049;
	}
	
	.save-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	
	.save-button.loading {
		pointer-events: none;
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
	
	@media (max-width: 768px) {
		.edit-dialog {
			width: 95vw;
			max-height: 85vh;
		}
		
		.dialog-content {
			max-height: none;
		}
		
		.custom-icon-section {
			flex-direction: column;
		}
		
		.bookmark-item.layout-list .bookmark-url {
			display: none;
		}
		
		.context-menu {
			min-width: 160px;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.bookmark-item {
			transition: none !important;
			animation: none !important;
		}
		
		.bookmark-item:hover {
			transform: scale(1.02);
		}
	}
</style>
