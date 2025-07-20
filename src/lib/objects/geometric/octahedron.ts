import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createDetailedOctahedronGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  // Enhanced octahedron with beveled edges
  const vertices = new Float32Array([
    // Top pyramid vertices
    0, 0.8, 0,           // 0: Top point
    0.6, 0.1, 0.6,       // 1: Top NE
    -0.6, 0.1, 0.6,      // 2: Top NW  
    -0.6, 0.1, -0.6,     // 3: Top SW
    0.6, 0.1, -0.6,      // 4: Top SE
    
    // Middle belt (beveled edges)
    0.7, 0, 0.7,         // 5: Mid NE outer
    0.5, 0, 0.5,         // 6: Mid NE inner
    -0.7, 0, 0.7,        // 7: Mid NW outer
    -0.5, 0, 0.5,        // 8: Mid NW inner
    -0.7, 0, -0.7,       // 9: Mid SW outer
    -0.5, 0, -0.5,       // 10: Mid SW inner
    0.7, 0, -0.7,        // 11: Mid SE outer
    0.5, 0, -0.5,        // 12: Mid SE inner
    
    // Bottom pyramid vertices  
    0.6, -0.1, 0.6,      // 13: Bottom NE
    -0.6, -0.1, 0.6,     // 14: Bottom NW
    -0.6, -0.1, -0.6,    // 15: Bottom SW
    0.6, -0.1, -0.6,     // 16: Bottom SE
    0, -0.8, 0           // 17: Bottom point
  ]);
  
  const indices = new Uint16Array([
    // Top pyramid faces
    0,1,2, 0,2,3, 0,3,4, 0,4,1,
    
    // Top to mid belt transitions
    1,5,6, 1,6,2, 2,6,8, 2,8,7,
    3,7,8, 3,8,9, 3,9,10, 4,10,9,
    4,11,12, 4,12,5, 1,5,12, 1,12,4,
    
    // Mid belt faces (creating beveled effect)
    5,11,12, 5,12,6, 6,12,10, 6,10,8,
    8,10,9, 7,8,9, 7,9,11, 7,11,5,
    
    // Mid to bottom transitions
    6,12,16, 6,16,13, 8,6,13, 8,13,14,
    10,8,14, 10,14,15, 12,10,15, 12,15,16,
    
    // Bottom pyramid faces
    17,13,14, 17,14,15, 17,15,16, 17,16,13
  ]);
  
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  
  // Add edge definition with custom normals for sharp bevels
  const normals = geometry.attributes.normal.array as Float32Array;
  for (let i = 0; i < normals.length; i += 3) {
    // Enhance normal vectors for crisp edge definition
    const length = Math.sqrt(normals[i]**2 + normals[i+1]**2 + normals[i+2]**2);
    normals[i] /= length;
    normals[i+1] /= length; 
    normals[i+2] /= length;
  }
  
  return geometry;
}

function createOctahedronMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.7,
    roughness: 0.2,
    envMapIntensity: 1.5,
    flatShading: false, // Smooth shading for the beveled effect
    side: THREE.DoubleSide
  });
}

export const octahedron: Object3DConfig = {
  id: 'geometric/octahedron',
  name: 'Octahedron', 
  category: 'geometric',
  description: 'A beveled octahedron with enhanced edge definition',
  
  geometry: createDetailedOctahedronGeometry,
  material: createOctahedronMaterial,
  
  scale: { min: 0.6, max: 1.4, default: 1.0 },
  rotation: { x: Math.PI / 8, y: Math.PI / 6, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0.003, y: 0.002, z: 0.001 },
      scale: { amplitude: 0.025, frequency: 0.9 }
    },
    hover: {
      rotation: { x: 0.006, y: 0.004, z: 0.002 },
      scale: { target: 1.12, duration: 180 }
    }
  },
  
  performance: {
    triangles: 72,
    lodLevels: 3,
    cullingDistance: 18
  },
  
  materials: {
    standard: createOctahedronMaterial,
    metallic: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.95,
      roughness: 0.05,
      envMapIntensity: 2.5,
      flatShading: true
    }),
    glass: (color: string) => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color).multiplyScalar(0.7),
      transmission: 0.85,
      thickness: 0.3,
      roughness: 0.05,
      ior: 1.7,
      transparent: true,
      opacity: 0.9,
      clearcoat: 1.0
    }),
    neon: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color).multiplyScalar(0.3),
      emissiveIntensity: 0.6,
      metalness: 0.1,
      roughness: 0.1
    })
  },
  
  tags: ['geometric', 'platonic', 'crystal', 'faceted', 'symmetrical'],
  complexity: 'medium'
};
