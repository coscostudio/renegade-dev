import Hls from 'hls.js';

// Track active HLS instances to prevent errors during cleanup
const activeHlsInstances = new Map<HTMLVideoElement, Hls>();

// Track cleanup operations in progress
const pendingCleanups = new Set<string>();

// Track initialization attempts
const initializationAttempts = new Map<string, number>();

/**
 * Generate a unique ID for a video element
 */
function getVideoId(videoElement: HTMLVideoElement): string {
  if (!videoElement.id) {
    videoElement.id = `video-${Math.random().toString(36).substring(2, 9)}`;
  }
  return videoElement.id;
}

/**
 * Check if a video is currently being cleaned up
 */
export function isHLSCleanupPending(videoElement: HTMLVideoElement): boolean {
  return pendingCleanups.has(getVideoId(videoElement));
}

/**
 * Reset initialization attempts for a video
 */
export function resetInitializationAttempts(videoElement: HTMLVideoElement): void {
  const videoId = getVideoId(videoElement);
  initializationAttempts.delete(videoId);
}

/**
 * Get current initialization attempt count
 */
function getInitializationAttempt(videoElement: HTMLVideoElement): number {
  const videoId = getVideoId(videoElement);
  return initializationAttempts.get(videoId) || 0;
}

/**
 * Increment initialization attempt count
 */
function incrementInitializationAttempt(videoElement: HTMLVideoElement): number {
  const videoId = getVideoId(videoElement);
  const attempts = (initializationAttempts.get(videoId) || 0) + 1;
  initializationAttempts.set(videoId, attempts);
  return attempts;
}

// Initialize HLS for a video element (general purpose)
export async function initializeHLSVideo(
  videoElement: HTMLVideoElement,
  hlsUrl: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Set critical properties immediately
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline', '');
    videoElement.preload = 'auto';

    // Timeout for initialization
    const initTimeout = setTimeout(() => {
      reject(new Error('HLS initialization timeout'));
    }, 8000);

    // Check if HLS is supported by the browser
    if (Hls.isSupported()) {
      const hls = new Hls({
        // Good quality settings for preloader video
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
        startLevel: -1, // Auto-select quality based on bandwidth
        xhrSetup: (xhr, url) => {
          xhr.withCredentials = false;
        },
      });

      // Setup HLS
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoElement);

      // Handle errors
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          clearTimeout(initTimeout);
          reject(data);
        }
      });

      // Wait for manifest to be parsed before resolving
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Store instance for cleanup
        activeHlsInstances.set(videoElement, hls);
        clearTimeout(initTimeout);
        resolve();
      });
    }
    // For Safari which has native HLS support
    else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = hlsUrl;

      // Use events to detect readiness
      const onCanPlay = () => {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        clearTimeout(initTimeout);
        resolve();
      };

      const onError = (err: any) => {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        clearTimeout(initTimeout);
        reject(err);
      };

      videoElement.addEventListener('canplay', onCanPlay);
      videoElement.addEventListener('error', onError);

      // If already loaded, resolve immediately
      if (videoElement.readyState >= 3) {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        clearTimeout(initTimeout);
        resolve();
      }
    }
    // Fallback for unsupported browsers
    else {
      clearTimeout(initTimeout);
      reject(new Error('HLS not supported'));
    }
  });
}

/**
 * Initialize HLS for an accordion video element with specific optimizations and retry logic
 * @param videoElement The video element to initialize
 * @param hlsUrl The HLS URL
 * @param preloadOnly If true, only initialize and preload the first segment without full loading
 * @param maxRetries Maximum number of retry attempts (default: 3)
 */
export async function initializeAccordionHLS(
  videoElement: HTMLVideoElement,
  hlsUrl: string,
  preloadOnly: boolean = false,
  maxRetries: number = 3
): Promise<void> {
  const videoId = getVideoId(videoElement);
  const currentAttempt = incrementInitializationAttempt(videoElement);

  return new Promise((resolve, reject) => {
    // Don't initialize if cleanup is in progress
    if (isHLSCleanupPending(videoElement)) {
      // Return a promise that resolves after a short delay
      setTimeout(() => {
        if (!isHLSCleanupPending(videoElement)) {
          // Try again after cleanup is complete
          initializeAccordionHLS(videoElement, hlsUrl, preloadOnly, maxRetries)
            .then(resolve)
            .catch(reject);
        } else {
          // If still pending, just resolve
          resolve();
        }
      }, 300);
      return;
    }

    // Check if we already have an instance for this video
    if (activeHlsInstances.has(videoElement)) {
      const existingHls = activeHlsInstances.get(videoElement);
      if (existingHls) {
        // If video was fully initialized before
        if (videoElement.dataset.hlsInitialized === 'true') {
          resolve();
          return;
        }
        // Cleanup the existing instance first
        try {
          existingHls.destroy();
          activeHlsInstances.delete(videoElement);
        } catch (e) {
          // Silently handle error
        }
      }
    }

    // Set critical properties immediately
    videoElement.muted = false; // Accordion videos should have sound
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline', '');
    videoElement.loop = true; // Accordion videos should loop
    videoElement.preload = preloadOnly ? 'metadata' : 'auto';
    videoElement.volume = 1; // Ensure full volume

    // Timeout for initialization - longer for first attempt, shorter for retries
    const timeoutDuration = currentAttempt === 1 ? 10000 : 6000;
    const initTimeout = setTimeout(() => {
      // Initialization timeout reached
      if (currentAttempt < maxRetries) {
        console.log(
          `HLS initialization timeout (attempt ${currentAttempt}/${maxRetries}), retrying...`
        );
        // Cleanup current attempt
        if (activeHlsInstances.has(videoElement)) {
          try {
            const hls = activeHlsInstances.get(videoElement);
            if (hls) {
              hls.destroy();
              activeHlsInstances.delete(videoElement);
            }
          } catch (e) {
            // Silent error handling
          }
        }

        // Retry after a brief delay
        setTimeout(() => {
          initializeAccordionHLS(videoElement, hlsUrl, preloadOnly, maxRetries)
            .then(resolve)
            .catch(reject);
        }, 500);
      } else {
        console.warn(`HLS initialization failed after ${maxRetries} attempts`);
        reject(new Error(`HLS initialization timeout after ${maxRetries} attempts`));
      }
    }, timeoutDuration);

    // Check if HLS is supported
    if (Hls.isSupported()) {
      // Balanced settings for quality and efficiency
      const config: Partial<Hls.Config> = {
        // Use automatic level selection for best quality
        startLevel: -1,

        // For preload mode, don't auto start loading segments
        autoStartLoad: !preloadOnly,

        // Reasonable buffer settings
        maxBufferLength: preloadOnly ? 2 : 20,
        maxMaxBufferLength: preloadOnly ? 4 : 40,

        // Performance optimizations
        enableWorker: true,

        // CORS settings
        xhrSetup: (xhr, url) => {
          xhr.withCredentials = false;
        },

        // Reasonable settings for segment loading
        maxBufferHole: 0.5,

        // Adaptive Bitrate Settings
        abrEwmaDefaultEstimate: 1000000, // 1Mbps initial estimate

        // Error handling and recovery - more aggressive for retries
        manifestLoadingTimeOut: currentAttempt === 1 ? 8000 : 5000,
        manifestLoadingMaxRetry: currentAttempt === 1 ? 2 : 1,
        fragLoadingTimeOut: currentAttempt === 1 ? 8000 : 5000,
        fragLoadingMaxRetry: currentAttempt === 1 ? 2 : 1,
      };

      // Create HLS instance with our config
      const hls = new Hls(config);

      // Load the source
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoElement);

      // For preload mode, stop loading after manifest to save bandwidth
      if (preloadOnly) {
        hls.once(Hls.Events.MANIFEST_PARSED, () => {
          hls.stopLoad();
        });
      }

      // Handle errors with retry logic
      hls.on(Hls.Events.ERROR, (_event, data) => {
        // Only handle fatal errors
        if (data.fatal) {
          clearTimeout(initTimeout);

          // Special handling for recoverable errors
          if (data.type === 'mediaError') {
            try {
              hls.recoverMediaError();
              return;
            } catch (e) {
              // Recovery failed, continue to retry logic
            }
          }

          // Try to recover from network errors once
          if (data.type === 'networkError' && currentAttempt === 1) {
            try {
              hls.startLoad();
              return;
            } catch (e) {
              // Recovery failed, continue to retry logic
            }
          }

          // If we can retry, do so
          if (currentAttempt < maxRetries) {
            console.log(`HLS error (attempt ${currentAttempt}/${maxRetries}), retrying...`, data);

            // Cleanup current attempt
            try {
              hls.destroy();
              activeHlsInstances.delete(videoElement);
            } catch (e) {
              // Silent error handling
            }

            // Retry after a brief delay
            setTimeout(() => {
              initializeAccordionHLS(videoElement, hlsUrl, preloadOnly, maxRetries)
                .then(resolve)
                .catch(reject);
            }, 1000);
          } else {
            console.warn(`HLS error after ${maxRetries} attempts:`, data);
            reject(data);
          }
        }
      });

      // For preload-only mode, resolve when manifest is parsed
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Store in active instances
        activeHlsInstances.set(videoElement, hls);

        if (preloadOnly) {
          clearTimeout(initTimeout);
          // Reset retry counter on success
          initializationAttempts.delete(videoId);
          resolve();
        }
      });

      // For full loading mode, wait for the first level to load
      if (!preloadOnly) {
        hls.on(Hls.Events.LEVEL_LOADED, () => {
          clearTimeout(initTimeout);
          // Reset retry counter on success
          initializationAttempts.delete(videoId);
          resolve();
        });
      }

      // Additional safety check - ensure video element is ready
      if (!preloadOnly) {
        const checkVideoReady = () => {
          if (videoElement.readyState >= 2) {
            // HAVE_CURRENT_DATA or higher
            clearTimeout(initTimeout);
            // Reset retry counter on success
            initializationAttempts.delete(videoId);
            resolve();
          }
        };

        videoElement.addEventListener('loadeddata', checkVideoReady, { once: true });
        videoElement.addEventListener('canplay', checkVideoReady, { once: true });
      }
    }
    // For Safari with native HLS support
    else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = hlsUrl;

      // In preload mode, just set the source without loading
      if (preloadOnly) {
        clearTimeout(initTimeout);
        // Reset retry counter on success
        initializationAttempts.delete(videoId);
        resolve();
        return;
      }

      const onCanPlay = () => {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        videoElement.removeEventListener('loadeddata', onLoadedData);
        clearTimeout(initTimeout);
        // Reset retry counter on success
        initializationAttempts.delete(videoId);
        resolve();
      };

      const onLoadedData = () => {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        videoElement.removeEventListener('loadeddata', onLoadedData);
        clearTimeout(initTimeout);
        // Reset retry counter on success
        initializationAttempts.delete(videoId);
        resolve();
      };

      const onError = (err: any) => {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        videoElement.removeEventListener('loadeddata', onLoadedData);
        clearTimeout(initTimeout);

        // Retry logic for Safari
        if (currentAttempt < maxRetries) {
          console.log(`Safari HLS error (attempt ${currentAttempt}/${maxRetries}), retrying...`);
          setTimeout(() => {
            initializeAccordionHLS(videoElement, hlsUrl, preloadOnly, maxRetries)
              .then(resolve)
              .catch(reject);
          }, 500);
        } else {
          console.warn(`Safari HLS error after ${maxRetries} attempts:`, err);
          reject(err);
        }
      };

      videoElement.addEventListener('canplay', onCanPlay);
      videoElement.addEventListener('loadeddata', onLoadedData);
      videoElement.addEventListener('error', onError);

      if (videoElement.readyState >= 2) {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        videoElement.removeEventListener('loadeddata', onLoadedData);
        clearTimeout(initTimeout);
        // Reset retry counter on success
        initializationAttempts.delete(videoId);
        resolve();
      }
    } else {
      clearTimeout(initTimeout);
      reject(new Error('HLS not supported'));
    }
  });
}

/**
 * Start loading an accordion HLS video that was previously only preloaded
 * Call this when user hovers or clicks to prepare for playback
 */
export function startLoadingHLS(videoElement: HTMLVideoElement): void {
  if (!videoElement) return;

  const hls = activeHlsInstances.get(videoElement);
  if (hls) {
    // Start loading segments
    hls.startLoad();
  }
}

/**
 * Improved cleanup that properly handles accordion scenarios
 * Returns a promise that resolves when cleanup is complete
 */
export function cleanupAccordionHLS(videoElement: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (!videoElement) {
      resolve();
      return;
    }

    const videoId = getVideoId(videoElement);

    // Mark this video as being cleaned up
    pendingCleanups.add(videoId);

    // Reset initialization attempts
    initializationAttempts.delete(videoId);

    // Get the HLS instance
    const hls = activeHlsInstances.get(videoElement);

    if (!hls) {
      // No HLS instance, so we can resolve immediately
      pendingCleanups.delete(videoId);
      resolve();
      return;
    }

    // Force pause the video first
    try {
      videoElement.pause();
    } catch (e) {
      // Silently handle error
    }

    // Reset video properties
    videoElement.currentTime = 0;
    videoElement.volume = 1;
    videoElement.muted = false;
    videoElement.style.opacity = '0';

    // Stop any loading processes first
    try {
      hls.stopLoad();
    } catch (e) {
      // Silently handle error
    }

    // Immediate cleanup
    try {
      hls.destroy();
      activeHlsInstances.delete(videoElement);
      // Mark video as needing reinitialization
      videoElement.dataset.hlsInitialized = 'false';
      pendingCleanups.delete(videoId);
      resolve();
    } catch (e) {
      // If immediate cleanup fails, try with delay
      setTimeout(() => {
        try {
          if (activeHlsInstances.has(videoElement)) {
            const hls = activeHlsInstances.get(videoElement);
            if (hls) {
              hls.destroy();
              activeHlsInstances.delete(videoElement);
            }
          }
        } catch (err) {
          // Silently handle error
        } finally {
          // Mark video as needing reinitialization regardless
          videoElement.dataset.hlsInitialized = 'false';
          pendingCleanups.delete(videoId);
          resolve();
        }
      }, 200); // Increased timeout for more reliable cleanup
    }
  });
}

// Clean up HLS instance when done - kept for backward compatibility
export function cleanupHLSVideo(videoElement: HTMLVideoElement): void {
  cleanupAccordionHLS(videoElement).catch(() => {
    // Silent error handling
  });
}
