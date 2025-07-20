<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	
	import type { BookmarkCategory } from '$stores/bookmarks';
	import { bookmarkStore } from '$stores/bookmarks';
	import { settings } from '$stores/settings';
	import { colorStore } from '$stores/color';
	import { Object3DRegistry } from '$lib/objects3d';
	
	// Props
	export let category: BookmarkCategory;
	export let position: { x: number; y: number };
	export let visible: boolean = false;
	
	// Component state
	let menuElement: HTMLElement;
	let isClosing = false;
	let selectedIndex = 0;
	let recentObjects: Array<{ id: string; name: string; category: string; lastUsed: number }> = [];
	let longPressTimer: NodeJS.Timeout | null = null;
	let touchStartTime = 0;
	
	// Menu configuration
	const RECENT_OBJECTS_LIMIT = 6;
	const LONG_PRESS_DURATION = 500;
	const MIN_WIDTH = 200;
	const MAX_WIDTH = 320;
	
	// Menu items
	const menuItems = [
		{
			id: 'change-object',
			label: 'Change Object',
			icon: '🔄',
			description: 'Browse all 3D objects',
			action: 'change-object'
		},
		{
			id: 'edit-name',
			label: 'Edit Name',
			icon: '✏️',
			description: 'Rename this folder',
			action: 'edit-name'
		}
	];
	
	const dispatch = createEventDispatcher();
	
	// Reactive computations
	$: currentSettings = get(settings);
	$: colorPalette = get(colorStore);
	$: modalBackgroundColor = colorPalette.darkest || '#1a1a1a';
	$: menuBackgroundColor = lightenColor(modalBackgroundColor, 0.15);
	$: menuBorderColor = colorPalette.accent || colorPalette.current || '#4a90e2';
	$: menuTextColor = getContrastColor(menuBackgroundColor);
	$: adjustedPosition = calculatePosition(position);
	$: totalMenuItems = menuItems.length + (recentObjects.length > 0 ? 1 : 0); // +1 for recent objects section
	
	// Initialize component
	onMount(async () => {
		if (!browser) return;
		
		try {
			// Load recent objects
			await loadRecentObjects();
			
			// Setup event listeners
			setupEventListeners();
			
			// Set initial focus
			await tick();
			if (menuElement) {
				menuElement.focus();
			}
			
			console.log('ContextMenu initialized for category:', category.name);
			
		} catch (error) {
			console.error('ContextMenu initialization failed:', error);
		}
	});
	
	onDestroy(() => {
		cleanup();
	});
	
	// Load recently used objects
	async function loadRecentObjects(): Promise<void> {
		try {
			// Get recent object usage from store
			const recentData = await bookmarkStore.getRecentObjects?.(RECENT_OBJECTS_LIMIT) || [];
			
			// Filter out current object and validate objects exist
			recentObjects = recentData
				.filter(obj => obj.id !== category.objectId)
				.filter(obj => Object3DRegistry.getObject(obj.id) !== null)
				.slice(0, RECENT_OBJECTS_LIMIT);
				
		} catch (error) {
			console.warn('Failed to load recent objects:', error);
			recentObjects = [];
		}
	}
	
	// Event listeners setup
	function setupEventListeners(): void {
		if (!browser) return;
		
		// Keyboard navigation
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!visible) return;
			
			switch (event.key) {
				case 'ArrowUp':
					event.preventDefault();
					navigateUp();
					break;
					
				case 'ArrowDown':
					event.preventDefault();
					navigateDown();
					break;
					
				case 'Enter':
				case ' ':
					event.preventDefault();
					selectCurrentItem();
					break;
					
				case 'Escape':
					event.preventDefault();
					closeMenu();
					break;
			}
		};
		
		// Click outside handler
		const handleClickOutside = (event: MouseEvent) => {
			if (visible && menuElement && !menuElement.contains(event.target as Node)) {
				closeMenu();
			}
		};
		
		// Touch handlers for mobile
		const handleTouchStart = (event: TouchEvent) => {
			touchStartTime = Date.now();
			
			// Clear any existing timer
			if (longPressTimer) {
				clearTimeout(longPressTimer);
			}
			
			// Set long press timer
			longPressTimer = setTimeout(() => {
				if (visible) {
					// Haptic feedback if available
					if (navigator.vibrate) {
						navigator.vibrate(50);
					}
				}
			}, LONG_PRESS_DURATION);
		};
		
		const handleTouchEnd = (event: TouchEvent) => {
			const touchDuration = Date.now() - touchStartTime;
			
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
			
			// If it was a quick tap and menu is visible, handle as click
			if (touchDuration < LONG_PRESS_DURATION && visible) {
				// Let the click handler deal with it
				return;
			}
		};
		
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('touchstart', handleTouchStart);
		document.addEventListener('touchend', handleTouchEnd);
		
		// Cleanup function
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('touchstart', handleTouchStart);
			document.removeEventListener('touchend', handleTouchEnd);
		};
	}
	
	// Navigation functions
	function navigateUp(): void {
		const maxIndex = getTotalSelectableItems() - 1;
		selectedIndex = selectedIndex <= 0 ? maxIndex : selectedIndex - 1;
		updateVisualFocus();
	}
	
	function navigateDown(): void {
		const maxIndex = getTotalSelectableItems() - 1;
		selectedIndex = selectedIndex >= maxIndex ? 0 : selectedIndex + 1;
		updateVisualFocus();
	}
	
	function getTotalSelectableItems(): number {
		return recentObjects.length + menuItems.length;
	}
	
	function updateVisualFocus(): void {
		// Update visual focus indicator
		const items = menuElement?.querySelectorAll('.menu-item, .recent-object');
		if (items) {
			items.forEach((item, index) => {
				item.classList.toggle('keyboard-focus', index === selectedIndex);
			});
		}
	}
	
	function selectCurrentItem(): void {
		if (selectedIndex < recentObjects.length) {
			// Select recent object
			const recentObject = recentObjects[selectedIndex];
			handleRecentObjectSelect(recentObject);
		} else {
			// Select menu item
			const menuItemIndex = selectedIndex - recentObjects.length;
			const menuItem = menuItems[menuItemIndex];
			if (menuItem) {
				handleMenuItemClick(menuItem);
			}
		}
	}
	
	// Position calculation with smart positioning
	function calculatePosition(pos: { x: number; y: number }): { x: number; y: number; origin: string } {
		if (!browser) return { x: pos.x, y: pos.y, origin: 'top-left' };
		
		const padding = 10;
		const estimatedWidth = MAX_WIDTH;
		const estimatedHeight = 200; // Rough estimate
		
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		
		let x = pos.x;
		let y = pos.y;
		let origin = 'top-left';
		
		// Horizontal positioning
		if (x + estimatedWidth + padding > viewportWidth) {
			x = pos.x - estimatedWidth;
			origin = origin.replace('left', 'right');
		}
		
		// Vertical positioning
		if (y + estimatedHeight + padding > viewportHeight) {
			y = pos.y - estimatedHeight;
			origin = origin.replace('top', 'bottom');
		}
		
		// Ensure it doesn't go off screen
		x = Math.max(padding, Math.min(x, viewportWidth - estimatedWidth - padding));
		y = Math.max(padding, Math.min(y, viewportHeight - estimatedHeight - padding));
		
		return { x, y, origin };
	}
	
	// Event handlers
	function handleRecentObjectSelect(recentObject: { id: string; name: string; category: string }): void {
		// Record usage
		try {
			bookmarkStore.recordObjectUsage?.(recentObject.id);
		} catch (error) {
			console.warn('Failed to record object usage:', error);
		}
		
		// Dispatch action to change object
		dispatch('action', {
			action: 'change-object-direct',
			category,
			objectId: recentObject.id
		});
		
		closeMenu();
	}
	
	function handleMenuItemClick(menuItem: typeof menuItems[0]): void {
		dispatch('action', {
			action: menuItem.action,
			category
		});
		
		closeMenu();
	}
	
	function handleMenuItemHover(index: number): void {
		selectedIndex = recentObjects.length + index;
		updateVisualFocus();
	}
	
	function handleRecentObjectHover(index: number): void {
		selectedIndex = index;
		updateVisualFocus();
	}
	
	// Menu control
	function closeMenu(): void {
		if (isClosing) return;
		
		isClosing = true;
		dispatch('close');
		
		setTimeout(() => {
			isClosing = false;
		}, 200);
	}
	
	// Utility functions
	function lightenColor(hexColor: string, amount: number): string {
		try {
			const hex = hexColor.replace('#', '');
			const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + Math.round(255 * amount));
			const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + Math.round(255 * amount));
			const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + Math.round(255 * amount));
			
			return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
		} catch {
			return '#2a2a2a';
		}
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
	
	function getObjectIcon(objectId: string): string {
		const iconMap: Record<string, string> = {
			// Development
			'development/computer': '💻',
			'development/git-tree': '🌳',
			'development/coffee': '☕',
			'development/docker': '📦',
			'development/server': '🖥️',
			
			// Learning
			'learning/graduation-cap': '🎓',
			'learning/textbooks': '📚',
			'learning/brain': '🧠',
			'learning/microscope': '🔬',
			'learning/owl': '🦉',
			
			// Creative
			'creative/dice': '🎲',
			'creative/treasure-chest': '💰',
			'creative/magic-8-ball': '🎱',
			
			// Geometric
			'geometric/diamond': '💎',
			'geometric/sphere': '⚪',
			'geometric/octahedron': '🔷',
			'geometric/cube': '🔳',
			'geometric/pyramid': '🔺'
		};
		
		return iconMap[objectId] || '📦';
	}
	
	function cleanup(): void {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
		}
	}
</script>

{#if visible}
	<div 
		class="context-menu"
		bind:this={menuElement}
		style="
			left: {adjustedPosition.x}px;
			top: {adjustedPosition.y}px;
			transform-origin: {adjustedPosition.origin};
			--menu-bg: {menuBackgroundColor};
			--menu-border: {menuBorderColor};
			--menu-text: {menuTextColor};
			--menu-accent: {colorPalette.accent || colorPalette.current};
			min-width: {MIN_WIDTH}px;
			max-width: {MAX_WIDTH}px;
		"
		transition:fly={{ 
			y: adjustedPosition.origin.includes('bottom') ? 10 : -10,
			x: adjustedPosition.origin.includes('right') ? 10 : -10,
			duration: 200, 
			easing: cubicOut 
		}}
		tabindex="-1"
		role="menu"
		aria-label="Folder context menu"
		on:click|stopPropagation
	>
		<!-- Recent Objects Section -->
		{#if recentObjects.length > 0}
			<div class="menu-section recent-objects-section">
				<div class="section-header">
					<span class="section-title">Recent Objects</span>
				</div>
				
				<div class="recent-objects-grid">
					{#each recentObjects as recentObject, index}
						<button
							class="recent-object"
							class:keyboard-focus={selectedIndex === index}
							on:click={() => handleRecentObjectSelect(recentObject)}
							on:mouseenter={() => handleRecentObjectHover(index)}
							title="{recentObject.name} ({recentObject.category})"
							aria-label="Switch to {recentObject.name}"
						>
							<div class="recent-object-icon">
								{getObjectIcon(recentObject.id)}
							</div>
							<div class="recent-object-label">
								{recentObject.name}
							</div>
						</button>
					{/each}
				</div>
			</div>
			
			<div class="menu-separator"></div>
		{/if}
		
		<!-- Menu Items Section -->
		<div class="menu-section menu-items-section">
			{#each menuItems as menuItem, index}
				<button
					class="menu-item"
					class:keyboard-focus={selectedIndex === recentObjects.length + index}
					on:click={() => handleMenuItemClick(menuItem)}
					on:mouseenter={() => handleMenuItemHover(index)}
					role="menuitem"
					aria-label={menuItem.description}
				>
					<div class="menu-item-icon">
						{menuItem.icon}
					</div>
					
					<div class="menu-item-content">
						<span class="menu-item-label">{menuItem.label}</span>
						<span class="menu-item-description">{menuItem.description}</span>
					</div>
					
					{#if menuItem.id === 'change-object'}
						<div class="menu-item-arrow">→</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.context-menu {
		position: fixed;
		z-index: 2000;
		background: var(--menu-bg);
		border: 1px solid var(--menu-border);
		border-radius: 12px;
		backdrop-filter: blur(20px);
		box-shadow: 
			0 20px 40px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
		overflow: hidden;
		opacity: 0.95;
		outline: none;
		user-select: none;
	}
	
	.context-menu::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.08) 0%,
			transparent 50%,
			rgba(0, 0, 0, 0.05) 100%
		);
		pointer-events: none;
		border-radius: inherit;
	}
	
	.menu-section {
		position: relative;
		z-index: 1;
	}
	
	.recent-objects-section {
		padding: 12px;
	}
	
	.section-header {
		margin-bottom: 8px;
	}
	
	.section-title {
		font-size: 11px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	
	.recent-objects-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	
	.recent-object {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 8px 6px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		position: relative;
		min-height: 60px;
	}
	
	.recent-object:hover,
	.recent-object.keyboard-focus {
		background: rgba(255, 255, 255, 0.12);
		border-color: var(--menu-accent);
		transform: translateY(-1px) scale(1.02);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	
	.recent-object.keyboard-focus {
		outline: 2px solid var(--menu-accent);
		outline-offset: 1px;
	}
	
	.recent-object-icon {
		font-size: 20px;
		line-height: 1;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}
	
	.recent-object-label {
		font-size: 9px;
		font-weight: 500;
		color: var(--menu-text);
		text-align: center;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		width: 100%;
		opacity: 0.9;
	}
	
	.menu-separator {
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.2) 50%,
			transparent 100%
		);
		margin: 0 8px;
	}
	
	.menu-items-section {
		padding: 8px;
	}
	
	.menu-item {
		width: 100%;
		background: transparent;
		border: none;
		border-radius: 8px;
		padding: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 12px;
		position: relative;
		text-align: left;
	}
	
	.menu-item:hover,
	.menu-item.keyboard-focus {
		background: rgba(255, 255, 255, 0.1);
		transform: translateX(2px);
	}
	
	.menu-item.keyboard-focus {
		outline: 2px solid var(--menu-accent);
		outline-offset: 1px;
	}
	
	.menu-item-icon {
		font-size: 16px;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
	}
	
	.menu-item-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	
	.menu-item-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--menu-text);
		line-height: 1.2;
	}
	
	.menu-item-description {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.2;
	}
	
	.menu-item-arrow {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.5);
		transition: all 0.2s ease;
		transform: translateX(0);
	}
	
	.menu-item:hover .menu-item-arrow {
		color: var(--menu-accent);
		transform: translateX(2px);
	}
	
	/* Mobile optimizations */
	@media (max-width: 768px) {
		.context-menu {
			min-width: 250px;
			max-width: 90vw;
		}
		
		.menu-item {
			padding: 16px 12px;
		}
		
		.menu-item-icon {
			font-size: 18px;
			width: 24px;
			height: 24px;
		}
		
		.menu-item-label {
			font-size: 14px;
		}
		
		.menu-item-description {
			font-size: 12px;
		}
		
		.recent-objects-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		
		.recent-object {
			min-height: 70px;
			padding: 10px 8px;
		}
		
		.recent-object-icon {
			font-size: 24px;
		}
		
		.recent-object-label {
			font-size: 10px;
		}
	}
	
	@media (max-width: 480px) {
		.context-menu {
			min-width: 200px;
		}
		
		.recent-objects-grid {
			grid-template-columns: 1fr;
		}
		
		.recent-object {
			flex-direction: row;
			min-height: 50px;
			padding: 12px;
			gap: 8px;
		}
		
		.recent-object-label {
			text-align: left;
			white-space: nowrap;
		}
	}
	
	/* Reduced motion preferences */
	@media (prefers-reduced-motion: reduce) {
		.context-menu,
		.menu-item,
		.recent-object {
			transition: none;
		}
		
		.menu-item:hover,
		.recent-object:hover {
			transform: none;
		}
	}
	
	/* High contrast mode */
	@media (prefers-contrast: high) {
		.context-menu {
			border-width: 2px;
			background: var(--menu-bg);
		}
		
		.menu-item.keyboard-focus,
		.recent-object.keyboard-focus {
			outline-width: 3px;
		}
		
		.menu-separator {
			background: rgba(255, 255, 255, 0.5);
			height: 2px;
		}
	}
</style>
