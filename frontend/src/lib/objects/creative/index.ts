// Creative Objects Collection
export { dice } from './dice.js';
export { treasureChest } from './treasure-chest.js';
export { magic8Ball } from './magic-8-ball.js';

// Default export with all creative objects
export default {
  dice: () => import('./dice.js').then(m => m.dice),
  treasureChest: () => import('./treasure-chest.js').then(m => m.treasureChest),
  magic8Ball: () => import('./magic-8-ball.js').then(m => m.magic8Ball),
};
