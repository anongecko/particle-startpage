import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createMagic8BallGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  
  // Main sphere body
  const ballGeometry = new THREE.SphereGeometry(0.35, 24, 16);
  const ball = new THREE.Mesh(ballGeometry);
  group.add(ball);
  
  // Number 8 circle (white circle on top)
  const circleGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.01, 16);
  const circle = new THREE.Mesh(circleGeometry);
  circle.position.y = 0.34;
  group.add(circle);
  
  // Number 8 shape (two connected circles)
  const eightTopGeometry = new THREE.TorusGeometry(0.05, 0.015, 8, 16);
  const eightTop = new THREE.Mesh(eightTopGeometry);
  eightTop.position.set(0, 0.36, 0);
  eightTop.rotation.x = Math.PI / 2;
  group.add(eightTop);
  
  const eightBottomGeometry = new THREE.TorusGeometry(0.04, 0.015, 8, 16);
  const eightBottom = new THREE.Mesh(eightBottomGeometry);
  eightBottom.position.set(0, 0.32, 0);
  eightBottom.rotation.x = Math.PI / 2;
  group.add(eightBottom);
  
  // Connection between the two parts of "8"
  const connectionGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8);
  const connection = new THREE.Mesh(connectionGeometry);
  connection.position.set(0, 0.34, 0);
  group.add(connection);
  
  // Answer window (dark triangular window on bottom)
  const windowGeometry = new THREE.ConeGeometry(0.08, 0.02, 3);
  const window = new THREE.Mesh(windowGeometry);
  window.position.set(0, -0.25, 0.25);
  window.rotation.x = Math.PI;
  group.add(window);
  
  // Window frame (slightly larger triangle)
  const frameGeometry = new THREE.ConeGeometry(0.09, 0.015, 3);
  const frame = new THREE.Mesh(frameGeometry);
  frame.position.set(0, -0.25, 0.26);
  frame.rotation.x = Math.PI;
  group.add(frame);
  
  // Answer die inside (small 20-sided die that would float)
  const dieGeometry = new THREE.IcosahedronGeometry(0.04);
  const die = new THREE.Mesh(dieGeometry);
  die.position.set(0, -0.25, 0.2);
  group.add(die);
  
  // Liquid chamber (transparent inner sphere)
  const liquidGeometry = new THREE.SphereGeometry(0.25, 16, 12);
  const liquid = new THREE.Mesh(liquidGeometry);
  liquid.position.y = -0.05;
  group.add(liquid);
  
  // Base ring for stability
  const baseGeometry = new THREE.TorusGeometry(0.32, 0.02, 8, 16);
  const base = new THREE.Mesh(baseGeometry);
  base.position.y = -0.35;
  base.rotation.x = Math.PI / 2;
  group.add(base);
  
  // Floating answer text area (simplified as small rectangular face)
  const textAreaGeometry = new THREE.PlaneGeometry(0.06, 0.02);
  const textArea = new THREE.Mesh(textAreaGeometry);
  textArea.position.set(0, -0.25, 0.21);
  textArea.rotation.x = -Math.PI / 12;
  group.add(textArea);
  
  // Surface imperfections for realism
  const ballPositions = ballGeometry.attributes.position.array as Float32Array;
  for (let i = 0; i < ballPositions.length; i += 3) {
    const x = ballPositions[i];
    const y = ballPositions[i + 1];
    const z = ballPositions[i + 2];
    
    // Add very subtle surface variation
    const noise = (Math.sin(x * 20) * Math.sin(y * 20) * Math.sin(z * 20)) * 0.005;
    const distance = Math.sqrt(x * x + y * y + z * z);
    
    if (distance > 0) {
      const scale = (distance + noise) / distance;
      ballPositions[i] *= scale;
      ballPositions[i + 1] *= scale;
      ballPositions[i + 2] *= scale;
    }
  }
  
  ballGeometry.attributes.position.needsUpdate = true;
  ballGeometry.computeVertexNormals();
  
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

function createMagic8BallMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#000000').lerp(new THREE.Color(color), 0.2),
    metalness: 0.1,
    roughness: 0.3,
    envMapIntensity: 1.2
  });
}

export const magic8Ball: Object3DConfig = {
  id: 'creative/magic-8-ball',
  name: 'Magic 8 Ball',
  category: 'creative',
  description: 'Classic fortune-telling toy with answer window and floating die',
  
  geometry: createMagic8BallGeometry,
  material: createMagic8BallMaterial,
  
  scale: { min: 0.8, max: 1.2, default: 1.0 },
  rotation: { x: Math.PI / 12, y: -Math.PI / 8, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0.001, y: 0.002, z: 0 },
      scale: { amplitude: 0.02, frequency: 0.9 },
      liquidSwirl: { amplitude: 0.05, frequency: 1.5 }
    },
    hover: {
      rotation: { x: 0.003, y: 0.005, z: 0.001 },
      scale: { target: 1.12, duration: 300 },
      shake: { amplitude: 0.08, duration: 600 },
      dieFloat: { amplitude: 0.1, frequency: 4.0 }
    }
  },
  
  performance: {
    triangles: 420,
    lodLevels: 3,
    cullingDistance: 15
  },
  
  materials: {
    standard: createMagic8BallMaterial,
    classic: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#000000'),
      metalness: 0.05,
      roughness: 0.4,
      envMapIntensity: 0.8
    }),
    crystal: (color: string) => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color).multiplyScalar(0.3),
      transmission: 0.7,
      thickness: 0.5,
      roughness: 0.1,
      ior: 1.5,
      transparent: true,
      opacity: 0.9
    }),
    mystical: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4B0082').lerp(new THREE.Color(color), 0.3),
      metalness: 0.2,
      roughness: 0.3,
      emissive: new THREE.Color('#4B0082').multiplyScalar(0.1),
      emissiveIntensity: 0.2
    })
  },
  
  tags: ['fortune', 'magic', 'prediction', 'toy', 'mystical'],
  complexity: 'medium'
};
