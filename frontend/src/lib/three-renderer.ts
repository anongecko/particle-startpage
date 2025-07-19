import * as THREE from 'three';
import { get } from 'svelte/store';
import { settings } from '../stores/settings.js';
import { extractColors } from './color.js';

interface LODLevel {
  maxDistance: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

interface RenderObject {
  mesh: THREE.Mesh;
  lod?: THREE.LOD;
  originalGeometry: THREE.BufferGeometry;
  animator?: (time: number) => void;
  id: string;
}

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  drawCalls: number;
}

export class ThreeRenderer {
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: any; // EffectComposer type
  private renderPass: any;
  private bloomPass: any;
  
  private ambientLight: THREE.AmbientLight;
  private environmentLight: THREE.HemisphereLight;
  private warmGlow: THREE.PointLight;
  
  private objects: Map<string, RenderObject> = new Map();
  private animationFrame: number = 0;
  private isRendering = false;
  
  private performanceMonitor = {
    lastTime: 0,
    frameCount: 0,
    fps: 60,
    frameTime: 16.67,
  };
  
  private lodSettings = {
    high: { maxObjects: 20, maxTriangles: 2000 },
    medium: { maxObjects: 15, maxTriangles: 1000 },
    low: { maxObjects: 10, maxTriangles: 500 },
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initRenderer();
    this.initScene();
    this.initLighting();
    this.initPostProcessing();
    this.startRenderLoop();
    
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private initRenderer(): void {
    if (!this.isWebGLSupported()) {
      throw new Error('WebGL not supported');
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.getPerformanceLevel() === 'high',
      alpha: true,
      powerPreference: 'high-performance',
    });

    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = this.getPerformanceLevel() !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
  }

  private initLighting(): void {
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(this.ambientLight);

    this.environmentLight = new THREE.HemisphereLight(0x606060, 0x404040, 0.4);
    this.scene.add(this.environmentLight);

    this.warmGlow = new THREE.PointLight(0xffa366, 0.6, 10);
    this.warmGlow.position.set(0, 2, 3);
    this.warmGlow.castShadow = this.getPerformanceLevel() === 'high';
    this.warmGlow.shadow.mapSize.width = 512;
    this.warmGlow.shadow.mapSize.height = 512;
    this.scene.add(this.warmGlow);
  }

  private async initPostProcessing(): Promise<void> {
    if (this.getPerformanceLevel() === 'low') return;

    try {
      const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
      const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
      const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');

      this.composer = new EffectComposer(this.renderer);
      
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPass);

      const bloomStrength = this.getPerformanceLevel() === 'high' ? 0.3 : 0.1;
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight),
        bloomStrength,
        0.4,
        0.85
      );
      this.composer.addPass(this.bloomPass);
    } catch (error) {
      console.warn('Post-processing unavailable:', error);
    }
  }

  private getPerformanceLevel(): 'high' | 'medium' | 'low' {
    const settingsData = get(settings);
    if (settingsData.performance3D === 'auto') {
      const gpu = this.renderer?.getContext()?.getParameter(this.renderer.getContext().RENDERER);
      if (typeof gpu === 'string') {
        if (gpu.includes('RTX') || gpu.includes('RX 6') || gpu.includes('M1') || gpu.includes('M2')) {
          return 'high';
        }
        if (gpu.includes('GTX') || gpu.includes('RX 5') || gpu.includes('Intel Iris')) {
          return 'medium';
        }
      }
      return 'low';
    }
    return settingsData.performance3D as 'high' | 'medium' | 'low';
  }

  addObject(id: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3): void {
    const perfLevel = this.getPerformanceLevel();
    const lodGeometry = this.createLODGeometry(geometry, perfLevel);
    
    const mesh = new THREE.Mesh(lodGeometry, material);
    mesh.position.copy(position);
    mesh.castShadow = perfLevel !== 'low';
    mesh.receiveShadow = perfLevel === 'high';

    let lod: THREE.LOD | undefined;
    if (perfLevel === 'high') {
      lod = new THREE.LOD();
      lod.addLevel(mesh, 0);
      
      const mediumGeometry = this.simplifyGeometry(geometry, 0.7);
      const mediumMesh = new THREE.Mesh(mediumGeometry, material);
      lod.addLevel(mediumMesh, 5);
      
      const lowGeometry = this.simplifyGeometry(geometry, 0.4);
      const lowMesh = new THREE.Mesh(lowGeometry, material);
      lod.addLevel(lowMesh, 10);
      
      lod.position.copy(position);
      this.scene.add(lod);
    } else {
      this.scene.add(mesh);
    }

    this.objects.set(id, {
      mesh,
      lod,
      originalGeometry: geometry.clone(),
      id,
    });
  }

  removeObject(id: string): void {
    const obj = this.objects.get(id);
    if (obj) {
      if (obj.lod) {
        this.scene.remove(obj.lod);
        obj.lod.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
      } else {
        this.scene.remove(obj.mesh);
        obj.mesh.geometry?.dispose();
        if (Array.isArray(obj.mesh.material)) {
          obj.mesh.material.forEach(mat => mat.dispose());
        } else {
          obj.mesh.material?.dispose();
        }
      }
      this.objects.delete(id);
    }
  }

  updateObjectColor(id: string, color: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    const newColor = new THREE.Color(color);
    const updateMaterial = (mesh: THREE.Mesh) => {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => {
          if ('color' in mat) mat.color = newColor;
        });
      } else if ('color' in mesh.material) {
        mesh.material.color = newColor;
      }
    };

    if (obj.lod) {
      obj.lod.traverse((child) => {
        if (child instanceof THREE.Mesh) updateMaterial(child);
      });
    } else {
      updateMaterial(obj.mesh);
    }
  }

  updateWallpaperColors(wallpaperUrl: string): void {
    extractColors(wallpaperUrl).then(colors => {
      const warmColor = new THREE.Color(colors.vibrant || '#ffa366');
      this.warmGlow.color = warmColor;
      
      const ambientColor = new THREE.Color(colors.darkVibrant || '#404040');
      this.ambientLight.color = ambientColor;
    });
  }

  setObjectAnimator(id: string, animator: (time: number) => void): void {
    const obj = this.objects.get(id);
    if (obj) {
      obj.animator = animator;
    }
  }

  private createLODGeometry(geometry: THREE.BufferGeometry, perfLevel: string): THREE.BufferGeometry {
    const settings = this.lodSettings[perfLevel as keyof typeof this.lodSettings];
    const triangleCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    
    if (triangleCount <= settings.maxTriangles) {
      return geometry;
    }
    
    return this.simplifyGeometry(geometry, settings.maxTriangles / triangleCount);
  }

  private simplifyGeometry(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
    if (ratio >= 1) return geometry.clone();
    
    const simplified = geometry.clone();
    if (simplified.index) {
      const targetCount = Math.floor(simplified.index.count * ratio);
      const newIndex = new Uint16Array(targetCount);
      
      for (let i = 0; i < targetCount; i += 3) {
        const sourceIndex = Math.floor((i / targetCount) * (simplified.index.count - 3));
        newIndex[i] = simplified.index.getX(sourceIndex);
        newIndex[i + 1] = simplified.index.getX(sourceIndex + 1);
        newIndex[i + 2] = simplified.index.getX(sourceIndex + 2);
      }
      
      simplified.setIndex(new THREE.BufferAttribute(newIndex, 1));
    }
    
    return simplified;
  }

  private startRenderLoop(): void {
    if (this.isRendering) return;
    this.isRendering = true;
    
    const render = (time: number) => {
      this.animationFrame = requestAnimationFrame(render);
      
      this.updatePerformanceMetrics(time);
      this.updateAnimations(time);
      this.updateLOD();
      
      if (this.composer && this.getPerformanceLevel() !== 'low') {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    };
    
    render(0);
  }

  private updatePerformanceMetrics(time: number): void {
    this.performanceMonitor.frameCount++;
    
    if (time - this.performanceMonitor.lastTime >= 1000) {
      this.performanceMonitor.fps = this.performanceMonitor.frameCount;
      this.performanceMonitor.frameTime = 1000 / this.performanceMonitor.fps;
      this.performanceMonitor.frameCount = 0;
      this.performanceMonitor.lastTime = time;
      
      if (this.performanceMonitor.fps < 30) {
        this.degradePerformance();
      }
    }
  }

  private updateAnimations(time: number): void {
    this.objects.forEach(obj => {
      if (obj.animator) {
        obj.animator(time * 0.001);
      }
    });
  }

  private updateLOD(): void {
    if (this.getPerformanceLevel() !== 'high') return;
    
    this.objects.forEach(obj => {
      if (obj.lod) {
        obj.lod.update(this.camera);
      }
    });
  }

  private degradePerformance(): void {
    const currentSettings = get(settings);
    if (currentSettings.performance3D === 'high') {
      settings.update(s => ({ ...s, performance3D: 'medium' }));
    } else if (currentSettings.performance3D === 'medium') {
      settings.update(s => ({ ...s, performance3D: 'low' }));
    }
  }

  private handleResize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
    
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  private isWebGLSupported(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return {
      fps: this.performanceMonitor.fps,
      frameTime: this.performanceMonitor.frameTime,
      memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
      drawCalls: this.renderer.info.render.calls,
    };
  }

  dispose(): void {
    this.isRendering = false;
    cancelAnimationFrame(this.animationFrame);
    
    this.objects.forEach((obj, id) => {
      this.removeObject(id);
    });
    
    this.renderer.dispose();
    window.removeEventListener('resize', this.handleResize.bind(this));
  }
}
