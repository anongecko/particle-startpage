import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createCoffeeMugGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  
  // Main mug body (slightly tapered cylinder)
  const mugGeometry = new THREE.CylinderGeometry(0.18, 0.16, 0.35, 16);
  const mug = new THREE.Mesh(mugGeometry);
  mug.position.y = -0.1;
  group.add(mug);
  
  // Coffee liquid surface
  const coffeeGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16);
  const coffee = new THREE.Mesh(coffeeGeometry);
  coffee.position.y = 0.06;
  group.add(coffee);
  
  // Handle (torus section)
  const handleGeometry = new THREE.TorusGeometry(0.08, 0.02, 8, 12, Math.PI);
  const handle = new THREE.Mesh(handleGeometry);
  handle.position.set(0.22, -0.05, 0);
  handle.rotation.y = Math.PI / 2;
  handle.rotation.z = Math.PI / 2;
  group.add(handle);
  
  // Handle connection points
  const connectionGeometry = new THREE.SphereGeometry(0.025, 8, 6);
  const connection1 = new THREE.Mesh(connectionGeometry);
  connection1.position.set(0.18, 0.03, 0);
  const connection2 = new THREE.Mesh(connectionGeometry);
  connection2.position.set(0.18, -0.13, 0);
  group.add(connection1);
  group.add(connection2);
  
  // Mug rim (slight lip)
  const rimGeometry = new THREE.TorusGeometry(0.175, 0.008, 6, 16);
  const rim = new THREE.Mesh(rimGeometry);
  rim.position.y = 0.075;
  group.add(rim);
  
  // Base ring
  const baseGeometry = new THREE.TorusGeometry(0.155, 0.01, 6, 16);
  const base = new THREE.Mesh(baseGeometry);
  base.position.y = -0.275;
  group.add(base);
  
  // Steam particles (small spheres)
  for (let i = 0; i < 8; i++) {
    const steamGeometry = new THREE.SphereGeometry(0.01, 6, 4);
    const steam = new THREE.Mesh(steamGeometry);
    const angle = (i / 8) * Math.PI * 2;
    const radius = 0.05 + Math.random() * 0.08;
    steam.position.set(
      Math.cos(angle) * radius,
      0.15 + i * 0.08 + Math.random() * 0.04,
      Math.sin(angle) * radius
    );
    steam.scale.setScalar(0.5 + Math.random() * 0.5);
    group.add(steam);
  }
  
  // Coffee stain ring on base (optional detail)
  const stainGeometry = new THREE.RingGeometry(0.18, 0.22, 16);
  const stain = new THREE.Mesh(stainGeometry);
  stain.position.y = -0.27;
  stain.rotation.x = -Math.PI / 2;
  group.add(stain);
  
  // Logo area (small rectangular indent)
  const logoGeometry = new THREE.BoxGeometry(0.08, 0.06, 0.005);
  const logo = new THREE.Mesh(logoGeometry);
  logo.position.set(0, 0, 0.16);
  group.add(logo);
  
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

function createCoffeeMugMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.1,
    roughness: 0.6,
    envMapIntensity: 0.8
  });
}

export const coffee: Object3DConfig = {
  id: 'development/coffee',
  name: 'Coffee Mug',
  category: 'development',
  description: 'Steaming coffee mug with detailed handle and steam',
  
  geometry: createCoffeeMugGeometry,
  material: createCoffeeMugMaterial,
  
  scale: { min: 0.8, max: 1.2, default: 1.0 },
  rotation: { x: 0, y: -Math.PI / 4, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0, y: 0.001, z: 0 },
      scale: { amplitude: 0.015, frequency: 0.8 },
      steam: { 
        rise: { amplitude: 0.1, frequency: 2.0 },
        sway: { amplitude: 0.02, frequency: 1.5 }
      }
    },
    hover: {
      rotation: { x: 0, y: 0.003, z: 0 },
      scale: { target: 1.12, duration: 200 },
      steam: { 
        rise: { amplitude: 0.15, frequency: 3.0 },
        intensity: 1.5
      }
    }
  },
  
  performance: {
    triangles: 380,
    lodLevels: 3,
    cullingDistance: 14
  },
  
  materials: {
    standard: createCoffeeMugMaterial,
    ceramic: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.05,
      roughness: 0.8,
      normalScale: new THREE.Vector2(0.3, 0.3)
    }),
    metal: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.8),
      metalness: 0.9,
      roughness: 0.1,
      envMapIntensity: 2.0
    }),
    travel: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.7,
      roughness: 0.3,
      envMapIntensity: 1.2
    })
  },
  
  tags: ['coffee', 'caffeine', 'development', 'energy', 'morning'],
  complexity: 'medium'
};
