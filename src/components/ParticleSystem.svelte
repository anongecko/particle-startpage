<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { PerformanceMonitor } from '$lib/performance';
	import { debounce, throttle } from '$lib/utils';
	
	interface Props {
		count?: number;
		windowWidth?: number;
		windowHeight?: number;
		dominantColor?: string;
		enabled?: boolean;
		mouseInfluenceRadius?: number;
		opacity?: number;
		speed?: number;
		performanceMode?: 'low' | 'medium' | 'high';
	}
	
	let {
		count = 80,
		windowWidth = $bindable(0),
		windowHeight = $bindable(0),
		dominantColor = '#4a90e2',
		enabled = true,
		mouseInfluenceRadius = 150,
		opacity = 1.0,
		speed = 1.0,
		performanceMode = 'high'
	}: Props = $props();
	
	let canvas: HTMLCanvasElement = $state();
	let particleSystem: ParticleNexusSystem | null = $state();
	let animationFrame: number = $state(0);
	let isInitialized = $state(false);
	let lastInteractionTime = $state(0);
	let hasWebGL2 = $state(false);
	let isMobile = $state(false);
	let performanceMonitor: PerformanceMonitor = $state();
	let resizeObserver: ResizeObserver | null = $state();
	let isVisible = $state(true);
	
	const dispatch = createEventDispatcher();
	
	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		size: number;
		opacity: number;
		color: [number, number, number];
		phase: number;
		originalSize: number;
		isActive: boolean;
		lifetime: number;
		maxLifetime: number;
		behavior: ParticleBehavior;
	}
	
	interface ParticleBehavior {
		cohesionRadius: number;
		separationRadius: number;
		alignmentRadius: number;
		maxSpeed: number;
		maxForce: number;
	}
	
	interface MouseState {
		x: number;
		y: number;
		isDown: boolean;
		velocity: { x: number; y: number };
		influence: number;
		lastX: number;
		lastY: number;
	}
	
	interface TouchState {
		x: number;
		y: number;
		isActive: boolean;
		startTime: number;
	}
	
	const VERTEX_SHADER = `#version 300 es
		precision mediump float;
		
		in vec2 a_position;
		in float a_size;
		in float a_opacity;
		in vec3 a_color;
		in float a_phase;
		
		uniform vec2 u_resolution;
		uniform float u_time;
		uniform float u_globalOpacity;
		uniform bool u_isVisible;
		uniform float u_dpr;
		
		out float v_opacity;
		out vec3 v_color;
		out float v_glow;
		out vec2 v_position;
		
		void main() {
			vec2 position = (a_position / u_resolution) * 2.0 - 1.0;
			position.y = -position.y;
			
			float breathing = sin(u_time * 1.5 + a_phase) * 0.15 + 1.0;
			float currentSize = a_size * breathing * u_dpr;
			
			if (!u_isVisible) {
				currentSize *= 0.6;
			}
			
			gl_Position = vec4(position, 0.0, 1.0);
			gl_PointSize = max(currentSize, 1.0);
			
			v_opacity = a_opacity * u_globalOpacity;
			v_color = a_color;
			v_glow = breathing;
			v_position = gl_PointCoord;
		}
	`;
	
	const FRAGMENT_SHADER = `#version 300 es
		precision mediump float;
		
		in float v_opacity;
		in vec3 v_color;
		in float v_glow;
		in vec2 v_position;
		
		out vec4 fragColor;
		
		void main() {
			vec2 center = gl_PointCoord - 0.5;
			float distance = length(center);
			
			if (distance > 0.5) discard;
			
			float alpha = 1.0 - smoothstep(0.1, 0.5, distance);
			float coreGlow = 1.0 - smoothstep(0.0, 0.3, distance);
			float outerGlow = 1.0 - smoothstep(0.3, 0.6, distance);
			
			vec3 coreColor = v_color + vec3(0.3) * coreGlow;
			vec3 finalColor = mix(v_color, coreColor, v_glow * 0.7);
			
			float finalAlpha = alpha * v_opacity * (0.8 + outerGlow * 0.2);
			
			fragColor = vec4(finalColor, finalAlpha);
		}
	`;
	
	class ParticleNexusSystem {
		private particles: Particle[] = [];
		private program: WebGLProgram | null = null;
		private buffers: Map<string, WebGLBuffer> = new Map();
		private vao: WebGLVertexArrayObject | null = null;
		private uniformLocations: Map<string, WebGLUniformLocation> = new Map();
		
		private mouseState: MouseState = {
			x: 0, y: 0, isDown: false,
			velocity: { x: 0, y: 0 },
			influence: mouseInfluenceRadius,
			lastX: 0, lastY: 0
		};
		
		private touchState: TouchState = {
			x: 0, y: 0, isActive: false, startTime: 0
		};
		
		private currentColor: [number, number, number] = [0.29, 0.56, 0.89];
		private targetColor: [number, number, number] = [0.29, 0.56, 0.89];
		private colorTransitionSpeed = 0.03;
		
		private spatialGrid: Map<string, Particle[]> = new Map();
		private gridSize = 100;
		
		constructor(private gl: WebGL2RenderingContext, private canvasElement: HTMLCanvasElement) {
			this.initialize();
		}
		
		private initialize(): void {
			try {
				this.setupShaders();
				this.setupBuffers();
				this.createParticles();
				this.setupUniforms();
			} catch (error) {
				console.error('Failed to initialize particle system:', error);
				throw error;
			}
		}
		
		private setupShaders(): void {
			const vertexShader = this.createShader(this.gl.VERTEX_SHADER, VERTEX_SHADER);
			const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
			
			if (!vertexShader || !fragmentShader) {
				throw new Error('Failed to create shaders');
			}
			
			this.program = this.gl.createProgram();
			if (!this.program) {
				throw new Error('Failed to create shader program');
			}
			
			this.gl.attachShader(this.program, vertexShader);
			this.gl.attachShader(this.program, fragmentShader);
			this.gl.linkProgram(this.program);
			
			if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
				const info = this.gl.getProgramInfoLog(this.program);
				throw new Error(`Shader program failed to link: ${info}`);
			}
			
			this.gl.deleteShader(vertexShader);
			this.gl.deleteShader(fragmentShader);
		}
		
		private createShader(type: number, source: string): WebGLShader | null {
			const shader = this.gl.createShader(type);
			if (!shader) return null;
			
			this.gl.shaderSource(shader, source);
			this.gl.compileShader(shader);
			
			if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
				const info = this.gl.getShaderInfoLog(shader);
				console.error(`Shader compilation error: ${info}`);
				this.gl.deleteShader(shader);
				return null;
			}
			
			return shader;
		}
		
		private setupBuffers(): void {
			this.vao = this.gl.createVertexArrayObject();
			if (!this.vao) throw new Error('Failed to create VAO');
			
			this.gl.bindVertexArrayObject(this.vao);
			
			const bufferNames = ['position', 'size', 'opacity', 'color', 'phase'];
			for (const name of bufferNames) {
				const buffer = this.gl.createBuffer();
				if (!buffer) throw new Error(`Failed to create ${name} buffer`);
				this.buffers.set(name, buffer);
			}
		}
		
		private setupUniforms(): void {
			if (!this.program) return;
			
			const uniformNames = ['u_resolution', 'u_time', 'u_globalOpacity', 'u_isVisible', 'u_dpr'];
			
			for (const name of uniformNames) {
				const location = this.gl.getUniformLocation(this.program, name);
				if (location) {
					this.uniformLocations.set(name, location);
				}
			}
		}
		
		private createParticles(): void {
			this.particles = [];
			const adjustedCount = isMobile ? Math.min(count, 50) : count;
			
			for (let i = 0; i < adjustedCount; i++) {
				this.particles.push(this.createParticle());
			}
		}
		
		private createParticle(): Particle {
			const sizeMultiplier = {
				high: 1.2,
				medium: 1.0,
				low: 0.8
			}[performanceMode];
			
			const baseSize = (isMobile ? 4 : 6) * sizeMultiplier;
			
			return {
				x: Math.random() * this.canvasElement.width,
				y: Math.random() * this.canvasElement.height,
				vx: (Math.random() - 0.5) * 1.5 * speed,
				vy: (Math.random() - 0.5) * 1.5 * speed,
				size: baseSize + Math.random() * 3,
				opacity: 0.2 + Math.random() * 0.6,
				color: [...this.currentColor] as [number, number, number],
				phase: Math.random() * Math.PI * 2,
				originalSize: baseSize + Math.random() * 3,
				isActive: true,
				lifetime: 0,
				maxLifetime: 8000 + Math.random() * 12000,
				behavior: {
					cohesionRadius: isMobile ? 60 : 80,
					separationRadius: isMobile ? 20 : 25,
					alignmentRadius: isMobile ? 40 : 50,
					maxSpeed: (isMobile ? 1.5 : 2) * speed,
					maxForce: 0.04
				}
			};
		}
		
		private updateSpatialGrid(): void {
			if (performanceMode === 'low') return;
			
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
		
		private getNeighbors(particle: Particle, radius: number): Particle[] {
			if (performanceMode === 'low') {
				return this.particles.filter(p => 
					p !== particle && this.distance(particle, p) < radius
				);
			}
			
			const gridX = Math.floor(particle.x / this.gridSize);
			const gridY = Math.floor(particle.y / this.gridSize);
			const neighbors: Particle[] = [];
			
			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					const key = `${gridX + dx},${gridY + dy}`;
					const gridParticles = this.spatialGrid.get(key);
					if (gridParticles) {
						neighbors.push(...gridParticles.filter(p => 
							p !== particle && this.distance(particle, p) < radius
						));
					}
				}
			}
			
			return neighbors;
		}
		
		update(deltaTime: number): void {
			if (!enabled) return;
			
			this.updateColorTransition();
			this.updateSpatialGrid();
			
			const timeBasedOpacity = Math.min(1, (Date.now() - lastInteractionTime) / 2000);
			
			for (let i = this.particles.length - 1; i >= 0; i--) {
				const particle = this.particles[i];
				
				particle.lifetime += deltaTime;
				
				if (particle.lifetime > particle.maxLifetime) {
					this.particles[i] = this.createParticle();
					continue;
				}
				
				if (performanceMode === 'high') {
					this.applyAdvancedBehaviors(particle);
				} else {
					this.applyBasicBehaviors(particle);
				}
				
				particle.x += particle.vx;
				particle.y += particle.vy;
				
				this.wrapBoundaries(particle);
				
				particle.phase += 0.015;
				particle.opacity = Math.max(0.1, particle.opacity * 0.999 + 0.001 * timeBasedOpacity);
			}
		}
		
		private updateColorTransition(): void {
			for (let i = 0; i < 3; i++) {
				const diff = this.targetColor[i] - this.currentColor[i];
				if (Math.abs(diff) > 0.001) {
					this.currentColor[i] += diff * this.colorTransitionSpeed;
				}
			}
			
			for (const particle of this.particles) {
				for (let i = 0; i < 3; i++) {
					particle.color[i] = this.currentColor[i];
				}
			}
		}
		
		private applyAdvancedBehaviors(particle: Particle): void {
			const mouseForce = this.mouseInfluence(particle);
			const touchForce = this.touchInfluence(particle);
			
			const neighbors = this.getNeighbors(particle, Math.max(
				particle.behavior.cohesionRadius,
				particle.behavior.separationRadius,
				particle.behavior.alignmentRadius
			));
			
			const cohesion = this.cohesion(particle, neighbors);
			const separation = this.separation(particle, neighbors);
			const alignment = this.alignment(particle, neighbors);
			
			const totalForceX = mouseForce.x + touchForce.x + 
				cohesion.x * 0.2 + separation.x * 0.9 + alignment.x * 0.15;
			const totalForceY = mouseForce.y + touchForce.y + 
				cohesion.y * 0.2 + separation.y * 0.9 + alignment.y * 0.15;
			
			particle.vx += totalForceX * 0.08;
			particle.vy += totalForceY * 0.08;
			
			this.limitVelocity(particle);
		}
		
		private applyBasicBehaviors(particle: Particle): void {
			const mouseForce = this.mouseInfluence(particle);
			const touchForce = this.touchInfluence(particle);
			const wander = { 
				x: (Math.random() - 0.5) * 0.08, 
				y: (Math.random() - 0.5) * 0.08 
			};
			
			particle.vx += (mouseForce.x + touchForce.x + wander.x) * 0.1;
			particle.vy += (mouseForce.y + touchForce.y + wander.y) * 0.1;
			
			const maxSpeed = particle.behavior.maxSpeed * 0.6;
			particle.vx = Math.max(-maxSpeed, Math.min(maxSpeed, particle.vx));
			particle.vy = Math.max(-maxSpeed, Math.min(maxSpeed, particle.vy));
		}
		
		private limitVelocity(particle: Particle): void {
			const speed = Math.sqrt(particle.vx ** 2 + particle.vy ** 2);
			if (speed > particle.behavior.maxSpeed) {
				particle.vx = (particle.vx / speed) * particle.behavior.maxSpeed;
				particle.vy = (particle.vy / speed) * particle.behavior.maxSpeed;
			}
		}
		
		private mouseInfluence(particle: Particle): { x: number; y: number } {
			const dx = particle.x - this.mouseState.x;
			const dy = particle.y - this.mouseState.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			if (distance > this.mouseState.influence || distance === 0) return { x: 0, y: 0 };
			
			const force = this.mouseState.isDown ? 2.5 : 0.8;
			const strength = (1 - distance / this.mouseState.influence) * force;
			
			return {
				x: -(dx / distance) * strength,
				y: -(dy / distance) * strength
			};
		}
		
		private touchInfluence(particle: Particle): { x: number; y: number } {
			if (!this.touchState.isActive) return { x: 0, y: 0 };
			
			const dx = particle.x - this.touchState.x;
			const dy = particle.y - this.touchState.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			if (distance > this.mouseState.influence || distance === 0) return { x: 0, y: 0 };
			
			const touchDuration = Date.now() - this.touchState.startTime;
			const force = Math.min(touchDuration / 400, 2.0);
			const strength = (1 - distance / this.mouseState.influence) * force;
			
			return {
				x: -(dx / distance) * strength,
				y: -(dy / distance) * strength
			};
		}
		
		private cohesion(particle: Particle, neighbors: Particle[]): { x: number; y: number } {
			const nearbyParticles = neighbors.filter(p => 
				this.distance(particle, p) < particle.behavior.cohesionRadius
			);
			
			if (nearbyParticles.length === 0) return { x: 0, y: 0 };
			
			let centerX = 0, centerY = 0;
			for (const other of nearbyParticles) {
				centerX += other.x;
				centerY += other.y;
			}
			centerX /= nearbyParticles.length;
			centerY /= nearbyParticles.length;
			
			return this.seek(particle, centerX, centerY);
		}
		
		private separation(particle: Particle, neighbors: Particle[]): { x: number; y: number } {
			const nearbyParticles = neighbors.filter(p => 
				this.distance(particle, p) < particle.behavior.separationRadius
			);
			
			if (nearbyParticles.length === 0) return { x: 0, y: 0 };
			
			let steerX = 0, steerY = 0;
			for (const other of nearbyParticles) {
				const distance = this.distance(particle, other);
				if (distance > 0) {
					const diffX = particle.x - other.x;
					const diffY = particle.y - other.y;
					const normalized = Math.sqrt(diffX ** 2 + diffY ** 2);
					steerX += (diffX / normalized) / distance;
					steerY += (diffY / normalized) / distance;
				}
			}
			
			steerX /= nearbyParticles.length;
			steerY /= nearbyParticles.length;
			
			const magnitude = Math.sqrt(steerX ** 2 + steerY ** 2);
			if (magnitude > 0) {
				steerX = (steerX / magnitude) * particle.behavior.maxSpeed - particle.vx;
				steerY = (steerY / magnitude) * particle.behavior.maxSpeed - particle.vy;
			}
			
			return { x: steerX, y: steerY };
		}
		
		private alignment(particle: Particle, neighbors: Particle[]): { x: number; y: number } {
			const nearbyParticles = neighbors.filter(p => 
				this.distance(particle, p) < particle.behavior.alignmentRadius
			);
			
			if (nearbyParticles.length === 0) return { x: 0, y: 0 };
			
			let velocityX = 0, velocityY = 0;
			for (const other of nearbyParticles) {
				velocityX += other.vx;
				velocityY += other.vy;
			}
			velocityX /= nearbyParticles.length;
			velocityY /= nearbyParticles.length;
			
			const magnitude = Math.sqrt(velocityX ** 2 + velocityY ** 2);
			if (magnitude > 0) {
				velocityX = (velocityX / magnitude) * particle.behavior.maxSpeed;
				velocityY = (velocityY / magnitude) * particle.behavior.maxSpeed;
			}
			
			return { x: velocityX - particle.vx, y: velocityY - particle.vy };
		}
		
		private seek(particle: Particle, targetX: number, targetY: number): { x: number; y: number } {
			const desired = {
				x: targetX - particle.x,
				y: targetY - particle.y
			};
			
			const magnitude = Math.sqrt(desired.x ** 2 + desired.y ** 2);
			if (magnitude === 0) return { x: 0, y: 0 };
			
			desired.x = (desired.x / magnitude) * particle.behavior.maxSpeed;
			desired.y = (desired.y / magnitude) * particle.behavior.maxSpeed;
			
			return {
				x: desired.x - particle.vx,
				y: desired.y - particle.vy
			};
		}
		
		private distance(p1: Particle, p2: Particle): number {
			const dx = p1.x - p2.x;
			const dy = p1.y - p2.y;
			return Math.sqrt(dx * dx + dy * dy);
		}
		
		private wrapBoundaries(particle: Particle): void {
			const margin = particle.size;
			
			if (particle.x < -margin) particle.x = this.canvasElement.width + margin;
			if (particle.x > this.canvasElement.width + margin) particle.x = -margin;
			if (particle.y < -margin) particle.y = this.canvasElement.height + margin;
			if (particle.y > this.canvasElement.height + margin) particle.y = -margin;
		}
		
		render(time: number): void {
			if (!this.program || !this.vao) return;
			
			this.gl.useProgram(this.program);
			this.gl.bindVertexArrayObject(this.vao);
			
			this.setUniforms(time);
			this.updateBuffers();
			
			this.gl.enable(this.gl.BLEND);
			this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
			this.gl.clearColor(0, 0, 0, 0);
			this.gl.clear(this.gl.COLOR_BUFFER_BIT);
			
			this.gl.drawArrays(this.gl.POINTS, 0, this.particles.length);
		}
		
		private setUniforms(time: number): void {
			const uniforms = [
				['u_resolution', () => this.gl.uniform2f(this.uniformLocations.get('u_resolution')!, this.canvasElement.width, this.canvasElement.height)],
				['u_time', () => this.gl.uniform1f(this.uniformLocations.get('u_time')!, time * 0.001)],
				['u_globalOpacity', () => this.gl.uniform1f(this.uniformLocations.get('u_globalOpacity')!, opacity)],
				['u_isVisible', () => this.gl.uniform1i(this.uniformLocations.get('u_isVisible')!, isVisible ? 1 : 0)],
				['u_dpr', () => this.gl.uniform1f(this.uniformLocations.get('u_dpr')!, window.devicePixelRatio || 1)]
			];
			
			for (const [name, setter] of uniforms) {
				if (this.uniformLocations.has(name)) {
					(setter as () => void)();
				}
			}
		}
		
		private updateBuffers(): void {
			if (!this.program) return;
			
			const positions = new Float32Array(this.particles.length * 2);
			const sizes = new Float32Array(this.particles.length);
			const opacities = new Float32Array(this.particles.length);
			const colors = new Float32Array(this.particles.length * 3);
			const phases = new Float32Array(this.particles.length);
			
			for (let i = 0; i < this.particles.length; i++) {
				const particle = this.particles[i];
				const idx = i * 2;
				const colorIdx = i * 3;
				
				positions[idx] = particle.x;
				positions[idx + 1] = particle.y;
				sizes[i] = particle.size;
				opacities[i] = particle.opacity;
				colors[colorIdx] = particle.color[0];
				colors[colorIdx + 1] = particle.color[1];
				colors[colorIdx + 2] = particle.color[2];
				phases[i] = particle.phase;
			}
			
			this.updateBuffer('position', positions, 'a_position', 2);
			this.updateBuffer('size', sizes, 'a_size', 1);
			this.updateBuffer('opacity', opacities, 'a_opacity', 1);
			this.updateBuffer('color', colors, 'a_color', 3);
			this.updateBuffer('phase', phases, 'a_phase', 1);
		}
		
		private updateBuffer(bufferName: string, data: Float32Array, attributeName: string, size: number): void {
			const buffer = this.buffers.get(bufferName);
			if (!buffer) return;
			
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW);
			
			const location = this.gl.getAttribLocation(this.program!, attributeName);
			if (location !== -1) {
				this.gl.enableVertexAttribArray(location);
				this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, 0, 0);
			}
		}
		
		updateColor(newColor: string): void {
			try {
				const hex = newColor.replace('#', '');
				this.targetColor = [
					parseInt(hex.substr(0, 2), 16) / 255,
					parseInt(hex.substr(2, 2), 16) / 255,
					parseInt(hex.substr(4, 2), 16) / 255
				];
			} catch (error) {
				console.warn('Invalid color format:', newColor);
			}
		}
		
		updateMousePosition(x: number, y: number, isDown: boolean): void {
			this.mouseState.velocity.x = x - this.mouseState.lastX;
			this.mouseState.velocity.y = y - this.mouseState.lastY;
			this.mouseState.lastX = this.mouseState.x;
			this.mouseState.lastY = this.mouseState.y;
			this.mouseState.x = x;
			this.mouseState.y = y;
			this.mouseState.isDown = isDown;
			this.mouseState.influence = mouseInfluenceRadius;
			
			lastInteractionTime = Date.now();
		}
		
		updateTouchPosition(x: number, y: number, isActive: boolean): void {
			this.touchState.x = x;
			this.touchState.y = y;
			
			if (isActive && !this.touchState.isActive) {
				this.touchState.startTime = Date.now();
			}
			
			this.touchState.isActive = isActive;
			lastInteractionTime = Date.now();
		}
		
		updateParticleCount(newCount: number): void {
			const adjustedCount = isMobile ? Math.min(newCount, 50) : newCount;
			const currentCount = this.particles.length;
			
			if (adjustedCount > currentCount) {
				for (let i = currentCount; i < adjustedCount; i++) {
					this.particles.push(this.createParticle());
				}
			} else if (adjustedCount < currentCount) {
				this.particles.splice(adjustedCount);
			}
		}
		
		setVisibility(visible: boolean): void {
			isVisible = visible;
		}
		
		destroy(): void {
			if (this.program) {
				this.gl.deleteProgram(this.program);
			}
			
			for (const buffer of this.buffers.values()) {
				this.gl.deleteBuffer(buffer);
			}
			
			if (this.vao) {
				this.gl.deleteVertexArrayObject(this.vao);
			}
		}
	}
	
	onMount(async () => {
		if (!browser) return;
		
		try {
			performanceMonitor = new PerformanceMonitor();
			isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
			
			const context = canvas.getContext('webgl2', {
				alpha: true,
				antialias: !isMobile,
				powerPreference: isMobile ? 'default' : 'high-performance',
				preserveDrawingBuffer: false,
				premultipliedAlpha: true
			});
			
			if (!context) {
				console.warn('WebGL2 not available');
				dispatch('fallback', { reason: 'webgl-unavailable' });
				return;
			}
			
			hasWebGL2 = true;
			particleSystem = new ParticleNexusSystem(context, canvas);
			isInitialized = true;
			
			setupResizeObserver();
			startAnimationLoop();
			
			dispatch('initialized', { hasWebGL2, isMobile, particleCount: count });
			
		} catch (error) {
			console.error('ParticleSystem initialization failed:', error);
			dispatch('error', { error: error.message });
		}
	});
	
	onDestroy(() => {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
		
		if (particleSystem) {
			particleSystem.destroy();
		}
		
		if (resizeObserver) {
			resizeObserver.disconnect();
		}
		
		if (performanceMonitor) {
			performanceMonitor.destroy();
		}
	});
	
	function setupResizeObserver(): void {
		if (typeof ResizeObserver === 'undefined') return;
		
		resizeObserver = new ResizeObserver(debounce(() => {
			updateCanvasSize();
		}, 150));
		
		resizeObserver.observe(canvas);
	}
	
	function updateCanvasSize(): void {
		if (!canvas) return;
		
		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		
		windowWidth = canvas.width;
		windowHeight = canvas.height;
		
		if (particleSystem) {
			particleSystem.updateParticleCount(count);
		}
	}
	
	function startAnimationLoop(): void {
		let lastTime = 0;
		let frameCount = 0;
		
		const animate = (currentTime: number) => {
			if (!particleSystem || !isInitialized || !enabled) {
				animationFrame = requestAnimationFrame(animate);
				return;
			}
			
			const deltaTime = currentTime - lastTime;
			lastTime = currentTime;
			frameCount++;
			
			const profileId = performanceMonitor?.startProfile('particle-frame');
			
			try {
				particleSystem.update(deltaTime);
				particleSystem.render(currentTime);
			} catch (error) {
				console.error('Animation loop error:', error);
			}
			
			if (profileId && performanceMonitor) {
				performanceMonitor.endProfile(profileId);
			}
			
			if (frameCount % 60 === 0 && performanceMonitor) {
				const metrics = performanceMonitor.getMetrics();
				dispatch('performance', { metrics, frameCount });
			}
			
			animationFrame = requestAnimationFrame(animate);
		};
		
		animationFrame = requestAnimationFrame(animate);
	}
	
	const handleMouseMove = throttle((event: MouseEvent) => {
		if (particleSystem && (Date.now() - lastInteractionTime < 8000 || event.buttons > 0)) {
			const rect = canvas.getBoundingClientRect();
			const x = (event.clientX - rect.left) * (canvas.width / rect.width);
			const y = (event.clientY - rect.top) * (canvas.height / rect.height);
			particleSystem.updateMousePosition(x, y, event.buttons > 0);
		}
	}, 16);
	
	const handleMouseDown = (event: MouseEvent) => {
		if (particleSystem) {
			const rect = canvas.getBoundingClientRect();
			const x = (event.clientX - rect.left) * (canvas.width / rect.width);
			const y = (event.clientY - rect.top) * (canvas.height / rect.height);
			particleSystem.updateMousePosition(x, y, true);
		}
	};
	
	const handleMouseUp = (event: MouseEvent) => {
		if (particleSystem) {
			const rect = canvas.getBoundingClientRect();
			const x = (event.clientX - rect.left) * (canvas.width / rect.width);
			const y = (event.clientY - rect.top) * (canvas.height / rect.height);
			particleSystem.updateMousePosition(x, y, false);
		}
	};
	
	const handleTouchStart = (event: TouchEvent) => {
		if (particleSystem && event.touches.length > 0) {
			event.preventDefault();
			const touch = event.touches[0];
			const rect = canvas.getBoundingClientRect();
			const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
			const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
			particleSystem.updateTouchPosition(x, y, true);
		}
	};
	
	const handleTouchMove = throttle((event: TouchEvent) => {
		if (particleSystem && event.touches.length > 0) {
			event.preventDefault();
			const touch = event.touches[0];
			const rect = canvas.getBoundingClientRect();
			const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
			const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
			particleSystem.updateTouchPosition(x, y, true);
		}
	}, 16);
	
	const handleTouchEnd = (event: TouchEvent) => {
		if (particleSystem) {
			event.preventDefault();
			particleSystem.updateTouchPosition(0, 0, false);
		}
	};
	
	const handleVisibilityChange = () => {
		isVisible = !document.hidden;
		if (particleSystem) {
			particleSystem.setVisibility(isVisible);
		}
	};
	
	export function getPerformanceMetrics() {
		return performanceMonitor?.getMetrics();
	}
	
	export function addEffect(x: number, y: number, type: 'burst' | 'ripple' = 'burst') {
		dispatch('effect', { x, y, type });
	}
	
	$effect(() => {
		if (particleSystem && dominantColor) {
			particleSystem.updateColor(dominantColor);
		}
	});
	
	$effect(() => {
		if (particleSystem && count) {
			particleSystem.updateParticleCount(count);
		}
	});
	
	$effect(() => {
		if (browser) {
			document.addEventListener('visibilitychange', handleVisibilityChange);
			return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
	});
</script>

<canvas
	bind:this={canvas}
	width={windowWidth}
	height={windowHeight}
	class="particle-canvas"
	class:enabled
	class:mobile={isMobile}
	class:high-performance={performanceMode === 'high'}
	onmousemove={handleMouseMove}
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	style:position="absolute"
	style:top="0"
	style:left="0"
	style:width="100%"
	style:height="100%"
	style:pointer-events={enabled ? 'auto' : 'none'}
	style:z-index="1"
	style:opacity={opacity}
	aria-label="Interactive particle animation background"
	aria-hidden={!enabled}
></canvas>

<style>
	.particle-canvas {
		display: block;
		transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: transform;
		touch-action: none;
	}
	
	.particle-canvas.enabled {
		cursor: crosshair;
	}
	
	.particle-canvas.mobile {
		touch-action: pan-x pan-y;
	}
	
	.particle-canvas.high-performance {
		image-rendering: auto;
		image-rendering: crisp-edges;
		image-rendering: pixelated;
	}
	
	@media (prefers-reduced-motion: reduce) {
		.particle-canvas {
			opacity: 0.3;
		}
	}
	
	@media (max-width: 768px) {
		.particle-canvas.enabled {
			cursor: default;
		}
	}
	
	@media (hover: none) and (pointer: coarse) {
		.particle-canvas {
			touch-action: manipulation;
		}
	}
</style>
