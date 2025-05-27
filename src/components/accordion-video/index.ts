import { fadeOutAudioOnly, initializeAccordion, resetVideo } from './accordion';
import AccordionVideoPlayer from './player';

// Create a singleton instance
let instance: AccordionVideoPlayer | null = null;

/**
 * Initialize the accordion video player and accordion functionality
 * @param container Element to search for videos, defaults to document
 * @param options Configuration options
 * @returns The video player instance
 */
export const initializeAccordionVideoPlayer = (
  container: Element = document,
  options = {}
): AccordionVideoPlayer => {
  // If instance exists, destroy it first
  if (instance) {
    instance.destroy();
  }

  // Create new instance
  instance = new AccordionVideoPlayer(options);

  // Initialize with provided container
  instance.init(container);

  return instance;
};

/**
 * Get the current instance of the accordion video player
 * @returns The current video player instance or null if not initialized
 */
export const getAccordionVideoPlayer = (): AccordionVideoPlayer | null => {
  return instance;
};

/**
 * Destroy the accordion video player instance
 */
export const destroyAccordionVideoPlayer = (): void => {
  if (instance) {
    instance.destroy();
    instance = null;
  }

  // Also clean up unmute overlay when destroying accordion
  // Use dynamic import to avoid circular dependencies
  import('../../utils/unmuteOverlayManager')
    .then(({ unmuteOverlayManager }) => {
      unmuteOverlayManager.cleanup();
    })
    .catch(() => {
      // Silent error handling - unmute overlay manager might not be available
    });
};

/**
 * Initialize accordion functionality
 */
export { fadeOutAudioOnly, initializeAccordion, resetVideo };

export default {
  initialize: initializeAccordionVideoPlayer,
  getInstance: getAccordionVideoPlayer,
  destroy: destroyAccordionVideoPlayer,
  initializeAccordion,
};
