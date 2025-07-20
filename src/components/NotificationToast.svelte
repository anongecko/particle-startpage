<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-svelte';
	
	interface Props {
		message: string;
		type: 'success' | 'error' | 'warning';
		duration?: number;
		show: boolean;
	}
	
	let { message, type, duration = 3000, show }: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let toastElement: HTMLDivElement = $state();
	let timeoutId: NodeJS.Timeout;
	let isVisible = $state(false);
	
	function dismiss() {
		isVisible = false;
		setTimeout(() => {
			dispatch('dismiss');
		}, 300);
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			dismiss();
		}
	}
	
	function handleClickOutside(event: MouseEvent) {
		if (toastElement && !toastElement.contains(event.target as Node)) {
			dismiss();
		}
	}
	
	function handleCloseClick(event: MouseEvent) {
		event.stopPropagation();
		dismiss();
	}
	
	function getIcon() {
		switch (type) {
			case 'success':
				return CheckCircle;
			case 'error':
				return AlertCircle;
			case 'warning':
				return AlertTriangle;
		}
	}
	
	function getIconComponent() {
		const IconComponent = getIcon();
		return IconComponent;
	}
	
	function getAriaRole() {
		return type === 'error' ? 'alert' : 'status';
	}
	
	onMount(() => {
		if (show) {
			isVisible = true;
			
			if (duration > 0) {
				timeoutId = setTimeout(() => {
					dismiss();
				}, duration);
			}
			
			document.addEventListener('keydown', handleKeydown);
			document.addEventListener('click', handleClickOutside);
			
			toastElement?.focus();
		}
		
		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			document.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('click', handleClickOutside);
		};
	});
	
	$effect(() => {
		if (show && !isVisible) {
			isVisible = true;
			if (duration > 0) {
				timeoutId = setTimeout(() => {
					dismiss();
				}, duration);
			}
		} else if (!show && isVisible) {
			isVisible = false;
		}
	});
</script>

{#if show}
	<div
		bind:this={toastElement}
		class="toast-container"
		class:visible={isVisible}
		role={getAriaRole()}
		aria-live={type === 'error' ? 'assertive' : 'polite'}
		aria-atomic="true"
		tabindex="-1"
	>
		<div 
			class="toast toast-{type}" 
			role="button"
			tabindex="0"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
		>
			<div class="toast-content">
				<div class="toast-icon" aria-hidden="true">
					{@const IconComponent = getIconComponent()}
					<IconComponent size={20} />
				</div>
				<span class="toast-message">{message}</span>
			</div>
			<button
				class="toast-close"
				onclick={handleCloseClick}
				aria-label="Close notification"
				type="button"
			>
				<X size={16} />
			</button>
		</div>
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: 20px;
		left: 50%;
		transform: translateX(-50%) translateY(-100%);
		z-index: 10000;
		pointer-events: none;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		outline: none;
	}
	
	.toast-container.visible {
		transform: translateX(-50%) translateY(0);
		pointer-events: auto;
	}
	
	.toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-width: 320px;
		max-width: 480px;
		padding: 12px 16px;
		border-radius: 12px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 14px;
		font-weight: 500;
		gap: 12px;
	}
	
	.toast-success {
		background: rgba(34, 197, 94, 0.9);
		color: white;
		border-color: rgba(34, 197, 94, 0.3);
	}
	
	.toast-error {
		background: rgba(239, 68, 68, 0.9);
		color: white;
		border-color: rgba(239, 68, 68, 0.3);
	}
	
	.toast-warning {
		background: rgba(245, 158, 11, 0.9);
		color: white;
		border-color: rgba(245, 158, 11, 0.3);
	}
	
	.toast-content {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}
	
	.toast-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	
	.toast-message {
		flex: 1;
		word-wrap: break-word;
		line-height: 1.4;
	}
	
	.toast-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: inherit;
		cursor: pointer;
		flex-shrink: 0;
		transition: background-color 0.15s ease;
		outline: none;
	}
	
	.toast-close:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	
	.toast-close:focus-visible {
		background: rgba(255, 255, 255, 0.15);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
	}
	
	.toast-close:active {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(0.95);
	}
	
	@media (max-width: 480px) {
		.toast {
			min-width: calc(100vw - 40px);
			margin: 0 20px;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.toast-container {
			transition: none;
		}
		
		.toast-close:active {
			transform: none;
		}
	}
	
	@media (prefers-color-scheme: dark) {
		.toast {
			box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4), 0 4px 10px rgba(0, 0, 0, 0.2);
		}
	}
</style>
