import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createDiceGeometry(): THREE.BufferGeometry {
  // Create base cube with rounded edges
  const size = 0.6;
  const segments = 3;
  const geometry = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
  
  // Round the edges by moving vertices
  const positions = geometry.attributes.position.array as Float32Array;
  const radius = size * 0.15; // Rounding radius
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    // Apply rounding to corners and edges
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);
    
    if (absX > size/2 - radius && absY > size/2 - radius && absZ > size/2 - radius) {
      // Round corners
      const cornerX = Math.sign(x) * (size/2 - radius);
      const cornerY = Math.sign(y) * (size/2 - radius);
      const cornerZ = Math.sign(z) * (size/2 - radius);
      
      const dx = x - cornerX;
      const dy = y - cornerY;
      const dz = z - cornerZ;
      
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (distance > 0) {
        const scale = radius / distance;
        positions[i] = cornerX + dx * scale;
        positions[i + 1] = cornerY + dy * scale;
        positions[i + 2] = cornerZ + dz * scale;
      }
    }
  }
  
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  
  // Add dice dots (pips) as small indentations
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry));
  
  // Define dot patterns for each face (1-6)
  const dotPatterns = {
    1: [[0, 0]],
    2: [[-0.15, -0.15], [0.15, 0.15]],
    3: [[-0.15, -0.15], [0, 0], [0.15, 0.15]],
    4: [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]],
    5: [[-0.15, -0.15], [0.15, -0.15], [0, 0], [-0.15, 0.15], [0.15, 0.15]],
    6: [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0], [0.15, 0], [-0.15, 0.15], [0.15, 0.15]]
  };
  
  // Face orientations and positions
  const faces = [
    { face: 1, position: [0, 0, size/2 + 0.01], rotation: [0, 0, 0] },           // Front
    { face: 6, position: [0, 0, -size/2 - 0.01], rotation: [0, Math.PI, 0] },   // Back
    { face: 2, position: [size/2 + 0.01, 0, 0], rotation: [0, Math.PI/2, 0] },  // Right
    { face: 5, position: [-size/2 - 0.01, 0, 0], rotation: [0, -Math.PI/2, 0] }, // Left
    { face: 3, position: [0, size/2 + 0.01, 0], rotation: [-Math.PI/2, 0, 0] }, // Top
    { face: 4, position: [0, -size/2 - 0.01, 0], rotation: [Math.PI/2, 0, 0] }  // Bottom
  ];
  
  faces.forEach(({ face, position, rotation }) => {
    const dots = dotPatterns[face as keyof typeof dotPatterns];
    dots.forEach(([dotX, dotY]) => {
      const dotGeometry = new THREE.SphereGeometry(0.04, 8, 6);
      const dot = new THREE.Mesh(dotGeometry);
      
      // Position dot on face
      dot.position.set(dotX, dotY, 0);
      dot.rotation.set(rotation[0], rotation[1], rotation[2]);
      
      // Transform to world space
      const worldPos = new THREE.Vector3(...position);
      const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
      const localPos = new THREE.Vector3(dotX, dotY, 0);
      localPos.applyMatrix4(rotMatrix);
      
      dot.position.copy(worldPos.add(localPos));
      dot.rotation.set(rotation[0], rotation[1], rotation[2]);
      
      group.add(dot);
    });
  });
  
  // Convert to single geometry
  const vertices: number[] = [];
  const indices: number[] = [];
  let indexOffset = 0;
  
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry.clone();
      child.updateMatrixWorld();
      geometry.applyMatrix4(child.matrixWorld);
      
      const positions = geometry.attributes.position.array;
      const geometryIndices = geometry.index?.array || [];
      
      for (let i = 0; i < positions.length; i++) {
        vertices.push(positions[i]);
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
  
  return finalGeometry;
}

function createDiceMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.1,
    roughness: 0.4,
    envMapIntensity: 1.0
  });
}

export const dice: Object3DConfig = {
  id: 'creative/dice',
  name: '6-Sided Dice',
  category: 'creative',
  description: 'Classic gaming dice with rounded edges and detailed pips',
  
  geometry: createDiceGeometry,
  material: createDiceMaterial,
  
  scale: { min: 0.8, max: 1.2, default: 1.0 },
  rotation: { x: Math.PI / 8, y: Math.PI / 6, z: Math.PI / 12 },
  
  animation: {
    idle: {
      rotation: { x: 0.002, y: 0.003, z: 0.001 },
      scale: { amplitude: 0.02, frequency: 0.8 }
    },
    hover: {
      rotation: { x: 0.006, y: 0.008, z: 0.004 },
      scale: { target: 1.15, duration: 200 },
      tumble: { amplitude: 0.2, duration: 800 }
    }
  },
  
  performance: {
    triangles: 320,
    lodLevels: 3,
    cullingDistance: 15
  },
  
  materials: {
    standard: createDiceMaterial,
    casino: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#FF0000').lerp(new THREE.Color(color), 0.3),
      metalness: 0.2,
      roughness: 0.3,
      envMapIntensity: 1.2
    }),
    bone: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#F5F5DC').lerp(new THREE.Color(color), 0.2),
      metalness: 0.05,
      roughness: 0.6,
      normalScale: new THREE.Vector2(0.3, 0.3)
    }),
    metal: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.8,
      roughness: 0.2,
      envMapIntensity: 2.0
    })
  },
  
  tags: ['gaming', 'random', 'luck', 'tabletop', 'probability'],
  complexity: 'medium'
};
