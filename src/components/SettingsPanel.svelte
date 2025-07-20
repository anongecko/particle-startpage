<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, elasticOut, quintOut } from 'svelte/easing';
	import { settingsStore } from '$stores/settings';
	import { wallpaperStore } from '$stores/wallpaper';
	import { bookmarkStore } from '$stores/bookmarks';
	import { colorStore } from '$stores/color';
	import { object3DAnalytics } from '$stores/bookmarks';
	import { settingsAPI } from '$lib/api';
	import { debounce, formatFileSize, PerformanceMonitor } from '$lib/utils';
	import { getAllObjects, getObjectsByCategory, OBJECT_CATEGORIES } from '$lib/objects';
	import Object3D from './Object3D.svelte';
	
	interface Props {
		settings: any;
		wallpapers: any;
	}
	
	let { settings, wallpapers }: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let panelElement: HTMLElement = $state();
	let activeTab = $state('general');
	let showResetConfirm = $state(false);
	let showImportDialog = $state(false);
	let importData = $state('');
	let performanceStats = $state({ fps: 60, memory: 0, particles: 0, objects3D: 0 });
	let isExporting = $state(false);
	let searchQuery = $state('');
	let fileInput: HTMLInputElement = $state();
	let webGLSupported = $state(true);
	let selectedObject3D = $state(null);
	let object3DPreviewRef = $state(null);
	let objectBrowserCategory = $state('all');
	let threeDPerformanceMode = $state('high');
	let performanceMonitor: PerformanceMonitor = $state();
	let availableObjects = $state([]);
	let filteredObjects = $state([]);
	
	const modalScale = spring(0.8, { stiffness: 0.3, damping: 0.8 });
	const modalOpacity = tweened(0, { duration: 300, easing: cubicOut });
	const backdropBlur = tweened(0, { duration: 400, easing: cubicOut });
	const tabSlideOffset = tweened(0, { duration: 250, easing: cubicOut });
	const previewScale = spring(1, { stiffness: 0.2, damping: 0.8 });
	
	const tabs = [
		{ id: 'general', label: 'General', icon: '⚙️' },
		{ id: 'wallpaper', label: 'Wallpaper', icon: '🖼️' },
		{ id: 'particles', label: 'Particles', icon: '✨' },
		{ id: 'bookmarks', label: 'Bookmarks', icon: '📚' },
		{ id: 'objects3d', label: '3D Objects', icon: '🎯' },
		{ id: 'appearance', label: 'Appearance', icon: '🎨' },
		{ id: 'performance', label: 'Performance', icon: '⚡' },
		{ id: 'keyboard', label: 'Shortcuts', icon: '⌨️' },
		{ id: 'data', label: 'Data', icon: '💾' }
	];
	
	let filteredTabs = $derived(searchQuery 
		? tabs.filter(tab => tab.label.toLowerCase().includes(searchQuery.toLowerCase()))
		: tabs);
	
	let threeDSettings = $derived(settings?.objects3d || {
		enabled: true,
		performanceMode: 'high',
		enableAnimations: true,
		enableGlow: true,
		enableShadows: true,
		globalScale: 1.0,
		animationSpeed: 1.0,
		autoMigration: true
	});
	
	const debouncedSettingsUpdate = debounce((newSettings: any) => {
		settingsStore.update(newSettings);
		dispatch('settingsUpdate', newSettings);
	}, 150);
	
	function updateSetting(path: string, value: any) {
		const keys = path.split('.');
		const newSettings = { ...settings };
		let current = newSettings;
		
		for (let i = 0; i < keys.length - 1; i++) {
			if (!current[keys[i]]) current[keys[i]] = {};
			current = current[keys[i]];
		}
		
		current[keys[keys.length - 1]] = value;
		debouncedSettingsUpdate(newSettings);
		
		// Trigger real-time preview for 3D settings
		if (path.startsWith('objects3d.')) {
			triggerPreviewUpdate();
		}
	}
	
	function updatePerformanceStats() {
		if (!performanceMonitor) return;
		
		performanceStats = {
			fps: Math.round(performanceMonitor.getAverage('frame') || 60),
			memory: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 0,
			particles: wallpapers?.particleCount || 0,
			objects3D: $object3DAnalytics?.activeObjects || 0
		};
	}
	
	function switchTab(tabId: string) {
		const currentIndex = tabs.findIndex(t => t.id === activeTab);
		const newIndex = tabs.findIndex(t => t.id === tabId);
		const direction = newIndex > currentIndex ? 1 : -1;
		
		tabSlideOffset.set(direction * 100);
		
		setTimeout(() => {
			activeTab = tabId;
			tabSlideOffset.set(-direction * 100);
			
			setTimeout(() => {
				tabSlideOffset.set(0);
			}, 50);
		}, 125);
	}
	
	function checkWebGLSupport() {
		try {
			const canvas = document.createElement('canvas');
			const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
			webGLSupported = !!gl;
			
			if (gl) {
				const ext = gl.getExtension('WEBGL_debug_renderer_info');
				const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Unknown';
				console.log('WebGL Renderer:', renderer);
			}
		} catch (e) {
			webGLSupported = false;
		}
	}
	
	function loadAvailableObjects() {
		availableObjects = getAllObjects();
		updateFilteredObjects();
	}
	
	function updateFilteredObjects() {
		if (objectBrowserCategory === 'all') {
			filteredObjects = availableObjects;
		} else {
			filteredObjects = getObjectsByCategory(objectBrowserCategory);
		}
	}
	
	function selectObject(objectConfig: any) {
		selectedObject3D = objectConfig;
		previewScale.set(1.1);
		setTimeout(() => previewScale.set(1), 200);
		
		// Update preview
		triggerPreviewUpdate();
	}
	
	function triggerPreviewUpdate() {
		if (object3DPreviewRef) {
			object3DPreviewRef.updateConfiguration(threeDSettings);
		}
	}
	
	function apply3DPerformancePreset(preset: string) {
		threeDPerformanceMode = preset;
		
		const presets = {
			low: {
				enableAnimations: false,
				enableGlow: false,
				enableShadows: false,
				globalScale: 0.8,
				animationSpeed: 0.5
			},
			medium: {
				enableAnimations: true,
				enableGlow: false,
				enableShadows: false,
				globalScale: 0.9,
				animationSpeed: 0.8
			},
			high: {
				enableAnimations: true,
				enableGlow: true,
				enableShadows: true,
				globalScale: 1.0,
				animationSpeed: 1.0
			},
			ultra: {
				enableAnimations: true,
				enableGlow: true,
				enableShadows: true,
				globalScale: 1.2,
				animationSpeed: 1.5
			}
		};
		
		const presetConfig = presets[preset];
		if (presetConfig) {
			Object.entries(presetConfig).forEach(([key, value]) => {
				updateSetting(`objects3d.${key}`, value);
			});
		}
	}
	
	async function exportSettings() {
		isExporting = true;
		try {
			const exportData = {
				version: '2.0.0',
				settings,
				wallpapers: $wallpaperStore,
				bookmarks: $bookmarkStore,
				exportedAt: Date.now(),
				includes3D: true
			};
			
			const blob = new Blob([JSON.stringify(exportData, null, 2)], {
				type: 'application/json'
			});
			
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `startpage-settings-${new Date().toISOString().split('T')[0]}.json`;
			link.click();
			
			URL.revokeObjectURL(url);
		} finally {
			isExporting = false;
		}
	}
	
	function handleImportFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				importData = e.target?.result as string;
				showImportDialog = true;
			} catch (error) {
				console.error('Failed to read import file:', error);
			}
		};
		reader.readAsText(file);
	}
	
	function importSettings() {
		try {
			const data = JSON.parse(importData);
			if (data.settings) {
				settingsStore.set(data.settings);
			}
			showImportDialog = false;
			importData = '';
		} catch (error) {
			console.error('Failed to import settings:', error);
		}
	}
	
	function resetToDefaults() {
		settingsStore.reset();
		showResetConfirm = false;
	}
	
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			if (showResetConfirm) {
				showResetConfirm = false;
			} else if (showImportDialog) {
				showImportDialog = false;
			} else {
				dispatch('close');
			}
		} else if (event.key === 'Tab') {
			// Allow natural tab navigation
			return;
		}
	}
	
	function handleModalClick(event: MouseEvent) {
		// Only close if clicking the backdrop, not the panel
		if (event.target === event.currentTarget) {
			dispatch('close');
		}
	}
	
	function handleConfirmKeyDown(event: KeyboardEvent, action: () => void) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			action();
		}
	}
	
	onMount(async () => {
		modalScale.set(1);
		modalOpacity.set(1);
		backdropBlur.set(10);
		
		checkWebGLSupport();
		
		if (browser) {
			performanceMonitor = new PerformanceMonitor();
			performanceMonitor.start();
			updatePerformanceStats();
			loadAvailableObjects();
		}
		
		document.body.style.overflow = 'hidden';
		
		// Focus the panel for keyboard navigation
		if (panelElement) {
			panelElement.focus();
		}
		
		return () => {
			document.body.style.overflow = '';
		};
	});
	
	onDestroy(() => {
		if (performanceMonitor) {
			performanceMonitor.stop();
		}
		document.body.style.overflow = '';
	});
	
	// Reactive updates
	$effect(() => {
		if (browser) {
			updatePerformanceStats();
			if (objectBrowserCategory && availableObjects.length > 0) {
				updateFilteredObjects();
			}
		}
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

<div 
	class="settings-modal"
	style="backdrop-filter: blur({$backdropBlur}px)"
	onclick={handleModalClick}
	onkeydown={(e) => handleConfirmKeyDown(e, () => dispatch('close'))}
	role="dialog"
	aria-modal="true"
	aria-labelledby="settings-title"
	tabindex="-1"
>
	<div 
		class="settings-panel"
		style="transform: scale({$modalScale}); opacity: {$modalOpacity}"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		bind:this={panelElement}
		tabindex="0"
		role="document"
		aria-labelledby="settings-title"
	>
		<div class="panel-header">
			<div class="header-content">
				<h1 id="settings-title">Settings</h1>
				<input 
					type="text" 
					placeholder="Search settings..." 
					class="search-input"
					bind:value={searchQuery}
					aria-label="Search settings"
				/>
			</div>
			<button 
				class="close-button" 
				onclick={() => dispatch('close')}
				aria-label="Close settings"
				type="button"
			>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path d="m6 6 12 12M6 18 18 6"/>
				</svg>
			</button>
		</div>
		
		<div class="panel-body">
			<div class="settings-nav" role="tablist" aria-label="Settings categories">
				{#each filteredTabs as tab}
					<button 
						class="nav-tab" 
						class:active={activeTab === tab.id}
						onclick={() => switchTab(tab.id)}
						role="tab"
						aria-selected={activeTab === tab.id}
						aria-controls={`panel-${tab.id}`}
						id={`tab-${tab.id}`}
						type="button"
					>
						<span class="tab-icon" aria-hidden="true">{tab.icon}</span>
						{tab.label}
					</button>
				{/each}
			</div>
			
			<div 
				class="settings-content"
				style="transform: translateX({$tabSlideOffset}px)"
				role="tabpanel"
				aria-labelledby={`tab-${activeTab}`}
				id={`panel-${activeTab}`}
				tabindex="0"
			>
				{#if activeTab === 'general'}
					<div class="settings-section">
						<div class="section-card">
							<h3>General Settings</h3>
							<div class="setting-row">
								<label>
									<span>Show welcome message on startup</span>
									<input 
										type="checkbox" 
										checked={settings?.general?.showWelcome !== false}
										onchange={(e) => updateSetting('general.showWelcome', e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Auto-save settings</span>
									<input 
										type="checkbox" 
										checked={settings?.general?.autoSave !== false}
										onchange={(e) => updateSetting('general.autoSave', e.target.checked)}
									/>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'wallpaper'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Wallpaper Settings</h3>
							<div class="setting-row">
								<label>
									<span>Auto-cycle wallpapers</span>
									<input 
										type="checkbox" 
										checked={settings?.wallpaper?.autoCycle !== false}
										onchange={(e) => updateSetting('wallpaper.autoCycle', e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Cycle interval (minutes)</span>
									<input 
										type="range" 
										min="1" 
										max="60" 
										value={settings?.wallpaper?.cycleInterval || 10}
										oninput={(e) => updateSetting('wallpaper.cycleInterval', parseInt(e.target.value))}
										aria-label="Wallpaper cycle interval in minutes"
									/>
									<span class="range-value">{settings?.wallpaper?.cycleInterval || 10}m</span>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'particles'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Particle System</h3>
							<div class="setting-row">
								<label>
									<span>Enable particles</span>
									<input 
										type="checkbox" 
										checked={settings?.particles?.enabled !== false}
										onchange={(e) => updateSetting('particles.enabled', e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Particle count</span>
									<input 
										type="range" 
										min="10" 
										max="200" 
										value={settings?.particles?.count || 80}
										oninput={(e) => updateSetting('particles.count', parseInt(e.target.value))}
										aria-label="Number of particles"
									/>
									<span class="range-value">{settings?.particles?.count || 80}</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Connection distance</span>
									<input 
										type="range" 
										min="50" 
										max="200" 
										value={settings?.particles?.connectionDistance || 120}
										oninput={(e) => updateSetting('particles.connectionDistance', parseInt(e.target.value))}
										aria-label="Particle connection distance in pixels"
									/>
									<span class="range-value">{settings?.particles?.connectionDistance || 120}px</span>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'bookmarks'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Bookmark Management</h3>
							<div class="setting-row">
								<label>
									<span>Auto-detect favicons</span>
									<input 
										type="checkbox" 
										checked={settings?.bookmarks?.autoFavicon !== false}
										onchange={(e) => updateSetting('bookmarks.autoFavicon', e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Show bookmark descriptions</span>
									<input 
										type="checkbox" 
										checked={settings?.bookmarks?.showDescriptions !== false}
										onchange={(e) => updateSetting('bookmarks.showDescriptions', e.target.checked)}
									/>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'objects3d'}
					<div class="settings-section">
						{#if !webGLSupported}
							<div class="section-card warning">
								<h3>⚠️ WebGL Not Supported</h3>
								<p>Your browser doesn't support WebGL, which is required for 3D objects. The page will automatically fall back to 2D icons.</p>
								<div class="webgl-info">
									<button class="action-button" onclick={checkWebGLSupport} type="button">
										Recheck WebGL Support
									</button>
								</div>
							</div>
						{/if}
						
						<div class="section-card">
							<h3>3D Object Settings</h3>
							<div class="setting-row">
								<label>
									<span>Enable 3D objects</span>
									<input 
										type="checkbox" 
										checked={threeDSettings.enabled}
										disabled={!webGLSupported}
										onchange={(e) => updateSetting('objects3d.enabled', e.target.checked)}
									/>
								</label>
							</div>
							
							<div class="setting-group">
								<h4>Performance Preset</h4>
								<div class="preset-buttons" role="group" aria-label="3D performance presets">
									{#each ['low', 'medium', 'high', 'ultra'] as preset}
										<button 
											class="preset-button"
											class:active={threeDPerformanceMode === preset}
											disabled={!threeDSettings.enabled}
											onclick={() => apply3DPerformancePreset(preset)}
											aria-pressed={threeDPerformanceMode === preset}
											type="button"
										>
											{preset.charAt(0).toUpperCase() + preset.slice(1)}
										</button>
									{/each}
								</div>
							</div>
							
							{#if threeDSettings.enabled}
								<div class="setting-row">
									<label>
										<span>Global scale</span>
										<input 
											type="range" 
											min="0.5" 
											max="2.0" 
											step="0.1"
											value={threeDSettings.globalScale}
											oninput={(e) => updateSetting('objects3d.globalScale', parseFloat(e.target.value))}
											aria-label="Global scale multiplier for 3D objects"
										/>
										<span class="range-value">{threeDSettings.globalScale}×</span>
									</label>
								</div>
								
								<div class="setting-row">
									<label>
										<span>Animation speed</span>
										<input 
											type="range" 
											min="0.2" 
											max="3.0" 
											step="0.1"
											value={threeDSettings.animationSpeed}
											oninput={(e) => updateSetting('objects3d.animationSpeed', parseFloat(e.target.value))}
											aria-label="Animation speed multiplier"
										/>
										<span class="range-value">{threeDSettings.animationSpeed}×</span>
									</label>
								</div>
								
								<div class="setting-row">
									<label>
										<span>Enable animations</span>
										<input 
											type="checkbox" 
											checked={threeDSettings.enableAnimations}
											onchange={(e) => updateSetting('objects3d.enableAnimations', e.target.checked)}
										/>
									</label>
								</div>
								
								<div class="setting-row">
									<label>
										<span>Enable glow effects</span>
										<input 
											type="checkbox" 
											checked={threeDSettings.enableGlow}
											onchange={(e) => updateSetting('objects3d.enableGlow', e.target.checked)}
										/>
									</label>
								</div>
								
								<div class="setting-row">
									<label>
										<span>Enable shadows</span>
										<input 
											type="checkbox" 
											checked={threeDSettings.enableShadows}
											onchange={(e) => updateSetting('objects3d.enableShadows', e.target.checked)}
										/>
									</label>
								</div>
							{/if}
						</div>
						
						{#if threeDSettings.enabled}
							<div class="section-card">
								<h3>Object Browser</h3>
								<div class="object-browser">
									<div class="browser-controls">
										<label>
											<span class="sr-only">Filter by category</span>
											<select bind:value={objectBrowserCategory} aria-label="Object category filter">
												<option value="all">All Categories</option>
												{#each OBJECT_CATEGORIES as category}
													<option value={category.id}>{category.name}</option>
												{/each}
											</select>
										</label>
									</div>
									
									<div class="object-grid" role="grid" aria-label="3D object selection">
										{#each filteredObjects.slice(0, 12) as objectConfig, index}
											<button 
												class="object-card"
												class:selected={selectedObject3D?.id === objectConfig.id}
												onclick={() => selectObject(objectConfig)}
												role="gridcell"
												aria-selected={selectedObject3D?.id === objectConfig.id}
												aria-label={`Select ${objectConfig.name} 3D object`}
												type="button"
											>
												<div class="object-preview" aria-hidden="true">
													<Object3D 
														config={objectConfig}
														scale={0.8}
														enableAnimation={false}
														staticPreview={true}
													/>
												</div>
												<div class="object-info">
													<span class="object-name">{objectConfig.name}</span>
													<span class="object-complexity">{objectConfig.complexity}</span>
												</div>
											</button>
										{/each}
									</div>
									
									{#if selectedObject3D}
										<div class="preview-section">
											<h4>Live Preview</h4>
											<div class="live-preview" style="transform: scale({$previewScale})" aria-hidden="true">
												<Object3D 
													bind:this={object3DPreviewRef}
													config={selectedObject3D}
													scale={threeDSettings.globalScale}
													enableAnimation={threeDSettings.enableAnimations}
													animationSpeed={threeDSettings.animationSpeed}
													enableGlow={threeDSettings.enableGlow}
													enableShadows={threeDSettings.enableShadows}
													previewMode={true}
												/>
											</div>
											<p class="preview-description">{selectedObject3D.description}</p>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'appearance'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Visual Appearance</h3>
							<div class="setting-row">
								<label>
									<span>UI opacity</span>
									<input 
										type="range" 
										min="20" 
										max="100" 
										value={settings?.ui?.opacity || 90}
										oninput={(e) => updateSetting('ui.opacity', parseInt(e.target.value))}
										aria-label="User interface opacity percentage"
									/>
									<span class="range-value">{settings?.ui?.opacity || 90}%</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Blur intensity</span>
									<input 
										type="range" 
										min="0" 
										max="20" 
										value={settings?.ui?.blurIntensity || 8}
										oninput={(e) => updateSetting('ui.blurIntensity', parseInt(e.target.value))}
										aria-label="Background blur intensity in pixels"
									/>
									<span class="range-value">{settings?.ui?.blurIntensity || 8}px</span>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'performance'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Performance Monitor</h3>
							<div class="performance-stats" role="group" aria-label="Performance statistics">
								<div class="stat-item">
									<span class="stat-label">FPS:</span>
									<span class="stat-value" class:warning={performanceStats.fps < 30}>{performanceStats.fps}</span>
								</div>
								<div class="stat-item">
									<span class="stat-label">Memory:</span>
									<span class="stat-value">{performanceStats.memory}MB</span>
								</div>
								<div class="stat-item">
									<span class="stat-label">Particles:</span>
									<span class="stat-value">{performanceStats.particles}</span>
								</div>
								<div class="stat-item">
									<span class="stat-label">3D Objects:</span>
									<span class="stat-value">{performanceStats.objects3D}</span>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'keyboard'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Keyboard Shortcuts</h3>
							<div class="shortcut-list" role="list">
								<div class="shortcut-item" role="listitem">
									<span>Open search:</span>
									<kbd>Ctrl + K</kbd>
								</div>
								<div class="shortcut-item" role="listitem">
									<span>Open settings:</span>
									<kbd>Ctrl + ,</kbd>
								</div>
								<div class="shortcut-item" role="listitem">
									<span>New bookmark:</span>
									<kbd>Ctrl + B</kbd>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'data'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Data Management</h3>
							<div class="data-actions">
								<button 
									class="action-button export" 
									onclick={exportSettings} 
									disabled={isExporting}
									aria-label="Export all settings to file"
									type="button"
								>
									{#if isExporting}
										<span class="spinner" aria-hidden="true"></span>
									{:else}
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
											<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
											<polyline points="7,10 12,15 17,10"/>
											<line x1="12" y1="15" x2="12" y2="3"/>
										</svg>
									{/if}
									Export Settings
								</button>
								
								<input 
									type="file" 
									accept=".json" 
									style="display: none" 
									bind:this={fileInput}
									onchange={handleImportFile}
									aria-label="Import settings file"
								/>
								<button 
									class="action-button import" 
									onclick={() => fileInput.click()}
									aria-label="Import settings from file"
									type="button"
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
										<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
										<polyline points="17,8 12,3 7,8"/>
										<line x1="12" y1="3" x2="12" y2="15"/>
									</svg>
									Import Settings
								</button>
								
								<button 
									class="action-button reset" 
									onclick={() => showResetConfirm = true}
									aria-label="Reset all settings to defaults"
									type="button"
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
										<polyline points="1,4 1,10 7,10"/>
										<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
									</svg>
									Reset to Defaults
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

{#if showResetConfirm}
	<div 
		class="confirm-modal" 
		onclick={handleModalClick}
		onkeydown={(e) => handleConfirmKeyDown(e, () => showResetConfirm = false)}
		role="dialog"
		aria-modal="true"
		aria-labelledby="reset-title"
		tabindex="-1"
	>
		<div 
			class="confirm-dialog" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
		>
			<h3 id="reset-title">Reset all settings?</h3>
			<p>This will restore all settings to their default values. This action cannot be undone.</p>
			<div class="confirm-actions">
				<button 
					class="cancel-button" 
					onclick={() => showResetConfirm = false}
					type="button"
				>
					Cancel
				</button>
				<button 
					class="confirm-button" 
					onclick={resetToDefaults}
					type="button"
				>
					Reset
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showImportDialog}
	<div 
		class="confirm-modal" 
		onclick={handleModalClick}
		onkeydown={(e) => handleConfirmKeyDown(e, () => showImportDialog = false)}
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-title"
		tabindex="-1"
	>
		<div 
			class="confirm-dialog" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
		>
			<h3 id="import-title">Import Settings</h3>
			<p>This will replace your current settings. Are you sure?</p>
			<div class="confirm-actions">
				<button 
					class="cancel-button" 
					onclick={() => showImportDialog = false}
					type="button"
				>
					Cancel
				</button>
				<button 
					class="confirm-button" 
					onclick={importSettings}
					type="button"
				>
					Import
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
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
		backdrop-filter: blur(0px);
		transition: backdrop-filter 0.4s ease;
	}
	
	.settings-panel {
		width: 90vw;
		height: 85vh;
		max-width: 1400px;
		max-height: 900px;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 24px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 32px 64px rgba(0, 0, 0, 0.4);
		outline: none;
	}
	
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px 32px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.header-content {
		display: flex;
		align-items: center;
		gap: 24px;
	}
	
	.header-content h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 600;
		color: white;
	}
	
	.search-input {
		padding: 8px 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
		width: 200px;
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
	
	.close-button {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		padding: 8px;
		border-radius: 8px;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.close-button:hover,
	.close-button:focus-visible {
		color: white;
		background: rgba(255, 255, 255, 0.1);
		outline: none;
	}
	
	.panel-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}
	
	.settings-nav {
		width: 250px;
		padding: 24px 0;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.2);
		overflow-y: auto;
	}
	
	.nav-tab {
		width: 100%;
		padding: 12px 24px;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 14px;
		transition: all 0.3s ease;
		text-align: left;
	}
	
	.nav-tab:hover,
	.nav-tab:focus-visible {
		background: rgba(255, 255, 255, 0.1);
		color: white;
		outline: none;
	}
	
	.nav-tab.active,
	.nav-tab[aria-selected="true"] {
		background: rgba(255, 255, 255, 0.15);
		color: white;
		border-right: 3px solid rgba(255, 255, 255, 0.8);
	}
	
	.tab-icon {
		font-size: 16px;
	}
	
	.settings-content {
		flex: 1;
		padding: 32px;
		overflow-y: auto;
		transition: transform 0.25s ease;
		outline: none;
	}
	
	.settings-section {
		max-width: 800px;
	}
	
	.section-card {
		background: rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 24px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		margin-bottom: 24px;
	}
	
	.section-card.warning {
		border-color: rgba(255, 193, 7, 0.3);
		background: rgba(255, 193, 7, 0.1);
	}
	
	.section-card h3 {
		margin: 0 0 20px 0;
		font-size: 18px;
		font-weight: 600;
		color: white;
	}
	
	.section-card h4 {
		margin: 16px 0 12px 0;
		font-size: 14px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.setting-row {
		margin-bottom: 20px;
	}
	
	.setting-row label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		color: rgba(255, 255, 255, 0.9);
		font-size: 14px;
	}
	
	.setting-row input[type="checkbox"] {
		width: 18px;
		height: 18px;
		accent-color: rgba(255, 255, 255, 0.8);
	}
	
	.setting-row input[type="range"] {
		flex: 1;
		max-width: 150px;
		margin-right: 12px;
	}
	
	.setting-row select {
		padding: 6px 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
	}
	
	.range-value {
		min-width: 40px;
		text-align: center;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.setting-group {
		margin-bottom: 24px;
	}
	
	.preset-buttons {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	
	.preset-button {
		padding: 8px 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.preset-button:hover:not(:disabled),
	.preset-button:focus-visible:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		color: white;
		outline: none;
	}
	
	.preset-button.active,
	.preset-button[aria-pressed="true"] {
		background: rgba(255, 255, 255, 0.2);
		color: white;
		border-color: rgba(255, 255, 255, 0.4);
	}
	
	.preset-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.object-browser {
		margin-top: 16px;
	}
	
	.browser-controls {
		margin-bottom: 16px;
	}
	
	.browser-controls select {
		width: 100%;
		max-width: 200px;
		padding: 8px 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
	}
	
	.object-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 12px;
		margin-bottom: 24px;
	}
	
	.object-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 12px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	
	.object-card:hover,
	.object-card:focus-visible {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
		outline: none;
	}
	
	.object-card.selected,
	.object-card[aria-selected="true"] {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.4);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}
	
	.object-preview {
		width: 60px;
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}
	
	.object-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	
	.object-name {
		font-size: 11px;
		color: white;
		text-align: center;
		font-weight: 500;
	}
	
	.object-complexity {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
	}
	
	.preview-section {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding-top: 20px;
	}
	
	.live-preview {
		width: 120px;
		height: 120px;
		margin: 16px auto;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.3s ease;
	}
	
	.preview-description {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
		margin: 0;
		line-height: 1.4;
	}
	
	.performance-stats {
		display: flex;
		gap: 24px;
		margin-bottom: 20px;
		padding: 16px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		flex-wrap: wrap;
	}
	
	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	
	.stat-label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
	}
	
	.stat-value {
		font-size: 18px;
		font-weight: 600;
		color: white;
	}
	
	.stat-value.warning {
		color: #ff6b6b;
	}
	
	.shortcut-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	
	.shortcut-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: rgba(255, 255, 255, 0.8);
		font-size: 14px;
	}
	
	kbd {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		padding: 4px 8px;
		font-size: 12px;
		color: white;
	}
	
	.data-actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	
	.action-button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.action-button:hover:not(:disabled),
	.action-button:focus-visible:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
		outline: none;
	}
	
	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.action-button.export {
		border-color: rgba(34, 197, 94, 0.3);
		background: rgba(34, 197, 94, 0.1);
	}
	
	.action-button.import {
		border-color: rgba(59, 130, 246, 0.3);
		background: rgba(59, 130, 246, 0.1);
	}
	
	.action-button.reset {
		border-color: rgba(239, 68, 68, 0.3);
		background: rgba(239, 68, 68, 0.1);
	}
	
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	.webgl-info {
		margin-top: 16px;
	}
	
	.confirm-modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
	}
	
	.confirm-dialog {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 24px;
		max-width: 400px;
		width: 90%;
	}
	
	.confirm-dialog h3 {
		margin: 0 0 12px 0;
		color: white;
		font-size: 18px;
	}
	
	.confirm-dialog p {
		margin: 0 0 20px 0;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;
	}
	
	.confirm-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}
	
	.cancel-button, .confirm-button {
		padding: 8px 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.confirm-button {
		background: rgba(239, 68, 68, 0.2);
		border-color: rgba(239, 68, 68, 0.3);
	}
	
	.cancel-button:hover,
	.cancel-button:focus-visible,
	.confirm-button:hover,
	.confirm-button:focus-visible {
		background: rgba(255, 255, 255, 0.15);
		outline: none;
	}
	
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
	
	@media (max-width: 768px) {
		.settings-panel {
			width: 95vw;
			height: 90vh;
		}
		
		.panel-body {
			flex-direction: column;
		}
		
		.settings-nav {
			width: 100%;
			padding: 16px 0;
			border-right: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			overflow-x: auto;
			display: flex;
		}
		
		.nav-tab {
			white-space: nowrap;
			min-width: fit-content;
		}
		
		.object-grid {
			grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.settings-panel,
		.confirm-dialog,
		.object-card,
		.live-preview {
			transition: none;
		}
		
		.spinner {
			animation: none;
		}
	}
</style>
