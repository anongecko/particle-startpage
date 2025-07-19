import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createBrainGeometry(): THREE.BufferGeometry {
  // Start with base brain shape (two connected spheres)
  const leftHemisphereGeometry = new THREE.SphereGeometry(0.35, 16, 12, 0, Math.PI);
  const rightHemisphereGeometry = new THREE.SphereGeometry(0.35, 16, 12, Math.PI, Math.PI);
  
  // Position hemispheres
  leftHemisphereGeometry.translate(-0.1, 0, 0);
  rightHemisphereGeometry.translate(0.1, 0, 0);
  
  // Create brain stem
  const stemGeometry = new THREE.CylinderGeometry(0.08, 0.12, 0.25, 8);
  stemGeometry.translate(0, -0.4, -0.1);
  
  // Create cerebellum (smaller sphere at back)
  const cerebellumGeometry = new THREE.SphereGeometry(0.15, 12, 8);
  cerebellumGeometry.translate(0, -0.2, -0.25);
  
  // Merge base geometries
  const group = new THREE.Group();
  group.add(new THREE.Mesh(leftHemisphereGeometry));
  group.add(new THREE.Mesh(rightHemisphereGeometry)); 
  group.add(new THREE.Mesh(stemGeometry));
  group.add(new THREE.Mesh(cerebellumGeometry));
  
  // Convert to single geometry and add surface detail
  const vertices: number[] = [];
  const indices: number[] = [];
  let indexOffset = 0;
  
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry.clone();
      const positions = geometry.attributes.position.array;
      const geometryIndices = geometry.index?.array || [];
      
      // Add surface wrinkles/folds
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        
        // Create brain-like surface texture with noise
        const noise1 = Math.sin(x * 12) * Math.sin(y * 12) * Math.sin(z * 12) * 0.02;
        const noise2 = Math.sin(x * 20) * Math.cos(y * 18) * Math.sin(z * 16) * 0.015;
        const noise3 = Math.cos(x * 8) * Math.sin(y * 10) * Math.cos(z * 14) * 0.01;
        
        const totalNoise = noise1 + noise2 + noise3;
        
        // Apply noise to create wrinkled surface
        const distance = Math.sqrt(x * x + y * y + z * z);
        if (distance > 0) {
          const scale = (distance + totalNoise) / distance;
          vertices.push(x * scale, y * scale, z * scale);
        } else {
          vertices.push(x, y, z);
        }
      }
      
      if (geometryIndices.length > 0) {
        for (let i = 0; i < geometryIndices.length; i++) {
          indices.push(geometryIndices[i] + indexOffset);
        }
      } else {
        for (let i = 0; i < positions.length / 3; i++) {
          indices.push(i + indexOffset);
        }
      }
      
      indexOffset += positions.length / 3;
    }
  });
  
  const finalGeometry = new THREE.BufferGeometry();
  finalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  finalGeometry.setIndex(indices);
  finalGeometry.computeVertexNormals();
  
  // Add groove along the middle (corpus callosum separation)
  const positions = finalGeometry.attributes.position.array as Float32Array;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    // Create central fissure
    if (Math.abs(x) < 0.05 && y > -0.1 && z > -0.1) {
      positions[i + 1] -= 0.03; // Deepen the central groove
    }
  }
  
  finalGeometry.attributes.position.needsUpdate = true;
  finalGeometry.computeVertexNormals();
  
  return finalGeometry;
}

function createBrainMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.9),
    metalness: 0.05,
    roughness: 0.8,
    envMapIntensity: 0.4,
    normalScale: new THREE.Vector2(0.6, 0.6)
  });
}

function createBrainNormalMap(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = (i * size + j) * 4;
      
      // Create organic brain-like normal patterns
      const x = (i / size) * Math.PI * 8;
      const y = (j / size) * Math.PI * 8;
      
      const noise1 = Math.sin(x * 1.5) * Math.sin(y * 1.3) * 0.3;
      const noise2 = Math.sin(x * 3.2) * Math.cos(y * 2.8) * 0.2;
      const noise3 = Math.cos(x * 6.1) * Math.sin(y * 5.7) * 0.1;
      
      const totalNoise = (noise1 + noise2 + noise3) * 0.5 + 0.5;
      
      data[index] = 128 + totalNoise * 40;     // R (X)
      data[index + 1] = 128 + totalNoise * 40; // G (Y)
      data[index + 2] = 255;                   // B (Z)
      data[index + 3] = 255;                   // A
    }
  }
  
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export const brain: Object3DConfig = {
  id: 'learning/brain',
  name: 'Brain Model',
  category: 'learning',
  description: 'Anatomical brain with detailed surface texture and hemispheres',
  
  geometry: createBrainGeometry,
  material: (color: string) => {
    const material = createBrainMaterial(color);
    material.normalMap = createBrainNormalMap();
    return material;
  },
  
  scale: { min: 0.7, max: 1.3, default: 1.0 },
  rotation: { x: Math.PI / 12, y: -Math.PI / 6, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0.001, y: 0.002, z: 0 },
      scale: { amplitude: 0.02, frequency: 1.1 },
      pulse: { amplitude: 0.015, frequency: 2.0 } // Thinking pulse
    },
    hover: {
      rotation: { x: 0.002, y: 0.004, z: 0 },
      scale: { target: 1.15, duration: 300 },
      pulse: { amplitude: 0.03, frequency: 3.0 }
    }
  },
  
  performance: {
    triangles: 480,
    lodLevels: 4,
    cullingDistance: 18
  },
  
  materials: {
    standard: createBrainMaterial,
    anatomical: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffb3ba').lerp(new THREE.Color(color), 0.3),
      metalness: 0.1,
      roughness: 0.9,
      normalScale: new THREE.Vector2(1.0, 1.0)
    }),
    xray: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.5),
      transparent: true,
      opacity: 0.7,
      emissive: new THREE.Color(color).multiplyScalar(0.1),
      metalness: 0,
      roughness: 0.2
    })
  },
  
  tags: ['anatomy', 'neuroscience', 'thinking', 'intelligence', 'medical'],
  complexity: 'high'
};
