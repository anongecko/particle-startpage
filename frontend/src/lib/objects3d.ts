import * as THREE from 'three';
import { get } from 'svelte/store';
import chroma from 'chroma-js';
import type { ColorPalette } from '$stores/color';
import type { Objects3DSettings } from '$stores/settings';
import { objects3DSettings } from '$stores/settings';

// ===== CORE INTERFACES =====

export interface Object3DConfig {
	id: string;
	name: string;
	category:
		| 'geometric'
		| 'crystal'
		| 'tech'
		| 'organic'
		| 'creative'
		| 'abstract'
		| 'development'
		| 'learning'
		| 'entertainment'
		| 'shopping'
		| 'finance'
		| 'work'
		| 'social'
		| 'food'
		| 'tools'
		| 'misc';
	description: string;
	complexity: 'low' | 'medium' | 'high' | 'ultra';
	tags: string[];
	isDefault?: boolean;
	fallbackIcon: string;

	// Core properties
	geometry: GeometryDefinition;
	material: MaterialDefinition;
	lighting: LightingDefinition;
	animations: AnimationDefinition;
	colorAdaptation: ColorAdaptationDefinition;
	performance: PerformanceDefinition;

	// Creation function
	createGeometry: (params?: GeometryParams) => THREE.BufferGeometry;
}

export interface GeometryParams {
	scale?: number;
	complexity?: number;
	subdivisions?: number;
	detail?: number;
	[key: string]: any;
}

export interface GeometryDefinition {
	type: 'procedural' | 'parametric' | 'algorithmic' | 'composite';
	baseShape?:
		| 'box'
		| 'sphere'
		| 'cylinder'
		| 'cone'
		| 'torus'
		| 'icosahedron'
		| 'dodecahedron'
		| 'custom';
	parameters: Record<string, number>;
	modifiers?: GeometryModifier[];
	transformations?: GeometryTransformation;
	triangleCount?: number;
}

export interface MaterialDefinition {
	type: 'standard' | 'physical' | 'phong' | 'lambert' | 'toon' | 'shader';
	properties: MaterialProperties;
	textures?: MaterialTextures;
	uniforms?: Record<string, any>;
}

export interface LightingDefinition {
	receiveShadows: boolean;
	castShadows: boolean;
	ambientIntensity: number;
	directionalIntensity: number;
	specialEffects?: {
		rimLighting?: boolean;
		subsurfaceScattering?: boolean;
		volumetricLighting?: boolean;
		emissiveGlow?: boolean;
	};
}

export interface AnimationDefinition {
	idle: IdleAnimationConfig;
	hover: HoverAnimationConfig;
	click: ClickAnimationConfig;
	focus: FocusAnimationConfig;
	custom?: CustomAnimationConfig[];
	performance: AnimationPerformanceConfig;
}

export interface ColorAdaptationDefinition {
	mode: ColorAdaptationMode;
	intensity: number;
	saturationBoost: number;
	lightnessAdjust: number;
	blendMode: 'multiply' | 'overlay' | 'screen' | 'normal';
	emissiveStrength: number;
	transitionDuration: number;
	gradientSupport?: boolean;
}

export interface PerformanceDefinition {
	lodLevels: number[];
	instanceLimit: number;
	autoLOD: boolean;
	cullingDistance: number;
	shadowQuality: 'low' | 'medium' | 'high';
	geometryOptimization: boolean;
	memoryFootprint: 'minimal' | 'standard' | 'detailed';
	triangleCount: number;
}

// ===== UTILITY INTERFACES =====

export interface GeometryModifier {
	type: 'bevel' | 'twist' | 'taper' | 'noise' | 'subdivide' | 'smooth' | 'extrude' | 'inset';
	parameters: Record<string, number>;
	order: number;
}

export interface GeometryTransformation {
	scale?: [number, number, number];
	rotation?: [number, number, number];
	position?: [number, number, number];
	pivot?: [number, number, number];
}

export interface MaterialProperties {
	roughness?: number;
	metalness?: number;
	opacity?: number;
	transparent?: boolean;
	emissive?: string | number; // Color representation
	envMapIntensity?: number;
	clearcoat?: number;
	clearcoatRoughness?: number;
	transmission?: number;
	thickness?: number;
	ior?: number;
	specularIntensity?: number;
	specularColor?: string;
	wireframe?: boolean;
	side?: THREE.Side;
}

export interface MaterialTextures {
	diffuse?: string;
	normal?: string;
	roughness?: string;
	metalness?: string;
	ao?: string;
	height?: string;
	emissive?: string;
	environment?: string;
}

export interface IdleAnimationConfig {
	enabled: boolean;
	type: 'rotate' | 'float' | 'pulse' | 'breathe' | 'wobble' | 'orbit' | 'pendulum' | 'sway';
	speed: number;
	amplitude: number;
	axis?: [number, number, number];
	offset?: number;
	easing?: EasingFunction;
}

export interface HoverAnimationConfig {
	enabled: boolean;
	scale: number;
	rotation: [number, number, number];
	translation: [number, number, number];
	glowIntensity: number;
	duration: number;
	easing: EasingFunction;
	anticipation?: number;
}

export interface ClickAnimationConfig {
	enabled: boolean;
	type: 'bounce' | 'flash' | 'ripple' | 'scale' | 'spin' | 'shatter' | 'morph';
	intensity: number;
	duration: number;
	particles?: boolean;
	sound?: string;
	haptic?: boolean;
}

export interface FocusAnimationConfig {
	enabled: boolean;
	outlineColor: string;
	outlineWidth: number;
	pulseSpeed: number;
	glowRadius?: number;
}

export interface CustomAnimationConfig {
	name: string;
	trigger: 'time' | 'event' | 'state';
	keyframes: AnimationKeyframe[];
	duration: number;
	loop: boolean;
}

export interface AnimationKeyframe {
	time: number;
	transform: Partial<GeometryTransformation>;
	material?: Partial<MaterialProperties>;
}

export interface AnimationPerformanceConfig {
	enableOnLowEnd: boolean;
	reducedMotion: 'none' | 'scale' | 'opacity' | 'disable';
	targetFPS: number;
	adaptiveQuality: boolean;
}

export type ColorAdaptationMode =
	| 'auto'
	| 'dominant'
	| 'vibrant'
	| 'muted'
	| 'light'
	| 'dark'
	| 'accent'
	| 'complementary'
	| 'triadic'
	| 'analogous'
	| 'custom';

export type EasingFunction =
	| 'linear'
	| 'easeIn'
	| 'easeOut'
	| 'easeInOut'
	| 'elastic'
	| 'bounce'
	| 'back'
	| 'circ'
	| 'expo';

// ===== INSTANCE MANAGEMENT =====

export interface Object3DInstance {
	id: string;
	objectId: string;
	config: Object3DConfig;
	mesh: THREE.Mesh;
	mixer?: THREE.AnimationMixer;
	boundingBox: THREE.Box3;
	isVisible: boolean;
	lodLevel: number;
	lastUpdateTime: number;
	customData?: Record<string, any>;
	state: {
		isHovered: boolean;
		isFocused: boolean;
		isClicked: boolean;
		isIdle: boolean;
	};
	performance: {
		lastFrameTime: number;
		triangleCount: number;
		memoryUsage: number;
	};
}

// ===== WEBGL CONTEXT MANAGER =====

class WebGLContextManager {
	private static instance: WebGLContextManager;
	private context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
	private capabilities: {
		maxTextureSize: number;
		maxVertexTextures: number;
		maxFragmentTextures: number;
		maxVertexUniforms: number;
		maxFragmentUniforms: number;
		supportsFloatTextures: boolean;
		supportsHalfFloatTextures: boolean;
		supportsInstancing: boolean;
		maxSamples: number;
	} | null = null;

	static getInstance(): WebGLContextManager {
		if (!this.instance) {
			this.instance = new WebGLContextManager();
		}
		return this.instance;
	}

	initialize(canvas?: HTMLCanvasElement): boolean {
		try {
			const testCanvas = canvas || document.createElement('canvas');
			this.context = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');

			if (!this.context) {
				console.warn('WebGL not supported');
				return false;
			}

			this.detectCapabilities();
			return true;
		} catch (error) {
			console.error('WebGL initialization failed:', error);
			return false;
		}
	}

	private detectCapabilities(): void {
		if (!this.context) return;

		const gl = this.context;
		this.capabilities = {
			maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
			maxVertexTextures: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
			maxFragmentTextures: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
			maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
			maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
			supportsFloatTextures: !!gl.getExtension('OES_texture_float'),
			supportsHalfFloatTextures: !!gl.getExtension('OES_texture_half_float'),
			supportsInstancing: !!gl.getExtension('ANGLE_instanced_arrays'),
			maxSamples: this.isWebGL2() ? gl.getParameter((gl as WebGL2RenderingContext).MAX_SAMPLES) : 4
		};
	}

	getCapabilities() {
		return this.capabilities;
	}

	getContext(): WebGLRenderingContext | WebGL2RenderingContext | null {
		return this.context;
	}

	isWebGL2(): boolean {
		return this.context instanceof WebGL2RenderingContext;
	}
}

// ===== TEXTURE MANAGER =====

class TextureManager {
	private static textureCache = new Map<string, THREE.Texture>();
	private static loadingPromises = new Map<string, Promise<THREE.Texture>>();
	private static loader = new THREE.TextureLoader();

	static async loadTexture(url: string): Promise<THREE.Texture> {
		// Check cache first
		if (this.textureCache.has(url)) {
			return this.textureCache.get(url)!;
		}

		// Check if already loading
		if (this.loadingPromises.has(url)) {
			return this.loadingPromises.get(url)!;
		}

		// Load texture
		const promise = new Promise<THREE.Texture>((resolve, reject) => {
			this.loader.load(
				url,
				(texture) => {
					texture.wrapS = THREE.RepeatWrapping;
					texture.wrapT = THREE.RepeatWrapping;
					texture.generateMipmaps = true;
					texture.minFilter = THREE.LinearMipmapLinearFilter;
					texture.magFilter = THREE.LinearFilter;

					this.textureCache.set(url, texture);
					this.loadingPromises.delete(url);
					resolve(texture);
				},
				undefined,
				(error) => {
					this.loadingPromises.delete(url);
					reject(error);
				}
			);
		});

		this.loadingPromises.set(url, promise);
		return promise;
	}

	static createProceduralTexture(
		type: 'noise' | 'gradient' | 'pattern',
		size: number = 256,
		params: Record<string, any> = {}
	): THREE.DataTexture {
		const data = new Uint8Array(size * size * 4);

		for (let i = 0; i < size; i++) {
			for (let j = 0; j < size; j++) {
				const index = (i * size + j) * 4;

				switch (type) {
					case 'noise':
						const noise = Math.random();
						data[index] = noise * 255;
						data[index + 1] = noise * 255;
						data[index + 2] = noise * 255;
						data[index + 3] = 255;
						break;
					case 'gradient':
						const gradient = j / size;
						data[index] = gradient * 255;
						data[index + 1] = gradient * 255;
						data[index + 2] = gradient * 255;
						data[index + 3] = 255;
						break;
					case 'pattern':
						const pattern = ((i + j) % 2) * 255;
						data[index] = pattern;
						data[index + 1] = pattern;
						data[index + 2] = pattern;
						data[index + 3] = 255;
						break;
				}
			}
		}

		return new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
	}

	static clearCache(): void {
		for (const texture of this.textureCache.values()) {
			texture.dispose();
		}
		this.textureCache.clear();
		this.loadingPromises.clear();
	}

	static getMemoryUsage(): number {
		let totalMemory = 0;
		for (const texture of this.textureCache.values()) {
			const { width, height } = texture.image || { width: 0, height: 0 };
			totalMemory += width * height * 4; // RGBA
		}
		return totalMemory;
	}
}

// ===== GEOMETRY FACTORY =====

export abstract class BaseGeometryCreator {
	protected cache = new Map<string, THREE.BufferGeometry>();

	abstract create(params: GeometryParams): THREE.BufferGeometry;

	protected getCacheKey(params: GeometryParams): string {
		return JSON.stringify(params, Object.keys(params).sort());
	}

	protected getFromCache(params: GeometryParams): THREE.BufferGeometry | null {
		const key = this.getCacheKey(params);
		const cached = this.cache.get(key);
		return cached ? cached.clone() : null;
	}

	protected addToCache(params: GeometryParams, geometry: THREE.BufferGeometry): void {
		const key = this.getCacheKey(params);
		this.cache.set(key, geometry.clone());
	}

	protected optimizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.computeVertexNormals();

		// Remove unnecessary attributes for performance
		if (geometry.attributes.uv2) {
			geometry.deleteAttribute('uv2');
		}

		return geometry;
	}

	clearCache(): void {
		for (const geometry of this.cache.values()) {
			geometry.dispose();
		}
		this.cache.clear();
	}
}

class GeometryFactory {
	private static creators = new Map<string, BaseGeometryCreator>();
	private static primitiveCache = new Map<string, THREE.BufferGeometry>();

	static registerCreator(type: string, creator: BaseGeometryCreator): void {
		this.creators.set(type, creator);
	}

	static createGeometry(
		definition: GeometryDefinition,
		customParams?: GeometryParams
	): THREE.BufferGeometry {
		try {
			const params = { ...definition.parameters, ...customParams };
			const creator = this.creators.get(definition.type);

			let geometry: THREE.BufferGeometry;

			if (creator) {
				geometry = creator.create(params);
			} else {
				geometry = this.createPrimitive(definition.baseShape || 'box', params);
			}

			// Apply modifiers
			if (definition.modifiers) {
				for (const modifier of definition.modifiers.sort((a, b) => a.order - b.order)) {
					geometry = ModifierFactory.apply(geometry, modifier);
				}
			}

			// Apply transformations
			if (definition.transformations) {
				this.applyTransformations(geometry, definition.transformations);
			}

			return this.optimizeGeometry(geometry);
		} catch (error) {
			console.error('Geometry creation failed:', error);
			return new THREE.BoxGeometry(1, 1, 1); // Fallback
		}
	}

	private static createPrimitive(shape: string, params: GeometryParams): THREE.BufferGeometry {
		const cacheKey = `${shape}_${JSON.stringify(params)}`;

		if (this.primitiveCache.has(cacheKey)) {
			return this.primitiveCache.get(cacheKey)!.clone();
		}

		let geometry: THREE.BufferGeometry;

		switch (shape) {
			case 'box':
				geometry = new THREE.BoxGeometry(
					params.width || 1,
					params.height || 1,
					params.depth || 1,
					params.widthSegments || 1,
					params.heightSegments || 1,
					params.depthSegments || 1
				);
				break;
			case 'sphere':
				geometry = new THREE.SphereGeometry(
					params.radius || 0.5,
					params.widthSegments || 32,
					params.heightSegments || 16
				);
				break;
			case 'cylinder':
				geometry = new THREE.CylinderGeometry(
					params.radiusTop || 0.5,
					params.radiusBottom || 0.5,
					params.height || 1,
					params.radialSegments || 32,
					params.heightSegments || 1
				);
				break;
			case 'cone':
				geometry = new THREE.ConeGeometry(
					params.radius || 0.5,
					params.height || 1,
					params.radialSegments || 32
				);
				break;
			case 'torus':
				geometry = new THREE.TorusGeometry(
					params.radius || 0.5,
					params.tube || 0.2,
					params.radialSegments || 16,
					params.tubularSegments || 100
				);
				break;
			case 'icosahedron':
				geometry = new THREE.IcosahedronGeometry(params.radius || 0.5, params.detail || 0);
				break;
			case 'dodecahedron':
				geometry = new THREE.DodecahedronGeometry(params.radius || 0.5, params.detail || 0);
				break;
			default:
				geometry = new THREE.BoxGeometry(1, 1, 1);
		}

		this.primitiveCache.set(cacheKey, geometry.clone());
		return geometry;
	}

	private static applyTransformations(
		geometry: THREE.BufferGeometry,
		transformations: GeometryTransformation
	): void {
		if (transformations.scale) {
			geometry.scale(...transformations.scale);
		}
		if (transformations.rotation) {
			geometry.rotateX(transformations.rotation[0]);
			geometry.rotateY(transformations.rotation[1]);
			geometry.rotateZ(transformations.rotation[2]);
		}
		if (transformations.position) {
			geometry.translate(...transformations.position);
		}
	}

	private static optimizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
		const settings = get(objects3DSettings);

		if (settings.optimization.geometryOptimization) {
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
			geometry.computeVertexNormals();
		}

		return geometry;
	}

	static clearAllCaches(): void {
		for (const geometry of this.primitiveCache.values()) {
			geometry.dispose();
		}
		this.primitiveCache.clear();

		for (const creator of this.creators.values()) {
			creator.clearCache();
		}
	}
}

// ===== MATERIAL FACTORY =====

class MaterialFactory {
	private static materialCache = new Map<string, THREE.Material>();

	static async createMaterial(
		definition: MaterialDefinition,
		colorPalette?: ColorPalette
	): Promise<THREE.Material> {
		const settings = get(objects3DSettings);
		const cacheKey = this.getMaterialCacheKey(definition, colorPalette);

		if (this.materialCache.has(cacheKey)) {
			return this.materialCache.get(cacheKey)!.clone();
		}

		try {
			const baseColor = colorPalette?.dominant || '#4a90e2';
			const materialProps = {
				color: baseColor,
				...definition.properties,
				side: definition.properties.side || THREE.FrontSide
			};

			let material: THREE.Material;

			switch (definition.type) {
				case 'standard':
					material = new THREE.MeshStandardMaterial(materialProps);
					break;
				case 'physical':
					material = new THREE.MeshPhysicalMaterial(materialProps);
					break;
				case 'phong':
					material = new THREE.MeshPhongMaterial(materialProps);
					break;
				case 'lambert':
					material = new THREE.MeshLambertMaterial(materialProps);
					break;
				case 'toon':
					material = new THREE.MeshToonMaterial(materialProps);
					break;
				default:
					material = new THREE.MeshStandardMaterial(materialProps);
			}

			// Apply quality settings
			this.applyQualitySettings(material, settings);

			// Apply textures if specified
			if (definition.textures) {
				await this.applyTextures(material, definition.textures);
			}

			// Apply color adaptation
			if (colorPalette) {
				ColorAdapter.adaptMaterial(material, colorPalette, {
					mode: 'auto',
					intensity: settings.colorAdaptation.intensity,
					saturationBoost: settings.colorAdaptation.saturationBoost,
					lightnessAdjust: settings.colorAdaptation.lightnessAdjust,
					blendMode: 'normal',
					emissiveStrength: settings.colorAdaptation.enabled ? 0.3 : 0,
					transitionDuration: settings.colorAdaptation.transitionDuration
				});
			}

			this.materialCache.set(cacheKey, material.clone());
			return material;
		} catch (error) {
			console.error('Material creation failed:', error);
			return new THREE.MeshStandardMaterial({ color: '#4a90e2' });
		}
	}

	private static applyQualitySettings(material: THREE.Material, settings: Objects3DSettings): void {
		if ('roughness' in material && settings.materialQuality === 'low') {
			(material as any).roughness = Math.max(0.5, (material as any).roughness || 0.5);
		}

		if ('envMapIntensity' in material) {
			(material as any).envMapIntensity = settings.materialQuality === 'high' ? 1 : 0.5;
		}
	}

	private static async applyTextures(
		material: THREE.Material,
		textures: MaterialTextures
	): Promise<void> {
		try {
			const texturePromises: Promise<void>[] = [];

			if (textures.diffuse && 'map' in material) {
				texturePromises.push(
					TextureManager.loadTexture(textures.diffuse).then((texture) => {
						(material as any).map = texture;
					})
				);
			}

			if (textures.normal && 'normalMap' in material) {
				texturePromises.push(
					TextureManager.loadTexture(textures.normal).then((texture) => {
						(material as any).normalMap = texture;
					})
				);
			}

			if (textures.roughness && 'roughnessMap' in material) {
				texturePromises.push(
					TextureManager.loadTexture(textures.roughness).then((texture) => {
						(material as any).roughnessMap = texture;
					})
				);
			}

			await Promise.all(texturePromises);
			material.needsUpdate = true;
		} catch (error) {
			console.warn('Texture loading failed:', error);
		}
	}

	private static getMaterialCacheKey(
		definition: MaterialDefinition,
		colorPalette?: ColorPalette
	): string {
		return `${definition.type}_${JSON.stringify(definition.properties)}_${colorPalette?.dominant || 'default'}`;
	}

	static clearCache(): void {
		for (const material of this.materialCache.values()) {
			material.dispose();
		}
		this.materialCache.clear();
	}
}

// ===== COLOR ADAPTATION SYSTEM =====

class ColorAdapter {
	static adaptMaterial(
		material: THREE.Material,
		colorPalette: ColorPalette,
		definition: ColorAdaptationDefinition
	): void {
		if (!material || !colorPalette) return;

		try {
			const sourceColor = this.getSourceColor(colorPalette, definition.mode);
			const adaptedColor = this.processColor(sourceColor, definition);

			this.applyColorToMaterial(material, adaptedColor, definition);
		} catch (error) {
			console.warn('Color adaptation failed:', error);
		}
	}

	private static getSourceColor(palette: ColorPalette, mode: ColorAdaptationMode): string {
		switch (mode) {
			case 'auto':
			case 'dominant':
				return palette.dominant;
			case 'vibrant':
				return palette.vibrant;
			case 'muted':
				return palette.muted;
			case 'light':
				return palette.light;
			case 'dark':
				return palette.dark;
			case 'accent':
				return palette.accent;
			case 'complementary':
				return palette.complementary;
			case 'triadic':
				return palette.triadic[0];
			case 'analogous':
				return palette.triadic[1];
			default:
				return palette.dominant;
		}
	}

	private static processColor(color: string, definition: ColorAdaptationDefinition): string {
		try {
			let processed = chroma(color);

			if (definition.saturationBoost !== 0) {
				processed = processed.saturate(definition.saturationBoost);
			}

			if (definition.lightnessAdjust !== 0) {
				processed = processed.brighten(definition.lightnessAdjust);
			}

			if (definition.intensity < 1) {
				processed = chroma.mix('#808080', processed, definition.intensity);
			}

			return processed.hex();
		} catch (error) {
			console.warn('Color processing failed:', error);
			return color;
		}
	}

	private static applyColorToMaterial(
		material: THREE.Material,
		color: string,
		definition: ColorAdaptationDefinition
	): void {
		if ('color' in material) {
			const targetColor = new THREE.Color(color);
			this.transitionColor(
				material.color as THREE.Color,
				targetColor,
				definition.transitionDuration
			);
		}

		if ('emissive' in material && definition.emissiveStrength > 0) {
			const emissiveColor = new THREE.Color(color);
			emissiveColor.multiplyScalar(definition.emissiveStrength);
			(material as any).emissive = emissiveColor;
		}
	}

	private static transitionColor(
		current: THREE.Color,
		target: THREE.Color,
		duration: number
	): void {
		// Simple immediate transition - could be enhanced with proper animation
		current.copy(target);
	}
}

// ===== ANIMATION SYSTEM =====

class AnimationSystem {
	private static mixers = new Map<string, THREE.AnimationMixer>();
	private static activeAnimations = new Map<string, THREE.AnimationAction[]>();
	private static clock = new THREE.Clock();

	static createIdleAnimation(instance: Object3DInstance): THREE.AnimationMixer | null {
		const settings = get(objects3DSettings);
		if (!settings.enableAnimations) return null;

		const config = instance.config.animations.idle;
		if (!config.enabled) return null;

		try {
			const mixer = new THREE.AnimationMixer(instance.mesh);
			const tracks = this.createIdleTracks(config, instance);

			if (tracks.length > 0) {
				const clip = new THREE.AnimationClip('idle', -1, tracks);
				const action = mixer.clipAction(clip);
				action.setLoop(THREE.LoopRepeat, Infinity);
				action.play();

				this.mixers.set(instance.id, mixer);
				return mixer;
			}
		} catch (error) {
			console.error('Animation creation failed:', error);
		}

		return null;
	}

	private static createIdleTracks(
		config: IdleAnimationConfig,
		instance: Object3DInstance
	): THREE.KeyframeTrack[] {
		const tracks: THREE.KeyframeTrack[] = [];
		const settings = get(objects3DSettings);
		const speed = config.speed * settings.animationSpeed;

		try {
			switch (config.type) {
				case 'rotate':
					tracks.push(this.createRotationTrack(config, speed));
					break;
				case 'float':
					tracks.push(this.createFloatTrack(config, speed));
					break;
				case 'pulse':
					tracks.push(this.createPulseTrack(config, speed));
					break;
				case 'breathe':
					tracks.push(this.createBreatheTrack(config, speed));
					break;
				case 'wobble':
					tracks.push(...this.createWobbleTracks(config, speed));
					break;
				case 'sway':
					tracks.push(this.createSwayTrack(config, speed));
					break;
			}
		} catch (error) {
			console.error('Track creation failed:', error);
		}

		return tracks;
	}

	private static createRotationTrack(
		config: IdleAnimationConfig,
		speed: number
	): THREE.KeyframeTrack {
		const duration = 10 / speed;
		const axis = config.axis || [0, 1, 0];
		const times = [0, duration];
		const values = [0, Math.PI * 2 * config.amplitude];

		const trackName = axis[0] ? '.rotation[x]' : axis[1] ? '.rotation[y]' : '.rotation[z]';

		return new THREE.NumberKeyframeTrack(trackName, times, values);
	}

	private static createFloatTrack(config: IdleAnimationConfig, speed: number): THREE.KeyframeTrack {
		const duration = 4 / speed;
		const amplitude = config.amplitude * 0.1;
		const times = [0, duration / 2, duration];
		const values = [0, amplitude, 0];

		return new THREE.NumberKeyframeTrack('.position[y]', times, values);
	}

	private static createPulseTrack(config: IdleAnimationConfig, speed: number): THREE.KeyframeTrack {
		const duration = 2 / speed;
		const scale = 1 + config.amplitude * 0.1;
		const times = [0, duration / 2, duration];
		const values = [1, 1, 1, scale, scale, scale, 1, 1, 1];

		return new THREE.VectorKeyframeTrack('.scale', times, values);
	}

	private static createBreatheTrack(
		config: IdleAnimationConfig,
		speed: number
	): THREE.KeyframeTrack {
		const duration = 6 / speed;
		const scale = 1 + config.amplitude * 0.05;
		const times = [0, duration / 3, (duration * 2) / 3, duration];
		const values = [1, 1, 1, scale, scale, scale, scale, scale, scale, 1, 1, 1];

		return new THREE.VectorKeyframeTrack('.scale', times, values);
	}

	private static createWobbleTracks(
		config: IdleAnimationConfig,
		speed: number
	): THREE.KeyframeTrack[] {
		const duration = 3 / speed;
		const amplitude = config.amplitude * 0.1;
		const times = [0, duration / 4, duration / 2, (duration * 3) / 4, duration];

		const rotationValues = [
			0,
			0,
			0,
			amplitude,
			0,
			amplitude,
			0,
			0,
			0,
			-amplitude,
			0,
			-amplitude,
			0,
			0,
			0
		];

		return [new THREE.VectorKeyframeTrack('.rotation', times, rotationValues)];
	}

	private static createSwayTrack(config: IdleAnimationConfig, speed: number): THREE.KeyframeTrack {
		const duration = 4 / speed;
		const amplitude = config.amplitude * 0.05;
		const times = [0, duration / 2, duration];
		const values = [-amplitude, 0, amplitude];

		return new THREE.NumberKeyframeTrack('.rotation[z]', times, values);
	}

	static createHoverAnimation(instance: Object3DInstance): void {
		const config = instance.config.animations.hover;
		if (!config.enabled) return;

		try {
			// Implement hover animation
			// This would create a temporary animation for hover effects
		} catch (error) {
			console.error('Hover animation failed:', error);
		}
	}

	static update(deltaTime?: number): void {
		const delta = deltaTime || this.clock.getDelta();

		for (const mixer of this.mixers.values()) {
			mixer.update(delta);
		}
	}

	static dispose(instanceId: string): void {
		const mixer = this.mixers.get(instanceId);
		if (mixer) {
			mixer.stopAllAction();
			this.mixers.delete(instanceId);
		}
		this.activeAnimations.delete(instanceId);
	}

	static disposeAll(): void {
		for (const mixer of this.mixers.values()) {
			mixer.stopAllAction();
		}
		this.mixers.clear();
		this.activeAnimations.clear();
	}
}

// ===== MODIFIER FACTORY =====

export class ModifierFactory {
	static apply(geometry: THREE.BufferGeometry, modifier: GeometryModifier): THREE.BufferGeometry {
		try {
			switch (modifier.type) {
				case 'smooth':
					return this.applySmooth(geometry, modifier.parameters);
				case 'noise':
					return this.applyNoise(geometry, modifier.parameters);
				case 'twist':
					return this.applyTwist(geometry, modifier.parameters);
				default:
					console.warn(`Unknown modifier: ${modifier.type}`);
					return geometry;
			}
		} catch (error) {
			console.error('Modifier application failed:', error);
			return geometry;
		}
	}

	private static applySmooth(
		geometry: THREE.BufferGeometry,
		params: Record<string, number>
	): THREE.BufferGeometry {
		const iterations = params.iterations || 1;
		for (let i = 0; i < iterations; i++) {
			geometry.computeVertexNormals();
		}
		return geometry;
	}

	private static applyNoise(
		geometry: THREE.BufferGeometry,
		params: Record<string, number>
	): THREE.BufferGeometry {
		const strength = params.strength || 0.1;
		const position = geometry.attributes.position;

		if (!position) {
			console.warn('Geometry has no position attribute');
			return geometry;
		}

		const array = position.array as Float32Array;

		for (let i = 0; i < array.length; i += 3) {
			const noise = (Math.random() - 0.5) * strength;
			array[i] += noise;
			array[i + 1] += noise;
			array[i + 2] += noise;
		}

		position.needsUpdate = true;
		geometry.computeVertexNormals();
		return geometry;
	}

	private static applyTwist(
		geometry: THREE.BufferGeometry,
		params: Record<string, number>
	): THREE.BufferGeometry {
		const angle = params.angle || Math.PI / 4;
		const position = geometry.attributes.position;

		if (!position) {
			console.warn('Geometry has no position attribute');
			return geometry;
		}

		const array = position.array as Float32Array;

		for (let i = 0; i < array.length; i += 3) {
			const x = array[i];
			const y = array[i + 1];
			const z = array[i + 2];

			const twist = y * angle;
			const cos = Math.cos(twist);
			const sin = Math.sin(twist);

			array[i] = x * cos - z * sin;
			array[i + 2] = x * sin + z * cos;
		}

		position.needsUpdate = true;
		geometry.computeVertexNormals();
		return geometry;
	}
}

// ===== PERFORMANCE OPTIMIZER =====

class PerformanceOptimizer {
	static optimizeForDevice(configs: Object3DConfig[], deviceCapabilities: any): Object3DConfig[] {
		const memoryGB = deviceCapabilities.memory || 4;
		const hasWebGL = deviceCapabilities.hasWebGL !== false;
		const cores = deviceCapabilities.cores || 4;

		const isLowEnd = memoryGB < 4 || !hasWebGL || cores < 4;
		const isMidEnd = memoryGB < 8 || cores < 8;

		return configs.filter((config) => {
			if (isLowEnd && config.complexity === 'ultra') return false;
			if (isLowEnd && config.complexity === 'high') return false;
			if (isMidEnd && config.complexity === 'ultra') return false;
			if (isLowEnd && !config.animations.performance.enableOnLowEnd) return false;

			return true;
		});
	}

	static calculateLOD(distance: number, config: PerformanceDefinition): number {
		if (!config.autoLOD) return 0;

		const normalizedDistance = distance / config.cullingDistance;

		if (normalizedDistance > 1) return -1; // Cull
		if (normalizedDistance > 0.8) return config.lodLevels.length - 1;
		if (normalizedDistance > 0.5) return Math.min(1, config.lodLevels.length - 1);
		if (normalizedDistance > 0.3) return Math.max(0, config.lodLevels.length - 2);

		return 0; // Highest quality
	}

	static getRecommendedSettings(deviceCapabilities: any): {
		maxInstances: number;
		shadowQuality: 'low' | 'medium' | 'high';
		animationQuality: 'low' | 'medium' | 'high';
		geometryDetail: 'low' | 'medium' | 'high';
	} {
		const memoryGB = deviceCapabilities.memory || 4;
		const cores = deviceCapabilities.cores || 4;
		const hasWebGL = deviceCapabilities.hasWebGL !== false;

		if (memoryGB >= 8 && cores >= 8 && hasWebGL) {
			return {
				maxInstances: 50,
				shadowQuality: 'high',
				animationQuality: 'high',
				geometryDetail: 'high'
			};
		} else if (memoryGB >= 4 && cores >= 4 && hasWebGL) {
			return {
				maxInstances: 30,
				shadowQuality: 'medium',
				animationQuality: 'medium',
				geometryDetail: 'medium'
			};
		} else {
			return {
				maxInstances: 15,
				shadowQuality: 'low',
				animationQuality: 'low',
				geometryDetail: 'low'
			};
		}
	}
}

// ===== OBJECT REGISTRY =====

class Object3DRegistry {
	private static objects = new Map<string, Object3DConfig>();
	private static categories = new Map<string, Object3DConfig[]>();
	private static loadedModules = new Set<string>();
	private static isInitialized = false;

	static async initialize(): Promise<void> {
		if (this.isInitialized) return;

		try {
			// Initialize WebGL context
			const webGL = WebGLContextManager.getInstance();
			webGL.initialize();

			// Load built-in objects
			await this.loadBuiltInObjects();

			this.isInitialized = true;
			console.log(`Loaded ${this.objects.size} 3D objects in ${this.categories.size} categories`);
		} catch (error) {
			console.error('Object3D registry initialization failed:', error);
		}
	}

	private static async loadBuiltInObjects(): Promise<void> {
		// Register basic geometric objects
		this.registerBasicGeometricObjects();

		// Try to load objects from the objects directory
		try {
			const objectModules = await this.loadObjectModules();
			for (const module of objectModules) {
				if (module.default && typeof module.default === 'object') {
					this.registerObject(module.default);
				}
			}
		} catch (error) {
			console.warn('Could not load external object modules:', error);
		}
	}

	private static async loadObjectModules(): Promise<any[]> {
		// Dynamic import of object files
		// This would normally use dynamic imports based on file discovery
		// For now, we'll register the basic objects manually
		return [];
	}

	private static registerBasicGeometricObjects(): void {
		const basicObjects: Object3DConfig[] = [
			{
				id: 'geometric/sphere',
				name: 'Sphere',
				category: 'geometric',
				description: 'A basic sphere shape',
				complexity: 'low',
				tags: ['basic', 'round', 'simple'],
				fallbackIcon: '⚪',
				geometry: {
					type: 'procedural',
					baseShape: 'sphere',
					parameters: { radius: 0.5, widthSegments: 32, heightSegments: 16 }
				},
				material: {
					type: 'standard',
					properties: { roughness: 0.4, metalness: 0.1 }
				},
				lighting: {
					receiveShadows: true,
					castShadows: true,
					ambientIntensity: 0.4,
					directionalIntensity: 0.8
				},
				animations: {
					idle: {
						enabled: true,
						type: 'float',
						speed: 1,
						amplitude: 0.5
					},
					hover: {
						enabled: true,
						scale: 1.2,
						rotation: [0, 0.1, 0],
						translation: [0, 0, 0],
						glowIntensity: 1.5,
						duration: 300,
						easing: 'easeOut'
					},
					click: {
						enabled: true,
						type: 'bounce',
						intensity: 1,
						duration: 400
					},
					focus: {
						enabled: true,
						outlineColor: '#ffffff',
						outlineWidth: 2,
						pulseSpeed: 2
					},
					performance: {
						enableOnLowEnd: true,
						reducedMotion: 'scale',
						targetFPS: 60,
						adaptiveQuality: true
					}
				},
				colorAdaptation: {
					mode: 'auto',
					intensity: 1,
					saturationBoost: 0.2,
					lightnessAdjust: 0,
					blendMode: 'normal',
					emissiveStrength: 0.3,
					transitionDuration: 800
				},
				performance: {
					lodLevels: [32, 16, 8],
					instanceLimit: 100,
					autoLOD: true,
					cullingDistance: 50,
					shadowQuality: 'medium',
					geometryOptimization: true,
					memoryFootprint: 'minimal',
					triangleCount: 1024
				},
				createGeometry: (params?: GeometryParams) => {
					return new THREE.SphereGeometry(
						params?.radius || 0.5,
						params?.widthSegments || 32,
						params?.heightSegments || 16
					);
				}
			},
			{
				id: 'geometric/cube',
				name: 'Cube',
				category: 'geometric',
				description: 'A basic cube shape',
				complexity: 'low',
				tags: ['basic', 'square', 'simple'],
				fallbackIcon: '⬜',
				geometry: {
					type: 'procedural',
					baseShape: 'box',
					parameters: { width: 1, height: 1, depth: 1 }
				},
				material: {
					type: 'standard',
					properties: { roughness: 0.3, metalness: 0.2 }
				},
				lighting: {
					receiveShadows: true,
					castShadows: true,
					ambientIntensity: 0.4,
					directionalIntensity: 0.8
				},
				animations: {
					idle: {
						enabled: true,
						type: 'rotate',
						speed: 0.5,
						amplitude: 1,
						axis: [0, 1, 0]
					},
					hover: {
						enabled: true,
						scale: 1.15,
						rotation: [0.1, 0.1, 0],
						translation: [0, 0, 0],
						glowIntensity: 1.3,
						duration: 250,
						easing: 'easeOut'
					},
					click: {
						enabled: true,
						type: 'scale',
						intensity: 1.2,
						duration: 300
					},
					focus: {
						enabled: true,
						outlineColor: '#ffffff',
						outlineWidth: 2,
						pulseSpeed: 2
					},
					performance: {
						enableOnLowEnd: true,
						reducedMotion: 'opacity',
						targetFPS: 60,
						adaptiveQuality: true
					}
				},
				colorAdaptation: {
					mode: 'auto',
					intensity: 1,
					saturationBoost: 0.1,
					lightnessAdjust: 0,
					blendMode: 'normal',
					emissiveStrength: 0.2,
					transitionDuration: 600
				},
				performance: {
					lodLevels: [1, 1, 1],
					instanceLimit: 200,
					autoLOD: false,
					cullingDistance: 50,
					shadowQuality: 'medium',
					geometryOptimization: true,
					memoryFootprint: 'minimal',
					triangleCount: 12
				},
				createGeometry: (params?: GeometryParams) => {
					return new THREE.BoxGeometry(params?.width || 1, params?.height || 1, params?.depth || 1);
				}
			}
		];

		for (const obj of basicObjects) {
			this.registerObject(obj);
		}
	}

	static registerObject(config: Object3DConfig): void {
		this.objects.set(config.id, config);

		if (!this.categories.has(config.category)) {
			this.categories.set(config.category, []);
		}
		this.categories.get(config.category)!.push(config);
	}

	static getObject(id: string): Object3DConfig | undefined {
		return this.objects.get(id);
	}

	static getAllObjects(): Object3DConfig[] {
		return Array.from(this.objects.values());
	}

	static getObjectsByCategory(category: string): Object3DConfig[] {
		return this.categories.get(category) || [];
	}

	static getCategories(): string[] {
		return Array.from(this.categories.keys());
	}

	static searchObjects(query: string): Object3DConfig[] {
		const lowercaseQuery = query.toLowerCase();
		return this.getAllObjects().filter(
			(obj) =>
				obj.name.toLowerCase().includes(lowercaseQuery) ||
				obj.description.toLowerCase().includes(lowercaseQuery) ||
				obj.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery))
		);
	}

	static async createInstance(
		objectId: string,
		colorPalette?: ColorPalette
	): Promise<Object3DInstance | null> {
		const config = this.getObject(objectId);
		if (!config) {
			console.warn(`Object not found: ${objectId}`);
			return null;
		}

		try {
			const geometry = config.createGeometry();
			const material = await MaterialFactory.createMaterial(config.material, colorPalette);
			const mesh = new THREE.Mesh(geometry, material);

			// Configure mesh
			const settings = get(objects3DSettings);
			mesh.castShadow = config.lighting.castShadows && settings.enableShadows;
			mesh.receiveShadow = config.lighting.receiveShadows && settings.enableShadows;

			const instance: Object3DInstance = {
				id: `${objectId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				objectId,
				config,
				mesh,
				boundingBox: new THREE.Box3().setFromObject(mesh),
				isVisible: true,
				lodLevel: 0,
				lastUpdateTime: Date.now(),
				state: {
					isHovered: false,
					isFocused: false,
					isClicked: false,
					isIdle: true
				},
				performance: {
					lastFrameTime: 0,
					triangleCount: this.getTriangleCount(geometry),
					memoryUsage: 0
				}
			};

			// Create idle animation
			if (settings.enableAnimations) {
				AnimationSystem.createIdleAnimation(instance);
			}

			return instance;
		} catch (error) {
			console.error('Instance creation failed:', error);
			return null;
		}
	}

	private static getTriangleCount(geometry: THREE.BufferGeometry): number {
		const index = geometry.index;
		if (index) {
			return index.count / 3;
		}
		const position = geometry.attributes.position;
		return position ? position.count / 3 : 0;
	}

	static disposeInstance(instance: Object3DInstance): void {
		AnimationSystem.dispose(instance.id);
		instance.mesh.geometry.dispose();
		if (Array.isArray(instance.mesh.material)) {
			instance.mesh.material.forEach((mat) => mat.dispose());
		} else {
			instance.mesh.material.dispose();
		}
	}

	static clear(): void {
		this.objects.clear();
		this.categories.clear();
		this.loadedModules.clear();
		this.isInitialized = false;
	}
}

// ===== UTILITY FUNCTIONS =====

export const MathUtils = {
	clamp: (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value)),
	lerp: (a: number, b: number, t: number): number => a + (b - a) * t,
	smoothstep: (edge0: number, edge1: number, x: number): number => {
		const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
		return t * t * (3 - 2 * t);
	},
	easeInOut: (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
	normalizeAngle: (angle: number): number =>
		((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
	degToRad: (degrees: number): number => (degrees * Math.PI) / 180,
	radToDeg: (radians: number): number => (radians * 180) / Math.PI
};

export const GeometryUtils = {
	calculateTriangleCount: (geometry: THREE.BufferGeometry): number => {
		const index = geometry.index;
		if (index) return index.count / 3;
		const position = geometry.attributes.position;
		return position ? position.count / 3 : 0;
	},

	calculateSurfaceArea: (geometry: THREE.BufferGeometry): number => {
		const position = geometry.attributes.position;
		if (!position) return 0;

		let area = 0;

		for (let i = 0; i < position.count; i += 3) {
			const a = new THREE.Vector3().fromBufferAttribute(position, i);
			const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
			const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);

			const ab = b.clone().sub(a);
			const ac = c.clone().sub(a);
			area += ab.cross(ac).length() * 0.5;
		}

		return area;
	},

	optimizeGeometry: (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.computeVertexNormals();
		return geometry;
	}
};

// ===== CLEANUP UTILITIES =====

export const cleanup = {
	disposeAll: (): void => {
		GeometryFactory.clearAllCaches();
		MaterialFactory.clearCache();
		TextureManager.clearCache();
		AnimationSystem.disposeAll();
		Object3DRegistry.clear();
	},

	disposeGeometry: (geometry: THREE.BufferGeometry): void => {
		geometry.dispose();
	},

	disposeMaterial: (material: THREE.Material | THREE.Material[]): void => {
		if (Array.isArray(material)) {
			material.forEach((mat) => mat.dispose());
		} else {
			material.dispose();
		}
	},

	getMemoryUsage: (): {
		geometries: number;
		materials: number;
		textures: number;
		total: number;
	} => {
		const textureMemory = TextureManager.getMemoryUsage();
		return {
			geometries: 0, // Would need to track geometry memory
			materials: 0, // Would need to track material memory
			textures: textureMemory,
			total: textureMemory
		};
	}
};

// ===== CONVENIENCE EXPORTS =====

// Export commonly used functions
export const {
	getAllObjects,
	getObjectsByCategory,
	searchObjects,
	createInstance,
	disposeInstance
} = Object3DRegistry;

export const { adaptMaterial } = ColorAdapter;

export const {
	update: updateAnimations,
	createIdleAnimation,
	dispose: disposeAnimation
} = AnimationSystem;

// Auto-initialize registry when module loads
if (typeof window !== 'undefined') {
	Object3DRegistry.initialize().catch((error) => {
		console.error('Failed to initialize Object3D system:', error);
	});
}

// Export main classes for advanced usage
export {
	Object3DRegistry,
	GeometryFactory,
	MaterialFactory,
	ColorAdapter,
	AnimationSystem,
	PerformanceOptimizer,
	TextureManager,
	WebGLContextManager
};
