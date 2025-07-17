<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, elasticOut } from 'svelte/easing';
	import { wallpaperStore } from '$stores/wallpaper';
	import { settingsStore } from '$stores/settings';
	import { wallpaperAPI } from '$lib/api';
	import { debounce, formatFileSize, isImageFile } from '$lib/utils';
	
	export let currentTheme: string = '';
	export let dominantColor: string = '#ffffff';
	export let showSettings: boolean = false;
	
	const dispatch = createEventDispatcher();
	
	let themesContainer: HTMLElement;
	let uploadInput: HTMLInputElement;
	let settingsPanel: HTMLElement;
	let selectedTheme: any = null;
	let hoveredTheme: any = null;
	let isUploading = false;
	let uploadProgress = 0;
	let errorMessage = '';
	let searchQuery = '';
	let showUploadDialog = false;
	let showThemeSettings = false;
	let currentThemeSettings = {
		transitionDuration: 30,
		autoTransition: true,
		transitionType: 'fade',
		shuffleOrder: false
	};
	
	// Animation states
	const hoverScale = spring(1, { stiffness: 0.4, damping: 0.8 });
	const previewOpacity = tweened(0, { duration: 300, easing: cubicOut });
	const settingsOpacity = tweened(0, { duration: 300, easing: cubicOut });
	const uploadOpacity = tweened(0, { duration: 300, easing: cubicOut });
	
	let themes = [];
	let filteredThemes = [];
	let previewImage = '';
	
	const builtInThemes = [
		{
			id: 'nature',
			name: 'Nature Landscapes',
			description: 'Beautiful natural scenery and landscapes',
			thumbnail: '/themes/nature/preview.jpg',
			imageCount: 25,
			isBuiltIn: true,
			tags: ['nature', 'landscape', 'outdoor']
		},
		{
			id: 'abstract',
			name: 'Abstract Art',
			description: 'Modern abstract designs and patterns',
			thumbnail: '/themes/abstract/preview.jpg',
			imageCount: 30,
			isBuiltIn: true,
			tags: ['abstract', 'art', 'modern']
		},
		{
			id: 'minimal',
			name: 'Minimalist',
			description: 'Clean, simple backgrounds',
			thumbnail: '/themes/minimal/preview.jpg',
			imageCount: 20,
			isBuiltIn: true,
			tags: ['minimal', 'clean', 'simple']
		},
		{
			id: 'space',
			name: 'Space & Cosmos',
			description: 'Stunning space imagery and nebulae',
			thumbnail: '/themes/space/preview.jpg',
			imageCount: 35,
			isBuiltIn: true,
			tags: ['space', 'cosmos', 'astronomy']
		},
		{
			id: 'urban',
			name: 'Urban Cityscapes',
			description: 'City skylines and urban architecture',
			thumbnail: '/themes/urban/preview.jpg',
			imageCount: 28,
			isBuiltIn: true,
			tags: ['city', 'urban', 'architecture']
		},
		{
			id: 'ocean',
			name: 'Ocean & Waves',
			description: 'Serene ocean views and wave patterns',
			thumbnail: '/themes/ocean/preview.jpg',
			imageCount: 22,
			isBuiltIn: true,
			tags: ['ocean', 'water', 'waves']
		}
	];
	
	$: adaptedColors = adaptColorsToBackground(dominantColor);
	$: if (searchQuery) {
		filterThemes();
	} else {
		filteredThemes = themes;
	}
	$: if (currentTheme) {
		selectedTheme = themes.find(t => t.id === currentTheme);
		loadThemeSettings();
	}
	
	const debouncedSearch = debounce(filterThemes, 200);
	
	function adaptColorsToBackground(bgColor: string) {
		const bgLuminance = getLuminance(bgColor);
		const isDark = bgLuminance < 0.5;
		
		return {
			text: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
			textSecondary: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
			background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
			backgroundHover: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
			border: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
			accent: isDark ? '#4caf50' : '#2e7d32',
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
	
	async function loadThemes() {
		try {
			// Load built-in themes
			themes = [...builtInThemes];
			
			// Load user themes from API
			const response = await wallpaperAPI.getThemes();
			if (response.success && response.data) {
				const userThemes = response.data.map(theme => ({
					...theme,
					isBuiltIn: false,
					thumbnail: theme.thumbnail || theme.images?.[0] || '/placeholder-theme.jpg'
				}));
				themes = [...themes, ...userThemes];
			}
			
			filteredThemes = themes;
		} catch (error) {
			console.error('Failed to load themes:', error);
			errorMessage = 'Failed to load themes';
		}
	}
	
	function filterThemes() {
		if (!searchQuery.trim()) {
			filteredThemes = themes;
			return;
		}
		
		const query = searchQuery.toLowerCase();
		filteredThemes = themes.filter(theme =>
			theme.name.toLowerCase().includes(query) ||
			theme.description.toLowerCase().includes(query) ||
			theme.tags?.some(tag => tag.toLowerCase().includes(query))
		);
	}
	
	async function selectTheme(theme: any) {
		if (selectedTheme?.id === theme.id) return;
		
		selectedTheme = theme;
		currentTheme = theme.id;
		
		try {
			await wallpaperStore.setTheme(theme.id);
			dispatch('themeChange', { theme });
			
			// Load theme-specific settings
			loadThemeSettings();
		} catch (error) {
			console.error('Failed to select theme:', error);
			errorMessage = 'Failed to switch theme';
		}
	}
	
	function handleThemeHover(theme: any, isHovering: boolean) {
		if (isHovering) {
			hoveredTheme = theme;
			hoverScale.set(1.05);
			
			// Show preview image
			if (theme.thumbnail && theme.thumbnail !== selectedTheme?.thumbnail) {
				previewImage = theme.thumbnail;
				previewOpacity.set(0.8);
			}
		} else {
			hoveredTheme = null;
			hoverScale.set(1);
			previewOpacity.set(0);
		}
	}
	
	function openUploadDialog() {
		showUploadDialog = true;
		uploadOpacity.set(1);
	}
	
	function closeUploadDialog() {
		uploadOpacity.set(0);
		setTimeout(() => {
			showUploadDialog = false;
			uploadProgress = 0;
			errorMessage = '';
		}, 300);
	}
	
	function handleFileUpload(event: Event) {
		const files = (event.target as HTMLInputElement).files;
		if (!files || files.length === 0) return;
		
		uploadThemeFiles(files);
	}
	
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;
		
		uploadThemeFiles(files);
	}
	
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}
	
	async function uploadThemeFiles(files: FileList) {
		const imageFiles = Array.from(files).filter(file => isImageFile(file.name));
		
		if (imageFiles.length === 0) {
			errorMessage = 'No valid image files found';
			return;
		}
		
		isUploading = true;
		uploadProgress = 0;
		errorMessage = '';
		
		try {
			const formData = new FormData();
			
			// Generate theme name from first file or use timestamp
			const themeName = `Custom Theme ${new Date().toLocaleDateString()}`;
			formData.append('themeName', themeName);
			
			// Add all image files
			imageFiles.forEach((file, index) => {
				formData.append('images', file);
				uploadProgress = (index / imageFiles.length) * 50; // First 50% for file prep
			});
			
			// Upload to server
			const response = await wallpaperAPI.uploadImages(formData);
			
			if (response.success) {
				uploadProgress = 100;
				
				// Add new theme to local list
				const newTheme = {
					id: `custom_${Date.now()}`,
					name: themeName,
					description: `Custom theme with ${imageFiles.length} images`,
					thumbnail: URL.createObjectURL(imageFiles[0]),
					imageCount: imageFiles.length,
					isBuiltIn: false,
					tags: ['custom', 'uploaded']
				};
				
				themes = [...themes, newTheme];
				filteredThemes = themes;
				
				// Auto-select the new theme
				await selectTheme(newTheme);
				
				closeUploadDialog();
			} else {
				throw new Error(response.error || 'Upload failed');
			}
		} catch (error) {
			console.error('Upload failed:', error);
			errorMessage = 'Upload failed. Please try again.';
		} finally {
			isUploading = false;
		}
	}
	
	function openThemeSettings(theme: any) {
		selectedTheme = theme;
		loadThemeSettings();
		showThemeSettings = true;
		settingsOpacity.set(1);
	}
	
	function closeThemeSettings() {
		settingsOpacity.set(0);
		setTimeout(() => {
			showThemeSettings = false;
		}, 300);
	}
	
	function loadThemeSettings() {
		if (!selectedTheme) return;
		
		const themeSettings = $settingsStore.themeSettings?.[selectedTheme.id] || {};
		currentThemeSettings = {
			transitionDuration: themeSettings.transitionDuration || 30,
			autoTransition: themeSettings.autoTransition !== false,
			transitionType: themeSettings.transitionType || 'fade',
			shuffleOrder: themeSettings.shuffleOrder || false
		};
	}
	
	async function saveThemeSettings() {
		if (!selectedTheme) return;
		
		try {
			const newSettings = {
				...$settingsStore,
				themeSettings: {
					...$settingsStore.themeSettings,
					[selectedTheme.id]: currentThemeSettings
				}
			};
			
			await settingsStore.update(newSettings);
			
			// Apply settings to wallpaper store
			wallpaperStore.setAutoTransition(currentThemeSettings.autoTransition);
			wallpaperStore.setCycleDuration(currentThemeSettings.transitionDuration * 1000);
			wallpaperStore.setTransitionType(currentThemeSettings.transitionType);
			
			closeThemeSettings();
			dispatch('settingsUpdate', { theme: selectedTheme, settings: currentThemeSettings });
		} catch (error) {
			console.error('Failed to save theme settings:', error);
			errorMessage = 'Failed to save settings';
		}
	}
	
	async function deleteTheme(theme: any) {
		if (theme.isBuiltIn) return;
		
		if (!confirm(`Are you sure you want to delete "${theme.name}"?`)) return;
		
		try {
			await wallpaperAPI.deleteTheme(theme.id);
			themes = themes.filter(t => t.id !== theme.id);
			filteredThemes = filteredThemes.filter(t => t.id !== theme.id);
			
			// If this was the current theme, switch to a built-in theme
			if (currentTheme === theme.id) {
				await selectTheme(builtInThemes[0]);
			}
		} catch (error) {
			console.error('Failed to delete theme:', error);
			errorMessage = 'Failed to delete theme';
		}
	}
	
	onMount(async () => {
		await loadThemes();
	});
</script>

<div 
	class="theme-selector"
	style="
		--text-color: {adaptedColors.text};
		--text-secondary: {adaptedColors.textSecondary};
		--bg-color: {adaptedColors.background};
		--bg-hover: {adaptedColors.backgroundHover};
		--border-color: {adaptedColors.border};
		--accent-color: {adaptedColors.accent};
		--shadow-color: {adaptedColors.shadow};
	"
>
	<!-- Header -->
	<div class="selector-header">
		<div class="header-content">
			<h2>Wallpaper Themes</h2>
			<p>Choose from beautiful curated collections or upload your own</p>
		</div>
		
		<div class="header-actions">
			<div class="search-container">
				<input
					type="text"
					placeholder="Search themes..."
					bind:value={searchQuery}
					on:input={debouncedSearch}
					class="search-input"
				/>
				<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8"/>
					<path d="m21 21-4.35-4.35"/>
				</svg>
			</div>
			
			<button class="upload-button" on:click={openUploadDialog}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="17,8 12,3 7,8"/>
					<line x1="12" y1="3" x2="12" y2="15"/>
				</svg>
				Upload Theme
			</button>
		</div>
	</div>
	
	{#if errorMessage}
		<div class="error-message">
			{errorMessage}
			<button class="dismiss-error" on:click={() => errorMessage = ''}>×</button>
		</div>
	{/if}
	
	<!-- Themes Grid -->
	<div class="themes-grid" bind:this={themesContainer}>
		{#each filteredThemes as theme (theme.id)}
			<div
				class="theme-card"
				class:selected={selectedTheme?.id === theme.id}
				class:hovered={hoveredTheme?.id === theme.id}
				on:click={() => selectTheme(theme)}
				on:mouseenter={() => handleThemeHover(theme, true)}
				on:mouseleave={() => handleThemeHover(theme, false)}
				role="button"
				tabindex="0"
				on:keydown={(e) => e.key === 'Enter' && selectTheme(theme)}
				aria-label="Select {theme.name} theme"
			>
				<div class="theme-thumbnail">
					<img
						src={theme.thumbnail}
						alt={theme.name}
						loading="lazy"
						on:error={(e) => {
							e.target.src = '/placeholder-theme.jpg';
						}}
					/>
					
					<div class="theme-overlay">
						<div class="image-count">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
								<circle cx="9" cy="9" r="2"/>
								<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
							</svg>
							{theme.imageCount}
						</div>
						
						{#if !theme.isBuiltIn}
							<button
								class="delete-theme"
								on:click|stopPropagation={() => deleteTheme(theme)}
								title="Delete theme"
								aria-label="Delete {theme.name} theme"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="m3 6 3 0m0 0a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2m-12 0v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/>
									<line x1="10" y1="11" x2="10" y2="17"/>
									<line x1="14" y1="11" x2="14" y2="17"/>
								</svg>
							</button>
						{/if}
					</div>
					
					<div class="selection-indicator">
						{#if selectedTheme?.id === theme.id}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
								<polyline points="20,6 9,17 4,12"/>
							</svg>
						{/if}
					</div>
				</div>
				
				<div class="theme-info">
					<h3 class="theme-name">{theme.name}</h3>
					<p class="theme-description">{theme.description}</p>
					
					<div class="theme-actions">
						{#if theme.tags}
							<div class="theme-tags">
								{#each theme.tags.slice(0, 2) as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}
						
						<button
							class="settings-button"
							on:click|stopPropagation={() => openThemeSettings(theme)}
							title="Theme settings"
							aria-label="Settings for {theme.name}"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="3"/>
								<path d="m12 1 0 6m0 6 0 6"/>
								<path d="m1 12 6 0m6 0 6 0"/>
							</svg>
						</button>
					</div>
				</div>
			</div>
		{/each}
		
		{#if filteredThemes.length === 0}
			<div class="empty-state">
				{#if searchQuery}
					<p>No themes match "{searchQuery}"</p>
				{:else}
					<p>No themes available</p>
				{/if}
			</div>
		{/if}
	</div>
	
	<!-- Preview Overlay -->
	{#if previewImage}
		<div 
			class="preview-overlay" 
			style="opacity: {$previewOpacity}"
			role="img"
			aria-label="Theme preview"
		>
			<img src={previewImage} alt="Theme preview" />
		</div>
	{/if}
</div>

<!-- Upload Dialog -->
{#if showUploadDialog}
	<div 
		class="upload-modal"
		style="opacity: {$uploadOpacity}"
		on:click={closeUploadDialog}
	>
		<div class="upload-dialog" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>Upload Custom Theme</h3>
				<button class="close-button" on:click={closeUploadDialog}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			
			<div class="dialog-content">
				<div 
					class="upload-area"
					class:uploading={isUploading}
					on:drop={handleDrop}
					on:dragover={handleDragOver}
				>
					{#if isUploading}
						<div class="upload-progress">
							<div class="progress-bar">
								<div class="progress-fill" style="width: {uploadProgress}%"></div>
							</div>
							<p>Uploading... {uploadProgress}%</p>
						</div>
					{:else}
						<div class="upload-prompt">
							<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
								<polyline points="17,8 12,3 7,8"/>
								<line x1="12" y1="3" x2="12" y2="15"/>
							</svg>
							<h4>Drag & drop images here</h4>
							<p>or click to select files</p>
							<p class="file-info">Supports: JPG, PNG, WebP, GIF</p>
						</div>
					{/if}
					
					<input
						type="file"
						multiple
						accept="image/*"
						bind:this={uploadInput}
						on:change={handleFileUpload}
						class="file-input"
						disabled={isUploading}
					/>
				</div>
				
				{#if errorMessage}
					<div class="upload-error">
						{errorMessage}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Theme Settings Dialog -->
{#if showThemeSettings && selectedTheme}
	<div 
		class="settings-modal"
		style="opacity: {$settingsOpacity}"
		on:click={closeThemeSettings}
	>
		<div class="settings-dialog" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>Settings for {selectedTheme.name}</h3>
				<button class="close-button" on:click={closeThemeSettings}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			
			<div class="dialog-content">
				<div class="settings-grid">
					<div class="setting-group">
						<label class="setting-label">
							<input 
								type="checkbox" 
								bind:checked={currentThemeSettings.autoTransition}
							/>
							<span>Auto-transition wallpapers</span>
						</label>
					</div>
					
					<div class="setting-group">
						<label class="setting-label">Transition duration (seconds)</label>
						<input
							type="range"
							min="5"
							max="300"
							bind:value={currentThemeSettings.transitionDuration}
							class="setting-slider"
						/>
						<span class="setting-value">{currentThemeSettings.transitionDuration}s</span>
					</div>
					
					<div class="setting-group">
						<label class="setting-label">Transition effect</label>
						<select bind:value={currentThemeSettings.transitionType} class="setting-select">
							<option value="fade">Fade</option>
							<option value="slide">Slide</option>
							<option value="zoom">Zoom</option>
							<option value="blur">Blur</option>
						</select>
					</div>
					
					<div class="setting-group">
						<label class="setting-label">
							<input 
								type="checkbox" 
								bind:checked={currentThemeSettings.shuffleOrder}
							/>
							<span>Shuffle image order</span>
						</label>
					</div>
				</div>
			</div>
			
			<div class="dialog-actions">
				<button class="cancel-button" on:click={closeThemeSettings}>Cancel</button>
				<button class="save-button" on:click={saveThemeSettings}>Save Settings</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.theme-selector {
		width: 100%;
		color: var(--text-color);
	}
	
	.selector-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 24px;
		gap: 24px;
	}
	
	.header-content h2 {
		margin: 0 0 4px 0;
		font-size: 24px;
		font-weight: 600;
		color: var(--text-color);
	}
	
	.header-content p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 14px;
	}
	
	.header-actions {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-shrink: 0;
	}
	
	.search-container {
		position: relative;
	}
	
	.search-input {
		padding: 8px 16px 8px 40px;
		border: 1px solid var(--border-color);
		border-radius: 12px;
		background: var(--bg-color);
		color: var(--text-color);
		font-size: 14px;
		width: 200px;
		transition: all 0.3s ease;
	}
	
	.search-input:focus {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
	}
	
	.search-input::placeholder {
		color: var(--text-secondary);
	}
	
	.search-icon {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-secondary);
	}
	
	.upload-button {
		background: var(--accent-color);
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: all 0.3s ease;
		white-space: nowrap;
	}
	
	.upload-button:hover {
		background: color-mix(in srgb, var(--accent-color) 80%, black);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px var(--shadow-color);
	}
	
	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid rgba(244, 67, 54, 0.3);
		color: #f44336;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 14px;
	}
	
	.dismiss-error {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 18px;
		padding: 0;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.themes-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 20px;
	}
	
	.theme-card {
		background: var(--bg-color);
		border: 2px solid var(--border-color);
		border-radius: 16px;
		overflow: hidden;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}
	
	.theme-card:hover {
		transform: translateY(-4px);
		border-color: var(--accent-color);
		box-shadow: 0 12px 32px var(--shadow-color);
	}
	
	.theme-card.selected {
		border-color: var(--accent-color);
		box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
	}
	
	.theme-thumbnail {
		position: relative;
		width: 100%;
		height: 160px;
		overflow: hidden;
	}
	
	.theme-thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s ease;
	}
	
	.theme-card:hover .theme-thumbnail img {
		transform: scale(1.05);
	}
	
	.theme-overlay {
		position: absolute;
		top: 8px;
		left: 8px;
		right: 8px;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	
	.image-count {
		background: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	
	.delete-theme {
		background: rgba(244, 67, 54, 0.8);
		color: white;
		border: none;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		opacity: 0;
	}
	
	.theme-card:hover .delete-theme {
		opacity: 1;
	}
	
	.delete-theme:hover {
		background: rgba(244, 67, 54, 1);
		transform: scale(1.1);
	}
	
	.selection-indicator {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 32px;
		height: 32px;
		background: var(--accent-color);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		opacity: 0;
		transform: scale(0.8);
		transition: all 0.3s ease;
	}
	
	.theme-card.selected .selection-indicator {
		opacity: 1;
		transform: scale(1);
	}
	
	.theme-info {
		padding: 16px;
	}
	
	.theme-name {
		margin: 0 0 4px 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--text-color);
	}
	
	.theme-description {
		margin: 0 0 12px 0;
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.4;
	}
	
	.theme-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	
	.theme-tags {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	
	.tag {
		background: var(--bg-hover);
		color: var(--text-secondary);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	
	.settings-button {
		background: var(--bg-hover);
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		width: 28px;
		height: 28px;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}
	
	.settings-button:hover {
		background: var(--accent-color);
		border-color: var(--accent-color);
		color: white;
	}
	
	.empty-state {
		grid-column: 1 / -1;
		text-align: center;
		padding: 60px 20px;
		color: var(--text-secondary);
		font-size: 16px;
	}
	
	.preview-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: -1;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}
	
	.preview-overlay img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	
	/* Upload Dialog */
	.upload-modal,
	.settings-modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}
	
	.upload-dialog,
	.settings-dialog {
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
	}
	
	.upload-area {
		border: 2px dashed rgba(255, 255, 255, 0.3);
		border-radius: 12px;
		padding: 40px 20px;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s ease;
		position: relative;
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.upload-area:hover {
		border-color: var(--accent-color);
		background: rgba(76, 175, 80, 0.05);
	}
	
	.upload-area.uploading {
		cursor: not-allowed;
		border-color: var(--accent-color);
		background: rgba(76, 175, 80, 0.1);
	}
	
	.file-input {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	
	.upload-prompt h4 {
		margin: 16px 0 8px 0;
		font-size: 18px;
		color: white;
		font-weight: 600;
	}
	
	.upload-prompt p {
		margin: 0 0 8px 0;
		color: rgba(255, 255, 255, 0.7);
		font-size: 14px;
	}
	
	.file-info {
		font-size: 12px !important;
		color: rgba(255, 255, 255, 0.5) !important;
	}
	
	.upload-progress {
		width: 100%;
	}
	
	.progress-bar {
		width: 100%;
		height: 8px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 12px;
	}
	
	.progress-fill {
		height: 100%;
		background: var(--accent-color);
		border-radius: 4px;
		transition: width 0.3s ease;
	}
	
	.upload-progress p {
		margin: 0;
		color: white;
		font-size: 14px;
		font-weight: 500;
	}
	
	.upload-error {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid rgba(244, 67, 54, 0.3);
		color: #f44336;
		padding: 12px;
		border-radius: 8px;
		margin-top: 16px;
		font-size: 14px;
		text-align: center;
	}
	
	/* Settings Dialog */
	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	
	.setting-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	
	.setting-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		font-weight: 500;
	}
	
	.setting-label input[type="checkbox"] {
		width: 16px;
		height: 16px;
		accent-color: var(--accent-color);
	}
	
	.setting-slider {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		outline: none;
		background: rgba(255, 255, 255, 0.2);
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
	}
	
	.setting-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--accent-color);
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}
	
	.setting-value {
		font-size: 14px;
		color: var(--accent-color);
		font-weight: 600;
		text-align: center;
	}
	
	.setting-select {
		padding: 8px 12px;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: var(--bg-color);
		color: var(--text-color);
		font-size: 14px;
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
		background: var(--accent-color);
		color: white;
	}
	
	.save-button:hover {
		background: color-mix(in srgb, var(--accent-color) 80%, black);
	}
	
	@media (max-width: 768px) {
		.selector-header {
			flex-direction: column;
			gap: 16px;
		}
		
		.header-actions {
			width: 100%;
			justify-content: space-between;
		}
		
		.search-input {
			width: 150px;
		}
		
		.themes-grid {
			grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
			gap: 16px;
		}
		
		.upload-dialog,
		.settings-dialog {
			width: 95vw;
			max-height: 85vh;
		}
		
		.dialog-content {
			max-height: 400px;
			overflow-y: auto;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.theme-card,
		.theme-thumbnail img,
		.upload-area {
			transition: none !important;
		}
		
		.theme-card:hover {
			transform: scale(1.02);
		}
	}
</style>
