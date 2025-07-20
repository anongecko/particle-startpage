<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	
	export let settings: any;
	export let wallpapers: any;
	
	const dispatch = createEventDispatcher();
	
	let canvasElement: HTMLCanvasElement;
	let containerElement: HTMLElement;
	let currentImage: HTMLImageElement | null = null;
	let nextImage: HTMLImageElement | null = null;
	let isTransitioning = false;
	let lastWorkingImage: HTMLImageElement | null = null;
	
	let gl: WebGLRenderingContext | null = null;
	let shaderProgram: WebGLProgram | null = null;
	let particleSystem: ParticleDissolveSystem | null = null;
	
	const imageCache = new Map<string, HTMLImageElement>();
	const preloadQueue: string[] = [];
	let cacheSize = 0;
	const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
	
	let touchState = {
		isPinching: false,
		isLongPressing: false,
		startDistance: 0,
		scale: 1,
		startTime: 0,
		longPressTimer: null as NodeJS.Timeout | null
	};
	
	const transitionProgress = tweened(0, { duration: 1800, easing: cubicOut });
	
	const VERTEX_SHADER = `
		attribute vec2 a_position;
		attribute vec2 a_texCoord;
		attribute float a_dissolve;
		
		uniform vec2 u_resolution;
		uniform float u_progress;
		uniform float u_time;
		
		varying vec2 v_texCoord;
		varying float v_dissolve;
		varying float v_alpha;
		
		void main() {
			vec2 position = ((a_position / u_resolution) * 2.0 - 1.0) * vec2(1, -1);
			gl_Position = vec4(position, 0, 1);
			
			v_texCoord = a_texCoord;
			v_dissolve = a_dissolve;
			
			float dissolveThreshold = u_progress + sin(u_time * 3.0 + a_dissolve * 10.0) * 0.1;
			v_alpha = smoothstep(dissolveThreshold - 0.1, dissolveThreshold + 0.1, a_dissolve);
		}
	`;
	
	const FRAGMENT_SHADER = `
		precision mediump float;
		
		uniform sampler2D u_currentTexture;
		uniform sampler2D u_nextTexture;
		uniform float u_progress;
		uniform float u_time;
		uniform vec2 u_resolution;
		uniform bool u_highContrast;
		
		varying vec2 v_texCoord;
		varying float v_dissolve;
		varying float v_alpha;
		
		vec3 adjustContrast(vec3 color) {
			if (u_highContrast) {
				float luminance = dot(color, vec3(0.299, 0.587, 0.114));
				return luminance > 0.5 ? vec3(1.0) : vec3(0.0);
			}
			return color;
		}
		
		void main() {
			vec4 currentColor = texture2D(u_currentTexture, v_texCoord);
			vec4 nextColor = texture2D(u_nextTexture, v_texCoord);
			
			currentColor.rgb = adjustContrast(currentColor.rgb);
			nextColor.rgb = adjustContrast(nextColor.rgb);
			
			vec2 center = vec2(0.5, 0.5);
			float distanceFromCenter = length(v_texCoord - center);
			float ripple = sin(distanceFromCenter * 20.0 - u_time * 5.0) * 0.02;
			
			vec2 dissolveCoord = v_texCoord + ripple;
			float noise = fract(sin(dot(dissolveCoord * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
			
			float dissolveAmount = smoothstep(0.0, 1.0, u_progress + noise * 0.2 - 0.1);
			
			vec4 finalColor = mix(currentColor, nextColor, dissolveAmount);
			
			if (dissolveAmount > 0.1 && dissolveAmount < 0.9) {
				float edge = abs(dissolveAmount - 0.5) * 2.0;
				vec3 sparkle = vec3(1.0, 0.8, 0.6) * (1.0 - edge) * 0.5;
				finalColor.rgb += sparkle;
			}
			
			gl_FragColor = finalColor;
		}
	`;
	
	class ParticleDissolveSystem {
		private positions: Float32Array;
		private texCoords: Float32Array;
		private dissolveValues: Float32Array;
		private positionBuffer: WebGLBuffer | null = null;
		private texCoordBuffer: WebGLBuffer | null = null;
		private dissolveBuffer: WebGLBuffer | null = null;
		private currentTexture: WebGLTexture | null = null;
		private nextTexture: WebGLTexture | null = null;
		
		constructor(private gl: WebGLRenderingContext, private program: WebGLProgram) {
			this.initializeBuffers();
		}
		
		private initializeBuffers(): void {
			const width = this.gl.canvas.width;
			const height = this.gl.canvas.height;
			const particleSize = 4;
			const particlesX = Math.floor(width / particleSize);
			const particlesY = Math.floor(height / particleSize);
			const totalParticles = particlesX * particlesY;
			
			this.positions = new Float32Array(totalParticles * 6 * 2);
			this.texCoords = new Float32Array(totalParticles * 6 * 2);
			this.dissolveValues = new Float32Array(totalParticles * 6);
			
			let posIndex = 0;
			let texIndex = 0;
			let dissolveIndex = 0;
			
			for (let y = 0; y < particlesY; y++) {
				for (let x = 0; x < particlesX; x++) {
					const px = x * particleSize;
					const py = y * particleSize;
					const tx = x / particlesX;
					const ty = y / particlesY;
					
					const dissolve = Math.random();
					
					// Triangle 1
					this.positions[posIndex++] = px;
					this.positions[posIndex++] = py;
					this.positions[posIndex++] = px + particleSize;
					this.positions[posIndex++] = py;
					this.positions[posIndex++] = px;
					this.positions[posIndex++] = py + particleSize;
					
					// Triangle 2
					this.positions[posIndex++] = px + particleSize;
					this.positions[posIndex++] = py;
					this.positions[posIndex++] = px + particleSize;
					this.positions[posIndex++] = py + particleSize;
					this.positions[posIndex++] = px;
					this.positions[posIndex++] = py + particleSize;
					
					// Texture coordinates
					this.texCoords[texIndex++] = tx;
					this.texCoords[texIndex++] = ty;
					this.texCoords[texIndex++] = tx + 1/particlesX;
					this.texCoords[texIndex++] = ty;
					this.texCoords[texIndex++] = tx;
					this.texCoords[texIndex++] = ty + 1/particlesY;
					
					this.texCoords[texIndex++] = tx + 1/particlesX;
					this.texCoords[texIndex++] = ty;
					this.texCoords[texIndex++] = tx + 1/particlesX;
					this.texCoords[texIndex++] = ty + 1/particlesY;
					this.texCoords[texIndex++] = tx;
					this.texCoords[texIndex++] = ty + 1/particlesY;
					
					// Dissolve values
					for (let i = 0; i < 6; i++) {
						this.dissolveValues[dissolveIndex++] = dissolve;
					}
				}
			}
			
			this.createBuffers();
		}
		
		private createBuffers(): void {
			this.positionBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, this.positions, this.gl.STATIC_DRAW);
			
			this.texCoordBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, this.texCoords, this.gl.STATIC_DRAW);
			
			this.dissolveBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.dissolveBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, this.dissolveValues, this.gl.STATIC_DRAW);
		}
		
		setTextures(currentImg: HTMLImageElement, nextImg: HTMLImageElement): void {
			this.currentTexture = this.createTexture(currentImg);
			this.nextTexture = this.createTexture(nextImg);
		}
		
		private createTexture(img: HTMLImageElement): WebGLTexture {
			const texture = this.gl.createTexture()!;
			this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
			
			this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
			this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
			this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
			this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
			
			this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
			
			return texture;
		}
		
		render(progress: number, time: number, highContrast: boolean): void {
			if (!this.currentTexture || !this.nextTexture) return;
			
			this.gl.useProgram(this.program);
			
			// Set uniforms
			const progressLoc = this.gl.getUniformLocation(this.program, 'u_progress');
			const timeLoc = this.gl.getUniformLocation(this.program, 'u_time');
			const resolutionLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
			const contrastLoc = this.gl.getUniformLocation(this.program, 'u_highContrast');
			
			this.gl.uniform1f(progressLoc, progress);
			this.gl.uniform1f(timeLoc, time);
			this.gl.uniform2f(resolutionLoc, this.gl.canvas.width, this.gl.canvas.height);
			this.gl.uniform1i(contrastLoc, highContrast ? 1 : 0);
			
			// Set textures
			this.gl.activeTexture(this.gl.TEXTURE0);
			this.gl.bindTexture(this.gl.TEXTURE_2D, this.currentTexture);
			this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_currentTexture'), 0);
			
			this.gl.activeTexture(this.gl.TEXTURE1);
			this.gl.bindTexture(this.gl.TEXTURE_2D, this.nextTexture);
			this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_nextTexture'), 1);
			
			// Set attributes
			const positionLoc = this.gl.getAttribLocation(this.program, 'a_position');
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
			this.gl.enableVertexAttribArray(positionLoc);
			this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);
			
			const texCoordLoc = this.gl.getAttribLocation(this.program, 'a_texCoord');
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
			this.gl.enableVertexAttribArray(texCoordLoc);
			this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 0, 0);
			
			const dissolveLoc = this.gl.getAttribLocation(this.program, 'a_dissolve');
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.dissolveBuffer);
			this.gl.enableVertexAttribArray(dissolveLoc);
			this.gl.vertexAttribPointer(dissolveLoc, 1, this.gl.FLOAT, false, 0, 0);
			
			// Draw
			this.gl.drawArrays(this.gl.TRIANGLES, 0, this.positions.length / 2);
		}
		
		destroy(): void {
			this.gl.deleteBuffer(this.positionBuffer);
			this.gl.deleteBuffer(this.texCoordBuffer);
			this.gl.deleteBuffer(this.dissolveBuffer);
			this.gl.deleteTexture(this.currentTexture);
			this.gl.deleteTexture(this.nextTexture);
		}
	}
	
	async function loadImage(src: string): Promise<HTMLImageElement> {
		if (imageCache.has(src)) {
			return imageCache.get(src)!;
		}
		
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				addToCache(src, img);
				resolve(img);
			};
			img.onerror = reject;
			img.src = getOptimizedImageSrc(src);
		});
	}
	
	function getOptimizedImageSrc(src: string): string {
		if (!browser) return src;
		
		const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.ceil(window.innerWidth * devicePixelRatio);
		const height = Math.ceil(window.innerHeight * devicePixelRatio);
		
		const url = new URL(src, window.location.origin);
		url.searchParams.set('w', width.toString());
		url.searchParams.set('h', height.toString());
		url.searchParams.set('fit', 'cover');
		url.searchParams.set('quality', '90');
		url.searchParams.set('format', 'webp');
		
		return url.toString();
	}
	
	function addToCache(src: string, img: HTMLImageElement): void {
		const estimatedSize = (img.naturalWidth * img.naturalHeight * 4) / 1024; // Rough estimate in KB
		
		if (cacheSize + estimatedSize > MAX_CACHE_SIZE) {
			const entries = Array.from(imageCache.entries());
			const oldestKey = entries[0]?.[0];
			if (oldestKey) {
				imageCache.delete(oldestKey);
				cacheSize -= estimatedSize; // Approximate
			}
		}
		
		imageCache.set(src, img);
		cacheSize += estimatedSize;
	}
	
	function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
		const shader = gl.createShader(type);
		if (!shader) return null;
		
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		
		return shader;
	}
	
	function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
		const program = gl.createProgram();
		if (!program) return null;
		
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error('Program linking error:', gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			return null;
		}
		
		return program;
	}
	
	function initWebGL(): boolean {
		if (!canvasElement) return false;
		
		gl = canvasElement.getContext('webgl') || canvasElement.getContext('experimental-webgl');
		if (!gl) return false;
		
		const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
		const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
		
		if (!vertexShader || !fragmentShader) return false;
		
		shaderProgram = createProgram(gl, vertexShader, fragmentShader);
		if (!shaderProgram) return false;
		
		particleSystem = new ParticleDissolveSystem(gl, shaderProgram);
		
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		
		return true;
	}
	
	function resizeCanvas(): void {
		if (!canvasElement || !containerElement) return;
		
		const rect = containerElement.getBoundingClientRect();
		const devicePixelRatio = window.devicePixelRatio || 1;
		
		canvasElement.width = rect.width * devicePixelRatio;
		canvasElement.height = rect.height * devicePixelRatio;
		canvasElement.style.width = `${rect.width}px`;
		canvasElement.style.height = `${rect.height}px`;
		
		if (gl) {
			gl.viewport(0, 0, canvasElement.width, canvasElement.height);
		}
	}
	
	async function transitionToImage(imagePath: string): Promise<void> {
		if (isTransitioning || !imagePath) return;
		
		try {
			isTransitioning = true;
			
			const newImage = await loadImage(imagePath);
			
			if (currentImage && particleSystem && gl) {
				nextImage = newImage;
				particleSystem.setTextures(currentImage, nextImage);
				
				let startTime = 0;
				const animate = (time: number) => {
					if (!startTime) startTime = time;
					const elapsed = time - startTime;
					const progress = Math.min(elapsed / 1800, 1);
					
					gl!.clear(gl!.COLOR_BUFFER_BIT);
					
					const highContrast = settings?.ui?.highContrast || 
						window.matchMedia('(prefers-contrast: high)').matches;
					
					particleSystem!.render(progress, time * 0.001, highContrast);
					
					if (progress < 1) {
						requestAnimationFrame(animate);
					} else {
						currentImage = nextImage;
						nextImage = null;
						isTransitioning = false;
						lastWorkingImage = currentImage;
						
						dispatch('wallpaperChange', { path: imagePath });
					}
				};
				
				requestAnimationFrame(animate);
			} else {
				currentImage = newImage;
				lastWorkingImage = currentImage;
				isTransitioning = false;
				
				dispatch('wallpaperChange', { path: imagePath });
			}
		} catch (error) {
			console.error('Failed to load wallpaper:', error);
			
			if (lastWorkingImage) {
				currentImage = lastWorkingImage;
			}
			
			isTransitioning = false;
		}
	}
	
	function handleTouchStart(event: TouchEvent): void {
		if (event.touches.length === 1) {
			touchState.startTime = Date.now();
			touchState.longPressTimer = setTimeout(() => {
				if (!touchState.isPinching) {
					touchState.isLongPressing = true;
					navigator.vibrate?.(50);
					dispatch('longPress', { x: event.touches[0].clientX, y: event.touches[0].clientY });
				}
			}, 500);
		} else if (event.touches.length === 2) {
			touchState.isPinching = true;
			touchState.startDistance = Math.hypot(
				event.touches[0].clientX - event.touches[1].clientX,
				event.touches[0].clientY - event.touches[1].clientY
			);
			
			if (touchState.longPressTimer) {
				clearTimeout(touchState.longPressTimer);
				touchState.longPressTimer = null;
			}
		}
	}
	
	function handleTouchMove(event: TouchEvent): void {
		if (touchState.isPinching && event.touches.length === 2) {
			const currentDistance = Math.hypot(
				event.touches[0].clientX - event.touches[1].clientX,
				event.touches[0].clientY - event.touches[1].clientY
			);
			
			const scale = currentDistance / touchState.startDistance;
			touchState.scale = Math.max(0.5, Math.min(3, scale));
			
			if (canvasElement) {
				canvasElement.style.transform = `scale(${touchState.scale})`;
			}
		}
		
		if (touchState.longPressTimer) {
			clearTimeout(touchState.longPressTimer);
			touchState.longPressTimer = null;
		}
	}
	
	function handleTouchEnd(): void {
		if (touchState.longPressTimer) {
			clearTimeout(touchState.longPressTimer);
			touchState.longPressTimer = null;
		}
		
		if (touchState.isPinching) {
			touchState.isPinching = false;
			
			if (canvasElement) {
				canvasElement.style.transition = 'transform 0.3s ease';
				canvasElement.style.transform = 'scale(1)';
				setTimeout(() => {
					if (canvasElement) {
						canvasElement.style.transition = '';
					}
				}, 300);
			}
		}
		
		touchState.isLongPressing = false;
		touchState.scale = 1;
	}
	
	onMount(() => {
		if (!browser) return;
		
		resizeCanvas();
		
		if (initWebGL()) {
			if (wallpapers?.currentImage?.path) {
				transitionToImage(wallpapers.currentImage.path);
			}
		}
		
		const resizeObserver = new ResizeObserver(() => {
			resizeCanvas();
			if (particleSystem && gl) {
				particleSystem.destroy();
				particleSystem = new ParticleDissolveSystem(gl, shaderProgram!);
				if (currentImage && nextImage) {
					particleSystem.setTextures(currentImage, nextImage);
				}
			}
		});
		
		if (containerElement) {
			resizeObserver.observe(containerElement);
		}
		
		return () => {
			resizeObserver.disconnect();
		};
	});
	
	onDestroy(() => {
		if (particleSystem) {
			particleSystem.destroy();
		}
		
		if (touchState.longPressTimer) {
			clearTimeout(touchState.longPressTimer);
		}
	});
	
	$: if (wallpapers?.currentImage?.path && !isTransitioning) {
		transitionToImage(wallpapers.currentImage.path);
	}
</script>

<div 
	class="background-container" 
	bind:this={containerElement}
	on:touchstart={handleTouchStart}
	on:touchmove={handleTouchMove}
	on:touchend={handleTouchEnd}
	role="img"
	aria-label="Dynamic background wallpaper"
>
	<canvas
		bind:this={canvasElement}
		class="background-canvas"
		class:high-contrast={settings?.ui?.highContrast}
	></canvas>
	
	{#if isTransitioning}
		<div class="transition-overlay" aria-hidden="true"></div>
	{/if}
</div>

<style>
	.background-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: -2;
		overflow: hidden;
		background: #000;
	}
	
	.background-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform-origin: center;
		will-change: transform;
	}
	
	.background-canvas.high-contrast {
		filter: contrast(200%) brightness(150%);
	}
	
	.transition-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: radial-gradient(circle, transparent 0%, rgba(0,0,0,0.1) 100%);
		pointer-events: none;
		z-index: 1;
	}
	
	@media (prefers-reduced-motion: reduce) {
		.background-canvas {
			transition: none !important;
			transform: none !important;
		}
	}
	
	@media (prefers-contrast: high) {
		.background-canvas {
			filter: contrast(200%) brightness(150%);
		}
	}
</style>
