<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut, sineInOut } from 'svelte/easing';
	
	export let count: number = 75;
	export let windowWidth: number = 0;
	export let windowHeight: number = 0;
	export let dominantColor: string = '#ffffff';
	export let settings: any;
	
	let canvasElement: HTMLCanvasElement;
	let gl: WebGL2RenderingContext | null = null;
	let particleSystem: ParticleNexusSystem | null = null;
	let isVisible = true;
	let lastFrameTime = 0;
	let frameCount = 0;
	let fps = 60;
	
	const colorTransition = tweened(0, { duration: 1200, easing: cubicOut });
	const disperseEffect = tweened(0, { duration: 800, easing: cubicOut });
	
	interface Particle {
		id: number;
		x: number;
		y: number;
		vx: number;
		vy: number;
		targetX?: number;
		targetY?: number;
		size: number;
		baseSize: number;
		opacity: number;
		baseOpacity: number;
		life: number;
		phase: number;
		behavior: ParticleBehavior;
		color: Float32Array;
		targetColor: Float32Array;
		energy: number;
		mass: number;
		age: number;
	}
	
	interface ParticleBehavior {
		type: 'organic' | 'linear' | 'vortex' | 'dispersed';
		wanderAngle: number;
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
	}
	
	const VERTEX_SHADER = `#version 300 es
		precision highp float;
		
		in vec2 a_position;
		in float a_size;
		in float a_opacity;
		in vec3 a_color;
		in float a_phase;
		
		uniform vec2 u_resolution;
		uniform float u_time;
		uniform float u_globalOpacity;
		uniform bool u_isVisible;
		
		out float v_opacity;
		out vec3 v_color;
		out float v_glow;
		
		void main() {
			vec2 position = ((a_position / u_resolution) * 2.0 - 1.0) * vec2(1, -1);
			
			float breathing = sin(u_time * 2.0 + a_phase) * 0.1 + 1.0;
			float currentSize = a_size * breathing;
			
			if (!u_isVisible) {
				currentSize *= 0.7;
			}
			
			gl_Position = vec4(position, 0.0, 1.0);
			gl_PointSize = currentSize;
			
			v_opacity = a_opacity * u_globalOpacity;
			v_color = a_color;
			v_glow = breathing;
		}
	`;
	
	const FRAGMENT_SHADER = `#version 300 es
		precision highp float;
		
		in float v_opacity;
		in vec3 v_color;
		in float v_glow;
		
		out vec4 fragColor;
		
		void main() {
			vec2 center = gl_PointCoord - 0.5;
			float distance = length(center);
			
			if (distance > 0.5) discard;
			
			float alpha = 1.0 - smoothstep(0.3, 0.5, distance);
			float glow = 1.0 - smoothstep(0.0, 0.7, distance);
			
			vec3 finalColor = v_color + vec3(0.1, 0.1, 0.1) * v_glow * glow;
			
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
		
		private mouseState: MouseState = {
			x: 0, y: 0, isDown: false,
			velocity: { x: 0, y: 0 },
			influence: 100
		};
		
		private bookmarkHover: { x: number; y: number; active: boolean } = {
			x: 0, y: 0, active: false
		};
		
		private currentColor = new Float32Array([1, 1, 1]);
		private targetColor = new Float32Array([1, 1, 1]);
		private colorLerpSpeed = 0.02;
		
		private performanceLevel: 'high' | 'medium' | 'low' = 'high';
		private lastPerformanceCheck = 0;
		
		constructor(private gl: WebGL2RenderingContext, private canvas: HTMLCanvasElement) {
			this.initShaders();
			this.initBuffers();
			this.detectPerformance();
			this.initParticles();
		}
		
		private initShaders(): void {
			const vertexShader = this.createShader(this.gl.VERTEX_SHADER, VERTEX_SHADER);
			const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
			
			if (!vertexShader || !fragmentShader) return;
			
			this.program = this.gl.createProgram()!;
			this.gl.attachShader(this.program, vertexShader);
			this.gl.attachShader(this.program, fragmentShader);
			this.gl.linkProgram(this.program);
			
			if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
				console.error('Program linking failed:', this.gl.getProgramInfoLog(this.program));
			}
		}
		
		private createShader(type: number, source: string): WebGLShader | null {
			const shader = this.gl.createShader(type)!;
			this.gl.shaderSource(shader, source);
			this.gl.compileShader(shader);
			
			if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
				console.error('Shader compilation failed:', this.gl.getShaderInfoLog(shader));
				return null;
			}
			return shader;
		}
		
		private initBuffers(): void {
			this.vao = this.gl.createVertexArrayObject()!;
			this.gl.bindVertexArrayObject(this.vao);
			
			this.positionBuffer = this.gl.createBuffer()!;
			this.sizeBuffer = this.gl.createBuffer()!;
			this.opacityBuffer = this.gl.createBuffer()!;
			this.colorBuffer = this.gl.createBuffer()!;
			this.phaseBuffer = this.gl.createBuffer()!;
		}
		
		private detectPerformance(): void {
			const debugInfo = this.gl.getExtension('WEBGL_debug_renderer_info');
			const renderer = debugInfo ? this.gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
			
			if (renderer.includes('Apple M1') || renderer.includes('Apple M2')) {
				this.performanceLevel = 'high';
			} else if (renderer.includes('Intel') || renderer.includes('AMD')) {
				this.performanceLevel = 'medium';
			} else {
				this.performanceLevel = 'low';
			}
		}
		
		private initParticles(): void {
			this.particles = [];
			const actualCount = this.getAdjustedParticleCount();
			
			for (let i = 0; i < actualCount; i++) {
				this.particles.push(this.createParticle(i));
			}
		}
		
		private getAdjustedParticleCount(): number {
			const baseCount = Math.min(count, this.getMaxParticleCount());
			
			if (!isVisible) return Math.floor(baseCount * 0.6);
			
			switch (this.performanceLevel) {
				case 'high': return baseCount;
				case 'medium': return Math.floor(baseCount * 0.8);
				case 'low': return Math.floor(baseCount * 0.5);
				default: return baseCount;
			}
		}
		
		private getMaxParticleCount(): number {
			const screenArea = windowWidth * windowHeight;
			const particlePerPixel = this.performanceLevel === 'high' ? 8000 : 12000;
			return Math.min(150, Math.floor(screenArea / particlePerPixel));
		}
		
		private createParticle(id: number): Particle {
			const behavior = this.createOrganicBehavior();
			const baseSize = this.getParticleSize();
			const baseOpacity = 0.4 + Math.random() * 0.4;
			
			return {
				id,
				x: Math.random() * windowWidth,
				y: Math.random() * windowHeight,
				vx: (Math.random() - 0.5) * behavior.maxSpeed,
				vy: (Math.random() - 0.5) * behavior.maxSpeed,
				size: baseSize,
				baseSize,
				opacity: baseOpacity,
				baseOpacity,
				life: 1,
				phase: Math.random() * Math.PI * 2,
				behavior,
				color: new Float32Array([...this.currentColor]),
				targetColor: new Float32Array([...this.targetColor]),
				energy: 0.5 + Math.random() * 0.5,
				mass: 0.5 + Math.random() * 0.5,
				age: 0
			};
		}
		
		private createOrganicBehavior(): ParticleBehavior {
			return {
				type: 'organic',
				wanderAngle: Math.random() * Math.PI * 2,
				cohesionRadius: 60 + Math.random() * 40,
				separationRadius: 25 + Math.random() * 15,
				alignmentRadius: 40 + Math.random() * 20,
				maxSpeed: 0.3 + Math.random() * 0.4,
				maxForce: 0.02 + Math.random() * 0.01
			};
		}
		
		private getParticleSize(): number {
			const baseSize = this.performanceLevel === 'high' ? 3 : 2;
			return baseSize + Math.random() * 2;
		}
		
		updateMousePosition(x: number, y: number, isDown: boolean): void {
			const prevX = this.mouseState.x;
			const prevY = this.mouseState.y;
			
			this.mouseState.x = x;
			this.mouseState.y = y;
			this.mouseState.isDown = isDown;
			this.mouseState.velocity.x = x - prevX;
			this.mouseState.velocity.y = y - prevY;
			this.mouseState.influence = isDown ? 150 : 100;
		}
		
		setBookmarkHover(x: number, y: number, active: boolean): void {
			this.bookmarkHover.x = x;
			this.bookmarkHover.y = y;
			this.bookmarkHover.active = active;
		}
		
		setDominantColor(color: string): void {
			const rgb = this.hexToRgb(color);
			this.targetColor[0] = rgb.r / 255;
			this.targetColor[1] = rgb.g / 255;
			this.targetColor[2] = rgb.b / 255;
		}
		
		triggerWallpaperChange(): void {
			disperseEffect.set(1).then(() => {
				setTimeout(() => {
					disperseEffect.set(0);
				}, 300);
			});
		}
		
		private hexToRgb(hex: string): { r: number; g: number; b: number } {
			const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
			return result ? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			} : { r: 255, g: 255, b: 255 };
		}
		
		update(deltaTime: number, time: number): void {
			this.updatePerformance();
			this.updateGlobalColor();
			
			const disperseAmount = $disperseEffect;
			
			for (const particle of this.particles) {
				this.updateParticle(particle, deltaTime, time, disperseAmount);
			}
			
			this.updateBuffers();
		}
		
		private updatePerformance(): void {
			if (performance.now() - this.lastPerformanceCheck > 5000) {
				this.lastPerformanceCheck = performance.now();
				
				if (fps < 45 && this.performanceLevel === 'high') {
					this.performanceLevel = 'medium';
					this.adjustParticleCount();
				} else if (fps < 25 && this.performanceLevel === 'medium') {
					this.performanceLevel = 'low';
					this.adjustParticleCount();
				}
			}
		}
		
		private adjustParticleCount(): void {
			const newCount = this.getAdjustedParticleCount();
			if (newCount < this.particles.length) {
				this.particles.splice(newCount);
			}
		}
		
		private updateGlobalColor(): void {
			for (let i = 0; i < 3; i++) {
				this.currentColor[i] += (this.targetColor[i] - this.currentColor[i]) * this.colorLerpSpeed;
			}
		}
		
		private updateParticle(particle: Particle, deltaTime: number, time: number, disperseAmount: number): void {
			particle.age += deltaTime;
			
			// Update color lerp
			for (let i = 0; i < 3; i++) {
				particle.color[i] += (this.currentColor[i] - particle.color[i]) * 0.03;
			}
			
			// Disperse effect during wallpaper change
			if (disperseAmount > 0) {
				this.applyDisperseEffect(particle, disperseAmount);
				return;
			}
			
			// Apply forces based on behavior
			const force = this.calculateForces(particle);
			
			// Apply mouse interaction
			this.applyMouseInteraction(particle, force);
			
			// Apply bookmark hover effect
			if (this.bookmarkHover.active) {
				this.applyBookmarkSwirl(particle, force);
			}
			
			// Update velocity and position
			particle.vx += force.x * deltaTime;
			particle.vy += force.y * deltaTime;
			
			// Apply drag
			particle.vx *= 0.99;
			particle.vy *= 0.99;
			
			// Limit speed
			const speed = Math.sqrt(particle.vx ** 2 + particle.vy ** 2);
			if (speed > particle.behavior.maxSpeed) {
				particle.vx = (particle.vx / speed) * particle.behavior.maxSpeed;
				particle.vy = (particle.vy / speed) * particle.behavior.maxSpeed;
			}
			
			particle.x += particle.vx * deltaTime * 60;
			particle.y += particle.vy * deltaTime * 60;
			
			// Wrap around screen edges
			this.wrapParticle(particle);
			
			// Update breathing animation
			particle.size = particle.baseSize * (1 + Math.sin(time * 2 + particle.phase) * 0.1);
			particle.opacity = particle.baseOpacity * (1 + Math.sin(time * 1.5 + particle.phase) * 0.1);
		}
		
		private applyDisperseEffect(particle: Particle, amount: number): void {
			const targetX = (particle.id % 10) * (windowWidth / 10) + windowWidth / 20;
			const targetY = Math.floor(particle.id / 10) * (windowHeight / 8) + windowHeight / 16;
			
			particle.x += (targetX - particle.x) * amount * 0.1;
			particle.y += (targetY - particle.y) * amount * 0.1;
			particle.opacity = particle.baseOpacity * (1 - amount * 0.5);
		}
		
		private calculateForces(particle: Particle): { x: number; y: number } {
			switch (particle.behavior.type) {
				case 'organic':
					return this.calculateOrganicForces(particle);
				default:
					return { x: 0, y: 0 };
			}
		}
		
		private calculateOrganicForces(particle: Particle): { x: number; y: number } {
			const cohesion = this.cohesion(particle);
			const separation = this.separation(particle);
			const alignment = this.alignment(particle);
			const wander = this.wander(particle);
			
			return {
				x: cohesion.x * 0.3 + separation.x * 1.5 + alignment.x * 0.5 + wander.x * 0.8,
				y: cohesion.y * 0.3 + separation.y * 1.5 + alignment.y * 0.5 + wander.y * 0.8
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
			
			return this.seek(particle, { x: centerX, y: centerY });
		}
		
		private separation(particle: Particle): { x: number; y: number } {
			let steerX = 0, steerY = 0, count = 0;
			
			for (const other of this.particles) {
				if (other === particle) continue;
				const distance = this.distance(particle, other);
				if (distance < particle.behavior.separationRadius && distance > 0) {
					const diffX = particle.x - other.x;
					const diffY = particle.y - other.y;
					const normalizedDiffX = diffX / distance;
					const normalizedDiffY = diffY / distance;
					
					steerX += normalizedDiffX / distance;
					steerY += normalizedDiffY / distance;
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
				
				const steerMagnitude = Math.sqrt(steerX ** 2 + steerY ** 2);
				if (steerMagnitude > particle.behavior.maxForce) {
					steerX = (steerX / steerMagnitude) * particle.behavior.maxForce;
					steerY = (steerY / steerMagnitude) * particle.behavior.maxForce;
				}
			}
			
			return { x: steerX, y: steerY };
		}
		
		private alignment(particle: Particle): { x: number; y: number } {
			let avgVx = 0, avgVy = 0, count = 0;
			
			for (const other of this.particles) {
				if (other === particle) continue;
				const distance = this.distance(particle, other);
				if (distance < particle.behavior.alignmentRadius) {
					avgVx += other.vx;
					avgVy += other.vy;
					count++;
				}
			}
			
			if (count === 0) return { x: 0, y: 0 };
			
			avgVx /= count;
			avgVy /= count;
			
			const magnitude = Math.sqrt(avgVx ** 2 + avgVy ** 2);
			if (magnitude > 0) {
				avgVx = (avgVx / magnitude) * particle.behavior.maxSpeed - particle.vx;
				avgVy = (avgVy / magnitude) * particle.behavior.maxSpeed - particle.vy;
				
				const steerMagnitude = Math.sqrt(avgVx ** 2 + avgVy ** 2);
				if (steerMagnitude > particle.behavior.maxForce) {
					avgVx = (avgVx / steerMagnitude) * particle.behavior.maxForce;
					avgVy = (avgVy / steerMagnitude) * particle.behavior.maxForce;
				}
			}
			
			return { x: avgVx, y: avgVy };
		}
		
		private wander(particle: Particle): { x: number; y: number } {
			particle.behavior.wanderAngle += (Math.random() - 0.5) * 0.1;
			
			const circleDistance = 40;
			const circleRadius = 20;
			
			const wanderX = particle.x + particle.vx * circleDistance;
			const wanderY = particle.y + particle.vy * circleDistance;
			
			const targetX = wanderX + Math.cos(particle.behavior.wanderAngle) * circleRadius;
			const targetY = wanderY + Math.sin(particle.behavior.wanderAngle) * circleRadius;
			
			return this.seek(particle, { x: targetX, y: targetY });
		}
		
		private seek(particle: Particle, target: { x: number; y: number }): { x: number; y: number } {
			const desiredX = target.x - particle.x;
			const desiredY = target.y - particle.y;
			const distance = Math.sqrt(desiredX ** 2 + desiredY ** 2);
			
			if (distance === 0) return { x: 0, y: 0 };
			
			const normalizedX = desiredX / distance;
			const normalizedY = desiredY / distance;
			
			const speed = distance < 100 ? (distance / 100) * particle.behavior.maxSpeed : particle.behavior.maxSpeed;
			
			const steerX = normalizedX * speed - particle.vx;
			const steerY = normalizedY * speed - particle.vy;
			
			const steerMagnitude = Math.sqrt(steerX ** 2 + steerY ** 2);
			if (steerMagnitude > particle.behavior.maxForce) {
				return {
					x: (steerX / steerMagnitude) * particle.behavior.maxForce,
					y: (steerY / steerMagnitude) * particle.behavior.maxForce
				};
			}
			
			return { x: steerX, y: steerY };
		}
		
		private applyMouseInteraction(particle: Particle, force: { x: number; y: number }): void {
			const dx = particle.x - this.mouseState.x;
			const dy = particle.y - this.mouseState.y;
			const distance = Math.sqrt(dx ** 2 + dy ** 2);
			
			if (distance < this.mouseState.influence && distance > 0) {
				const strength = 1 - (distance / this.mouseState.influence);
				const velocityMagnitude = Math.sqrt(this.mouseState.velocity.x ** 2 + this.mouseState.velocity.y ** 2);
				
				if (this.mouseState.isDown) {
					// Pull towards mouse when clicking
					force.x -= (dx / distance) * strength * 0.5;
					force.y -= (dy / distance) * strength * 0.5;
				} else {
					// Push away from mouse
					const pushStrength = strength * (0.3 + velocityMagnitude * 0.01);
					force.x += (dx / distance) * pushStrength;
					force.y += (dy / distance) * pushStrength;
				}
				
				// Add subtle vortex effect
				const perpX = -dy / distance;
				const perpY = dx / distance;
				const vortexStrength = strength * 0.1 * velocityMagnitude;
				force.x += perpX * vortexStrength;
				force.y += perpY * vortexStrength;
			}
		}
		
		private applyBookmarkSwirl(particle: Particle, force: { x: number; y: number }): void {
			const dx = particle.x - this.bookmarkHover.x;
			const dy = particle.y - this.bookmarkHover.y;
			const distance = Math.sqrt(dx ** 2 + dy ** 2);
			
			if (distance < 120 && distance > 0) {
				const strength = 1 - (distance / 120);
				const angle = Math.atan2(dy, dx) + Math.PI / 2;
				
				force.x += Math.cos(angle) * strength * 0.2;
				force.y += Math.sin(angle) * strength * 0.2;
			}
		}
		
		private distance(p1: Particle, p2: Particle): number {
			return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
		}
		
		private wrapParticle(particle: Particle): void {
			const margin = 50;
			
			if (particle.x < -margin) particle.x = windowWidth + margin;
			if (particle.x > windowWidth + margin) particle.x = -margin;
			if (particle.y < -margin) particle.y = windowHeight + margin;
			if (particle.y > windowHeight + margin) particle.y = -margin;
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
				
				positions[i * 2] = particle.x;
				positions[i * 2 + 1] = particle.y;
				sizes[i] = particle.size;
				opacities[i] = particle.opacity;
				colors[i * 3] = particle.color[0];
				colors[i * 3 + 1] = particle.color[1];
				colors[i * 3 + 2] = particle.color[2];
				phases[i] = particle.phase;
			}
			
			this.gl.bindVertexArrayObject(this.vao);
			
			// Position
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);
			const positionLoc = this.gl.getAttribLocation(this.program, 'a_position');
			this.gl.enableVertexAttribArray(positionLoc);
			this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);
			
			// Size
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.sizeBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, sizes, this.gl.DYNAMIC_DRAW);
			const sizeLoc = this.gl.getAttribLocation(this.program, 'a_size');
			this.gl.enableVertexAttribArray(sizeLoc);
			this.gl.vertexAttribPointer(sizeLoc, 1, this.gl.FLOAT, false, 0, 0);
			
			// Opacity
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.opacityBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, opacities, this.gl.DYNAMIC_DRAW);
			const opacityLoc = this.gl.getAttribLocation(this.program, 'a_opacity');
			this.gl.enableVertexAttribArray(opacityLoc);
			this.gl.vertexAttribPointer(opacityLoc, 1, this.gl.FLOAT, false, 0, 0);
			
			// Color
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
			const colorLoc = this.gl.getAttribLocation(this.program, 'a_color');
			this.gl.enableVertexAttribArray(colorLoc);
			this.gl.vertexAttribPointer(colorLoc, 3, this.gl.FLOAT, false, 0, 0);
			
			// Phase
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.phaseBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, phases, this.gl.DYNAMIC_DRAW);
			const phaseLoc = this.gl.getAttribLocation(this.program, 'a_phase');
			this.gl.enableVertexAttribArray(phaseLoc);
			this.gl.vertexAttribPointer(phaseLoc, 1, this.gl.FLOAT, false, 0, 0);
		}
		
		render(time: number): void {
			if (!this.program) return;
			
			this.gl.clear(this.gl.COLOR_BUFFER_BIT);
			this.gl.useProgram(this.program);
			this.gl.bindVertexArrayObject(this.vao);
			
			// Set uniforms
			const resolutionLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
			this.gl.uniform2f(resolutionLoc, windowWidth, windowHeight);
			
			const timeLoc = this.gl.getUniformLocation(this.program, 'u_time');
			this.gl.uniform1f(timeLoc, time * 0.001);
			
			const opacityLoc = this.gl.getUniformLocation(this.program, 'u_globalOpacity');
			const globalOpacity = settings?.particles?.opacity ?? 0.6;
			this.gl.uniform1f(opacityLoc, globalOpacity);
			
			const visibleLoc = this.gl.getUniformLocation(this.program, 'u_isVisible');
			this.gl.uniform1i(visibleLoc, isVisible ? 1 : 0);
			
			// Enable blending
			this.gl.enable(this.gl.BLEND);
			this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
			
			// Draw particles
			this.gl.drawArrays(this.gl.POINTS, 0, this.particles.length);
		}
		
		setVisibility(visible: boolean): void {
			isVisible = visible;
		}
		
		updateFPS(newFPS: number): void {
			fps = newFPS;
		}
		
		resize(width: number, height: number): void {
			this.gl.viewport(0, 0, width, height);
		}
		
		destroy(): void {
			this.gl.deleteProgram(this.program);
			this.gl.deleteBuffer(this.positionBuffer);
			this.gl.deleteBuffer(this.sizeBuffer);
			this.gl.deleteBuffer(this.opacityBuffer);
			this.gl.deleteBuffer(this.colorBuffer);
			this.gl.deleteBuffer(this.phaseBuffer);
			this.gl.deleteVertexArray(this.vao);
		}
	}
	
	function initializeParticleSystem(): void {
		if (!canvasElement || !windowWidth || !windowHeight) return;
		
		canvasElement.width = windowWidth;
		canvasElement.height = windowHeight;
		
		gl = canvasElement.getContext('webgl2');
		if (!gl) {
			console.warn('WebGL2 not supported, falling back to WebGL');
			gl = canvasElement.getContext('webgl') as WebGL2RenderingContext;
		}
		
		if (!gl) {
			console.error('WebGL not supported');
			return;
		}
		
		gl.clearColor(0, 0, 0, 0);
		particleSystem = new ParticleNexusSystem(gl, canvasElement);
	}
	
	function animate(currentTime: number): void {
		if (!particleSystem || !gl) return;
		
		const deltaTime = (currentTime - lastFrameTime) / 1000;
		lastFrameTime = currentTime;
		
		// Calculate FPS
		frameCount++;
		if (frameCount % 60 === 0) {
			fps = Math.round(1000 / ((currentTime - lastFrameTime) * 60));
			particleSystem.updateFPS(fps);
		}
		
		particleSystem.update(deltaTime, currentTime);
		particleSystem.render(currentTime);
		
		requestAnimationFrame(animate);
	}
	
	function handleMouseMove(event: MouseEvent): void {
		if (particleSystem) {
			const rect = canvasElement.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			particleSystem.updateMousePosition(x, y, event.buttons > 0);
		}
	}
	
	function handleVisibilityChange(): void {
		isVisible = !document.hidden;
		if (particleSystem) {
			particleSystem.setVisibility(isVisible);
		}
	}
	
	function handleBookmarkHover(event: CustomEvent): void {
		if (particleSystem) {
			const { categoryId, action, position } = event.detail;
			particleSystem.setBookmarkHover(
				position?.x || 0, 
				position?.y || 0, 
				action === 'start'
			);
		}
	}
	
	function handleWallpaperTransition(): void {
		if (particleSystem) {
			particleSystem.triggerWallpaperChange();
		}
	}
	
	onMount(() => {
		if (!browser) return;
		
		initializeParticleSystem();
		
		if (particleSystem) {
			requestAnimationFrame(animate);
		}
		
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('bookmark-hover', handleBookmarkHover);
		window.addEventListener('wallpaper-transition', handleWallpaperTransition);
		
		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('bookmark-hover', handleBookmarkHover);
			window.removeEventListener('wallpaper-transition', handleWallpaperTransition);
		};
	});
	
	onDestroy(() => {
		if (particleSystem) {
			particleSystem.destroy();
		}
	});
	
	$: if (particleSystem && dominantColor) {
		particleSystem.setDominantColor(dominantColor);
	}
	
	$: if (particleSystem && (windowWidth || windowHeight)) {
		canvasElement.width = windowWidth;
		canvasElement.height = windowHeight;
		particleSystem.resize(windowWidth, windowHeight);
	}
	
	$: if (particleSystem && count) {
		// Reinitialize with new particle count
		particleSystem.destroy();
		initializeParticleSystem();
	}
</script>

<canvas
	bind:this={canvasElement}
	class="particle-canvas"
	style="width: {windowWidth}px; height: {windowHeight}px;"
	aria-hidden="true"
></canvas>

<style>
	.particle-canvas {
		position: fixed;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 1;
		will-change: auto;
	}
	
	@media (prefers-reduced-motion: reduce) {
		.particle-canvas {
			display: none;
		}
	}
</style>
