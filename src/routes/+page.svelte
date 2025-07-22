<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { AppSettings } from '$lib/storage';

	// Import your feature components. You will need to create these files.
	// I've used the Wallpaper component I provided earlier.
	import Wallpaper from '$lib/components/Wallpaper.svelte';
	// import Particles from '$lib/components/Particles.svelte';
	// import ObjectContainer from '$lib/components/ObjectContainer.svelte';
	// import SearchBar from '$lib/components/SearchBar.svelte';

	const settings = getContext<Writable<AppSettings>>('settings');
</script>

<main>
	<!-- The Wallpaper component will now work correctly -->
	<Wallpaper />

	<!-- 
      Uncomment your other components as you build them.
      They can all use `getContext('settings')` to react to changes.
    -->
	<!-- {#if $settings.showParticles}
		<Particles />
	{/if} -->

	<div class="content-container">
		<!-- <SearchBar /> -->
		
		<!-- {#if $settings.showObjects}
			<ObjectContainer />
		{/if} -->
	</div>
</main>

<style>
	main {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.content-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4rem;
		z-index: 10;
		/* Example of using the theme color */
		color: var(--theme-color);
	}
</style>

