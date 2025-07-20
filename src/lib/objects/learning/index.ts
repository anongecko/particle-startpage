// Learning Objects Collection
export { graduationCap } from './graduation-cap.js';
export { textbooks } from './textbooks.js';
export { brain } from './brain.js';

// Default export with all learning objects
export default {
  graduationCap: () => import('./graduation-cap.js').then(m => m.graduationCap),
  textbooks: () => import('./textbooks.js').then(m => m.textbooks),
  brain: () => import('./brain.js').then(m => m.brain),
};
