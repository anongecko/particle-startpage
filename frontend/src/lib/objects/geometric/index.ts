// Geometric Objects Collection
export { diamond } from './diamond.js';
export { sphere } from './sphere.js';
export { octahedron } from './octahedron.js';

// Default export with all geometric objects
export default {
  diamond: () => import('./diamond.js').then(m => m.diamond),
  sphere: () => import('./sphere.js').then(m => m.sphere),
  octahedron: () => import('./octahedron.js').then(m => m.octahedron),
};
