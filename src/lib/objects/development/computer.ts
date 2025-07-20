import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createComputerGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  
  // Monitor base/stand
  const standGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.08, 12);
  const stand = new THREE.Mesh(standGeometry);
  stand.position.y = -0.35;
  group.add(stand);
  
  // Monitor arm
  const armGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8);
  const arm = new THREE.Mesh(armGeometry);
  arm.position.y = -0.18;
  group.add(arm);
  
  // Monitor back/housing
  const monitorBackGeometry = new THREE.BoxGeometry(0.6, 0.45, 0.08);
  const monitorBack = new THREE.Mesh(monitorBackGeometry);
  monitorBack.position.y = 0.1;
  group.add(monitorBack);
  
  // Monitor screen (inset)
  const screenGeometry = new THREE.BoxGeometry(0.52, 0.37, 0.02);
  const screen = new THREE.Mesh(screenGeometry);
  screen.position.set(0, 0.1, 0.03);
  group.add(screen);
  
  // Screen bezel
  const bezelGeometry = new THREE.BoxGeometry(0.56, 0.41, 0.01);
  const bezel = new THREE.Mesh(bezelGeometry);
  bezel.position.set(0, 0.1, 0.045);
  group.add(bezel);
  
  // Power button
  const powerButtonGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.005, 8);
  const powerButton = new THREE.Mesh(powerButtonGeometry);
  powerButton.position.set(0.25, -0.15, 0.04);
  powerButton.rotation.x = Math.PI / 2;
  group.add(powerButton);
  
  // Keyboard base
  const keyboardGeometry = new THREE.BoxGeometry(0.45, 0.02, 0.15);
  const keyboard = new THREE.Mesh(keyboardGeometry);
  keyboard.position.set(0, -0.4, 0.25);
  keyboard.rotation.x = -Math.PI / 24;
  group.add(keyboard);
  
  // Individual keys (simplified grid)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 12; col++) {
      const keyGeometry = new THREE.BoxGeometry(0.025, 0.008, 0.025);
      const key = new THREE.Mesh(keyGeometry);
      const x = (col - 5.5) * 0.032;
      const z = (row - 1.5) * 0.032;
      key.position.set(x, -0.385, 0.25 + z);
      key.rotation.x = -Math.PI / 24;
      group.add(key);
    }
  }
  
  // Mouse
  const mouseGeometry = new THREE.BoxGeometry(0.06, 0.015, 0.1);
  const mouse = new THREE.Mesh(mouseGeometry);
  mouse.position.set(0.3, -0.39, 0.2);
  
  // Round the mouse edges
  const mousePositions = mouseGeometry.attributes.position.array as Float32Array;
  for (let i = 0; i < mousePositions.length; i += 3) {
    const x = mousePositions[i];
    const z = mousePositions[i + 2];
    const distance = Math.sqrt(x * x + z * z);
    if (distance > 0.05) {
      const scale = 0.05 / distance;
      mousePositions[i] *= scale;
      mousePositions[i + 2] *= scale;
    }
  }
  mouseGeometry.attributes.position.needsUpdate = true;
  mouseGeometry.computeVertexNormals();
  
  group.add(mouse);
  
  // Cables (simple curved lines)
  const cableGeometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.3, -0.04),
      new THREE.Vector3(-0.1, -0.35, 0.1),
      new THREE.Vector3(-0.05, -0.4, 0.2)
    ]),
    8, 0.008, 6, false
  );
  const cable = new THREE.Mesh(cableGeometry);
  group.add(cable);
  
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

function createComputerMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.7),
    metalness: 0.6,
    roughness: 0.3,
    envMapIntensity: 1.0
  });
}

export const computer: Object3DConfig = {
  id: 'development/computer',
  name: 'Desktop Computer',
  category: 'development',
  description: 'Complete desktop setup with monitor, keyboard, and mouse',
  
  geometry: createComputerGeometry,
  material: createComputerMaterial,
  
  scale: { min: 0.8, max: 1.2, default: 1.0 },
  rotation: { x: 0, y: Math.PI / 6, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0, y: 0.001, z: 0 },
      scale: { amplitude: 0.01, frequency: 0.5 },
      screenGlow: { amplitude: 0.1, frequency: 3.0 }
    },
    hover: {
      rotation: { x: 0, y: 0.003, z: 0 },
      scale: { target: 1.08, duration: 250 },
      screenGlow: { amplitude: 0.2, frequency: 4.0 }
    }
  },
  
  performance: {
    triangles: 520,
    lodLevels: 3,
    cullingDistance: 16
  },
  
  materials: {
    standard: createComputerMaterial,
    modern: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.8),
      metalness: 0.8,
      roughness: 0.1,
      envMapIntensity: 1.5
    }),
    retro: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f0e68c').lerp(new THREE.Color(color), 0.5),
      metalness: 0.2,
      roughness: 0.6,
      emissive: new THREE.Color('#332200').multiplyScalar(0.1)
    }),
    gaming: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.4,
      roughness: 0.2,
      emissive: new THREE.Color(color).multiplyScalar(0.1),
      emissiveIntensity: 0.3
    })
  },
  
  tags: ['technology', 'programming', 'workstation', 'desktop', 'development'],
  complexity: 'high'
};
