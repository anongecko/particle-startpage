import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createTreasureChestGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  
  // Main chest body
  const chestGeometry = new THREE.BoxGeometry(0.6, 0.3, 0.4);
  const chest = new THREE.Mesh(chestGeometry);
  chest.position.y = -0.2;
  group.add(chest);
  
  // Chest lid (curved top)
  const lidGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.6, 16, 1, false, 0, Math.PI);
  const lid = new THREE.Mesh(lidGeometry);
  lid.position.set(0, 0, 0);
  lid.rotation.z = Math.PI / 2;
  lid.rotation.x = Math.PI / 8; // Slightly open
  group.add(lid);
  
  // Metal bands around chest (3 horizontal bands)
  for (let i = 0; i < 3; i++) {
    const bandGeometry = new THREE.TorusGeometry(0.32, 0.02, 6, 16, Math.PI);
    const band = new THREE.Mesh(bandGeometry);
    band.position.set(0, -0.3 + i * 0.15, 0.2);
    band.rotation.x = Math.PI / 2;
    group.add(band);
    
    // Back half of band
    const backBand = new THREE.Mesh(bandGeometry);
    backBand.position.set(0, -0.3 + i * 0.15, -0.2);
    backBand.rotation.x = -Math.PI / 2;
    group.add(backBand);
  }
  
  // Corner reinforcements
  for (let x = 0; x < 2; x++) {
    for (let z = 0; z < 2; z++) {
      const cornerGeometry = new THREE.BoxGeometry(0.04, 0.32, 0.04);
      const corner = new THREE.Mesh(cornerGeometry);
      corner.position.set(
        (x - 0.5) * 0.58,
        -0.2,
        (z - 0.5) * 0.38
      );
      group.add(corner);
    }
  }
  
  // Lock mechanism
  const lockBodyGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.06);
  const lockBody = new THREE.Mesh(lockBodyGeometry);
  lockBody.position.set(0, -0.1, 0.21);
  group.add(lockBody);
  
  // Lock shackle
  const shackleGeometry = new THREE.TorusGeometry(0.03, 0.01, 6, 12, Math.PI);
  const shackle = new THREE.Mesh(shackleGeometry);
  shackle.position.set(0, -0.05, 0.21);
  shackle.rotation.x = Math.PI / 2;
  group.add(shackle);
  
  // Keyhole
  const keyholeGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8);
  const keyhole = new THREE.Mesh(keyholeGeometry);
  keyhole.position.set(0, -0.1, 0.24);
  keyhole.rotation.x = Math.PI / 2;
  group.add(keyhole);
  
  // Hinges (2 hinges on back)
  for (let i = 0; i < 2; i++) {
    const hingeGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8);
    const hinge = new THREE.Mesh(hingeGeometry);
    hinge.position.set((i - 0.5) * 0.3, 0.05, -0.21);
    hinge.rotation.x = Math.PI / 2;
    group.add(hinge);
  }
  
  // Treasure inside (visible through slightly open lid)
  // Gold coins
  for (let i = 0; i < 5; i++) {
    const coinGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.008, 12);
    const coin = new THREE.Mesh(coinGeometry);
    const angle = (i / 5) * Math.PI * 2;
    coin.position.set(
      Math.cos(angle) * 0.1,
      -0.15,
      Math.sin(angle) * 0.08
    );
    coin.rotation.x = Math.random() * 0.3;
    coin.rotation.z = Math.random() * 0.3;
    group.add(coin);
  }
  
  // Gems/jewels
  for (let i = 0; i < 3; i++) {
    const gemGeometry = new THREE.OctahedronGeometry(0.025);
    const gem = new THREE.Mesh(gemGeometry);
    gem.position.set(
      (Math.random() - 0.5) * 0.2,
      -0.13,
      (Math.random() - 0.5) * 0.15
    );
    gem.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    group.add(gem);
  }
  
  // Decorative studs on front
  for (let i = 0; i < 6; i++) {
    const studGeometry = new THREE.SphereGeometry(0.015, 8, 6);
    const stud = new THREE.Mesh(studGeometry);
    const x = (i % 3 - 1) * 0.15;
    const y = Math.floor(i / 3) * 0.1 - 0.25;
    stud.position.set(x, y, 0.21);
    group.add(stud);
  }
  
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

function createTreasureChestMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color('#8B4513'), 0.4),
    metalness: 0.3,
    roughness: 0.6,
    envMapIntensity: 1.0
  });
}

export const treasureChest: Object3DConfig = {
  id: 'creative/treasure-chest',
  name: 'Treasure Chest',
  category: 'creative',
  description: 'Ornate treasure chest with visible gold coins and gems',
  
  geometry: createTreasureChestGeometry,
  material: createTreasureChestMaterial,
  
  scale: { min: 0.8, max: 1.2, default: 1.0 },
  rotation: { x: 0, y: -Math.PI / 6, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0, y: 0.001, z: 0 },
      scale: { amplitude: 0.015, frequency: 0.7 },
      shimmer: { amplitude: 0.1, frequency: 2.0 }
    },
    hover: {
      rotation: { x: 0, y: 0.003, z: 0 },
      scale: { target: 1.1, duration: 250 },
      lidOpen: { amplitude: 0.1, duration: 500 },
      goldGlow: { intensity: 1.5, frequency: 3.0 }
    }
  },
  
  performance: {
    triangles: 680,
    lodLevels: 3,
    cullingDistance: 16
  },
  
  materials: {
    standard: createTreasureChestMaterial,
    antique: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#654321').lerp(new THREE.Color(color), 0.3),
      metalness: 0.1,
      roughness: 0.8,
      normalScale: new THREE.Vector2(0.5, 0.5)
    }),
    pirate: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2F1B14').lerp(new THREE.Color(color), 0.4),
      metalness: 0.4,
      roughness: 0.7,
      envMapIntensity: 1.2
    }),
    magical: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.5,
      roughness: 0.3,
      emissive: new THREE.Color(color).multiplyScalar(0.1),
      emissiveIntensity: 0.3
    })
  },
  
  tags: ['treasure', 'pirate', 'wealth', 'adventure', 'storage'],
  complexity: 'high'
};
