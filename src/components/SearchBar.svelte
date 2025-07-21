<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut, sineInOut, expoOut } from 'svelte/easing';
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
		dominantColor = '#4a90e2',
		settings
	}: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let searchInput: HTMLInputElement = $state();
	let searchContainer: HTMLElement = $state();
	let dropdownElement: HTMLElement = $state();
	let suggestionsContainer: HTMLElement = $state();
	let query = $state('');
	let isDropdownOpen = $state(false);
	let allSuggestions = $state([]);
	let selectedIndex = $state(-1);
	let searchEngines = $state([]);
	let currentEngine = $state(null);
	let engineShortcuts = $state(new Map());
	let isLoading = $state(false);
	let smartResult = $state(null);
	let hasTyped = $state(false);
	
	const breathingIntensity = tweened(0.3, { duration: 2000, easing: sineInOut });
	const focusIntensity = tweened(0, { duration: 400, easing: cubicOut });
	const submitAnimation = tweened(0, { duration: 500, easing: expoOut });
	const glowIntensity = tweened(0, { duration: 600, easing: cubicOut });
	const glowExpansion = tweened(0, { duration: 800, easing: expoOut });
	const loadingSpinner = tweened(0, { duration: 1000, easing: sineInOut });
	
	interface SearchEngine {
		id: string;
		name: string;
		url: string;
		shortcut?: string;
		isDefault: boolean;
		isCustom: boolean;
	}
	
	interface Suggestion {
		id: string;
		text: string;
		type: 'search' | 'bookmark' | 'smart' | 'url';
		icon?: string;
		description?: string;
		category?: string;
		url?: string;
		action?: () => void;
		relevance: number;
	}
	
	interface SmartResult {
		type: 'calculation' | 'conversion' | 'url' | 'time' | 'weather';
		result: string;
		description: string;
		action?: () => void;
	}
	
	const DEFAULT_ENGINES: SearchEngine[] = [
		{
			id: 'duckduckgo',
			name: 'DuckDuckGo',
			url: 'https://duckduckgo.com/?q=%s',
			shortcut: 'd',
			isDefault: true,
			isCustom: false
		},
		{
			id: 'startpage',
			name: 'Startpage',
			url: 'https://www.startpage.com/sp/search?query=%s',
			shortcut: 's',
			isDefault: false,
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
			id: 'ecosia',
			name: 'Ecosia',
			url: 'https://www.ecosia.org/search?q=%s',
			shortcut: 'e',
			isDefault: false,
			isCustom: false
		}
	];
	
	let gradientColors = $derived(getGradientColors());
	let textColor = $derived(getContrastColor(dominantColor));
	let placeholderText = $derived(getPlaceholderText());
	let bookmarks = $derived($bookmarkStore);
	let userSearchEngine = $derived($defaultSearchEngine);
	let showSuggestions = $derived(allSuggestions.length > 0 || smartResult);
	
	const suggestionCache = new Map();
	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
	let debounceTimer: NodeJS.Timeout;
	let abortController: AbortController | null = null;
	
	function getPlaceholderText(): string {
		if (!hasTyped && !focused) {
			return 'Search, calculate, convert...';
		}
		return currentEngine?.name || 'Search';
	}
	
	async function searchDuckDuckGo(searchQuery: string): Promise<Suggestion[]> {
		if (!searchQuery.trim() || searchQuery.length < 2) return [];
		
		const cacheKey = `ddg:${searchQuery.toLowerCase()}`;
		const cached = suggestionCache.get(cacheKey);
		
		if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
			return cached.suggestions;
		}
		
		try {
			if (abortController) {
				abortController.abort();
			}
			abortController = new AbortController();
			
			const response = await fetch(
				`https://duckduckgo.com/ac/?q=${encodeURIComponent(searchQuery)}&type=list`,
				{
					signal: abortController.signal,
					mode: 'cors',
					headers: {
						'Accept': 'application/json',
					}
				}
			);
			
			if (!response.ok) throw new Error('DDG API failed');
			
			const data = await response.json();
			const suggestions: Suggestion[] = [];
			
			if (Array.isArray(data) && data[1]) {
				data[1].slice(0, 6).forEach((text: string, index: number) => {
					suggestions.push({
						id: `ddg-${index}`,
						text,
						type: 'search',
						icon: '🔍',
						relevance: 50 - index * 5
					});
				});
			}
			
			suggestionCache.set(cacheKey, {
				suggestions,
				timestamp: Date.now()
			});
			
			return suggestions;
		} catch (error) {
			if (error.name !== 'AbortError') {
				console.warn('DuckDuckGo suggestions failed:', error);
			}
			return [];
		}
	}
	
	async function searchBookmarks(searchQuery: string): Promise<Suggestion[]> {
		if (!searchQuery.trim() || searchQuery.length < 2) return [];
		
		const results: Suggestion[] = [];
		const queryLower = searchQuery.toLowerCase();
		
		for (const category of bookmarks.categories) {
			for (const bookmark of category.bookmarks) {
				if (!bookmark.isVisible) continue;
				
				let relevance = 0;
				const titleLower = bookmark.title.toLowerCase();
				const urlLower = bookmark.url.toLowerCase();
				const descLower = (bookmark.description || '').toLowerCase();
				
				if (titleLower.includes(queryLower)) {
					relevance += titleLower.startsWith(queryLower) ? 100 : 60;
				}
				
				if (urlLower.includes(queryLower)) {
					relevance += 40;
				}
				
				if (descLower.includes(queryLower)) {
					relevance += 25;
				}
				
				for (const tag of bookmark.tags) {
					if (tag.toLowerCase().includes(queryLower)) {
						relevance += 30;
					}
				}
				
				if (category.name.toLowerCase().includes(queryLower)) {
					relevance += 20;
				}
				
				if (relevance > 0) {
					results.push({
						id: `bookmark-${bookmark.id}`,
						text: bookmark.title,
						type: 'bookmark',
						icon: '⭐',
						description: bookmark.url,
						category: category.name,
						url: bookmark.url,
						relevance
					});
				}
			}
		}
		
		return results
			.sort((a, b) => b.relevance - a.relevance)
			.slice(0, 4);
	}
	
	function detectSmartResult(searchQuery: string): SmartResult | null {
		const query = searchQuery.trim().toLowerCase();
		
		// URL Detection
		const urlPattern = /^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/.*)?$/i;
		const simpleUrlPattern = /^[\w\-]+\.[\w\-]+$/i;
		
		if (urlPattern.test(query) || simpleUrlPattern.test(query)) {
			const url = query.startsWith('http') ? query : `https://${query}`;
			return {
				type: 'url',
				result: url,
				description: 'Navigate to this URL',
				action: () => window.location.href = url
			};
		}
		
		// Mathematical Calculations
		const mathPattern = /^[\d\s+\-*/().^%]+$/;
		if (mathPattern.test(query) && /[+\-*/^%]/.test(query)) {
			try {
				// Simple math evaluation (secure)
				const sanitized = query.replace(/[^0-9+\-*/().^%\s]/g, '');
				const result = evaluateSimpleMath(sanitized);
				if (result !== null) {
					return {
						type: 'calculation',
						result: result.toString(),
						description: `${query} =`,
						action: () => navigator.clipboard?.writeText(result.toString())
					};
				}
			} catch {}
		}
		
		// Unit Conversions
		const conversionPatterns = [
			{ pattern: /(\d+(?:\.\d+)?)\s*(usd|dollars?)\s*(?:to|in)\s*(eur|euros?)/i, from: 'USD', to: 'EUR' },
			{ pattern: /(\d+(?:\.\d+)?)\s*(eur|euros?)\s*(?:to|in)\s*(usd|dollars?)/i, from: 'EUR', to: 'USD' },
			{ pattern: /(\d+(?:\.\d+)?)\s*(feet?|ft)\s*(?:to|in)\s*(meters?|m)/i, from: 'ft', to: 'm', factor: 0.3048 },
			{ pattern: /(\d+(?:\.\d+)?)\s*(meters?|m)\s*(?:to|in)\s*(feet?|ft)/i, from: 'm', to: 'ft', factor: 3.28084 },
			{ pattern: /(\d+(?:\.\d+)?)\s*(celsius|c)\s*(?:to|in)\s*(fahrenheit|f)/i, from: 'C', to: 'F', 
				convert: (c: number) => (c * 9/5) + 32 },
			{ pattern: /(\d+(?:\.\d+)?)\s*(fahrenheit|f)\s*(?:to|in)\s*(celsius|c)/i, from: 'F', to: 'C', 
				convert: (f: number) => (f - 32) * 5/9 }
		];
		
		for (const { pattern, from, to, factor, convert } of conversionPatterns) {
			const match = query.match(pattern);
			if (match) {
				const value = parseFloat(match[1]);
				let result: number;
				
				if (convert) {
					result = convert(value);
				} else if (factor) {
					result = value * factor;
				} else {
					continue; // Skip currency conversions for now (would need API)
				}
				
				return {
					type: 'conversion',
					result: `${result.toFixed(2)} ${to}`,
					description: `${value} ${from} =`,
					action: () => navigator.clipboard?.writeText(result.toFixed(2))
				};
			}
		}
		
		// Time queries
		if (/^(time|what time|current time)$/i.test(query)) {
			const now = new Date();
			const timeString = now.toLocaleTimeString();
			return {
				type: 'time',
				result: timeString,
				description: 'Current time',
				action: () => navigator.clipboard?.writeText(timeString)
			};
		}
		
		return null;
	}
	
	function evaluateSimpleMath(expression: string): number | null {
		try {
			// Replace ^ with ** for exponentiation
			expression = expression.replace(/\^/g, '**');
			
			// Simple recursive descent parser for basic math
			const tokens = expression.match(/\d+(?:\.\d+)?|[+\-*/()%]|\*\*/g);
			if (!tokens) return null;
			
			let index = 0;
			
			function parseExpression(): number {
				let result = parseTerm();
				
				while (index < tokens.length && (tokens[index] === '+' || tokens[index] === '-')) {
					const operator = tokens[index++];
					const term = parseTerm();
					result = operator === '+' ? result + term : result - term;
				}
				
				return result;
			}
			
			function parseTerm(): number {
				let result = parseFactor();
				
				while (index < tokens.length && (tokens[index] === '*' || tokens[index] === '/' || tokens[index] === '%')) {
					const operator = tokens[index++];
					const factor = parseFactor();
					if (operator === '*') result *= factor;
					else if (operator === '/') result /= factor;
					else if (operator === '%') result %= factor;
				}
				
				return result;
			}
			
			function parseFactor(): number {
				let result = parseBase();
				
				while (index < tokens.length && tokens[index] === '**') {
					index++;
					const exponent = parseBase();
					result = Math.pow(result, exponent);
				}
				
				return result;
			}
			
			function parseBase(): number {
				if (tokens[index] === '(') {
					index++;
					const result = parseExpression();
					index++; // Skip ')'
					return result;
				}
				
				return parseFloat(tokens[index++]);
			}
			
			const result = parseExpression();
			return isFinite(result) ? result : null;
		} catch {
			return null;
		}
	}
	
	async function updateSuggestions(): Promise<void> {
		if (!query.trim()) {
			allSuggestions = [];
			smartResult = null;
			isLoading = false;
			return;
		}
		
		isLoading = true;
		loadingSpinner.set(1);
		
		try {
			// Smart detection (instant)
			smartResult = detectSmartResult(query);
			
			// Search providers (async)
			const [bookmarkSuggestions, searchSuggestions] = await Promise.all([
				searchBookmarks(query),
				searchDuckDuckGo(query)
			]);
			
			// Combine and sort by relevance
			const combined = [...bookmarkSuggestions, ...searchSuggestions]
				.sort((a, b) => b.relevance - a.relevance)
				.slice(0, 8);
			
			allSuggestions = combined;
			selectedIndex = -1;
			
		} catch (error) {
			console.error('Failed to update suggestions:', error);
			allSuggestions = [];
		} finally {
			isLoading = false;
			loadingSpinner.set(0);
		}
	}
	
	function initializeSearchEngines(): void {
		const userEngines = settings?.searchEngines || [];
		searchEngines = userEngines.length > 0 ? userEngines : DEFAULT_ENGINES;
		currentEngine = searchEngines.find(e => e.isDefault) || searchEngines[0];
		
		engineShortcuts.clear();
		for (const engine of searchEngines) {
			if (engine.shortcut) {
				engineShortcuts.set(engine.shortcut, engine);
			}
		}
	}
	
	function startBreathingAnimation(): void {
		if (focused || hasTyped) return;
		
		const animate = () => {
			breathingIntensity.set(0.7).then(() => {
				breathingIntensity.set(0.3).then(() => {
					if (!focused && !hasTyped) {
						setTimeout(animate, 2000 + Math.random() * 1000);
					}
				});
			});
		};
		animate();
	}
	
	function handleFocus(): void {
		focused = true;
		focusIntensity.set(1);
		dispatch('focus');
		
		if (query.trim()) {
			updateSuggestions();
		}
	}
	
	function handleBlur(): void {
		setTimeout(() => {
			if (!isDropdownOpen) {
				focused = false;
				focusIntensity.set(0);
				dispatch('blur');
				
				if (!hasTyped) {
					setTimeout(startBreathingAnimation, 1000);
				}
			}
		}, 150);
	}
	
	function handleInput(): void {
		hasTyped = query.trim().length > 0;
		
		if (hasTyped) {
			glowIntensity.set(1);
			glowExpansion.set(1);
		} else {
			glowIntensity.set(0);
			glowExpansion.set(0);
		}
		
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(updateSuggestions, 150);
	}
	
	async function handleKeyDown(event: KeyboardEvent): Promise<void> {
		const totalSuggestions = allSuggestions.length + (smartResult ? 1 : 0);
		
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
				if (totalSuggestions > 0) {
					event.preventDefault();
					selectedIndex = Math.min(selectedIndex + 1, totalSuggestions - 1);
				}
				break;
				
			case 'ArrowUp':
				if (totalSuggestions > 0) {
					event.preventDefault();
					selectedIndex = Math.max(selectedIndex - 1, -1);
				}
				break;
				
			case 'Tab':
				if (totalSuggestions > 0 && selectedIndex >= 0) {
					event.preventDefault();
					await selectSuggestion(selectedIndex);
				}
				break;
				
			default:
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
		if (showSuggestions) {
			allSuggestions = [];
			smartResult = null;
			selectedIndex = -1;
		} else if (query) {
			query = '';
			hasTyped = false;
			glowIntensity.set(0);
			glowExpansion.set(0);
		} else {
			searchInput.blur();
		}
	}
	
	async function handleSubmit(): Promise<void> {
		if (!query.trim()) return;
		
		// Handle smart result
		if (smartResult && selectedIndex === -1) {
			if (smartResult.action) {
				smartResult.action();
				return;
			}
		}
		
		// Handle selected suggestion
		if (selectedIndex >= 0) {
			await selectSuggestion(selectedIndex);
			return;
		}
		
		// Animate submit
		await submitAnimation.set(1);
		setTimeout(() => submitAnimation.set(0), 500);
		
		// Perform search
		const searchUrl = currentEngine.url.replace('%s', encodeURIComponent(query));
		window.location.href = searchUrl;
		
		// Clear search
		query = '';
		hasTyped = false;
		allSuggestions = [];
		smartResult = null;
		glowIntensity.set(0);
		glowExpansion.set(0);
		searchInput.blur();
	}
	
	async function selectSuggestion(index: number): Promise<void> {
		const totalSuggestions = allSuggestions.length + (smartResult ? 1 : 0);
		
		if (index < 0 || index >= totalSuggestions) return;
		
		// Smart result is always first
		if (smartResult && index === 0) {
			if (smartResult.action) {
				smartResult.action();
			}
			return;
		}
		
		// Adjust index for suggestions
		const suggestionIndex = smartResult ? index - 1 : index;
		const suggestion = allSuggestions[suggestionIndex];
		
		if (!suggestion) return;
		
		if (suggestion.type === 'bookmark' && suggestion.url) {
			window.location.href = suggestion.url;
		} else if (suggestion.action) {
			suggestion.action();
		} else {
			query = suggestion.text;
			await handleSubmit();
		}
	}
	
	function toggleEngineDropdown(): void {
		isDropdownOpen = !isDropdownOpen;
	}
	
	function selectEngine(engine: SearchEngine): void {
		currentEngine = engine;
		isDropdownOpen = false;
		
		settingsStore.update(currentSettings => ({
			...currentSettings,
			searchEngines: searchEngines.map(e => ({
				...e,
				isDefault: e.id === engine.id
			}))
		}));
		
		setTimeout(() => searchInput.focus(), 100);
	}
	
	function switchToEngine(engine: SearchEngine): void {
		currentEngine = engine;
		submitAnimation.set(0.3).then(() => submitAnimation.set(0));
	}
	
	function handleGlobalKeyDown(event: KeyboardEvent): void {
		if (event.code === 'Space' && document.activeElement === document.body) {
			event.preventDefault();
			focusSearch();
			return;
		}
		
		if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
			event.preventDefault();
			focusSearch();
		}
	}
	
	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		
		if (!searchContainer?.contains(target)) {
			isDropdownOpen = false;
		}
	}
	
	function focusSearch(): void {
		if (searchInput) {
			searchInput.focus();
		}
	}
	
	function getGradientColors(): { primary: string; secondary: string; rgb: string } {
		const rgb = hexToRgb(dominantColor);
		if (!rgb) return { 
			primary: '#4a90e2', 
			secondary: '#357abd',
			rgb: '74, 144, 226'
		};
		
		const primary = dominantColor;
		const secondary = `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})`;
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
	
	onMount(() => {
		if (!browser) return;
		
		element = searchContainer;
		initializeSearchEngines();
		startBreathingAnimation();
		
		document.addEventListener('keydown', handleGlobalKeyDown);
		document.addEventListener('click', handleClickOutside);
		
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			if (abortController) abortController.abort();
			document.removeEventListener('keydown', handleGlobalKeyDown);
			document.removeEventListener('click', handleClickOutside);
		};
	});
	
	onDestroy(() => {
		if (browser) {
			if (debounceTimer) clearTimeout(debounceTimer);
			if (abortController) abortController.abort();
			document.removeEventListener('keydown', handleGlobalKeyDown);
			document.removeEventListener('click', handleClickOutside);
		}
	});
	
	$effect(() => {
		if (settings?.searchEngines || userSearchEngine) {
			initializeSearchEngines();
		}
	});
</script>

<div 
	bind:this={searchContainer}
	role="search"
	aria-label="Smart search with suggestions"
	class="search-container"
	style:--breathing-intensity={$breathingIntensity}
	style:--focus-intensity={$focusIntensity}
	style:--submit-animation={$submitAnimation}
	style:--glow-intensity={$glowIntensity}
	style:--glow-expansion={$glowExpansion}
	style:--loading-spinner={$loadingSpinner}
	style:--primary-color={gradientColors.primary}
	style:--secondary-color={gradientColors.secondary}
	style:--primary-rgb={gradientColors.rgb}
	style:--text-color={textColor}
>
	<div class="search-bar" class:focused class:has-typed={hasTyped} class:submitting={$submitAnimation > 0}>
		<div class="glow-accent"></div>
		
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
			aria-label="Search input with smart suggestions"
			aria-describedby={showSuggestions ? 'search-suggestions' : undefined}
			aria-autocomplete="list"
		/>
		
		<div class="search-actions">
			{#if isLoading}
				<div class="loading-indicator" aria-hidden="true">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.3"/>
						<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round">
							<animateTransform
								attributeName="transform"
								type="rotate"
								values="0 12 12;360 12 12"
								dur="1s"
								repeatCount="indefinite"/>
						</path>
					</svg>
				</div>
			{/if}
			
			<button
				class="engine-selector"
				class:open={isDropdownOpen}
				onclick={toggleEngineDropdown}
				aria-label={`Select search engine. Current: ${currentEngine?.name || 'Default'}`}
				aria-expanded={isDropdownOpen}
				aria-haspopup="listbox"
				type="button"
			>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<polyline points="6,9 12,15 18,9"></polyline>
				</svg>
			</button>
		</div>
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
						<span class="engine-shortcut">⌘{engine.shortcut.toUpperCase()}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
	
	{#if showSuggestions}
		<div 
			bind:this={suggestionsContainer}
			class="suggestions" 
			id="search-suggestions"
			role="listbox"
			aria-label="Search suggestions"
		>
			{#if smartResult}
				<button
					class="suggestion-item smart-result"
					class:selected={selectedIndex === 0}
					onclick={() => selectSuggestion(0)}
					role="option"
					aria-selected={selectedIndex === 0}
					type="button"
				>
					<div class="suggestion-icon">{smartResult.type === 'calculation' ? '🧮' : smartResult.type === 'conversion' ? '⚡' : smartResult.type === 'url' ? '🌐' : smartResult.type === 'time' ? '🕐' : '✨'}</div>
					<div class="suggestion-content">
						<span class="suggestion-title">{smartResult.description}</span>
						<span class="suggestion-result">{smartResult.result}</span>
					</div>
				</button>
			{/if}
			
			{#each allSuggestions as suggestion, index}
				{@const adjustedIndex = smartResult ? index + 1 : index}
				<button
					class="suggestion-item"
					class:selected={selectedIndex === adjustedIndex}
					onclick={() => selectSuggestion(adjustedIndex)}
					role="option"
					aria-selected={selectedIndex === adjustedIndex}
					type="button"
				>
					<div class="suggestion-icon">{suggestion.icon || (suggestion.type === 'bookmark' ? '⭐' : '🔍')}</div>
					<div class="suggestion-content">
						<span class="suggestion-title">{suggestion.text}</span>
						{#if suggestion.description}
							<span class="suggestion-description">{suggestion.description}</span>
						{/if}
						{#if suggestion.category}
							<span class="suggestion-category">{suggestion.category}</span>
						{/if}
					</div>
					<div class="suggestion-type">{suggestion.type}</div>
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
		border-radius: 28px;
		background: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(20px) saturate(1.2);
		border: 1px solid rgba(255, 255, 255, 0.12);
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
		
		box-shadow: 
			0 0 0 1px rgba(255, 255, 255, calc(var(--breathing-intensity) * 0.08)),
			0 8px 32px rgba(0, 0, 0, 0.12),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}
	
	.search-bar.focused {
		background: rgba(255, 255, 255, 0.14);
		border-color: rgba(var(--primary-rgb), 0.4);
		box-shadow: 
			0 0 0 2px rgba(var(--primary-rgb), calc(var(--focus-intensity) * 0.25)),
			0 12px 40px rgba(0, 0, 0, 0.15),
			inset 0 1px 0 rgba(255, 255, 255, 0.15);
	}
	
	.search-bar.submitting {
		transform: scale(calc(1 + var(--submit-animation) * 0.015));
		box-shadow: 
			0 0 0 calc(var(--submit-animation) * 3px) rgba(var(--primary-rgb), 0.3),
			0 12px 40px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}
	
	.glow-accent {
		position: absolute;
		right: 20px;
		bottom: 10px;
		width: 12px;
		height: 8px;
		background: radial-gradient(
			ellipse at center,
			rgba(var(--primary-rgb), calc(var(--glow-intensity) * 0.8)) 0%,
			rgba(var(--primary-rgb), calc(var(--glow-intensity) * 0.3)) 40%,
			transparent 70%
		);
		border-radius: 50%;
		transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
		pointer-events: none;
		
		transform: scale(calc(1 + var(--glow-expansion) * 8)) 
				   translate(calc(var(--glow-expansion) * -400%), calc(var(--glow-expansion) * -300%));
		opacity: calc(var(--glow-intensity) * (1 - var(--glow-expansion) * 0.7));
	}
	
	.search-bar.has-typed {
		border-color: rgba(var(--primary-rgb), calc(0.3 + var(--glow-expansion) * 0.4));
		box-shadow: 
			0 0 0 1px rgba(var(--primary-rgb), calc(var(--glow-expansion) * 0.6)),
			0 8px 32px rgba(0, 0, 0, 0.12),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}
	
	.search-input {
		width: 100%;
		height: 54px;
		padding: 0 100px 0 28px;
		background: transparent;
		border: none;
		outline: none;
		font-size: 16px;
		font-weight: 400;
		color: var(--text-color);
		font-family: inherit;
		transition: all 0.3s ease;
	}
	
	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
		transition: all 0.3s ease;
	}
	
	.search-input:focus::placeholder {
		color: rgba(255, 255, 255, 0.6);
		transform: translateX(2px);
	}
	
	.search-actions {
		position: absolute;
		right: 16px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	
	.loading-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		color: rgba(var(--primary-rgb), 0.7);
		opacity: var(--loading-spinner);
		transition: opacity 0.3s ease;
	}
	
	.engine-selector {
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		border-radius: 8px;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.engine-selector:hover {
		color: rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.08);
		transform: scale(1.05);
	}
	
	.engine-selector:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.engine-selector.open {
		color: rgba(var(--primary-rgb), 0.9);
		background: rgba(var(--primary-rgb), 0.1);
		transform: translateY(-50%) rotate(180deg);
	}
	
	.dropdown {
		position: absolute;
		top: calc(100% + 12px);
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(24px) saturate(1.8);
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		overflow: hidden;
		z-index: 1000;
		animation: dropdown-appear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
	}
	
	@keyframes dropdown-appear {
		from {
			opacity: 0;
			transform: translateY(-12px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	
	.dropdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 14px 20px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		position: relative;
	}
	
	.dropdown-item:hover,
	.dropdown-item:focus-visible {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.95);
		outline: none;
	}
	
	.dropdown-item.active {
		background: rgba(var(--primary-rgb), 0.15);
		color: rgba(var(--primary-rgb), 0.95);
	}
	
	.engine-name {
		font-weight: 500;
	}
	
	.engine-shortcut {
		font-size: 11px;
		opacity: 0.6;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
		background: rgba(255, 255, 255, 0.1);
		padding: 2px 6px;
		border-radius: 4px;
	}
	
	.suggestions {
		position: absolute;
		top: calc(100% + 12px);
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.97);
		backdrop-filter: blur(24px) saturate(1.8);
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		overflow: hidden;
		z-index: 999;
		animation: dropdown-appear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		max-height: 400px;
		overflow-y: auto;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
	}
	
	.suggestion-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 12px 20px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		gap: 12px;
		position: relative;
	}
	
	.suggestion-item:hover,
	.suggestion-item:focus-visible,
	.suggestion-item.selected {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.95);
		outline: none;
	}
	
	.suggestion-item.smart-result {
		background: rgba(var(--primary-rgb), 0.08);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	
	.suggestion-item.smart-result:hover,
	.suggestion-item.smart-result.selected {
		background: rgba(var(--primary-rgb), 0.15);
	}
	
	.suggestion-icon {
		font-size: 16px;
		width: 20px;
		text-align: center;
		flex-shrink: 0;
	}
	
	.suggestion-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	
	.suggestion-title {
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.suggestion-result {
		font-size: 18px;
		font-weight: 600;
		color: rgba(var(--primary-rgb), 0.9);
	}
	
	.suggestion-description {
		font-size: 12px;
		opacity: 0.6;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.suggestion-category {
		font-size: 11px;
		opacity: 0.5;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	
	.suggestion-type {
		font-size: 10px;
		opacity: 0.4;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-left: 12px;
		flex-shrink: 0;
	}
	
	@media (max-width: 768px) {
		.search-container {
			max-width: calc(100vw - 32px);
		}
		
		.search-input {
			height: 48px;
			font-size: 16px;
			padding: 0 80px 0 24px;
		}
		
		.engine-shortcut {
			display: none;
		}
		
		.suggestion-type {
			display: none;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.search-bar,
		.glow-accent {
			transition: none;
		}
		
		.dropdown,
		.suggestions {
			animation: none;
		}
		
		.loading-indicator svg {
			animation: none;
		}
	}
	
	@media (max-height: 600px) {
		.suggestions {
			max-height: 250px;
		}
	}
</style>
