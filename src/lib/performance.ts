import { browser } from '$app/environment';
import { createErrorHandler } from './utils';

export interface PerformanceMetric {
	name: string;
	value: number;
	timestamp: number;
	category: 'timing' | 'memory' | 'navigation' | 'custom';
	unit: 'ms' | 'bytes' | 'count' | 'percent';
}

export interface PerformanceProfile {
	id: string;
	name: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	metrics: PerformanceMetric[];
	children: PerformanceProfile[];
	parent?: PerformanceProfile;
}

export interface PerformanceBudget {
	metric: string;
	threshold: number;
	unit: string;
	severity: 'warning' | 'error';
}

export interface PerformanceAlert {
	metric: string;
	value: number;
	threshold: number;
	severity: 'warning' | 'error';
	timestamp: number;
	message: string;
}

export interface DeviceCapabilities {
	deviceMemory: number;
	hardwareConcurrency: number;
	connection: {
		effectiveType: string;
		downlink: number;
		rtt: number;
		saveData: boolean;
	};
	performance: {
		level: 'high' | 'medium' | 'low';
		score: number;
	};
}

/**
 * Comprehensive performance monitoring system
 */
export class PerformanceMonitor {
	private profiles: Map<string, PerformanceProfile> = new Map();
	private metrics: PerformanceMetric[] = [];
	private budgets: PerformanceBudget[] = [];
	private alerts: PerformanceAlert[] = [];
	private observer: PerformanceObserver | null = null;
	private errorHandler = createErrorHandler('PerformanceMonitor');
	private isEnabled = true;
	private maxMetrics = 1000;
	private maxAlerts = 100;

	constructor() {
		this.setupPerformanceObserver();
		this.setupMemoryMonitoring();
		this.setupNetworkMonitoring();
	}

	/**
	 * Setup performance observer
	 */
	private setupPerformanceObserver(): void {
		if (!browser || !window.PerformanceObserver) return;

		try {
			this.observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					this.processPerformanceEntry(entry);
				}
			});

			// Observe all available entry types
			const availableTypes = ['navigation', 'resource', 'paint', 'measure', 'mark'];
			for (const type of availableTypes) {
				try {
					this.observer.observe({ entryTypes: [type] });
				} catch (error) {
					// Some types might not be supported
				}
			}
		} catch (error) {
			this.errorHandler(error, { context: 'setupPerformanceObserver' });
		}
	}

	/**
	 * Setup memory monitoring
	 */
	private setupMemoryMonitoring(): void {
		if (!browser) return;

		const checkMemory = () => {
			const memory = (performance as any).memory;
			if (memory) {
				this.recordMetric('memory.used', memory.usedJSHeapSize, 'memory', 'bytes');
				this.recordMetric('memory.total', memory.totalJSHeapSize, 'memory', 'bytes');
				this.recordMetric('memory.limit', memory.jsHeapSizeLimit, 'memory', 'bytes');

				// Calculate memory usage percentage
				const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
				this.recordMetric('memory.usage_percent', usagePercent, 'memory', 'percent');
			}
		};

		// Check memory every 10 seconds
		setInterval(checkMemory, 10000);
		checkMemory(); // Initial check
	}

	/**
	 * Setup network monitoring
	 */
	private setupNetworkMonitoring(): void {
		if (!browser) return;

		const connection = (navigator as any).connection;
		if (connection) {
			this.recordMetric('network.downlink', connection.downlink, 'custom', 'count');
			this.recordMetric('network.rtt', connection.rtt, 'timing', 'ms');

			connection.addEventListener('change', () => {
				this.recordMetric('network.downlink', connection.downlink, 'custom', 'count');
				this.recordMetric('network.rtt', connection.rtt, 'timing', 'ms');
			});
		}
	}

	/**
	 * Process performance entry
	 */
	private processPerformanceEntry(entry: PerformanceEntry): void {
		if (!this.isEnabled) return;

		try {
			switch (entry.entryType) {
				case 'navigation':
					this.processNavigationEntry(entry as PerformanceNavigationTiming);
					break;
				case 'resource':
					this.processResourceEntry(entry as PerformanceResourceTiming);
					break;
				case 'paint':
					this.processPaintEntry(entry as PerformancePaintTiming);
					break;
				case 'measure':
					this.processMeasureEntry(entry as PerformanceMeasure);
					break;
				case 'mark':
					this.processMarkEntry(entry as PerformanceMark);
					break;
			}
		} catch (error) {
			this.errorHandler(error, { entry });
		}
	}

	/**
	 * Process navigation entry
	 */
	private processNavigationEntry(entry: PerformanceNavigationTiming): void {
		const metrics = [
			{ name: 'navigation.dns_lookup', value: entry.domainLookupEnd - entry.domainLookupStart },
			{ name: 'navigation.tcp_connect', value: entry.connectEnd - entry.connectStart },
			{ name: 'navigation.request', value: entry.responseStart - entry.requestStart },
			{ name: 'navigation.response', value: entry.responseEnd - entry.responseStart },
			{ name: 'navigation.dom_processing', value: entry.domComplete - entry.domLoading },
			{ name: 'navigation.load_complete', value: entry.loadEventEnd - entry.loadEventStart },
			{ name: 'navigation.ttfb', value: entry.responseStart - entry.requestStart },
			{ name: 'navigation.total', value: entry.loadEventEnd - entry.fetchStart }
		];

		for (const metric of metrics) {
			this.recordMetric(metric.name, metric.value, 'navigation', 'ms');
		}
	}

	/**
	 * Process resource entry
	 */
	private processResourceEntry(entry: PerformanceResourceTiming): void {
		const size = (entry as any).transferSize || 0;
		const duration = entry.responseEnd - entry.startTime;

		this.recordMetric('resource.load_time', duration, 'timing', 'ms');
		if (size > 0) {
			this.recordMetric('resource.size', size, 'custom', 'bytes');
		}

		// Track by resource type
		if (entry.initiatorType) {
			this.recordMetric(`resource.${entry.initiatorType}.load_time`, duration, 'timing', 'ms');
		}
	}

	/**
	 * Process paint entry
	 */
	private processPaintEntry(entry: PerformancePaintTiming): void {
		this.recordMetric(`paint.${entry.name}`, entry.startTime, 'timing', 'ms');
	}

	/**
	 * Process measure entry
	 */
	private processMeasureEntry(entry: PerformanceMeasure): void {
		this.recordMetric(`measure.${entry.name}`, entry.duration, 'timing', 'ms');
	}

	/**
	 * Process mark entry
	 */
	private processMarkEntry(entry: PerformanceMark): void {
		this.recordMetric(`mark.${entry.name}`, entry.startTime, 'timing', 'ms');
	}

	/**
	 * Record custom metric
	 */
	recordMetric(
		name: string,
		value: number,
		category: PerformanceMetric['category'] = 'custom',
		unit: PerformanceMetric['unit'] = 'ms'
	): void {
		if (!this.isEnabled) return;

		const metric: PerformanceMetric = {
			name,
			value,
			timestamp: Date.now(),
			category,
			unit
		};

		this.metrics.push(metric);

		// Trim metrics if exceeding max
		if (this.metrics.length > this.maxMetrics) {
			this.metrics.shift();
		}

		// Check against budgets
		this.checkBudgets(metric);
	}

	/**
	 * Start performance profile
	 */
	startProfile(name: string, parent?: string): string {
		const id = this.generateId();
		const profile: PerformanceProfile = {
			id,
			name,
			startTime: performance.now(),
			metrics: [],
			children: []
		};

		if (parent) {
			const parentProfile = this.profiles.get(parent);
			if (parentProfile) {
				profile.parent = parentProfile;
				parentProfile.children.push(profile);
			}
		}

		this.profiles.set(id, profile);
		return id;
	}

	/**
	 * End performance profile
	 */
	endProfile(id: string): PerformanceProfile | null {
		const profile = this.profiles.get(id);
		if (!profile) return null;

		profile.endTime = performance.now();
		profile.duration = profile.endTime - profile.startTime;

		this.recordMetric(`profile.${profile.name}`, profile.duration, 'timing', 'ms');

		return profile;
	}

	/**
	 * Set performance budget
	 */
	setBudget(
		metric: string,
		threshold: number,
		unit: string,
		severity: 'warning' | 'error' = 'warning'
	): void {
		const existingIndex = this.budgets.findIndex((b) => b.metric === metric);
		const budget: PerformanceBudget = { metric, threshold, unit, severity };

		if (existingIndex !== -1) {
			this.budgets[existingIndex] = budget;
		} else {
			this.budgets.push(budget);
		}
	}

	/**
	 * Check budgets against metric
	 */
	private checkBudgets(metric: PerformanceMetric): void {
		const budget = this.budgets.find((b) => b.metric === metric.name);
		if (!budget) return;

		if (metric.value > budget.threshold) {
			const alert: PerformanceAlert = {
				metric: metric.name,
				value: metric.value,
				threshold: budget.threshold,
				severity: budget.severity,
				timestamp: Date.now(),
				message: `${metric.name} exceeded budget: ${metric.value}${metric.unit} > ${budget.threshold}${budget.unit}`
			};

			this.alerts.push(alert);

			// Trim alerts if exceeding max
			if (this.alerts.length > this.maxAlerts) {
				this.alerts.shift();
			}

			// Emit alert event
			if (browser) {
				window.dispatchEvent(new CustomEvent('performance-alert', { detail: alert }));
			}
		}
	}

	/**
	 * Get metrics
	 */
	getMetrics(filter?: {
		name?: string;
		category?: string;
		since?: number;
		limit?: number;
	}): PerformanceMetric[] {
		let filtered = this.metrics;

		if (filter) {
			if (filter.name) {
				filtered = filtered.filter((m) => m.name.includes(filter.name!));
			}
			if (filter.category) {
				filtered = filtered.filter((m) => m.category === filter.category);
			}
			if (filter.since) {
				filtered = filtered.filter((m) => m.timestamp >= filter.since!);
			}
			if (filter.limit) {
				filtered = filtered.slice(-filter.limit);
			}
		}

		return filtered;
	}

	/**
	 * Get metric statistics
	 */
	getMetricStats(metricName: string): {
		count: number;
		min: number;
		max: number;
		avg: number;
		median: number;
		p95: number;
		p99: number;
	} | null {
		const metrics = this.metrics.filter((m) => m.name === metricName);
		if (metrics.length === 0) return null;

		const values = metrics.map((m) => m.value).sort((a, b) => a - b);
		const count = values.length;
		const min = values[0];
		const max = values[count - 1];
		const avg = values.reduce((sum, val) => sum + val, 0) / count;
		const median = values[Math.floor(count / 2)];
		const p95 = values[Math.floor(count * 0.95)];
		const p99 = values[Math.floor(count * 0.99)];

		return { count, min, max, avg, median, p95, p99 };
	}

	/**
	 * Get alerts
	 */
	getAlerts(severity?: 'warning' | 'error'): PerformanceAlert[] {
		return severity ? this.alerts.filter((a) => a.severity === severity) : this.alerts;
	}

	/**
	 * Clear alerts
	 */
	clearAlerts(): void {
		this.alerts = [];
	}

	/**
	 * Generate report
	 */
	generateReport(): {
		summary: any;
		metrics: PerformanceMetric[];
		alerts: PerformanceAlert[];
		profiles: PerformanceProfile[];
	} {
		const summary = {
			totalMetrics: this.metrics.length,
			totalAlerts: this.alerts.length,
			totalProfiles: this.profiles.size,
			memoryUsage: this.getLatestMetric('memory.usage_percent'),
			avgLoadTime: this.getMetricStats('resource.load_time')?.avg || 0,
			timestamp: Date.now()
		};

		return {
			summary,
			metrics: this.metrics,
			alerts: this.alerts,
			profiles: Array.from(this.profiles.values())
		};
	}

	/**
	 * Get latest metric value
	 */
	private getLatestMetric(name: string): number | null {
		const metrics = this.metrics.filter((m) => m.name === name);
		return metrics.length > 0 ? metrics[metrics.length - 1].value : null;
	}

	/**
	 * Enable/disable monitoring
	 */
	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
	}

	/**
	 * Clear all data
	 */
	clear(): void {
		this.metrics = [];
		this.alerts = [];
		this.profiles.clear();
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		if (this.observer) {
			this.observer.disconnect();
		}
	}
}

/**
 * Device capability detection
 */
export class DeviceCapabilityDetector {
	private capabilities: DeviceCapabilities | null = null;

	/**
	 * Detect device capabilities
	 */
	async detect(): Promise<DeviceCapabilities> {
		if (this.capabilities) {
			return this.capabilities;
		}

		const deviceMemory = (navigator as any).deviceMemory || 4;
		const hardwareConcurrency = navigator.hardwareConcurrency || 4;
		const connection = (navigator as any).connection || {};

		// Run performance benchmark
		const performanceScore = await this.runPerformanceBenchmark();

		this.capabilities = {
			deviceMemory,
			hardwareConcurrency,
			connection: {
				effectiveType: connection.effectiveType || 'unknown',
				downlink: connection.downlink || 0,
				rtt: connection.rtt || 0,
				saveData: connection.saveData || false
			},
			performance: {
				level: this.getPerformanceLevel(performanceScore, deviceMemory, hardwareConcurrency),
				score: performanceScore
			}
		};

		return this.capabilities;
	}

	/**
	 * Run performance benchmark
	 */
	private async runPerformanceBenchmark(): Promise<number> {
		if (!browser) return 50;

		const benchmarks = [
			this.benchmarkCPU(),
			this.benchmarkMemory(),
			this.benchmarkDOM(),
			this.benchmarkGraphics()
		];

		const results = await Promise.all(benchmarks);
		return results.reduce((sum, score) => sum + score, 0) / results.length;
	}

	/**
	 * CPU benchmark
	 */
	private benchmarkCPU(): Promise<number> {
		return new Promise((resolve) => {
			const start = performance.now();
			let iterations = 0;

			const compute = () => {
				for (let i = 0; i < 100000; i++) {
					Math.random() * Math.random();
				}
				iterations++;

				if (performance.now() - start < 100) {
					setTimeout(compute, 0);
				} else {
					resolve(Math.min(100, iterations));
				}
			};

			compute();
		});
	}

	/**
	 * Memory benchmark
	 */
	private benchmarkMemory(): Promise<number> {
		return new Promise((resolve) => {
			const start = performance.now();
			const arrays: number[][] = [];

			try {
				for (let i = 0; i < 1000; i++) {
					arrays.push(new Array(1000).fill(Math.random()));
				}

				const duration = performance.now() - start;
				resolve(Math.max(0, 100 - duration));
			} catch (error) {
				resolve(0);
			}
		});
	}

	/**
	 * DOM benchmark
	 */
	private benchmarkDOM(): Promise<number> {
		return new Promise((resolve) => {
			const start = performance.now();
			const container = document.createElement('div');
			container.style.position = 'absolute';
			container.style.left = '-9999px';
			document.body.appendChild(container);

			try {
				for (let i = 0; i < 1000; i++) {
					const element = document.createElement('div');
					element.textContent = `Element ${i}`;
					element.style.backgroundColor = `hsl(${i % 360}, 50%, 50%)`;
					container.appendChild(element);
				}

				const duration = performance.now() - start;
				document.body.removeChild(container);
				resolve(Math.max(0, 100 - duration));
			} catch (error) {
				resolve(0);
			}
		});
	}

	/**
	 * Graphics benchmark
	 */
	private benchmarkGraphics(): Promise<number> {
		return new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			canvas.width = 100;
			canvas.height = 100;
			const ctx = canvas.getContext('2d');

			if (!ctx) {
				resolve(0);
				return;
			}

			const start = performance.now();

			try {
				for (let i = 0; i < 1000; i++) {
					ctx.fillStyle = `hsl(${i % 360}, 50%, 50%)`;
					ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 10, 10);
				}

				const duration = performance.now() - start;
				resolve(Math.max(0, 100 - duration));
			} catch (error) {
				resolve(0);
			}
		});
	}

	/**
	 * Get performance level
	 */
	private getPerformanceLevel(
		score: number,
		deviceMemory: number,
		hardwareConcurrency: number
	): 'high' | 'medium' | 'low' {
		if (score > 80 && deviceMemory >= 8 && hardwareConcurrency >= 8) {
			return 'high';
		} else if (score > 40 && deviceMemory >= 4 && hardwareConcurrency >= 4) {
			return 'medium';
		} else {
			return 'low';
		}
	}
}

/**
 * Performance utilities
 */
export class PerformanceUtils {
	/**
	 * Measure function execution time
	 */
	static async measureAsync<T>(
		fn: () => Promise<T>,
		name?: string
	): Promise<{ result: T; duration: number }> {
		const start = performance.now();

		if (name) {
			performance.mark(`${name}-start`);
		}

		const result = await fn();

		const duration = performance.now() - start;

		if (name) {
			performance.mark(`${name}-end`);
			performance.measure(name, `${name}-start`, `${name}-end`);
		}

		return { result, duration };
	}

	/**
	 * Measure synchronous function execution time
	 */
	static measure<T>(fn: () => T, name?: string): { result: T; duration: number } {
		const start = performance.now();

		if (name) {
			performance.mark(`${name}-start`);
		}

		const result = fn();

		const duration = performance.now() - start;

		if (name) {
			performance.mark(`${name}-end`);
			performance.measure(name, `${name}-start`, `${name}-end`);
		}

		return { result, duration };
	}

	/**
	 * Create performance-aware wrapper
	 */
	static createWrapper<T extends (...args: any[]) => any>(
		fn: T,
		name: string,
		threshold: number = 16
	): T {
		return ((...args: any[]) => {
			const { result, duration } = PerformanceUtils.measure(() => fn(...args), name);

			if (duration > threshold) {
				console.warn(`Slow function detected: ${name} took ${duration.toFixed(2)}ms`);
			}

			return result;
		}) as T;
	}
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Global device capability detector
 */
export const deviceCapabilityDetector = new DeviceCapabilityDetector();
