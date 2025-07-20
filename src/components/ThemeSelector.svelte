<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Search, Bookmark } from 'lucide-svelte';
	
	interface Theme {
		id: string;
		name: string;
		description: string;
		colors: {
			primary: string;
			secondary: string;
			accent: string;
			background: string;
			surface: string;
			text: string;
			textSecondary: string;
		};
		effects: {
			blur: string;
			opacity: string;
			glow: string;
		};
	}
	
	interface Props {
		currentTheme: string;
		show: boolean;
	}
	
	let { currentTheme, show }: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let hoveredTheme: string | null = $state(null);
	let focusedIndex = $state(0);
	let selectorElement: HTMLDivElement;
	
	const themes: Theme[] = [
		{
			id: 'dark',
			name: 'Dark Mode',
			description: 'Classic dark theme with deep blacks and soft whites',
			colors: {
				primary: '#3b82f6',
				secondary: '#1e293b',
				accent: '#06b6d4',
				background: 'rgba(15, 23, 42, 0.95)',
				surface: 'rgba(30, 41, 59, 0.8)',
				text: '#f1f5f9',
				textSecondary: '#94a3b8'
			},
			effects: {
				blur: 'blur(12px)',
				opacity: '0.95',
				glow: '0 0 20px rgba(59, 130, 246, 0.3)'
			}
		},
		{
			id: 'light',
			name: 'Light Mode',
			description: 'Clean light theme with crisp contrast',
			colors: {
				primary: '#2563eb',
				secondary: '#f8fafc',
				accent: '#0891b2',
				background: 'rgba(248, 250, 252, 0.95)',
				surface: 'rgba(255, 255, 255, 0.8)',
				text: '#0f172a',
				textSecondary: '#64748b'
			},
			effects: {
				blur: 'blur(12px)',
				opacity: '0.95',
				glow: '0 0 20px rgba(37, 99, 235, 0.2)'
			}
		},
		{
			id: 'neon',
			name: 'Neon Cyber',
			description: 'Vibrant cyberpunk theme with electric highlights',
			colors: {
				primary: '#ff0080',
				secondary: '#000014',
				accent: '#00ffff',
				background: 'rgba(0, 0, 20, 0.9)',
				surface: 'rgba(20, 0, 40, 0.8)',
				text: '#ffffff',
				textSecondary: '#ff00ff'
			},
			effects: {
				blur: 'blur(8px)',
				opacity: '0.9',
				glow: '0 0 30px rgba(255, 0, 128, 0.5)'
			}
		},
		{
			id: 'glass',
			name: 'Frosted Glass',
			description: 'Elegant glassmorphism with subtle transparency',
			colors: {
				primary: '#8b5cf6',
				secondary: '#f3f4f6',
				accent: '#06b6d4',
				background: 'rgba(255, 255, 255, 0.1)',
				surface: 'rgba(255, 255, 255, 0.15)',
				text: '#ffffff',
				textSecondary: 'rgba(255, 255, 255, 0.8)'
			},
			effects: {
				blur: 'blur(20px)',
				opacity: '0.1',
				glow: '0 0 25px rgba(139, 92, 246, 0.3)'
			}
		},
		{
			id: 'minimal',
			name: 'Minimal',
			description: 'Ultra-clean minimalist design',
			colors: {
				primary: '#374151',
				secondary: '#ffffff',
				accent: '#6b7280',
				background: 'rgba(255, 255, 255, 0.98)',
				surface: 'rgba(249, 250, 251, 0.9)',
				text: '#111827',
				textSecondary: '#6b7280'
			},
			effects: {
				blur: 'blur(4px)',
				opacity: '0.98',
				glow: '0 0 10px rgba(55, 65, 81, 0.1)'
			}
		},
		{
			id: 'sunset',
			name: 'Sunset Glow',
			description: 'Warm gradient theme with sunset colors',
			colors: {
				primary: '#f59e0b',
				secondary: '#7c2d12',
				accent: '#dc2626',
				background: 'rgba(124, 45, 18, 0.9)',
				surface: 'rgba(194, 65, 12, 0.8)',
				text: '#fef3c7',
				textSecondary: '#fed7aa'
			},
			effects: {
				blur: 'blur(10px)',
				opacity: '0.9',
				glow: '0 0 35px rgba(245, 158, 11, 0.4)'
			}
		},
		{
			id: 'ocean',
			name: 'Ocean Depths',
			description: 'Deep blue theme inspired by ocean depths',
			colors: {
				primary: '#0ea5e9',
				secondary: '#0c4a6e',
				accent: '#06b6d4',
				background: 'rgba(12, 74, 110, 0.9)',
				surface: 'rgba(7, 89, 133, 0.8)',
				text: '#e0f2fe',
				textSecondary: '#7dd3fc'
			},
			effects: {
				blur: 'blur(15px)',
				opacity: '0.9',
				glow: '0 0 25px rgba(14, 165, 233, 0.4)'
			}
		},
		{
			id: 'forest',
			name: 'Forest Green',
			description: 'Natural green theme with earthy tones',
			colors: {
				primary: '#22c55e',
				secondary: '#14532d',
				accent: '#84cc16',
				background: 'rgba(20, 83, 45, 0.9)',
				surface: 'rgba(22, 101, 52, 0.8)',
				text: '#f0fdf4',
				textSecondary: '#bbf7d0'
			},
			effects: {
				blur: 'blur(12px)',
				opacity: '0.9',
				glow: '0 0 20px rgba(34, 197, 94, 0.3)'
			}
		}
	];
	
	function handleThemeSelect(themeId: string) {
		dispatch('select', themeId);
	}
	
	function handleKeyNavigation(event: KeyboardEvent) {
		if (!show) return;
		
		const totalThemes = themes.length;
		let newIndex = focusedIndex;
		
		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				newIndex = (focusedIndex + 1) % totalThemes;
				break;
			case 'ArrowLeft':
				event.preventDefault();
				newIndex = (focusedIndex - 1 + totalThemes) % totalThemes;
				break;
			case 'ArrowDown':
				event.preventDefault();
				newIndex = Math.min(focusedIndex + 3, totalThemes - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				newIndex = Math.max(focusedIndex - 3, 0);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				handleThemeSelect(themes[focusedIndex].id);
				return;
			case 'Escape':
				event.preventDefault();
				dispatch('close');
				return;
			default:
				return;
		}
		
		if (newIndex !== focusedIndex) {
			focusedIndex = newIndex;
			const themeCard = selectorElement?.children[newIndex] as HTMLElement;
			themeCard?.focus();
		}
	}
	
	function getPreviewTheme() {
		return hoveredTheme ? themes.find(t => t.id === hoveredTheme) : themes.find(t => t.id === currentTheme);
	}
	
	$effect(() => {
		if (show) {
			document.addEventListener('keydown', handleKeyNavigation);
			setTimeout(() => {
				const currentCard = selectorElement?.children[themes.findIndex(t => t.id === currentTheme)] as HTMLElement;
				currentCard?.focus();
				focusedIndex = themes.findIndex(t => t.id === currentTheme);
			}, 100);
		} else {
			document.removeEventListener('keydown', handleKeyNavigation);
		}
		
		return () => {
			document.removeEventListener('keydown', handleKeyNavigation);
		};
	});
</script>

{#if show}
	<div class="theme-selector-overlay" role="dialog" aria-modal="true" aria-labelledby="theme-selector-title">
		<div class="theme-selector">
			<div class="selector-header">
				<h2 id="theme-selector-title">Choose Theme</h2>
				<p class="selector-subtitle">Select a visual theme for your start page</p>
			</div>
			
			<div class="preview-section" aria-live="polite">
				{#if getPreviewTheme()}
					{@const previewTheme = getPreviewTheme()}
					<div 
						class="theme-preview" 
						style="
							background: {previewTheme.colors.background};
							backdrop-filter: {previewTheme.effects.blur};
							box-shadow: {previewTheme.effects.glow};
						"
						aria-label={`Preview of ${previewTheme.name} theme`}
					>
						<div 
							class="preview-search"
							style="
								background: {previewTheme.colors.surface};
								color: {previewTheme.colors.text};
								backdrop-filter: {previewTheme.effects.blur};
							"
						>
							<Search size={16} color={previewTheme.colors.textSecondary} />
							<span style="color: {previewTheme.colors.textSecondary};">Search the web...</span>
						</div>
						<div class="preview-bookmarks">
							{#each Array(4) as _, i}
								<div 
									class="preview-bookmark"
									style="
										background: {previewTheme.colors.surface};
										color: {previewTheme.colors.primary};
										backdrop-filter: {previewTheme.effects.blur};
									"
								>
									<Bookmark size={14} />
								</div>
							{/each}
						</div>
						<div class="preview-info">
							<h3 style="color: {previewTheme.colors.text};">{previewTheme.name}</h3>
							<p style="color: {previewTheme.colors.textSecondary};">{previewTheme.description}</p>
						</div>
					</div>
				{/if}
			</div>
			
			<div 
				bind:this={selectorElement}
				class="themes-grid"
				role="radiogroup"
				aria-labelledby="theme-selector-title"
				aria-describedby="theme-selector-help"
			>
				{#each themes as theme, index}
					{@const isSelected = currentTheme === theme.id}
					{@const isFocused = focusedIndex === index}
					
					<button
						class="theme-card"
						class:selected={isSelected}
						class:focused={isFocused}
						style="
							background: {theme.colors.background};
							border-color: {isSelected ? theme.colors.primary : 'transparent'};
							backdrop-filter: {theme.effects.blur};
						"
						role="radio"
						aria-checked={isSelected}
						aria-labelledby={`theme-${theme.id}-name`}
						aria-describedby={`theme-${theme.id}-desc`}
						tabindex={isFocused ? 0 : -1}
						onclick={() => handleThemeSelect(theme.id)}
						onmouseenter={() => hoveredTheme = theme.id}
						onmouseleave={() => hoveredTheme = null}
						onfocus={() => { focusedIndex = index; hoveredTheme = theme.id; }}
						onblur={() => hoveredTheme = null}
						type="button"
					>
						<div class="theme-preview-mini">
							<div 
								class="mini-search"
								style="background: {theme.colors.surface}; color: {theme.colors.textSecondary};"
							></div>
							<div class="mini-bookmarks">
								{#each Array(3) as _}
									<div 
										class="mini-bookmark"
										style="background: {theme.colors.primary};"
									></div>
								{/each}
							</div>
						</div>
						<div class="theme-info">
							<h4 id={`theme-${theme.id}-name`} style="color: {theme.colors.text};">{theme.name}</h4>
							<p id={`theme-${theme.id}-desc`} style="color: {theme.colors.textSecondary};">{theme.description}</p>
						</div>
						{#if isSelected}
							<div class="selected-indicator" style="background: {theme.colors.primary};" aria-hidden="true"></div>
						{/if}
					</button>
				{/each}
			</div>
			
			<p id="theme-selector-help" class="sr-only">
				Use arrow keys to navigate themes, Enter or Space to select, Escape to close
			</p>
		</div>
	</div>
{/if}

<style>
	.theme-selector-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}
	
	.theme-selector {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 20px;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
		width: 100%;
		max-width: 900px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	
	.selector-header {
		padding: 24px 24px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		text-align: center;
	}
	
	.selector-header h2 {
		font-size: 28px;
		font-weight: 700;
		margin: 0 0 8px;
		color: #1f2937;
	}
	
	.selector-subtitle {
		font-size: 14px;
		color: #6b7280;
		margin: 0;
	}
	
	.preview-section {
		padding: 20px;
		background: #f8fafc;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}
	
	.theme-preview {
		height: 120px;
		border-radius: 12px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		position: relative;
		overflow: hidden;
		transition: all 0.3s ease;
	}
	
	.preview-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 14px;
		width: 200px;
	}
	
	.preview-bookmarks {
		display: flex;
		gap: 8px;
		position: absolute;
		bottom: 16px;
		left: 16px;
	}
	
	.preview-bookmark {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.preview-info {
		position: absolute;
		top: 16px;
		right: 16px;
		text-align: right;
	}
	
	.preview-info h3 {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 4px;
	}
	
	.preview-info p {
		font-size: 12px;
		margin: 0;
		opacity: 0.8;
	}
	
	.themes-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
		padding: 20px;
		overflow-y: auto;
		flex: 1;
	}
	
	.theme-card {
		border: 2px solid transparent;
		border-radius: 12px;
		padding: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
		overflow: hidden;
		outline: none;
		min-height: 120px;
		display: flex;
		flex-direction: column;
	}
	
	.theme-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
	}
	
	.theme-card.focused {
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
	}
	
	.theme-card.selected {
		border-width: 3px;
		transform: translateY(-2px);
	}
	
	.theme-preview-mini {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 12px;
	}
	
	.mini-search {
		height: 20px;
		border-radius: 4px;
		opacity: 0.8;
	}
	
	.mini-bookmarks {
		display: flex;
		gap: 4px;
	}
	
	.mini-bookmark {
		width: 16px;
		height: 16px;
		border-radius: 4px;
	}
	
	.theme-info h4 {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 4px;
	}
	
	.theme-info p {
		font-size: 11px;
		margin: 0;
		opacity: 0.8;
		line-height: 1.3;
	}
	
	.selected-indicator {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
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
		.themes-grid {
			grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
			gap: 12px;
		}
		
		.theme-card {
			min-height: 100px;
			padding: 12px;
		}
		
		.preview-section {
			padding: 16px;
		}
		
		.theme-preview {
			height: 100px;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.theme-card {
			transition: none;
		}
		
		.theme-card:hover {
			transform: none;
		}
		
		.theme-preview {
			transition: none;
		}
	}
</style>
