<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	
	export let count = 80;
	export let windowWidth = 0;
	export let windowHeight = 0;
	export let dominantColor = '#4a90e2';
	export let settings: any = {};
	export let config: any = {};
	
	let canvas: HTMLCanvasElement;
	let particleSystem: ParticleNexusSystem | null = null;
	let isVisible = true;
	let animationFrame: number;
	let isInitialized = false;
	
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
		behavior: {
			cohesionRadius: number;
			separationRadius: number;
			alignmentRadius: number;
			maxSpeed: number;
			maxForce: number;
		};
		trail?: {
			positions: Array<{ x: number; y: number; opacity: number }>;
			maxLength: number;
		};
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
			vec2 position = (a_position / u_resolution) * 2.0 - 1.0;
			position.y = -position.y;
			
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
		
		// Fixed: Regular constructor without TypeScript parameter properties
		private gl: WebGL2RenderingContext;
		private canvas: HTMLCanvasElement;
		
		constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
			this.gl = gl;
			this.canvas = canvas;
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
			const particlePerPixel = this.performanceLevel === 'high' ? 0.00008 : 
									this.performanceLevel === 'medium' ? 0.00006 : 0.00004;
			return Math.min(200, Math.max(20, Math.floor(screenArea * particlePerPixel)));
		}
		
		private createParticle(index: number): Particle {
			const baseSize = this.performanceLevel === 'high' ? 3 : 
							this.performanceLevel === 'medium' ? 2.5 : 2;
			
			return {
				x: Math.random() * windowWidth,
				y: Math.random() * windowHeight,
				vx: (Math.random() - 0.5) * 0.5,
				vy: (Math.random() - 0.5) * 0.5,
				size: baseSize + Math.random() * 2,
				originalSize: baseSize + Math.random() * 2,
				opacity: 0.3 + Math.random() * 0.4,
				color: this.hexToRgb(dominantColor),
				phase: Math.random() * Math.PI * 2,
				isActive: true,
				behavior: {
					cohesionRadius: 50 + Math.random() * 30,
					separationRadius: 25 + Math.random() * 15,
					alignmentRadius: 40 + Math.random() * 20,
					maxSpeed: 0.8 + Math.random() * 0.4,
					maxForce: 0.03 + Math.random() * 0.02
				}
			};
		}
		
		private hexToRgb(hex: string): [number, number, number] {
			const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
			return result ? [
				parseInt(result[1], 16) / 255,
				parseInt(result[2], 16) / 255,
				parseInt(result[3], 16) / 255
			] : [1, 1, 1];
		}
		
		updateColor(newColor: string): void {
			const rgb = this.hexToRgb(newColor);
			this.targetColor[0] = rgb[0];
			this.targetColor[1] = rgb[1];
			this.targetColor[2] = rgb[2];
		}
		
		updateMousePosition(x: number, y: number, isDown: boolean = false): void {
			const prevX = this.mouseState.x;
			const prevY = this.mouseState.y;
			
			this.mouseState.velocity.x = x - prevX;
			this.mouseState.velocity.y = y - prevY;
			this.mouseState.x = x;
			this.mouseState.y = y;
			this.mouseState.isDown = isDown;
		}
		
		setBookmarkHover(x: number, y: number, active: boolean): void {
			this.bookmarkHover.x = x;
			this.bookmarkHover.y = y;
			this.bookmarkHover.active = active;
		}
		
		update(deltaTime: number): void {
			// Color interpolation
			for (let i = 0; i < 3; i++) {
				this.currentColor[i] += (this.targetColor[i] - this.currentColor[i]) * this.colorLerpSpeed;
			}
			
			// Update particles
			for (const particle of this.particles) {
				if (!particle.isActive) continue;
				
				// Apply forces
				const force = this.calculateForces(particle);
				
				particle.vx += force.x;
				particle.vy += force.y;
				
				// Apply velocity
				particle.x += particle.vx;
				particle.y += particle.vy;
				
				// Update color
				particle.color[0] = this.currentColor[0];
				particle.color[1] = this.currentColor[1];
				particle.color[2] = this.currentColor[2];
				
				// Wrap around screen
				this.wrapParticle(particle);
			}
		}
		
		private calculateForces(particle: Particle): { x: number; y: number } {
			const cohesion = this.cohesion(particle);
			const separation = this.separation(particle);
			const alignment = this.alignment(particle);
			const wander = this.wander(particle);
			const mouse = this.mouseInfluence(particle);
			const bookmark = this.bookmarkInfluence(particle);
			
			return {
				x: cohesion.x * 1.0 + separation.x * 1.5 + alignment.x * 0.5 + 
				   wander.x * 0.8 + mouse.x + bookmark.x,
				y: cohesion.y * 1.0 + separation.y * 1.5 + alignment.y * 0.5 + 
				   wander.y * 0.8 + mouse.y + bookmark.y
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
		
		private wander(particle: Particle): { x: number; y: number } {
			const wanderAngle = particle.phase + Math.random() * 0.3 - 0.15;
			return {
				x: Math.cos(wanderAngle) * 0.1,
				y: Math.sin(wanderAngle) * 0.1
			};
		}
		
		private mouseInfluence(particle: Particle): { x: number; y: number } {
			const dx = particle.x - this.mouseState.x;
			const dy = particle.y - this.mouseState.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			if (distance > this.mouseState.influence) return { x: 0, y: 0 };
			
			const force = this.mouseState.isDown ? 0.5 : 0.2;
			const strength = (1 - distance / this.mouseState.influence) * force;
			
			return {
				x: (dx / distance) * strength + this.mouseState.velocity.x * 0.1,
				y: (dy / distance) * strength + this.mouseState.velocity.y * 0.1
			};
		}
		
		private bookmarkInfluence(particle: Particle): { x: number; y: number } {
			if (!this.bookmarkHover.active) return { x: 0, y: 0 };
			
			const dx = particle.x - this.bookmarkHover.x;
			const dy = particle.y - this.bookmarkHover.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			if (distance > 120) return { x: 0, y: 0 };
			
			const strength = 1 - (distance / 120);
			const angle = Math.atan2(dy, dx) + Math.PI / 2;
			
			return {
				x: Math.cos(angle) * strength * 0.2,
				y: Math.sin(angle) * strength * 0.2
			};
		}
		
		private seek(particle: Particle, target: { x: number; y: number }): { x: number; y: number } {
			const desired = {
				x: target.x - particle.x,
				y: target.y - particle.y
			};
			
			const magnitude = Math.sqrt(desired.x ** 2 + desired.y ** 2);
			if (magnitude === 0) return { x: 0, y: 0 };
			
			desired.x = (desired.x / magnitude) * particle.behavior.maxSpeed;
			desired.y = (desired.y / magnitude) * particle.behavior.maxSpeed;
			
			const steer = {
				x: desired.x - particle.vx,
				y: desired.y - particle.vy
			};
			
			const steerMagnitude = Math.sqrt(steer.x ** 2 + steer.y ** 2);
			if (steerMagnitude > particle.behavior.maxForce) {
				steer.x = (steer.x / steerMagnitude) * particle.behavior.maxForce;
				steer.y = (steer.y / steerMagnitude) * particle.behavior.maxForce;
			}
			
			return steer;
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
		
		render(time: number): void {
			if (!this.program) return;
			
			this.gl.useProgram(this.program);
			
			// Update uniforms
			const resolutionLocation = this.gl.getUniformLocation(this.program, 'u_resolution');
			const timeLocation = this.gl.getUniformLocation(this.program, 'u_time');
			const globalOpacityLocation = this.gl.getUniformLocation(this.program, 'u_globalOpacity');
			const isVisibleLocation = this.gl.getUniformLocation(this.program, 'u_isVisible');
			
			this.gl.uniform2f(resolutionLocation, windowWidth, windowHeight);
			this.gl.uniform1f(timeLocation, time * 0.001);
			this.gl.uniform1f(globalOpacityLocation, isVisible ? 1.0 : 0.3);
			this.gl.uniform1i(isVisibleLocation, isVisible);
			
			this.updateBuffers();
			
			// Render particles
			this.gl.enable(this.gl.BLEND);
			this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
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
		
		updateParticleCount(newCount: number): void {
			const currentCount = this.particles.length;
			
			if (newCount > currentCount) {
				// Add particles
				for (let i = currentCount; i < newCount; i++) {
					this.particles.push(this.createParticle(i));
				}
			} else if (newCount < currentCount) {
				// Remove particles
				this.particles.splice(newCount);
			}
		}
		
		setVisibility(visible: boolean): void {
			isVisible = visible;
		}
		
		destroy(): void {
			if (this.program) {
				this.gl.deleteProgram(this.program);
			}
			
			[this.positionBuffer, this.sizeBuffer, this.opacityBuffer, this.colorBuffer, this.phaseBuffer].forEach(buffer => {
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
			const context = canvas.getContext('webgl2');
			if (!context) {
				console.warn('WebGL2 not available, falling back to canvas');
				return;
			}
			
			particleSystem = new ParticleNexusSystem(context, canvas);
			isInitialized = true;
			
			// Start animation loop
			const animate = (time: number) => {
				if (particleSystem) {
					particleSystem.update(16.67); // ~60fps
					particleSystem.render(time);
				}
				animationFrame = requestAnimationFrame(animate);
			};
			
			animationFrame = requestAnimationFrame(animate);
			
		} catch (error) {
			console.error('ParticleSystem initialization failed:', error);
		}
	});
	
	onDestroy(() => {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
		
		if (particleSystem) {
			particleSystem.destroy();
		}
	});
	
	// Reactive updates
	$: if (particleSystem && dominantColor) {
		particleSystem.updateColor(dominantColor);
	}
	
	$: if (particleSystem && count) {
		particleSystem.updateParticleCount(count);
	}
	
	$: if (particleSystem) {
		particleSystem.setVisibility(isVisible);
	}
	
	// Mouse event handlers
	function handleMouseMove(event: MouseEvent) {
		if (particleSystem) {
			const rect = canvas.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			particleSystem.updateMousePosition(x, y, event.buttons > 0);
		}
	}
	
	function handleMouseDown(event: MouseEvent) {
		if (particleSystem) {
			const rect = canvas.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			particleSystem.updateMousePosition(x, y, true);
		}
	}
	
	function handleMouseUp(event: MouseEvent) {
		if (particleSystem) {
			const rect = canvas.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			particleSystem.updateMousePosition(x, y, false);
		}
	}
</script>

<canvas
	bind:this={canvas}
	width={windowWidth}
	height={windowHeight}
	class="particle-canvas"
	on:mousemove={handleMouseMove}
	on:mousedown={handleMouseDown}
	on:mouseup={handleMouseUp}
	style="
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1;
	"
/>

<style>
	.particle-canvas {
		display: block;
	}
</style>
