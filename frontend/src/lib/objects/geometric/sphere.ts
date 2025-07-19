import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createEnhancedSphereGeometry(): THREE.BufferGeometry {
  // Create base sphere with good detail
  const geometry = new THREE.SphereGeometry(0.7, 32, 24);
  
  // Add subtle surface variation for visual interest
  const positions = geometry.attributes.position;
  const vertices = positions.array as Float32Array;
  
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];
    
    // Calculate distance from center
    const distance = Math.sqrt(x * x + y * y + z * z);
    
    // Add subtle noise for surface texture
    const noise = (Math.sin(x * 8) * Math.sin(y * 8) * Math.sin(z * 8)) * 0.015;
    const scale = (distance + noise) / distance;
    
    vertices[i] *= scale;
    vertices[i + 1] *= scale;
    vertices[i + 2] *= scale;
  }
  
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  
  return geometry;
}

function createSphereMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.3,
    roughness: 0.4,
    envMapIntensity: 1.2,
    normalScale: new THREE.Vector2(0.3, 0.3)
  });
}

function createSphereNormalMap(): THREE.DataTexture {
  // Create a simple procedural normal map
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = (i * size + j) * 4;
      
      // Create subtle surface variation
      const x = (i / size) * Math.PI * 4;
      const y = (j / size) * Math.PI * 4;
      const noise = Math.sin(x) * Math.sin(y) * 0.5 + 0.5;
      
      // Convert to normal map values
      data[index] = 128 + noise * 20; // R (X)
      data[index + 1] = 128 + noise * 20; // G (Y)
      data[index + 2] = 255; // B (Z) - pointing up
      data[index + 3] = 255; // A
    }
  }
  
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export const sphere: Object3DConfig = {
  id: 'geometric/sphere',
  name: 'Sphere',
  category: 'geometric',
  description: 'A perfect sphere with subtle surface detail',
  
  geometry: createEnhancedSphereGeometry,
  material: (color: string) => {
    const material = createSphereMaterial(color);
    material.normalMap = createSphereNormalMap();
    return material;
  },
  
  scale: { min: 0.7, max: 1.3, default: 1.0 },
  rotation: { x: 0, y: 0, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0.002, y: 0.003, z: 0.001 },
      scale: { amplitude: 0.03, frequency: 1.2 }
    },
    hover: {
      rotation: { x: 0.004, y: 0.006, z: 0.002 },
      scale: { target: 1.1, duration: 250 }
    }
  },
  
  performance: {
    triangles: 1536, // 32 * 24 * 2
    lodLevels: 4,
    cullingDistance: 20
  },
  
  materials: {
    standard: createSphereMaterial,
    metallic: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.8,
      roughness: 0.2,
      envMapIntensity: 2.0
    }),
    glass: (color: string) => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color).multiplyScalar(0.9),
      transmission: 0.8,
      thickness: 0.4,
      roughness: 0.1,
      ior: 1.5,
      transparent: true,
      opacity: 0.9
    }),
    neon: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color).multiplyScalar(0.2),
      emissiveIntensity: 0.5,
      metalness: 0,
      roughness: 0.3
    })
  },
  
  tags: ['geometric', 'basic', 'perfect', 'round', 'simple'],
  complexity: 'low'
};
