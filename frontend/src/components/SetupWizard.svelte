<script lang="ts">
	import { onMount, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened, spring } from 'svelte/motion';
	import { cubicOut, elasticOut } from 'svelte/easing';
	import { settingsStore } from '$stores/settings';
	import { wallpaperStore } from '$stores/wallpaper';
	import { bookmarkStore } from '$stores/bookmarks';
	import { setupStore } from '$stores/setup';
	import { wallpaperAPI, bookmarkAPI } from '$lib/api';
	import { isImageFile, formatFileSize } from '$lib/utils';
	
	const dispatch = createEventDispatcher();
	
	let currentStep = 0;
	let isLoading = false;
	let errorMessage = '';
	let fileInput: HTMLInputElement;
	let manualBookmarkForm = { name: '', url: '', category: 'General' };
	let selectedTheme = '';
	let performanceProfile = 'balanced';
	let customSettings = {
		particleCount: 75,
		autoTransition: true,
		transitionDuration: 30,
		enableSpecialEffects: true
	};
	
	const progressValue = tweened(0, { duration: 800, easing: cubicOut });
	const stepAnimation = spring(0, { stiffness: 0.2, damping: 0.8 });
	const contentOpacity = tweened(1, { duration: 300, easing: cubicOut });
	
	const steps = [
		{
			id: 'welcome',
			title: 'Welcome to Your New Start Page',
			subtitle: 'Let\'s get you set up in just a few steps',
			icon: '👋',
			required: false
		},
		{
			id: 'wallpaper',
			title: 'Choose Your Wallpaper Theme',
			subtitle: 'Select a beautiful theme to personalize your experience',
			icon: '🖼️',
			required: true
		},
		{
			id: 'bookmarks',
			title: 'Import Your Bookmarks',
			subtitle: 'Bring your existing bookmarks or create new ones',
			icon: '📚',
			required: true
		},
		{
			id: 'performance',
			title: 'Optimize Performance',
			subtitle: 'Choose settings that work best for your device',
			icon: '⚡',
			required: true
		},
		{
			id: 'customize',
			title: 'Final Customization',
			subtitle: 'Fine-tune your experience',
			icon: '🎨',
			required: true
		},
		{
			id: 'complete',
			title: 'Setup Complete!',
			subtitle: 'You\'re ready to enjoy your new start page',
			icon: '🎉',
			required: false
		}
	];
	
	let availableThemes = [
		{
			id: 'nature',
			name: 'Nature Landscapes',
			preview: '/themes/nature-preview.jpg',
			description: 'Beautiful landscapes and natural scenery',
			count: 25
		},
		{
			id: 'abstract',
			name: 'Abstract Art',
			preview: '/themes/abstract-preview.jpg',
			description: 'Modern abstract designs and patterns',
			count: 30
		},
		{
			id: 'minimal',
			name: 'Minimalist',
			preview: '/themes/minimal-preview.jpg',
			description: 'Clean, simple backgrounds',
			count: 20
		},
		{
			id: 'space',
			name: 'Space & Cosmos',
			preview: '/themes/space-preview.jpg',
			description: 'Stunning space imagery and nebulae',
			count: 35
		}
	];
	
	let manualBookmarks = [];
	let importedBookmarks = [];
	let bookmarkCategories = ['General', 'Work', 'Social', 'Shopping', 'Entertainment', 'News', 'Tools'];
	
	$: progressPercent = ((currentStep + 1) / steps.length) * 100;
	$: currentStepData = steps[currentStep];
	$: canProceed = validateCurrentStep();
	
	function validateCurrentStep(): boolean {
		switch (currentStepData.id) {
			case 'welcome':
				return true;
			case 'wallpaper':
				return selectedTheme !== '';
			case 'bookmarks':
				return importedBookmarks.length > 0 || manualBookmarks.length > 0;
			case 'performance':
				return performanceProfile !== '';
			case 'customize':
				return true;
			case 'complete':
				return true;
			default:
				return false;
		}
	}
	
	async function nextStep() {
		if (!canProceed) return;
		
		if (currentStep < steps.length - 1) {
			contentOpacity.set(0);
			await tick();
			
			currentStep++;
			stepAnimation.set(currentStep);
			progressValue.set(progressPercent);
			
			await tick();
			contentOpacity.set(1);
		} else {
			await completeSetup();
		}
	}
	
	async function prevStep() {
		if (currentStep > 0) {
			contentOpacity.set(0);
			await tick();
			
			currentStep--;
			stepAnimation.set(currentStep);
			progressValue.set(progressPercent);
			
			await tick();
			contentOpacity.set(1);
		}
	}
	
	function handleFileImport(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const content = e.target?.result as string;
				let bookmarks = [];
				
				if (file.name.endsWith('.json')) {
					bookmarks = JSON.parse(content);
				} else if (file.name.endsWith('.html')) {
					bookmarks = parseBookmarkHTML(content);
				}
				
				importedBookmarks = Array.isArray(bookmarks) ? bookmarks : [bookmarks];
				errorMessage = '';
			} catch (error) {
				errorMessage = 'Failed to import bookmarks. Please check the file format.';
			}
		};
		reader.readAsText(file);
	}
	
	function parseBookmarkHTML(html: string): any[] {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const links = doc.querySelectorAll('a[href]');
		
		return Array.from(links).map(link => ({
			name: link.textContent?.trim() || 'Untitled',
			url: link.getAttribute('href'),
			category: 'Imported'
		}));
	}
	
	function addManualBookmark() {
		if (manualBookmarkForm.name && manualBookmarkForm.url) {
			manualBookmarks = [...manualBookmarks, { ...manualBookmarkForm }];
			manualBookmarkForm = { name: '', url: '', category: 'General' };
		}
	}
	
	function removeBookmark(index: number, type: 'manual' | 'imported') {
		if (type === 'manual') {
			manualBookmarks = manualBookmarks.filter((_, i) => i !== index);
		} else {
			importedBookmarks = importedBookmarks.filter((_, i) => i !== index);
		}
	}
	
	function selectPerformanceProfile(profile: string) {
		performanceProfile = profile;
		
		switch (profile) {
			case 'performance':
				customSettings = {
					particleCount: 50,
					autoTransition: false,
					transitionDuration: 60,
					enableSpecialEffects: false
				};
				break;
			case 'balanced':
				customSettings = {
					particleCount: 75,
					autoTransition: true,
					transitionDuration: 30,
					enableSpecialEffects: true
				};
				break;
			case 'visual':
				customSettings = {
					particleCount: 150,
					autoTransition: true,
					transitionDuration: 15,
					enableSpecialEffects: true
				};
				break;
		}
	}
	
	async function completeSetup() {
		isLoading = true;
		
		try {
			// Apply wallpaper theme
			if (selectedTheme) {
				await wallpaperStore.setTheme(selectedTheme);
			}
			
			// Import bookmarks
			const allBookmarks = [...importedBookmarks, ...manualBookmarks];
			for (const bookmark of allBookmarks) {
				await bookmarkStore.addBookmark(bookmark);
			}
			
			// Apply performance settings
			await settingsStore.update({
				particles: {
					enabled: true,
					count: customSettings.particleCount,
					mouseInfluence: 50,
					speed: 50
				},
				wallpaper: {
					autoTransition: customSettings.autoTransition,
					cycleDuration: customSettings.transitionDuration * 1000,
					enableSpecialEffects: customSettings.enableSpecialEffects,
					transitionType: 'fade'
				},
				ui: {
					autoHide: false,
					autoHideTimeout: 15,
					highContrast: false,
					opacity: 90,
					blurIntensity: 8,
					adaptiveColors: true
				},
				performance: {
					monitoring: true
				}
			});
			
			// Mark setup as complete
			await setupStore.markComplete();
			
			dispatch('complete');
		} catch (error) {
			errorMessage = 'Setup failed. Please try again.';
			console.error('Setup error:', error);
		} finally {
			isLoading = false;
		}
	}
	
	onMount(() => {
		progressValue.set(progressPercent);
		stepAnimation.set(0);
	});
</script>

<div class="setup-wizard">
	<div class="wizard-container">
		<!-- Progress Header -->
		<header class="wizard-header">
			<div class="progress-section">
				<div class="progress-bar">
					<div class="progress-fill" style="width: {$progressValue}%"></div>
				</div>
				<div class="step-counter">
					Step {currentStep + 1} of {steps.length}
				</div>
			</div>
			<div class="step-indicators">
				{#each steps as step, index}
					<div 
						class="step-indicator" 
						class:active={index === currentStep}
						class:completed={index < currentStep}
					>
						<span class="step-icon">{step.icon}</span>
					</div>
				{/each}
			</div>
		</header>
		
		<!-- Main Content -->
		<main class="wizard-content" style="opacity: {$contentOpacity}">
			<div class="step-header">
				<h1>{currentStepData.title}</h1>
				<p>{currentStepData.subtitle}</p>
			</div>
			
			{#if errorMessage}
				<div class="error-message">
					{errorMessage}
				</div>
			{/if}
			
			<div class="step-content">
				{#if currentStepData.id === 'welcome'}
					<div class="welcome-content">
						<div class="welcome-hero">
							<div class="hero-icon">🚀</div>
							<h2>Transform Your Browser Experience</h2>
							<p>Create a personalized start page with beautiful wallpapers, organized bookmarks, and interactive elements that adapt to your style.</p>
						</div>
						<div class="feature-grid">
							<div class="feature-card">
								<span class="feature-icon">🖼️</span>
								<h3>Dynamic Wallpapers</h3>
								<p>Beautiful, auto-changing backgrounds</p>
							</div>
							<div class="feature-card">
								<span class="feature-icon">📚</span>
								<h3>Smart Bookmarks</h3>
								<p>Organized, visual bookmark management</p>
							</div>
							<div class="feature-card">
								<span class="feature-icon">✨</span>
								<h3>Interactive Particles</h3>
								<p>Responsive visual effects</p>
							</div>
						</div>
					</div>
				{:else if currentStepData.id === 'wallpaper'}
					<div class="wallpaper-selection">
						<div class="themes-grid">
							{#each availableThemes as theme}
								<div 
									class="theme-card" 
									class:selected={selectedTheme === theme.id}
									on:click={() => selectedTheme = theme.id}
									role="button"
									tabindex="0"
									on:keydown={(e) => e.key === 'Enter' && (selectedTheme = theme.id)}
								>
									<div class="theme-preview">
										<img src={theme.preview} alt={theme.name} loading="lazy" />
										<div class="theme-overlay">
											<span class="image-count">{theme.count} images</span>
										</div>
									</div>
									<div class="theme-info">
										<h3>{theme.name}</h3>
										<p>{theme.description}</p>
									</div>
									<div class="selection-indicator">
										{#if selectedTheme === theme.id}
											<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<polyline points="20,6 9,17 4,12"/>
											</svg>
										{/if}
									</div>
								</div>
							{/each}
						</div>
						<div class="tooltip-section">
							<div class="tooltip">
								💡 <strong>Tip:</strong> You can upload your own images later in the settings
							</div>
						</div>
					</div>
				{:else if currentStepData.id === 'bookmarks'}
					<div class="bookmark-setup">
						<div class="import-section">
							<h3>Import Existing Bookmarks</h3>
							<div class="import-options">
								<button class="import-button" on:click={() => fileInput.click()}>
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2h4"/>
										<polyline points="17,6 22,11 17,16"/>
										<line x1="11" y1="11" x2="22" y2="11"/>
									</svg>
									Import from File (JSON/HTML)
								</button>
								<input 
									type="file" 
									accept=".json,.html" 
									style="display: none" 
									bind:this={fileInput}
									on:change={handleFileImport}
								/>
							</div>
							
							{#if importedBookmarks.length > 0}
								<div class="imported-bookmarks">
									<h4>Imported Bookmarks ({importedBookmarks.length})</h4>
									<div class="bookmark-list">
										{#each importedBookmarks.slice(0, 5) as bookmark, index}
											<div class="bookmark-item">
												<span class="bookmark-name">{bookmark.name}</span>
												<span class="bookmark-url">{bookmark.url}</span>
												<button class="remove-button" on:click={() => removeBookmark(index, 'imported')}>×</button>
											</div>
										{/each}
										{#if importedBookmarks.length > 5}
											<div class="bookmark-overflow">
												... and {importedBookmarks.length - 5} more
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>
						
						<div class="manual-section">
							<h3>Add Bookmarks Manually</h3>
							<div class="bookmark-form">
								<input 
									type="text" 
									placeholder="Bookmark name" 
									bind:value={manualBookmarkForm.name}
									class="form-input"
								/>
								<input 
									type="url" 
									placeholder="https://example.com" 
									bind:value={manualBookmarkForm.url}
									class="form-input"
								/>
								<select bind:value={manualBookmarkForm.category} class="form-select">
									{#each bookmarkCategories as category}
										<option value={category}>{category}</option>
									{/each}
								</select>
								<button 
									class="add-button" 
									on:click={addManualBookmark}
									disabled={!manualBookmarkForm.name || !manualBookmarkForm.url}
								>
									Add Bookmark
								</button>
							</div>
							
							{#if manualBookmarks.length > 0}
								<div class="manual-bookmarks">
									<h4>Manual Bookmarks ({manualBookmarks.length})</h4>
									<div class="bookmark-list">
										{#each manualBookmarks as bookmark, index}
											<div class="bookmark-item">
												<span class="bookmark-name">{bookmark.name}</span>
												<span class="bookmark-url">{bookmark.url}</span>
												<span class="bookmark-category">{bookmark.category}</span>
												<button class="remove-button" on:click={() => removeBookmark(index, 'manual')}>×</button>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						
						<div class="tooltip-section">
							<div class="tooltip">
								💡 <strong>Tip:</strong> You can organize and edit bookmarks later. For now, just add the ones you use most.
							</div>
						</div>
					</div>
				{:else if currentStepData.id === 'performance'}
					<div class="performance-setup">
						<div class="profile-grid">
							<div 
								class="profile-card" 
								class:selected={performanceProfile === 'performance'}
								on:click={() => selectPerformanceProfile('performance')}
								role="button"
								tabindex="0"
								on:keydown={(e) => e.key === 'Enter' && selectPerformanceProfile('performance')}
							>
								<div class="profile-icon">⚡</div>
								<h3>Performance First</h3>
								<p>Optimized for speed and battery life</p>
								<ul class="profile-specs">
									<li>Fewer particles (50)</li>
									<li>Reduced animations</li>
									<li>Manual wallpaper changes</li>
									<li>Best for older devices</li>
								</ul>
							</div>
							
							<div 
								class="profile-card recommended" 
								class:selected={performanceProfile === 'balanced'}
								on:click={() => selectPerformanceProfile('balanced')}
								role="button"
								tabindex="0"
								on:keydown={(e) => e.key === 'Enter' && selectPerformanceProfile('balanced')}
							>
								<div class="profile-icon">⚖️</div>
								<div class="recommended-badge">Recommended</div>
								<h3>Balanced</h3>
								<p>Perfect balance of performance and visuals</p>
								<ul class="profile-specs">
									<li>Moderate particles (75)</li>
									<li>Auto wallpaper transitions</li>
									<li>Smooth animations</li>
									<li>Great for most devices</li>
								</ul>
							</div>
							
							<div 
								class="profile-card" 
								class:selected={performanceProfile === 'visual'}
								on:click={() => selectPerformanceProfile('visual')}
								role="button"
								tabindex="0"
								on:keydown={(e) => e.key === 'Enter' && selectPerformanceProfile('visual')}
							>
								<div class="profile-icon">🎨</div>
								<h3>Visual Excellence</h3>
								<p>Maximum eye candy and effects</p>
								<ul class="profile-specs">
									<li>Many particles (150)</li>
									<li>Rich animations</li>
									<li>Frequent transitions</li>
									<li>Best for powerful devices</li>
								</ul>
							</div>
						</div>
						
						<div class="tooltip-section">
							<div class="tooltip">
								💡 <strong>Tip:</strong> You can always adjust these settings later. The system will also adapt automatically based on your device's performance.
							</div>
						</div>
					</div>
				{:else if currentStepData.id === 'customize'}
					<div class="customization-setup">
						<div class="customization-grid">
							<div class="custom-section">
								<h3>Particle Effects</h3>
								<label class="custom-control">
									<span>Particle Count</span>
									<input 
										type="range" 
										min="25" 
										max="200" 
										bind:value={customSettings.particleCount}
									/>
									<span class="range-value">{customSettings.particleCount}</span>
								</label>
							</div>
							
							<div class="custom-section">
								<h3>Wallpaper Behavior</h3>
								<label class="custom-control">
									<span>Auto-transition wallpapers</span>
									<input type="checkbox" bind:checked={customSettings.autoTransition} />
								</label>
								<label class="custom-control">
									<span>Transition interval (seconds)</span>
									<input 
										type="range" 
										min="10" 
										max="120" 
										bind:value={customSettings.transitionDuration}
									/>
									<span class="range-value">{customSettings.transitionDuration}s</span>
								</label>
							</div>
							
							<div class="custom-section">
								<h3>Visual Effects</h3>
								<label class="custom-control">
									<span>Enable special effects</span>
									<input type="checkbox" bind:checked={customSettings.enableSpecialEffects} />
								</label>
							</div>
						</div>
						
						<div class="preview-section">
							<h3>Live Preview</h3>
							<div class="mini-preview">
								<div class="preview-particles" style="--particle-count: {Math.min(customSettings.particleCount / 10, 20)}">
									{#each Array(Math.min(customSettings.particleCount / 10, 20)) as _}
										<div class="preview-particle"></div>
									{/each}
								</div>
								<div class="preview-text">
									{customSettings.particleCount} particles • 
									{customSettings.autoTransition ? `${customSettings.transitionDuration}s auto` : 'Manual'} • 
									{customSettings.enableSpecialEffects ? 'Effects on' : 'Effects off'}
								</div>
							</div>
						</div>
					</div>
				{:else if currentStepData.id === 'complete'}
					<div class="completion-content">
						<div class="success-animation">
							<div class="success-circle">
								<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="20,6 9,17 4,12"/>
								</svg>
							</div>
						</div>
						<div class="completion-summary">
							<h2>Welcome to Your New Start Page!</h2>
							<p>Everything is configured and ready to go. Here's what we set up for you:</p>
							
							<div class="setup-summary">
								<div class="summary-item">
									<span class="summary-icon">🖼️</span>
									<div>
										<h4>Wallpaper Theme</h4>
										<p>{availableThemes.find(t => t.id === selectedTheme)?.name || 'Custom theme'}</p>
									</div>
								</div>
								<div class="summary-item">
									<span class="summary-icon">📚</span>
									<div>
										<h4>Bookmarks</h4>
										<p>{importedBookmarks.length + manualBookmarks.length} bookmarks imported</p>
									</div>
								</div>
								<div class="summary-item">
									<span class="summary-icon">⚡</span>
									<div>
										<h4>Performance</h4>
										<p>{performanceProfile.charAt(0).toUpperCase() + performanceProfile.slice(1)} profile selected</p>
									</div>
								</div>
							</div>
							
							<div class="next-steps">
								<h3>What's Next?</h3>
								<ul>
									<li>Press <kbd>Ctrl+S</kbd> to open settings anytime</li>
									<li>Use <kbd>Space</kbd> to change wallpapers</li>
									<li>Right-click bookmarks to edit them</li>
									<li>Upload your own wallpapers in settings</li>
								</ul>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</main>
		
		<!-- Navigation -->
		<footer class="wizard-footer">
			<button 
				class="nav-button secondary" 
				on:click={prevStep}
				disabled={currentStep === 0}
			>
				← Previous
			</button>
			
			<button 
				class="nav-button primary" 
				class:loading={isLoading}
				on:click={nextStep}
				disabled={!canProceed || isLoading}
			>
				{#if isLoading}
					<span class="spinner"></span>
				{:else if currentStep === steps.length - 1}
					Finish Setup
				{:else}
					Next →
				{/if}
			</button>
		</footer>
	</div>
</div>

<style>
	.setup-wizard {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	
	.wizard-container {
		width: 90vw;
		height: 85vh;
		max-width: 1000px;
		max-height: 700px;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 24px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 32px 64px rgba(0, 0, 0, 0.3);
	}
	
	.wizard-header {
		padding: 32px 32px 24px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.progress-section {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 24px;
	}
	
	.progress-bar {
		flex: 1;
		height: 8px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		overflow: hidden;
	}
	
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4caf50, #8bc34a);
		border-radius: 4px;
		transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.step-counter {
		color: rgba(255, 255, 255, 0.8);
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
	}
	
	.step-indicators {
		display: flex;
		gap: 16px;
		justify-content: center;
	}
	
	.step-indicator {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.4s ease;
		position: relative;
	}
	
	.step-indicator.active {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.8);
		transform: scale(1.1);
	}
	
	.step-indicator.completed {
		background: #4caf50;
		border-color: #4caf50;
	}
	
	.step-icon {
		font-size: 20px;
	}
	
	.wizard-content {
		flex: 1;
		padding: 32px;
		overflow-y: auto;
		transition: opacity 0.3s ease;
	}
	
	.step-header {
		text-align: center;
		margin-bottom: 32px;
	}
	
	.step-header h1 {
		margin: 0 0 8px;
		font-size: 28px;
		font-weight: 600;
		color: white;
	}
	
	.step-header p {
		margin: 0;
		font-size: 16px;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;
	}
	
	.error-message {
		background: rgba(244, 67, 54, 0.2);
		border: 1px solid rgba(244, 67, 54, 0.5);
		color: #f44336;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 24px;
		text-align: center;
	}
	
	.welcome-content {
		text-align: center;
		max-width: 600px;
		margin: 0 auto;
	}
	
	.welcome-hero {
		margin-bottom: 48px;
	}
	
	.hero-icon {
		font-size: 64px;
		margin-bottom: 24px;
	}
	
	.welcome-hero h2 {
		margin: 0 0 16px;
		font-size: 24px;
		color: white;
		font-weight: 600;
	}
	
	.welcome-hero p {
		margin: 0;
		font-size: 16px;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.6;
	}
	
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 24px;
	}
	
	.feature-card {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 24px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		text-align: center;
	}
	
	.feature-icon {
		font-size: 32px;
		display: block;
		margin-bottom: 12px;
	}
	
	.feature-card h3 {
		margin: 0 0 8px;
		font-size: 16px;
		color: white;
		font-weight: 600;
	}
	
	.feature-card p {
		margin: 0;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.7);
	}
	
	.themes-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 24px;
		margin-bottom: 24px;
	}
	
	.theme-card {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		overflow: hidden;
		border: 2px solid rgba(255, 255, 255, 0.2);
		cursor: pointer;
		transition: all 0.3s ease;
		position: relative;
	}
	
	.theme-card:hover {
		transform: translateY(-4px);
		border-color: rgba(255, 255, 255, 0.4);
	}
	
	.theme-card.selected {
		border-color: #4caf50;
		box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
	}
	
	.theme-preview {
		position: relative;
		height: 120px;
		overflow: hidden;
	}
	
	.theme-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	
	.theme-overlay {
		position: absolute;
		top: 8px;
		right: 8px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
	}
	
	.theme-info {
		padding: 16px;
	}
	
	.theme-info h3 {
		margin: 0 0 4px;
		font-size: 16px;
		color: white;
		font-weight: 600;
	}
	
	.theme-info p {
		margin: 0;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.7);
	}
	
	.selection-indicator {
		position: absolute;
		top: 8px;
		left: 8px;
		width: 32px;
		height: 32px;
		background: #4caf50;
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
	
	.bookmark-setup {
		max-width: 700px;
		margin: 0 auto;
	}
	
	.import-section, .manual-section {
		margin-bottom: 32px;
	}
	
	.import-section h3, .manual-section h3 {
		margin: 0 0 16px;
		font-size: 18px;
		color: white;
		font-weight: 600;
	}
	
	.import-button {
		background: rgba(33, 150, 243, 0.2);
		border: 2px dashed rgba(33, 150, 243, 0.5);
		color: #2196f3;
		padding: 16px 24px;
		border-radius: 12px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: all 0.3s ease;
		width: 100%;
	}
	
	.import-button:hover {
		background: rgba(33, 150, 243, 0.3);
		border-color: rgba(33, 150, 243, 0.7);
	}
	
	.bookmark-form {
		display: grid;
		grid-template-columns: 1fr 1fr auto auto;
		gap: 12px;
		align-items: center;
		margin-bottom: 16px;
	}
	
	.form-input, .form-select {
		padding: 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 14px;
	}
	
	.form-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}
	
	.add-button {
		background: #4caf50;
		color: white;
		border: none;
		padding: 12px 16px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 500;
		transition: all 0.3s ease;
		white-space: nowrap;
	}
	
	.add-button:hover:not(:disabled) {
		background: #45a049;
	}
	
	.add-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.bookmark-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 200px;
		overflow-y: auto;
	}
	
	.bookmark-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		font-size: 14px;
	}
	
	.bookmark-name {
		font-weight: 500;
		color: white;
		min-width: 120px;
	}
	
	.bookmark-url {
		color: rgba(255, 255, 255, 0.7);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.bookmark-category {
		color: rgba(255, 255, 255, 0.6);
		font-size: 12px;
		background: rgba(255, 255, 255, 0.1);
		padding: 2px 6px;
		border-radius: 4px;
	}
	
	.remove-button {
		background: rgba(244, 67, 54, 0.2);
		color: #f44336;
		border: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		line-height: 1;
	}
	
	.profile-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 24px;
		margin-bottom: 24px;
	}
	
	.profile-card {
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 16px;
		padding: 24px;
		cursor: pointer;
		transition: all 0.3s ease;
		position: relative;
		text-align: center;
	}
	
	.profile-card:hover {
		transform: translateY(-4px);
		border-color: rgba(255, 255, 255, 0.4);
	}
	
	.profile-card.selected {
		border-color: #4caf50;
		box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
	}
	
	.profile-card.recommended::before {
		content: '';
		position: absolute;
		top: -2px;
		left: -2px;
		right: -2px;
		bottom: -2px;
		background: linear-gradient(45deg, #4caf50, #8bc34a);
		border-radius: 18px;
		z-index: -1;
	}
	
	.recommended-badge {
		position: absolute;
		top: -8px;
		right: 16px;
		background: #4caf50;
		color: white;
		padding: 4px 12px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 600;
	}
	
	.profile-icon {
		font-size: 32px;
		margin-bottom: 12px;
	}
	
	.profile-card h3 {
		margin: 0 0 8px;
		font-size: 18px;
		color: white;
		font-weight: 600;
	}
	
	.profile-card p {
		margin: 0 0 16px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.8);
	}
	
	.profile-specs {
		list-style: none;
		padding: 0;
		margin: 0;
		text-align: left;
	}
	
	.profile-specs li {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.7);
		margin-bottom: 4px;
		padding-left: 16px;
		position: relative;
	}
	
	.profile-specs li::before {
		content: '•';
		color: #4caf50;
		position: absolute;
		left: 0;
	}
	
	.customization-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 24px;
		margin-bottom: 32px;
	}
	
	.custom-section {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 20px;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	.custom-section h3 {
		margin: 0 0 16px;
		font-size: 16px;
		color: white;
		font-weight: 600;
	}
	
	.custom-control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.9);
	}
	
	.custom-control input[type="range"] {
		flex: 1;
		margin: 0 12px;
	}
	
	.custom-control input[type="checkbox"] {
		width: 18px;
		height: 18px;
		accent-color: #4caf50;
	}
	
	.range-value {
		min-width: 40px;
		text-align: center;
		font-weight: 500;
		color: #4caf50;
	}
	
	.preview-section {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 16px;
		padding: 24px;
		text-align: center;
	}
	
	.preview-section h3 {
		margin: 0 0 16px;
		font-size: 16px;
		color: white;
		font-weight: 600;
	}
	
	.mini-preview {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 12px;
		padding: 20px;
		position: relative;
		height: 100px;
		overflow: hidden;
	}
	
	.preview-particles {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}
	
	.preview-particle {
		position: absolute;
		width: 3px;
		height: 3px;
		background: #4caf50;
		border-radius: 50%;
		opacity: 0.6;
		animation: float 3s ease-in-out infinite;
	}
	
	.preview-particle:nth-child(odd) {
		animation-delay: -1.5s;
	}
	
	.preview-text {
		position: relative;
		z-index: 1;
		color: rgba(255, 255, 255, 0.8);
		font-size: 14px;
		margin-top: 50px;
	}
	
	@keyframes float {
		0%, 100% { transform: translateY(0px) rotate(0deg); }
		33% { transform: translateY(-10px) rotate(120deg); }
		66% { transform: translateY(5px) rotate(240deg); }
	}
	
	.completion-content {
		text-align: center;
		max-width: 600px;
		margin: 0 auto;
	}
	
	.success-animation {
		margin-bottom: 32px;
	}
	
	.success-circle {
		width: 80px;
		height: 80px;
		background: #4caf50;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto;
		color: white;
		animation: successPulse 2s ease-in-out infinite;
	}
	
	@keyframes successPulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.1); }
	}
	
	.completion-summary h2 {
		margin: 0 0 16px;
		font-size: 24px;
		color: white;
		font-weight: 600;
	}
	
	.completion-summary p {
		margin: 0 0 32px;
		font-size: 16px;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;
	}
	
	.setup-summary {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 32px;
	}
	
	.summary-item {
		display: flex;
		align-items: center;
		gap: 16px;
		background: rgba(255, 255, 255, 0.1);
		padding: 16px;
		border-radius: 12px;
		text-align: left;
	}
	
	.summary-icon {
		font-size: 24px;
	}
	
	.summary-item h4 {
		margin: 0 0 4px;
		font-size: 14px;
		color: white;
		font-weight: 600;
	}
	
	.summary-item p {
		margin: 0;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.7);
	}
	
	.next-steps {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 20px;
		text-align: left;
	}
	
	.next-steps h3 {
		margin: 0 0 12px;
		font-size: 16px;
		color: white;
		font-weight: 600;
	}
	
	.next-steps ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	
	.next-steps li {
		font-size: 14px;
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 8px;
		padding-left: 20px;
		position: relative;
	}
	
	.next-steps li::before {
		content: '→';
		color: #4caf50;
		position: absolute;
		left: 0;
	}
	
	.next-steps kbd {
		background: rgba(255, 255, 255, 0.2);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
		font-family: monospace;
	}
	
	.tooltip-section {
		margin-top: 24px;
	}
	
	.tooltip {
		background: rgba(255, 193, 7, 0.2);
		border: 1px solid rgba(255, 193, 7, 0.4);
		color: #ffc107;
		padding: 12px 16px;
		border-radius: 8px;
		font-size: 14px;
		text-align: center;
	}
	
	.wizard-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 32px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.nav-button {
		padding: 12px 24px;
		border: none;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 120px;
		justify-content: center;
	}
	
	.nav-button.secondary {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}
	
	.nav-button.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}
	
	.nav-button.primary {
		background: #4caf50;
		color: white;
	}
	
	.nav-button.primary:hover:not(:disabled) {
		background: #45a049;
		transform: translateY(-1px);
	}
	
	.nav-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none !important;
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
		.wizard-container {
			width: 95vw;
			height: 90vh;
		}
		
		.wizard-header {
			padding: 20px 20px 16px;
		}
		
		.step-indicators {
			gap: 8px;
		}
		
		.step-indicator {
			width: 40px;
			height: 40px;
		}
		
		.step-icon {
			font-size: 16px;
		}
		
		.wizard-content {
			padding: 20px;
		}
		
		.step-header h1 {
			font-size: 22px;
		}
		
		.themes-grid {
			grid-template-columns: 1fr;
			gap: 16px;
		}
		
		.profile-grid {
			grid-template-columns: 1fr;
			gap: 16px;
		}
		
		.customization-grid {
			grid-template-columns: 1fr;
			gap: 16px;
		}
		
		.bookmark-form {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		
		.wizard-footer {
			padding: 16px 20px;
		}
		
		.nav-button {
			min-width: 100px;
			padding: 12px 16px;
		}
	}
</style>
