<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { PerformanceMonitor } from '$lib/performance';
	import { debounce, throttle } from '$lib/utils';
	
	export let count = 80;
	export let windowWidth = 0;
	export let windowHeight = 0;
	export let dominantColor = '#4a90e2';
	export let enabled = true;
	export let mouseInfluenceRadius = 150;
	export let opacity = 1.0;
	export let speed = 1.0;
	export let performanceMode: 'low' | 'medium' | 'high' = 'high';
	
	let canvas: HTMLCanvasElement;
	let particleSystem: ParticleNexusSystem | null = null;
	let animationFrame: number;
	let isInitialized = false;
	let lastInteractionTime = 0;
	let hasWebGL2 = false;
	let isMobile = false;
	let performanceMonitor = new PerformanceMonitor();
	let resizeObserver: ResizeObserver | null = null;
	
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
		behavior: {
			cohesionRadius: number;
			separationRadius: number;
			alignmentRadius: number;
			maxSpeed: number;
			maxForce: number;
		};
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
		
		void main() {
			vec2 position = (a_position / u_resolution) * 2.0 - 1.0;
			position.y = -position.y;
			
			float breathing = sin(u_time * 2.0 + a_phase) * 0.1 + 1.0;
			float currentSize = a_size * breathing * u_dpr;
			
			if (!u_isVisible) {
				currentSize *= 0.7;
			}
			
			gl_Position = vec4(position, 0.0, 1.0);
			gl_PointSize = max(currentSize, 1.0);
			
			v_opacity = a_opacity * u_globalOpacity;
			v_color = a_color;
			v_glow = breathing;
		}
	`;
	
	const FRAGMENT_SHADER = `#version 300 es
		precision mediump float;
		
		in float v_opacity;
		in vec3 v_color;
		in float v_glow;
		
		out vec4 fragColor;
		
		void main() {
			vec2 center = gl_PointCoord - 0.5;
			float distance = length(center);
			
			if (distance > 0.5) discard;
			
			float alpha = 1.0 - smoothstep(0.2, 0.5, distance);
			float glow = 1.0 - smoothstep(0.0, 0.6, distance);
			
			vec3 finalColor = mix(v_color, v_color + vec3(0.2), v_glow * glow * 0.5);
			
			fragColor = vec4(finalColor, alpha * v_opacity);
		}
	`;
	
	class ParticleNexusSystem {
		private particles: Particle[] = [];
		private program: WebGLProgram | null = null;
		private positionBuffer: WebGLBuffer | null = null;
		private sizeBuffer: WebGLBuffer | null = null;
		private opacityBuffer: WebGLBuffer | null = null;
		private colorBuffer: WebGLBuffer | null = null;
		private phaseBuffer: WebGLBuffer | null = null;
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
		private colorTransitionSpeed = 0.02;
		
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
			
			this.positionBuffer = this.gl.createBuffer();
			this.sizeBuffer = this.gl.createBuffer();
			this.opacityBuffer = this.gl.createBuffer();
			this.colorBuffer = this.gl.createBuffer();
			this.phaseBuffer = this.gl.createBuffer();
			
			if (!this.positionBuffer || !this.sizeBuffer || !this.opacityBuffer || 
				!this.colorBuffer || !this.phaseBuffer) {
				throw new Error('Failed to create buffers');
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
			
			for (let i = 0; i < count; i++) {
				this.particles.push(this.createParticle());
			}
		}
		
		private createParticle(): Particle {
			const baseSize = performanceMode === 'high' ? 6 : performanceMode === 'medium' ? 4 : 3;
			
			return {
				x: Math.random() * this.canvasElement.width,
				y: Math.random() * this.canvasElement.height,
				vx: (Math.random() - 0.5) * 2 * speed,
				vy: (Math.random() - 0.5) * 2 * speed,
				size: baseSize + Math.random() * 4,
				opacity: 0.1 + Math.random() * 0.7,
				color: [...this.currentColor] as [number, number, number],
				phase: Math.random() * Math.PI * 2,
				originalSize: baseSize + Math.random() * 4,
				isActive: true,
				lifetime: 0,
				maxLifetime: 5000 + Math.random() * 10000,
				behavior: {
					cohesionRadius: 80,
					separationRadius: 25,
					alignmentRadius: 50,
					maxSpeed: 2 * speed,
					maxForce: 0.05
				}
			};
		}
		
		update(deltaTime: number): void {
			if (!enabled) return;
			
			// Update color transition
			this.updateColorTransition();
			
			// Update particles
			for (let i = this.particles.length - 1; i >= 0; i--) {
				const particle = this.particles[i];
				
				particle.lifetime += deltaTime;
				
				// Respawn particle if lifetime exceeded
				if (particle.lifetime > particle.maxLifetime) {
					this.particles[i] = this.createParticle();
					continue;
				}
				
				// Apply behaviors based on performance mode
				if (performanceMode === 'high') {
					this.applyBehaviors(particle);
				} else {
					this.applySimpleBehaviors(particle);
				}
				
				// Update position
				particle.x += particle.vx;
				particle.y += particle.vy;
				
				// Boundary wrapping
				this.wrapBoundaries(particle);
				
				// Update phase for animation
				particle.phase += 0.02;
			}
		}
		
		private updateColorTransition(): void {
			for (let i = 0; i < 3; i++) {
				const diff = this.targetColor[i] - this.currentColor[i];
				if (Math.abs(diff) > 0.001) {
					this.currentColor[i] += diff * this.colorTransitionSpeed;
				}
			}
		}
		
		private applyBehaviors(particle: Particle): void {
			// Mouse/touch influence
			const mouseForce = this.mouseInfluence(particle);
			const touchForce = this.touchInfluence(particle);
			
			// Flocking behaviors (expensive)
			const cohesion = this.cohesion(particle);
			const separation = this.separation(particle);
			const alignment = this.alignment(particle);
			
			// Apply forces
			particle.vx += (mouseForce.x + touchForce.x + cohesion.x * 0.3 + separation.x * 0.8 + alignment.x * 0.2) * 0.1;
			particle.vy += (mouseForce.y + touchForce.y + cohesion.y * 0.3 + separation.y * 0.8 + alignment.y * 0.2) * 0.1;
			
			// Limit velocity
			const speed = Math.sqrt(particle.vx ** 2 + particle.vy ** 2);
			if (speed > particle.behavior.maxSpeed) {
				particle.vx = (particle.vx / speed) * particle.behavior.maxSpeed;
				particle.vy = (particle.vy / speed) * particle.behavior.maxSpeed;
			}
		}
		
		private applySimpleBehaviors(particle: Particle): void {
			// Only mouse influence and basic wandering for performance
			const mouseForce = this.mouseInfluence(particle);
			const touchForce = this.touchInfluence(particle);
			const wander = { x: (Math.random() - 0.5) * 0.1, y: (Math.random() - 0.5) * 0.1 };
			
			particle.vx += (mouseForce.x + touchForce.x + wander.x) * 0.1;
			particle.vy += (mouseForce.y + touchForce.y + wander.y) * 0.1;
			
			// Simple velocity limiting
			const maxSpeed = particle.behavior.maxSpeed * 0.7;
			particle.vx = Math.max(-maxSpeed, Math.min(maxSpeed, particle.vx));
			particle.vy = Math.max(-maxSpeed, Math.min(maxSpeed, particle.vy));
		}
		
		private mouseInfluence(particle: Particle): { x: number; y: number } {
			const dx = particle.x - this.mouseState.x;
			const dy = particle.y - this.mouseState.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			if (distance > this.mouseState.influence || distance === 0) return { x: 0, y: 0 };
			
			const force = this.mouseState.isDown ? 2.0 : 0.5;
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
			const force = Math.min(touchDuration / 500, 1.5); // Increase force over time
			const strength = (1 - distance / this.mouseState.influence) * force;
			
			return {
				x: -(dx / distance) * strength,
				y: -(dy / distance) * strength
			};
		}
		
		private cohesion(particle: Particle): { x: number; y: number } {
			let centerX = 0, centerY = 0, count = 0;
			
			for (const other of this.particles) {
				if (other === particle) continue;
				const distance = this.distance(particle, other);
				if (distance < particle.behavior.cohesionRadius) {
					centerX += other.x;
					centerY += other.y;
					count++;
				}
			}
			
			if (count === 0) return { x: 0, y: 0 };
			
			centerX /= count;
			centerY /= count;
			
			return this.seek(particle, centerX, centerY);
		}
		
		private separation(particle: Particle): { x: number; y: number } {
			let steerX = 0, steerY = 0, count = 0;
			
			for (const other of this.particles) {
				if (other === particle) continue;
				const distance = this.distance(particle, other);
				if (distance < particle.behavior.separationRadius && distance > 0) {
					const diffX = particle.x - other.x;
					const diffY = particle.y - other.y;
					const normalized = Math.sqrt(diffX ** 2 + diffY ** 2);
					steerX += (diffX / normalized) / distance;
					steerY += (diffY / normalized) / distance;
					count++;
				}
			}
			
			if (count === 0) return { x: 0, y: 0 };
			
			steerX /= count;
			steerY /= count;
			
			const magnitude = Math.sqrt(steerX ** 2 + steerY ** 2);
			if (magnitude > 0) {
				steerX = (steerX / magnitude) * particle.behavior.maxSpeed - particle.vx;
				steerY = (steerY / magnitude) * particle.behavior.maxSpeed - particle.vy;
			}
			
			return { x: steerX, y: steerY };
		}
		
		private alignment(particle: Particle): { x: number; y: number } {
			let velocityX = 0, velocityY = 0, count = 0;
			
			for (const other of this.particles) {
				if (other === particle) continue;
				const distance = this.distance(particle, other);
				if (distance < particle.behavior.alignmentRadius) {
					velocityX += other.vx;
					velocityY += other.vy;
					count++;
				}
			}
			
			if (count === 0) return { x: 0, y: 0 };
			
			velocityX /= count;
			velocityY /= count;
			
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
			
			// Set uniforms
			const resolution = this.uniformLocations.get('u_resolution');
			if (resolution) {
				this.gl.uniform2f(resolution, this.canvasElement.width, this.canvasElement.height);
			}
			
			const timeUniform = this.uniformLocations.get('u_time');
			if (timeUniform) {
				this.gl.uniform1f(timeUniform, time * 0.001);
			}
			
			const opacityUniform = this.uniformLocations.get('u_globalOpacity');
			if (opacityUniform) {
				this.gl.uniform1f(opacityUniform, opacity);
			}
			
			const visibleUniform = this.uniformLocations.get('u_isVisible');
			if (visibleUniform) {
				this.gl.uniform1i(visibleUniform, enabled ? 1 : 0);
			}
			
			const dprUniform = this.uniformLocations.get('u_dpr');
			if (dprUniform) {
				this.gl.uniform1f(dprUniform, window.devicePixelRatio || 1);
			}
			
			this.updateBuffers();
			
			// Set GL state
			this.gl.enable(this.gl.BLEND);
			this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
			this.gl.clearColor(0, 0, 0, 0);
			this.gl.clear(this.gl.COLOR_BUFFER_BIT);
			
			// Draw particles
			this.gl.drawArrays(this.gl.POINTS, 0, this.particles.length);
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
			
			this.updateBuffer(this.positionBuffer!, positions, 'a_position', 2);
			this.updateBuffer(this.sizeBuffer!, sizes, 'a_size', 1);
			this.updateBuffer(this.opacityBuffer!, opacities, 'a_opacity', 1);
			this.updateBuffer(this.colorBuffer!, colors, 'a_color', 3);
			this.updateBuffer(this.phaseBuffer!, phases, 'a_phase', 1);
		}
		
		private updateBuffer(buffer: WebGLBuffer, data: Float32Array, attributeName: string, size: number): void {
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
			const currentCount = this.particles.length;
			
			if (newCount > currentCount) {
				for (let i = currentCount; i < newCount; i++) {
					this.particles.push(this.createParticle());
				}
			} else if (newCount < currentCount) {
				this.particles.splice(newCount);
			}
		}
		
		destroy(): void {
			if (this.program) {
				this.gl.deleteProgram(this.program);
			}
			
			[this.positionBuffer, this.sizeBuffer, this.opacityBuffer, this.colorBuffer, this.phaseBuffer]
				.forEach(buffer => {
					if (buffer) this.gl.deleteBuffer(buffer);
				});
			
			if (this.vao) {
				this.gl.deleteVertexArrayObject(this.vao);
			}
		}
	}
	
	onMount(async () => {
		if (!browser) return;
		
		try {
			// Detect device capabilities
			isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
			
			// Setup canvas with proper DPI scaling
			const context = canvas.getContext('webgl2', {
				alpha: true,
				antialias: !isMobile,
				powerPreference: 'high-performance'
			});
			
			if (!context) {
				console.warn('WebGL2 not available');
				dispatch('fallback', { reason: 'webgl-unavailable' });
				return;
			}
			
			hasWebGL2 = true;
			particleSystem = new ParticleNexusSystem(context, canvas);
			isInitialized = true;
			
			// Setup resize observer
			setupResizeObserver();
			
			// Start animation loop
			startAnimationLoop();
			
			dispatch('initialized', { hasWebGL2, isMobile });
			
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
		
		performanceMonitor.destroy();
	});
	
	function setupResizeObserver(): void {
		if (typeof ResizeObserver === 'undefined') return;
		
		resizeObserver = new ResizeObserver(debounce(() => {
			updateCanvasSize();
		}, 100));
		
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
			// Recreate particles with new bounds
			particleSystem.updateParticleCount(count);
		}
	}
	
	function startAnimationLoop(): void {
		let lastTime = 0;
		
		const animate = (currentTime: number) => {
			if (!particleSystem || !isInitialized) return;
			
			const deltaTime = currentTime - lastTime;
			lastTime = currentTime;
			
			// Performance monitoring
			const profileId = performanceMonitor.startProfile('particle-frame');
			
			try {
				particleSystem.update(deltaTime);
				particleSystem.render(currentTime);
			} catch (error) {
				console.error('Animation loop error:', error);
			}
			
			performanceMonitor.endProfile(profileId);
			
			animationFrame = requestAnimationFrame(animate);
		};
		
		animationFrame = requestAnimationFrame(animate);
	}
	
	// Optimized mouse handlers
	const handleMouseMove = throttle((event: MouseEvent) => {
		if (particleSystem && Date.now() - lastInteractionTime < 5000) {
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
	
	// Touch handlers for mobile
	const handleTouchStart = (event: TouchEvent) => {
		if (particleSystem && event.touches.length > 0) {
			const touch = event.touches[0];
			const rect = canvas.getBoundingClientRect();
			const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
			const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
			particleSystem.updateTouchPosition(x, y, true);
		}
	};
	
	const handleTouchMove = throttle((event: TouchEvent) => {
		if (particleSystem && event.touches.length > 0) {
			const touch = event.touches[0];
			const rect = canvas.getBoundingClientRect();
			const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
			const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
			particleSystem.updateTouchPosition(x, y, true);
		}
	}, 16);
	
	const handleTouchEnd = () => {
		if (particleSystem) {
			particleSystem.updateTouchPosition(0, 0, false);
		}
	};
	
	// Reactive updates
	$: if (particleSystem && dominantColor) {
		particleSystem.updateColor(dominantColor);
	}
	
	$: if (particleSystem && count) {
		particleSystem.updateParticleCount(count);
	}
	
	// Public API
	export function getPerformanceMetrics() {
		return performanceMonitor.getMetrics();
	}
	
	export function addEffect(x: number, y: number, type: 'burst' | 'ripple' = 'burst') {
		// Could implement special effects here
		dispatch('effect', { x, y, type });
	}
</script>

<canvas
	bind:this={canvas}
	width={windowWidth}
	height={windowHeight}
	class="particle-canvas"
	class:enabled
	class:mobile={isMobile}
	class:high-performance={performanceMode === 'high'}
	on:mousemove={handleMouseMove}
	on:mousedown={handleMouseDown}
	on:mouseup={handleMouseUp}
	on:touchstart={handleTouchStart}
	on:touchmove={handleTouchMove}
	on:touchend={handleTouchEnd}
	style="
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: {enabled ? 'auto' : 'none'};
		z-index: 1;
		opacity: {opacity};
	"
	role="img"
	aria-label="Interactive particle animation background"
	aria-hidden={!enabled}
></canvas>

<style>
	.particle-canvas {
		display: block;
		transition: opacity 0.3s ease;
		will-change: transform;
	}
	
	.particle-canvas.enabled {
		cursor: none;
	}
	
	.particle-canvas.mobile {
		touch-action: manipulation;
	}
	
	.particle-canvas.high-performance {
		image-rendering: auto;
		image-rendering: crisp-edges;
		image-rendering: pixelated;
	}
	
	@media (prefers-reduced-motion: reduce) {
		.particle-canvas {
			display: none;
		}
	}
	
	@media (max-width: 768px) {
		.particle-canvas {
			pointer-events: none;
		}
	}
</style>
