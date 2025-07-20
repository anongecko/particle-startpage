import { browser } from '$app/environment';
import { createErrorHandler } from './utils';

export interface EventListener<T = any> {
	id: string;
	callback: (data: T) => void | Promise<void>;
	once: boolean;
	priority: number;
	context?: any;
	filter?: (data: T) => boolean;
}

export interface EventOptions {
	once?: boolean;
	priority?: number;
	context?: any;
	filter?: (data: any) => boolean;
}

export interface EventMetrics {
	eventName: string;
	totalEmissions: number;
	totalListeners: number;
	averageExecutionTime: number;
	lastEmitted: number;
	errorCount: number;
}

export interface EventHistory {
	eventName: string;
	data: any;
	timestamp: number;
	executionTime: number;
	listenerCount: number;
	errors: string[];
}

/**
 * Advanced event system with priority, filtering, and metrics
 */
export class EventEmitter {
	private listeners: Map<string, EventListener[]> = new Map();
	private metrics: Map<string, EventMetrics> = new Map();
	private history: EventHistory[] = [];
	private maxHistory = 100;
	private errorHandler = createErrorHandler('EventEmitter');
	private globalMiddleware: Array<(eventName: string, data: any) => any> = [];

	/**
	 * Add event listener
	 */
	on<T = any>(
		eventName: string,
		callback: (data: T) => void | Promise<void>,
		options: EventOptions = {}
	): string {
		const listener: EventListener<T> = {
			id: this.generateId(),
			callback,
			once: options.once || false,
			priority: options.priority || 0,
			context: options.context,
			filter: options.filter
		};

		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, []);
		}

		const eventListeners = this.listeners.get(eventName)!;
		eventListeners.push(listener);

		// Sort by priority (higher priority first)
		eventListeners.sort((a, b) => b.priority - a.priority);

		// Update metrics
		this.updateMetrics(eventName, 'listener_added');

		return listener.id;
	}

	/**
	 * Add one-time event listener
	 */
	once<T = any>(
		eventName: string,
		callback: (data: T) => void | Promise<void>,
		options: Omit<EventOptions, 'once'> = {}
	): string {
		return this.on(eventName, callback, { ...options, once: true });
	}

	/**
	 * Remove event listener
	 */
	off(eventName: string, listenerId?: string): boolean {
		const eventListeners = this.listeners.get(eventName);
		if (!eventListeners) return false;

		if (listenerId) {
			const index = eventListeners.findIndex((l) => l.id === listenerId);
			if (index !== -1) {
				eventListeners.splice(index, 1);
				this.updateMetrics(eventName, 'listener_removed');
				return true;
			}
		} else {
			// Remove all listeners for this event
			this.listeners.delete(eventName);
			this.updateMetrics(eventName, 'all_listeners_removed');
			return true;
		}

		return false;
	}

	/**
	 * Emit event to all listeners
	 */
	async emit<T = any>(eventName: string, data: T): Promise<void> {
		const startTime = performance.now();
		const eventListeners = this.listeners.get(eventName) || [];
		const errors: string[] = [];

		// Apply global middleware
		let processedData = data;
		for (const middleware of this.globalMiddleware) {
			try {
				processedData = middleware(eventName, processedData) || processedData;
			} catch (error) {
				this.errorHandler(error, { eventName, middleware });
			}
		}

		// Execute listeners
		const listenersToRemove: string[] = [];
		const promises: Promise<void>[] = [];

		for (const listener of eventListeners) {
			try {
				// Apply filter if present
				if (listener.filter && !listener.filter(processedData)) {
					continue;
				}

				// Execute listener
				const result = listener.callback.call(listener.context, processedData);

				if (result instanceof Promise) {
					promises.push(
						result.catch((error) => {
							errors.push(error.message);
							this.errorHandler(error, { eventName, listenerId: listener.id });
						})
					);
				}

				// Mark for removal if it's a one-time listener
				if (listener.once) {
					listenersToRemove.push(listener.id);
				}
			} catch (error) {
				errors.push(error.message);
				this.errorHandler(error, { eventName, listenerId: listener.id });
			}
		}

		// Wait for all async listeners to complete
		await Promise.allSettled(promises);

		// Remove one-time listeners
		for (const listenerId of listenersToRemove) {
			this.off(eventName, listenerId);
		}

		// Record metrics and history
		const executionTime = performance.now() - startTime;
		this.updateMetrics(eventName, 'emitted', executionTime, errors.length);
		this.addToHistory(eventName, data, executionTime, eventListeners.length, errors);
	}

	/**
	 * Emit event synchronously
	 */
	emitSync<T = any>(eventName: string, data: T): void {
		const startTime = performance.now();
		const eventListeners = this.listeners.get(eventName) || [];
		const errors: string[] = [];

		// Apply global middleware
		let processedData = data;
		for (const middleware of this.globalMiddleware) {
			try {
				processedData = middleware(eventName, processedData) || processedData;
			} catch (error) {
				this.errorHandler(error, { eventName, middleware });
			}
		}

		// Execute listeners synchronously
		const listenersToRemove: string[] = [];

		for (const listener of eventListeners) {
			try {
				// Apply filter if present
				if (listener.filter && !listener.filter(processedData)) {
					continue;
				}

				// Execute listener synchronously
				const result = listener.callback.call(listener.context, processedData);

				// Warn if listener returns a promise
				if (result instanceof Promise) {
					console.warn(`Async listener detected in sync emit for event: ${eventName}`);
				}

				// Mark for removal if it's a one-time listener
				if (listener.once) {
					listenersToRemove.push(listener.id);
				}
			} catch (error) {
				errors.push(error.message);
				this.errorHandler(error, { eventName, listenerId: listener.id });
			}
		}

		// Remove one-time listeners
		for (const listenerId of listenersToRemove) {
			this.off(eventName, listenerId);
		}

		// Record metrics and history
		const executionTime = performance.now() - startTime;
		this.updateMetrics(eventName, 'emitted', executionTime, errors.length);
		this.addToHistory(eventName, data, executionTime, eventListeners.length, errors);
	}

	/**
	 * Add global middleware
	 */
	addMiddleware(middleware: (eventName: string, data: any) => any): void {
		this.globalMiddleware.push(middleware);
	}

	/**
	 * Remove global middleware
	 */
	removeMiddleware(middleware: (eventName: string, data: any) => any): void {
		const index = this.globalMiddleware.indexOf(middleware);
		if (index !== -1) {
			this.globalMiddleware.splice(index, 1);
		}
	}

	/**
	 * Get event metrics
	 */
	getMetrics(eventName?: string): EventMetrics | EventMetrics[] {
		if (eventName) {
			return this.metrics.get(eventName) || this.createDefaultMetrics(eventName);
		}
		return Array.from(this.metrics.values());
	}

	/**
	 * Get event history
	 */
	getHistory(eventName?: string, limit?: number): EventHistory[] {
		let history = eventName ? this.history.filter((h) => h.eventName === eventName) : this.history;

		if (limit) {
			history = history.slice(-limit);
		}

		return history;
	}

	/**
	 * Clear event history
	 */
	clearHistory(): void {
		this.history = [];
	}

	/**
	 * Get all event names
	 */
	getEventNames(): string[] {
		return Array.from(this.listeners.keys());
	}

	/**
	 * Get listener count for event
	 */
	getListenerCount(eventName: string): number {
		return this.listeners.get(eventName)?.length || 0;
	}

	/**
	 * Check if event has listeners
	 */
	hasListeners(eventName: string): boolean {
		return this.getListenerCount(eventName) > 0;
	}

	/**
	 * Remove all listeners
	 */
	removeAllListeners(): void {
		this.listeners.clear();
		this.metrics.clear();
		this.history = [];
	}

	/**
	 * Create event namespace
	 */
	namespace(prefix: string): EventNamespace {
		return new EventNamespace(this, prefix);
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Update metrics
	 */
	private updateMetrics(
		eventName: string,
		action: 'listener_added' | 'listener_removed' | 'all_listeners_removed' | 'emitted',
		executionTime?: number,
		errorCount?: number
	): void {
		let metrics = this.metrics.get(eventName);
		if (!metrics) {
			metrics = this.createDefaultMetrics(eventName);
			this.metrics.set(eventName, metrics);
		}

		switch (action) {
			case 'listener_added':
				metrics.totalListeners++;
				break;
			case 'listener_removed':
				metrics.totalListeners = Math.max(0, metrics.totalListeners - 1);
				break;
			case 'all_listeners_removed':
				metrics.totalListeners = 0;
				break;
			case 'emitted':
				metrics.totalEmissions++;
				metrics.lastEmitted = Date.now();
				if (executionTime !== undefined) {
					metrics.averageExecutionTime = (metrics.averageExecutionTime + executionTime) / 2;
				}
				if (errorCount !== undefined) {
					metrics.errorCount += errorCount;
				}
				break;
		}
	}

	/**
	 * Create default metrics
	 */
	private createDefaultMetrics(eventName: string): EventMetrics {
		return {
			eventName,
			totalEmissions: 0,
			totalListeners: 0,
			averageExecutionTime: 0,
			lastEmitted: 0,
			errorCount: 0
		};
	}

	/**
	 * Add to history
	 */
	private addToHistory(
		eventName: string,
		data: any,
		executionTime: number,
		listenerCount: number,
		errors: string[]
	): void {
		this.history.push({
			eventName,
			data,
			timestamp: Date.now(),
			executionTime,
			listenerCount,
			errors
		});

		// Trim history if it exceeds max size
		if (this.history.length > this.maxHistory) {
			this.history.shift();
		}
	}
}

/**
 * Event namespace for scoped events
 */
export class EventNamespace {
	constructor(
		private emitter: EventEmitter,
		private prefix: string
	) {}

	/**
	 * Add namespaced event listener
	 */
	on<T = any>(
		eventName: string,
		callback: (data: T) => void | Promise<void>,
		options: EventOptions = {}
	): string {
		return this.emitter.on(this.getFullEventName(eventName), callback, options);
	}

	/**
	 * Add one-time namespaced event listener
	 */
	once<T = any>(
		eventName: string,
		callback: (data: T) => void | Promise<void>,
		options: Omit<EventOptions, 'once'> = {}
	): string {
		return this.emitter.once(this.getFullEventName(eventName), callback, options);
	}

	/**
	 * Remove namespaced event listener
	 */
	off(eventName: string, listenerId?: string): boolean {
		return this.emitter.off(this.getFullEventName(eventName), listenerId);
	}

	/**
	 * Emit namespaced event
	 */
	async emit<T = any>(eventName: string, data: T): Promise<void> {
		return this.emitter.emit(this.getFullEventName(eventName), data);
	}

	/**
	 * Emit namespaced event synchronously
	 */
	emitSync<T = any>(eventName: string, data: T): void {
		return this.emitter.emitSync(this.getFullEventName(eventName), data);
	}

	/**
	 * Get full event name with namespace
	 */
	private getFullEventName(eventName: string): string {
		return `${this.prefix}:${eventName}`;
	}
}

/**
 * DOM event utilities
 */
export class DOMEventManager {
	private listeners: Map<string, EventListener[]> = new Map();
	private errorHandler = createErrorHandler('DOMEventManager');

	/**
	 * Add DOM event listener with enhanced features
	 */
	on<K extends keyof HTMLElementEventMap>(
		element: HTMLElement | Document | Window,
		eventType: K,
		callback: (event: HTMLElementEventMap[K]) => void,
		options: AddEventListenerOptions & EventOptions = {}
	): string {
		const listenerId = this.generateId();
		const eventKey = `${eventType}_${this.getElementKey(element)}`;

		const enhancedCallback = (event: Event) => {
			try {
				// Apply filter if present
				if (options.filter && !options.filter(event)) {
					return;
				}

				callback(event as HTMLElementEventMap[K]);

				// Remove if once
				if (options.once) {
					this.off(element, eventType, listenerId);
				}
			} catch (error) {
				this.errorHandler(error, { eventType, element, listenerId });
			}
		};

		// Add to DOM
		element.addEventListener(eventType, enhancedCallback, options);

		// Store reference
		const listener: EventListener = {
			id: listenerId,
			callback: enhancedCallback,
			once: options.once || false,
			priority: options.priority || 0,
			context: options.context
		};

		if (!this.listeners.has(eventKey)) {
			this.listeners.set(eventKey, []);
		}
		this.listeners.get(eventKey)!.push(listener);

		return listenerId;
	}

	/**
	 * Remove DOM event listener
	 */
	off<K extends keyof HTMLElementEventMap>(
		element: HTMLElement | Document | Window,
		eventType: K,
		listenerId: string
	): boolean {
		const eventKey = `${eventType}_${this.getElementKey(element)}`;
		const listeners = this.listeners.get(eventKey);

		if (!listeners) return false;

		const index = listeners.findIndex((l) => l.id === listenerId);
		if (index !== -1) {
			const listener = listeners[index];
			element.removeEventListener(eventType, listener.callback as EventListener);
			listeners.splice(index, 1);
			return true;
		}

		return false;
	}

	/**
	 * Remove all listeners for element
	 */
	removeAllListeners(element: HTMLElement | Document | Window): void {
		const elementKey = this.getElementKey(element);
		const keysToRemove: string[] = [];

		for (const [eventKey, listeners] of this.listeners) {
			if (eventKey.endsWith(`_${elementKey}`)) {
				const eventType = eventKey.split('_')[0];

				// Remove all listeners from DOM
				for (const listener of listeners) {
					element.removeEventListener(eventType, listener.callback as EventListener);
				}

				keysToRemove.push(eventKey);
			}
		}

		// Remove from storage
		keysToRemove.forEach((key) => this.listeners.delete(key));
	}

	/**
	 * Generate unique element key
	 */
	private getElementKey(element: HTMLElement | Document | Window): string {
		if (element === document) return 'document';
		if (element === window) return 'window';

		const htmlElement = element as HTMLElement;
		return htmlElement.id || htmlElement.tagName.toLowerCase() + '_' + Date.now();
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `dom_listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Cleanup all listeners
	 */
	cleanup(): void {
		this.listeners.clear();
	}
}

/**
 * Event bus for cross-component communication
 */
export class EventBus extends EventEmitter {
	private static instance: EventBus;

	static getInstance(): EventBus {
		if (!EventBus.instance) {
			EventBus.instance = new EventBus();
		}
		return EventBus.instance;
	}

	/**
	 * Subscribe to global events
	 */
	static on<T = any>(
		eventName: string,
		callback: (data: T) => void | Promise<void>,
		options: EventOptions = {}
	): string {
		return EventBus.getInstance().on(eventName, callback, options);
	}

	/**
	 * Emit global event
	 */
	static async emit<T = any>(eventName: string, data: T): Promise<void> {
		return EventBus.getInstance().emit(eventName, data);
	}

	/**
	 * Remove global event listener
	 */
	static off(eventName: string, listenerId?: string): boolean {
		return EventBus.getInstance().off(eventName, listenerId);
	}
}

/**
 * Global instances
 */
export const eventEmitter = new EventEmitter();
export const domEventManager = new DOMEventManager();
export const eventBus = EventBus.getInstance();

/**
 * Event utilities
 */
export const EventUtils = {
	/**
	 * Debounce event emissions
	 */
	debounce<T>(emitter: EventEmitter, eventName: string, delay: number): (data: T) => void {
		let timeoutId: NodeJS.Timeout;

		return (data: T) => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				emitter.emit(eventName, data);
			}, delay);
		};
	},

	/**
	 * Throttle event emissions
	 */
	throttle<T>(emitter: EventEmitter, eventName: string, delay: number): (data: T) => void {
		let lastEmit = 0;

		return (data: T) => {
			const now = Date.now();
			if (now - lastEmit >= delay) {
				emitter.emit(eventName, data);
				lastEmit = now;
			}
		};
	},

	/**
	 * Create event logger middleware
	 */
	createLogger(prefix: string = 'EVENT'): (eventName: string, data: any) => any {
		return (eventName: string, data: any) => {
			console.log(`[${prefix}] ${eventName}:`, data);
			return data;
		};
	},

	/**
	 * Create event validator middleware
	 */
	createValidator(
		schema: Record<string, (data: any) => boolean>
	): (eventName: string, data: any) => any {
		return (eventName: string, data: any) => {
			const validator = schema[eventName];
			if (validator && !validator(data)) {
				throw new Error(`Invalid data for event: ${eventName}`);
			}
			return data;
		};
	}
};

/**
 * Browser event helpers
 */
export const BrowserEvents = {
	/**
	 * Listen for page visibility changes
	 */
	onVisibilityChange(callback: (isVisible: boolean) => void): () => void {
		if (!browser) return () => {};

		const handleVisibilityChange = () => {
			callback(!document.hidden);
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	},

	/**
	 * Listen for online/offline changes
	 */
	onConnectionChange(callback: (isOnline: boolean) => void): () => void {
		if (!browser) return () => {};

		const handleOnline = () => callback(true);
		const handleOffline = () => callback(false);

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	},

	/**
	 * Listen for window resize
	 */
	onResize(callback: (size: { width: number; height: number }) => void): () => void {
		if (!browser) return () => {};

		const handleResize = () => {
			callback({
				width: window.innerWidth,
				height: window.innerHeight
			});
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}
};
