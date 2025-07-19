<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { get } from 'svelte/store';
  import { X, Check } from 'lucide-svelte';
  import { wallpaper } from '../stores/wallpaper.js';
  import { extractColors } from '../lib/color.js';

  export let visible: boolean = false;
  export let currentObjectId: string = '';
  export let category: any;

  const dispatch = createEventDispatcher();

  let modalElement: HTMLDivElement;
  let previewElement: HTMLDivElement;
  let selectedObjectId: string = currentObjectId;
  let currentColors: string[] = [];
  let intersectionObserver: IntersectionObserver;
  let visiblePreviews = new Set<string>();

  const objectCategories = [
    {
      name: 'Learning',
      id: 'learning',
      objects: [
        { id: 'learning/graduation-cap', name: 'Graduation Cap' },
        { id: 'learning/textbooks', name: 'Stack of Textbooks' },
        { id: 'learning/microscope', name: 'Microscope' },
        { id: 'learning/brain', name: 'Brain Model' },
        { id: 'learning/owl', name: 'Owl Figure' },
      ]
    },
    {
      name: 'Development',
      id: 'development',
      objects: [
        { id: 'development/computer', name: 'Desktop Computer' },
        { id: 'development/git-tree', name: 'Git Branch Tree' },
        { id: 'development/docker', name: 'Docker Container' },
        { id: 'development/coffee', name: 'Coffee Mug' },
        { id: 'development/server', name: 'Server Rack' },
      ]
    },
    {
      name: 'Shopping',
      id: 'shopping',
      objects: [
        { id: 'shopping/bag', name: 'Shopping Bag' },
        { id: 'shopping/gift-box', name: 'Gift Box' },
        { id: 'shopping/handbag', name: 'Handbag' },
      ]
    },
    {
      name: 'Finance',
      id: 'finance',
      objects: [
        { id: 'finance/piggy-bank', name: 'Piggy Bank' },
        { id: 'finance/cash-stack', name: 'Stack of Cash' },
        { id: 'finance/safe', name: 'Safe/Vault' },
        { id: 'finance/gold-bars', name: 'Gold Bar Pyramid' },
        { id: 'finance/atm', name: 'ATM Machine' },
      ]
    },
    {
      name: 'Work',
      id: 'work',
      objects: [
        { id: 'work/briefcase', name: 'Briefcase' },
        { id: 'work/desk-lamp', name: 'Desk Lamp' },
        { id: 'work/time-clock', name: 'Time Clock' },
        { id: 'work/printer', name: 'Printer/Copier' },
        { id: 'work/fax', name: 'Fax Machine' },
      ]
    },
    {
      name: 'Social Media',
      id: 'social',
      objects: [
        { id: 'social/globe', name: 'Globe/Earth' },
        { id: 'social/megaphone', name: 'Megaphone' },
        { id: 'social/heart', name: 'Heart Symbol' },
        { id: 'social/bell', name: 'Notification Bell' },
      ]
    },
    {
      name: 'Entertainment',
      id: 'entertainment',
      objects: [
        { id: 'entertainment/popcorn', name: 'Popcorn Bucket' },
        { id: 'entertainment/film-reel', name: 'Film Reel' },
        { id: 'entertainment/camera', name: 'Movie Camera' },
        { id: 'entertainment/controller', name: 'Game Controller' },
        { id: 'entertainment/vr-headset', name: 'VR Headset' },
        { id: 'entertainment/dice', name: '6-Sided Dice' },
      ]
    },
    {
      name: 'Food/Recipes',
      id: 'food',
      objects: [
        { id: 'food/chef-hat', name: 'Chef\'s Hat' },
        { id: 'food/mortar-pestle', name: 'Mortar & Pestle' },
        { id: 'food/dutch-oven', name: 'Dutch Oven' },
        { id: 'food/crockpot', name: 'Crockpot' },
        { id: 'food/mixing-bowl', name: 'Mixing Bowl' },
      ]
    },
    {
      name: 'Tools/Utilities',
      id: 'tools',
      objects: [
        { id: 'tools/toolbox', name: 'Toolbox' },
        { id: 'tools/drill', name: 'Power Drill' },
        { id: 'tools/hard-hat', name: 'Hard Hat' },
        { id: 'tools/tape-measure', name: 'Tape Measure' },
        { id: 'tools/workbench', name: 'Workbench' },
      ]
    },
    {
      name: 'Geometric',
      id: 'geometric',
      objects: [
        { id: 'geometric/diamond', name: 'Diamond' },
        { id: 'geometric/sphere', name: 'Sphere' },
        { id: 'geometric/octahedron', name: 'Octahedron' },
        { id: 'geometric/hex-prism', name: 'Hexagonal Prism' },
        { id: 'geometric/truncated-cube', name: 'Truncated Cube' },
        { id: 'geometric/stellated', name: 'Stellated Polyhedron' },
        { id: 'geometric/pent-prism', name: 'Pentagonal Prism' },
        { id: 'geometric/cone', name: 'Cone' },
        { id: 'geometric/twisted-cube', name: 'Twisted Cube' },
        { id: 'geometric/pent-pyramid', name: 'Pentagonal Pyramid' },
      ]
    },
    {
      name: 'Miscellaneous',
      id: 'misc',
      objects: [
        { id: 'misc/skull', name: 'Human Skull' },
        { id: 'misc/pirate-ship', name: 'Pirate Ship' },
        { id: 'misc/magic-8-ball', name: 'Magic 8 Ball' },
        { id: 'misc/treasure-chest', name: 'Treasure Chest' },
        { id: 'misc/hourglass', name: 'Hourglass' },
        { id: 'misc/anchor', name: 'Anchor' },
        { id: 'misc/filing-drawer', name: 'Filing Drawer' },
        { id: 'misc/compass', name: 'Compass' },
        { id: 'misc/windmill', name: 'Windmill' },
        { id: 'misc/castle', name: 'Castle' },
        { id: 'misc/binoculars', name: 'Binoculars' },
        { id: 'misc/tent', name: 'Tent' },
        { id: 'misc/backpack', name: 'Backpack' },
        { id: 'misc/vintage-camera', name: 'Vintage Camera' },
        { id: 'misc/chess-piece', name: 'Chess Piece' },
        { id: 'misc/wind-chimes', name: 'Wind Chimes' },
        { id: 'misc/skull-crossbones', name: 'Skull & Crossbones' },
        { id: 'misc/baby-dragon', name: 'Baby Dragon' },
        { id: 'misc/baby-penguin', name: 'Baby Penguin' },
        { id: 'misc/robot', name: 'Robot' },
        { id: 'misc/acorn', name: 'Acorn' },
        { id: 'misc/tree', name: 'Tree' },
        { id: 'misc/pinecone', name: 'Pinecone' },
        { id: 'misc/bridge', name: 'Bridge' },
        { id: 'misc/telescope', name: 'Telescope' },
        { id: 'misc/lantern', name: 'Lantern' },
      ]
    },
  ];

  $: if (visible) {
    updateColors();
    selectedObjectId = currentObjectId;
    setupIntersectionObserver();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyDown);
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }
  });

  function setupIntersectionObserver() {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const objectId = entry.target.getAttribute('data-object-id');
          if (objectId) {
            if (entry.isIntersecting) {
              visiblePreviews.add(objectId);
            } else {
              visiblePreviews.delete(objectId);
            }
            visiblePreviews = new Set(visiblePreviews); // Trigger reactivity
          }
        });
      },
      {
        root: null,
        rootMargin: '50px',
        threshold: 0.1
      }
    );
  }

  async function updateColors() {
    try {
      const wallpaperData = get(wallpaper);
      if (wallpaperData.url) {
        currentColors = await extractColors(wallpaperData.url);
      }
    } catch (error) {
      console.warn('Failed to extract colors:', error);
      currentColors = ['#61dafb', '#ff6b6b', '#4ecdc4'];
    }
  }

  function handleOutsideClick(event: MouseEvent) {
    if (modalElement && !modalElement.contains(event.target as Node)) {
      closeModal();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  function closeModal() {
    visible = false;
    dispatch('close');
  }

  function selectObject(objectId: string) {
    selectedObjectId = objectId;
  }

  function confirmSelection() {
    dispatch('select', {
      category,
      objectId: selectedObjectId
    });
    closeModal();
  }

  function getObjectPreviewStyle(objectId: string) {
    const baseColor = currentColors[0] || '#61dafb';
    const isSelected = objectId === selectedObjectId;
    
    return `
      background: linear-gradient(135deg, ${baseColor}80, ${baseColor}40);
      border: 2px solid ${isSelected ? baseColor : 'transparent'};
      transform: ${isSelected ? 'scale(1.05)' : 'scale(1)'};
    `;
  }

  function getObjectName(objectId: string): string {
    for (const category of objectCategories) {
      const obj = category.objects.find(o => o.id === objectId);
      if (obj) return obj.name;
    }
    return 'Unknown Object';
  }
</script>

{#if visible}
  <div 
    class="modal-overlay" 
    transition:fade={{ duration: 200 }}
    on:click={handleOutsideClick}
  >
    <div 
      bind:this={modalElement}
      class="modal-content"
      transition:scale={{ duration: 300, start: 0.9 }}
      on:click|stopPropagation
    >
      <div class="modal-header">
        <h2>Select 3D Object</h2>
        <button class="close-button" on:click={closeModal}>
          <X size={20} />
        </button>
      </div>

      <div class="preview-section">
        <div class="preview-container">
          <div 
            bind:this={previewElement}
            class="preview-object"
            style={getObjectPreviewStyle(selectedObjectId)}
          >
            <div class="preview-label">
              {getObjectName(selectedObjectId)}
            </div>
          </div>
        </div>
        <div class="preview-info">
          <p>Selected: <strong>{getObjectName(selectedObjectId)}</strong></p>
          <p>Category: <strong>{category?.name || 'Unknown'}</strong></p>
        </div>
      </div>

      <div class="objects-grid-container">
        {#each objectCategories as category}
          <div class="category-section">
            <h3 class="category-header">{category.name}</h3>
            <div class="objects-grid">
              {#each category.objects as object}
                <div
                  class="object-preview"
                  class:selected={object.id === selectedObjectId}
                  style={getObjectPreviewStyle(object.id)}
                  data-object-id={object.id}
                  on:click={() => selectObject(object.id)}
                  use:intersectionObserver
                >
                  {#if visiblePreviews.has(object.id)}
                    <div class="object-preview-content">
                      <!-- 3D preview would go here - using placeholder for now -->
                      <div class="object-placeholder">
                        {object.name.split(' ').map(word => word[0]).join('').slice(0, 2)}
                      </div>
                    </div>
                  {/if}
                  <div class="object-name">{object.name}</div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="modal-footer">
        <button class="cancel-button" on:click={closeModal}>
          Cancel
        </button>
        <button 
          class="confirm-button" 
          on:click={confirmSelection}
          disabled={!selectedObjectId}
        >
          <Check size={16} />
          Apply Object
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-content {
    background: rgba(20, 20, 30, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 24px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: white;
  }

  .close-button {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.7);
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .preview-section {
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 20px;
    align-items: center;
  }

  .preview-container {
    flex-shrink: 0;
  }

  .preview-object {
    width: 80px;
    height: 80px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .preview-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: white;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .preview-info {
    flex: 1;
  }

  .preview-info p {
    margin: 0 0 8px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.9rem;
  }

  .preview-info strong {
    color: white;
  }

  .objects-grid-container {
    flex: 1;
    overflow-y: auto;
    padding: 0 24px;
    max-height: 60vh;
  }

  .category-section {
    margin-bottom: 32px;
  }

  .category-header {
    font-size: 1.1rem;
    font-weight: 600;
    color: white;
    margin: 0 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .objects-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }

  .object-preview {
    aspect-ratio: 1;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    overflow: hidden;
    position: relative;
  }

  .object-preview:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .object-preview.selected {
    transform: scale(1.05);
    box-shadow: 0 0 0 2px rgba(97, 218, 251, 0.6);
  }

  .object-preview-content {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .object-placeholder {
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 600;
    color: white;
  }

  .object-name {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.9);
    text-align: center;
    padding: 6px 4px;
    line-height: 1.2;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .cancel-button, .confirm-button {
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cancel-button {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.8);
  }

  .cancel-button:hover {
    background: rgba(255, 255, 255, 0.15);
    color: white;
  }

  .confirm-button {
    background: #61dafb;
    border: 1px solid #61dafb;
    color: #1a1a1a;
  }

  .confirm-button:hover {
    background: #4ecdc4;
    border-color: #4ecdc4;
  }

  .confirm-button:disabled {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.5);
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .modal-content {
      max-width: 95vw;
      max-height: 95vh;
    }
    
    .objects-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    
    .preview-section {
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
    
    .modal-footer {
      flex-direction: column;
    }
  }

  @media (max-width: 480px) {
    .objects-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
