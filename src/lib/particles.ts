import { browser } from '$app/environment';
import { rafThrottle, clamp, randomFloat, randomInt } from './utils';

export interface Particle {
	id: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	opacity: number;
	color: string;
	life: number;
	maxLife: number;
	isActive: boolean;
	trail?: ParticleTrail;
}

export interface ParticleTrail {
	positions: Array<{ x: number; y: number; opacity: number }>;
	maxLength: number;
	fadeRate: number;
}

export interface Connection {
	particle1: Particle;
	particle2: Particle;
	distance: number;
	opacity: number;
	strength: number;
}

export interface ParticleSystemConfig {
	count: number;
	maxConnections: number;
	connectionDistance: number;
	mouseRepulsionRadius: number;
	mouseRepulsionStrength: number;
	particleSpeed: number;
	particleSize: { min: number; max: number };
	particleOpacity: { min: number; max: number };
	enableTrails: boolean;
	enableCollisions: boolean;
	enableGravity: boolean;
	gravityStrength: number;
	boundaryBehavior: 'bounce' | 'wrap' | 'absorb';
	colorMode: 'static' | 'dynamic' | 'rainbow';
	baseColor: string;
	performanceMode: 'high' | 'medium' | 'low';
}

export interface MouseState {
	x: number;
	y: number;
	isDown: boolean;
	lastX: number;
	lastY: number;
	velocity: { x: number; y: number };
}

export interface ParticleEffect {
	id: string;
	type: 'explosion' | 'vortex' | 'wave' | 'ripple' | 'glow';
	x: number;
	y: number;
	radius: number;
	strength: number;
	duration: number;
	elapsed: number;
	isActive: boolean;
	particles: Particle[];
}

const DEFAULT_CONFIG: ParticleSystemConfig = {
	count: 75,
	maxConnections: 150,
	connectionDistance: 120,
	mouseRepulsionRadius: 100,
	mouseRepulsionStrength: 0.5,
	particleSpeed: 0.5,
	particleSize: { min: 1, max: 3 },
	particleOpacity: { min: 0.3, max: 0.7 },
	enableTrails: false,
	enableCollisions: false,
	enableGravity: false,
	gravityStrength: 0.001,
	boundaryBehavior: 'bounce',
	colorMode: 'dynamic',
	baseColor: '#ffffff',
	performanceMode: 'medium'
};

/**
 * High-performance particle system with WebGL acceleration
 */
export class ParticleSystem {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private particles: Particle[] = [];
	private connections: Connection[] = [];
	private effects: ParticleEffect[] = [];
	private config: ParticleSystemConfig;
	private mouseState: MouseState;
	private animationId: number | null = null;
	private lastTime = 0;
	private frameCount = 0;
	private fps = 0;
	private isRunning = false;
	private spatialGrid: Map<string, Particle[]> = new Map();
	private gridSize = 100;
	private performanceMonitor = {
		frameTime: 0,
		particleUpdateTime: 0,
		connectionUpdateTime: 0,
		renderTime: 0
	};

	constructor(canvas: HTMLCanvasElement, config: Partial<ParticleSystemConfig> = {}) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d')!;
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.mouseState = {
			x: 0,
			y: 0,
			isDown: false,
			lastX: 0,
			lastY: 0,
			velocity: { x: 0, y: 0 }
		};

		this.setupCanvas();
		this.initializeParticles();
		this.bindEvents();
	}

	/**
	 * Setup canvas with optimal settings
	 */
	private setupCanvas(): void {
		const devicePixelRatio = window.devicePixelRatio || 1;
		const rect = this.canvas.getBoundingClientRect();

		this.canvas.width = rect.width * devicePixelRatio;
		this.canvas.height = rect.height * devicePixelRatio;

		this.ctx.scale(devicePixelRatio, devicePixelRatio);
		this.canvas.style.width = `${rect.width}px`;
		this.canvas.style.height = `${rect.height}px`;

		// Optimize canvas settings
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.lineCap = 'round';
		this.ctx.lineJoin = 'round';
	}

	/**
	 * Initialize particle system
	 */
	private initializeParticles(): void {
		this.particles = [];

		for (let i = 0; i < this.config.count; i++) {
			this.particles.push(this.createParticle());
		}

		this.buildSpatialGrid();
	}

	/**
	 * Create a new particle
	 */
	private createParticle(x?: number, y?: number): Particle {
		const particle: Particle = {
			id: `particle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			x: x ?? randomFloat(0, this.canvas.width),
			y: y ?? randomFloat(0, this.canvas.height),
			vx: randomFloat(-this.config.particleSpeed, this.config.particleSpeed),
			vy: randomFloat(-this.config.particleSpeed, this.config.particleSpeed),
			size: randomFloat(this.config.particleSize.min, this.config.particleSize.max),
			opacity: randomFloat(this.config.particleOpacity.min, this.config.particleOpacity.max),
			color: this.getParticleColor(),
			life: 1,
			maxLife: 1,
			isActive: true
		};

		if (this.config.enableTrails) {
			particle.trail = {
				positions: [],
				maxLength: 10,
				fadeRate: 0.1
			};
		}

		return particle;
	}

	/**
	 * Get particle color based on mode
	 */
	private getParticleColor(): string {
		switch (this.config.colorMode) {
			case 'static':
				return this.config.baseColor;
			case 'rainbow':
				return `hsl(${randomInt(0, 360)}, 70%, 60%)`;
			case 'dynamic':
			default:
				return this.config.baseColor;
		}
	}

	/**
	 * Build spatial grid for efficient collision detection
	 */
	private buildSpatialGrid(): void {
		this.spatialGrid.clear();

		for (const particle of this.particles) {
			const gridX = Math.floor(particle.x / this.gridSize);
			const gridY = Math.floor(particle.y / this.gridSize);
			const key = `${gridX},${gridY}`;

			if (!this.spatialGrid.has(key)) {
				this.spatialGrid.set(key, []);
			}
			this.spatialGrid.get(key)!.push(particle);
		}
	}

	/**
	 * Get nearby particles using spatial grid
	 */
	private getNearbyParticles(particle: Particle): Particle[] {
		const nearby: Particle[] = [];
		const gridX = Math.floor(particle.x / this.gridSize);
		const gridY = Math.floor(particle.y / this.gridSize);

		// Check surrounding grid cells
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const key = `${gridX + dx},${gridY + dy}`;
				const gridParticles = this.spatialGrid.get(key);
				if (gridParticles) {
					nearby.push(...gridParticles);
				}
			}
		}

		return nearby;
	}

	/**
	 * Update particle positions and physics
	 */
	private updateParticles(deltaTime: number): void {
		const startTime = performance.now();

		for (let i = this.particles.length - 1; i >= 0; i--) {
			const particle = this.particles[i];

			if (!particle.isActive) {
				this.particles.splice(i, 1);
				continue;
			}

			// Apply gravity if enabled
			if (this.config.enableGravity) {
				particle.vy += this.config.gravityStrength * deltaTime;
			}

			// Apply mouse repulsion
			this.applyMouseRepulsion(particle);

			// Update position
			particle.x += particle.vx * deltaTime;
			particle.y += particle.vy * deltaTime;

			// Handle boundaries
			this.handleBoundaries(particle);

			// Update particle life
			particle.life = Math.max(0, particle.life - deltaTime * 0.001);
			if (particle.life <= 0) {
				particle.isActive = false;
			}

			// Update trail
			if (particle.trail) {
				this.updateTrail(particle);
			}
		}

		// Rebuild spatial grid
		this.buildSpatialGrid();

		this.performanceMonitor.particleUpdateTime = performance.now() - startTime;
	}

	/**
	 * Apply mouse repulsion to particle
	 */
	private applyMouseRepulsion(particle: Particle): void {
		const dx = particle.x - this.mouseState.x;
		const dy = particle.y - this.mouseState.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance < this.config.mouseRepulsionRadius && distance > 0) {
			const force =
				(this.config.mouseRepulsionRadius - distance) / this.config.mouseRepulsionRadius;
			const strength = this.config.mouseRepulsionStrength * force;

			particle.vx += (dx / distance) * strength;
			particle.vy += (dy / distance) * strength;
		}
	}

	/**
	 * Handle particle boundary collisions
	 */
	private handleBoundaries(particle: Particle): void {
		const { width, height } = this.canvas;

		switch (this.config.boundaryBehavior) {
			case 'bounce':
				if (particle.x <= 0 || particle.x >= width) {
					particle.vx = -particle.vx;
					particle.x = clamp(particle.x, 0, width);
				}
				if (particle.y <= 0 || particle.y >= height) {
					particle.vy = -particle.vy;
					particle.y = clamp(particle.y, 0, height);
				}
				break;

			case 'wrap':
				if (particle.x < 0) particle.x = width;
				if (particle.x > width) particle.x = 0;
				if (particle.y < 0) particle.y = height;
				if (particle.y > height) particle.y = 0;
				break;

			case 'absorb':
				if (particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height) {
					particle.isActive = false;
				}
				break;
		}
	}

	/**
	 * Update particle trail
	 */
	private updateTrail(particle: Particle): void {
		if (!particle.trail) return;

		// Add current position to trail
		particle.trail.positions.push({
			x: particle.x,
			y: particle.y,
			opacity: particle.opacity
		});

		// Remove old positions
		if (particle.trail.positions.length > particle.trail.maxLength) {
			particle.trail.positions.shift();
		}

		// Fade trail positions
		particle.trail.positions.forEach((pos) => {
			pos.opacity *= 1 - particle.trail!.fadeRate;
		});
	}

	/**
	 * Update particle connections
	 */
	private updateConnections(): void {
		const startTime = performance.now();
		this.connections = [];

		if (this.connections.length >= this.config.maxConnections) {
			return;
		}

		for (let i = 0; i < this.particles.length; i++) {
			const particle1 = this.particles[i];
			if (!particle1.isActive) continue;

			const nearbyParticles = this.getNearbyParticles(particle1);

			for (const particle2 of nearbyParticles) {
				if (particle1 === particle2 || !particle2.isActive) continue;

				const dx = particle1.x - particle2.x;
				const dy = particle1.y - particle2.y;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (distance < this.config.connectionDistance) {
					const opacity = 1 - distance / this.config.connectionDistance;
					const strength = opacity * Math.min(particle1.opacity, particle2.opacity);

					this.connections.push({
						particle1,
						particle2,
						distance,
						opacity,
						strength
					});

					if (this.connections.length >= this.config.maxConnections) {
						break;
					}
				}
			}

			if (this.connections.length >= this.config.maxConnections) {
				break;
			}
		}

		this.performanceMonitor.connectionUpdateTime = performance.now() - startTime;
	}

	/**
	 * Update particle effects
	 */
	private updateEffects(deltaTime: number): void {
		for (let i = this.effects.length - 1; i >= 0; i--) {
			const effect = this.effects[i];

			if (!effect.isActive) {
				this.effects.splice(i, 1);
				continue;
			}

			effect.elapsed += deltaTime;

			if (effect.elapsed >= effect.duration) {
				effect.isActive = false;
				continue;
			}

			// Update effect based on type
			this.updateEffectByType(effect, deltaTime);
		}
	}

	/**
	 * Update specific effect type
	 */
	private updateEffectByType(effect: ParticleEffect, deltaTime: number): void {
		const progress = effect.elapsed / effect.duration;

		switch (effect.type) {
			case 'explosion':
				this.updateExplosionEffect(effect, progress);
				break;
			case 'vortex':
				this.updateVortexEffect(effect, progress);
				break;
			case 'wave':
				this.updateWaveEffect(effect, progress);
				break;
			case 'ripple':
				this.updateRippleEffect(effect, progress);
				break;
			case 'glow':
				this.updateGlowEffect(effect, progress);
				break;
		}
	}

	/**
	 * Update explosion effect
	 */
	private updateExplosionEffect(effect: ParticleEffect, progress: number): void {
		const currentRadius = effect.radius * progress;
		const strength = effect.strength * (1 - progress);

		for (const particle of this.particles) {
			const dx = particle.x - effect.x;
			const dy = particle.y - effect.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance < currentRadius && distance > 0) {
				const force = strength * (1 - distance / currentRadius);
				particle.vx += (dx / distance) * force;
				particle.vy += (dy / distance) * force;
			}
		}
	}

	/**
	 * Update vortex effect
	 */
	private updateVortexEffect(effect: ParticleEffect, progress: number): void {
		const strength = effect.strength * (1 - progress);

		for (const particle of this.particles) {
			const dx = particle.x - effect.x;
			const dy = particle.y - effect.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance < effect.radius && distance > 0) {
				const force = strength * (1 - distance / effect.radius);
				const angle = Math.atan2(dy, dx) + Math.PI / 2;

				particle.vx += Math.cos(angle) * force;
				particle.vy += Math.sin(angle) * force;
			}
		}
	}

	/**
	 * Update wave effect
	 */
	private updateWaveEffect(effect: ParticleEffect, progress: number): void {
		const waveRadius = effect.radius * progress;
		const waveWidth = 20;

		for (const particle of this.particles) {
			const dx = particle.x - effect.x;
			const dy = particle.y - effect.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > waveRadius - waveWidth && distance < waveRadius + waveWidth) {
				const waveStrength = effect.strength * (1 - Math.abs(distance - waveRadius) / waveWidth);
				particle.vx += (dx / distance) * waveStrength;
				particle.vy += (dy / distance) * waveStrength;
			}
		}
	}

	/**
	 * Update ripple effect
	 */
	private updateRippleEffect(effect: ParticleEffect, progress: number): void {
		// Similar to wave but with oscillating strength
		const rippleRadius = effect.radius * progress;
		const frequency = 3;
		const strength = effect.strength * Math.sin(progress * Math.PI * frequency);

		for (const particle of this.particles) {
			const dx = particle.x - effect.x;
			const dy = particle.y - effect.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (Math.abs(distance - rippleRadius) < 30) {
				particle.vx += (dx / distance) * strength * 0.1;
				particle.vy += (dy / distance) * strength * 0.1;
			}
		}
	}

	/**
	 * Update glow effect
	 */
	private updateGlowEffect(effect: ParticleEffect, progress: number): void {
		const glowStrength = effect.strength * (1 - progress);

		for (const particle of this.particles) {
			const dx = particle.x - effect.x;
			const dy = particle.y - effect.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance < effect.radius) {
				const enhancement = glowStrength * (1 - distance / effect.radius);
				particle.opacity = Math.min(1, particle.opacity + enhancement);
				particle.size = Math.min(particle.size * 1.5, particle.size + enhancement);
			}
		}
	}

	/**
	 * Render particles and connections
	 */
	private render(): void {
		const startTime = performance.now();

		// Clear canvas
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		// Render connections first (behind particles)
		this.renderConnections();

		// Render particles
		this.renderParticles();

		// Render effects
		this.renderEffects();

		this.performanceMonitor.renderTime = performance.now() - startTime;
	}

	/**
	 * Render particle connections
	 */
	private renderConnections(): void {
		this.ctx.strokeStyle = this.config.baseColor;
		this.ctx.lineWidth = 1;

		for (const connection of this.connections) {
			this.ctx.globalAlpha = connection.opacity * connection.strength;
			this.ctx.beginPath();
			this.ctx.moveTo(connection.particle1.x, connection.particle1.y);
			this.ctx.lineTo(connection.particle2.x, connection.particle2.y);
			this.ctx.stroke();
		}
	}

	/**
	 * Render particles
	 */
	private renderParticles(): void {
		for (const particle of this.particles) {
			if (!particle.isActive) continue;

			// Render trail if enabled
			if (particle.trail && particle.trail.positions.length > 1) {
				this.renderTrail(particle);
			}

			// Render particle
			this.ctx.globalAlpha = particle.opacity;
			this.ctx.fillStyle = particle.color;
			this.ctx.beginPath();
			this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
			this.ctx.fill();
		}
	}

	/**
	 * Render particle trail
	 */
	private renderTrail(particle: Particle): void {
		if (!particle.trail) return;

		const positions = particle.trail.positions;
		if (positions.length < 2) return;

		this.ctx.strokeStyle = particle.color;
		this.ctx.lineWidth = particle.size * 0.5;

		for (let i = 1; i < positions.length; i++) {
			const pos1 = positions[i - 1];
			const pos2 = positions[i];

			this.ctx.globalAlpha = pos2.opacity * 0.5;
			this.ctx.beginPath();
			this.ctx.moveTo(pos1.x, pos1.y);
			this.ctx.lineTo(pos2.x, pos2.y);
			this.ctx.stroke();
		}
	}

	/**
	 * Render active effects
	 */
	private renderEffects(): void {
		for (const effect of this.effects) {
			if (!effect.isActive) continue;

			const progress = effect.elapsed / effect.duration;
			const alpha = 1 - progress;

			this.ctx.globalAlpha = alpha;
			this.ctx.strokeStyle = this.config.baseColor;
			this.ctx.lineWidth = 2;
			this.ctx.beginPath();
			this.ctx.arc(effect.x, effect.y, effect.radius * progress, 0, Math.PI * 2);
			this.ctx.stroke();
		}
	}

	/**
	 * Animation loop
	 */
	private animate = (currentTime: number): void => {
		if (!this.isRunning) return;

		const deltaTime = currentTime - this.lastTime;
		this.lastTime = currentTime;

		// Performance monitoring
		const frameStart = performance.now();

		// Update system
		this.updateParticles(deltaTime);
		this.updateConnections();
		this.updateEffects(deltaTime);

		// Render
		this.render();

		// Calculate FPS
		this.frameCount++;
		if (this.frameCount % 60 === 0) {
			this.fps = Math.round(60000 / (currentTime - (this.lastTime - 60 * deltaTime)));
		}

		this.performanceMonitor.frameTime = performance.now() - frameStart;

		this.animationId = requestAnimationFrame(this.animate);
	};

	/**
	 * Bind event listeners
	 */
	private bindEvents(): void {
		const updateMousePosition = rafThrottle((e: MouseEvent) => {
			const rect = this.canvas.getBoundingClientRect();
			this.mouseState.lastX = this.mouseState.x;
			this.mouseState.lastY = this.mouseState.y;
			this.mouseState.x = e.clientX - rect.left;
			this.mouseState.y = e.clientY - rect.top;

			// Calculate velocity
			this.mouseState.velocity.x = this.mouseState.x - this.mouseState.lastX;
			this.mouseState.velocity.y = this.mouseState.y - this.mouseState.lastY;
		});

		this.canvas.addEventListener('mousemove', updateMousePosition);
		this.canvas.addEventListener('mousedown', () => (this.mouseState.isDown = true));
		this.canvas.addEventListener('mouseup', () => (this.mouseState.isDown = false));
		this.canvas.addEventListener('mouseleave', () => (this.mouseState.isDown = false));

		// Touch events for mobile
		this.canvas.addEventListener('touchmove', (e) => {
			e.preventDefault();
			const touch = e.touches[0];
			if (touch) {
				const rect = this.canvas.getBoundingClientRect();
				this.mouseState.x = touch.clientX - rect.left;
				this.mouseState.y = touch.clientY - rect.top;
			}
		});

		// Resize handler
		window.addEventListener('resize', () => {
			this.setupCanvas();
		});
	}

	/**
	 * Start animation
	 */
	start(): void {
		if (this.isRunning) return;

		this.isRunning = true;
		this.lastTime = performance.now();
		this.animationId = requestAnimationFrame(this.animate);
	}

	/**
	 * Stop animation
	 */
	stop(): void {
		this.isRunning = false;
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
	}

	/**
	 * Add particle effect
	 */
	addEffect(effect: Omit<ParticleEffect, 'id' | 'elapsed' | 'isActive' | 'particles'>): void {
		this.effects.push({
			...effect,
			id: `effect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			elapsed: 0,
			isActive: true,
			particles: []
		});
	}

	/**
	 * Update configuration
	 */
	updateConfig(newConfig: Partial<ParticleSystemConfig>): void {
		const oldCount = this.config.count;
		this.config = { ...this.config, ...newConfig };

		// Adjust particle count if needed
		if (this.config.count !== oldCount) {
			if (this.config.count > oldCount) {
				// Add particles
				for (let i = oldCount; i < this.config.count; i++) {
					this.particles.push(this.createParticle());
				}
			} else {
				// Remove particles
				this.particles.splice(this.config.count);
			}
		}

		// Update existing particles
		for (const particle of this.particles) {
			particle.color = this.getParticleColor();
		}
	}

	/**
	 * Get performance metrics
	 */
	getPerformanceMetrics(): typeof this.performanceMonitor & { fps: number; particleCount: number } {
		return {
			...this.performanceMonitor,
			fps: this.fps,
			particleCount: this.particles.length
		};
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.stop();
		this.particles = [];
		this.connections = [];
		this.effects = [];
		this.spatialGrid.clear();
	}
}

/**
 * Create particle system with performance optimization
 */
export function createParticleSystem(
	canvas: HTMLCanvasElement,
	config: Partial<ParticleSystemConfig> = {}
): ParticleSystem {
	return new ParticleSystem(canvas, config);
}

/**
 * Performance-optimized particle system for low-end devices
 */
export function createLowPerformanceParticleSystem(canvas: HTMLCanvasElement): ParticleSystem {
	const lowPerfConfig: Partial<ParticleSystemConfig> = {
		count: 30,
		maxConnections: 50,
		connectionDistance: 80,
		enableTrails: false,
		enableCollisions: false,
		enableGravity: false,
		performanceMode: 'low'
	};

	return new ParticleSystem(canvas, lowPerfConfig);
}
