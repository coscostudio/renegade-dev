/**
 * Loading Coordinator - Manages loading state for preloader and media components
 * Ensures preloader gets priority and other media waits until preloader completes
 */

// Enum for tracking preloader states
export enum PreloaderState {
  NOT_STARTED, // Initial state
  IN_PROGRESS, // Preloader is active
  VIDEO_PLAYING, // Preloader video is playing
  COMPLETED, // Preloader has finished
  SKIPPED, // Preloader was skipped (e.g., for legal page)
}

// Event types for the loading system
type LoadingEventCallback = () => void;

class LoadingCoordinator {
  // Singleton instance
  private static instance: LoadingCoordinator;

  // Current state of the preloader
  private _preloaderState: PreloaderState = PreloaderState.NOT_STARTED;

  // Event listeners for state changes
  private _completionListeners: LoadingEventCallback[] = [];

  // Private constructor (for singleton)
  private constructor() {}

  // Get the singleton instance
  public static getInstance(): LoadingCoordinator {
    if (!LoadingCoordinator.instance) {
      LoadingCoordinator.instance = new LoadingCoordinator();
    }
    return LoadingCoordinator.instance;
  }

  // Get the current preloader state
  public get preloaderState(): PreloaderState {
    return this._preloaderState;
  }

  // Check if media loading is allowed (preloader is done or skipped)
  public canLoadMedia(): boolean {
    return (
      this._preloaderState === PreloaderState.COMPLETED ||
      this._preloaderState === PreloaderState.SKIPPED
    );
  }

  // Set the preloader state and notify listeners if completed
  public setPreloaderState(state: PreloaderState): void {
    const previousState = this._preloaderState;
    this._preloaderState = state;

    // If transitioning to COMPLETED or SKIPPED state, notify listeners
    if (
      (state === PreloaderState.COMPLETED || state === PreloaderState.SKIPPED) &&
      previousState !== PreloaderState.COMPLETED &&
      previousState !== PreloaderState.SKIPPED
    ) {
      this.notifyCompletion();
    }
  }

  // Skip the preloader (for legal page or other cases)
  public skipPreloader(): void {
    this.setPreloaderState(PreloaderState.SKIPPED);
  }

  // Register a callback for when preloader completes
  public onPreloaderComplete(callback: LoadingEventCallback): void {
    // If preloader is already complete, call immediately
    if (this.canLoadMedia()) {
      callback();
    } else {
      // Otherwise add to listeners
      this._completionListeners.push(callback);
    }
  }

  // Notify all listeners that preloader has completed
  private notifyCompletion(): void {
    // Call all registered callbacks
    this._completionListeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {}
    });

    // Clear the listeners after notifying
    this._completionListeners = [];
  }

  // Reset the coordinator (useful for testing or hard resets)
  public reset(): void {
    this._preloaderState = PreloaderState.NOT_STARTED;
    this._completionListeners = [];
  }
}

// Export the singleton instance
export const loadingCoordinator = LoadingCoordinator.getInstance();

// Default export for convenience
export default loadingCoordinator;
