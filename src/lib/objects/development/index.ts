// Development Objects Collection
export { computer } from './computer.js';
export { coffee } from './coffee.js';
export { gitTree } from './git-tree.js';

// Default export with all development objects
export default {
  computer: () => import('./computer.js').then(m => m.computer),
  coffee: () => import('./coffee.js').then(m => m.coffee),
  gitTree: () => import('./git-tree.js').then(m => m.gitTree),
};
