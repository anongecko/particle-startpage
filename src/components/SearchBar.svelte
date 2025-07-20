<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut, sineInOut } from 'svelte/easing';
	import { bookmarkStore } from '$stores/bookmarks';
	import { settingsStore, defaultSearchEngine } from '$stores/settings';
	
	interface Props {
		element?: HTMLElement | null;
		focused?: boolean;
		dominantColor?: string;
		settings?: any;
	}
	
	let {
		element = $bindable(null),
		focused = $bindable(false),
		dominantColor = '#ffffff',
		settings
	}: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let searchInput: HTMLInputElement = $state();
	let searchContainer: HTMLElement = $state();
	let dropdownElement: HTMLElement = $state();
	let contextMenuElement: HTMLElement = $state();
	let query = $state('');
	let isDropdownOpen = $state(false);
	let isContextMenuOpen = $state(false);
	let contextMenuPosition = $state({ x: 0, y: 0 });
	let filteredBookmarks = $state([]);
	let showBookmarkSuggestions = $state(false);
	let selectedSuggestionIndex = $state(-1);
	let searchEngines = $state([]);
	let currentEngine = $state(null);
	let engineShortcuts = $state(new Map());
	
	const breathingIntensity = tweened(0.3, { duration: 2000, easing: sineInOut });
	const focusIntensity = tweened(0, { duration: 300, easing: cubicOut });
	const submitAnimation = tweened(0, { duration: 400, easing: cubicOut });
	
	interface SearchEngine {
		id: string;
		name: string;
		url: string;
		shortcut?: string;
		isDefault: boolean;
		isCustom: boolean;
	}
	
	interface BookmarkSuggestion {
		id: string;
		title: string;
		url: string;
		categoryName: string;
		relevance: number;
	}
	
	interface SearchProvider {
		id: string;
		name: string;
		search: (query: string) => Promise<any[]>;
		priority: number;
	}
	
	const DEFAULT_ENGINES: SearchEngine[] = [
		{
			id: 'startpage',
			name: 'Startpage',
			url: 'https://www.startpage.com/sp/search?query=%s',
			isDefault: true,
			isCustom: false
		},
		{
			id: 'brave',
			name: 'Brave Search',
			url: 'https://search.brave.com/search?q=%s',
			shortcut: 'b',
			isDefault: false,
			isCustom: false
		},
		{
			id: 'duckduckgo',
			name: 'DuckDuckGo',
			url: 'https://duckduckgo.com/?q=%s',
			shortcut: 'd',
			isDefault: false,
			isCustom: false
		},
		{
			id: 'google',
			name: 'Google',
			url: 'https://www.google.com/search?q=%s',
			shortcut: 'g',
			isDefault: false,
			isCustom: false
		},
		{
			id: 'ecosia',
			name: 'Ecosia',
			url: 'https://www.ecosia.org/search?q=%s',
			shortcut: 'e',
			isDefault: false,
			isCustom: false
		}
	];
	
	const searchProviders: SearchProvider[] = [
		{
			id: 'bookmarks',
			name: 'Bookmarks',
			search: searchBookmarks,
			priority: 1
		}
	];
	
	let gradientColors = $derived(getGradientColors());
	let textColor = $derived(getContrastColor(dominantColor));
	let placeholderText = $derived(currentEngine?.name || 'Search');
	let bookmarks = $derived($bookmarkStore);
	let userSearchEngine = $derived($defaultSearchEngine);
	
	async function searchBookmarks(searchQuery: string): Promise<BookmarkSuggestion[]> {
		if (!searchQuery.trim() || searchQuery.length < 2) return [];
		
		const results: BookmarkSuggestion[] = [];
		const queryLower = searchQuery.toLowerCase();
		
		for (const category of bookmarks.categories) {
			for (const bookmark of category.bookmarks) {
				if (!bookmark.isVisible) continue;
				
				let relevance = 0;
				const titleLower = bookmark.title.toLowerCase();
				const urlLower = bookmark.url.toLowerCase();
				const descLower = (bookmark.description || '').toLowerCase();
				
				// Title matches get highest priority
				if (titleLower.includes(queryLower)) {
					relevance += titleLower.startsWith(queryLower) ? 100 : 50;
				}
				
				// URL matches
				if (urlLower.includes(queryLower)) {
					relevance += 30;
				}
				
				// Description matches
				if (descLower.includes(queryLower)) {
					relevance += 20;
				}
				
				// Tag matches
				for (const tag of bookmark.tags) {
					if (tag.toLowerCase().includes(queryLower)) {
						relevance += 25;
					}
				}
				
				// Category name matches
				if (category.name.toLowerCase().includes(queryLower)) {
					relevance += 15;
				}
				
				if (relevance > 0) {
					results.push({
						id: bookmark.id,
						title: bookmark.title,
						url: bookmark.url,
						categoryName: category.name,
						relevance
					});
				}
			}
		}
		
		return results
			.sort((a, b) => b.relevance - a.relevance)
			.slice(0, 6);
	}
	
	function initializeSearchEngines(): void {
		const userEngines = settings?.searchEngines || [];
		searchEngines = userEngines.length > 0 ? userEngines : DEFAULT_ENGINES;
		currentEngine = searchEngines.find(e => e.isDefault) || searchEngines[0];
		
		// Build shortcut map
		engineShortcuts.clear();
		for (const engine of searchEngines) {
			if (engine.shortcut) {
				engineShortcuts.set(engine.shortcut, engine);
			}
		}
	}
	
	function startBreathingAnimation(): void {
		const animate = () => {
			breathingIntensity.set(0.6).then(() => {
				breathingIntensity.set(0.3);
				if (!focused) {
					setTimeout(animate, 2000 + Math.random() * 1000);
				}
			});
		};
		animate();
	}
	
	function handleFocus(): void {
		focused = true;
		focusIntensity.set(1);
		dispatch('focus');
		
		// Show bookmark suggestions if there's a query
		if (query.trim()) {
			updateBookmarkSuggestions();
		}
	}
	
	function handleBlur(): void {
		setTimeout(() => {
			if (!isDropdownOpen && !isContextMenuOpen) {
				focused = false;
				focusIntensity.set(0);
				showBookmarkSuggestions = false;
				selectedSuggestionIndex = -1;
				dispatch('blur');
				startBreathingAnimation();
			}
		}, 150);
	}
	
	async function handleInput(): Promise<void> {
		await updateBookmarkSuggestions();
	}
	
	async function updateBookmarkSuggestions(): Promise<void> {
		if (!query.trim()) {
			showBookmarkSuggestions = false;
			filteredBookmarks = [];
			return;
		}
		
		try {
			const suggestions = await searchBookmarks(query);
			filteredBookmarks = suggestions;
			showBookmarkSuggestions = suggestions.length > 0;
			selectedSuggestionIndex = -1;
		} catch (error) {
			console.error('Failed to search bookmarks:', error);
			filteredBookmarks = [];
			showBookmarkSuggestions = false;
		}
	}
	
	async function handleKeyDown(event: KeyboardEvent): Promise<void> {
		switch (event.key) {
			case 'Enter':
				event.preventDefault();
				await handleSubmit();
				break;
				
			case 'Escape':
				event.preventDefault();
				handleEscape();
				break;
				
			case 'ArrowDown':
				if (showBookmarkSuggestions) {
					event.preventDefault();
					selectedSuggestionIndex = Math.min(
						selectedSuggestionIndex + 1,
						filteredBookmarks.length - 1
					);
				}
				break;
				
			case 'ArrowUp':
				if (showBookmarkSuggestions) {
					event.preventDefault();
					selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
				}
				break;
				
			case 'Tab':
				if (showBookmarkSuggestions && selectedSuggestionIndex >= 0) {
					event.preventDefault();
					selectBookmarkSuggestion(filteredBookmarks[selectedSuggestionIndex]);
				}
				break;
				
			default:
				// Check for search engine shortcuts
				if (event.ctrlKey || event.metaKey) {
					const shortcutKey = event.key.toLowerCase();
					const engine = engineShortcuts.get(shortcutKey);
					if (engine) {
						event.preventDefault();
						switchToEngine(engine);
					}
				}
				break;
		}
	}
	
	function handleEscape(): void {
		if (showBookmarkSuggestions) {
			showBookmarkSuggestions = false;
			selectedSuggestionIndex = -1;
		} else if (query) {
			query = '';
		} else {
			searchInput.blur();
		}
	}
	
	async function handleSubmit(): Promise<void> {
		if (!query.trim()) return;
		
		// Check if user selected a bookmark suggestion
		if (showBookmarkSuggestions && selectedSuggestionIndex >= 0) {
			selectBookmarkSuggestion(filteredBookmarks[selectedSuggestionIndex]);
			return;
		}
		
		// Animate submit
		await submitAnimation.set(1);
		setTimeout(() => submitAnimation.set(0), 400);
		
		// Perform search
		const searchUrl = currentEngine.url.replace('%s', encodeURIComponent(query));
		
		// Open in current tab
		window.location.href = searchUrl;
		
		// Clear search
		query = '';
		showBookmarkSuggestions = false;
		searchInput.blur();
	}
	
	function selectBookmarkSuggestion(suggestion: BookmarkSuggestion): void {
		window.location.href = suggestion.url;
	}
	
	function toggleEngineDropdown(): void {
		isDropdownOpen = !isDropdownOpen;
		if (isDropdownOpen) {
			closeContextMenu();
		}
	}
	
	function selectEngine(engine: SearchEngine): void {
		currentEngine = engine;
		isDropdownOpen = false;
		
		// Update settings
		settingsStore.update(currentSettings => ({
			...currentSettings,
			searchEngines: searchEngines.map(e => ({
				...e,
				isDefault: e.id === engine.id
			}))
		}));
		
		// Focus back to input
		setTimeout(() => searchInput.focus(), 100);
	}
	
	function switchToEngine(engine: SearchEngine): void {
		currentEngine = engine;
		// Visual feedback for shortcut switch
		submitAnimation.set(0.3).then(() => submitAnimation.set(0));
	}
	
	function handleRightClick(event: MouseEvent): void {
		event.preventDefault();
		
		contextMenuPosition = {
			x: event.clientX,
			y: event.clientY
		};
		
		isContextMenuOpen = true;
		closeDropdown();
		
		// Focus context menu for keyboard navigation
		setTimeout(() => {
			if (contextMenuElement) {
				contextMenuElement.focus();
			}
		}, 10);
	}
	
	function handleContextKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closeContextMenu();
			searchInput.focus();
		}
	}
	
	function closeContextMenu(): void {
		isContextMenuOpen = false;
	}
	
	function closeDropdown(): void {
		isDropdownOpen = false;
	}
	
	function handleGlobalKeyDown(event: KeyboardEvent): void {
		// Space bar to focus search (when not in input)
		if (event.code === 'Space' && document.activeElement === document.body) {
			event.preventDefault();
			focusSearch();
			return;
		}
		
		// Ctrl/Cmd + K to focus search
		if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
			event.preventDefault();
			focusSearch();
		}
	}
	
	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		
		if (!searchContainer?.contains(target)) {
			closeDropdown();
			closeContextMenu();
		}
	}
	
	function focusSearch(): void {
		if (searchInput) {
			searchInput.focus();
		}
	}
	
	function getGradientColors(): { primary: string; secondary: string } {
		const rgb = hexToRgb(dominantColor);
		if (!rgb) return { primary: '#4a90e2', secondary: '#357abd' };
		
		// Create a slightly different shade for gradient
		const primary = dominantColor;
		const secondary = `rgb(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)})`;
		
		return { primary, secondary };
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
		return luminance > 0.5 ? '#000000' : '#ffffff';
	}
	
	onMount(() => {
		if (!browser) return;
		
		element = searchContainer;
		initializeSearchEngines();
		startBreathingAnimation();
		
		document.addEventListener('keydown', handleGlobalKeyDown);
		document.addEventListener('click', handleClickOutside);
		
		return () => {
			document.removeEventListener('keydown', handleGlobalKeyDown);
			document.removeEventListener('click', handleClickOutside);
		};
	});
	
	onDestroy(() => {
		if (browser) {
			document.removeEventListener('keydown', handleGlobalKeyDown);
			document.removeEventListener('click', handleClickOutside);
		}
	});
	
	// Reactive updates
	$effect(() => {
		if (settings?.searchEngines || userSearchEngine) {
			initializeSearchEngines();
		}
	});
</script>

<div 
	class="search-container"
	bind:this={searchContainer}
	oncontextmenu={handleRightClick}
	onkeydown={handleContextKeyDown}
	role="search"
	aria-label="Search interface with engine selection"
	style="
		--breathing-intensity: {$breathingIntensity};
		--focus-intensity: {$focusIntensity};
		--submit-animation: {$submitAnimation};
		--primary-color: {gradientColors.primary};
		--secondary-color: {gradientColors.secondary};
		--text-color: {textColor};
	"
>
	<div class="search-bar" class:focused class:submitting={$submitAnimation > 0}>
		<input
			bind:this={searchInput}
			bind:value={query}
			type="text"
			class="search-input"
			placeholder={placeholderText}
			autocomplete="off"
			autocorrect="off"
			autocapitalize="off"
			spellcheck="false"
			inputmode="search"
			onfocus={handleFocus}
			onblur={handleBlur}
			oninput={handleInput}
			onkeydown={handleKeyDown}
			aria-label="Search input"
			aria-describedby={showBookmarkSuggestions ? 'search-suggestions' : undefined}
			aria-expanded={showBookmarkSuggestions}
			aria-autocomplete="list"
			role="searchbox"
		/>
		
		<button
			class="engine-selector"
			class:open={isDropdownOpen}
			onclick={toggleEngineDropdown}
			aria-label={`Select search engine. Current: ${currentEngine?.name || 'Default'}`}
			aria-expanded={isDropdownOpen}
			aria-haspopup="listbox"
			tabindex="-1"
			type="button"
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<polyline points="6,9 12,15 18,9"></polyline>
			</svg>
		</button>
	</div>
	
	{#if isDropdownOpen}
		<div class="dropdown" bind:this={dropdownElement} role="listbox" aria-label="Search engines">
			{#each searchEngines as engine}
				<button
					class="dropdown-item"
					class:active={engine.id === currentEngine?.id}
					onclick={() => selectEngine(engine)}
					role="option"
					aria-selected={engine.id === currentEngine?.id}
					type="button"
				>
					<span class="engine-name">{engine.name}</span>
					{#if engine.shortcut}
						<span class="engine-shortcut" aria-label="Keyboard shortcut">Ctrl+{engine.shortcut.toUpperCase()}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
	
	{#if showBookmarkSuggestions && filteredBookmarks.length > 0}
		<div 
			class="suggestions" 
			id="search-suggestions"
			role="listbox"
			aria-label="Bookmark suggestions"
		>
			{#each filteredBookmarks as suggestion, index}
				<button
					class="suggestion-item"
					class:selected={index === selectedSuggestionIndex}
					onclick={() => selectBookmarkSuggestion(suggestion)}
					role="option"
					aria-selected={index === selectedSuggestionIndex}
					aria-label={`${suggestion.title} in ${suggestion.categoryName}`}
					type="button"
				>
					<div class="suggestion-content">
						<span class="suggestion-title">{suggestion.title}</span>
						<span class="suggestion-category">{suggestion.categoryName}</span>
					</div>
					<span class="suggestion-url" aria-hidden="true">{suggestion.url}</span>
				</button>
			{/each}
		</div>
	{/if}
	
	{#if isContextMenuOpen}
		<div 
			class="context-menu"
			bind:this={contextMenuElement}
			style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
			tabindex="-1"
			onblur={closeContextMenu}
			onkeydown={handleContextKeyDown}
			role="menu"
			aria-label="Search engine context menu"
		>
			{#each searchEngines as engine}
				<button
					class="context-menu-item"
					class:active={engine.id === currentEngine?.id}
					onclick={() => { selectEngine(engine); closeContextMenu(); }}
					role="menuitem"
					aria-label={`Switch to ${engine.name}`}
					type="button"
				>
					{engine.name}
					{#if engine.shortcut}
						<span class="shortcut-hint" aria-hidden="true">Ctrl+{engine.shortcut.toUpperCase()}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.search-container {
		position: relative;
		width: 100%;
		max-width: 600px;
		margin: 0 auto;
	}
	
	.search-bar {
		position: relative;
		border-radius: 25px;
		background: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
		
		/* Subtle breathing glow effect */
		box-shadow: 
			0 0 0 1px rgba(255, 255, 255, calc(var(--breathing-intensity) * 0.1)),
			0 4px 20px rgba(0, 0, 0, 0.1);
		
		/* Partial gradient border */
		background-image: 
			linear-gradient(135deg, 
				rgba(255, 255, 255, calc(var(--breathing-intensity) * 0.2)) 0%,
				transparent 40%,
				transparent 60%,
				rgba(255, 255, 255, calc(var(--breathing-intensity) * 0.15)) 100%
			);
		background-size: 200% 200%;
		animation: gradient-shift 4s ease-in-out infinite;
	}
	
	@keyframes gradient-shift {
		0%, 100% { background-position: 0% 0%; }
		50% { background-position: 100% 100%; }
	}
	
	.search-bar.focused {
		background: rgba(255, 255, 255, 0.12);
		border-color: var(--primary-color);
		box-shadow: 
			0 0 0 2px rgba(var(--primary-color), calc(var(--focus-intensity) * 0.3)),
			0 8px 30px rgba(0, 0, 0, 0.15);
		
		background-image: 
			linear-gradient(135deg,
				var(--primary-color) 0%,
				var(--secondary-color) 30%,
				transparent 40%,
				transparent 60%,
				var(--primary-color) 70%,
				var(--secondary-color) 100%
			);
	}
	
	.search-bar.submitting {
		transform: scale(calc(1 + var(--submit-animation) * 0.02));
		box-shadow: 
			0 0 0 calc(var(--submit-animation) * 4px) rgba(var(--primary-color), 0.3),
			0 8px 30px rgba(0, 0, 0, 0.2);
	}
	
	.search-input {
		width: 100%;
		height: 50px;
		padding: 0 50px 0 25px;
		background: transparent;
		border: none;
		outline: none;
		font-size: 16px;
		font-weight: 400;
		color: var(--text-color);
		font-family: inherit;
	}
	
	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
		transition: opacity 0.3s ease;
	}
	
	.search-input:focus::placeholder {
		opacity: 0.7;
	}
	
	.engine-selector {
		position: absolute;
		right: 15px;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 24px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.engine-selector:hover {
		color: rgba(255, 255, 255, 0.9);
		background: rgba(255, 255, 255, 0.1);
	}
	
	.engine-selector:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 2px;
	}
	
	.engine-selector.open {
		color: var(--primary-color);
		transform: translateY(-50%) rotate(180deg);
	}
	
	.dropdown {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.9);
		backdrop-filter: blur(20px);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		overflow: hidden;
		z-index: 1000;
		animation: dropdown-appear 0.2s ease-out;
	}
	
	@keyframes dropdown-appear {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	.dropdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 12px 16px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}
	
	.dropdown-item:hover,
	.dropdown-item:focus-visible {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 1);
		outline: none;
	}
	
	.dropdown-item.active {
		background: rgba(var(--primary-color), 0.2);
		color: var(--primary-color);
	}
	
	.engine-name {
		font-weight: 500;
	}
	
	.engine-shortcut {
		font-size: 12px;
		opacity: 0.6;
		font-family: monospace;
	}
	
	.suggestions {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(20px);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		overflow: hidden;
		z-index: 999;
		animation: dropdown-appear 0.2s ease-out;
		max-height: 300px;
		overflow-y: auto;
	}
	
	.suggestion-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 10px 16px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}
	
	.suggestion-item:hover,
	.suggestion-item:focus-visible,
	.suggestion-item.selected {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 1);
		outline: none;
	}
	
	.suggestion-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	
	.suggestion-title {
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.suggestion-category {
		font-size: 12px;
		opacity: 0.6;
	}
	
	.suggestion-url {
		font-size: 12px;
		opacity: 0.5;
		max-width: 200px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-left: 16px;
	}
	
	.context-menu {
		position: fixed;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(20px);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 4px 0;
		z-index: 2000;
		animation: dropdown-appear 0.15s ease-out;
		min-width: 150px;
	}
	
	.context-menu-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		font-size: 14px;
	}
	
	.context-menu-item:hover,
	.context-menu-item:focus-visible {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 1);
		outline: none;
	}
	
	.context-menu-item.active {
		color: var(--primary-color);
	}
	
	.shortcut-hint {
		font-size: 11px;
		opacity: 0.6;
		font-family: monospace;
		margin-left: 12px;
	}
	
	@media (max-width: 768px) {
		.search-container {
			max-width: 90vw;
		}
		
		.search-input {
			height: 44px;
			font-size: 16px; /* Prevents zoom on iOS */
		}
		
		.engine-shortcut,
		.shortcut-hint {
			display: none;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.search-bar {
			animation: none;
			transition: none;
		}
		
		.dropdown,
		.suggestions,
		.context-menu {
			animation: none;
		}
	}
</style>
