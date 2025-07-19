import * as THREE from 'three';

// Import all object definitions
import { diamond } from './geometric/diamond.js';
import { sphere } from './geometric/sphere.js';
import { octahedron } from './geometric/octahedron.js';

import { graduationCap } from './learning/graduation-cap.js';
import { textbooks } from './learning/textbooks.js';
import { brain } from './learning/brain.js';

import { computer } from './development/computer.js';
import { coffee } from './development/coffee.js';
import { gitTree } from './development/git-tree.js';

import { dice } from './creative/dice.js';
import { treasureChest } from './creative/treasure-chest.js';
import { magic8Ball } from './creative/magic-8-ball.js';

// Type definitions
export interface Object3DAnimationConfig {
  rotation?: { x: number; y: number; z: number };
  scale?: { 
    amplitude?: number; 
    frequency?: number; 
    target?: number; 
    duration?: number; 
  };
  position?: { x: number; y: number; z: number };
  bounce?: { amplitude: number; duration: number };
  lift?: { amplitude: number; duration: number };
  pulse?: { amplitude: number; frequency: number };
  tumble?: { amplitude: number; duration: number };
  shake?: { amplitude: number; duration: number };
  sway?: { amplitude: number; frequency: number };
  shimmer?: { amplitude: number; frequency: number };
  screenGlow?: { amplitude: number; frequency: number };
  steam?: {
    rise?: { amplitude: number; frequency: number };
    sway?: { amplitude: number; frequency: number };
    intensity?: number;
  };
  commitPulse?: { amplitude: number; frequency: number };
  liquidSwirl?: { amplitude: number; frequency: number };
  dieFloat?: { amplitude: number; frequency: number };
  lidOpen?: { amplitude: number; duration: number };
  goldGlow?: { intensity: number; frequency: number };
}

export interface Object3DConfig {
  id: string;
  name: string;
  category: string;
  description: string;
  
  // Geometry and material functions
  geometry: () => THREE.BufferGeometry;
  material: (color: string) => THREE.Material;
  
  // Transform properties
  scale: { min: number; max: number; default: number };
  rotation: { x: number; y: number; z: number };
  
  // Animation configurations
  animation: {
    idle: Object3DAnimationConfig;
    hover: Object3DAnimationConfig;
    [key: string]: Object3DAnimationConfig;
  };
  
  // Performance settings
  performance: {
    triangles: number;
    lodLevels: number;
    cullingDistance: number;
  };
  
  // Material variants
  materials: {
    standard: (color: string) => THREE.Material;
    [materialName: string]: (color: string) => THREE.Material;
  };
  
  // Metadata
  tags: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface Object3DCategory {
  id: string;
  name: string;
  description: string;
  objects: Object3DConfig[];
  icon?: string;
  color?: string;
}

// Object registry organized by category
export const OBJECT_CATEGORIES: Object3DCategory[] = [
  {
    id: 'geometric',
    name: 'Geometric',
    description: 'Clean geometric shapes and mathematical forms',
    objects: [diamond, sphere, octahedron],
    icon: '◆',
    color: '#61dafb'
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Educational and academic objects',
    objects: [graduationCap, textbooks, brain],
    icon: '🎓',
    color: '#4ecdc4'
  },
  {
    id: 'development',
    name: 'Development',
    description: 'Programming and technology tools',
    objects: [computer, coffee, gitTree],
    icon: '💻',
    color: '#95e1d3'
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Fun and creative objects for entertainment',
    objects: [dice, treasureChest, magic8Ball],
    icon: '🎨',
    color: '#ff6b6b'
  }
];

// Flat registry for quick lookup
export const OBJECT_REGISTRY = new Map<string, Object3DConfig>();

// Populate registry
OBJECT_CATEGORIES.forEach(category => {
  category.objects.forEach(object => {
    OBJECT_REGISTRY.set(object.id, object);
  });
});

// Utility functions
export function getObjectById(id: string): Object3DConfig | null {
  return OBJECT_REGISTRY.get(id) || null;
}

export function getObjectsByCategory(categoryId: string): Object3DConfig[] {
  const category = OBJECT_CATEGORIES.find(cat => cat.id === categoryId);
  return category ? category.objects : [];
}

export function getAllObjects(): Object3DConfig[] {
  return Array.from(OBJECT_REGISTRY.values());
}

export function searchObjects(query: string): Object3DConfig[] {
  const searchTerm = query.toLowerCase();
  return getAllObjects().filter(object => 
    object.name.toLowerCase().includes(searchTerm) ||
    object.description.toLowerCase().includes(searchTerm) ||
    object.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
    object.category.toLowerCase().includes(searchTerm)
  );
}

export function getObjectsByComplexity(complexity: 'low' | 'medium' | 'high'): Object3DConfig[] {
  return getAllObjects().filter(object => object.complexity === complexity);
}

export function getRandomObject(): Object3DConfig {
  const allObjects = getAllObjects();
  return allObjects[Math.floor(Math.random() * allObjects.length)];
}

export function getRandomObjectFromCategory(categoryId: string): Object3DConfig | null {
  const categoryObjects = getObjectsByCategory(categoryId);
  if (categoryObjects.length === 0) return null;
  return categoryObjects[Math.floor(Math.random() * categoryObjects.length)];
}

// Performance analysis
export function getPerformanceStats() {
  const allObjects = getAllObjects();
  const totalTriangles = allObjects.reduce((sum, obj) => sum + obj.performance.triangles, 0);
  const avgTriangles = totalTriangles / allObjects.length;
  
  const complexityCount = allObjects.reduce((acc, obj) => {
    acc[obj.complexity] = (acc[obj.complexity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    totalObjects: allObjects.length,
    totalTriangles,
    averageTriangles: Math.round(avgTriangles),
    complexityDistribution: complexityCount,
    categories: OBJECT_CATEGORIES.length,
    memoryEstimate: `${(totalTriangles * 0.0001).toFixed(1)}MB` // Rough estimate
  };
}

// Material utilities
export function createMaterialVariant(
  object: Object3DConfig, 
  variantName: string, 
  color: string
): THREE.Material | null {
  const materialFunction = object.materials[variantName];
  return materialFunction ? materialFunction(color) : null;
}

export function getAvailableMaterialVariants(object: Object3DConfig): string[] {
  return Object.keys(object.materials);
}

// Animation utilities
export function getAnimationDuration(object: Object3DConfig, animationType: string): number {
  const animation = object.animation[animationType];
  if (!animation) return 0;
  
  // Extract duration from various animation properties
  return animation.scale?.duration || 
         animation.bounce?.duration || 
         animation.lift?.duration || 
         animation.tumble?.duration || 
         animation.shake?.duration || 
         300; // Default duration
}

// LOD utilities
export function shouldUseLOD(object: Object3DConfig, distance: number): boolean {
  return distance > object.performance.cullingDistance / 3;
}

export function getLODLevel(object: Object3DConfig, distance: number): number {
  const maxDistance = object.performance.cullingDistance;
  const levels = object.performance.lodLevels;
  
  if (distance >= maxDistance) return levels - 1;
  
  const levelDistance = maxDistance / levels;
  return Math.min(Math.floor(distance / levelDistance), levels - 1);
}

// Validation utilities
export function validateObject3DConfig(config: Partial<Object3DConfig>): { 
  isValid: boolean; 
  errors: string[]; 
} {
  const errors: string[] = [];
  
  if (!config.id) errors.push('Object ID is required');
  if (!config.name) errors.push('Object name is required');
  if (!config.category) errors.push('Object category is required');
  if (!config.geometry) errors.push('Geometry function is required');
  if (!config.material) errors.push('Material function is required');
  
  if (config.performance) {
    if (config.performance.triangles > 1000) {
      errors.push('Triangle count exceeds recommended maximum (1000)');
    }
    if (config.performance.lodLevels < 1 || config.performance.lodLevels > 5) {
      errors.push('LOD levels must be between 1 and 5');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Export individual objects for direct access
export {
  // Geometric
  diamond,
  sphere,
  octahedron,
  
  // Learning
  graduationCap,
  textbooks,
  brain,
  
  // Development
  computer,
  coffee,
  gitTree,
  
  // Creative
  dice,
  treasureChest,
  magic8Ball
};

// Export categories for organized access
export const GeometricObjects = { diamond, sphere, octahedron };
export const LearningObjects = { graduationCap, textbooks, brain };
export const DevelopmentObjects = { computer, coffee, gitTree };
export const CreativeObjects = { dice, treasureChest, magic8Ball };

// Default export
export default {
  categories: OBJECT_CATEGORIES,
  registry: OBJECT_REGISTRY,
  utils: {
    getObjectById,
    getObjectsByCategory,
    getAllObjects,
    searchObjects,
    getRandomObject,
    getRandomObjectFromCategory,
    getPerformanceStats,
    createMaterialVariant,
    getAvailableMaterialVariants,
    validateObject3DConfig
  }
};
