import { fadeFromLegalTransition, fadeToLegalTransition } from './fade';
import { slideTransition } from './slide';

/**
 * Get all Barba transitions
 */
export const getTransitions = () => [
  fadeToLegalTransition,
  fadeFromLegalTransition,
  slideTransition,
];

export { fadeFromLegalTransition, fadeToLegalTransition, slideTransition };

export default {
  getTransitions,
};
