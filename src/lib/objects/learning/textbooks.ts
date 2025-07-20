import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createTextbooksGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  
  // Book specifications
  const books = [
    { width: 0.6, height: 0.08, depth: 0.4, x: 0, y: -0.3, z: 0, rotY: 0 },
    { width: 0.5, height: 0.07, depth: 0.35, x: 0.05, y: -0.22, z: 0.02, rotY: Math.PI / 24 },
    { width: 0.55, height: 0.09, depth: 0.38, x: -0.03, y: -0.13, z: -0.01, rotY: -Math.PI / 32 }
  ];
  
  books.forEach((book, index) => {
    // Main book body
    const bookGeometry = new THREE.BoxGeometry(book.width, book.height, book.depth);
    const bookMesh = new THREE.Mesh(bookGeometry);
    bookMesh.position.set(book.x, book.y, book.z);
    bookMesh.rotation.y = book.rotY;
    
    // Book spine (slightly thicker back edge)
    const spineGeometry = new THREE.BoxGeometry(book.width + 0.01, book.height + 0.005, 0.02);
    const spineMesh = new THREE.Mesh(spineGeometry);
    spineMesh.position.set(book.x, book.y, book.z - book.depth/2 - 0.01);
    spineMesh.rotation.y = book.rotY;
    
    // Front cover details
    const coverGeometry = new THREE.BoxGeometry(book.width - 0.05, 0.002, book.depth - 0.05);
    const coverMesh = new THREE.Mesh(coverGeometry);
    coverMesh.position.set(book.x, book.y + book.height/2 + 0.001, book.z);
    coverMesh.rotation.y = book.rotY;
    
    // Title area (raised rectangle)
    const titleGeometry = new THREE.BoxGeometry(book.width - 0.15, 0.003, 0.08);
    const titleMesh = new THREE.Mesh(titleGeometry);
    titleMesh.position.set(book.x, book.y + book.height/2 + 0.003, book.z + 0.05);
    titleMesh.rotation.y = book.rotY;
    
    // Pages (visible from side)
    for (let i = 0; i < 5; i++) {
      const pageGeometry = new THREE.BoxGeometry(book.width - 0.02, 0.001, book.depth - 0.02);
      const pageMesh = new THREE.Mesh(pageGeometry);
      const offset = (i - 2) * 0.003;
      pageMesh.position.set(book.x + offset, book.y + book.height/2 + 0.002, book.z + 0.002);
      pageMesh.rotation.y = book.rotY;
      group.add(pageMesh);
    }
    
    // Corner details (small bevels)
    for (let corner = 0; corner < 4; corner++) {
      const cornerX = (corner % 2) * (book.width - 0.02) - (book.width - 0.02) / 2;
      const cornerZ = Math.floor(corner / 2) * (book.depth - 0.02) - (book.depth - 0.02) / 2;
      
      const cornerGeometry = new THREE.BoxGeometry(0.02, book.height + 0.002, 0.02);
      const cornerMesh = new THREE.Mesh(cornerGeometry);
      cornerMesh.position.set(book.x + cornerX, book.y, book.z + cornerZ);
      cornerMesh.rotation.y = book.rotY;
      group.add(cornerMesh);
    }
    
    group.add(bookMesh);
    group.add(spineMesh);
    group.add(coverMesh);
    group.add(titleMesh);
  });
  
  // Bookmark ribbons
  for (let i = 0; i < 2; i++) {
    const ribbonGeometry = new THREE.BoxGeometry(0.01, 0.3, 0.02);
    const ribbonMesh = new THREE.Mesh(ribbonGeometry);
    ribbonMesh.position.set(0.2 + i * 0.15, -0.05, 0.15);
    ribbonMesh.rotation.x = Math.PI / 12;
    ribbonMesh.rotation.z = (i === 0 ? -1 : 1) * Math.PI / 24;
    group.add(ribbonMesh);
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

function createTextbooksMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.05,
    roughness: 0.7,
    envMapIntensity: 0.6
  });
}

export const textbooks: Object3DConfig = {
  id: 'learning/textbooks',
  name: 'Stack of Textbooks',
  category: 'learning',
  description: 'Three stacked textbooks with detailed covers and pages',
  
  geometry: createTextbooksGeometry,
  material: createTextbooksMaterial,
  
  scale: { min: 0.8, max: 1.2, default: 1.0 },
  rotation: { x: 0, y: Math.PI / 8, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0, y: 0.001, z: 0 },
      scale: { amplitude: 0.015, frequency: 0.6 }
    },
    hover: {
      rotation: { x: 0, y: 0.003, z: 0 },
      scale: { target: 1.1, duration: 250 },
      lift: { amplitude: 0.1, duration: 400 }
    }
  },
  
  performance: {
    triangles: 420,
    lodLevels: 3,
    cullingDistance: 16
  },
  
  materials: {
    standard: createTextbooksMaterial,
    vintage: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.8),
      metalness: 0,
      roughness: 0.9,
      normalScale: new THREE.Vector2(0.3, 0.3)
    }),
    leather: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.6),
      metalness: 0.1,
      roughness: 0.8,
      normalScale: new THREE.Vector2(0.8, 0.8)
    })
  },
  
  tags: ['education', 'books', 'study', 'knowledge', 'academic'],
  complexity: 'high'
};
