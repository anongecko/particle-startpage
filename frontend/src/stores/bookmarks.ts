import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface BookmarkItem {
	id: string;
	title: string;
	url: string;
	favicon?: string;
	customIcon?: string;
	description?: string;
	tags: string[];
	isVisible: boolean;
	sortOrder: number;
	lastAccessed?: number;
	accessCount: number;
	createdAt: number;
	updatedAt: number;
	isSelected?: boolean;
	metadata?: {
		domain: string;
		protocol: string;
		isSecure: boolean;
		pageTitle?: string;
		pageDescription?: string;
	};
}

export interface Object3DCustomization {
	scale: number;
	rotation: [number, number, number];
	glowIntensity: number;
	colorMode: 'auto' | 'custom';
	customColor?: string;
	animationSpeed: number;
	enableHoverEffects: boolean;
	materialType: 'standard' | 'metallic' | 'glass' | 'neon';
	emissiveIntensity: number;
}

export interface BookmarkCategory {
	id: string;
	name: string;
	description?: string;
	// Legacy support - will be migrated to objectId
	iconId?: string;
	iconColor?: string;
	customColor?: string;
	// New 3D object system
	objectId: string;
	objectCustomization: Object3DCustomization;
	bookmarks: BookmarkItem[];
	isVisible: boolean;
	sortOrder: number;
	lastUsed?: number;
	createdAt: number;
	updatedAt: number;
	isExpanded?: boolean;
	isSelected?: boolean;
	// Enhanced hover effects that work with 3D objects
	hoverEffects: {
		glowIntensity: number;
		particleCount: number;
		particleSpeed: number;
		glowColor?: string;
		enableSwirl: boolean;
		swirlRadius: number;
		// New 3D-specific effects
		enable3DAnimation: boolean;
		hoverScale: number;
		hoverLift: number;
	};
	analytics: {
		totalClicks: number;
		avgSessionTime: number;
		lastAccessedBookmark?: string;
		popularBookmarks: Array<{ id: string; clicks: number }>;
		// Enhanced analytics for 3D objects
		objectChangeCount: number;
		averageHoverTime: number;
		customizationChanges: number;
	};
}

export interface LottieIcon {
	id: string;
	name: string;
	category:
		| 'development'
		| 'entertainment'
		| 'productivity'
		| 'social'
		| 'education'
		| 'shopping'
		| 'gaming'
		| 'design'
		| 'business'
		| 'general';
	path: string;
	previewPath?: string;
	animationType: 'loop' | 'hover' | 'click' | 'static';
	duration: number;
	description?: string;
	tags: string[];
	isDefault?: boolean;
	complexity: 'low' | 'medium' | 'high';
	fileSize?: number;
	isLoaded?: boolean;
	fallbackIcon?: string;
}

export interface InteractionState {
	hoveredCategoryId: string | null;
	openCategoryId: string | null;
	selectedCategoryIds: Set<string>;
	selectedBookmarkIds: Set<string>;
	isDropdownOpen: boolean;
	dropdownPosition?: { x: number; y: number };
	longPressTimer: NodeJS.Timeout | null;
	lastInteraction: number;
	touchStartPosition?: { x: number; y: number };
	isDragging: boolean;
	dragTarget?: { type: 'category' | 'bookmark'; id: string };
	isMultiSelectMode: boolean;
	keyboardFocusId?: string;
	keyboardFocusType?: 'category' | 'bookmark';
	// New 3D interaction states
	object3DHovered: string | null;
	objectSelectorOpen: boolean;
	contextMenuOpen: { categoryId: string; x: number; y: number } | null;
}

export interface SearchState {
	query: string;
	filters: {
		categories: string[];
		tags: string[];
		dateRange?: { start: Date; end: Date };
		accessCountMin?: number;
		hasDescription?: boolean;
		// New 3D object filters
		objectTypes?: string[];
		lastCustomized?: Date;
	};
	results: Array<BookmarkItem & { categoryName: string; relevanceScore: number }>;
	suggestions: string[];
	isActive: boolean;
	lastSearchTime: number;
}

export interface BookmarkState {
	categories: BookmarkCategory[];
	availableIcons: LottieIcon[];
	interactionState: InteractionState;
	searchState: SearchState;
	isLoading: boolean;
	loadingOperations: Set<string>;
	error: string | null;
	lastSync: number;
	isDirty: boolean;
	performanceMode: 'high' | 'medium' | 'low';
	undoStack: Array<{ action: string; data: any; timestamp: number }>;
	redoStack: Array<{ action: string; data: any; timestamp: number }>;
	analytics: {
		totalBookmarks: number;
		totalCategories: number;
		totalClicks: number;
		avgCategorySize: number;
		mostUsedCategory?: string;
		searchHistory: string[];
		// Enhanced 3D analytics
		object3DUsage: Record<string, number>;
		totalCustomizations: number;
		averageObjectsPerCategory: number;
	};
	settings: {
		enableAnalytics: boolean;
		enableAutoFavicon: boolean;
		enableDuplicateDetection: boolean;
		maxUndoHistory: number;
		autoBackupInterval: number;
		keyboardShortcuts: Record<string, string>;
		// New 3D settings
		enable3DObjects: boolean;
		default3DPerformance: 'high' | 'medium' | 'low';
		autoMigrateToObjects: boolean;
		promptObjectSelection: boolean;
	};
	// Migration tracking
	migrationState: {
		hasLegacyIcons: boolean;
		migrationCompleted: boolean;
		migrationVersion: string;
		lastMigrationDate?: number;
	};
}

export interface BookmarkImportData {
	version: string;
	categories: BookmarkCategory[];
	exportedAt: number;
	source: string;
	checksum?: string;
}

// Search index for fast full-text search
interface SearchIndex {
	words: Map<string, Set<string>>;
	bookmarks: Map<
		string,
		{ title: string; description: string; tags: string[]; categoryName: string }
	>;
	lastUpdated: number;
}

// 3D Object customization cache
interface Object3DCache {
	customizations: Map<string, Object3DCustomization>;
	lastUpdated: number;
	version: string;
}

// Default 3D object mappings for categories
const CATEGORY_TO_OBJECT_MAPPING: Record<string, string> = {
	// Development/Programming
	'development': 'development/computer',
	'programming': 'development/git-tree',
	'code': 'development/docker',
	'tech': 'development/server',
	'software': 'development/computer',
	
	// Learning/Education
	'learning': 'learning/graduation-cap',
	'education': 'learning/textbooks',
	'study': 'learning/microscope',
	'school': 'learning/graduation-cap',
	'university': 'learning/graduation-cap',
	'research': 'learning/brain',
	
	// Shopping/E-commerce
	'shopping': 'shopping/bag',
	'ecommerce': 'shopping/gift-box',
	'store': 'shopping/handbag',
	'marketplace': 'shopping/bag',
	
	// Finance/Money
	'finance': 'finance/piggy-bank',
	'money': 'finance/cash-stack',
	'banking': 'finance/atm',
	'investment': 'finance/gold-bars',
	'crypto': 'finance/safe',
	
	// Work/Business
	'work': 'work/briefcase',
	'business': 'work/printer',
	'office': 'work/desk-lamp',
	'productivity': 'work/time-clock',
	'corporate': 'work/fax',
	
	// Social Media
	'social': 'social/globe',
	'media': 'social/megaphone',
	'communication': 'social/bell',
	'network': 'social/heart',
	
	// Entertainment
	'entertainment': 'entertainment/popcorn',
	'movies': 'entertainment/film-reel',
	'gaming': 'entertainment/controller',
	'games': 'entertainment/dice',
	'videos': 'entertainment/camera',
	'streaming': 'entertainment/popcorn',
	'vr': 'entertainment/vr-headset',
	
	// Food/Cooking
	'food': 'food/chef-hat',
	'cooking': 'food/dutch-oven',
	'recipes': 'food/mixing-bowl',
	'kitchen': 'food/mortar-pestle',
	'baking': 'food/mixing-bowl',
	
	// Tools/Utilities
	'tools': 'tools/toolbox',
	'utilities': 'tools/workbench',
	'hardware': 'tools/drill',
	'diy': 'tools/hard-hat',
	'construction': 'tools/tape-measure',
	
	// Default fallbacks
	'personal': 'misc/backpack',
	'travel': 'misc/compass',
	'health': 'misc/tree',
	'news': 'misc/telescope',
	'reference': 'misc/filing-drawer',
	'fun': 'misc/magic-8-ball',
	'misc': 'misc/treasure-chest',
	'other': 'geometric/sphere'
};

const DEFAULT_OBJECT_CUSTOMIZATION: Object3DCustomization = {
	scale: 1.0,
	rotation: [0, 0, 0],
	glowIntensity: 1.0,
	colorMode: 'auto',
	animationSpeed: 1.0,
	enableHoverEffects: true,
	materialType: 'standard',
	emissiveIntensity: 0.3,
};

const DEFAULT_SETTINGS = {
	enableAnalytics: true,
	enableAutoFavicon: true,
	enableDuplicateDetection: true,
	maxUndoHistory: 50,
	autoBackupInterval: 300000,
	keyboardShortcuts: {
		search: 'ctrl+k',
		newCategory: 'ctrl+n',
		newBookmark: 'ctrl+b',
		selectAll: 'ctrl+a',
		undo: 'ctrl+z',
		redo: 'ctrl+y',
		delete: 'delete'
	},
	// New 3D settings
	enable3DObjects: true,
	default3DPerformance: 'high' as const,
	autoMigrateToObjects: true,
	promptObjectSelection: true,
};

const DEFAULT_INTERACTION_STATE: InteractionState = {
	hoveredCategoryId: null,
	openCategoryId: null,
	selectedCategoryIds: new Set(),
	selectedBookmarkIds: new Set(),
	isDropdownOpen: false,
	longPressTimer: null,
	lastInteraction: Date.now(),
	isDragging: false,
	isMultiSelectMode: false,
	object3DHovered: null,
	objectSelectorOpen: false,
	contextMenuOpen: null,
};

const DEFAULT_SEARCH_STATE: SearchState = {
	query: '',
	filters: {
		categories: [],
		tags: []
	},
	results: [],
	suggestions: [],
	isActive: false,
	lastSearchTime: 0
};

const DEFAULT_STATE: BookmarkState = {
	categories: [],
	availableIcons: [], // Will be populated from existing data
	interactionState: DEFAULT_INTERACTION_STATE,
	searchState: DEFAULT_SEARCH_STATE,
	isLoading: false,
	loadingOperations: new Set(),
	error: null,
	lastSync: 0,
	isDirty: false,
	performanceMode: 'high',
	undoStack: [],
	redoStack: [],
	analytics: {
		totalBookmarks: 0,
		totalCategories: 0,
		totalClicks: 0,
		avgCategorySize: 0,
		searchHistory: [],
		object3DUsage: {},
		totalCustomizations: 0,
		averageObjectsPerCategory: 0,
	},
	settings: DEFAULT_SETTINGS,
	migrationState: {
		hasLegacyIcons: false,
		migrationCompleted: false,
		migrationVersion: '1.0.0',
	},
};

class BookmarkStore {
	private store = writable<BookmarkState>(DEFAULT_STATE);
	private cacheKey = 'particle-nexus-bookmarks';
	private searchIndexKey = 'particle-nexus-bookmark-search-index';
	private analyticsKey = 'particle-nexus-bookmark-analytics';
	private object3DCacheKey = 'particle-nexus-object3d-cache';

	private searchIndex: SearchIndex = {
		words: new Map(),
		bookmarks: new Map(),
		lastUpdated: 0
	};

	private object3DCache: Object3DCache = {
		customizations: new Map(),
		lastUpdated: 0,
		version: '1.0.0'
	};

	private longPressDelay = 500;
	private hoverDebounceTimer: NodeJS.Timeout | null = null;
	private autosaveTimer: NodeJS.Timeout | null = null;
	private searchDebounceTimer: NodeJS.Timeout | null = null;
	private autoBackupTimer: NodeJS.Timeout | null = null;
	private faviconCache: Map<string, string> = new Map();
	private operationQueue: Array<() => Promise<void>> = [];
	private isProcessingQueue = false;

	subscribe = this.store.subscribe;

	async initialize(): Promise<void> {
		if (!browser) return;

		try {
			this.addLoadingOperation('initialization');

			// Load all cached data in parallel
			await Promise.all([
				this.loadFromCache(),
				this.loadSearchIndex(),
				this.loadAnalytics(),
				this.loadObject3DCache()
			]);

			// Check if migration is needed
			await this.checkAndPerformMigration();

			// Setup systems
			this.detectPerformanceMode();
			this.setupKeyboardShortcuts();
			this.startAutoBackup();

			// Load icons and sync
			await Promise.all([this.loadAvailableLottieIcons(), this.syncWithServer()]);

			// Rebuild search index if necessary
			this.rebuildSearchIndexIfNeeded();

			// Update analytics
			this.updateAnalytics();

			this.removeLoadingOperation('initialization');
		} catch (error) {
			console.error('Failed to initialize bookmark store:', error);
			this.setError('Failed to load bookmarks');
			this.removeLoadingOperation('initialization');
		}
	}

	// Enhanced Category Management with 3D Objects
	async createCategory(name: string, description?: string, promptForObject: boolean = true): Promise<string> {
		const categoryId = this.generateId('cat');
		const now = Date.now();
		
		// Intelligent object selection based on category name
		const suggestedObjectId = this.suggestObjectForCategory(name);
		
		const newCategory: BookmarkCategory = {
			id: categoryId,
			name: this.sanitizeInput(name),
			description: description ? this.sanitizeInput(description) : undefined,
			objectId: suggestedObjectId,
			objectCustomization: { ...DEFAULT_OBJECT_CUSTOMIZATION },
			bookmarks: [],
			isVisible: true,
			sortOrder: this.getNextCategorySortOrder(),
			createdAt: now,
			updatedAt: now,
			hoverEffects: {
				glowIntensity: 0.8,
				particleCount: 15,
				particleSpeed: 1.2,
				enableSwirl: true,
				swirlRadius: 40,
				enable3DAnimation: true,
				hoverScale: 1.2,
				hoverLift: 0.3,
			},
			analytics: {
				totalClicks: 0,
				avgSessionTime: 0,
				popularBookmarks: [],
				objectChangeCount: 0,
				averageHoverTime: 0,
				customizationChanges: 0,
			}
		};

		this.executeWithUndo(
			'createCategory',
			() => {
				this.store.update((state) => ({
					...state,
					categories: [...state.categories, newCategory],
					isDirty: true
				}));
			},
			{
				undo: () => this.deleteCategory(categoryId, false),
				data: newCategory
			}
		);

		// Cache the default customization
		this.saveObject3DCustomization(categoryId, newCategory.objectCustomization);

		this.scheduleAutosave();
		this.updateAnalytics();

		// Prompt for object selection if enabled and not using auto-suggestion
		if (promptForObject && this.getCurrentState().settings.promptObjectSelection) {
			setTimeout(() => {
				window.dispatchEvent(new CustomEvent('open-object-selector', {
					detail: { categoryId, suggestedObjectId }
				}));
			}, 100);
		}

		return categoryId;
	}

	setObjectForCategory(categoryId: string, objectId: string): void {
		const category = this.findCategory(categoryId);
		if (!category) return;

		this.updateCategory(categoryId, { 
			objectId,
			updatedAt: Date.now()
		});

		// Update analytics
		this.store.update(state => ({
			...state,
			analytics: {
				...state.analytics,
				object3DUsage: {
					...state.analytics.object3DUsage,
					[objectId]: (state.analytics.object3DUsage[objectId] || 0) + 1
				}
			}
		}));

		// Track object change in category analytics
		this.updateCategoryAnalytics(categoryId, { objectChangeCount: 1 });
	}

	updateObjectCustomization(categoryId: string, customization: Partial<Object3DCustomization>): void {
		const category = this.findCategory(categoryId);
		if (!category) return;

		const newCustomization = { 
			...category.objectCustomization, 
			...customization 
		};

		this.updateCategory(categoryId, { 
			objectCustomization: newCustomization,
			updatedAt: Date.now()
		});

		// Cache the customization separately for performance
		this.saveObject3DCustomization(categoryId, newCustomization);

		// Update analytics
		this.updateCategoryAnalytics(categoryId, { customizationChanges: 1 });

		// Emit real-time preview event
		window.dispatchEvent(new CustomEvent('object-customization-update', {
			detail: { categoryId, customization: newCustomization }
		}));
	}

	resetObjectToDefaults(categoryId: string): void {
		this.updateObjectCustomization(categoryId, { ...DEFAULT_OBJECT_CUSTOMIZATION });
	}

	// Migration System
	private async checkAndPerformMigration(): Promise<void> {
		const state = this.getCurrentState();
		
		// Check if we have legacy Lottie icons to migrate
		const hasLegacyIcons = state.categories.some(cat => cat.iconId && !cat.objectId);
		
		if (hasLegacyIcons && state.settings.autoMigrateToObjects) {
			await this.performLottieToObjectMigration();
		}

		// Update migration state
		this.store.update(s => ({
			...s,
			migrationState: {
				...s.migrationState,
				hasLegacyIcons,
				migrationCompleted: !hasLegacyIcons,
				lastMigrationDate: Date.now()
			}
		}));
	}

	private async performLottieToObjectMigration(): Promise<void> {
		console.log('Starting Lottie to 3D object migration...');
		
		const state = this.getCurrentState();
		const categoriesToMigrate = state.categories.filter(cat => cat.iconId && !cat.objectId);

		for (const category of categoriesToMigrate) {
			// Map Lottie icon to appropriate 3D object
			const objectId = this.migrateLottieIconTo3DObject(category.iconId!, category.name);
			
			// Preserve existing customizations where possible
			const migratedCustomization: Object3DCustomization = {
				...DEFAULT_OBJECT_CUSTOMIZATION,
				// Migrate glow intensity from hover effects
				glowIntensity: category.hoverEffects?.glowIntensity || 1.0,
				// Use custom color if available
				colorMode: category.customColor ? 'custom' : 'auto',
				customColor: category.customColor,
			};

			// Update category with 3D object
			this.updateCategory(category.id, {
				objectId,
				objectCustomization: migratedCustomization,
				// Enhanced hover effects for 3D
				hoverEffects: {
					...category.hoverEffects,
					enable3DAnimation: true,
					hoverScale: 1.2,
					hoverLift: 0.3,
				}
			}, false); // Don't add to undo stack during migration

			// Cache the customization
			this.saveObject3DCustomization(category.id, migratedCustomization);
		}

		console.log(`Migrated ${categoriesToMigrate.length} categories to 3D objects`);
	}

	private migrateLottieIconTo3DObject(lottieIconId: string, categoryName: string): string {
		// Direct mapping for known Lottie icons
		const directMapping: Record<string, string> = {
			'code-brackets': 'development/computer',
			'play-button': 'entertainment/film-reel',
			'productivity-gears': 'tools/toolbox',
			'social-network': 'social/globe',
			'education-book': 'learning/textbooks',
			'shopping-cart': 'shopping/bag',
			'game-controller': 'entertainment/controller',
			'design-palette': 'misc/vintage-camera',
			'business-chart': 'finance/cash-stack',
			'star-favorite': 'misc/treasure-chest'
		};

		// Try direct mapping first
		if (directMapping[lottieIconId]) {
			return directMapping[lottieIconId];
		}

		// Fallback to category name analysis
		return this.suggestObjectForCategory(categoryName);
	}

	private suggestObjectForCategory(categoryName: string): string {
		const nameLower = categoryName.toLowerCase();
		
		// Check for exact matches first
		for (const [keyword, objectId] of Object.entries(CATEGORY_TO_OBJECT_MAPPING)) {
			if (nameLower.includes(keyword)) {
				return objectId;
			}
		}

		// Fallback patterns
		if (nameLower.match(/work|job|office|business/)) return 'work/briefcase';
		if (nameLower.match(/learn|study|school|edu/)) return 'learning/graduation-cap';
		if (nameLower.match(/shop|buy|store|market/)) return 'shopping/bag';
		if (nameLower.match(/money|bank|finance|invest/)) return 'finance/piggy-bank';
		if (nameLower.match(/social|media|network|chat/)) return 'social/globe';
		if (nameLower.match(/game|play|fun|entertainment/)) return 'entertainment/controller';
		if (nameLower.match(/code|dev|programming|tech/)) return 'development/computer';
		if (nameLower.match(/food|cook|recipe|kitchen/)) return 'food/chef-hat';
		if (nameLower.match(/tool|util|fix|build/)) return 'tools/toolbox';

		// Ultimate fallback
		return 'geometric/sphere';
	}

	// 3D Object Cache Management
	private saveObject3DCustomization(categoryId: string, customization: Object3DCustomization): void {
		this.object3DCache.customizations.set(categoryId, customization);
		this.object3DCache.lastUpdated = Date.now();
		this.saveObject3DCache();
	}

	private getObject3DCustomization(categoryId: string): Object3DCustomization | null {
		return this.object3DCache.customizations.get(categoryId) || null;
	}

	private saveObject3DCache(): void {
		if (!browser) return;

		try {
			const cacheData = {
				customizations: Object.fromEntries(this.object3DCache.customizations.entries()),
				lastUpdated: this.object3DCache.lastUpdated,
				version: this.object3DCache.version
			};

			localStorage.setItem(this.object3DCacheKey, JSON.stringify(cacheData));
		} catch (error) {
			console.warn('Failed to save 3D object cache:', error);
		}
	}

	private async loadObject3DCache(): Promise<void> {
		try {
			const cached = localStorage.getItem(this.object3DCacheKey);
			if (cached) {
				const cacheData = JSON.parse(cached);

				this.object3DCache.customizations = new Map(Object.entries(cacheData.customizations));
				this.object3DCache.lastUpdated = cacheData.lastUpdated || 0;
				this.object3DCache.version = cacheData.version || '1.0.0';
			}
		} catch (error) {
			console.warn('Failed to load 3D object cache:', error);
			this.object3DCache = {
				customizations: new Map(),
				lastUpdated: 0,
				version: '1.0.0'
			};
		}
	}

	// Enhanced Analytics for 3D Objects
	private updateCategoryAnalytics(categoryId: string, updates: Partial<BookmarkCategory['analytics']>): void {
		const category = this.findCategory(categoryId);
		if (!category) return;

		const newAnalytics = { ...category.analytics };
		
		// Accumulate numeric values instead of overwriting
		if (updates.objectChangeCount) {
			newAnalytics.objectChangeCount += updates.objectChangeCount;
		}
		if (updates.customizationChanges) {
			newAnalytics.customizationChanges += updates.customizationChanges;
		}
		if (updates.averageHoverTime) {
			newAnalytics.averageHoverTime = updates.averageHoverTime;
		}

		this.updateCategory(categoryId, { analytics: newAnalytics }, false);
	}

	// Rest of the existing implementation continues...
	// [Previous methods like updateCategory, deleteCategory, addBookmark, etc. remain the same]
	
	// Utility method to get current state
	private getCurrentState(): BookmarkState {
		return get(this.store);
	}

	private findCategory(categoryId: string): BookmarkCategory | null {
		const state = this.getCurrentState();
		return state.categories.find((cat) => cat.id === categoryId) || null;
	}

	private findBookmark(categoryId: string, bookmarkId: string): BookmarkItem | null {
		const category = this.findCategory(categoryId);
		return category?.bookmarks.find((bm) => bm.id === bookmarkId) || null;
	}

	private generateId(prefix: string): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private sanitizeInput(input: string): string {
		return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
	}

	private getNextCategorySortOrder(): number {
		const state = this.getCurrentState();
		return Math.max(0, ...state.categories.map(cat => cat.sortOrder)) + 1;
	}

	private executeWithUndo<T>(
		actionName: string,
		action: () => void,
		undoData: { undo: () => void; data: T }
	): void {
		action();

		this.store.update((state) => {
			const newUndoStack = [
				...state.undoStack.slice(-(state.settings.maxUndoHistory - 1)),
				{
					action: actionName,
					data: undoData,
					timestamp: Date.now()
				}
			];

			return {
				...state,
				undoStack: newUndoStack,
				redoStack: []
			};
		});
	}

	private addLoadingOperation(operation: string): void {
		this.store.update((state) => ({
			...state,
			loadingOperations: new Set([...state.loadingOperations, operation]),
			isLoading: true
		}));
	}

	private removeLoadingOperation(operation: string): void {
		this.store.update((state) => {
			const newOps = new Set(state.loadingOperations);
			newOps.delete(operation);
			return {
				...state,
				loadingOperations: newOps,
				isLoading: newOps.size > 0
			};
		});
	}

	private setError(error: string): void {
		this.store.update((state) => ({ ...state, error, isLoading: false }));
	}

	private scheduleAutosave(): void {
		// Implementation would continue here...
	}

	private updateAnalytics(): void {
		// Implementation would continue here...
	}

	// Placeholder methods for completeness
	private async loadFromCache(): Promise<void> { /* Implementation */ }
	private async loadSearchIndex(): Promise<void> { /* Implementation */ }
	private async loadAnalytics(): Promise<void> { /* Implementation */ }
	private detectPerformanceMode(): void { /* Implementation */ }
	private setupKeyboardShortcuts(): void { /* Implementation */ }
	private startAutoBackup(): void { /* Implementation */ }
	private async loadAvailableLottieIcons(): Promise<void> { /* Implementation */ }
	private async syncWithServer(): Promise<void> { /* Implementation */ }
	private rebuildSearchIndexIfNeeded(): void { /* Implementation */ }

	destroy(): void {
		[
			this.hoverDebounceTimer,
			this.autosaveTimer,
			this.searchDebounceTimer,
			this.autoBackupTimer
		].forEach((timer) => {
			if (timer) clearTimeout(timer);
		});

		const state = this.getCurrentState();
		if (state.interactionState.longPressTimer) {
			clearTimeout(state.interactionState.longPressTimer);
		}
	}
}

// Create store instance
export const bookmarkStore = new BookmarkStore();

// Enhanced derived stores with 3D object support
export const visibleCategories = derived(
	bookmarkStore,
	($store) =>
		$store.categories
			.filter((cat) => cat.isVisible)
			.sort((a, b) => a.sortOrder - b.sortOrder),
	[]
);

export const categoriesWithObjects = derived(
	bookmarkStore,
	($store) =>
		$store.categories
			.filter((cat) => cat.isVisible && cat.objectId)
			.map(cat => ({
				...cat,
				object3DCustomization: cat.objectCustomization
			})),
	[]
);

export const migrationStatus = derived(
	bookmarkStore,
	($store) => $store.migrationState,
	{ hasLegacyIcons: false, migrationCompleted: false, migrationVersion: '1.0.0' }
);

export const object3DAnalytics = derived(
	bookmarkStore,
	($store) => ({
		usage: $store.analytics.object3DUsage,
		totalCustomizations: $store.analytics.totalCustomizations,
		averagePerCategory: $store.analytics.averageObjectsPerCategory
	}),
	{ usage: {}, totalCustomizations: 0, averagePerCategory: 0 }
);

// Existing derived stores
export const searchResults = derived(bookmarkStore, ($store) => $store.searchState.results, []);
export const isSearchActive = derived(bookmarkStore, ($store) => $store.searchState.isActive, false);
export const selectedItems = derived(
	bookmarkStore,
	($store) => ({
		categories: Array.from($store.interactionState.selectedCategoryIds),
		bookmarks: Array.from($store.interactionState.selectedBookmarkIds)
	}),
	{ categories: [], bookmarks: [] }
);
export const canUndo = derived(bookmarkStore, ($store) => $store.undoStack.length > 0, false);
export const canRedo = derived(bookmarkStore, ($store) => $store.redoStack.length > 0, false);
