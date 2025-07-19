import * as THREE from 'three';
import type { Object3DConfig } from '../index.js';

function createGitTreeGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  
  // Main trunk (master branch)
  const trunkGeometry = new THREE.CylinderGeometry(0.03, 0.04, 0.8, 8);
  const trunk = new THREE.Mesh(trunkGeometry);
  trunk.position.y = -0.2;
  group.add(trunk);
  
  // Branch configurations [y, angle, length, thickness]
  const branches = [
    [-0.3, Math.PI / 6, 0.3, 0.02],      // Lower branch
    [-0.1, -Math.PI / 4, 0.25, 0.018],   // Middle left
    [0.1, Math.PI / 3, 0.35, 0.025],     // Upper right
    [0.3, -Math.PI / 8, 0.2, 0.015],     // Top branch
    [0.0, Math.PI / 2, 0.15, 0.012],     // Side branch
  ];
  
  branches.forEach(([y, angle, length, thickness]) => {
    // Main branch
    const branchGeometry = new THREE.CylinderGeometry(thickness * 0.7, thickness, length, 6);
    const branch = new THREE.Mesh(branchGeometry);
    branch.position.set(0, y, 0);
    branch.rotation.z = angle;
    
    // Adjust position to start from trunk
    const offsetX = Math.sin(angle) * length * 0.5;
    const offsetY = Math.cos(angle) * length * 0.5;
    branch.position.x += offsetX;
    branch.position.y += offsetY;
    
    group.add(branch);
    
    // Sub-branches
    if (length > 0.2) {
      const subBranchGeometry = new THREE.CylinderGeometry(thickness * 0.4, thickness * 0.6, length * 0.6, 6);
      const subBranch = new THREE.Mesh(subBranchGeometry);
      
      const subAngle = angle + (Math.random() - 0.5) * Math.PI / 3;
      subBranch.rotation.z = subAngle;
      
      const endX = offsetX + Math.sin(angle) * length * 0.4;
      const endY = y + offsetY + Math.cos(angle) * length * 0.4;
      
      subBranch.position.set(
        endX + Math.sin(subAngle) * length * 0.3,
        endY + Math.cos(subAngle) * length * 0.3,
        0
      );
      
      group.add(subBranch);
    }
  });
  
  // Commit nodes (small spheres at branch tips and intersections)
  const commitPositions = [
    [0, 0.6, 0],                    // Top of trunk
    [0.15, -0.2, 0],               // Branch intersection
    [0.3, 0.25, 0],                // Branch tip
    [-0.2, 0.05, 0],               // Left branch
    [0.1, -0.4, 0],                // Lower branch
    [-0.25, -0.05, 0],             // Merge point
    [0.08, 0.4, 0],                // Upper commit
  ];
  
  commitPositions.forEach(([x, y, z]) => {
    const commitGeometry = new THREE.SphereGeometry(0.025, 8, 6);
    const commit = new THREE.Mesh(commitGeometry);
    commit.position.set(x, y, z);
    group.add(commit);
    
    // Connection lines between commits (representing git history)
    if (y < 0.5) {
      const connectionGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6);
      const connection = new THREE.Mesh(connectionGeometry);
      connection.position.set(x * 0.7, y + 0.08, z);
      connection.rotation.z = Math.atan2(x, 0.1);
      group.add(connection);
    }
  });
  
  // Root system (small underground branches)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const rootGeometry = new THREE.CylinderGeometry(0.01, 0.015, 0.12, 6);
    const root = new THREE.Mesh(rootGeometry);
    
    root.position.set(
      Math.cos(angle) * 0.06,
      -0.65,
      Math.sin(angle) * 0.06
    );
    root.rotation.z = angle + Math.PI / 2;
    root.rotation.x = Math.PI / 6;
    
    group.add(root);
  }
  
  // Leaves/tags (small flat diamonds representing git tags)
  const leafPositions = [
    [0.28, 0.3, 0.02],
    [0.1, 0.5, -0.02],
    [-0.18, 0.1, 0.03],
    [0.05, 0.15, -0.02]
  ];
  
  leafPositions.forEach(([x, y, z]) => {
    const leafGeometry = new THREE.OctahedronGeometry(0.02);
    const leaf = new THREE.Mesh(leafGeometry);
    leaf.position.set(x, y, z);
    leaf.rotation.x = Math.random() * Math.PI / 4;
    leaf.rotation.z = Math.random() * Math.PI / 4;
    leaf.scale.setScalar(0.8 + Math.random() * 0.4);
    group.add(leaf);
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

function createGitTreeMaterial(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color('#228B22'), 0.3),
    metalness: 0.2,
    roughness: 0.7,
    envMapIntensity: 0.8
  });
}

export const gitTree: Object3DConfig = {
  id: 'development/git-tree',
  name: 'Git Branch Tree',
  category: 'development',
  description: 'Abstract tree representing git branching and version control',
  
  geometry: createGitTreeGeometry,
  material: createGitTreeMaterial,
  
  scale: { min: 0.7, max: 1.3, default: 1.0 },
  rotation: { x: 0, y: Math.PI / 8, z: 0 },
  
  animation: {
    idle: {
      rotation: { x: 0, y: 0.002, z: 0 },
      scale: { amplitude: 0.02, frequency: 0.6 },
      sway: { amplitude: 0.01, frequency: 1.2 }
    },
    hover: {
      rotation: { x: 0, y: 0.004, z: 0 },
      scale: { target: 1.1, duration: 300 },
      commitPulse: { amplitude: 0.1, frequency: 4.0 }
    }
  },
  
  performance: {
    triangles: 450,
    lodLevels: 3,
    cullingDistance: 16
  },
  
  materials: {
    standard: createGitTreeMaterial,
    digital: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.6,
      roughness: 0.2,
      emissive: new THREE.Color(color).multiplyScalar(0.1),
      envMapIntensity: 1.5
    }),
    organic: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4a7c59').lerp(new THREE.Color(color), 0.4),
      metalness: 0,
      roughness: 0.8,
      normalScale: new THREE.Vector2(0.5, 0.5)
    }),
    neon: (color: string) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color).multiplyScalar(0.2),
      emissiveIntensity: 0.4,
      metalness: 0.1,
      roughness: 0.3
    })
  },
  
  tags: ['git', 'version-control', 'branching', 'development', 'tree'],
  complexity: 'high'
};
