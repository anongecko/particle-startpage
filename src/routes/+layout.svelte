<script lang="ts">
	import { setContext, onMount } from 'svelte';
	import { settings } from '$lib/storage';
	import type { AppSettings } from '$lib/storage';
	import type { Writable } from 'svelte/store';
	import type { LayoutData } from './$types';

	import '../app.css';

	export let data: LayoutData;

	// --- Context Setup ---
	setContext<Writable<AppSettings>>('settings', settings);
	setContext('wallpaperPacks', data.wallpaperPacks);

	// --- Store Initialization ---
	// This is the key change. We wait until the component has mounted on the
	// client browser before loading settings from localStorage.
	// This prevents the server/client mismatch (hydration error).
	onMount(() => {
		settings.init();
	});

	$: themeColorStyle = `--theme-color: ${$settings.themeColor}`;
</script>

<div id="app-wrapper" style={themeColorStyle}>
	<slot />
</div>

<style>
	#app-wrapper {
		width: 100%;
		height: 100vh;
		position: relative;
		overflow: hidden;
		background-color: #1a1a1a;
		transition: background-color 0.5s ease;
	}
</style>

