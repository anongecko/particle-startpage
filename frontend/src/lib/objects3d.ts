import * as THREE from 'three';
import chroma from 'chroma-js';
import type { ColorPalette } from '$stores/color';

// ===== CORE INTERFACES =====

export interface Object3DConfig {
	id: string;
	name: string;
	category: 'geometric' | 'crystal' | 'tech' | 'organic' | 'creative' | 'abstract';
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
	createGeometry: (params?: any) => THREE.BufferGeometry;
}

export interface GeometryDefinition {
	type: 'procedural' | 'parametric' | 'algorithmic' | 'composite';
	baseShape?: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'custom';
	parameters: Record<string, number>;
	modifiers?: GeometryModifier[];
	transformations?: GeometryTransformation;
}

export interface MaterialDefinition {
	type: 'standard' | 'physical' | 'phong' | 'lambert' | 'toon' | 'shader';
	properties: MaterialProperties;
	textures?: MaterialTextures;
	uniforms?: Record<string, any>; // For custom shaders
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
}

// ===== UTILITY INTERFACES =====

export interface GeometryModifier {
	type: 'bevel' | 'twist' | 'taper' | 'noise' | 'subdivide' | 'smooth' | 'extrude' | 'inset';
	parameters: Record<string, number>;
	order: number; // Execution order
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
	emissive?: boolean;
	envMapIntensity?: number;
	clearcoat?: number;
	clearcoatRoughness?: number;
	transmission?: number;
	thickness?: number;
	ior?: number;
	specularIntensity?: number;
	specularColor?: string;
}

export interface MaterialTextures {
	diffuse?: string;
	normal?: string;
	roughness?: string;
	metalness?: string;
	ao?: string;
	height?: string;
	emissive?: string;
}

export interface IdleAnimationConfig {
	enabled: boolean;
	type: 'rotate' | 'float' | 'pulse' | 'breathe' | 'wobble' | 'orbit' | 'pendulum';
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
	anticipation?: number; // Pre-animation delay
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
	time: number; // 0-1
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
	| 'dominant' | 'vibrant' | 'muted' | 'light' | 'dark' 
	| 'accent' | 'complementary' | 'triadic' | 'analogous' | 'custom';

export type EasingFunction = 
	| 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' 
	| 'elastic' | 'bounce' | 'back' | 'circ' | 'expo';

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
}

// ===== BASE GEOMETRY CREATOR CLASS =====

export abstract class BaseGeometryCreator {
	protected cache = new Map<string, THREE.BufferGeometry>();
	
	abstract create(params: Record<string, any>): THREE.BufferGeometry;
	
	protected getCacheKey(params: Record<string, any>): string {
		return JSON.stringify(params);
	}
	
	protected getFromCache(params: Record<string, any>): THREE.BufferGeometry | null {
		const key = this.getCacheKey(params);
		const cached = this.cache.get(key);
		return cached ? cached.clone() : null;
	}
	
	protected addToCache(params: Record<string, any>, geometry: THREE.BufferGeometry): void {
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

// ===== GEOMETRY FACTORY =====

export class GeometryFactory {
	private static creators = new Map<string, BaseGeometryCreator>();
	private static primitiveCache = new Map<string, THREE.BufferGeometry>();
	
	static registerCreator(type: string, creator: BaseGeometryCreator): void {
		this.creators.set(type, creator);
	}
	
	static createGeometry(definition: GeometryDefinition, customCreator?: () => THREE.BufferGeometry): THREE.BufferGeometry {
		let geometry: THREE.BufferGeometry;
		
		if (customCreator) {
			geometry = customCreator();
		} else if (definition.baseShape && definition.baseShape !== 'custom') {
			geometry = this.createPrimitive(definition.baseShape, definition.parameters);
		} else {
			const creator = this.creators.get(definition.type);
			if (creator) {
				geometry = creator.create(definition.parameters);
			} else {
				console.warn(`Unknown geometry type: ${definition.type}`);
				geometry = this.createPrimitive('box', { width: 1, height: 1, depth: 1 });
			}
		}
		
		// Apply modifiers
		if (definition.modifiers && definition.modifiers.length > 0) {
			geometry = this.applyModifiers(geometry, definition.modifiers);
		}
		
		// Apply transformations
		if (definition.transformations) {
			this.applyTransformations(geometry, definition.transformations);
		}
		
		return this.optimizeGeometry(geometry);
	}
	
	private static createPrimitive(type: string, params: Record<string, number>): THREE.BufferGeometry {
		const cacheKey = `${type}_${JSON.stringify(params)}`;
		const cached = this.primitiveCache.get(cacheKey);
		if (cached) return cached.clone();
		
		let geometry: THREE.BufferGeometry;
		
		switch (type) {
			case 'box':
				geometry = new THREE.BoxGeometry(
					params.width || 1, params.height || 1, params.depth || 1,
					params.widthSegments || 1, params.heightSegments || 1, params.depthSegments || 1
				);
				break;
			case 'sphere':
				geometry = new THREE.SphereGeometry(
					params.radius || 0.5, params.widthSegments || 32, params.heightSegments || 16,
					params.phiStart || 0, params.phiLength || Math.PI * 2,
					params.thetaStart || 0, params.thetaLength || Math.PI
				);
				break;
			case 'cylinder':
				geometry = new THREE.CylinderGeometry(
					params.radiusTop || 0.5, params.radiusBottom || 0.5, params.height || 1,
					params.radialSegments || 8, params.heightSegments || 1,
					params.openEnded || false, params.thetaStart || 0, params.thetaLength || Math.PI * 2
				);
				break;
			case 'cone':
				geometry = new THREE.ConeGeometry(
					params.radius || 0.5, params.height || 1, params.radialSegments || 8,
					params.heightSegments || 1, params.openEnded || false,
					params.thetaStart || 0, params.thetaLength || Math.PI * 2
				);
				break;
			case 'torus':
				geometry = new THREE.TorusGeometry(
					params.radius || 0.5, params.tube || 0.2, params.radialSegments || 8,
					params.tubularSegments || 24, params.arc || Math.PI * 2
				);
				break;
			default:
				geometry = new THREE.BoxGeometry(1, 1, 1);
		}
		
		this.primitiveCache.set(cacheKey, geometry.clone());
		return geometry;
	}
	
	private static applyModifiers(geometry: THREE.BufferGeometry, modifiers: GeometryModifier[]): THREE.BufferGeometry {
		// Sort modifiers by order
		const sortedModifiers = [...modifiers].sort((a, b) => (a.order || 0) - (b.order || 0));
		
		for (const modifier of sortedModifiers) {
			geometry = ModifierFactory.apply(geometry, modifier);
		}
		
		return geometry;
	}
	
	private static applyTransformations(geometry: THREE.BufferGeometry, transform: GeometryTransformation): void {
		// Apply pivot transformation if specified
		if (transform.pivot) {
			geometry.translate(-transform.pivot[0], -transform.pivot[1], -transform.pivot[2]);
		}
		
		// Apply transformations in order: scale, rotate, translate
		if (transform.scale) {
			geometry.scale(transform.scale[0], transform.scale[1], transform.scale[2]);
		}
		
		if (transform.rotation) {
			geometry.rotateX(transform.rotation[0]);
			geometry.rotateY(transform.rotation[1]);
			geometry.rotateZ(transform.rotation[2]);
		}
		
		if (transform.position) {
			geometry.translate(transform.position[0], transform.position[1], transform.position[2]);
		}
		
		// Restore pivot transformation
		if (transform.pivot) {
			geometry.translate(transform.pivot[0], transform.pivot[1], transform.pivot[2]);
		}
	}
	
	private static optimizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.computeVertexNormals();
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

// ===== MODIFIER FACTORY =====

export class ModifierFactory {
	static apply(geometry: THREE.BufferGeometry, modifier: GeometryModifier): THREE.BufferGeometry {
		switch (modifier.type) {
			case 'bevel':
				return this.applyBevel(geometry, modifier.parameters);
			case 'smooth':
				return this.applySmooth(geometry, modifier.parameters);
			case 'subdivide':
				return this.applySubdivide(geometry, modifier.parameters);
			case 'noise':
				return this.applyNoise(geometry, modifier.parameters);
			case 'twist':
				return this.applyTwist(geometry, modifier.parameters);
			case 'taper':
				return this.applyTaper(geometry, modifier.parameters);
			default:
				console.warn(`Unknown modifier: ${modifier.type}`);
				return geometry;
		}
	}
	
	private static applyBevel(geometry: THREE.BufferGeometry, params: Record<string, number>): THREE.BufferGeometry {
		// Simplified bevel implementation
		// In a real implementation, you'd use proper edge detection and beveling algorithms
		return geometry;
	}
	
	private static applySmooth(geometry: THREE.BufferGeometry, params: Record<string, number>): THREE.BufferGeometry {
		const iterations = params.iterations || 1;
		for (let i = 0; i < iterations; i++) {
			geometry.computeVertexNormals();
		}
		return geometry;
	}
	
	private static applySubdivide(geometry: THREE.BufferGeometry, params: Record<string, number>): THREE.BufferGeometry {
		// Would implement subdivision surface algorithm
		// For now, just return original geometry
		return geometry;
	}
	
	private static applyNoise(geometry: THREE.BufferGeometry, params: Record<string, number>): THREE.BufferGeometry {
		const strength = params.strength || 0.1;
		const scale = params.scale || 1;
		
		const position = geometry.attributes.position;
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
	
	private static applyTwist(geometry: THREE.BufferGeometry, params: Record<string, number>): THREE.BufferGeometry {
		const angle = params.angle || Math.PI;
		const axis = params.axis || 1; // 0=x, 1=y, 2=z
		
		const position = geometry.attributes.position;
		const array = position.array as Float32Array;
		
		for (let i = 0; i < array.length; i += 3) {
			const y = array[i + 1];
			const twist = angle * y;
			
			if (axis === 1) { // Twist around Y axis
				const x = array[i];
				const z = array[i + 2];
				array[i] = x * Math.cos(twist) - z * Math.sin(twist);
				array[i + 2] = x * Math.sin(twist) + z * Math.cos(twist);
			}
		}
		
		position.needsUpdate = true;
		geometry.computeVertexNormals();
		return geometry;
	}
	
	private static applyTaper(geometry: THREE.BufferGeometry, params: Record<string, number>): THREE.BufferGeometry {
		const factor = params.factor || 0.5;
		const axis = params.axis || 1; // 0=x, 1=y, 2=z
		
		const position = geometry.attributes.position;
		const array = position.array as Float32Array;
		
		// Find bounds
		const bounds = { min: Infinity, max: -Infinity };
		for (let i = 0; i < array.length; i += 3) {
			const value = array[i + axis];
			bounds.min = Math.min(bounds.min, value);
			bounds.max = Math.max(bounds.max, value);
		}
		
		const range = bounds.max - bounds.min;
		
		for (let i = 0; i < array.length; i += 3) {
			const t = (array[i + axis] - bounds.min) / range;
			const scale = 1 - t * (1 - factor);
			
			if (axis !== 0) array[i] *= scale;
			if (axis !== 1) array[i + 1] *= scale;
			if (axis !== 2) array[i + 2] *= scale;
		}
		
		position.needsUpdate = true;
		geometry.computeVertexNormals();
		return geometry;
	}
}

// ===== MATERIAL FACTORY =====

export class MaterialFactory {
	private static textureCache = new Map<string, THREE.Texture>();
	
	static createMaterial(definition: MaterialDefinition, colorPalette?: ColorPalette): THREE.Material {
		const baseColor = colorPalette?.dominant || '#4a90e2';
		const materialProps = { color: baseColor, ...definition.properties };
		
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
		
		// Apply textures if specified
		if (definition.textures) {
			this.applyTextures(material, definition.textures);
		}
		
		return material;
	}
	
	private static applyTextures(material: THREE.Material, textures: MaterialTextures): void {
		// Implementation would load and apply textures
		// For now, just store the texture paths
	}
	
	static clearTextureCache(): void {
		for (const texture of this.textureCache.values()) {
			texture.dispose();
		}
		this.textureCache.clear();
	}
}

// ===== COLOR ADAPTATION SYSTEM =====

export class ColorAdapter {
	static adaptMaterial(
		material: THREE.Material,
		colorPalette: ColorPalette,
		definition: ColorAdaptationDefinition
	): void {
		if (!material || !colorPalette) return;
		
		const sourceColor = this.getSourceColor(colorPalette, definition.mode);
		const adaptedColor = this.processColor(sourceColor, definition);
		
		this.applyColorToMaterial(material, adaptedColor, definition);
	}
	
	private static getSourceColor(palette: ColorPalette, mode: ColorAdaptationMode): string {
		switch (mode) {
			case 'dominant': return palette.dominant;
			case 'vibrant': return palette.vibrant;
			case 'muted': return palette.muted;
			case 'light': return palette.light;
			case 'dark': return palette.dark;
			case 'accent': return palette.accent;
			case 'complementary': return palette.complementary;
			case 'triadic': return palette.triadic[0];
			case 'analogous': return palette.triadic[1]; // Use second triadic color for analogous
			default: return palette.dominant;
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
			this.transitionColor(material.color as THREE.Color, targetColor, definition.transitionDuration);
		}
		
		if ('emissive' in material && definition.emissiveStrength > 0) {
			const emissiveColor = new THREE.Color(color);
			emissiveColor.multiplyScalar(definition.emissiveStrength);
			(material as any).emissive = emissiveColor;
		}
	}
	
	private static transitionColor(current: THREE.Color, target: THREE.Color, duration: number): void {
		// Simple immediate transition - could be enhanced with proper animation
		current.copy(target);
	}
}

// ===== ANIMATION SYSTEM =====

export class AnimationSystem {
	private static mixers = new Map<string, THREE.AnimationMixer>();
	private static activeAnimations = new Map<string, THREE.AnimationAction[]>();
	
	static createIdleAnimation(instance: Object3DInstance): THREE.AnimationMixer | null {
		const config = instance.config.animations.idle;
		if (!config.enabled) return null;
		
		const mixer = new THREE.AnimationMixer(instance.mesh);
		const tracks = this.createIdleTracks(config, instance);
		
		if (tracks.length > 0) {
			const clip = new THREE.AnimationClip('idle', -1, tracks);
			const action = mixer.clipAction(clip);
			action.setLoop(THREE.LoopRepeat, Infinity);
			action.play();
		}
		
		this.mixers.set(instance.id, mixer);
		return mixer;
	}
	
	private static createIdleTracks(config: IdleAnimationConfig, instance: Object3DInstance): THREE.KeyframeTrack[] {
		const tracks: THREE.KeyframeTrack[] = [];
		
		switch (config.type) {
			case 'rotate':
				tracks.push(this.createRotationTrack(config));
				break;
			case 'float':
				tracks.push(this.createFloatTrack(config));
				break;
			case 'pulse':
				tracks.push(this.createPulseTrack(config));
				break;
			case 'breathe':
				tracks.push(this.createBreatheTrack(config));
				break;
			case 'wobble':
				tracks.push(...this.createWobbleTracks(config));
				break;
		}
		
		return tracks;
	}
	
	private static createRotationTrack(config: IdleAnimationConfig): THREE.KeyframeTrack {
		const duration = 10 / config.speed;
		const axis = config.axis || [0, 1, 0];
		const angle = Math.PI * 2 * config.amplitude;
		
		return new THREE.VectorKeyframeTrack(
			'.rotation[' + (axis[0] ? 'x' : axis[1] ? 'y' : 'z') + ']',
			[0, duration],
			[0, angle]
		);
	}
	
	private static createFloatTrack(config: IdleAnimationConfig): THREE.KeyframeTrack {
		const duration = 4 / config.speed;
		const amplitude = config.amplitude;
		
		return new THREE.VectorKeyframeTrack(
			'.position[y]',
			[0, duration / 2, duration],
			[0, amplitude, 0]
		);
	}
	
	private static createPulseTrack(config: IdleAnimationConfig): THREE.KeyframeTrack {
		const duration = 2 / config.speed;
		const amplitude = 1 + config.amplitude;
		
		return new THREE.VectorKeyframeTrack(
			'.scale[x]',
			[0, duration / 2, duration],
			[1, amplitude, 1]
		);
	}
	
	private static createBreatheTrack(config: IdleAnimationConfig): THREE.KeyframeTrack {
		const duration = 6 / config.speed;
		const amplitude = 1 + config.amplitude * 0.1;
		
		return new THREE.VectorKeyframeTrack(
			'.scale',
			[0, duration / 2, duration],
			[1, 1, 1, amplitude, amplitude, amplitude, 1, 1, 1]
		);
	}
	
	private static createWobbleTracks(config: IdleAnimationConfig): THREE.KeyframeTrack[] {
		const duration = 3 / config.speed;
		const amplitude = config.amplitude * 0.1;
		
		return [
			new THREE.VectorKeyframeTrack(
				'.rotation[x]',
				[0, duration / 4, duration / 2, duration * 3/4, duration],
				[0, amplitude, 0, -amplitude, 0]
			),
			new THREE.VectorKeyframeTrack(
				'.rotation[z]',
				[0, duration / 3, duration * 2/3, duration],
				[0, amplitude * 0.7, -amplitude * 0.7, 0]
			)
		];
	}
	
	static update(deltaTime: number): void {
		for (const mixer of this.mixers.values()) {
			mixer.update(deltaTime);
		}
	}
	
	static dispose(instanceId: string): void {
		const mixer = this.mixers.get(instanceId);
		if (mixer) {
			mixer.stopAllAction();
			this.mixers.delete(instanceId);
		}
		
		const actions = this.activeAnimations.get(instanceId);
		if (actions) {
			actions.forEach(action => action.stop());
			this.activeAnimations.delete(instanceId);
		}
	}
	
	static disposeAll(): void {
		for (const mixer of this.mixers.values()) {
			mixer.stopAllAction();
		}
		this.mixers.clear();
		this.activeAnimations.clear();
	}
}

// ===== PERFORMANCE OPTIMIZER =====

export class PerformanceOptimizer {
	static optimizeForDevice(configs: Object3DConfig[], deviceCapabilities: any): Object3DConfig[] {
		const memoryGB = deviceCapabilities.memory || 4;
		const hasWebGL = deviceCapabilities.hasWebGL !== false;
		const cores = deviceCapabilities.cores || 4;
		
		const isLowEnd = memoryGB < 4 || !hasWebGL || cores < 4;
		const isMidEnd = memoryGB < 8 || cores < 8;
		
		return configs.filter(config => {
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

export class Object3DRegistry {
	private static objects = new Map<string, Object3DConfig>();
	private static categories = new Map<string, Object3DConfig[]>();
	private static loadedModules = new Set<string>();
	
	static async loadObjectsFromDirectory(directory: string = '/src/lib/objects'): Promise<void> {
		// This would be implemented to dynamically load object files
		// For now, objects need to be manually registered
		console.info('Object directory loading not implemented - register objects manually');
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
		return this.getAllObjects().filter(obj =>
			obj.name.toLowerCase().includes(lowercaseQuery) ||
			obj.description.toLowerCase().includes(lowercaseQuery) ||
			obj.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
		);
	}
	
	static createInstance(objectId: string, colorPalette?: ColorPalette): Object3DInstance | null {
		const config = this.getObject(objectId);
		if (!config) return null;
		
		const geometry = config.createGeometry();
		const material = MaterialFactory.createMaterial(config.material, colorPalette);
		const mesh = new THREE.Mesh(geometry, material);
		
		// Configure mesh
		mesh.castShadow = config.lighting.castShadows;
		mesh.receiveShadow = config.lighting.receiveShadows;
		
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
			}
		};
		
		// Create idle animation
		AnimationSystem.createIdleAnimation(instance);
		
		return instance;
	}
	
	static disposeInstance(instance: Object3DInstance): void {
		AnimationSystem.dispose(instance.id);
		instance.mesh.geometry.dispose();
		if (Array.isArray(instance.mesh.material)) {
			instance.mesh.material.forEach(mat => mat.dispose());
		} else {
			instance.mesh.material.dispose();
		}
	}
	
	static clear(): void {
		this.objects.clear();
		this.categories.clear();
		this.loadedModules.clear();
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
	easeInOut: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
	normalizeAngle: (angle: number): number => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
};

export const GeometryUtils = {
	mergeGeometries: (geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
		// Use Three.js BufferGeometryUtils when available
		return geometries.length > 0 ? geometries[0] : null;
	},
	
	calculateSurfaceArea: (geometry: THREE.BufferGeometry): number => {
		const position = geometry.attributes.position;
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
	}
};

// ===== CLEANUP UTILITIES =====

export const cleanup = {
	disposeAll: (): void => {
		GeometryFactory.clearAllCaches();
		MaterialFactory.clearTextureCache();
		AnimationSystem.disposeAll();
		Object3DRegistry.clear();
	},
	
	disposeGeometry: (geometry: THREE.BufferGeometry): void => {
		geometry.dispose();
	},
	
	disposeMaterial: (material: THREE.Material | THREE.Material[]): void => {
		if (Array.isArray(material)) {
			material.forEach(mat => mat.dispose());
		} else {
			material.dispose();
		}
	}
};

// Auto-initialize registry
Object3DRegistry.loadObjectsFromDirectory();
