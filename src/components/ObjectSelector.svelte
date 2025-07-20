<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { Object3D } from '.';
	import { getAllObjects } from '$lib/objects';
	import type { Object3DConfig } from '$lib/objects3d';
	
	interface Props {
		selectedObject?: Object3DConfig;
		category: string;
		show: boolean;
	}
	
	let { selectedObject, category, show }: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	let objects: Object3DConfig[] = $state([]);
	let currentSelection: Object3DConfig | null = $state(selectedObject || null);
	let previewObject: Object3DConfig | null = $state(null);
	let focusedIndex = $state(0);
	let gridElement: HTMLDivElement = $state();
	let confirmButton: HTMLButtonElement = $state();
	
	const GRID_COLS = 4;
	
	function loadObjects() {
		objects = getAllObjects();
		if (!currentSelection && objects.length > 0) {
			currentSelection = objects[0];
			previewObject = objects[0];
		}
	}
	
	function handleObjectSelect(object: Object3DConfig, index: number) {
		currentSelection = object;
		previewObject = object;
		focusedIndex = index;
		dispatch('preview', object);
	}
	
	function handleKeyNavigation(event: KeyboardEvent) {
		if (!show) return;
		
		const totalObjects = objects.length;
		if (totalObjects === 0) return;
		
		let newIndex = focusedIndex;
		
		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				newIndex = (focusedIndex + 1) % totalObjects;
				break;
			case 'ArrowLeft':
				event.preventDefault();
				newIndex = (focusedIndex - 1 + totalObjects) % totalObjects;
				break;
			case 'ArrowDown':
				event.preventDefault();
				newIndex = Math.min(focusedIndex + GRID_COLS, totalObjects - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				newIndex = Math.max(focusedIndex - GRID_COLS, 0);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (objects[focusedIndex]) {
					handleObjectSelect(objects[focusedIndex], focusedIndex);
				}
				return;
			case 'Tab':
				if (event.shiftKey) {
					return;
				}
				if (focusedIndex === totalObjects - 1) {
					event.preventDefault();
					confirmButton?.focus();
				}
				return;
			case 'Escape':
				event.preventDefault();
				dispatch('cancel');
				return;
			default:
				return;
		}
		
		if (newIndex !== focusedIndex) {
			focusedIndex = newIndex;
			handleObjectSelect(objects[newIndex], newIndex);
			
			const objectElement = gridElement?.children[newIndex] as HTMLElement;
			objectElement?.focus();
		}
	}
	
	function handleConfirm() {
		if (currentSelection) {
			dispatch('confirm', currentSelection);
		}
	}
	
	function handleCancel() {
		dispatch('cancel');
	}
	
	function handleConfirmKeydown(event: KeyboardEvent) {
		if (event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			const firstObject = gridElement?.children[0] as HTMLElement;
			firstObject?.focus();
			focusedIndex = 0;
		}
	}
	
	onMount(() => {
		loadObjects();
		
		if (show) {
			document.addEventListener('keydown', handleKeyNavigation);
		}
		
		return () => {
			document.removeEventListener('keydown', handleKeyNavigation);
		};
	});
	
	$effect(() => {
		if (show) {
			document.addEventListener('keydown', handleKeyNavigation);
			setTimeout(() => {
				const firstObject = gridElement?.children[0] as HTMLElement;
				firstObject?.focus();
			}, 100);
		} else {
			document.removeEventListener('keydown', handleKeyNavigation);
		}
	});
</script>

{#if show}
	<div class="object-selector-overlay" role="dialog" aria-modal="true" aria-labelledby="selector-title">
		<div class="object-selector">
			<div class="selector-header">
				<h2 id="selector-title">Select 3D Object for {category}</h2>
				<p class="selector-subtitle">Choose an object to represent this bookmark category</p>
			</div>
			
			<div class="selector-content">
				<div class="objects-grid-container">
					<div
						bind:this={gridElement}
						class="objects-grid"
						role="grid"
						aria-label="3D object selection grid"
						aria-rowcount={Math.ceil(objects.length / GRID_COLS)}
						aria-colcount={GRID_COLS}
					>
						{#each objects as object, index}
							{@const isSelected = currentSelection?.id === object.id}
							{@const isFocused = focusedIndex === index}
							{@const row = Math.floor(index / GRID_COLS) + 1}
							{@const col = (index % GRID_COLS) + 1}
							
							<button
								class="object-item"
								class:selected={isSelected}
								class:focused={isFocused}
								role="gridcell"
								aria-rowindex={row}
								aria-colindex={col}
								aria-selected={isSelected}
								tabindex={isFocused ? 0 : -1}
								onclick={() => handleObjectSelect(object, index)}
								onfocus={() => { focusedIndex = index; }}
								aria-label={`Select ${object.name} for ${category} category`}
								type="button"
							>
								<div class="object-preview" aria-hidden="true">
									<Object3D config={object} size={60} interactive={false} />
								</div>
								<span class="object-name">{object.name}</span>
							</button>
						{/each}
					</div>
				</div>
				
				<div class="preview-container" aria-live="polite" aria-label="Selected object preview">
					{#if previewObject}
						<div class="preview-header">
							<h3>Preview: {previewObject.name}</h3>
						</div>
						<div class="preview-display" aria-hidden="true">
							<Object3D config={previewObject} size={120} interactive={true} />
						</div>
					{/if}
				</div>
			</div>
			
			<div class="selector-actions">
				<button
					type="button"
					class="cancel-button"
					onclick={handleCancel}
					aria-label="Cancel object selection"
				>
					Cancel
				</button>
				<button
					bind:this={confirmButton}
					type="button"
					class="confirm-button"
					onclick={handleConfirm}
					onkeydown={handleConfirmKeydown}
					disabled={!currentSelection}
					aria-label={currentSelection ? `Confirm selection of ${currentSelection.name}` : 'No object selected'}
				>
					Confirm Selection
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.object-selector-overlay {
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
	
	.object-selector {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 16px;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
		width: 100%;
		max-width: 800px;
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
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 8px;
		color: #1f2937;
	}
	
	.selector-subtitle {
		font-size: 14px;
		color: #6b7280;
		margin: 0;
	}
	
	.selector-content {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	
	.objects-grid-container {
		flex: 1;
		padding: 20px;
		overflow-y: auto;
	}
	
	.objects-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
		outline: none;
	}
	
	.object-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 16px 12px;
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		background: rgba(255, 255, 255, 0.5);
		outline: none;
		position: relative;
		width: 100%;
		font: inherit;
	}
	
	.object-item:hover {
		background: rgba(59, 130, 246, 0.1);
		border-color: rgba(59, 130, 246, 0.3);
		transform: translateY(-2px);
	}
	
	.object-item.focused {
		border-color: rgba(59, 130, 246, 0.6);
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}
	
	.object-item.selected {
		background: rgba(59, 130, 246, 0.15);
		border-color: rgba(59, 130, 246, 0.8);
	}
	
	.object-item.selected.focused {
		border-color: rgba(59, 130, 246, 1);
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
	}
	
	.object-preview {
		margin-bottom: 8px;
		pointer-events: none;
	}
	
	.object-name {
		font-size: 12px;
		font-weight: 500;
		color: #374151;
		text-align: center;
		line-height: 1.3;
	}
	
	.preview-container {
		width: 200px;
		padding: 20px;
		border-left: 1px solid rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		background: rgba(248, 250, 252, 0.8);
	}
	
	.preview-header h3 {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 16px;
		color: #1f2937;
		text-align: center;
	}
	
	.preview-display {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 150px;
	}
	
	.selector-actions {
		padding: 20px 24px;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		background: rgba(249, 250, 251, 0.8);
	}
	
	.cancel-button,
	.confirm-button {
		padding: 10px 20px;
		border-radius: 8px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		outline: none;
		border: none;
	}
	
	.cancel-button {
		background: rgba(107, 114, 128, 0.1);
		color: #374151;
	}
	
	.cancel-button:hover {
		background: rgba(107, 114, 128, 0.2);
	}
	
	.cancel-button:focus-visible {
		box-shadow: 0 0 0 2px rgba(107, 114, 128, 0.3);
	}
	
	.confirm-button {
		background: #3b82f6;
		color: white;
	}
	
	.confirm-button:hover:not(:disabled) {
		background: #2563eb;
	}
	
	.confirm-button:focus-visible {
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
	}
	
	.confirm-button:disabled {
		background: #d1d5db;
		color: #9ca3af;
		cursor: not-allowed;
	}
	
	@media (max-width: 768px) {
		.object-selector {
			max-width: 95vw;
		}
		
		.selector-content {
			flex-direction: column;
		}
		
		.objects-grid {
			grid-template-columns: repeat(3, 1fr);
		}
		
		.preview-container {
			width: 100%;
			border-left: none;
			border-top: 1px solid rgba(0, 0, 0, 0.1);
		}
	}
	
	@media (prefers-reduced-motion: reduce) {
		.object-item {
			transition: none;
		}
		
		.object-item:hover {
			transform: none;
		}
	}
</style>
