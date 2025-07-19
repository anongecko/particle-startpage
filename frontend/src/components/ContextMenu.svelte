<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { 
    Shapes, 
    Edit3, 
    Plus, 
    Trash2, 
    MoreHorizontal,
    Sliders,
    RotateCw,
    Zap
  } from 'lucide-svelte';

  export let x: number;
  export let y: number;
  export let category: any;
  export let visible: boolean = false;

  const dispatch = createEventDispatcher();

  let menuElement: HTMLDivElement;
  let customizationOpen = false;
  let tempCustomization = {
    scale: 1.0,
    rotationY: 0,
    glowIntensity: 1.0,
  };

  $: if (category?.objectCustomization) {
    tempCustomization = {
      scale: category.objectCustomization.scale || 1.0,
      rotationY: category.objectCustomization.rotation?.[1] || 0,
      glowIntensity: category.objectCustomization.glowIntensity || 1.0,
    };
  }

  onMount(() => {
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleKeyDown);
  });

  function handleOutsideClick(event: MouseEvent) {
    if (!menuElement?.contains(event.target as Node)) {
      closeMenu();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeMenu();
    }
  }

  function closeMenu() {
    visible = false;
    customizationOpen = false;
    dispatch('close');
  }

  function getMenuPosition() {
    if (!menuElement) return { top: y, left: x };
    
    const rect = menuElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let adjustedX = x;
    let adjustedY = y;
    
    // Adjust horizontal position if menu would go off-screen
    if (x + rect.width > viewportWidth - 20) {
      adjustedX = viewportWidth - rect.width - 20;
    }
    
    // Adjust vertical position if menu would go off-screen
    if (y + rect.height > viewportHeight - 20) {
      adjustedY = viewportHeight - rect.height - 20;
    }
    
    return { top: adjustedY, left: adjustedX };
  }

  function handleChangeObject() {
    dispatch('changeObject', { category });
    closeMenu();
  }

  function handleRenameFolder() {
    dispatch('renameFolder', { category });
    closeMenu();
  }

  function handleAddBookmark() {
    dispatch('addBookmark', { category });
    closeMenu();
  }

  function handleRemoveFolder() {
    dispatch('removeFolder', { category });
    closeMenu();
  }

  function toggleCustomization() {
    customizationOpen = !customizationOpen;
  }

  function handleCustomizationChange() {
    dispatch('updateCustomization', {
      category,
      customization: {
        scale: tempCustomization.scale,
        rotation: [0, tempCustomization.rotationY, 0],
        glowIntensity: tempCustomization.glowIntensity,
      }
    });
  }

  function resetCustomization() {
    tempCustomization = {
      scale: 1.0,
      rotationY: 0,
      glowIntensity: 1.0,
    };
    handleCustomizationChange();
  }
</script>

{#if visible}
  <div
    bind:this={menuElement}
    class="context-menu"
    style="top: {getMenuPosition().top}px; left: {getMenuPosition().left}px;"
    transition:fade={{ duration: 150 }}
    on:click|stopPropagation
  >
    <div class="menu-item" on:click={handleChangeObject}>
      <Shapes size={16} />
      <span>Change Object</span>
    </div>

    <div class="menu-separator"></div>

    <div class="menu-item" on:click={toggleCustomization}>
      <Sliders size={16} />
      <span>Customize Object</span>
      <div class="menu-arrow" class:rotated={customizationOpen}>
        <MoreHorizontal size={12} />
      </div>
    </div>

    {#if customizationOpen}
      <div class="customization-panel" transition:fade={{ duration: 200 }}>
        <div class="slider-group">
          <div class="slider-label">
            <Zap size={12} />
            <span>Scale</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            bind:value={tempCustomization.scale}
            on:input={handleCustomizationChange}
            class="slider"
          />
          <span class="slider-value">{tempCustomization.scale.toFixed(1)}x</span>
        </div>

        <div class="slider-group">
          <div class="slider-label">
            <RotateCw size={12} />
            <span>Rotation</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            step="15"
            bind:value={tempCustomization.rotationY}
            on:input={handleCustomizationChange}
            class="slider"
          />
          <span class="slider-value">{tempCustomization.rotationY}°</span>
        </div>

        <div class="slider-group">
          <div class="slider-label">
            <Zap size={12} />
            <span>Glow</span>
          </div>
          <input
            type="range"
            min="0"
            max="3.0"
            step="0.1"
            bind:value={tempCustomization.glowIntensity}
            on:input={handleCustomizationChange}
            class="slider"
          />
          <span class="slider-value">{tempCustomization.glowIntensity.toFixed(1)}x</span>
        </div>

        <button class="reset-button" on:click={resetCustomization}>
          Reset to Default
        </button>
      </div>
    {/if}

    <div class="menu-separator"></div>

    <div class="menu-item" on:click={handleRenameFolder}>
      <Edit3 size={16} />
      <span>Rename Folder</span>
    </div>

    <div class="menu-item" on:click={handleAddBookmark}>
      <Plus size={16} />
      <span>Add Bookmark</span>
    </div>

    <div class="menu-separator"></div>

    <div class="menu-item danger" on:click={handleRemoveFolder}>
      <Trash2 size={16} />
      <span>Remove Folder</span>
    </div>
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 1000;
    background: rgba(20, 20, 30, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 8px;
    box-shadow: 
      0 10px 40px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.05);
    min-width: 200px;
    max-width: 280px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    font-weight: 500;
    position: relative;
  }

  .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .menu-item.danger {
    color: rgba(255, 100, 100, 0.9);
  }

  .menu-item.danger:hover {
    background: rgba(255, 100, 100, 0.1);
    color: rgb(255, 120, 120);
  }

  .menu-arrow {
    margin-left: auto;
    transition: transform 0.2s ease;
    opacity: 0.6;
  }

  .menu-arrow.rotated {
    transform: rotate(90deg);
  }

  .menu-separator {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 6px 8px;
  }

  .customization-panel {
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    margin: 4px 0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .slider-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .slider-group:last-of-type {
    margin-bottom: 8px;
  }

  .slider-label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 60px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .slider {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    outline: none;
    appearance: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: #61dafb;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 4px rgba(97, 218, 251, 0.2);
  }

  .slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #61dafb;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .slider::-moz-range-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 4px rgba(97, 218, 251, 0.2);
  }

  .slider-value {
    min-width: 35px;
    text-align: right;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .reset-button {
    width: 100%;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reset-button:hover {
    background: rgba(255, 255, 255, 0.15);
    color: white;
  }

  @media (max-width: 768px) {
    .context-menu {
      min-width: 180px;
      max-width: 250px;
    }
    
    .menu-item {
      font-size: 0.8rem;
      padding: 8px 10px;
    }
    
    .customization-panel {
      padding: 10px;
    }
  }
</style>
