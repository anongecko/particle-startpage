import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface SetupStep {
	id: string;
	title: string;
	subtitle: string;
	description: string;
	icon: string;
	isCompleted: boolean;
	isOptional: boolean;
	estimatedTime: number; // seconds
	prerequisites?: string[];
	data?: any;
}

export interface SetupTheme {
	id: string;
	name: string;
	description: string;
	previewImages: string[];
	category: 'nature' | 'abstract' | 'minimal' | 'space' | 'artistic' | 'tech';
	imageCount: number;
	isRecommended?: boolean;
	size: number; // MB
}

export interface PersonalizationOptions {
	name?: string;
	favoriteColors: string[];
	interests: string[];
	usage: 'personal' | 'work' | 'both';
	experience: 'beginner' | 'intermediate' | 'advanced';
	priorities: Array<'speed' | 'beauty' | 'functionality' | 'customization'>;
}

export interface SetupPreferences {
	enableAnimations: boolean;
	enableParticles: boolean;
	enableAutoWallpaperChange: boolean;
	particleCount: number;
	wallpaperChangeInterval: number;
	performanceMode: 'auto' | 'high' | 'balanced' | 'low';
	colorScheme: 'auto' | 'vibrant' | 'muted' | 'custom';
}

export interface SetupProgress {
	currentStepIndex: number;
	totalSteps: number;
	completedSteps: Set<string>;
	skippedSteps: Set<string>;
	timeStarted: number;
	timeOnCurrentStep: number;
	estimatedTimeRemaining: number;
	canGoBack: boolean;
	canSkipCurrent: boolean;
	canFinish: boolean;
}

export interface DeviceCapabilities {
	performance: 'high' | 'medium' | 'low';
	supportsWebGL: boolean;
	supportsWebP: boolean;
	deviceMemory: number;
	cores: number;
	connectionSpeed: 'fast' | 'medium' | 'slow';
	screenSize: 'small' | 'medium' | 'large';
	pixelRatio: number;
	preferredSettings: SetupPreferences;
}

export interface SetupState {
	isActive: boolean;
	isCompleted: boolean;
	currentStep: SetupStep | null;
	steps: SetupStep[];
	progress: SetupProgress;
	personalization: PersonalizationOptions;
	preferences: SetupPreferences;
	deviceCapabilities: DeviceCapabilities | null;
	selectedThemes: string[];
	bookmarkCategories: Array<{ name: string; icon: string; description?: string }>;
	selectedSearchEngines: string[];
	modifierKey: { keys: string[]; label: string } | null;
	errors: string[];
	isProcessing: boolean;
	previewMode: boolean;
	animations: {
		entrance: boolean;
		stepTransition: boolean;
		completion: boolean;
	};
}

const DEFAULT_THEMES: SetupTheme[] = [
	{
		id: 'nature-landscapes',
		name: 'Nature Landscapes',
		description: 'Breathtaking natural scenery and landscapes',
		previewImages: [
			'/assets/previews/nature-1.jpg',
			'/assets/previews/nature-2.jpg',
			'/assets/previews/nature-3.jpg'
		],
		category: 'nature',
		imageCount: 45,
		isRecommended: true,
		size: 280
	},
	{
		id: 'minimal-geometric',
		name: 'Minimal Geometric',
		description: 'Clean, modern geometric patterns and shapes',
		previewImages: [
			'/assets/previews/minimal-1.jpg',
			'/assets/previews/minimal-2.jpg',
			'/assets/previews/minimal-3.jpg'
		],
		category: 'minimal',
		imageCount: 32,
		isRecommended: true,
		size: 120
	},
	{
		id: 'space-cosmos',
		name: 'Space & Cosmos',
		description: 'Stunning space photography and cosmic scenes',
		previewImages: [
			'/assets/previews/space-1.jpg',
			'/assets/previews/space-2.jpg',
			'/assets/previews/space-3.jpg'
		],
		category: 'space',
		imageCount: 38,
		size: 195
	},
	{
		id: 'abstract-art',
		name: 'Abstract Art',
		description: 'Vibrant abstract art and creative compositions',
		previewImages: [
			'/assets/previews/abstract-1.jpg',
			'/assets/previews/abstract-2.jpg',
			'/assets/previews/abstract-3.jpg'
		],
		category: 'abstract',
		imageCount: 28,
		size: 160
	},
	{
		id: 'tech-cyber',
		name: 'Tech & Cyber',
		description: 'Futuristic technology and cyberpunk aesthetics',
		previewImages: [
			'/assets/previews/tech-1.jpg',
			'/assets/previews/tech-2.jpg',
			'/assets/previews/tech-3.jpg'
		],
		category: 'tech',
		imageCount: 25,
		size: 140
	},
	{
		id: 'artistic-paintings',
		name: 'Artistic Paintings',
		description: 'Classical and modern artistic masterpieces',
		previewImages: [
			'/assets/previews/art-1.jpg',
			'/assets/previews/art-2.jpg',
			'/assets/previews/art-3.jpg'
		],
		category: 'artistic',
		imageCount: 42,
		size: 220
	}
];

const DEFAULT_SETUP_STEPS: SetupStep[] = [
	{
		id: 'welcome',
		title: 'Welcome to Particle Nexus',
		subtitle: "Let's create your perfect start page",
		description: "We'll help you customize your experience in just a few minutes",
		icon: '🚀',
		isCompleted: false,
		isOptional: false,
		estimatedTime: 30
	},
	{
		id: 'personalization',
		title: 'Tell us about yourself',
		subtitle: 'Personalize your experience',
		description: 'Help us understand your preferences for better recommendations',
		icon: '👤',
		isCompleted: false,
		isOptional: true,
		estimatedTime: 60
	},
	{
		id: 'performance',
		title: 'Optimize performance',
		subtitle: 'Detect your device capabilities',
		description: "We'll automatically configure the best settings for your device",
		icon: '⚡',
		isCompleted: false,
		isOptional: false,
		estimatedTime: 45
	},
	{
		id: 'themes',
		title: 'Choose your wallpapers',
		subtitle: 'Select beautiful backgrounds',
		description: 'Pick themes that inspire you - you can always change these later',
		icon: '🎨',
		isCompleted: false,
		isOptional: false,
		estimatedTime: 90,
		prerequisites: ['performance']
	},
	{
		id: 'bookmarks',
		title: 'Organize your bookmarks',
		subtitle: 'Create bookmark categories',
		description: 'Set up categories for your favorite websites and tools',
		icon: '📁',
		isCompleted: false,
		isOptional: true,
		estimatedTime: 75
	},
	{
		id: 'shortcuts',
		title: 'Setup keyboard shortcuts',
		subtitle: 'Choose your modifier key',
		description: 'Configure keyboard shortcuts for lightning-fast navigation',
		icon: '⌨️',
		isCompleted: false,
		isOptional: true,
		estimatedTime: 45
	},
	{
		id: 'search',
		title: 'Configure search',
		subtitle: 'Choose your search engines',
		description: 'Select and order your preferred search engines',
		icon: '🔍',
		isCompleted: false,
		isOptional: true,
		estimatedTime: 30
	},
	{
		id: 'preview',
		title: 'Preview your start page',
		subtitle: 'See everything in action',
		description: 'Take a look at your personalized start page before we finish',
		icon: '👁️',
		isCompleted: false,
		isOptional: false,
		estimatedTime: 60,
		prerequisites: ['themes']
	},
	{
		id: 'complete',
		title: "You're all set!",
		subtitle: 'Welcome to your new start page',
		description: 'Everything is configured and ready to use',
		icon: '🎉',
		isCompleted: false,
		isOptional: false,
		estimatedTime: 15
	}
];

const DEFAULT_PREFERENCES: SetupPreferences = {
	enableAnimations: true,
	enableParticles: true,
	enableAutoWallpaperChange: true,
	particleCount: 75,
	wallpaperChangeInterval: 60000,
	performanceMode: 'auto',
	colorScheme: 'auto'
};

const DEFAULT_PERSONALIZATION: PersonalizationOptions = {
	favoriteColors: [],
	interests: [],
	usage: 'personal',
	experience: 'intermediate',
	priorities: ['beauty', 'functionality']
};

const DEFAULT_STATE: SetupState = {
	isActive: false,
	isCompleted: false,
	currentStep: null,
	steps: DEFAULT_SETUP_STEPS,
	progress: {
		currentStepIndex: 0,
		totalSteps: DEFAULT_SETUP_STEPS.length,
		completedSteps: new Set(),
		skippedSteps: new Set(),
		timeStarted: 0,
		timeOnCurrentStep: 0,
		estimatedTimeRemaining: 0,
		canGoBack: false,
		canSkipCurrent: false,
		canFinish: false
	},
	personalization: DEFAULT_PERSONALIZATION,
	preferences: DEFAULT_PREFERENCES,
	deviceCapabilities: null,
	selectedThemes: [],
	bookmarkCategories: [],
	selectedSearchEngines: ['brave'],
	modifierKey: null,
	errors: [],
	isProcessing: false,
	previewMode: false,
	animations: {
		entrance: false,
		stepTransition: false,
		completion: false
	}
};

class SetupStore {
	private store = writable<SetupState>(DEFAULT_STATE);
	private cacheKey = 'particle-nexus-setup-state';
	private stepTimers: Map<string, NodeJS.Timeout> = new Map();
	private autoSaveTimer: NodeJS.Timeout | null = null;
	private availableThemes: SetupTheme[] = DEFAULT_THEMES;

	subscribe = this.store.subscribe;

	async initialize(): Promise<void> {
		if (!browser) return;

		try {
			// Check if setup was already completed
			const cached = localStorage.getItem(this.cacheKey);
			if (cached) {
				const state = JSON.parse(cached);
				if (state.isCompleted) {
					this.store.update((s) => ({ ...s, isCompleted: true }));
					return;
				}
			}

			// Load available themes
			await this.loadAvailableThemes();

			// Detect device capabilities immediately
			const capabilities = await this.detectDeviceCapabilities();

			this.store.update((state) => ({
				...state,
				deviceCapabilities: capabilities,
				preferences: {
					...state.preferences,
					...capabilities.preferredSettings
				}
			}));
		} catch (error) {
			console.error('Failed to initialize setup:', error);
		}
	}

	async startSetup(): Promise<void> {
		const startTime = Date.now();

		this.store.update((state) => ({
			...state,
			isActive: true,
			isCompleted: false,
			progress: {
				...state.progress,
				timeStarted: startTime,
				timeOnCurrentStep: startTime
			},
			animations: {
				...state.animations,
				entrance: true
			}
		}));

		// Start with first step
		await this.goToStep(0);

		// Trigger entrance animation
		setTimeout(() => {
			this.store.update((state) => ({
				...state,
				animations: {
					...state.animations,
					entrance: false
				}
			}));
		}, 1000);

		this.scheduleAutoSave();
	}

	async goToStep(stepIndex: number): Promise<void> {
		const state = this.getCurrentState();

		if (stepIndex < 0 || stepIndex >= state.steps.length) {
			return;
		}

		const newStep = state.steps[stepIndex];

		// Check prerequisites
		if (newStep.prerequisites) {
			const unmetPrereqs = newStep.prerequisites.filter(
				(prereq) => !state.progress.completedSteps.has(prereq)
			);

			if (unmetPrereqs.length > 0) {
				this.addError(`Please complete ${unmetPrereqs.join(', ')} first`);
				return;
			}
		}

		// Clear step timer for previous step
		if (state.currentStep) {
			const timer = this.stepTimers.get(state.currentStep.id);
			if (timer) {
				clearTimeout(timer);
				this.stepTimers.delete(state.currentStep.id);
			}
		}

		// Animate step transition
		this.store.update((s) => ({
			...s,
			animations: {
				...s.animations,
				stepTransition: true
			}
		}));

		// Update state after brief delay for animation
		setTimeout(() => {
			this.store.update((state) => {
				const estimatedTimeRemaining = this.calculateEstimatedTimeRemaining(stepIndex, state.steps);

				return {
					...state,
					currentStep: newStep,
					progress: {
						...state.progress,
						currentStepIndex: stepIndex,
						timeOnCurrentStep: Date.now(),
						estimatedTimeRemaining,
						canGoBack: stepIndex > 0,
						canSkipCurrent: newStep.isOptional,
						canFinish: this.canFinishSetup(state)
					},
					animations: {
						...state.animations,
						stepTransition: false
					}
				};
			});
		}, 300);

		// Start step-specific logic
		await this.executeStepLogic(newStep.id);

		// Auto-advance timer for informational steps
		if (newStep.id === 'welcome' || newStep.id === 'complete') {
			const timer = setTimeout(() => {
				if (newStep.id === 'welcome') {
					this.nextStep();
				}
			}, 3000);

			this.stepTimers.set(newStep.id, timer);
		}
	}

	async nextStep(): Promise<void> {
		const state = this.getCurrentState();
		const nextIndex = state.progress.currentStepIndex + 1;

		if (nextIndex < state.steps.length) {
			await this.goToStep(nextIndex);
		} else {
			await this.completeSetup();
		}
	}

	async previousStep(): Promise<void> {
		const state = this.getCurrentState();
		const prevIndex = state.progress.currentStepIndex - 1;

		if (prevIndex >= 0) {
			await this.goToStep(prevIndex);
		}
	}

	async skipCurrentStep(): Promise<void> {
		const state = this.getCurrentState();

		if (!state.currentStep?.isOptional) {
			this.addError('This step cannot be skipped');
			return;
		}

		this.store.update((s) => ({
			...s,
			progress: {
				...s.progress,
				skippedSteps: new Set([...s.progress.skippedSteps, s.currentStep!.id])
			}
		}));

		await this.nextStep();
	}

	async completeCurrentStep(): Promise<void> {
		const state = this.getCurrentState();

		if (!state.currentStep) return;

		// Validate step completion
		const isValid = await this.validateStepCompletion(state.currentStep.id);
		if (!isValid) return;

		this.store.update((s) => ({
			...s,
			steps: s.steps.map((step) =>
				step.id === s.currentStep!.id ? { ...step, isCompleted: true } : step
			),
			progress: {
				...s.progress,
				completedSteps: new Set([...s.progress.completedSteps, s.currentStep!.id])
			}
		}));

		await this.nextStep();
	}

	private async executeStepLogic(stepId: string): Promise<void> {
		switch (stepId) {
			case 'performance':
				await this.runPerformanceDetection();
				break;
			case 'themes':
				await this.loadThemeRecommendations();
				break;
			case 'preview':
				await this.generatePreview();
				break;
			default:
				break;
		}
	}

	private async runPerformanceDetection(): Promise<void> {
		this.store.update((state) => ({ ...state, isProcessing: true }));

		try {
			// Comprehensive device capability detection
			const capabilities = await this.detectDeviceCapabilities();

			// Run performance benchmarks
			const benchmarkResults = await this.runPerformanceBenchmarks();

			// Generate optimized preferences
			const optimizedPreferences = this.generateOptimizedPreferences(
				capabilities,
				benchmarkResults
			);

			this.store.update((state) => ({
				...state,
				deviceCapabilities: capabilities,
				preferences: {
					...state.preferences,
					...optimizedPreferences
				},
				isProcessing: false
			}));

			// Auto-complete this step
			setTimeout(() => this.completeCurrentStep(), 1500);
		} catch (error) {
			console.error('Performance detection failed:', error);
			this.addError('Failed to detect device capabilities');
			this.store.update((state) => ({ ...state, isProcessing: false }));
		}
	}

	private async detectDeviceCapabilities(): Promise<DeviceCapabilities> {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		const supportsWebGL = !!gl;

		// Detect WebP support
		const supportsWebP = await new Promise<boolean>((resolve) => {
			const webP = new Image();
			webP.onload = webP.onerror = () => resolve(webP.height === 2);
			webP.src =
				'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
		});

		// Device memory and cores
		const deviceMemory = (navigator as any).deviceMemory || 4;
		const cores = navigator.hardwareConcurrency || 4;

		// Screen size classification
		const width = window.innerWidth;
		const screenSize: 'small' | 'medium' | 'large' =
			width < 768 ? 'small' : width < 1440 ? 'medium' : 'large';

		// Connection speed estimation
		const connection = (navigator as any).connection;
		const connectionSpeed: 'fast' | 'medium' | 'slow' =
			connection?.effectiveType === '4g'
				? 'fast'
				: connection?.effectiveType === '3g'
					? 'medium'
					: 'slow';

		// Performance classification
		let performance: 'high' | 'medium' | 'low' = 'medium';
		if (deviceMemory >= 8 && cores >= 8 && supportsWebGL) {
			performance = 'high';
		} else if (deviceMemory < 4 || cores < 4 || !supportsWebGL) {
			performance = 'low';
		}

		// Generate preferred settings
		const preferredSettings: SetupPreferences = {
			enableAnimations: performance !== 'low',
			enableParticles: supportsWebGL,
			enableAutoWallpaperChange: connectionSpeed !== 'slow',
			particleCount: performance === 'high' ? 100 : performance === 'medium' ? 75 : 50,
			wallpaperChangeInterval: connectionSpeed === 'slow' ? 120000 : 60000,
			performanceMode: performance,
			colorScheme: 'auto'
		};

		return {
			performance,
			supportsWebGL,
			supportsWebP,
			deviceMemory,
			cores,
			connectionSpeed,
			screenSize,
			pixelRatio: window.devicePixelRatio || 1,
			preferredSettings
		};
	}

	private async runPerformanceBenchmarks(): Promise<{ score: number; details: any }> {
		const startTime = performance.now();

		// Simple canvas rendering benchmark
		const canvas = document.createElement('canvas');
		canvas.width = 400;
		canvas.height = 400;
		const ctx = canvas.getContext('2d')!;

		// Draw many shapes to test rendering performance
		for (let i = 0; i < 1000; i++) {
			ctx.fillStyle = `hsl(${i % 360}, 50%, 50%)`;
			ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 10, 10);
		}

		const renderTime = performance.now() - startTime;

		// Memory test
		const memoryTest = () => {
			const start = performance.now();
			const bigArray = new Array(100000).fill(0).map((_, i) => ({ id: i, value: Math.random() }));
			bigArray.sort((a, b) => a.value - b.value);
			return performance.now() - start;
		};

		const memoryTime = memoryTest();

		// Calculate score (lower times = higher score)
		const score = Math.max(0, 100 - renderTime / 10 - memoryTime / 5);

		return {
			score,
			details: {
				renderTime,
				memoryTime,
				timestamp: Date.now()
			}
		};
	}

	private generateOptimizedPreferences(
		capabilities: DeviceCapabilities,
		benchmarks: { score: number }
	): Partial<SetupPreferences> {
		const base = capabilities.preferredSettings;

		// Adjust based on benchmark results
		if (benchmarks.score < 50) {
			return {
				...base,
				enableAnimations: false,
				enableParticles: false,
				particleCount: 25,
				performanceMode: 'low'
			};
		} else if (benchmarks.score > 80) {
			return {
				...base,
				particleCount: 120,
				performanceMode: 'high'
			};
		}

		return base;
	}

	private async loadThemeRecommendations(): Promise<void> {
		const state = this.getCurrentState();

		// Get personalized recommendations based on interests and preferences
		const recommendations = this.generateThemeRecommendations(
			state.personalization,
			state.deviceCapabilities
		);

		this.availableThemes = this.availableThemes.map((theme) => ({
			...theme,
			isRecommended: recommendations.includes(theme.id)
		}));

		// Auto-select recommended themes if user hasn't made selections
		if (state.selectedThemes.length === 0) {
			this.store.update((s) => ({
				...s,
				selectedThemes: recommendations.slice(0, 2) // Select top 2 recommendations
			}));
		}
	}

	private generateThemeRecommendations(
		personalization: PersonalizationOptions,
		capabilities: DeviceCapabilities | null
	): string[] {
		const scores = new Map<string, number>();

		for (const theme of this.availableThemes) {
			let score = 0;

			// Interest-based scoring
			if (personalization.interests.includes('nature') && theme.category === 'nature') score += 30;
			if (personalization.interests.includes('technology') && theme.category === 'tech')
				score += 30;
			if (personalization.interests.includes('art') && theme.category === 'artistic') score += 30;
			if (personalization.interests.includes('space') && theme.category === 'space') score += 30;

			// Usage-based scoring
			if (
				personalization.usage === 'work' &&
				(theme.category === 'minimal' || theme.category === 'tech')
			)
				score += 20;
			if (personalization.usage === 'personal' && theme.category === 'nature') score += 15;

			// Experience-based scoring
			if (personalization.experience === 'beginner' && theme.category === 'minimal') score += 10;
			if (personalization.experience === 'advanced' && theme.category === 'abstract') score += 10;

			// Performance considerations
			if (capabilities?.performance === 'low' && theme.size > 200) score -= 20;
			if (capabilities?.connectionSpeed === 'slow' && theme.size > 150) score -= 15;

			// Priority-based scoring
			if (
				personalization.priorities.includes('beauty') &&
				(theme.category === 'nature' || theme.category === 'artistic')
			)
				score += 15;
			if (personalization.priorities.includes('speed') && theme.category === 'minimal') score += 15;

			scores.set(theme.id, score);
		}

		// Sort by score and return top recommendations
		return Array.from(scores.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 4)
			.map(([themeId]) => themeId);
	}

	private async generatePreview(): Promise<void> {
		this.store.update((state) => ({
			...state,
			previewMode: true,
			isProcessing: true
		}));

		// Simulate applying all settings
		await new Promise((resolve) => setTimeout(resolve, 2000));

		this.store.update((state) => ({
			...state,
			isProcessing: false
		}));
	}

	private async validateStepCompletion(stepId: string): Promise<boolean> {
		const state = this.getCurrentState();

		switch (stepId) {
			case 'themes':
				if (state.selectedThemes.length === 0) {
					this.addError('Please select at least one wallpaper theme');
					return false;
				}
				break;
			case 'shortcuts':
				if (!state.modifierKey) {
					// Auto-select default if none chosen
					this.updateModifierKey({ keys: ['ctrl'], label: 'Ctrl' });
				}
				break;
		}

		return true;
	}

	private canFinishSetup(state: SetupState): boolean {
		const requiredSteps = state.steps.filter((step) => !step.isOptional);
		const completedRequired = requiredSteps.filter((step) =>
			state.progress.completedSteps.has(step.id)
		);

		return completedRequired.length >= requiredSteps.length - 1; // -1 for completion step
	}

	private calculateEstimatedTimeRemaining(currentIndex: number, steps: SetupStep[]): number {
		const remainingSteps = steps.slice(currentIndex + 1);
		return remainingSteps.reduce((total, step) => total + step.estimatedTime, 0);
	}

	// Public update methods
	updatePersonalization(updates: Partial<PersonalizationOptions>): void {
		this.store.update((state) => ({
			...state,
			personalization: { ...state.personalization, ...updates }
		}));
		this.scheduleAutoSave();
	}

	updatePreferences(updates: Partial<SetupPreferences>): void {
		this.store.update((state) => ({
			...state,
			preferences: { ...state.preferences, ...updates }
		}));
		this.scheduleAutoSave();
	}

	selectThemes(themeIds: string[]): void {
		this.store.update((state) => ({
			...state,
			selectedThemes: themeIds
		}));
		this.scheduleAutoSave();
	}

	addBookmarkCategory(name: string, icon: string, description?: string): void {
		this.store.update((state) => ({
			...state,
			bookmarkCategories: [...state.bookmarkCategories, { name, icon, description }]
		}));
		this.scheduleAutoSave();
	}

	removeBookmarkCategory(index: number): void {
		this.store.update((state) => ({
			...state,
			bookmarkCategories: state.bookmarkCategories.filter((_, i) => i !== index)
		}));
		this.scheduleAutoSave();
	}

	updateSearchEngines(engines: string[]): void {
		this.store.update((state) => ({
			...state,
			selectedSearchEngines: engines
		}));
		this.scheduleAutoSave();
	}

	updateModifierKey(key: { keys: string[]; label: string }): void {
		this.store.update((state) => ({
			...state,
			modifierKey: key
		}));
		this.scheduleAutoSave();
	}

	async completeSetup(): Promise<void> {
		const state = this.getCurrentState();

		this.store.update((s) => ({
			...s,
			isProcessing: true,
			animations: {
				...s.animations,
				completion: true
			}
		}));

		try {
			// Apply all settings to their respective stores
			await this.applySettingsToStores(state);

			// Mark as completed
			this.store.update((s) => ({
				...s,
				isCompleted: true,
				isActive: false,
				isProcessing: false
			}));

			// Save completion state
			this.saveToCache();

			// Clear auto-save timer
			if (this.autoSaveTimer) {
				clearTimeout(this.autoSaveTimer);
			}
		} catch (error) {
			console.error('Failed to complete setup:', error);
			this.addError('Failed to save settings. Please try again.');
			this.store.update((s) => ({ ...s, isProcessing: false }));
		}
	}

	private async applySettingsToStores(state: SetupState): Promise<void> {
		// This would integrate with the other stores
		// For now, we'll emit events that the main app can listen to

		window.dispatchEvent(
			new CustomEvent('setup-complete', {
				detail: {
					themes: state.selectedThemes,
					bookmarkCategories: state.bookmarkCategories,
					searchEngines: state.selectedSearchEngines,
					modifierKey: state.modifierKey,
					preferences: state.preferences,
					personalization: state.personalization
				}
			})
		);
	}

	// Utility methods
	getAvailableThemes(): SetupTheme[] {
		return this.availableThemes;
	}

	private addError(error: string): void {
		this.store.update((state) => ({
			...state,
			errors: [...state.errors, error]
		}));

		// Clear error after 5 seconds
		setTimeout(() => {
			this.store.update((state) => ({
				...state,
				errors: state.errors.filter((e) => e !== error)
			}));
		}, 5000);
	}

	private async loadAvailableThemes(): Promise<void> {
		try {
			const response = await fetch('/api/setup/themes');
			if (response.ok) {
				const themes = await response.json();
				this.availableThemes = [...DEFAULT_THEMES, ...themes];
			}
		} catch (error) {
			console.warn('Failed to load additional themes:', error);
		}
	}

	private scheduleAutoSave(): void {
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}

		this.autoSaveTimer = setTimeout(() => {
			this.saveToCache();
		}, 2000);
	}

	private saveToCache(): void {
		if (!browser) return;

		try {
			const state = this.getCurrentState();
			const dataToSave = {
				isCompleted: state.isCompleted,
				personalization: state.personalization,
				preferences: state.preferences,
				selectedThemes: state.selectedThemes,
				bookmarkCategories: state.bookmarkCategories,
				selectedSearchEngines: state.selectedSearchEngines,
				modifierKey: state.modifierKey,
				progress: state.progress
			};

			localStorage.setItem(this.cacheKey, JSON.stringify(dataToSave));
		} catch (error) {
			console.warn('Failed to save setup state:', error);
		}
	}

	private getCurrentState(): SetupState {
		return get(this.store);
	}

	markComplete(): void {
		this.store.update((state) => ({ ...state, isCompleted: true }));
	}

	reset(): void {
		this.store.set(DEFAULT_STATE);
		if (browser) {
			localStorage.removeItem(this.cacheKey);
		}
	}

	destroy(): void {
		// Clear all timers
		this.stepTimers.forEach((timer) => clearTimeout(timer));
		this.stepTimers.clear();

		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}
	}
}

// Create store instance
export const setupStore = new SetupStore();

// Derived stores
export const currentSetupStep = derived(setupStore, ($store) => $store.currentStep);

export const setupProgress = derived(setupStore, ($store) => $store.progress);

export const isSetupCompleted = derived(setupStore, ($store) => $store.isCompleted);

export const setupErrors = derived(setupStore, ($store) => $store.errors);

export const canProceed = derived(setupStore, ($store) => {
	if (!$store.currentStep) return false;

	// Check if current step has required data
	switch ($store.currentStep.id) {
		case 'themes':
			return $store.selectedThemes.length > 0;
		case 'shortcuts':
			return true; // Optional or has auto-fallback
		default:
			return true;
	}
});

export const setupDeviceCapabilities = derived(setupStore, ($store) => $store.deviceCapabilities);
