/**
 * Browser detection and autoplay policy management utility
 */

/**
 * Detect if the current browser requires user interaction for audio autoplay
 */
export function requiresInteractionForAudio(): boolean {
  // Safari always requires interaction for audio autoplay
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // iOS browsers (including Chrome on iOS) require interaction
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Firefox has similar restrictions in some configurations
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

  return isSafari || isIOS || isFirefox;
}

/**
 * State manager for tracking autoplay interaction requirements
 */
class AutoplayStateManager {
  private static instance: AutoplayStateManager;
  private hasUserInteracted: boolean = false;
  private initialDirectLinkLoad: boolean = false;
  private unmutePending: boolean = false;

  private constructor() {
    // Check if this is an initial direct link load
    this.checkInitialDirectLinkLoad();
  }

  public static getInstance(): AutoplayStateManager {
    if (!AutoplayStateManager.instance) {
      AutoplayStateManager.instance = new AutoplayStateManager();
    }
    return AutoplayStateManager.instance;
  }

  /**
   * Check if user entered the page with a query URL (direct link)
   */
  private checkInitialDirectLinkLoad(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const hasEventParam = urlParams.has('event');

    // Be more flexible with the direct link detection
    // Consider it an initial direct link load if:
    // 1. There's an event parameter in the URL
    // 2. This is likely the initial page load (no previous user interaction)
    // 3. We haven't marked any user interaction yet
    this.initialDirectLinkLoad = hasEventParam && !this.hasUserInteracted;
  }

  /**
   * Check if we should start video muted due to autoplay restrictions
   */
  public shouldStartMuted(): boolean {
    const requiresInteraction = requiresInteractionForAudio();
    const shouldMute = requiresInteraction && this.initialDirectLinkLoad && !this.hasUserInteracted;

    return shouldMute;
  }

  /**
   * Mark that user has interacted (clicked something)
   */
  public markUserInteraction(): void {
    this.hasUserInteracted = true;
    // Only reset initial direct link load if this is a real user interaction
    // For direct links, we want to preserve the initial state until after video plays
    if (!this.initialDirectLinkLoad) {
      // If we weren't in initial direct link mode, it's safe to reset
      this.initialDirectLinkLoad = false;
    }
    // If we WERE in initial direct link mode, preserve it for the first video play
  }

  /**
   * Mark that user has REALLY interacted (for real clicks, not programmatic)
   */
  public markRealUserInteraction(): void {
    this.hasUserInteracted = true;
    this.initialDirectLinkLoad = false; // Now we can safely reset
  }

  /**
   * Check if we're in initial direct link load state
   */
  public isInitialDirectLinkLoad(): boolean {
    return this.initialDirectLinkLoad;
  }

  /**
   * Refresh the initial direct link detection (useful if called later in page lifecycle)
   */
  public refreshDirectLinkDetection(): void {
    this.checkInitialDirectLinkLoad();
  }

  /**
   * Mark that unmute is pending for current video
   */
  public setUnmutePending(pending: boolean): void {
    this.unmutePending = pending;

    // If we're no longer pending unmute, it means the video played successfully
    // We can now safely clear the initial direct link state
    if (!pending && this.initialDirectLinkLoad) {
      this.initialDirectLinkLoad = false;
    }
  }

  /**
   * Check if unmute is pending
   */
  public isUnmutePending(): boolean {
    return this.unmutePending;
  }

  /**
   * Reset state (useful for navigation)
   */
  public reset(): void {
    // Don't reset hasUserInteracted - that should persist
    this.initialDirectLinkLoad = false;
    this.unmutePending = false;
  }
}

export const autoplayStateManager = AutoplayStateManager.getInstance();
