import { browser } from '$app/environment';
import { rafThrottle } from './utils';

export interface AnimationConfig {
	duration: number;
	easing: EasingFunction;
	delay?: number;
	iterations?: number;
	direction?: 'normal' | 'reverse' | 'alternate';
	fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
}

export interface AnimationFrame {
	progress: number;
	value: number;
	timestamp: number;
}

export interface AnimationState {
	isRunning: boolean;
	isPaused: boolean;
	startTime: number;
	pausedTime: number;
	currentIteration: number;
	direction: 'forward' | 'backward';
}

export type EasingFunction = (t: number) => number;

export interface SpringConfig {
	stiffness: number;
	damping: number;
	mass: number;
	precision: number;
}

export interface SpringState {
	value: number;
	velocity: number;
	target: number;
}

/**
 * Comprehensive easing functions
 */
export const Easing = {
	// Linear
	linear: (t: number): number => t,

	// Quadratic
	easeInQuad: (t: number): number => t * t,
	easeOutQuad: (t: number): number => t * (2 - t),
	easeInOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

	// Cubic
	easeInCubic: (t: number): number => t * t * t,
	easeOutCubic: (t: number): number => --t * t * t + 1,
	easeInOutCubic: (t: number): number =>
		t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

	// Quartic
	easeInQuart: (t: number): number => t * t * t * t,
	easeOutQuart: (t: number): number => 1 - --t * t * t * t,
	easeInOutQuart: (t: number): number => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t),

	// Quintic
	easeInQuint: (t: number): number => t * t * t * t * t,
	easeOutQuint: (t: number): number => 1 + --t * t * t * t * t,
	easeInOutQuint: (t: number): number =>
		t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t,

	// Sinusoidal
	easeInSine: (t: number): number => 1 - Math.cos((t * Math.PI) / 2),
	easeOutSine: (t: number): number => Math.sin((t * Math.PI) / 2),
	easeInOutSine: (t: number): number => 0.5 * (1 - Math.cos(Math.PI * t)),

	// Exponential
	easeInExpo: (t: number): number => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
	easeOutExpo: (t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
	easeInOutExpo: (t: number): number => {
		if (t === 0) return 0;
		if (t === 1) return 1;
		if (t < 0.5) return 0.5 * Math.pow(2, 10 * (2 * t - 1));
		return 0.5 * (2 - Math.pow(2, -10 * (2 * t - 1)));
	},

	// Circular
	easeInCirc: (t: number): number => 1 - Math.sqrt(1 - t * t),
	easeOutCirc: (t: number): number => Math.sqrt(1 - --t * t),
	easeInOutCirc: (t: number): number =>
		t < 0.5
			? 0.5 * (1 - Math.sqrt(1 - 4 * t * t))
			: 0.5 * (Math.sqrt(1 - (t * 2 - 2) * (t * 2 - 2)) + 1),

	// Elastic
	easeInElastic: (t: number): number => {
		if (t === 0) return 0;
		if (t === 1) return 1;
		const c4 = (2 * Math.PI) / 3;
		return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
	},
	easeOutElastic: (t: number): number => {
		if (t === 0) return 0;
		if (t === 1) return 1;
		const c4 = (2 * Math.PI) / 3;
		return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
	},
	easeInOutElastic: (t: number): number => {
		if (t === 0) return 0;
		if (t === 1) return 1;
		const c5 = (2 * Math.PI) / 4.5;
		return t < 0.5
			? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
			: (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
	},

	// Back
	easeInBack: (t: number): number => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return c3 * t * t * t - c1 * t * t;
	},
	easeOutBack: (t: number): number => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	},
	easeInOutBack: (t: number): number => {
		const c1 = 1.70158;
		const c2 = c1 * 1.525;
		return t < 0.5
			? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
			: (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
	},

	// Bounce
	easeInBounce: (t: number): number => 1 - Easing.easeOutBounce(1 - t),
	easeOutBounce: (t: number): number => {
		const n1 = 7.5625;
		const d1 = 2.75;

		if (t < 1 / d1) {
			return n1 * t * t;
		} else if (t < 2 / d1) {
			return n1 * (t -= 1.5 / d1) * t + 0.75;
		} else if (t < 2.5 / d1) {
			return n1 * (t -= 2.25 / d1) * t + 0.9375;
		} else {
			return n1 * (t -= 2.625 / d1) * t + 0.984375;
		}
	},
	easeInOutBounce: (t: number): number =>
		t < 0.5 ? (1 - Easing.easeOutBounce(1 - 2 * t)) / 2 : (1 + Easing.easeOutBounce(2 * t - 1)) / 2,

	// Custom bezier curve
	bezier: (x1: number, y1: number, x2: number, y2: number) => {
		return (t: number): number => {
			// Cubic bezier approximation
			const cx = 3 * x1;
			const bx = 3 * (x2 - x1) - cx;
			const ax = 1 - cx - bx;

			const cy = 3 * y1;
			const by = 3 * (y2 - y1) - cy;
			const ay = 1 - cy - by;

			return ((ax * t + bx) * t + cx) * t;
		};
	}
};

/**
 * Animation class for smooth value transitions
 */
export class Animation {
	private config: AnimationConfig;
	private state: AnimationState;
	private startValue: number;
	private endValue: number;
	private currentValue: number;
	private callbacks: {
		onUpdate?: (frame: AnimationFrame) => void;
		onComplete?: () => void;
		onStart?: () => void;
	} = {};
	private animationId: number | null = null;

	constructor(config: AnimationConfig) {
		this.config = {
			delay: 0,
			iterations: 1,
			direction: 'normal',
			fillMode: 'none',
			...config
		};

		this.state = {
			isRunning: false,
			isPaused: false,
			startTime: 0,
			pausedTime: 0,
			currentIteration: 0,
			direction: 'forward'
		};

		this.startValue = 0;
		this.endValue = 0;
		this.currentValue = 0;
	}

	/**
	 * Start animation from start value to end value
	 */
	fromTo(startValue: number, endValue: number): Animation {
		this.startValue = startValue;
		this.endValue = endValue;
		this.currentValue = startValue;
		return this;
	}

	/**
	 * Start animation from current value to end value
	 */
	to(endValue: number): Animation {
		this.endValue = endValue;
		return this;
	}

	/**
	 * Set animation callbacks
	 */
	onUpdate(callback: (frame: AnimationFrame) => void): Animation {
		this.callbacks.onUpdate = callback;
		return this;
	}

	onComplete(callback: () => void): Animation {
		this.callbacks.onComplete = callback;
		return this;
	}

	onStart(callback: () => void): Animation {
		this.callbacks.onStart = callback;
		return this;
	}

	/**
	 * Start the animation
	 */
	start(): Animation {
		if (this.state.isRunning) return this;

		this.state.isRunning = true;
		this.state.isPaused = false;
		this.state.startTime = performance.now() + (this.config.delay || 0);
		this.state.currentIteration = 0;
		this.state.direction = 'forward';

		if (this.callbacks.onStart) {
			this.callbacks.onStart();
		}

		this.animate();
		return this;
	}

	/**
	 * Pause the animation
	 */
	pause(): Animation {
		if (!this.state.isRunning || this.state.isPaused) return this;

		this.state.isPaused = true;
		this.state.pausedTime = performance.now();

		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		return this;
	}

	/**
	 * Resume the animation
	 */
	resume(): Animation {
		if (!this.state.isRunning || !this.state.isPaused) return this;

		this.state.isPaused = false;
		this.state.startTime += performance.now() - this.state.pausedTime;

		this.animate();
		return this;
	}

	/**
	 * Stop the animation
	 */
	stop(): Animation {
		this.state.isRunning = false;
		this.state.isPaused = false;

		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		return this;
	}

	/**
	 * Main animation loop
	 */
	private animate = (): void => {
		if (!this.state.isRunning || this.state.isPaused) return;

		const now = performance.now();
		const elapsed = now - this.state.startTime;
		const iterationDuration = this.config.duration;

		if (elapsed < 0) {
			// Still in delay period
			this.animationId = requestAnimationFrame(this.animate);
			return;
		}

		// Calculate progress within current iteration
		const iterationProgress = Math.min(elapsed / iterationDuration, 1);

		// Apply easing
		const easedProgress = this.config.easing(iterationProgress);

		// Calculate current value based on direction
		let progress = easedProgress;
		if (this.state.direction === 'backward') {
			progress = 1 - easedProgress;
		}

		this.currentValue = this.startValue + (this.endValue - this.startValue) * progress;

		// Call update callback
		if (this.callbacks.onUpdate) {
			this.callbacks.onUpdate({
				progress: iterationProgress,
				value: this.currentValue,
				timestamp: now
			});
		}

		// Check if iteration is complete
		if (iterationProgress >= 1) {
			this.handleIterationComplete();
		} else {
			this.animationId = requestAnimationFrame(this.animate);
		}
	};

	/**
	 * Handle iteration completion
	 */
	private handleIterationComplete(): void {
		this.state.currentIteration++;

		// Check if all iterations are complete
		if (this.state.currentIteration >= (this.config.iterations || 1)) {
			this.handleAnimationComplete();
			return;
		}

		// Handle direction for next iteration
		if (this.config.direction === 'alternate') {
			this.state.direction = this.state.direction === 'forward' ? 'backward' : 'forward';
		}

		// Reset for next iteration
		this.state.startTime = performance.now();
		this.animationId = requestAnimationFrame(this.animate);
	}

	/**
	 * Handle animation completion
	 */
	private handleAnimationComplete(): void {
		this.state.isRunning = false;

		// Apply fill mode
		if (this.config.fillMode === 'forwards' || this.config.fillMode === 'both') {
			// Keep final value
		} else if (this.config.fillMode === 'backwards' || this.config.fillMode === 'both') {
			this.currentValue = this.startValue;
		}

		if (this.callbacks.onComplete) {
			this.callbacks.onComplete();
		}
	}

	/**
	 * Get current animation value
	 */
	getValue(): number {
		return this.currentValue;
	}

	/**
	 * Get animation progress (0-1)
	 */
	getProgress(): number {
		if (!this.state.isRunning) return 0;

		const elapsed = performance.now() - this.state.startTime;
		return Math.min(elapsed / this.config.duration, 1);
	}

	/**
	 * Check if animation is running
	 */
	isRunning(): boolean {
		return this.state.isRunning;
	}
}

/**
 * Spring animation system for natural motion
 */
export class SpringAnimation {
	private config: SpringConfig;
	private state: SpringState;
	private isRunning = false;
	private animationId: number | null = null;
	private callbacks: {
		onUpdate?: (value: number) => void;
		onComplete?: () => void;
	} = {};

	constructor(config: Partial<SpringConfig> = {}) {
		this.config = {
			stiffness: 0.15,
			damping: 0.8,
			mass: 1,
			precision: 0.01,
			...config
		};

		this.state = {
			value: 0,
			velocity: 0,
			target: 0
		};
	}

	/**
	 * Set spring target value
	 */
	setTarget(target: number): SpringAnimation {
		this.state.target = target;

		if (!this.isRunning) {
			this.start();
		}

		return this;
	}

	/**
	 * Set current value
	 */
	setValue(value: number): SpringAnimation {
		this.state.value = value;
		return this;
	}

	/**
	 * Set callbacks
	 */
	onUpdate(callback: (value: number) => void): SpringAnimation {
		this.callbacks.onUpdate = callback;
		return this;
	}

	onComplete(callback: () => void): SpringAnimation {
		this.callbacks.onComplete = callback;
		return this;
	}

	/**
	 * Start spring animation
	 */
	private start(): void {
		if (this.isRunning) return;

		this.isRunning = true;
		this.animate();
	}

	/**
	 * Spring animation loop
	 */
	private animate = (): void => {
		if (!this.isRunning) return;

		const deltaTime = 1 / 60; // Assume 60fps

		// Spring physics calculation
		const displacement = this.state.value - this.state.target;
		const springForce = -this.config.stiffness * displacement;
		const dampingForce = -this.config.damping * this.state.velocity;
		const acceleration = (springForce + dampingForce) / this.config.mass;

		// Update velocity and position
		this.state.velocity += acceleration * deltaTime;
		this.state.value += this.state.velocity * deltaTime;

		// Call update callback
		if (this.callbacks.onUpdate) {
			this.callbacks.onUpdate(this.state.value);
		}

		// Check if spring has settled
		if (
			Math.abs(displacement) < this.config.precision &&
			Math.abs(this.state.velocity) < this.config.precision
		) {
			this.state.value = this.state.target;
			this.state.velocity = 0;
			this.isRunning = false;

			if (this.callbacks.onComplete) {
				this.callbacks.onComplete();
			}
		} else {
			this.animationId = requestAnimationFrame(this.animate);
		}
	};

	/**
	 * Stop animation
	 */
	stop(): SpringAnimation {
		this.isRunning = false;

		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		return this;
	}

	/**
	 * Get current value
	 */
	getValue(): number {
		return this.state.value;
	}
}

/**
 * Animation sequence manager
 */
export class AnimationSequence {
	private animations: Animation[] = [];
	private currentIndex = 0;
	private isRunning = false;
	private callbacks: {
		onComplete?: () => void;
		onStepComplete?: (index: number) => void;
	} = {};

	/**
	 * Add animation to sequence
	 */
	add(animation: Animation): AnimationSequence {
		this.animations.push(animation);
		return this;
	}

	/**
	 * Set callbacks
	 */
	onComplete(callback: () => void): AnimationSequence {
		this.callbacks.onComplete = callback;
		return this;
	}

	onStepComplete(callback: (index: number) => void): AnimationSequence {
		this.callbacks.onStepComplete = callback;
		return this;
	}

	/**
	 * Start sequence
	 */
	start(): AnimationSequence {
		if (this.isRunning || this.animations.length === 0) return this;

		this.isRunning = true;
		this.currentIndex = 0;
		this.runCurrentAnimation();

		return this;
	}

	/**
	 * Stop sequence
	 */
	stop(): AnimationSequence {
		this.isRunning = false;

		if (this.currentIndex < this.animations.length) {
			this.animations[this.currentIndex].stop();
		}

		return this;
	}

	/**
	 * Run current animation in sequence
	 */
	private runCurrentAnimation(): void {
		if (!this.isRunning || this.currentIndex >= this.animations.length) {
			this.handleSequenceComplete();
			return;
		}

		const animation = this.animations[this.currentIndex];

		animation.onComplete(() => {
			if (this.callbacks.onStepComplete) {
				this.callbacks.onStepComplete(this.currentIndex);
			}

			this.currentIndex++;
			this.runCurrentAnimation();
		});

		animation.start();
	}

	/**
	 * Handle sequence completion
	 */
	private handleSequenceComplete(): void {
		this.isRunning = false;

		if (this.callbacks.onComplete) {
			this.callbacks.onComplete();
		}
	}
}

/**
 * Utility functions for common animations
 */
export const AnimationUtils = {
	/**
	 * Fade in animation
	 */
	fadeIn(element: HTMLElement, duration: number = 300): Animation {
		return new Animation({
			duration,
			easing: Easing.easeOutQuad
		})
			.fromTo(0, 1)
			.onUpdate((frame) => {
				element.style.opacity = frame.value.toString();
			});
	},

	/**
	 * Fade out animation
	 */
	fadeOut(element: HTMLElement, duration: number = 300): Animation {
		return new Animation({
			duration,
			easing: Easing.easeOutQuad
		})
			.fromTo(1, 0)
			.onUpdate((frame) => {
				element.style.opacity = frame.value.toString();
			});
	},

	/**
	 * Slide in animation
	 */
	slideIn(
		element: HTMLElement,
		direction: 'left' | 'right' | 'up' | 'down',
		duration: number = 400
	): Animation {
		const startValues = {
			left: -element.offsetWidth,
			right: element.offsetWidth,
			up: -element.offsetHeight,
			down: element.offsetHeight
		};

		return new Animation({
			duration,
			easing: Easing.easeOutBack
		})
			.fromTo(startValues[direction], 0)
			.onUpdate((frame) => {
				const transform =
					direction === 'left' || direction === 'right'
						? `translateX(${frame.value}px)`
						: `translateY(${frame.value}px)`;
				element.style.transform = transform;
			});
	},

	/**
	 * Scale animation
	 */
	scale(
		element: HTMLElement,
		fromScale: number,
		toScale: number,
		duration: number = 300
	): Animation {
		return new Animation({
			duration,
			easing: Easing.easeOutBack
		})
			.fromTo(fromScale, toScale)
			.onUpdate((frame) => {
				element.style.transform = `scale(${frame.value})`;
			});
	},

	/**
	 * Rotate animation
	 */
	rotate(
		element: HTMLElement,
		fromAngle: number,
		toAngle: number,
		duration: number = 500
	): Animation {
		return new Animation({
			duration,
			easing: Easing.easeInOutQuad
		})
			.fromTo(fromAngle, toAngle)
			.onUpdate((frame) => {
				element.style.transform = `rotate(${frame.value}deg)`;
			});
	},

	/**
	 * Bounce animation
	 */
	bounce(element: HTMLElement, intensity: number = 20, duration: number = 600): Animation {
		return new Animation({
			duration,
			easing: Easing.easeOutBounce
		})
			.fromTo(intensity, 0)
			.onUpdate((frame) => {
				element.style.transform = `translateY(${frame.value}px)`;
			});
	},

	/**
	 * Pulse animation
	 */
	pulse(
		element: HTMLElement,
		minScale: number = 0.95,
		maxScale: number = 1.05,
		duration: number = 1000
	): Animation {
		return new Animation({
			duration,
			easing: Easing.easeInOutSine,
			iterations: Infinity,
			direction: 'alternate'
		})
			.fromTo(minScale, maxScale)
			.onUpdate((frame) => {
				element.style.transform = `scale(${frame.value})`;
			});
	}
};

/**
 * Performance-optimized animation runner
 */
export class AnimationRunner {
	private static instance: AnimationRunner;
	private animations: Set<Animation> = new Set();
	private springs: Set<SpringAnimation> = new Set();
	private isRunning = false;
	private animationId: number | null = null;

	static getInstance(): AnimationRunner {
		if (!AnimationRunner.instance) {
			AnimationRunner.instance = new AnimationRunner();
		}
		return AnimationRunner.instance;
	}

	/**
	 * Add animation to runner
	 */
	addAnimation(animation: Animation): void {
		this.animations.add(animation);
		this.startIfNeeded();
	}

	/**
	 * Add spring to runner
	 */
	addSpring(spring: SpringAnimation): void {
		this.springs.add(spring);
		this.startIfNeeded();
	}

	/**
	 * Remove animation from runner
	 */
	removeAnimation(animation: Animation): void {
		this.animations.delete(animation);
		this.stopIfEmpty();
	}

	/**
	 * Remove spring from runner
	 */
	removeSpring(spring: SpringAnimation): void {
		this.springs.delete(spring);
		this.stopIfEmpty();
	}

	/**
	 * Start runner if not running
	 */
	private startIfNeeded(): void {
		if (!this.isRunning && (this.animations.size > 0 || this.springs.size > 0)) {
			this.isRunning = true;
			this.run();
		}
	}

	/**
	 * Stop runner if empty
	 */
	private stopIfEmpty(): void {
		if (this.animations.size === 0 && this.springs.size === 0) {
			this.isRunning = false;
			if (this.animationId) {
				cancelAnimationFrame(this.animationId);
				this.animationId = null;
			}
		}
	}

	/**
	 * Main runner loop
	 */
	private run = (): void => {
		if (!this.isRunning) return;

		// Remove completed animations
		this.animations.forEach((animation) => {
			if (!animation.isRunning()) {
				this.animations.delete(animation);
			}
		});

		// Continue running if there are active animations
		if (this.animations.size > 0 || this.springs.size > 0) {
			this.animationId = requestAnimationFrame(this.run);
		} else {
			this.isRunning = false;
		}
	};
}

/**
 * Create animation with global runner
 */
export function createAnimation(config: AnimationConfig): Animation {
	const animation = new Animation(config);
	const runner = AnimationRunner.getInstance();

	animation.onStart(() => runner.addAnimation(animation));
	animation.onComplete(() => runner.removeAnimation(animation));

	return animation;
}

/**
 * Create spring animation with global runner
 */
export function createSpring(config?: Partial<SpringConfig>): SpringAnimation {
	const spring = new SpringAnimation(config);
	const runner = AnimationRunner.getInstance();

	runner.addSpring(spring);

	return spring;
}
