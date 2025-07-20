import * as THREE from 'three';
import { get } from 'svelte/store';
import { settingsStore } from '$stores/settings';
import { colorStore } from '$stores/color';
import { debounce } from './utils';

export interface RendererConfig {
	canvas: HTMLCanvasElement;
	alpha?: boolean;
	antialias?: boolean;
	powerPreference?: 'high-performance' | 'low-power' | 'default';
	enable4K?: boolean;
	enableHDR?: boolean;
	enablePostProcessing?: boolean;
	enableShadows?: boolean;
	shadowMapSize?: number;
	maxLights?: number;
}

export interface RenderTarget {
	width: number;
	height: number;
	pixelRatio: number;
	format: THREE.PixelFormat;
	type: THREE.TextureDataType;
}

export interface PerformanceMetrics {
	fps: number;
	frameTime: number;
	drawCalls: number;
	triangles: number;
	geometries: number;
	textures: number;
	memoryUsage: number;
	gpuMemory: number;
}

class ResourceManager {
	private static instance: ResourceManager;
	private geometries = new Map<
		string,
		{ geometry: THREE.BufferGeometry; lastUsed: number; refCount: number }
	>();
	private materials = new Map<
		string,
		{ material: THREE.Material; lastUsed: number; refCount: number }
	>();
	private textures = new Map<
		string,
		{ texture: THREE.Texture; lastUsed: number; refCount: number }
	>();
	private cleanupInterval: NodeJS.Timeout;
	private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
	private readonly MAX_IDLE_TIME = 120000; // 2 minutes

	private constructor() {
		this.cleanupInterval = setInterval(() => this.performCleanup(), this.CLEANUP_INTERVAL);
	}

	static getInstance(): ResourceManager {
		if (!ResourceManager.instance) {
			ResourceManager.instance = new ResourceManager();
		}
		return ResourceManager.instance;
	}

	addGeometry(key: string, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
		if (this.geometries.has(key)) {
			const existing = this.geometries.get(key)!;
			existing.refCount++;
			existing.lastUsed = Date.now();
			return existing.geometry;
		}

		this.geometries.set(key, {
			geometry: geometry.clone(),
			lastUsed: Date.now(),
			refCount: 1
		});
		return geometry;
	}

	addMaterial(key: string, material: THREE.Material): THREE.Material {
		if (this.materials.has(key)) {
			const existing = this.materials.get(key)!;
			existing.refCount++;
			existing.lastUsed = Date.now();
			return existing.material;
		}

		this.materials.set(key, {
			material: material.clone(),
			lastUsed: Date.now(),
			refCount: 1
		});
		return material;
	}

	addTexture(key: string, texture: THREE.Texture): THREE.Texture {
		if (this.textures.has(key)) {
			const existing = this.textures.get(key)!;
			existing.refCount++;
			existing.lastUsed = Date.now();
			return existing.texture;
		}

		this.textures.set(key, {
			texture: texture.clone(),
			lastUsed: Date.now(),
			refCount: 1
		});
		return texture;
	}

	releaseGeometry(key: string): void {
		const resource = this.geometries.get(key);
		if (resource) {
			resource.refCount--;
			if (resource.refCount <= 0) {
				resource.geometry.dispose();
				this.geometries.delete(key);
			}
		}
	}

	releaseMaterial(key: string): void {
		const resource = this.materials.get(key);
		if (resource) {
			resource.refCount--;
			if (resource.refCount <= 0) {
				resource.material.dispose();
				this.materials.delete(key);
			}
		}
	}

	releaseTexture(key: string): void {
		const resource = this.textures.get(key);
		if (resource) {
			resource.refCount--;
			if (resource.refCount <= 0) {
				resource.texture.dispose();
				this.textures.delete(key);
			}
		}
	}

	private performCleanup(): void {
		const now = Date.now();

		// Cleanup unused geometries
		for (const [key, resource] of this.geometries.entries()) {
			if (resource.refCount === 0 && now - resource.lastUsed > this.MAX_IDLE_TIME) {
				resource.geometry.dispose();
				this.geometries.delete(key);
			}
		}

		// Cleanup unused materials
		for (const [key, resource] of this.materials.entries()) {
			if (resource.refCount === 0 && now - resource.lastUsed > this.MAX_IDLE_TIME) {
				resource.material.dispose();
				this.materials.delete(key);
			}
		}

		// Cleanup unused textures
		for (const [key, resource] of this.textures.entries()) {
			if (resource.refCount === 0 && now - resource.lastUsed > this.MAX_IDLE_TIME) {
				resource.texture.dispose();
				this.textures.delete(key);
			}
		}
	}

	getMemoryUsage(): { geometries: number; materials: number; textures: number; total: number } {
		return {
			geometries: this.geometries.size,
			materials: this.materials.size,
			textures: this.textures.size,
			total: this.geometries.size + this.materials.size + this.textures.size
		};
	}

	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}

		for (const resource of this.geometries.values()) {
			resource.geometry.dispose();
		}
		for (const resource of this.materials.values()) {
			resource.material.dispose();
		}
		for (const resource of this.textures.values()) {
			resource.texture.dispose();
		}

		this.geometries.clear();
		this.materials.clear();
		this.textures.clear();
	}
}

export class ThreeRenderer {
	private static instance: ThreeRenderer | null = null;
	private static instanceCount = 0;

	private renderer!: THREE.WebGLRenderer;
	private scene!: THREE.Scene;
	private camera!: THREE.PerspectiveCamera;
	private canvas: HTMLCanvasElement;
	private config: RendererConfig;
	private resourceManager: ResourceManager;

	// Lighting system
	private ambientLight!: THREE.AmbientLight;
	private directionalLight!: THREE.DirectionalLight;
	private pointLights: THREE.PointLight[] = [];
	private environmentLight!: THREE.HemisphereLight;

	// Post-processing
	private composer?: any; // EffectComposer
	private renderPass?: any;
	private bloomPass?: any;
	private fxaaPass?: any;
	private tonemapPass?: any;

	// Performance monitoring
	private performanceMetrics: PerformanceMetrics = {
		fps: 60,
		frameTime: 16.67,
		drawCalls: 0,
		triangles: 0,
		geometries: 0,
		textures: 0,
		memoryUsage: 0,
		gpuMemory: 0
	};
	private frameCount = 0;
	private lastFPSUpdate = 0;
	private renderLoop?: number;

	// Context loss handling
	private contextLossHandler?: () => void;
	private contextRestoreHandler?: () => void;
	private isContextLost = false;

	// Object management
	private objects = new Map<string, THREE.Object3D>();
	private lastResize = 0;
	private resizeObserver?: ResizeObserver;

	private constructor(config: RendererConfig) {
		this.canvas = config.canvas;
		this.config = {
			alpha: true,
			antialias: true,
			powerPreference: 'high-performance',
			enable4K: true,
			enableHDR: true,
			enablePostProcessing: true,
			enableShadows: true,
			shadowMapSize: 2048,
			maxLights: 8,
			...config
		};

		this.resourceManager = ResourceManager.getInstance();
		ThreeRenderer.instanceCount++;
	}

	static getInstance(config?: RendererConfig): ThreeRenderer {
		if (!ThreeRenderer.instance && config) {
			ThreeRenderer.instance = new ThreeRenderer(config);
		}
		return ThreeRenderer.instance!;
	}

	static createInstance(config: RendererConfig): ThreeRenderer {
		return new ThreeRenderer(config);
	}

	async initialize(): Promise<boolean> {
		try {
			await this.initRenderer();
			await this.initScene();
			await this.initCamera();
			await this.initLighting();

			if (this.config.enablePostProcessing) {
				await this.initPostProcessing();
			}

			this.setupEventListeners();
			this.setupContextLossHandling();
			this.setupResizeObserver();

			console.log('ThreeRenderer initialized successfully');
			return true;
		} catch (error) {
			console.error('ThreeRenderer initialization failed:', error);
			return false;
		}
	}

	private async initRenderer(): Promise<void> {
		const contextAttributes = {
			alpha: this.config.alpha,
			antialias: this.config.antialias,
			powerPreference: this.config.powerPreference,
			preserveDrawingBuffer: false,
			logarithmicDepthBuffer: true,
			precision: 'highp',
			premultipliedAlpha: true
		};

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			...contextAttributes
		});

		// High-quality settings for 4K support
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.config.enable4K ? 2 : 1.5));
		this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);

		// Advanced renderer settings
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.2;
		this.renderer.shadowMap.enabled = this.config.enableShadows;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.shadowMap.autoUpdate = true;

		// Enable HDR if supported
		if (this.config.enableHDR) {
			this.renderer.capabilities.isWebGL2 = true;
		}

		// Performance optimizations
		this.renderer.sortObjects = true;
		this.renderer.autoClear = true;
		this.renderer.autoClearColor = true;
		this.renderer.autoClearDepth = true;
		this.renderer.autoClearStencil = true;
	}

	private async initScene(): Promise<void> {
		this.scene = new THREE.Scene();
		this.scene.background = null; // Transparent for background integration
		this.scene.environment = null;

		// Enable fog for depth perception
		this.scene.fog = new THREE.Fog(0x000000, 10, 100);
	}

	private async initCamera(): Promise<void> {
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
		this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
		this.camera.position.set(0, 0, 10);
		this.camera.lookAt(0, 0, 0);

		// Enable camera auto-updating
		this.camera.matrixAutoUpdate = true;
	}

	private async initLighting(): Promise<void> {
		// Ambient light for base illumination
		this.ambientLight = new THREE.AmbientLight(0x404040, 0.4);
		this.scene.add(this.ambientLight);

		// Main directional light (sun)
		this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
		this.directionalLight.position.set(10, 10, 5);
		this.directionalLight.castShadow = this.config.enableShadows;
		this.directionalLight.shadow.mapSize.width = this.config.shadowMapSize!;
		this.directionalLight.shadow.mapSize.height = this.config.shadowMapSize!;
		this.directionalLight.shadow.camera.near = 0.5;
		this.directionalLight.shadow.camera.far = 500;
		this.directionalLight.shadow.camera.left = -50;
		this.directionalLight.shadow.camera.right = 50;
		this.directionalLight.shadow.camera.top = 50;
		this.directionalLight.shadow.camera.bottom = -50;
		this.directionalLight.shadow.bias = -0.0001;
		this.scene.add(this.directionalLight);

		// Environment hemisphere light
		this.environmentLight = new THREE.HemisphereLight(0x87ceeb, 0x362d1d, 0.6);
		this.scene.add(this.environmentLight);

		// Dynamic point lights for visual interest
		this.addDynamicLights();
	}

	private addDynamicLights(): void {
		const colors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24, 0x6c5ce7];

		for (let i = 0; i < Math.min(this.config.maxLights!, 3); i++) {
			const light = new THREE.PointLight(colors[i % colors.length], 0.8, 20);
			light.position.set(
				(Math.random() - 0.5) * 20,
				(Math.random() - 0.5) * 20,
				Math.random() * 10 + 5
			);
			light.castShadow = this.config.enableShadows;
			light.shadow.mapSize.width = 512;
			light.shadow.mapSize.height = 512;
			this.pointLights.push(light);
			this.scene.add(light);
		}
	}

	private async initPostProcessing(): Promise<void> {
		if (!this.config.enablePostProcessing) return;

		try {
			const { EffectComposer } = await import(
				'three/examples/jsm/postprocessing/EffectComposer.js'
			);
			const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
			const { UnrealBloomPass } = await import(
				'three/examples/jsm/postprocessing/UnrealBloomPass.js'
			);
			const { FXAAShader } = await import('three/examples/jsm/shaders/FXAAShader.js');
			const { ShaderPass } = await import('three/examples/jsm/postprocessing/ShaderPass.js');

			// Create composer with high-resolution render target for 4K
			const renderTarget = new THREE.WebGLRenderTarget(
				this.canvas.clientWidth * this.renderer.getPixelRatio(),
				this.canvas.clientHeight * this.renderer.getPixelRatio(),
				{
					format: THREE.RGBAFormat,
					type: this.config.enableHDR ? THREE.HalfFloatType : THREE.UnsignedByteType,
					minFilter: THREE.LinearFilter,
					magFilter: THREE.LinearFilter,
					generateMipmaps: false,
					samples: this.config.antialias ? 4 : 0
				}
			);

			this.composer = new EffectComposer(this.renderer, renderTarget);

			// Main render pass
			this.renderPass = new RenderPass(this.scene, this.camera);
			this.composer.addPass(this.renderPass);

			// Bloom pass for glowing effects
			this.bloomPass = new UnrealBloomPass(
				new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight),
				0.4, // strength
				0.6, // radius
				0.85 // threshold
			);
			this.composer.addPass(this.bloomPass);

			// FXAA anti-aliasing for crisp 4K rendering
			if (this.config.antialias) {
				this.fxaaPass = new ShaderPass(FXAAShader);
				this.fxaaPass.material.uniforms['resolution'].value.x =
					1 / (this.canvas.clientWidth * this.renderer.getPixelRatio());
				this.fxaaPass.material.uniforms['resolution'].value.y =
					1 / (this.canvas.clientHeight * this.renderer.getPixelRatio());
				this.composer.addPass(this.fxaaPass);
			}
		} catch (error) {
			console.warn('Post-processing unavailable:', error);
			this.config.enablePostProcessing = false;
		}
	}

	private setupEventListeners(): void {
		// Color system integration
		const unsubscribeColor = colorStore.subscribe((palette) => {
			this.updateLightingColors(palette);
		});

		// Settings integration
		const unsubscribeSettings = settings.subscribe((settingsData) => {
			this.updateFromSettings(settingsData);
		});

		// Store cleanup functions
		this.canvas.addEventListener('webglcontextlost', this.handleContextLoss.bind(this));
		this.canvas.addEventListener('webglcontextrestored', this.handleContextRestore.bind(this));
	}

	private setupContextLossHandling(): void {
		this.contextLossHandler = (event: Event) => {
			event.preventDefault();
			this.isContextLost = true;
			this.stopRenderLoop();
			console.warn('WebGL context lost, attempting recovery...');
		};

		this.contextRestoreHandler = () => {
			console.log('WebGL context restored');
			this.isContextLost = false;
			this.initialize().then((success) => {
				if (success) {
					this.startRenderLoop();
					console.log('Renderer recovered successfully');
				} else {
					console.error('Failed to recover renderer');
				}
			});
		};

		this.canvas.addEventListener('webglcontextlost', this.contextLossHandler);
		this.canvas.addEventListener('webglcontextrestored', this.contextRestoreHandler);
	}

	private setupResizeObserver(): void {
		this.resizeObserver = new ResizeObserver(
			debounce((entries) => {
				for (const entry of entries) {
					if (entry.target === this.canvas) {
						this.handleResize();
					}
				}
			}, 100)
		);

		this.resizeObserver.observe(this.canvas);
	}

	private handleResize(): void {
		const now = Date.now();
		if (now - this.lastResize < 100) return; // Throttle resizes
		this.lastResize = now;

		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize(width, height);

		if (this.composer) {
			this.composer.setSize(width, height);

			if (this.fxaaPass) {
				this.fxaaPass.material.uniforms['resolution'].value.x =
					1 / (width * this.renderer.getPixelRatio());
				this.fxaaPass.material.uniforms['resolution'].value.y =
					1 / (height * this.renderer.getPixelRatio());
			}
		}
	}

	private handleContextLoss(event: Event): void {
		this.contextLossHandler?.(event);
	}

	private handleContextRestore(): void {
		this.contextRestoreHandler?.();
	}

	private updateLightingColors(palette: any): void {
		if (!palette.current) return;

		const color = new THREE.Color(palette.current);

		// Update environment lighting
		this.environmentLight.color.setHex(0x87ceeb);
		this.environmentLight.groundColor.copy(color).multiplyScalar(0.3);

		// Update point lights with accent colors
		this.pointLights.forEach((light, index) => {
			if (palette.accent && index === 0) {
				light.color.set(palette.accent);
			} else if (palette.secondary && index === 1) {
				light.color.set(palette.secondary);
			}
		});
	}

	private updateFromSettings(settingsData: any): void {
		if (!settingsData) return;

		// Update shadow quality
		if (this.config.enableShadows !== settingsData.enableShadows) {
			this.config.enableShadows = settingsData.enableShadows;
			this.renderer.shadowMap.enabled = this.config.enableShadows;
			this.directionalLight.castShadow = this.config.enableShadows;
		}

		// Update performance settings
		if (settingsData.performance3D) {
			this.adjustPerformanceSettings(settingsData.performance3D);
		}
	}

	private adjustPerformanceSettings(level: string): void {
		switch (level) {
			case 'high':
				this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
				this.config.shadowMapSize = 2048;
				break;
			case 'medium':
				this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
				this.config.shadowMapSize = 1024;
				break;
			case 'low':
				this.renderer.setPixelRatio(1);
				this.config.shadowMapSize = 512;
				this.config.enableShadows = false;
				break;
		}
	}

	// Public API methods
	addObject(id: string, object: THREE.Object3D, position?: THREE.Vector3): void {
		if (this.objects.has(id)) {
			this.removeObject(id);
		}

		if (position) {
			object.position.copy(position);
		}

		this.objects.set(id, object);
		this.scene.add(object);
	}

	removeObject(id: string): boolean {
		const object = this.objects.get(id);
		if (!object) return false;

		this.scene.remove(object);
		this.objects.delete(id);

		// Dispose resources
		object.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				if (child.geometry) child.geometry.dispose();
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach((mat) => mat.dispose());
					} else {
						child.material.dispose();
					}
				}
			}
		});

		return true;
	}

	getObject(id: string): THREE.Object3D | null {
		return this.objects.get(id) || null;
	}

	updateObject(id: string, updateFn: (object: THREE.Object3D) => void): boolean {
		const object = this.objects.get(id);
		if (!object) return false;

		updateFn(object);
		return true;
	}

	startRenderLoop(): void {
		if (this.renderLoop || this.isContextLost) return;

		const render = (timestamp: number) => {
			if (this.isContextLost) return;

			const startTime = performance.now();

			// Update performance metrics
			this.updatePerformanceMetrics(timestamp);

			// Animate point lights
			this.animateLights(timestamp);

			// Render scene
			if (this.composer && this.config.enablePostProcessing) {
				this.composer.render();
			} else {
				this.renderer.render(this.scene, this.camera);
			}

			this.performanceMetrics.frameTime = performance.now() - startTime;
			this.renderLoop = requestAnimationFrame(render);
		};

		this.renderLoop = requestAnimationFrame(render);
	}

	stopRenderLoop(): void {
		if (this.renderLoop) {
			cancelAnimationFrame(this.renderLoop);
			this.renderLoop = undefined;
		}
	}

	private updatePerformanceMetrics(timestamp: number): void {
		this.frameCount++;

		if (timestamp - this.lastFPSUpdate >= 1000) {
			this.performanceMetrics.fps = Math.round(
				(this.frameCount * 1000) / (timestamp - this.lastFPSUpdate)
			);
			this.frameCount = 0;
			this.lastFPSUpdate = timestamp;

			// Update other metrics
			const info = this.renderer.info;
			this.performanceMetrics.drawCalls = info.render.calls;
			this.performanceMetrics.triangles = info.render.triangles;
			this.performanceMetrics.geometries = info.memory.geometries;
			this.performanceMetrics.textures = info.memory.textures;

			// Get resource manager stats
			const resourceStats = this.resourceManager.getMemoryUsage();
			this.performanceMetrics.memoryUsage = resourceStats.total;
		}
	}

	private animateLights(timestamp: number): void {
		const time = timestamp * 0.001; // Convert to seconds

		this.pointLights.forEach((light, index) => {
			const offset = index * Math.PI * 0.66;
			light.position.x = Math.sin(time * 0.3 + offset) * 10;
			light.position.z = Math.cos(time * 0.2 + offset) * 8 + 5;
			light.intensity = 0.5 + Math.sin(time * 0.8 + offset) * 0.3;
		});
	}

	getPerformanceMetrics(): PerformanceMetrics {
		return { ...this.performanceMetrics };
	}

	setCamera(position: THREE.Vector3, target: THREE.Vector3): void {
		this.camera.position.copy(position);
		this.camera.lookAt(target);
	}

	setCameraFromSpherical(radius: number, phi: number, theta: number): void {
		const spherical = new THREE.Spherical(radius, phi, theta);
		this.camera.position.setFromSpherical(spherical);
		this.camera.lookAt(0, 0, 0);
	}

	capture4KScreenshot(): Promise<string> {
		return new Promise((resolve) => {
			const originalPixelRatio = this.renderer.getPixelRatio();
			const originalSize = this.renderer.getSize(new THREE.Vector2());

			// Temporarily set to 4K resolution
			this.renderer.setPixelRatio(1);
			this.renderer.setSize(3840, 2160);

			// Render at 4K
			if (this.composer && this.config.enablePostProcessing) {
				this.composer.render();
			} else {
				this.renderer.render(this.scene, this.camera);
			}

			// Get image data
			const imageData = this.canvas.toDataURL('image/png');

			// Restore original settings
			this.renderer.setPixelRatio(originalPixelRatio);
			this.renderer.setSize(originalSize.x, originalSize.y);

			resolve(imageData);
		});
	}

	dispose(): void {
		this.stopRenderLoop();

		// Remove event listeners
		if (this.contextLossHandler) {
			this.canvas.removeEventListener('webglcontextlost', this.contextLossHandler);
		}
		if (this.contextRestoreHandler) {
			this.canvas.removeEventListener('webglcontextrestored', this.contextRestoreHandler);
		}

		// Dispose resize observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}

		// Clear objects
		for (const [id] of this.objects) {
			this.removeObject(id);
		}

		// Dispose composer
		if (this.composer) {
			this.composer.dispose();
		}

		// Dispose renderer
		this.renderer.dispose();

		// Decrement instance count
		ThreeRenderer.instanceCount--;
		if (ThreeRenderer.instanceCount === 0) {
			ThreeRenderer.instance = null;
			ResourceManager.getInstance().destroy();
		}
	}

	static cleanup(): void {
		if (ThreeRenderer.instance) {
			ThreeRenderer.instance.dispose();
		}
	}
}

export default ThreeRenderer;
