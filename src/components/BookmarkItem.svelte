<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { ContextMenu } from '.';
	
	interface Props {
		bookmark: {
			name: string;
			url: string;
			icon?: string;
			category: string;
		};
		index: number;
	}
	
	let { bookmark, index }: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let showTooltip = $state(false);
	let showContextMenu = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let buttonElement: HTMLButtonElement;
	
	function handleClick() {
		if (bookmark.url) {
			window.open(bookmark.url, '_blank', 'noopener,noreferrer');
		}
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		} else if (event.key === 'Escape') {
			showContextMenu = false;
			showTooltip = false;
		}
	}
	
	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		contextMenuX = event.clientX;
		contextMenuY = event.clientY;
		showContextMenu = true;
	}
	
	function handleEdit() {
		dispatch('edit', bookmark);
		showContextMenu = false;
	}
	
	function handleDelete() {
		dispatch('delete', bookmark);
		showContextMenu = false;
	}
	
	function closeContextMenu() {
		showContextMenu = false;
	}
	
	function getFaviconUrl(url: string): string {
		try {
			const domain = new URL(url).hostname;
			return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
		} catch {
			return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10c0 5.55 3.84 9.95 9 11 5.16-1.05 9-5.45 9-11V7l-10-5z"/></svg>';
		}
	}
</script>

<div class="bookmark-item">
	<button
		bind:this={buttonElement}
		class="bookmark-button"
		onclick={handleClick}
		onkeydown={handleKeydown}
		oncontextmenu={handleContextMenu}
		onmouseenter={() => showTooltip = true}
		onmouseleave={() => showTooltip = false}
		onfocus={() => showTooltip = true}
		onblur={() => showTooltip = false}
		aria-label={`Open ${bookmark.name}`}
		aria-describedby={showTooltip ? `tooltip-${index}` : undefined}
		type="button"
	>
		<img
			src={getFaviconUrl(bookmark.url)}
			alt=""
			class="bookmark-icon"
			loading="lazy"
			onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2L2 7v10c0 5.55 3.84 9.95 9 11 5.16-1.05 9-5.45 9-11V7l-10-5z\"/></svg>'"
		/>
	</button>
	
	{#if showTooltip}
		<div
			id={`tooltip-${index}`}
			class="tooltip"
			role="tooltip"
			aria-live="polite"
		>
			{bookmark.name}
		</div>
	{/if}
	
	{#if showContextMenu}
		<ContextMenu
			x={contextMenuX}
			y={contextMenuY}
			onclose={closeContextMenu}
			items={[
				{ label: 'Edit', action: handleEdit },
				{ label: 'Delete', action: handleDelete }
			]}
		/>
	{/if}
</div>

<style>
	.bookmark-item {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	
	.bookmark-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		padding: 8px;
		background: transparent;
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		outline: none;
		position: relative;
	}
	
	.bookmark-button:hover {
		transform: scale(1.1);
		border-color: rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
	}
	
	.bookmark-button:focus-visible {
		transform: scale(1.1);
		border-color: rgba(59, 130, 246, 0.8);
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
	}
	
	.bookmark-button:active {
		transform: scale(1.05);
	}
	
	.bookmark-icon {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		object-fit: cover;
		display: block;
	}
	
	.tooltip {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 8px;
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.9);
		color: white;
		font-size: 12px;
		font-weight: 500;
		border-radius: 6px;
		white-space: nowrap;
		z-index: 1000;
		pointer-events: none;
		opacity: 0;
		animation: tooltip-fade-in 0.2s ease-out forwards;
	}
	
	.tooltip::before {
		content: '';
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 4px solid transparent;
		border-bottom-color: rgba(0, 0, 0, 0.9);
	}
	
	@keyframes tooltip-fade-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.bookmark-button {
			transition: none;
		}
		
		.bookmark-button:hover {
			transform: none;
		}
		
		.bookmark-button:focus-visible {
			transform: none;
		}
		
		.bookmark-button:active {
			transform: none;
		}
		
		.tooltip {
			animation: none;
			opacity: 1;
			transform: translateX(-50%);
		}
	}
</style>
