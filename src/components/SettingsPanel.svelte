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
	import { debounce, formatFileSize } from '$lib/utils';
	import { PerformanceMonitor } from '$lib/performance';
	import { getAllObjects, getObjectsByCategory, OBJECT_CATEGORIES } from '$lib/objects';
	import Object3D from './Object3D.svelte';
	
	export let settings: any;
	export let wallpapers: any;
	
	const dispatch = createEventDispatcher();
	
	let panelElement: HTMLElement;
	let activeTab = 'general';
	let showResetConfirm = false;
	let showImportDialog = false;
	let importData = '';
	let performanceStats = { fps: 60, memory: 0, particles: 0, objects3D: 0 };
	let isExporting = false;
	let searchQuery = '';
	let fileInput: HTMLInputElement;
	let webGLSupported = true;
	let selectedObject3D = null;
	let object3DPreviewRef = null;
	let objectBrowserCategory = 'all';
	let threeDPerformanceMode = 'high';
	let focusedElementBeforeModal: HTMLElement | null = null;
	
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
	
	let performanceMonitor: PerformanceMonitor;
	let availableObjects = [];
	let filteredObjects = [];
	let performanceUpdateInterval: number;
	
	$: filteredTabs = searchQuery 
		? tabs.filter(tab => tab.label.toLowerCase().includes(searchQuery.toLowerCase()))
		: tabs;
	
	$: if (browser && performanceMonitor) {
		updatePerformanceStats();
		loadAvailableObjects();
	}
	
	$: if (objectBrowserCategory && availableObjects.length > 0) {
		updateFilteredObjects();
	}
	
	$: threeDSettings = settings?.objects3d || {
		enabled: true,
		performanceMode: 'high',
		enableAnimations: true,
		enableGlow: true,
		enableShadows: true,
		globalScale: 1.0,
		animationSpeed: 1.0,
		autoMigration: true
	};
	
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
		
		if (path.startsWith('objects3d.')) {
			triggerPreviewUpdate();
		}
	}
	
	function updatePerformanceStats() {
		if (!performanceMonitor) return;
		
		const metrics = performanceMonitor.getMetrics({ limit: 10 });
		const latestMetrics = metrics.reduce((acc, metric) => {
			acc[metric.name] = metric.value;
			return acc;
		}, {} as Record<string, number>);
		
		performanceStats = {
			fps: Math.round(latestMetrics['fps'] || 60),
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
		} catch (error) {
			console.error('WebGL support check failed:', error);
			webGLSupported = false;
		}
	}
	
	async function loadAvailableObjects() {
		try {
			availableObjects = await getAllObjects();
		} catch (error) {
			console.error('Failed to load available objects:', error);
			availableObjects = [];
		}
	}
	
	function updateFilteredObjects() {
		if (objectBrowserCategory === 'all') {
			filteredObjects = availableObjects;
		} else {
			filteredObjects = getObjectsByCategory(objectBrowserCategory);
		}
	}
	
	function triggerPreviewUpdate() {
		if (object3DPreviewRef) {
			object3DPreviewRef.updateConfiguration?.(threeDSettings);
		}
	}
	
	async function exportSettings() {
		isExporting = true;
		try {
			const exportData = {
				version: '2.1.0',
				timestamp: new Date().toISOString(),
				settings: settings,
				bookmarks: $bookmarkStore,
				wallpapers: $wallpaperStore
			};
			
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `particle-nexus-settings-${Date.now()}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Failed to export settings:', error);
		} finally {
			isExporting = false;
		}
	}
	
	function handleImportFile(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
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
			fileInput.value = '';
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
			if (showResetConfirm) {
				showResetConfirm = false;
			} else if (showImportDialog) {
				showImportDialog = false;
			} else {
				dispatch('close');
			}
		}
	}
	
	function handleModalKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			if (showResetConfirm) {
				showResetConfirm = false;
			} else if (showImportDialog) {
				showImportDialog = false;
			}
		}
	}
	
	function trapFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		
		const focusableElements = panelElement?.querySelectorAll(
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
	
	onMount(async () => {
		focusedElementBeforeModal = document.activeElement as HTMLElement;
		
		modalScale.set(1);
		modalOpacity.set(1);
		backdropBlur.set(10);
		
		checkWebGLSupport();
		
		if (browser) {
			performanceMonitor = new PerformanceMonitor();
			performanceUpdateInterval = setInterval(updatePerformanceStats, 1000);
		}
		
		document.body.style.overflow = 'hidden';
		await tick();
		panelElement?.focus();
		
		return () => {
			document.body.style.overflow = '';
		};
	});
	
	onDestroy(() => {
		if (performanceMonitor) {
			performanceMonitor.destroy();
		}
		if (performanceUpdateInterval) {
			clearInterval(performanceUpdateInterval);
		}
		document.body.style.overflow = '';
		
		if (focusedElementBeforeModal) {
			focusedElementBeforeModal.focus();
		}
	});
</script>

<svelte:window on:keydown={handleKeyDown} />

<div 
	class="settings-modal" 
	style="backdrop-filter: blur({$backdropBlur}px)"
	on:click={() => dispatch('close')}
	on:keydown={handleKeyDown}
	role="dialog"
	aria-modal="true"
	aria-labelledby="settings-title"
>
	<div 
		class="settings-panel"
		style="transform: scale({$modalScale}); opacity: {$modalOpacity}"
		on:click|stopPropagation
		on:keydown={trapFocus}
		bind:this={panelElement}
		role="document"
		tabindex="-1"
	>
		<div class="panel-header">
			<div class="header-content">
				<h1 id="settings-title">Settings</h1>
				<label class="search-container">
					<span class="sr-only">Search settings</span>
					<input 
						type="text" 
						placeholder="Search settings..." 
						class="search-input"
						bind:value={searchQuery}
						aria-label="Search settings"
					/>
				</label>
			</div>
			<button 
				class="close-button" 
				on:click={() => dispatch('close')}
				aria-label="Close settings panel"
			>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path d="m6 6 12 12M6 18 18 6"/>
				</svg>
			</button>
		</div>
		
		<div class="panel-body">
			<nav class="settings-nav" role="tablist" aria-label="Settings categories">
				{#each filteredTabs as tab}
					<button 
						class="nav-tab" 
						class:active={activeTab === tab.id}
						on:click={() => switchTab(tab.id)}
						role="tab"
						aria-selected={activeTab === tab.id}
						aria-controls="panel-{tab.id}"
						id="tab-{tab.id}"
					>
						<span class="tab-icon" aria-hidden="true">{tab.icon}</span>
						{tab.label}
					</button>
				{/each}
			</nav>
			
			<main 
				class="settings-content" 
				style="transform: translateX({$tabSlideOffset}px)"
				role="tabpanel"
				aria-labelledby="tab-{activeTab}"
				id="panel-{activeTab}"
			>
				{#if activeTab === 'general'}
					<div class="settings-section">
						<div class="section-card">
							<h3>General Settings</h3>
							<div class="setting-row">
								<label class="setting-label">
									<span>Show welcome message on startup</span>
									<input 
										type="checkbox" 
										checked={settings?.general?.showWelcome !== false}
										on:change={(e) => updateSetting('general.showWelcome', e.currentTarget.checked)}
										aria-describedby="welcome-desc"
									/>
								</label>
								<div id="welcome-desc" class="setting-description">
									Display a welcome message when the application starts
								</div>
							</div>
							<div class="setting-row">
								<label class="setting-label">
									<span>Auto-save settings</span>
									<input 
										type="checkbox" 
										checked={settings?.general?.autoSave !== false}
										on:change={(e) => updateSetting('general.autoSave', e.currentTarget.checked)}
										aria-describedby="autosave-desc"
									/>
								</label>
								<div id="autosave-desc" class="setting-description">
									Automatically save settings changes
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'wallpaper'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Wallpaper Settings</h3>
							<div class="setting-row">
								<label class="setting-label">
									<span>Wallpaper opacity</span>
									<input 
										type="range" 
										min="0" 
										max="100" 
										value={settings?.wallpaper?.opacity || 80}
										on:input={(e) => updateSetting('wallpaper.opacity', parseInt(e.currentTarget.value))}
										aria-describedby="opacity-desc"
									/>
									<span class="range-value">{settings?.wallpaper?.opacity || 80}%</span>
								</label>
								<div id="opacity-desc" class="setting-description">
									Controls the transparency of the background wallpaper
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'particles'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Particle System</h3>
							<div class="setting-row">
								<label class="setting-label">
									<span>Enable particles</span>
									<input 
										type="checkbox" 
										checked={settings?.particles?.enabled !== false}
										on:change={(e) => updateSetting('particles.enabled', e.currentTarget.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label class="setting-label">
									<span>Particle count</span>
									<input 
										type="range" 
										min="10" 
										max="200" 
										value={settings?.particles?.count || 50}
										on:input={(e) => updateSetting('particles.count', parseInt(e.currentTarget.value))}
									/>
									<span class="range-value">{settings?.particles?.count || 50}</span>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'objects3d'}
					<div class="settings-section">
						<div class="section-card">
							<h3>3D Objects</h3>
							<div class="setting-row">
								<label class="setting-label">
									<span>Enable 3D objects</span>
									<input 
										type="checkbox" 
										checked={threeDSettings.enabled}
										on:change={(e) => updateSetting('objects3d.enabled', e.currentTarget.checked)}
									/>
								</label>
							</div>
							{#if threeDSettings.enabled}
								<div class="setting-row">
									<label class="setting-label">
										<span>Performance mode</span>
										<select 
											value={threeDSettings.performanceMode}
											on:change={(e) => updateSetting('objects3d.performanceMode', e.currentTarget.value)}
										>
											<option value="low">Low</option>
											<option value="medium">Medium</option>
											<option value="high">High</option>
										</select>
									</label>
								</div>
								<div class="setting-row">
									<label class="setting-label">
										<span>Global scale</span>
										<input 
											type="range" 
											min="0.5" 
											max="2.0" 
											step="0.1"
											value={threeDSettings.globalScale}
											on:input={(e) => updateSetting('objects3d.globalScale', parseFloat(e.currentTarget.value))}
										/>
										<span class="range-value">{threeDSettings.globalScale.toFixed(1)}x</span>
									</label>
								</div>
							{/if}
						</div>
					</div>
				{:else if activeTab === 'performance'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Performance Monitor</h3>
							<div class="performance-stats">
								<div class="stat-item">
									<span class="stat-label">FPS:</span>
									<span class="stat-value">{performanceStats.fps}</span>
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
							{#if !webGLSupported}
								<div class="section-card warning">
									<h4>⚠️ WebGL Not Supported</h4>
									<p>Your browser or device doesn't support WebGL. 3D features will be limited.</p>
								</div>
							{/if}
						</div>
					</div>
				{:else if activeTab === 'data'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Data Management</h3>
							<div class="data-actions">
								<button 
									class="action-button export" 
									on:click={exportSettings} 
									disabled={isExporting}
									aria-label="Export all settings to file"
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
									on:change={handleImportFile}
									aria-label="Import settings file"
								/>
								<button 
									class="action-button import" 
									on:click={() => fileInput.click()}
									aria-label="Import settings from file"
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
									on:click={() => showResetConfirm = true}
									aria-label="Reset all settings to defaults"
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
			</main>
		</div>
	</div>
</div>

{#if showResetConfirm}
	<div 
		class="confirm-modal" 
		on:click={() => showResetConfirm = false}
		on:keydown={handleModalKeyDown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="reset-title"
	>
		<div 
			class="confirm-dialog" 
			on:click|stopPropagation
			role="document"
		>
			<h3 id="reset-title">Reset all settings?</h3>
			<p>This will restore all settings to their default values. This action cannot be undone.</p>
			<div class="confirm-actions">
				<button 
					class="cancel-button" 
					on:click={() => showResetConfirm = false}
					aria-label="Cancel reset operation"
				>
					Cancel
				</button>
				<button 
					class="confirm-button" 
					on:click={resetToDefaults}
					aria-label="Confirm reset to defaults"
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
		on:click={() => showImportDialog = false}
		on:keydown={handleModalKeyDown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-title"
	>
		<div 
			class="confirm-dialog" 
			on:click|stopPropagation
			role="document"
		>
			<h3 id="import-title">Import Settings</h3>
			<p>This will replace your current settings. Are you sure?</p>
			<div class="confirm-actions">
				<button 
					class="cancel-button" 
					on:click={() => showImportDialog = false}
					aria-label="Cancel import operation"
				>
					Cancel
				</button>
				<button 
					class="confirm-button" 
					on:click={importSettings}
					aria-label="Confirm import settings"
				>
					Import
				</button>
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
	
	.search-container {
		display: block;
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
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
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
	
	.close-button:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}
	
	.close-button:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
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
	
	.nav-tab:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}
	
	.nav-tab:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: -2px;
	}
	
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
	
	.setting-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		color: rgba(255, 255, 255, 0.9);
		font-size: 14px;
		cursor: pointer;
	}
	
	.setting-description {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		margin-top: 4px;
		margin-left: 0;
	}
	
	.setting-row input[type="checkbox"] {
		width: 18px;
		height: 18px;
		accent-color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
	}
	
	.setting-row input[type="range"] {
		flex: 1;
		max-width: 150px;
		margin-right: 12px;
		cursor: pointer;
	}
	
	.setting-row select {
		padding: 6px 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
		cursor: pointer;
	}
	
	.setting-row select:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
	}
	
	.range-value {
		min-width: 40px;
		text-align: center;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.performance-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 16px;
		margin-bottom: 20px;
	}
	
	.stat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.stat-label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
	}
	
	.stat-value {
		font-size: 14px;
		font-weight: 600;
		color: white;
	}
	
	.data-actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	
	.action-button {
		padding: 12px 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.action-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
		color: white;
	}
	
	.action-button:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
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
		font-size: 14px;
	}
	
	.confirm-button {
		background: rgba(239, 68, 68, 0.2);
		border-color: rgba(239, 68, 68, 0.3);
	}
	
	.cancel-button:hover, .confirm-button:hover {
		background: rgba(255, 255, 255, 0.15);
	}
	
	.cancel-button:focus, .confirm-button:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
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
			max-height: 120px;
			overflow-x: auto;
			overflow-y: hidden;
			display: flex;
			border-right: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		}
		
		.nav-tab {
			white-space: nowrap;
			min-width: auto;
		}
		
		.settings-content {
			padding: 16px;
		}
		
		.data-actions {
			flex-direction: column;
		}
		
		.performance-stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
