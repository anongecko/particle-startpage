<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, elasticOut } from 'svelte/easing';
	import { settingsStore } from '$stores/settings';
	import { wallpaperStore } from '$stores/wallpaper';
	import { bookmarkStore } from '$stores/bookmarks';
	import { colorStore } from '$stores/color';
	import { settingsAPI } from '$lib/api';
	import { debounce, formatFileSize, PerformanceMonitor } from '$lib/utils';
	
	export let settings: any;
	export let wallpapers: any;
	
	const dispatch = createEventDispatcher();
	
	let panelElement: HTMLElement;
	let activeTab = 'general';
	let showResetConfirm = false;
	let showImportDialog = false;
	let importData = '';
	let performanceStats = { fps: 60, memory: 0, particles: 0 };
	let isExporting = false;
	let searchQuery = '';
	let fileInput: HTMLInputElement;
	
	const modalScale = spring(0.8, { stiffness: 0.3, damping: 0.8 });
	const modalOpacity = tweened(0, { duration: 300, easing: cubicOut });
	const backdropBlur = tweened(0, { duration: 400, easing: cubicOut });
	const tabSlideOffset = tweened(0, { duration: 250, easing: cubicOut });
	
	const tabs = [
		{ id: 'general', label: 'General', icon: '⚙️' },
		{ id: 'wallpaper', label: 'Wallpaper', icon: '🖼️' },
		{ id: 'particles', label: 'Particles', icon: '✨' },
		{ id: 'bookmarks', label: 'Bookmarks', icon: '📚' },
		{ id: 'appearance', label: 'Appearance', icon: '🎨' },
		{ id: 'performance', label: 'Performance', icon: '⚡' },
		{ id: 'keyboard', label: 'Shortcuts', icon: '⌨️' },
		{ id: 'data', label: 'Data', icon: '💾' }
	];
	
	let performanceMonitor: PerformanceMonitor;
	
	$: filteredTabs = searchQuery 
		? tabs.filter(tab => tab.label.toLowerCase().includes(searchQuery.toLowerCase()))
		: tabs;
	
	$: if (browser) {
		updatePerformanceStats();
	}
	
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
	}
	
	function updatePerformanceStats() {
		if (!performanceMonitor) return;
		
		performanceStats = {
			fps: Math.round(performanceMonitor.getAverage('frame') || 60),
			memory: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 0,
			particles: wallpapers?.particleCount || 0
		};
	}
	
	function switchTab(tabId: string) {
		const currentIndex = tabs.findIndex(t => t.id === activeTab);
		const newIndex = tabs.findIndex(t => t.id === tabId);
		const direction = newIndex > currentIndex ? 1 : -1;
		
		tabSlideOffset.set(direction * 20).then(() => {
			activeTab = tabId;
			tabSlideOffset.set(0);
		});
	}
	
	async function exportSettings() {
		isExporting = true;
		try {
			const response = await settingsAPI.exportSettings();
			if (response.success) {
				const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `startpage-settings-${new Date().toISOString().split('T')[0]}.json`;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch (error) {
			console.error('Export failed:', error);
		} finally {
			isExporting = false;
		}
	}
	
	function handleImportFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = (e) => {
			importData = e.target?.result as string;
			showImportDialog = true;
		};
		reader.readAsText(file);
	}
	
	async function importSettings() {
		try {
			const parsed = JSON.parse(importData);
			await settingsAPI.importSettings(parsed);
			settingsStore.set(parsed);
			dispatch('settingsUpdate', parsed);
			showImportDialog = false;
			importData = '';
		} catch (error) {
			console.error('Import failed:', error);
		}
	}
	
	async function resetToDefaults() {
		try {
			await settingsStore.reset();
			showResetConfirm = false;
			dispatch('settingsUpdate', settingsStore.getDefaults());
		} catch (error) {
			console.error('Reset failed:', error);
		}
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closePanel();
		} else if (event.key === 'Tab') {
			const currentIndex = tabs.findIndex(t => t.id === activeTab);
			const nextIndex = event.shiftKey 
				? (currentIndex - 1 + tabs.length) % tabs.length
				: (currentIndex + 1) % tabs.length;
			switchTab(tabs[nextIndex].id);
			event.preventDefault();
		}
	}
	
	function closePanel() {
		modalScale.set(0.8);
		modalOpacity.set(0);
		backdropBlur.set(0);
		setTimeout(() => dispatch('close'), 300);
	}
	
	onMount(() => {
		performanceMonitor = new PerformanceMonitor();
		modalScale.set(1);
		modalOpacity.set(1);
		backdropBlur.set(1);
		
		if (panelElement) {
			panelElement.focus();
		}
	});
</script>

<div 
	class="settings-modal" 
	style="backdrop-filter: blur({$backdropBlur * 12}px); opacity: {$modalOpacity}"
	on:click={closePanel}
	on:keydown={handleKeydown}
	role="dialog" 
	aria-modal="true"
	aria-labelledby="settings-title"
	tabindex="-1"
>
	<div 
		class="settings-panel" 
		bind:this={panelElement}
		style="transform: scale({$modalScale}); transform-origin: center"
		on:click|stopPropagation
	>
		<header class="panel-header">
			<div class="header-content">
				<h1 id="settings-title">Settings</h1>
				<div class="header-search">
					<input 
						type="text" 
						placeholder="Search settings..." 
						bind:value={searchQuery}
						class="search-input"
					/>
				</div>
			</div>
			<button class="close-button" on:click={closePanel} aria-label="Close settings">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"/>
					<line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</header>
		
		<div class="panel-body">
			<nav class="settings-nav">
				{#each filteredTabs as tab}
					<button 
						class="nav-tab" 
						class:active={activeTab === tab.id}
						on:click={() => switchTab(tab.id)}
					>
						<span class="tab-icon">{tab.icon}</span>
						<span class="tab-label">{tab.label}</span>
					</button>
				{/each}
			</nav>
			
			<main class="settings-content" style="transform: translateX({$tabSlideOffset}px)">
				{#if activeTab === 'general'}
					<div class="settings-section">
						<div class="section-card">
							<h3>General Preferences</h3>
							<div class="setting-row">
								<label>
									<span>Auto-hide UI after inactivity</span>
									<input 
										type="checkbox" 
										checked={settings?.ui?.autoHide || false}
										on:change={(e) => updateSetting('ui.autoHide', e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Hide timeout (seconds)</span>
									<input 
										type="range" 
										min="5" 
										max="60" 
										value={settings?.ui?.autoHideTimeout || 15}
										on:input={(e) => updateSetting('ui.autoHideTimeout', parseInt(e.target.value))}
									/>
									<span class="range-value">{settings?.ui?.autoHideTimeout || 15}s</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>High contrast mode</span>
									<input 
										type="checkbox" 
										checked={settings?.ui?.highContrast || false}
										on:change={(e) => updateSetting('ui.highContrast', e.target.checked)}
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
									<span>Auto-transition wallpapers</span>
									<input 
										type="checkbox" 
										checked={wallpapers?.autoTransition || false}
										on:change={(e) => wallpaperStore.setAutoTransition(e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Transition interval (seconds)</span>
									<input 
										type="range" 
										min="10" 
										max="300" 
										value={wallpapers?.cycleDuration ? wallpapers.cycleDuration / 1000 : 30}
										on:input={(e) => wallpaperStore.setCycleDuration(parseInt(e.target.value) * 1000)}
									/>
									<span class="range-value">{wallpapers?.cycleDuration ? Math.floor(wallpapers.cycleDuration / 1000) : 30}s</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Transition effect</span>
									<select 
										value={wallpapers?.transitionType || 'fade'}
										on:change={(e) => wallpaperStore.setTransitionType(e.target.value)}
									>
										<option value="fade">Fade</option>
										<option value="slide">Slide</option>
										<option value="zoom">Zoom</option>
										<option value="blur">Blur</option>
									</select>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Enable special effects</span>
									<input 
										type="checkbox" 
										checked={wallpapers?.enableSpecialEffects || false}
										on:change={(e) => wallpaperStore.setSpecialEffects(e.target.checked)}
									/>
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
										on:change={(e) => updateSetting('particles.enabled', e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Particle count</span>
									<input 
										type="range" 
										min="25" 
										max="200" 
										value={settings?.particles?.count || 75}
										on:input={(e) => updateSetting('particles.count', parseInt(e.target.value))}
									/>
									<span class="range-value">{settings?.particles?.count || 75}</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Mouse interaction strength</span>
									<input 
										type="range" 
										min="0" 
										max="100" 
										value={settings?.particles?.mouseInfluence || 50}
										on:input={(e) => updateSetting('particles.mouseInfluence', parseInt(e.target.value))}
									/>
									<span class="range-value">{settings?.particles?.mouseInfluence || 50}%</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Movement speed</span>
									<input 
										type="range" 
										min="10" 
										max="100" 
										value={settings?.particles?.speed || 50}
										on:input={(e) => updateSetting('particles.speed', parseInt(e.target.value))}
									/>
									<span class="range-value">{settings?.particles?.speed || 50}%</span>
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
									<span>Show bookmark previews</span>
									<input 
										type="checkbox" 
										checked={settings?.bookmarks?.showPreviews !== false}
										on:change={(e) => updateSetting('bookmarks.showPreviews', e.target.checked)}
									/>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Animation intensity</span>
									<input 
										type="range" 
										min="0" 
										max="100" 
										value={settings?.bookmarks?.animationIntensity || 75}
										on:input={(e) => updateSetting('bookmarks.animationIntensity', parseInt(e.target.value))}
									/>
									<span class="range-value">{settings?.bookmarks?.animationIntensity || 75}%</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Auto-organize folders</span>
									<input 
										type="checkbox" 
										checked={settings?.bookmarks?.autoOrganize || false}
										on:change={(e) => updateSetting('bookmarks.autoOrganize', e.target.checked)}
									/>
								</label>
							</div>
						</div>
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
										on:input={(e) => updateSetting('ui.opacity', parseInt(e.target.value))}
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
										on:input={(e) => updateSetting('ui.blurIntensity', parseInt(e.target.value))}
									/>
									<span class="range-value">{settings?.ui?.blurIntensity || 8}px</span>
								</label>
							</div>
							<div class="setting-row">
								<label>
									<span>Color adaptation</span>
									<input 
										type="checkbox" 
										checked={settings?.ui?.adaptiveColors !== false}
										on:change={(e) => updateSetting('ui.adaptiveColors', e.target.checked)}
									/>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'performance'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Performance Monitor</h3>
							<div class="performance-stats">
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
							</div>
							{#if performanceStats.fps < 30}
								<div class="performance-suggestion">
									<p>⚠️ Performance suggestion: Reduce particle count or disable special effects for smoother experience.</p>
									<button 
										class="optimize-button"
										on:click={() => {
											updateSetting('particles.count', 50);
											updateSetting('particles.enabled', false);
										}}
									>
										Auto-optimize
									</button>
								</div>
							{/if}
							<div class="setting-row">
								<label>
									<span>Performance monitoring</span>
									<input 
										type="checkbox" 
										checked={settings?.performance?.monitoring !== false}
										on:change={(e) => updateSetting('performance.monitoring', e.target.checked)}
									/>
								</label>
							</div>
						</div>
					</div>
				{:else if activeTab === 'keyboard'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Keyboard Shortcuts</h3>
							<div class="shortcut-list">
								<div class="shortcut-item">
									<span>Settings</span>
									<kbd>Ctrl + S</kbd>
								</div>
								<div class="shortcut-item">
									<span>Search</span>
									<kbd>Ctrl + K</kbd>
								</div>
								<div class="shortcut-item">
									<span>Next wallpaper</span>
									<kbd>Space</kbd>
								</div>
								<div class="shortcut-item">
									<span>Previous wallpaper</span>
									<kbd>Shift + Space</kbd>
								</div>
								<div class="shortcut-item">
									<span>Random wallpaper</span>
									<kbd>R</kbd>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'data'}
					<div class="settings-section">
						<div class="section-card">
							<h3>Data Management</h3>
							<div class="data-actions">
								<button class="action-button export" on:click={exportSettings} disabled={isExporting}>
									{#if isExporting}
										<span class="spinner"></span>
									{:else}
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
								/>
								<button class="action-button import" on:click={() => fileInput.click()}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
										<polyline points="17,8 12,3 7,8"/>
										<line x1="12" y1="3" x2="12" y2="15"/>
									</svg>
									Import Settings
								</button>
								
								<button class="action-button reset" on:click={() => showResetConfirm = true}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
	<div class="confirm-modal" on:click={() => showResetConfirm = false}>
		<div class="confirm-dialog" on:click|stopPropagation>
			<h3>Reset all settings?</h3>
			<p>This will restore all settings to their default values. This action cannot be undone.</p>
			<div class="confirm-actions">
				<button class="cancel-button" on:click={() => showResetConfirm = false}>Cancel</button>
				<button class="confirm-button" on:click={resetToDefaults}>Reset</button>
			</div>
		</div>
	</div>
{/if}

{#if showImportDialog}
	<div class="confirm-modal" on:click={() => showImportDialog = false}>
		<div class="confirm-dialog" on:click|stopPropagation>
			<h3>Import Settings</h3>
			<p>This will replace your current settings. Are you sure?</p>
			<div class="confirm-actions">
				<button class="cancel-button" on:click={() => showImportDialog = false}>Cancel</button>
				<button class="confirm-button" on:click={importSettings}>Import</button>
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
		max-width: 1200px;
		max-height: 800px;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 24px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 32px 64px rgba(0, 0, 0, 0.4);
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
	
	.close-button:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
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
	
	.nav-tab.active {
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
		max-width: 600px;
	}
	
	.section-card {
		background: rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 24px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		margin-bottom: 24px;
	}
	
	.section-card h3 {
		margin: 0 0 20px 0;
		font-size: 18px;
		font-weight: 600;
		color: white;
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
	
	.performance-stats {
		display: flex;
		gap: 24px;
		margin-bottom: 20px;
		padding: 16px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
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
		letter-spacing: 0.5px;
	}
	
	.stat-value {
		font-size: 18px;
		font-weight: 600;
		color: white;
	}
	
	.stat-value.warning {
		color: #ff6b6b;
	}
	
	.performance-suggestion {
		padding: 16px;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.3);
		border-radius: 12px;
		margin-bottom: 20px;
	}
	
	.performance-suggestion p {
		margin: 0 0 12px 0;
		color: #ff6b6b;
		font-size: 14px;
	}
	
	.optimize-button {
		background: #ff6b6b;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.optimize-button:hover {
		background: #ff5252;
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
		padding: 12px 16px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}
	
	.shortcut-item kbd {
		background: rgba(255, 255, 255, 0.2);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-family: monospace;
	}
	
	.data-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	
	.action-button {
		padding: 12px 16px;
		border: none;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: all 0.3s ease;
		text-align: left;
	}
	
	.action-button.export {
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
		border: 1px solid rgba(76, 175, 80, 0.3);
	}
	
	.action-button.export:hover {
		background: rgba(76, 175, 80, 0.3);
	}
	
	.action-button.import {
		background: rgba(33, 150, 243, 0.2);
		color: #2196f3;
		border: 1px solid rgba(33, 150, 243, 0.3);
	}
	
	.action-button.import:hover {
		background: rgba(33, 150, 243, 0.3);
	}
	
	.action-button.reset {
		background: rgba(244, 67, 54, 0.2);
		color: #f44336;
		border: 1px solid rgba(244, 67, 54, 0.3);
	}
	
	.action-button.reset:hover {
		background: rgba(244, 67, 54, 0.3);
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
		z-index: 1001;
	}
	
	.confirm-dialog {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 16px;
		padding: 32px;
		max-width: 400px;
		text-align: center;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	.confirm-dialog h3 {
		margin: 0 0 16px 0;
		color: white;
		font-size: 20px;
	}
	
	.confirm-dialog p {
		margin: 0 0 24px 0;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;
	}
	
	.confirm-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
	}
	
	.cancel-button, .confirm-button {
		padding: 12px 24px;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.cancel-button {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}
	
	.cancel-button:hover {
		background: rgba(255, 255, 255, 0.2);
	}
	
	.confirm-button {
		background: #f44336;
		color: white;
	}
	
	.confirm-button:hover {
		background: #d32f2f;
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
			display: flex;
			overflow-x: auto;
			overflow-y: hidden;
			border-right: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			padding: 12px 0;
		}
		
		.nav-tab {
			white-space: nowrap;
			border-right: none;
			border-bottom: 3px solid transparent;
		}
		
		.nav-tab.active {
			border-right: none;
			border-bottom: 3px solid rgba(255, 255, 255, 0.8);
		}
		
		.settings-content {
			padding: 20px;
		}
	}
</style>
