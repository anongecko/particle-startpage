import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createGraduationCapGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  
  // Cap base (skull cap part)
  const capBaseGeometry = new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const capBase = new THREE.Mesh(capBaseGeometry);
  capBase.position.y = -0.1;
  group.add(capBase);
  
  // Mortarboard (flat square top)
  const boardGeometry = new THREE.BoxGeometry(0.8, 0.06, 0.8);
  const board = new THREE.Mesh(boardGeometry);
  board.position.y = 0.15;
  group.add(board);
  
  // Board edge trim
  const trimGeometry = new THREE.BoxGeometry(0.82, 0.08, 0.82);
  const trim = new THREE.Mesh(trimGeometry);
  trim.position.y = 0.14;
  group.add(trim);
  
  // Button on top
  const buttonGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8);
  const button = new THREE.Mesh(buttonGeometry);
  button.position.y = 0.21;
  group.add(button);
  
  // Tassel cord attachment
  const cordGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.1, 6);
  const cord = new THREE.Mesh(cordGeometry);
  cord.position.set(0.3, 0.25, 0.3);
  cord.rotation.z = Math.PI / 6;
  group.add(cord);
  
  // Tassel top (small cylinder)
  const tasselTopGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8);
  const tasselTop = new THREE.Mesh(tasselTopGeometry);
  tasselTop.position.set(0.35, 0.1, 0.35);
  group.add(tasselTop);
  
  // Tassel strands (multiple thin cylinders)
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 0.025;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    const strandGeometry = new THREE.CylinderGeometry(0.005, 0.003, 0.15, 4);
    const strand = new THREE.Mesh(strandGeometry);
    strand.position.set(0.35 + x, -0.05, 0.35 + z);
    strand.rotation.x = (Math.random() - 0.5) * 0.2;
    strand.rotation.z = (Math.random() - 0.5) * 0.2;
    group.add(strand);
  }
  
  // Create compound geometry manually
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
      
      // Add vertices
      for (let i = 0; i < positions.length; i++) {
        vertices.push(positions[i]);
      }
      
      // Add indices with offset
      if (geometryIndices.length > 0) {
        for (let i = 0; i < geometryIndices.length; i++) {
          indices.push(geometryIndices[i] + indexOffset);
        }
      } else {
        // Generate indices for non-indexed geometry
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

function createGraduationCapMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.8),
    metalness: 0.1,
    roughness: 0.6,
    envMapIntensity: 0.8
  });
}

export const graduationCap: Object3DConfig = {
  id: 'learning/graduation-cap',
  name: 'Graduation Cap',
  category: 'learning',
  description: 'Academic mortarboard with detailed tassel',
  
  geometry: createGraduationCapGeometry,
  material: createGraduationCapMaterial,
  
  scale: { min: 0.8, max: 1.2, default: 1.0 },
  rotation: { x: -Math.PI / 12, y: Math.PI / 8, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0, y: 0.002, z: 0 },
      scale: { amplitude: 0.02, frequency: 0.7 }
    },
    hover: {
      rotation: { x: 0, y: 0.004, z: 0 },
      scale: { target: 1.15, duration: 300 },
      bounce: { amplitude: 0.05, duration: 600 }
    }
  },
  
  performance: {
    triangles: 280,
    lodLevels: 3,
    cullingDistance: 15
  },
  
  materials: {
    standard: createGraduationCapMaterial,
    metallic: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.6,
      roughness: 0.3,
      envMapIntensity: 1.2
    }),
    fabric: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.9),
      metalness: 0,
      roughness: 0.8,
      normalScale: new THREE.Vector2(0.5, 0.5)
    })
  },
  
  tags: ['education', 'graduation', 'academic', 'achievement', 'learning'],
  complexity: 'high'
};
