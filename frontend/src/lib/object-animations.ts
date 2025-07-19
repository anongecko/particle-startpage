import * as THREE from 'three';
import { get } from 'svelte/store';
import { settings } from '../stores/settings.js';

export type AnimationState = 'idle' | 'hover' | 'focus' | 'click' | 'colorTransition';

export interface AnimationConfig {
  duration: number;
  easing: EasingFunction;
  loop?: boolean;
  autoReverse?: boolean;
}

export interface ObjectAnimationState {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  lightIntensity: number;
  opacity: number;
}

type EasingFunction = (t: number) => number;

interface ActiveAnimation {
  id: string;
  startTime: number;
  duration: number;
  easing: EasingFunction;
  from: Partial<ObjectAnimationState>;
  to: Partial<ObjectAnimationState>;
  loop: boolean;
  autoReverse: boolean;
  reversed: boolean;
  onComplete?: () => void;
}

export class ObjectAnimator {
  private mesh: THREE.Mesh;
  private light?: THREE.PointLight;
  private baseState: ObjectAnimationState;
  private currentState: ObjectAnimationState;
  private targetState: ObjectAnimationState;
  private activeAnimations: Map<string, ActiveAnimation> = new Map();
  private animationState: AnimationState = 'idle';
  private performanceLevel: 'high' | 'medium' | 'low' = 'high';

  private breathingOffset = Math.random() * Math.PI * 2;
  private rotationOffset = Math.random() * Math.PI * 2;

  constructor(mesh: THREE.Mesh, light?: THREE.PointLight) {
    this.mesh = mesh;
    this.light = light;
    
    this.baseState = {
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone(),
      lightIntensity: light?.intensity || 0,
      opacity: 1,
    };
    
    this.currentState = { ...this.baseState };
    this.targetState = { ...this.baseState };
    
    this.updatePerformanceLevel();
  }

  update(time: number): void {
    this.updatePerformanceLevel();
    this.updateActiveAnimations(time);
    this.updateIdleAnimation(time);
    this.applyCurrentState();
  }

  setState(newState: AnimationState): void {
    if (this.animationState === newState) return;
    
    const previousState = this.animationState;
    this.animationState = newState;
    
    this.clearNonLoopingAnimations();
    
    switch (newState) {
      case 'idle':
        this.transitionToIdle(previousState);
        break;
      case 'hover':
        this.transitionToHover();
        break;
      case 'focus':
        this.transitionToFocus();
        break;
      case 'click':
        this.transitionToClick();
        break;
    }
  }

  animateColorTransition(duration: number = 3000): void {
    this.addAnimation('colorTransition', {
      duration,
      easing: Easing.easeOutCubic,
      from: { opacity: 0.8 },
      to: { opacity: 1.0 },
      autoReverse: true,
    });
  }

  private updatePerformanceLevel(): void {
    const settingsData = get(settings);
    this.performanceLevel = settingsData.performance3D as 'high' | 'medium' | 'low';
  }

  private updateActiveAnimations(time: number): void {
    for (const [id, animation] of this.activeAnimations) {
      const elapsed = time - animation.startTime;
      const normalizedTime = Math.min(elapsed / animation.duration, 1);
      
      let easedTime = animation.easing(normalizedTime);
      if (animation.reversed) {
        easedTime = 1 - easedTime;
      }
      
      this.interpolateStates(animation.from, animation.to, easedTime);
      
      if (normalizedTime >= 1) {
        if (animation.loop) {
          if (animation.autoReverse) {
            animation.reversed = !animation.reversed;
            animation.startTime = time;
          } else {
            animation.startTime = time;
          }
        } else {
          this.activeAnimations.delete(id);
          animation.onComplete?.();
        }
      }
    }
  }

  private updateIdleAnimation(time: number): void {
    if (this.animationState !== 'idle' || this.performanceLevel === 'low') return;
    
    const breathingIntensity = this.performanceLevel === 'high' ? 0.02 : 0.01;
    const breathing = Math.sin(time * 0.8 + this.breathingOffset) * breathingIntensity;
    
    this.currentState.scale.x = this.baseState.scale.x + breathing;
    this.currentState.scale.y = this.baseState.scale.y + breathing;
    this.currentState.scale.z = this.baseState.scale.z + breathing;
  }

  private transitionToIdle(fromState: AnimationState): void {
    const duration = fromState === 'click' ? 500 : 800;
    
    this.addAnimation('toIdle', {
      duration,
      easing: Easing.easeOutElastic,
      from: { ...this.currentState },
      to: { ...this.baseState },
    });
  }

  private transitionToHover(): void {
    const hoverScale = this.baseState.scale.clone().multiplyScalar(1.2);
    const hoverPosition = this.baseState.position.clone();
    hoverPosition.z += 0.3;
    
    const hoverLightIntensity = this.baseState.lightIntensity * 1.8;
    
    this.addAnimation('toHover', {
      duration: 200,
      easing: Easing.easeOutQuad,
      from: { ...this.currentState },
      to: {
        scale: hoverScale,
        position: hoverPosition,
        lightIntensity: hoverLightIntensity,
      },
    });
  }

  private transitionToFocus(): void {
    const focusScale = this.baseState.scale.clone().multiplyScalar(1.05);
    const focusLightIntensity = this.baseState.lightIntensity * 1.3;
    
    this.addAnimation('toFocus', {
      duration: 300,
      easing: Easing.easeOutQuad,
      from: { ...this.currentState },
      to: {
        scale: focusScale,
        lightIntensity: focusLightIntensity,
      },
    });
    
    this.addAnimation('focusGlow', {
      duration: 2000,
      easing: Easing.easeInOutSine,
      from: { opacity: 1.0 },
      to: { opacity: 0.7 },
      loop: true,
      autoReverse: true,
    });
  }

  private transitionToClick(): void {
    const spinRotation = this.baseState.rotation.clone();
    spinRotation.y += Math.PI * 2;
    
    this.addAnimation('clickSpin', {
      duration: 1000,
      easing: Easing.easeOutElastic,
      from: { rotation: this.currentState.rotation },
      to: { rotation: spinRotation },
      onComplete: () => {
        if (this.animationState === 'click') {
          this.setState('idle');
        }
      },
    });
  }

  private addAnimation(
    id: string, 
    config: {
      duration: number;
      easing: EasingFunction;
      from: Partial<ObjectAnimationState>;
      to: Partial<ObjectAnimationState>;
      loop?: boolean;
      autoReverse?: boolean;
      onComplete?: () => void;
    }
  ): void {
    if (this.performanceLevel === 'low' && id !== 'toIdle') return;
    
    this.activeAnimations.set(id, {
      id,
      startTime: performance.now(),
      duration: config.duration,
      easing: config.easing,
      from: config.from,
      to: config.to,
      loop: config.loop || false,
      autoReverse: config.autoReverse || false,
      reversed: false,
      onComplete: config.onComplete,
    });
  }

  private clearNonLoopingAnimations(): void {
    for (const [id, animation] of this.activeAnimations) {
      if (!animation.loop) {
        this.activeAnimations.delete(id);
      }
    }
  }

  private interpolateStates(
    from: Partial<ObjectAnimationState>, 
    to: Partial<ObjectAnimationState>, 
    t: number
  ): void {
    if (from.position && to.position) {
      this.currentState.position.lerpVectors(from.position, to.position, t);
    }
    
    if (from.rotation && to.rotation) {
      this.currentState.rotation.x = this.lerp(
        from.rotation.x, to.rotation.x, t
      );
      this.currentState.rotation.y = this.lerp(
        from.rotation.y, to.rotation.y, t
      );
      this.currentState.rotation.z = this.lerp(
        from.rotation.z, to.rotation.z, t
      );
    }
    
    if (from.scale && to.scale) {
      this.currentState.scale.lerpVectors(from.scale, to.scale, t);
    }
    
    if (from.lightIntensity !== undefined && to.lightIntensity !== undefined) {
      this.currentState.lightIntensity = this.lerp(
        from.lightIntensity, to.lightIntensity, t
      );
    }
    
    if (from.opacity !== undefined && to.opacity !== undefined) {
      this.currentState.opacity = this.lerp(from.opacity, to.opacity, t);
    }
  }

  private applyCurrentState(): void {
    this.mesh.position.copy(this.currentState.position);
    this.mesh.rotation.copy(this.currentState.rotation);
    this.mesh.scale.copy(this.currentState.scale);
    
    if (this.light) {
      this.light.intensity = this.currentState.lightIntensity;
    }
    
    if (this.mesh.material) {
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(mat => {
          if ('opacity' in mat) {
            mat.opacity = this.currentState.opacity;
            mat.transparent = this.currentState.opacity < 1;
          }
        });
      } else if ('opacity' in this.mesh.material) {
        this.mesh.material.opacity = this.currentState.opacity;
        this.mesh.material.transparent = this.currentState.opacity < 1;
      }
    }
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  dispose(): void {
    this.activeAnimations.clear();
  }
}

export const Easing = {
  linear: (t: number): number => t,
  
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => t * (2 - t),
  easeInOutQuad: (t: number): number => 
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => (--t) * t * t + 1,
  easeInOutCubic: (t: number): number => 
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  
  easeInSine: (t: number): number => 1 - Math.cos(t * Math.PI / 2),
  easeOutSine: (t: number): number => Math.sin(t * Math.PI / 2),
  easeInOutSine: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,
  
  easeOutElastic: (t: number): number => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : 
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  
  easeOutBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;
    
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
};

export function createObjectAnimator(mesh: THREE.Mesh, light?: THREE.PointLight): ObjectAnimator {
  return new ObjectAnimator(mesh, light);
}
