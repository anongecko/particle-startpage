import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createDiamondGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  // Diamond vertices (classic brilliant cut inspired)
  const vertices = new Float32Array([
    // Top point
    0, 0.8, 0,
    
    // Upper crown (8 points around top)
    0.3, 0.4, 0.3,   0.0, 0.4, 0.4,   -0.3, 0.4, 0.3,   -0.4, 0.4, 0.0,
    -0.3, 0.4, -0.3, 0.0, 0.4, -0.4,  0.3, 0.4, -0.3,   0.4, 0.4, 0.0,
    
    // Girdle (widest part - 8 points)
    0.5, 0.0, 0.5,   0.0, 0.0, 0.7,   -0.5, 0.0, 0.5,   -0.7, 0.0, 0.0,
    -0.5, 0.0, -0.5, 0.0, 0.0, -0.7,  0.5, 0.0, -0.5,   0.7, 0.0, 0.0,
    
    // Lower pavilion (8 points)
    0.25, -0.4, 0.25, 0.0, -0.4, 0.35, -0.25, -0.4, 0.25, -0.35, -0.4, 0.0,
    -0.25, -0.4, -0.25, 0.0, -0.4, -0.35, 0.25, -0.4, -0.25, 0.35, -0.4, 0.0,
    
    // Bottom point (culet)
    0, -0.8, 0
  ]);
  
  // Faces creating brilliant cut facets
  const indices = new Uint16Array([
    // Top crown facets (connecting to top point)
    0,1,2, 0,2,3, 0,3,4, 0,4,5, 0,5,6, 0,6,7, 0,7,8, 0,8,1,
    
    // Upper crown to girdle
    1,9,10,1,10,2, 2,10,11,2,11,3, 3,11,12,3,12,4, 4,12,13,4,13,5,
    5,13,14,5,14,6, 6,14,15,6,15,7, 7,15,16,7,16,8, 8,16,9,8,9,1,
    
    // Girdle to pavilion
    9,17,18,9,18,10, 10,18,19,10,19,11, 11,19,20,11,20,12, 12,20,21,12,21,13,
    13,21,22,13,22,14, 14,22,23,14,23,15, 15,23,24,15,24,16, 16,24,17,16,17,9,
    
    // Pavilion to bottom point
    25,17,18, 25,18,19, 25,19,20, 25,20,21, 25,21,22, 25,22,23, 25,23,24, 25,24,17
  ]);
  
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  
  return geometry;
}

function createDiamondMaterial(color: string): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color).multiplyScalar(0.9),
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.9,
    thickness: 0.5,
    ior: 2.4, // Diamond's refractive index
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.95,
    envMapIntensity: 2.0,
    reflectivity: 1.0
  });
}

export const diamond: Object3DConfig = {
  id: 'geometric/diamond',
  name: 'Diamond',
  category: 'geometric',
  description: 'A brilliant cut diamond with realistic faceting',
  
  geometry: createDiamondGeometry,
  material: createDiamondMaterial,
  
  scale: { min: 0.6, max: 1.4, default: 1.0 },
  rotation: { x: 0, y: 0, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0, y: 0.005, z: 0 },
      scale: { amplitude: 0.02, frequency: 0.8 }
    },
    hover: {
      rotation: { x: 0, y: 0.01, z: 0 },
      scale: { target: 1.15, duration: 200 }
    }
  },
  
  performance: {
    triangles: 144,
    lodLevels: 3,
    cullingDistance: 15
  },
  
  materials: {
    standard: createDiamondMaterial,
    metallic: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.9,
      roughness: 0.1,
      envMapIntensity: 1.5
    }),
    glass: (color: string) => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color).multiplyScalar(0.8),
      transmission: 0.95,
      thickness: 0.3,
      roughness: 0,
      ior: 1.5,
      transparent: true
    })
  },
  
  tags: ['geometric', 'crystal', 'brilliant', 'faceted', 'luxury'],
  complexity: 'medium'
};
