import { loadingCoordinator } from '../../utils/loadingCoordinator';
import VideoPreloader from './VideoPreloader';

// Create a singleton instance
const preloader = new VideoPreloader();

// Keep track of the current preloader promise
let currentPreloaderPromise: Promise<void> | null = null;

/**
 * Initialize and play the preloader
 * @returns Promise that resolves when the preloader finishes
 */
export const playPreloader = async (): Promise<void> => {
  // If we already have a running preloader, return that promise
  if (currentPreloaderPromise) {
    return currentPreloaderPromise;
  }

  try {
    // Create a new promise and store it
    currentPreloaderPromise = preloader.playPreloader();

    // Wait for the preloader to complete
    await currentPreloaderPromise;

    // Clear the promise reference
    currentPreloaderPromise = null;
  } catch (error) {
    // Clear the promise reference even on error
    currentPreloaderPromise = null;
  }
};

/**
 * Register a callback to be executed when the preloader completes
 * @param callback Function to execute after preloader is done
 */
export const onPreloaderComplete = (callback: () => void): void => {
  loadingCoordinator.onPreloaderComplete(callback);
};

export default {
  play: playPreloader,
  onComplete: onPreloaderComplete,
};
