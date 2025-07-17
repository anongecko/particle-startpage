<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	
	export let error: string | Error | null = null;
	export let onRetry: (() => void) | null = null;
	
	const dispatch = createEventDispatcher();
	
	let showTechnicalDetails = false;
	let isRetrying = false;
	let isLogging = false;
	let errorLogged = false;
	let systemInfo: any = {};
	
	const fadeIn = tweened(0, { duration: 400, easing: cubicOut });
	const slideUp = tweened(20, { duration: 500, easing: cubicOut });
	
	interface ErrorCategory {
		type: string;
		title: string;
		message: string;
		suggestions: string[];
		icon: string;
		severity: 'low' | 'medium' | 'high' | 'critical';
	}
	
	function categorizeError(err: string | Error): ErrorCategory {
		const errorText = typeof err === 'string' ? err : err.message || err.toString();
		const errorLower = errorText.toLowerCase();
		
		// Network/API errors
		if (errorLower.includes('network') || errorLower.includes('fetch') || 
			errorLower.includes('connection') || errorLower.includes('timeout') ||
			errorLower.includes('cors') || errorText.includes('Failed to fetch')) {
			return {
				type: 'network',
				title: 'Connection Problem',
				message: 'Unable to connect to the server. Please check your internet connection.',
				suggestions: [
					'Check your internet connection',
					'Try refreshing the page',
					'Check if the server is accessible',
					'Disable VPN or proxy if enabled'
				],
				icon: '🌐',
				severity: 'high'
			};
		}
		
		// Image loading errors
		if (errorLower.includes('image') || errorLower.includes('wallpaper') ||
			errorLower.includes('failed to load') || errorLower.includes('img')) {
			return {
				type: 'image',
				title: 'Image Loading Failed',
				message: 'Some wallpapers or images failed to load properly.',
				suggestions: [
					'Check your internet connection',
					'Try selecting a different wallpaper theme',
					'Clear browser cache and reload',
					'Ensure images exist in the selected theme'
				],
				icon: '🖼️',
				severity: 'medium'
			};
		}
		
		// Storage/permission errors
		if (errorLower.includes('storage') || errorLower.includes('localstorage') ||
			errorLower.includes('permission') || errorLower.includes('quota') ||
			errorLower.includes('indexeddb')) {
			return {
				type: 'storage',
				title: 'Storage Access Problem',
				message: 'Unable to save or access your settings and data.',
				suggestions: [
					'Enable storage permissions for this site',
					'Clear browser data if storage is full',
					'Check if private/incognito mode is blocking storage',
					'Try a different browser'
				],
				icon: '💾',
				severity: 'high'
			};
		}
		
		// Component/React errors
		if (errorLower.includes('component') || errorLower.includes('render') ||
			errorLower.includes('svelte') || errorLower.includes('mount') ||
			errorLower.includes('lifecycle')) {
			return {
				type: 'component',
				title: 'Interface Error',
				message: 'A part of the interface failed to load correctly.',
				suggestions: [
					'Refresh the page to restart the interface',
					'Clear browser cache and reload',
					'Try disabling browser extensions',
					'Update your browser to the latest version'
				],
				icon: '⚙️',
				severity: 'high'
			};
		}
		
		// Performance/memory errors
		if (errorLower.includes('memory') || errorLower.includes('performance') ||
			errorLower.includes('webgl') || errorLower.includes('canvas') ||
			errorLower.includes('gpu')) {
			return {
				type: 'performance',
				title: 'Performance Issue',
				message: 'The page is experiencing performance problems or running out of memory.',
				suggestions: [
					'Close other browser tabs to free memory',
					'Reduce particle count in settings',
					'Disable special effects and animations',
					'Try using Performance mode in settings'
				],
				icon: '⚡',
				severity: 'medium'
			};
		}
		
		// Bookmark/data errors
		if (errorLower.includes('bookmark') || errorLower.includes('sync') ||
			errorLower.includes('import') || errorLower.includes('export')) {
			return {
				type: 'bookmark',
				title: 'Bookmark Error',
				message: 'There was a problem with your bookmarks or data synchronization.',
				suggestions: [
					'Try importing bookmarks again',
					'Check bookmark file format (JSON/HTML)',
					'Manually add bookmarks if import fails',
					'Reset bookmark data in settings'
				],
				icon: '📚',
				severity: 'low'
			};
		}
		
		// Wallpaper/theme errors
		if (errorLower.includes('theme') || errorLower.includes('transition') ||
			errorLower.includes('wallpaper')) {
			return {
				type: 'wallpaper',
				title: 'Wallpaper Error',
				message: 'There was a problem loading or changing wallpapers.',
				suggestions: [
					'Try selecting a different theme',
					'Disable auto-transition temporarily',
					'Check if wallpaper files are accessible',
					'Reset wallpaper settings to default'
				],
				icon: '🖼️',
				severity: 'low'
			};
		}
		
		// Generic/unknown errors
		return {
			type: 'unknown',
			title: 'Unexpected Error',
			message: 'Something went wrong. This might be a temporary issue.',
			suggestions: [
				'Refresh the page to try again',
				'Clear browser cache and reload',
				'Try using a different browser',
				'Check browser console for more details'
			],
			icon: '❗',
			severity: 'medium'
		};
	}
	
	function collectSystemInfo() {
		if (!browser) return {};
		
		try {
			const nav = navigator;
			const screen = window.screen;
			const performance = window.performance;
			
			return {
				// Browser info
				userAgent: nav.userAgent,
				browser: detectBrowser(),
				platform: nav.platform,
				language: nav.language,
				cookieEnabled: nav.cookieEnabled,
				onLine: nav.onLine,
				
				// Screen info
				screenWidth: screen.width,
				screenHeight: screen.height,
				screenColorDepth: screen.colorDepth,
				devicePixelRatio: window.devicePixelRatio || 1,
				
				// Window info
				windowWidth: window.innerWidth,
				windowHeight: window.innerHeight,
				
				// Performance info
				memoryUsage: performance.memory ? {
					used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
					total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
					limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
				} : null,
				
				// Connection info
				connection: (nav as any).connection ? {
					effectiveType: (nav as any).connection.effectiveType,
					downlink: (nav as any).connection.downlink,
					rtt: (nav as any).connection.rtt
				} : null,
				
				// WebGL info
				webglSupport: detectWebGLSupport(),
				
				// Storage info
				storageQuota: getStorageQuota(),
				
				// Timestamp
				timestamp: new Date().toISOString(),
				
				// URL info
				url: window.location.href,
				referrer: document.referrer
			};
		} catch (err) {
			console.warn('Failed to collect system info:', err);
			return { error: 'Failed to collect system info' };
		}
	}
	
	function detectBrowser(): string {
		const ua = navigator.userAgent;
		if (ua.includes('Chrome')) return 'Chrome';
		if (ua.includes('Firefox')) return 'Firefox';
		if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
		if (ua.includes('Edge')) return 'Edge';
		if (ua.includes('Opera')) return 'Opera';
		return 'Unknown';
	}
	
	function detectWebGLSupport(): boolean {
		try {
			const canvas = document.createElement('canvas');
			return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
		} catch {
			return false;
		}
	}
	
	async function getStorageQuota(): Promise<any> {
		try {
			if ('storage' in navigator && 'estimate' in navigator.storage) {
				const estimate = await navigator.storage.estimate();
				return {
					quota: estimate.quota ? Math.round(estimate.quota / 1024 / 1024) : null,
					usage: estimate.usage ? Math.round(estimate.usage / 1024 / 1024) : null
				};
			}
		} catch {
			// Ignore errors
		}
		return null;
	}
	
	async function logError(errorInfo: ErrorCategory, originalError: string | Error) {
		if (isLogging || errorLogged) return;
		
		isLogging = true;
		
		try {
			const errorData = {
				// Error details
				category: errorInfo.type,
				title: errorInfo.title,
				message: errorInfo.message,
				severity: errorInfo.severity,
				originalError: typeof originalError === 'string' ? originalError : {
					name: originalError.name,
					message: originalError.message,
					stack: originalError.stack
				},
				
				// System information
				systemInfo: systemInfo,
				
				// Additional context
				errorId: generateErrorId(),
				sessionId: getSessionId()
			};
			
			// Send to server logging endpoint
			const response = await fetch('/api/errors/log', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(errorData)
			});
			
			if (response.ok) {
				errorLogged = true;
			} else {
				// Fallback: try to log to console in a structured way
				console.error('Error logging failed, fallback log:', errorData);
			}
		} catch (logError) {
			// Last resort: basic console logging
			console.error('Error logging completely failed:', {
				originalError,
				errorInfo,
				systemInfo,
				logError: logError.message
			});
		} finally {
			isLogging = false;
		}
	}
	
	function generateErrorId(): string {
		return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
	
	function getSessionId(): string {
		let sessionId = sessionStorage.getItem('startpage_session_id');
		if (!sessionId) {
			sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			sessionStorage.setItem('startpage_session_id', sessionId);
		}
		return sessionId;
	}
	
	async function handleRetry() {
		if (isRetrying || !onRetry) return;
		
		isRetrying = true;
		try {
			await onRetry();
		} catch (retryError) {
			console.error('Retry failed:', retryError);
		} finally {
			isRetrying = false;
		}
	}
	
	function handleRefresh() {
		if (browser) {
			window.location.reload();
		}
	}
	
	function toggleTechnicalDetails() {
		showTechnicalDetails = !showTechnicalDetails;
	}
	
	$: errorInfo = error ? categorizeError(error) : null;
	$: if (errorInfo && !errorLogged) {
		logError(errorInfo, error!);
	}
	
	onMount(async () => {
		systemInfo = collectSystemInfo();
		fadeIn.set(1);
		slideUp.set(0);
	});
</script>

{#if error && errorInfo}
	<div 
		class="error-boundary" 
		style="opacity: {$fadeIn}"
		role="alert"
		aria-live="polite"
	>
		<div class="error-container" style="transform: translateY({$slideUp}px)">
			<div class="error-header">
				<div class="error-icon severity-{errorInfo.severity}">
					{errorInfo.icon}
				</div>
				<div class="error-title">
					<h1>{errorInfo.title}</h1>
					<div class="error-severity">
						<span class="severity-badge severity-{errorInfo.severity}">
							{errorInfo.severity.toUpperCase()}
						</span>
					</div>
				</div>
			</div>
			
			<div class="error-content">
				<p class="error-message">{errorInfo.message}</p>
				
				<div class="error-suggestions">
					<h3>What you can try:</h3>
					<ul>
						{#each errorInfo.suggestions as suggestion}
							<li>{suggestion}</li>
						{/each}
					</ul>
				</div>
				
				<div class="error-actions">
					{#if onRetry}
						<button 
							class="action-button primary" 
							class:loading={isRetrying}
							on:click={handleRetry}
							disabled={isRetrying}
						>
							{#if isRetrying}
								<span class="spinner"></span>
								Retrying...
							{:else}
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="1,4 1,10 7,10"/>
									<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
								</svg>
								Try Again
							{/if}
						</button>
					{/if}
					
					<button class="action-button secondary" on:click={handleRefresh}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M3 2v6h6"/>
							<path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>
						</svg>
						Refresh Page
					</button>
					
					<button 
						class="action-button tertiary" 
						on:click={toggleTechnicalDetails}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"/>
							<line x1="12" y1="16" x2="12" y2="12"/>
							<line x1="12" y1="8" x2="12.01" y2="8"/>
						</svg>
						{showTechnicalDetails ? 'Hide' : 'Show'} Details
					</button>
				</div>
				
				{#if showTechnicalDetails}
					<div class="technical-details">
						<h4>Technical Information</h4>
						<div class="detail-section">
							<h5>Error Details</h5>
							<div class="detail-item">
								<span class="detail-label">Type:</span>
								<span class="detail-value">{errorInfo.type}</span>
							</div>
							<div class="detail-item">
								<span class="detail-label">Original Error:</span>
								<span class="detail-value">{typeof error === 'string' ? error : error.message}</span>
							</div>
							{#if typeof error !== 'string' && error.stack}
								<div class="detail-item">
									<span class="detail-label">Stack Trace:</span>
									<pre class="detail-stack">{error.stack}</pre>
								</div>
							{/if}
						</div>
						
						<div class="detail-section">
							<h5>System Information</h5>
							<div class="detail-item">
								<span class="detail-label">Browser:</span>
								<span class="detail-value">{systemInfo.browser || 'Unknown'}</span>
							</div>
							<div class="detail-item">
								<span class="detail-label">Platform:</span>
								<span class="detail-value">{systemInfo.platform || 'Unknown'}</span>
							</div>
							<div class="detail-item">
								<span class="detail-label">Screen Resolution:</span>
								<span class="detail-value">{systemInfo.screenWidth}×{systemInfo.screenHeight}</span>
							</div>
							<div class="detail-item">
								<span class="detail-label">Window Size:</span>
								<span class="detail-value">{systemInfo.windowWidth}×{systemInfo.windowHeight}</span>
							</div>
							{#if systemInfo.memoryUsage}
								<div class="detail-item">
									<span class="detail-label">Memory Usage:</span>
									<span class="detail-value">{systemInfo.memoryUsage.used}MB / {systemInfo.memoryUsage.total}MB</span>
								</div>
							{/if}
							<div class="detail-item">
								<span class="detail-label">WebGL Support:</span>
								<span class="detail-value">{systemInfo.webglSupport ? 'Yes' : 'No'}</span>
							</div>
							<div class="detail-item">
								<span class="detail-label">Online:</span>
								<span class="detail-value">{systemInfo.onLine ? 'Yes' : 'No'}</span>
							</div>
						</div>
						
						<div class="logging-status">
							{#if errorLogged}
								<div class="status-message success">
									✅ Error logged successfully for debugging
								</div>
							{:else if isLogging}
								<div class="status-message pending">
									⏳ Logging error details...
								</div>
							{:else}
								<div class="status-message warning">
									⚠️ Error logging failed - check console
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.error-boundary {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: linear-gradient(135deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.95));
		backdrop-filter: blur(20px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		color: white;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	
	.error-container {
		max-width: 600px;
		width: 90vw;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		border-radius: 24px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 32px;
		box-shadow: 0 32px 64px rgba(0, 0, 0, 0.4);
	}
	
	.error-header {
		display: flex;
		align-items: flex-start;
		gap: 20px;
		margin-bottom: 24px;
	}
	
	.error-icon {
		font-size: 48px;
		line-height: 1;
		padding: 16px;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 80px;
		height: 80px;
	}
	
	.error-icon.severity-low {
		background: rgba(255, 193, 7, 0.2);
		border: 1px solid rgba(255, 193, 7, 0.4);
	}
	
	.error-icon.severity-medium {
		background: rgba(255, 152, 0, 0.2);
		border: 1px solid rgba(255, 152, 0, 0.4);
	}
	
	.error-icon.severity-high {
		background: rgba(244, 67, 54, 0.2);
		border: 1px solid rgba(244, 67, 54, 0.4);
	}
	
	.error-icon.severity-critical {
		background: rgba(156, 39, 176, 0.2);
		border: 1px solid rgba(156, 39, 176, 0.4);
	}
	
	.error-title {
		flex: 1;
	}
	
	.error-title h1 {
		margin: 0 0 8px 0;
		font-size: 24px;
		font-weight: 600;
		color: white;
		line-height: 1.2;
	}
	
	.severity-badge {
		display: inline-block;
		padding: 4px 12px;
		border-radius: 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.5px;
		text-transform: uppercase;
	}
	
	.severity-badge.severity-low {
		background: rgba(255, 193, 7, 0.2);
		color: #ffc107;
		border: 1px solid rgba(255, 193, 7, 0.4);
	}
	
	.severity-badge.severity-medium {
		background: rgba(255, 152, 0, 0.2);
		color: #ff9800;
		border: 1px solid rgba(255, 152, 0, 0.4);
	}
	
	.severity-badge.severity-high {
		background: rgba(244, 67, 54, 0.2);
		color: #f44336;
		border: 1px solid rgba(244, 67, 54, 0.4);
	}
	
	.severity-badge.severity-critical {
		background: rgba(156, 39, 176, 0.2);
		color: #9c27b0;
		border: 1px solid rgba(156, 39, 176, 0.4);
	}
	
	.error-content {
		line-height: 1.6;
	}
	
	.error-message {
		font-size: 16px;
		color: rgba(255, 255, 255, 0.9);
		margin: 0 0 24px 0;
	}
	
	.error-suggestions {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 20px;
		margin-bottom: 24px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.error-suggestions h3 {
		margin: 0 0 12px 0;
		font-size: 16px;
		font-weight: 600;
		color: white;
	}
	
	.error-suggestions ul {
		margin: 0;
		padding-left: 20px;
		list-style: none;
	}
	
	.error-suggestions li {
		margin-bottom: 8px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.8);
		position: relative;
		padding-left: 20px;
	}
	
	.error-suggestions li::before {
		content: '→';
		position: absolute;
		left: 0;
		color: #4caf50;
		font-weight: bold;
	}
	
	.error-actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 24px;
	}
	
	.action-button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border: none;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
		text-decoration: none;
		white-space: nowrap;
	}
	
	.action-button.primary {
		background: #4caf50;
		color: white;
	}
	
	.action-button.primary:hover:not(:disabled) {
		background: #45a049;
		transform: translateY(-1px);
	}
	
	.action-button.secondary {
		background: rgba(255, 255, 255, 0.1);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	.action-button.secondary:hover {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.4);
	}
	
	.action-button.tertiary {
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	
	.action-button.tertiary:hover {
		color: white;
		border-color: rgba(255, 255, 255, 0.4);
	}
	
	.action-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none !important;
	}
	
	.action-button.loading {
		pointer-events: none;
	}
	
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	.technical-details {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 12px;
		padding: 20px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
	}
	
	.technical-details h4 {
		margin: 0 0 16px 0;
		font-size: 16px;
		font-weight: 600;
		color: white;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	
	.detail-section {
		margin-bottom: 20px;
	}
	
	.detail-section h5 {
		margin: 0 0 12px 0;
		font-size: 14px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.8);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	
	.detail-item {
		display: flex;
		margin-bottom: 8px;
		font-size: 12px;
	}
	
	.detail-label {
		min-width: 120px;
		color: rgba(255, 255, 255, 0.6);
	}
	
	.detail-value {
		color: rgba(255, 255, 255, 0.9);
		flex: 1;
		word-break: break-word;
	}
	
	.detail-stack {
		background: rgba(0, 0, 0, 0.5);
		padding: 12px;
		border-radius: 8px;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.8);
		overflow-x: auto;
		white-space: pre-wrap;
		margin: 8px 0;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.logging-status {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.status-message {
		font-size: 12px;
		padding: 8px 12px;
		border-radius: 8px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	
	.status-message.success {
		background: rgba(76, 175, 80, 0.2);
		color: #4caf50;
		border: 1px solid rgba(76, 175, 80, 0.3);
	}
	
	.status-message.pending {
		background: rgba(255, 193, 7, 0.2);
		color: #ffc107;
		border: 1px solid rgba(255, 193, 7, 0.3);
	}
	
	.status-message.warning {
		background: rgba(255, 152, 0, 0.2);
		color: #ff9800;
		border: 1px solid rgba(255, 152, 0, 0.3);
	}
	
	@media (max-width: 768px) {
		.error-container {
			width: 95vw;
			padding: 24px;
		}
		
		.error-header {
			flex-direction: column;
			text-align: center;
			gap: 16px;
		}
		
		.error-icon {
			margin: 0 auto;
		}
		
		.error-title h1 {
			font-size: 20px;
		}
		
		.error-actions {
			flex-direction: column;
		}
		
		.action-button {
			justify-content: center;
		}
		
		.detail-item {
			flex-direction: column;
			gap: 4px;
		}
		
		.detail-label {
			min-width: auto;
			font-weight: 600;
		}
	}
</style>
