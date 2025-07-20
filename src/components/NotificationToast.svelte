<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { writable } from 'svelte/store';
	
	export let dominantColor: string = '#ffffff';
	
	const dispatch = createEventDispatcher();
	
	interface Toast {
		id: string;
		type: 'success' | 'error' | 'warning';
		title: string;
		message?: string;
		duration?: number;
		persistent?: boolean;
	}
	
	let toasts: Toast[] = [];
	let timers = new Map<string, number>();
	
	// Animation states
	const containerOpacity = tweened(0, { duration: 300, easing: cubicOut });
	
	// Toast store for global access
	const createToastStore = () => {
		const { subscribe, update } = writable<Toast[]>([]);
		
		const addToast = (toastData: {
			type: 'success' | 'error' | 'warning';
			title: string;
			message?: string;
			duration?: number;
			persistent?: boolean;
		}) => {
			const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
			const newToast: Toast = {
				id,
				duration: 4000,
				...toastData
			};
			
			update(currentToasts => [...currentToasts, newToast]);
			
			// Auto-dismiss unless persistent
			if (!newToast.persistent && newToast.duration) {
				const timer = window.setTimeout(() => {
					removeToast(id);
				}, newToast.duration);
				timers.set(id, timer);
			}
			
			return id;
		};
		
		const removeToast = (id: string) => {
			// Clear timer if exists
			const timer = timers.get(id);
			if (timer) {
				window.clearTimeout(timer);
				timers.delete(id);
			}
			
			update(currentToasts => currentToasts.filter(t => t.id !== id));
		};
		
		const clearAll = () => {
			// Clear all timers
			timers.forEach(timer => window.clearTimeout(timer));
			timers.clear();
			
			update(() => []);
		};
		
		return {
			subscribe,
			success: (title: string, message?: string, duration = 4000) => 
				addToast({ type: 'success', title, message, duration }),
			error: (title: string, message?: string, persistent = false) => 
				addToast({ type: 'error', title, message, persistent }),
			warning: (title: string, message?: string, duration = 4000) => 
				addToast({ type: 'warning', title, message, duration }),
			remove: removeToast,
			clear: clearAll
		};
	};
	
	// Global toast store
	const toastStore = createToastStore();
	
	$: adaptedColors = adaptColorsToBackground(dominantColor);
	
	// Subscribe to toast store
	let unsubscribe: (() => void) | null = null;
	
	function adaptColorsToBackground(bgColor: string) {
		const bgLuminance = getLuminance(bgColor);
		const isDark = bgLuminance < 0.5;
		
		return {
			background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
			border: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
			text: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
			textSecondary: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
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
	
	function getToastColors(type: Toast['type']) {
		switch (type) {
			case 'success':
				return {
					accent: '#4caf50',
					background: 'rgba(76, 175, 80, 0.1)',
					border: 'rgba(76, 175, 80, 0.3)'
				};
			case 'error':
				return {
					accent: '#f44336',
					background: 'rgba(244, 67, 54, 0.1)',
					border: 'rgba(244, 67, 54, 0.3)'
				};
			case 'warning':
				return {
					accent: '#ff9800',
					background: 'rgba(255, 152, 0, 0.1)',
					border: 'rgba(255, 152, 0, 0.3)'
				};
			default:
				return {
					accent: adaptedColors.text,
					background: adaptedColors.background,
					border: adaptedColors.border
				};
		}
	}
	
	function getToastIcon(type: Toast['type']) {
		switch (type) {
			case 'success':
				return `
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<circle cx="12" cy="12" r="10"/>
						<polyline points="9,12 12,15 22,5"/>
					</svg>
				`;
			case 'error':
				return `
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<circle cx="12" cy="12" r="10"/>
						<line x1="15" y1="9" x2="9" y2="15"/>
						<line x1="9" y1="9" x2="15" y2="15"/>
					</svg>
				`;
			case 'warning':
				return `
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
						<line x1="12" y1="9" x2="12" y2="13"/>
						<line x1="12" y1="17" x2="12.01" y2="17"/>
					</svg>
				`;
			default:
				return '';
		}
	}
	
	function removeToast(id: string) {
		toastStore.remove(id);
		
		// If no toasts left, fade out container
		if (toasts.length <= 1) {
			containerOpacity.set(0);
		}
	}
	
	function handleToastClick(toast: Toast) {
		// Allow click-to-dismiss for persistent toasts
		if (toast.persistent) {
			removeToast(toast.id);
		}
	}
	
	onMount(() => {
		if (browser) {
			unsubscribe = toastStore.subscribe(newToasts => {
				toasts = newToasts;
				
				// Fade in container when toasts are added
				if (newToasts.length > 0) {
					containerOpacity.set(1);
				} else {
					containerOpacity.set(0);
				}
			});
		}
	});
	
	onDestroy(() => {
		if (unsubscribe) {
			unsubscribe();
		}
		
		// Clear all timers
		timers.forEach(timer => window.clearTimeout(timer));
		timers.clear();
	});
	
	// Export toast store for global use
	export { toastStore };
</script>

{#if toasts.length > 0}
	<div 
		class="toast-container"
		style="
			--container-opacity: {$containerOpacity};
			--bg-color: {adaptedColors.background};
			--border-color: {adaptedColors.border};
			--text-color: {adaptedColors.text};
			--text-secondary: {adaptedColors.textSecondary};
			--shadow-color: {adaptedColors.shadow};
		"
	>
		{#each toasts as toast, index (toast.id)}
			{@const colors = getToastColors(toast.type)}
			{@const icon = getToastIcon(toast.type)}
			<div
				class="toast"
				class:success={toast.type === 'success'}
				class:error={toast.type === 'error'}
				class:warning={toast.type === 'warning'}
				class:persistent={toast.persistent}
				style="
					--toast-accent: {colors.accent};
					--toast-bg: {colors.background};
					--toast-border: {colors.border};
					--toast-index: {index};
					--toast-delay: {index * 100}ms;
				"
				on:click={() => handleToastClick(toast)}
				role="alert"
				aria-live="polite"
			>
				<div class="toast-content">
					{#if icon}
						<div class="toast-icon" style="color: {colors.accent}">
							{@html icon}
						</div>
					{/if}
					
					<div class="toast-text">
						<h4 class="toast-title">{toast.title}</h4>
						{#if toast.message}
							<p class="toast-message">{toast.message}</p>
						{/if}
					</div>
					
					<button
						class="toast-dismiss"
						on:click|stopPropagation={() => removeToast(toast.id)}
						aria-label="Dismiss notification"
						title="Dismiss"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
				
				{#if !toast.persistent && toast.duration}
					<div class="toast-progress">
						<div 
							class="progress-bar"
							style="animation-duration: {toast.duration}ms"
						></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: 20px;
		right: 20px;
		z-index: 2000;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 400px;
		pointer-events: none;
		opacity: var(--container-opacity);
		transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.toast {
		background: var(--bg-color);
		backdrop-filter: blur(20px);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		box-shadow: 0 8px 32px var(--shadow-color);
		pointer-events: auto;
		cursor: default;
		position: relative;
		overflow: hidden;
		transform: translateX(100%);
		animation: slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
		animation-delay: var(--toast-delay);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.toast:hover {
		transform: translateY(-2px) scale(1.02);
		box-shadow: 0 12px 40px var(--shadow-color);
	}
	
	.toast.persistent {
		cursor: pointer;
	}
	
	.toast.persistent:hover {
		background: color-mix(in srgb, var(--bg-color) 80%, var(--toast-accent) 10%);
	}
	
	/* Toast type-specific styling */
	.toast.success {
		border-left: 4px solid var(--toast-accent);
		background: linear-gradient(135deg, var(--bg-color) 0%, var(--toast-bg) 100%);
	}
	
	.toast.error {
		border-left: 4px solid var(--toast-accent);
		background: linear-gradient(135deg, var(--bg-color) 0%, var(--toast-bg) 100%);
	}
	
	.toast.warning {
		border-left: 4px solid var(--toast-accent);
		background: linear-gradient(135deg, var(--bg-color) 0%, var(--toast-bg) 100%);
	}
	
	.toast-content {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px;
		position: relative;
	}
	
	.toast-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		margin-top: 2px;
		animation: iconPulse 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
		animation-delay: calc(var(--toast-delay) + 200ms);
	}
	
	.toast-text {
		flex: 1;
		min-width: 0;
	}
	
	.toast-title {
		margin: 0 0 4px 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-color);
		line-height: 1.3;
		word-break: break-word;
	}
	
	.toast-message {
		margin: 0;
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.4;
		word-break: break-word;
	}
	
	.toast-dismiss {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		margin-top: -2px;
	}
	
	.toast-dismiss:hover {
		color: var(--text-color);
		background: var(--toast-bg);
	}
	
	.toast-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: rgba(255, 255, 255, 0.1);
		overflow: hidden;
	}
	
	.progress-bar {
		height: 100%;
		background: var(--toast-accent);
		width: 100%;
		transform: translateX(-100%);
		animation: progressBar linear both;
	}
	
	/* Animations */
	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	
	@keyframes iconPulse {
		0% {
			transform: scale(0.8);
			opacity: 0;
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
	
	@keyframes progressBar {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(0);
		}
	}
	
	/* Exit animation for dismissed toasts */
	.toast.removing {
		animation: slideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;
	}
	
	@keyframes slideOut {
		from {
			transform: translateX(0);
			opacity: 1;
			max-height: 200px;
			margin-bottom: 12px;
		}
		to {
			transform: translateX(100%);
			opacity: 0;
			max-height: 0;
			margin-bottom: 0;
			padding-top: 0;
			padding-bottom: 0;
		}
	}
	
	/* Responsive design */
	@media (max-width: 768px) {
		.toast-container {
			top: 10px;
			right: 10px;
			left: 10px;
			max-width: none;
		}
		
		.toast-content {
			padding: 14px;
			gap: 10px;
		}
		
		.toast-title {
			font-size: 13px;
		}
		
		.toast-message {
			font-size: 12px;
		}
		
		.toast-icon {
			width: 20px;
			height: 20px;
		}
		
		.toast-dismiss {
			width: 24px;
			height: 24px;
		}
	}
	
	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: fadeIn 0.3s ease both;
		}
		
		.toast-icon {
			animation: none;
		}
		
		.toast:hover {
			transform: none;
		}
		
		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}
	}
	
	/* High contrast mode */
	@media (prefers-contrast: high) {
		.toast {
			border-width: 2px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		}
		
		.toast-title {
			font-weight: 700;
		}
		
		.toast-dismiss:hover {
			background: var(--toast-accent);
			color: white;
		}
	}
</style>
