<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, elasticOut, quintOut, backOut, expoOut } from 'svelte/easing';
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
		dominantColor?: string;
	}
	
	let { 
		settings, 
		wallpapers, 
		dominantColor = '#4a90e2'
	}: Props = $props();
	
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
	let isVisible = $state(false);
	let activeSection = $state('');
	
	const modalScale = spring(0.9, { stiffness: 0.15, damping: 0.8 });
	const modalOpacity = tweened(0, { duration: 400, easing: cubicOut });
	const backdropBlur = tweened(0, { duration: 500, easing: cubicOut });
	const tabSlideOffset = tweened(0, { duration: 350, easing: backOut });
	const previewScale = spring(1, { stiffness: 0.2, damping: 0.8 });
	const settingHover = tweened(0, { duration: 200, easing: cubicOut });
	const glowIntensity = tweened(0, { duration: 600, easing: cubicOut });
	const headerGlow = tweened(0, { duration: 400, easing: cubicOut });
	
	const tabs = [
		{ id: 'general', label: 'General', icon: '⚙️', color: '#64748b' },
		{ id: 'wallpaper', label: 'Wallpaper', icon: '🖼️', color: '#06b6d4' },
		{ id: 'particles', label: 'Particles', icon: '✨', color: '#8b5cf6' },
		{ id: 'bookmarks', label: 'Bookmarks', icon: '📚', color: '#10b981' },
		{ id: 'objects3d', label: '3D Objects', icon: '🎯', color: '#f59e0b' },
		{ id: 'appearance', label: 'Appearance', icon: '🎨', color: '#ec4899' },
		{ id: 'performance', label: 'Performance', icon: '⚡', color: '#eab308' },
		{ id: 'keyboard', label: 'Shortcuts', icon: '⌨️', color: '#6366f1' },
		{ id: 'data', label: 'Data', icon: '💾', color: '#ef4444' }
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
	
	let gradientColors = $derived(getGradientColors());
	let textColor = $derived(getContrastColor(dominantColor));
	let currentTabData = $derived(tabs.find(t => t.id === activeTab));
	
	const debouncedSettingsUpdate = debounce((newSettings: any) => {
		settingsStore.update(newSettings);
		dispatch('settingsUpdate', newSettings);
		triggerSettingsPreview();
	}, 150);
	
	function getGradientColors(): { primary: string; secondary: string; rgb: string } {
		const rgb = hexToRgb(dominantColor);
		if (!rgb) return { 
			primary: '#4a90e2', 
			secondary: '#357abd',
			rgb: '74, 144, 226'
		};
		
		const primary = dominantColor;
		const secondary = `rgb(${Math.max(0, rgb.r - 40)}, ${Math.max(0, rgb.g - 40)}, ${Math.max(0, rgb.b - 40)})`;
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
		
		// Visual feedback
		settingHover.set(1).then(() => settingHover.set(0));
		
		if (path.startsWith('objects3d.')) {
			triggerPreviewUpdate();
		}
	}
	
	function triggerSettingsPreview() {
		glowIntensity.set(1).then(() => {
			setTimeout(() => glowIntensity.set(0), 800);
		});
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
		if (activeTab === tabId) return;
		
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
		}, 175);
		
		// Header glow effect
		headerGlow.set(1).then(() => {
			setTimeout(() => headerGlow.set(0), 600);
		});
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
		previewScale.set(1.15).then(() => previewScale.set(1));
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
				closeModal();
			}
		} else if (event.key === 'Tab') {
			return;
		}
	}
	
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeModal();
		}
	}
	
	function closeModal() {
		modalScale.set(0.9);
		modalOpacity.set(0);
		backdropBlur.set(0);
		
		setTimeout(() => {
			dispatch('close');
		}, 300);
	}
	
	onMount(async () => {
		isVisible = true;
		modalScale.set(1);
		modalOpacity.set(1);
		backdropBlur.set(12);
		
		checkWebGLSupport();
		
		if (browser) {
			performanceMonitor = new PerformanceMonitor();
			performanceMonitor.start();
			updatePerformanceStats();
			loadAvailableObjects();
		}
		
		document.body.style.overflow = 'hidden';
		
		await tick();
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
	
	$effect(() => {
		if (browser && isVisible) {
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
	style:backdrop-filter="blur({$backdropBlur}px)"
	style:--primary-rgb={gradientColors.rgb}
	style:--primary-color={gradientColors.primary}
	style:--secondary-color={gradientColors.secondary}
	style:--text-color={textColor}
	style:--glow-intensity={$glowIntensity}
	style:--header-glow={$headerGlow}
	style:--setting-hover={$settingHover}
	onclick={handleBackdropClick}
	role="dialog"
	aria-modal="true"
	aria-labelledby="settings-title"
>
	<div 
		bind:this={panelElement}
		class="settings-panel"
		style:transform="scale({$modalScale})"
		style:opacity={$modalOpacity}
		tabindex="-1"
		role="document"
		aria-labelledby="settings-title"
	>
		<div class="panel-header">
			<div class="header-content">
				<div class="header-title">
					<h1 id="settings-title">Settings</h1>
					<div class="header-glow"></div>
				</div>
				<div class="header-search">
					<input 
						type="text" 
						placeholder="Search settings..." 
						class="search-input"
						bind:value={searchQuery}
						aria-label="Search settings"
					/>
					<div class="search-icon" aria-hidden="true">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="11" cy="11" r="8"/>
							<path d="m21 21-4.35-4.35"/>
						</svg>
					</div>
				</div>
			</div>
			<button 
				class="close-button" 
				onclick={closeModal}
				aria-label="Close settings"
				type="button"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
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
						style:--tab-color={tab.color}
						onclick={() => switchTab(tab.id)}
						role="tab"
						aria-selected={activeTab === tab.id}
						aria-controls="panel-{tab.id}"
						id="tab-{tab.id}"
						type="button"
					>
						<span class="tab-icon" aria-hidden="true">{tab.icon}</span>
						<span class="tab-label">{tab.label}</span>
						<div class="tab-indicator"></div>
					</button>
				{/each}
			</nav>
			
			<main 
				class="settings-content"
				style:transform="translateX({$tabSlideOffset}px)"
				role="tabpanel"
				aria-labelledby="tab-{activeTab}"
				id="panel-{activeTab}"
			>
				{#if activeTab === 'general'}
					<div class="settings-section">
						<div class="section-card">
							<div class="card-header">
								<h3>General Settings</h3>
								<div class="card-accent"></div>
							</div>
							<div class="setting-group">
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Show welcome message</span>
											<span class="setting-description">Display a welcome message when starting the application</span>
										</div>
										<div class="setting-control">
											<input 
												type="checkbox" 
												class="modern-checkbox"
												checked={settings?.general?.showWelcome !== false}
												onchange={(e) => updateSetting('general.showWelcome', e.target.checked)}
											/>
										</div>
									</label>
								</div>
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Auto-save settings</span>
											<span class="setting-description">Automatically save configuration changes</span>
										</div>
										<div class="setting-control">
											<input 
												type="checkbox" 
												class="modern-checkbox"
												checked={settings?.general?.autoSave !== false}
												onchange={(e) => updateSetting('general.autoSave', e.target.checked)}
											/>
										</div>
									</label>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'wallpaper'}
					<div class="settings-section">
						<div class="section-card">
							<div class="card-header">
								<h3>Wallpaper Settings</h3>
								<div class="card-accent"></div>
							</div>
							<div class="setting-group">
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Auto-cycle wallpapers</span>
											<span class="setting-description">Automatically change wallpapers at regular intervals</span>
										</div>
										<div class="setting-control">
											<input 
												type="checkbox" 
												class="modern-checkbox"
												checked={settings?.wallpaper?.autoCycle !== false}
												onchange={(e) => updateSetting('wallpaper.autoCycle', e.target.checked)}
											/>
										</div>
									</label>
								</div>
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Cycle interval</span>
											<span class="setting-description">Time between automatic wallpaper changes</span>
										</div>
										<div class="setting-control range-control">
											<input 
												type="range" 
												class="modern-range"
												min="1" 
												max="60" 
												value={settings?.wallpaper?.cycleInterval || 10}
												oninput={(e) => updateSetting('wallpaper.cycleInterval', parseInt(e.target.value))}
												aria-label="Wallpaper cycle interval in minutes"
											/>
											<span class="range-value">{settings?.wallpaper?.cycleInterval || 10}m</span>
										</div>
									</label>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'particles'}
					<div class="settings-section">
						<div class="section-card">
							<div class="card-header">
								<h3>Particle System</h3>
								<div class="card-accent"></div>
							</div>
							<div class="setting-group">
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Enable particles</span>
											<span class="setting-description">Show animated particle effects in the background</span>
										</div>
										<div class="setting-control">
											<input 
												type="checkbox" 
												class="modern-checkbox"
												checked={settings?.particles?.enabled !== false}
												onchange={(e) => updateSetting('particles.enabled', e.target.checked)}
											/>
										</div>
									</label>
								</div>
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Particle count</span>
											<span class="setting-description">Number of particles to render simultaneously</span>
										</div>
										<div class="setting-control range-control">
											<input 
												type="range" 
												class="modern-range"
												min="10" 
												max="200" 
												value={settings?.particles?.count || 80}
												oninput={(e) => updateSetting('particles.count', parseInt(e.target.value))}
												aria-label="Number of particles"
											/>
											<span class="range-value">{settings?.particles?.count || 80}</span>
										</div>
									</label>
								</div>
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Connection distance</span>
											<span class="setting-description">Maximum distance for particle connections</span>
										</div>
										<div class="setting-control range-control">
											<input 
												type="range" 
												class="modern-range"
												min="50" 
												max="200" 
												value={settings?.particles?.connectionDistance || 120}
												oninput={(e) => updateSetting('particles.connectionDistance', parseInt(e.target.value))}
												aria-label="Particle connection distance in pixels"
											/>
											<span class="range-value">{settings?.particles?.connectionDistance || 120}px</span>
										</div>
									</label>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'bookmarks'}
					<div class="settings-section">
						<div class="section-card">
							<div class="card-header">
								<h3>Bookmark Management</h3>
								<div class="card-accent"></div>
							</div>
							<div class="setting-group">
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Auto-detect favicons</span>
											<span class="setting-description">Automatically fetch website icons for bookmarks</span>
										</div>
										<div class="setting-control">
											<input 
												type="checkbox" 
												class="modern-checkbox"
												checked={settings?.bookmarks?.autoFavicon !== false}
												onchange={(e) => updateSetting('bookmarks.autoFavicon', e.target.checked)}
											/>
										</div>
									</label>
								</div>
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Show descriptions</span>
											<span class="setting-description">Display bookmark descriptions when available</span>
										</div>
										<div class="setting-control">
											<input 
												type="checkbox" 
												class="modern-checkbox"
												checked={settings?.bookmarks?.showDescriptions !== false}
												onchange={(e) => updateSetting('bookmarks.showDescriptions', e.target.checked)}
											/>
										</div>
									</label>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'objects3d'}
					<div class="settings-section">
						{#if !webGLSupported}
							<div class="section-card warning-card">
								<div class="card-header">
									<h3>⚠️ WebGL Not Supported</h3>
								</div>
								<div class="warning-content">
									<p>Your browser doesn't support WebGL, which is required for 3D objects. The page will automatically fall back to 2D icons.</p>
									<button class="action-button secondary" onclick={checkWebGLSupport} type="button">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<polyline points="1,4 1,10 7,10"/>
											<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
										</svg>
										Recheck WebGL Support
									</button>
								</div>
							</div>
						{/if}
						
						<div class="section-card">
							<div class="card-header">
								<h3>3D Object Settings</h3>
								<div class="card-accent"></div>
							</div>
							<div class="setting-group">
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Enable 3D objects</span>
											<span class="setting-description">Render bookmarks as interactive 3D objects</span>
										</div>
										<div class="setting-control">
											<input 
												type="checkbox" 
												class="modern-checkbox"
												checked={threeDSettings.enabled}
												disabled={!webGLSupported}
												onchange={(e) => updateSetting('objects3d.enabled', e.target.checked)}
											/>
										</div>
									</label>
								</div>
								
								<div class="preset-section">
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
										<label class="setting-label">
											<div class="setting-info">
												<span class="setting-title">Global scale</span>
												<span class="setting-description">Size multiplier for all 3D objects</span>
											</div>
											<div class="setting-control range-control">
												<input 
													type="range" 
													class="modern-range"
													min="0.5" 
													max="2.0" 
													step="0.1"
													value={threeDSettings.globalScale}
													oninput={(e) => updateSetting('objects3d.globalScale', parseFloat(e.target.value))}
													aria-label="Global scale multiplier for 3D objects"
												/>
												<span class="range-value">{threeDSettings.globalScale}×</span>
											</div>
										</label>
									</div>
									
									<div class="setting-row">
										<label class="setting-label">
											<div class="setting-info">
												<span class="setting-title">Animation speed</span>
												<span class="setting-description">Speed of object animations and rotations</span>
											</div>
											<div class="setting-control range-control">
												<input 
													type="range" 
													class="modern-range"
													min="0.2" 
													max="3.0" 
													step="0.1"
													value={threeDSettings.animationSpeed}
													oninput={(e) => updateSetting('objects3d.animationSpeed', parseFloat(e.target.value))}
													aria-label="Animation speed multiplier"
												/>
												<span class="range-value">{threeDSettings.animationSpeed}×</span>
											</div>
										</label>
									</div>
									
									<div class="setting-row">
										<label class="setting-label">
											<div class="setting-info">
												<span class="setting-title">Enable animations</span>
												<span class="setting-description">Allow 3D objects to rotate and animate</span>
											</div>
											<div class="setting-control">
												<input 
													type="checkbox" 
													class="modern-checkbox"
													checked={threeDSettings.enableAnimations}
													onchange={(e) => updateSetting('objects3d.enableAnimations', e.target.checked)}
												/>
											</div>
										</label>
									</div>
									
									<div class="setting-row">
										<label class="setting-label">
											<div class="setting-info">
												<span class="setting-title">Enable glow effects</span>
												<span class="setting-description">Add glowing outlines to 3D objects</span>
											</div>
											<div class="setting-control">
												<input 
													type="checkbox" 
													class="modern-checkbox"
													checked={threeDSettings.enableGlow}
													onchange={(e) => updateSetting('objects3d.enableGlow', e.target.checked)}
												/>
											</div>
										</label>
									</div>
									
									<div class="setting-row">
										<label class="setting-label">
											<div class="setting-info">
												<span class="setting-title">Enable shadows</span>
												<span class="setting-description">Render realistic shadows for 3D objects</span>
											</div>
											<div class="setting-control">
												<input 
													type="checkbox" 
													class="modern-checkbox"
													checked={threeDSettings.enableShadows}
													onchange={(e) => updateSetting('objects3d.enableShadows', e.target.checked)}
												/>
											</div>
										</label>
									</div>
								{/if}
							</div>
						</div>
						
						{#if threeDSettings.enabled}
							<div class="section-card">
								<div class="card-header">
									<h3>Object Browser</h3>
									<div class="card-accent"></div>
								</div>
								<div class="object-browser">
									<div class="browser-controls">
										<select 
											bind:value={objectBrowserCategory} 
											class="modern-select"
											aria-label="Filter objects by category"
										>
											<option value="all">All Categories</option>
											{#each OBJECT_CATEGORIES as category}
												<option value={category.id}>{category.name}</option>
											{/each}
										</select>
									</div>
									
									<div class="object-grid" role="grid" aria-label="3D object selection">
										{#each filteredObjects.slice(0, 12) as objectConfig, index}
											<button 
												class="object-card"
												class:selected={selectedObject3D?.id === objectConfig.id}
												onclick={() => selectObject(objectConfig)}
												role="gridcell"
												aria-selected={selectedObject3D?.id === objectConfig.id}
												aria-label="Select {objectConfig.name} 3D object"
												type="button"
											>
												<div class="object-preview" aria-hidden="true">
													<Object3D 
														config={objectConfig}
														scale={0.7}
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
											<div class="live-preview" style:transform="scale({$previewScale})" aria-hidden="true">
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
							<div class="card-header">
								<h3>Visual Appearance</h3>
								<div class="card-accent"></div>
							</div>
							<div class="setting-group">
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">UI opacity</span>
											<span class="setting-description">Transparency level of interface elements</span>
										</div>
										<div class="setting-control range-control">
											<input 
												type="range" 
												class="modern-range"
												min="20" 
												max="100" 
												value={settings?.ui?.opacity || 90}
												oninput={(e) => updateSetting('ui.opacity', parseInt(e.target.value))}
												aria-label="User interface opacity percentage"
											/>
											<span class="range-value">{settings?.ui?.opacity || 90}%</span>
										</div>
									</label>
								</div>
								<div class="setting-row">
									<label class="setting-label">
										<div class="setting-info">
											<span class="setting-title">Blur intensity</span>
											<span class="setting-description">Background blur effect strength</span>
										</div>
										<div class="setting-control range-control">
											<input 
												type="range" 
												class="modern-range"
												min="0" 
												max="20" 
												value={settings?.ui?.blurIntensity || 8}
												oninput={(e) => updateSetting('ui.blurIntensity', parseInt(e.target.value))}
												aria-label="Background blur intensity in pixels"
											/>
											<span class="range-value">{settings?.ui?.blurIntensity || 8}px</span>
										</div>
									</label>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'performance'}
					<div class="settings-section">
						<div class="section-card">
							<div class="card-header">
								<h3>Performance Monitor</h3>
								<div class="card-accent"></div>
							</div>
							<div class="performance-stats" role="group" aria-label="Performance statistics">
								<div class="stat-card">
									<div class="stat-icon">📊</div>
									<div class="stat-info">
										<span class="stat-value" class:warning={performanceStats.fps < 30}>{performanceStats.fps}</span>
										<span class="stat-label">FPS</span>
									</div>
								</div>
								<div class="stat-card">
									<div class="stat-icon">🧠</div>
									<div class="stat-info">
										<span class="stat-value">{performanceStats.memory}</span>
										<span class="stat-label">MB Memory</span>
									</div>
								</div>
								<div class="stat-card">
									<div class="stat-icon">✨</div>
									<div class="stat-info">
										<span class="stat-value">{performanceStats.particles}</span>
										<span class="stat-label">Particles</span>
									</div>
								</div>
								<div class="stat-card">
									<div class="stat-icon">🎯</div>
									<div class="stat-info">
										<span class="stat-value">{performanceStats.objects3D}</span>
										<span class="stat-label">3D Objects</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'keyboard'}
					<div class="settings-section">
						<div class="section-card">
							<div class="card-header">
								<h3>Keyboard Shortcuts</h3>
								<div class="card-accent"></div>
							</div>
							<div class="shortcut-list" role="list">
								<div class="shortcut-row" role="listitem">
									<span class="shortcut-action">Open search</span>
									<kbd class="shortcut-keys">Ctrl + K</kbd>
								</div>
								<div class="shortcut-row" role="listitem">
									<span class="shortcut-action">Open settings</span>
									<kbd class="shortcut-keys">Ctrl + ,</kbd>
								</div>
								<div class="shortcut-row" role="listitem">
									<span class="shortcut-action">New bookmark</span>
									<kbd class="shortcut-keys">Ctrl + B</kbd>
								</div>
								<div class="shortcut-row" role="listitem">
									<span class="shortcut-action">Focus search (anywhere)</span>
									<kbd class="shortcut-keys">Space</kbd>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'data'}
					<div class="settings-section">
						<div class="section-card">
							<div class="card-header">
								<h3>Data Management</h3>
								<div class="card-accent"></div>
							</div>
							<div class="data-actions">
								<button 
									class="action-button primary" 
									onclick={exportSettings} 
									disabled={isExporting}
									aria-label="Export all settings to file"
									type="button"
								>
									{#if isExporting}
										<div class="loading-spinner" aria-hidden="true"></div>
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
									class="action-button secondary" 
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
									class="action-button danger" 
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
			</main>
		</div>
	</div>
</div>

{#if showResetConfirm}
	<div 
		class="confirm-modal" 
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-labelledby="reset-title"
	>
		<div class="confirm-dialog" role="document">
			<h3 id="reset-title">Reset all settings?</h3>
			<p>This will restore all settings to their default values. This action cannot be undone.</p>
			<div class="confirm-actions">
				<button 
					class="action-button secondary" 
					onclick={() => showResetConfirm = false}
					type="button"
				>
					Cancel
				</button>
				<button 
					class="action-button danger" 
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
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-title"
	>
		<div class="confirm-dialog" role="document">
			<h3 id="import-title">Import Settings</h3>
			<p>This will replace your current settings. Are you sure?</p>
			<div class="confirm-actions">
				<button 
					class="action-button secondary" 
					onclick={() => showImportDialog = false}
					type="button"
				>
					Cancel
				</button>
				<button 
					class="action-button primary" 
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
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(0px);
		transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
		animation: modal-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	
	@keyframes modal-enter {
		from {
			opacity: 0;
			backdrop-filter: blur(0px);
		}
		to {
			opacity: 1;
			backdrop-filter: blur(12px);
		}
	}
	
	.settings-panel {
		width: 90vw;
		height: 85vh;
		max-width: 1200px;
		max-height: 800px;
		background: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(24px) saturate(1.8);
		border-radius: 24px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 
			0 32px 64px rgba(0, 0, 0, 0.3),
			0 0 0 1px rgba(var(--primary-rgb), calc(var(--glow-intensity) * 0.3)),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px 32px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: linear-gradient(135deg, 
			rgba(255, 255, 255, 0.1) 0%, 
			rgba(255, 255, 255, 0.05) 100%);
		position: relative;
		overflow: hidden;
	}
	
	.header-content {
		display: flex;
		align-items: center;
		gap: 32px;
		z-index: 2;
	}
	
	.header-title {
		position: relative;
	}
	
	.header-title h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 700;
		color: var(--text-color);
		letter-spacing: -0.02em;
	}
	
	.header-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 120px;
		height: 40px;
		background: radial-gradient(
			ellipse at center,
			rgba(var(--primary-rgb), calc(var(--header-glow) * 0.4)) 0%,
			rgba(var(--primary-rgb), calc(var(--header-glow) * 0.2)) 50%,
			transparent 100%
		);
		border-radius: 50%;
		pointer-events: none;
		z-index: 1;
	}
	
	.header-search {
		position: relative;
		display: flex;
		align-items: center;
	}
	
	.search-input {
		padding: 12px 16px 12px 44px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-color);
		font-size: 14px;
		width: 240px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		backdrop-filter: blur(8px);
	}
	
	.search-input:focus {
		outline: none;
		border-color: rgba(var(--primary-rgb), 0.5);
		background: rgba(255, 255, 255, 0.12);
		box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.15);
		transform: scale(1.02);
	}
	
	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}
	
	.search-icon {
		position: absolute;
		left: 14px;
		color: rgba(255, 255, 255, 0.5);
		pointer-events: none;
	}
	
	.close-button {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		padding: 12px;
		border-radius: 12px;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.close-button:hover {
		color: rgba(255, 255, 255, 0.9);
		background: rgba(255, 255, 255, 0.08);
		transform: scale(1.05);
	}
	
	.close-button:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.panel-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}
	
	.settings-nav {
		width: 280px;
		padding: 24px 0;
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		background: linear-gradient(180deg, 
			rgba(0, 0, 0, 0.1) 0%, 
			rgba(0, 0, 0, 0.2) 100%);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
	}
	
	.nav-tab {
		position: relative;
		width: 100%;
		padding: 16px 24px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 16px;
		font-size: 14px;
		font-weight: 500;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		text-align: left;
		border-left: 3px solid transparent;
	}
	
	.nav-tab:hover {
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.9);
		transform: translateX(4px);
	}
	
	.nav-tab:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: -2px;
	}
	
	.nav-tab.active {
		background: linear-gradient(90deg, 
			rgba(var(--primary-rgb), 0.15) 0%, 
			rgba(var(--primary-rgb), 0.05) 100%);
		color: rgba(var(--primary-rgb), 0.95);
		border-left-color: rgba(var(--primary-rgb), 0.8);
		transform: translateX(4px);
	}
	
	.tab-icon {
		font-size: 18px;
		min-width: 20px;
		text-align: center;
	}
	
	.tab-label {
		flex: 1;
	}
	
	.tab-indicator {
		position: absolute;
		right: 16px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(var(--primary-rgb), 0.6);
		opacity: 0;
		transform: scale(0.5);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.nav-tab.active .tab-indicator {
		opacity: 1;
		transform: scale(1);
	}
	
	.settings-content {
		flex: 1;
		padding: 32px;
		overflow-y: auto;
		transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
	}
	
	.settings-section {
		max-width: 700px;
		margin: 0 auto;
	}
	
	.section-card {
		position: relative;
		background: rgba(255, 255, 255, 0.06);
		backdrop-filter: blur(12px);
		border-radius: 20px;
		padding: 28px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 24px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
	}
	
	.section-card:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
		transform: translateY(-2px);
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
	}
	
	.section-card.warning-card {
		border-color: rgba(255, 193, 7, 0.3);
		background: rgba(255, 193, 7, 0.08);
	}
	
	.card-header {
		position: relative;
		margin-bottom: 24px;
	}
	
	.card-header h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: var(--text-color);
		letter-spacing: -0.01em;
	}
	
	.card-accent {
		position: absolute;
		bottom: -8px;
		left: 0;
		width: 40px;
		height: 3px;
		background: linear-gradient(90deg, 
			rgba(var(--primary-rgb), 0.8) 0%, 
			rgba(var(--primary-rgb), 0.3) 100%);
		border-radius: 2px;
	}
	
	.setting-group {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	
	.setting-row {
		position: relative;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.setting-row:hover {
		transform: translateX(4px);
	}
	
	.setting-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		cursor: pointer;
		padding: 16px;
		border-radius: 12px;
		background: rgba(255, 255, 255, calc(0.03 + var(--setting-hover) * 0.05));
		border: 1px solid rgba(255, 255, 255, calc(0.05 + var(--setting-hover) * 0.1));
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.setting-label:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
	}
	
	.setting-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}
	
	.setting-title {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-color);
		line-height: 1.4;
	}
	
	.setting-description {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.3;
	}
	
	.setting-control {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	
	.range-control {
		gap: 16px;
		min-width: 140px;
	}
	
	.modern-checkbox {
		width: 20px;
		height: 20px;
		appearance: none;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
		position: relative;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.modern-checkbox:checked {
		background: rgba(var(--primary-rgb), 0.8);
		border-color: rgba(var(--primary-rgb), 0.8);
	}
	
	.modern-checkbox:checked::after {
		content: '✓';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: white;
		font-size: 12px;
		font-weight: bold;
	}
	
	.modern-checkbox:hover {
		border-color: rgba(var(--primary-rgb), 0.6);
		transform: scale(1.05);
	}
	
	.modern-range {
		flex: 1;
		height: 6px;
		appearance: none;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}
	
	.modern-range::-webkit-slider-thumb {
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: rgba(var(--primary-rgb), 0.9);
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.8);
		transition: all 0.2s ease;
	}
	
	.modern-range::-webkit-slider-thumb:hover {
		transform: scale(1.2);
		box-shadow: 0 0 12px rgba(var(--primary-rgb), 0.4);
	}
	
	.modern-range::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: rgba(var(--primary-rgb), 0.9);
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.8);
		transition: all 0.2s ease;
	}
	
	.range-value {
		min-width: 50px;
		text-align: center;
		font-weight: 600;
		color: rgba(var(--primary-rgb), 0.9);
		font-size: 13px;
	}
	
	.modern-select {
		padding: 10px 16px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-color);
		font-size: 14px;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		appearance: none;
		background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23999' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
		background-position: right 12px center;
		background-repeat: no-repeat;
		background-size: 16px;
		padding-right: 40px;
	}
	
	.modern-select:hover {
		border-color: rgba(var(--primary-rgb), 0.4);
		background: rgba(255, 255, 255, 0.12);
	}
	
	.modern-select:focus {
		outline: none;
		border-color: rgba(var(--primary-rgb), 0.6);
		box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.15);
	}
	
	.preset-section {
		margin: 24px 0;
	}
	
	.preset-section h4 {
		margin: 0 0 16px 0;
		font-size: 16px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.preset-buttons {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	
	.preset-button {
		padding: 12px 20px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.8);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		text-transform: capitalize;
	}
	
	.preset-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.95);
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.3);
	}
	
	.preset-button.active {
		background: rgba(var(--primary-rgb), 0.2);
		color: rgba(var(--primary-rgb), 0.95);
		border-color: rgba(var(--primary-rgb), 0.4);
		box-shadow: 0 0 12px rgba(var(--primary-rgb), 0.2);
	}
	
	.preset-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
	}
	
	.object-browser {
		margin-top: 20px;
	}
	
	.browser-controls {
		margin-bottom: 20px;
	}
	
	.object-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 16px;
		margin-bottom: 28px;
	}
	
	.object-card {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 16px;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		position: relative;
		overflow: hidden;
	}
	
	.object-card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, 
			rgba(var(--primary-rgb), 0.1) 0%, 
			transparent 50%);
		opacity: 0;
		transition: opacity 0.3s ease;
	}
	
	.object-card:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-4px) scale(1.02);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}
	
	.object-card:hover::before {
		opacity: 1;
	}
	
	.object-card.selected {
		background: rgba(var(--primary-rgb), 0.15);
		border-color: rgba(var(--primary-rgb), 0.4);
		box-shadow: 0 8px 24px rgba(var(--primary-rgb), 0.2);
		transform: translateY(-4px) scale(1.05);
	}
	
	.object-preview {
		width: 70px;
		height: 70px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		backdrop-filter: blur(8px);
	}
	
	.object-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		text-align: center;
	}
	
	.object-name {
		font-size: 12px;
		color: var(--text-color);
		font-weight: 600;
		line-height: 1.2;
	}
	
	.object-complexity {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	
	.preview-section {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 24px;
		text-align: center;
	}
	
	.preview-section h4 {
		margin: 0 0 20px 0;
		font-size: 16px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.live-preview {
		width: 140px;
		height: 140px;
		margin: 0 auto 16px;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	
	.preview-description {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.4;
		margin: 0;
	}
	
	.performance-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 16px;
		margin-bottom: 24px;
	}
	
	.stat-card {
		background: rgba(255, 255, 255, 0.06);
		border-radius: 16px;
		padding: 20px;
		display: flex;
		align-items: center;
		gap: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.stat-card:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-2px);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
	}
	
	.stat-icon {
		font-size: 24px;
		opacity: 0.8;
	}
	
	.stat-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	
	.stat-value {
		font-size: 24px;
		font-weight: 700;
		color: var(--text-color);
		line-height: 1;
	}
	
	.stat-value.warning {
		color: #ff6b6b;
	}
	
	.stat-label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 500;
	}
	
	.shortcut-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	
	.shortcut-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.shortcut-row:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateX(4px);
	}
	
	.shortcut-action {
		color: rgba(255, 255, 255, 0.8);
		font-size: 14px;
		font-weight: 500;
	}
	
	.shortcut-keys {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-color);
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		letter-spacing: 0.5px;
	}
	
	.data-actions {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}
	
	.action-button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 20px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-color);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		text-decoration: none;
	}
	
	.action-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
	}
	
	.action-button:focus-visible {
		outline: 2px solid rgba(var(--primary-rgb), 0.6);
		outline-offset: 2px;
	}
	
	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
	
	.action-button.primary {
		background: rgba(var(--primary-rgb), 0.15);
		border-color: rgba(var(--primary-rgb), 0.3);
		color: rgba(var(--primary-rgb), 0.95);
	}
	
	.action-button.primary:hover:not(:disabled) {
		background: rgba(var(--primary-rgb), 0.25);
		border-color: rgba(var(--primary-rgb), 0.5);
		box-shadow: 0 8px 16px rgba(var(--primary-rgb), 0.2);
	}
	
	.action-button.secondary {
		background: rgba(59, 130, 246, 0.15);
		border-color: rgba(59, 130, 246, 0.3);
		color: rgba(59, 130, 246, 0.95);
	}
	
	.action-button.danger {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.3);
		color: rgba(239, 68, 68, 0.95);
	}
	
	.loading-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	.warning-content {
		padding: 16px 0;
	}
	
	.warning-content p {
		margin: 0 0 16px 0;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;
	}
	
	.confirm-modal {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		backdrop-filter: blur(8px);
		animation: modal-enter 0.3s ease-out;
	}
	
	.confirm-dialog {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(24px) saturate(1.8);
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		padding: 32px;
		max-width: 420px;
		width: 90%;
		text-align: center;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);
	}
	
	.confirm-dialog h3 {
		margin: 0 0 16px 0;
		color: var(--text-color);
		font-size: 20px;
		font-weight: 600;
	}
	
	.confirm-dialog p {
		margin: 0 0 24px 0;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.5;
		font-size: 14px;
	}
	
	.confirm-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
	}
	
	@media (max-width: 1024px) {
		.settings-panel {
			width: 95vw;
			height: 90vh;
		}
		
		.panel-header {
			padding: 20px 24px;
		}
		
		.header-content {
			gap: 16px;
		}
		
		.search-input {
			width: 180px;
		}
		
		.settings-nav {
			width: 240px;
		}
		
		.nav-tab {
			padding: 14px 20px;
			font-size: 13px;
		}
		
		.settings-content {
			padding: 24px;
		}
	}
	
	@media (max-width: 768px) {
		.settings-panel {
			width: 98vw;
			height: 95vh;
		}
		
		.panel-body {
			flex-direction: column;
		}
		
		.settings-nav {
			width: 100%;
			padding: 16px 0;
			border-right: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			overflow-x: auto;
			display: flex;
		}
		
		.nav-tab {
			white-space: nowrap;
			min-width: fit-content;
			border-left: none;
			border-bottom: 3px solid transparent;
		}
		
		.nav-tab.active {
			border-left-color: transparent;
			border-bottom-color: rgba(var(--primary-rgb), 0.8);
		}
		
		.object-grid {
			grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
			gap: 12px;
		}
		
		.data-actions {
			flex-direction: column;
		}
		
		.performance-stats {
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			gap: 12px;
		}
		
		.header-content {
			flex-direction: column;
			gap: 12px;
			align-items: flex-start;
		}
		
		.search-input {
			width: 100%;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.settings-panel,
		.confirm-dialog,
		.object-card,
		.live-preview,
		.nav-tab,
		.setting-row {
			transition: none;
		}
		
		.loading-spinner {
			animation: none;
		}
		
		.settings-modal {
			animation: none;
		}
	}
	
	@media (hover: none) {
		.object-card:hover,
		.stat-card:hover,
		.shortcut-row:hover,
		.setting-row:hover {
			transform: none;
		}
	}
</style>
