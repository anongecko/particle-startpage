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
	let progress = $state(100);
	let progressInterval: NodeJS.Timeout;
	
	const iconMap = {
		success: CheckCircle,
		error: AlertCircle,
		warning: AlertTriangle
	};
	
	function dismiss() {
		isVisible = false;
		progress = 100;
		if (timeoutId) clearTimeout(timeoutId);
		if (progressInterval) clearInterval(progressInterval);
		setTimeout(() => dispatch('dismiss'), 250);
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			dismiss();
		}
	}
	
	function startProgressBar() {
		if (duration <= 0) return;
		
		progress = 100;
		const intervalDuration = 16;
		const steps = duration / intervalDuration;
		const decrement = 100 / steps;
		
		progressInterval = setInterval(() => {
			progress -= decrement;
			if (progress <= 0) {
				progress = 0;
				clearInterval(progressInterval);
			}
		}, intervalDuration);
	}
	
	onMount(() => {
		document.addEventListener('keydown', handleKeydown);
		
		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			if (progressInterval) clearInterval(progressInterval);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
	
	$effect(() => {
		if (show && !isVisible) {
			isVisible = true;
			toastElement?.focus();
			
			if (duration > 0) {
				startProgressBar();
				timeoutId = setTimeout(dismiss, duration);
			}
		} else if (!show && isVisible) {
			dismiss();
		}
	});
</script>

{#if show}
	<div
		bind:this={toastElement}
		class="toast-container"
		class:visible={isVisible}
		role={type === 'error' ? 'alert' : 'status'}
		aria-live={type === 'error' ? 'assertive' : 'polite'}
		aria-atomic="true"
		tabindex="-1"
	>
		<div class="toast toast-{type}">
			<div class="toast-content">
				<div class="toast-icon" aria-hidden="true">
					{#if type === 'success'}
						<CheckCircle size={20} />
					{:else if type === 'error'}
						<AlertCircle size={20} />
					{:else if type === 'warning'}
						<AlertTriangle size={20} />
					{/if}
				</div>
				<span class="toast-message">{message}</span>
			</div>
			<button
				class="toast-close"
				onclick={dismiss}
				aria-label="Dismiss notification"
				type="button"
			>
				<X size={16} />
			</button>
			{#if duration > 0}
				<div class="progress-bar" style="width: {progress}%"></div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: 24px;
		left: 50%;
		transform: translateX(-50%) translateY(-120%);
		z-index: 10000;
		pointer-events: none;
		transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
		outline: none;
	}
	
	.toast-container.visible {
		transform: translateX(-50%) translateY(0);
		pointer-events: auto;
	}
	
	.toast {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-width: 340px;
		max-width: 500px;
		padding: 16px 20px;
		border-radius: 16px;
		backdrop-filter: blur(12px) saturate(1.8);
		border: 1px solid rgba(255, 255, 255, 0.15);
		font-size: 14px;
		font-weight: 500;
		gap: 16px;
		overflow: hidden;
		box-shadow: 
			0 20px 40px rgba(0, 0, 0, 0.15),
			0 8px 16px rgba(0, 0, 0, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
		animation: slideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	
	.toast-success {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(22, 163, 74, 0.95) 100%);
		color: white;
		border-color: rgba(34, 197, 94, 0.3);
	}
	
	.toast-error {
		background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%);
		color: white;
		border-color: rgba(239, 68, 68, 0.3);
	}
	
	.toast-warning {
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.95) 0%, rgba(217, 119, 6, 0.95) 100%);
		color: white;
		border-color: rgba(245, 158, 11, 0.3);
	}
	
	.toast-content {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
	}
	
	.toast-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		opacity: 0.9;
	}
	
	.toast-message {
		flex: 1;
		word-wrap: break-word;
		line-height: 1.4;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}
	
	.toast-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: inherit;
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		outline: none;
		opacity: 0.8;
	}
	
	.toast-close:hover {
		background: rgba(255, 255, 255, 0.15);
		opacity: 1;
		transform: scale(1.05);
	}
	
	.toast-close:focus-visible {
		background: rgba(255, 255, 255, 0.2);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.4);
		opacity: 1;
	}
	
	.toast-close:active {
		background: rgba(255, 255, 255, 0.25);
		transform: scale(0.95);
	}
	
	.progress-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 3px;
		background: rgba(255, 255, 255, 0.4);
		transition: width 0.1s linear;
		border-radius: 0 0 16px 16px;
	}
	
	@keyframes slideIn {
		0% {
			transform: translateY(-20px);
			opacity: 0;
			scale: 0.95;
		}
		100% {
			transform: translateY(0);
			opacity: 1;
			scale: 1;
		}
	}
	
	@media (max-width: 520px) {
		.toast {
			min-width: calc(100vw - 48px);
			margin: 0 24px;
			padding: 14px 18px;
		}
		
		.toast-content {
			gap: 10px;
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.toast-container {
			transition: transform 0.2s ease;
		}
		
		.toast {
			animation: none;
		}
		
		.toast-close:hover,
		.toast-close:active {
			transform: none;
		}
		
		.progress-bar {
			transition: none;
		}
	}
	
	@media (prefers-color-scheme: dark) {
		.toast {
			box-shadow: 
				0 20px 40px rgba(0, 0, 0, 0.3),
				0 8px 16px rgba(0, 0, 0, 0.2),
				inset 0 1px 0 rgba(255, 255, 255, 0.15);
		}
	}
</style>
