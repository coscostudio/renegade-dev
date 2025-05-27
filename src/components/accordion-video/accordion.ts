import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import Hls from 'hls.js';

import { autoplayStateManager } from '../../utils/browserAutoplayUtils';
import { DirectLinkHandler } from '../../utils/directLinkHandler';
import { unmuteOverlayManager } from '../../utils/unmuteOverlayManager';
import {
  cleanupAccordionHLS,
  initializeAccordionHLS,
  isHLSCleanupPending,
  resetInitializationAttempts,
  startLoadingHLS,
} from '../video/hlsVideoLoader';
import { getAccordionVideoPlayer } from './index';
import { addAccordionStyles } from './styles';

gsap.registerPlugin(Flip, ScrollToPlugin);

// Track which videos have been initialized
const initializedVideos = new Set<string>();

// Track observer for viewport-based loading
let intersectionObserver: IntersectionObserver | null = null;

// Track active preparation attempts to prevent duplicates
const activePreparations = new Set<string>();

/**
 * Setup touch-specific handlers for accordion items
 * This addresses the "sticky hover" issue on mobile devices
 */
function setupTouchHandlers(): void {
  // Only run this on touch devices - simple detection that works on most devices
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;

  // Add a class to the body to enable targeting via CSS
  document.body.classList.add('touch-device');

  // Use event delegation instead of attaching listeners to each accordion item
  // This is much more efficient and reduces memory usage
  document.addEventListener(
    'touchstart',
    function (e) {
      // Find if a touch happened on an accordion item
      const accordionItem = (e.target as Element).closest('.js-accordion-item');

      // Remove hover state from all items first
      document.querySelectorAll('.js-accordion-item').forEach((item) => {
        item.classList.remove('hover-state');
      });

      // If touch was on an accordion item that's not active, add hover state
      if (accordionItem && !accordionItem.classList.contains('active')) {
        accordionItem.classList.add('hover-state');
      }
    },
    { passive: true }
  ); // Use passive listener for better scrolling performance

  // Add auto-reset functionality
  let hoverResetTimeoutId;

  // Function to reset hover state after delay
  const resetHoverAfterDelay = () => {
    if (hoverResetTimeoutId) {
      clearTimeout(hoverResetTimeoutId);
    }

    hoverResetTimeoutId = setTimeout(() => {
      document.querySelectorAll('.js-accordion-item.hover-state').forEach((item) => {
        if (!item.classList.contains('active')) {
          item.classList.remove('hover-state');
        }
      });
    }, 100);
  };

  // Reset hover state after touch ends
  document.addEventListener('touchend', resetHoverAfterDelay, { passive: true });

  // Reset on scroll finish
  let scrollTimeout;
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(resetHoverAfterDelay, 100);
    },
    { passive: true }
  );
}

/**
 * Initialize the accordion functionality
 */
export function initializeAccordion() {
  // Add required styles
  addAccordionStyles();

  // Create accordion loader elements for each item
  const accordionItems = document.querySelectorAll('.js-accordion-item');
  accordionItems.forEach((item) => {
    const accordionBody = item.querySelector('.js-accordion-body');
    if (accordionBody && !accordionBody.querySelector('.accordion-loader')) {
      const loader = document.createElement('div');
      loader.className = 'accordion-loader';
      loader.textContent = '';

      // CRITICAL: Pre-initialize all loaders with explicit hidden state
      loader.setAttribute(
        'style',
        'transition: none !important; ' +
          'opacity: 0 !important; ' +
          'visibility: hidden !important; ' +
          'pointer-events: none !important;'
      );

      accordionBody.appendChild(loader);

      // Force a reflow to ensure styles take effect
      loader.offsetHeight;

      // Mark this loader as pre-initialized
      loader.dataset.initialized = 'true';
    }
  });

  // Initialize accordion functionality
  const accordion = createAccordionBehavior();
  accordion.init();

  // Set up viewport-based preloading for visible videos
  setupViewportPreloading();

  // Set up simplified touch handlers
  setupTouchHandlers();
}

/**
 * Setup viewport-based preloading for videos that come into view
 * This only initializes the HLS but doesn't start loading segments
 */
function setupViewportPreloading() {
  // Clean up existing observer if any
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }

  // Find all event-video containers in accordion items
  const accordionVideos: HTMLElement[] = [];
  document.querySelectorAll('.js-accordion-item').forEach((item) => {
    const videoContainer = item.querySelector('.event-video');
    if (videoContainer) {
      accordionVideos.push(videoContainer as HTMLElement);
    }
  });

  if (accordionVideos.length === 0) return;

  // Create new observer with larger rootMargin to prepare videos before they're visible
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Found a video coming into view
          const container = entry.target;
          const videoElement =
            container.tagName === 'VIDEO'
              ? (container as HTMLVideoElement)
              : container.querySelector('video');

          if (videoElement) {
            // Only prepare HLS for videos coming into view
            const hlsUrl = videoElement.getAttribute('data-hls-src');
            if (hlsUrl && Hls.isSupported()) {
              // Generate a unique ID for tracking
              const videoId =
                videoElement.id || `video-${Math.random().toString(36).substring(2, 9)}`;
              if (!videoElement.id) videoElement.id = videoId;

              // Be more conservative about preloading
              const isLowData =
                (navigator as any).connection &&
                ((navigator as any).connection.saveData ||
                  (navigator as any).connection.effectiveType === 'slow-2g' ||
                  (navigator as any).connection.effectiveType === '2g');

              // Only preload if:
              // 1. Not already done
              // 2. Not on low-data connection
              // 3. User hasn't disabled preloading (respect user preferences)
              // 4. Video is actually close to viewport (stricter intersection)
              if (
                !initializedVideos.has(videoId) &&
                !videoElement.dataset.hlsInitialized &&
                !isLowData &&
                entry.intersectionRatio > 0.1 // Only if at least 10% visible
              ) {
                // Add a small delay to avoid preloading videos that quickly scroll past
                setTimeout(() => {
                  // Double-check the video is still in view
                  const rect = container.getBoundingClientRect();
                  const isStillNearViewport =
                    rect.bottom > -200 && rect.top < window.innerHeight + 200;

                  if (isStillNearViewport && !initializedVideos.has(videoId)) {
                    // Initialize but only load manifest, not segments - set true for preloadOnly
                    initializeAccordionHLS(videoElement, hlsUrl, true)
                      .then(() => {
                        videoElement.dataset.hlsInitialized = 'true';
                        initializedVideos.add(videoId);
                      })
                      .catch(() => {
                        // Error handled silently - don't retry preloading
                      });
                  }
                }, 500); // 500ms delay to avoid preloading during fast scrolling
              }
            }
          }

          // Stop observing once we've attempted to prepare this video
          intersectionObserver?.unobserve(container);
        }
      });
    },
    {
      // Use a smaller margin to be more conservative
      threshold: [0, 0.1], // Trigger at 0% and 10% visibility
      rootMargin: '100px 0px', // Reduced from 200px to be more conservative
    }
  );

  // Start observing each video container
  accordionVideos.forEach((video) => {
    intersectionObserver?.observe(video);
  });
}

/**
 * Get the viewport height as a CSS value
 */
function getViewportHeight(): string {
  // Try to use the more modern dvh units first if supported
  if (CSS.supports('height', '100dvh')) {
    return '101dvh';
  }

  // For iOS Safari which sometimes doesn't correctly report window.innerHeight
  // due to address bar considerations
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  if (iOS) {
    // Use the iOS-specific technique
    return `${window.innerHeight * 1.01}px`;
  }

  // Fallback to viewport units with a little extra to ensure full coverage
  return 'calc(100vh + 10px)';
}

/**
 * Get responsive padding value for accordion headers
 */
function getResponsivePadding(): string {
  if (window.innerWidth >= 1024) {
    return '4rem'; // Large screens
  }
  if (window.innerWidth >= 768) {
    return '4rem'; // Tablets
  }
  return '4rem'; // Mobile
}

/**
 * Ensure the element is properly positioned in the viewport
 */
function verifyPosition($element: JQuery<HTMLElement>): void {
  const currentTop = $element.offset()?.top;
  if (currentTop && Math.abs(window.pageYOffset - currentTop) > 2) {
    gsap.to(window, {
      duration: 0.5,
      scrollTo: currentTop,
      ease: 'expo.out',
    });
  }
}

/**
 * Close accordion gracefully when video initialization fails
 */
function closeAccordionOnFailure(
  $accordionItem: JQuery<HTMLElement>,
  reason: string = 'Video initialization timeout'
): void {
  // CRITICAL: Immediately remove ALL video-related classes to ensure borders are restored
  $accordionItem.removeClass('active video-playing');

  // Also remove from the raw DOM element to be absolutely sure
  const accordionElement = $accordionItem[0];
  if (accordionElement) {
    accordionElement.classList.remove('active', 'video-playing');
  }

  // Clean up unmute overlay
  unmuteOverlayManager.cleanup();

  // Clear URL
  DirectLinkHandler.clearAccordionSlug();

  // Find accordion elements
  const accordionBody = $accordionItem.find('.js-accordion-body')[0];
  const accordionHeader = $accordionItem.find('.js-accordion-header')[0];
  const loaderElement = $accordionItem.find('.accordion-loader')[0];

  // Hide loader immediately and completely
  if (loaderElement) {
    loaderElement.style.opacity = '0';
    loaderElement.style.visibility = 'hidden';
    loaderElement.style.transition = 'none';
    loaderElement.classList.remove('is-loading');

    // Clear any pending loader timeouts
    if ((loaderElement as any)._loaderTimerId) {
      clearTimeout((loaderElement as any)._loaderTimerId);
    }
  }

  // Find and clean up any video elements
  const videoElement = $accordionItem.find('video')[0] as HTMLVideoElement;
  if (videoElement) {
    // Remove video-playing class from accordion item (redundant but thorough)
    const accordionItem = videoElement.closest('.js-accordion-item');
    if (accordionItem) {
      accordionItem.classList.remove('video-playing');
    }

    // Clean up video state
    try {
      videoElement.pause();
      videoElement.currentTime = 0;
      videoElement.style.opacity = '0';
    } catch (e) {
      // Ignore video cleanup errors
    }

    // Clean up any stored references
    if ((videoElement as any)._loaderTimerId) {
      clearTimeout((videoElement as any)._loaderTimerId);
      delete (videoElement as any)._loaderTimerId;
    }
    if ((videoElement as any)._bufferingHandler) {
      videoElement.removeEventListener('waiting', (videoElement as any)._bufferingHandler);
      delete (videoElement as any)._bufferingHandler;
    }
    if ((videoElement as any)._playingHandler) {
      videoElement.removeEventListener('playing', (videoElement as any)._playingHandler);
      delete (videoElement as any)._playingHandler;
    }
  }

  // Force a repaint to ensure classes are properly applied
  if (accordionElement) {
    accordionElement.offsetHeight; // Force reflow
  }

  // Animate accordion closed with quick timing
  const closeTl = gsap.timeline({
    onComplete: () => {
      // Double-check that video-playing class is removed after animation
      $accordionItem.removeClass('video-playing');
      if (accordionElement) {
        accordionElement.classList.remove('video-playing');
      }
    },
  });

  closeTl
    .to(
      accordionHeader,
      {
        paddingTop: '0rem',
        duration: 0.5,
        ease: 'expo.out',
      },
      0
    )
    .to(
      accordionBody,
      {
        height: 0,
        duration: 0.5,
        ease: 'expo.out',
        onComplete: () => {
          gsap.set(accordionBody, {
            clearProps: 'all',
            display: 'none',
          });

          // Final cleanup - ensure video-playing class is definitely removed
          $accordionItem.removeClass('active video-playing');
          if (accordionElement) {
            accordionElement.classList.remove('active', 'video-playing');
          }
        },
      },
      0
    );
}

/**
 * Prepare a video for playback with aggressive timeout handling
 */
export async function prepareVideo(
  videoElement: HTMLVideoElement | null,
  loaderElement: HTMLElement | null
): Promise<HTMLVideoElement | null> {
  if (!videoElement) {
    return null;
  }

  // Handle case where videoElement could be a container div
  if (!(videoElement instanceof HTMLVideoElement)) {
    // If it's a container, try to find the video element inside
    const actualVideo = videoElement.querySelector('video');
    if (actualVideo) {
      videoElement = actualVideo;
    } else {
      return null;
    }
  }

  const videoId = videoElement.id || `video-${Math.random().toString(36).substring(2, 9)}`;
  if (!videoElement.id) videoElement.id = videoId;

  // Prevent duplicate preparations
  if (activePreparations.has(videoId)) {
    return null;
  }

  activePreparations.add(videoId);

  // AGGRESSIVE MASTER TIMEOUT - if nothing happens in 15 seconds, force close accordion
  const masterTimeoutId = setTimeout(() => {
    activePreparations.delete(videoId);

    const accordionItem = videoElement.closest('.js-accordion-item');
    if (accordionItem) {
      closeAccordionOnFailure($(accordionItem), 'Master timeout - 15 seconds');
    }
  }, 15000);

  try {
    // Clear any existing timeouts
    if ((videoElement as any)._loaderTimerId) {
      clearTimeout((videoElement as any)._loaderTimerId);
      delete (videoElement as any)._loaderTimerId;
    }

    // Clear any existing event listeners
    if ((videoElement as any)._bufferingHandler) {
      videoElement.removeEventListener('waiting', (videoElement as any)._bufferingHandler);
      delete (videoElement as any)._bufferingHandler;
    }

    if ((videoElement as any)._playingHandler) {
      videoElement.removeEventListener('playing', (videoElement as any)._playingHandler);
      delete (videoElement as any)._playingHandler;
    }

    // Force opacity to 0 initially
    videoElement.style.opacity = '0';
    videoElement.style.transition = 'opacity 0.75s cubic-bezier(0.16, 1, 0.3, 1)';

    // LOADER HANDLING - Direct JavaScript approach
    if (loaderElement) {
      // Store the loader element for later use
      (videoElement as any)._loaderElement = loaderElement;

      // Force reset the loader state first
      loaderElement.setAttribute(
        'style',
        'transition: none !important; ' +
          'opacity: 0 !important; ' +
          'visibility: hidden !important; ' +
          'pointer-events: none !important;'
      );
      loaderElement.classList.remove('is-loading');

      // Force a reflow to ensure styles are applied immediately
      loaderElement.offsetHeight;

      // Record when we started the loader display process
      (videoElement as any)._loaderStartTime = Date.now();

      // Create a promise to track video ready state
      const videoReadyPromise = new Promise<void>((resolve) => {
        if (videoElement.readyState >= 3) {
          // Video is already ready enough to play
          resolve();
        } else {
          // Wait for video to be ready enough
          videoElement.addEventListener('canplay', () => resolve(), { once: true });
        }
      });

      // Schedule delayed loader appearance
      (videoElement as any)._loaderTimerId = setTimeout(() => {
        // Check if video is already playing or ready before showing loader
        if (videoElement.readyState < 3 && !videoElement.paused) {
          // Reset the forced styles first to allow our new styles to work
          loaderElement.removeAttribute('style');

          // Apply new styles with a fresh slate
          loaderElement.style.transition = 'opacity 1.0s cubic-bezier(0.16, 1, 0.3, 1)';
          loaderElement.style.visibility = 'visible';
          loaderElement.style.opacity = '1';
          loaderElement.classList.add('is-loading');

          // Make sure this loader is marked as having been properly shown after delay
          loaderElement.dataset.delayDisplayed = 'true';

          // Set up immediate fade out if video becomes ready
          videoReadyPromise.then(() => {
            if (loaderElement.style.opacity === '1') {
              // Fast fade-out for loader
              loaderElement.style.transition = 'opacity 0.1s ease-out';
              loaderElement.style.opacity = '0';

              setTimeout(() => {
                loaderElement.style.visibility = 'hidden';
                loaderElement.classList.remove('is-loading');
              }, 100);
            }
          });
        }
      }, 500);
    }

    // Reset video state completely
    videoElement.pause();
    videoElement.currentTime = 0;

    // Important: Ensure video is not muted and volume is set to 1
    videoElement.muted = false;
    videoElement.volume = 1;

    // Set common video properties
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline', '');
    videoElement.loop = true;
    videoElement.crossOrigin = 'anonymous';

    // Check for HLS source
    const hlsUrl = videoElement.getAttribute('data-hls-src');
    if (!hlsUrl) {
      clearTimeout(masterTimeoutId);
      activePreparations.delete(videoId);
      return null; // No HLS source available
    }

    // Reset initialization attempts if this is a fresh preparation
    resetInitializationAttempts(videoElement);

    // Check if this video has already been initialized for HLS
    let shouldInitialize = true;

    if (videoElement.dataset.hlsInitialized === 'true') {
      // If initialized but not yet loading (was preloaded), start loading now
      startLoadingHLS(videoElement);
      shouldInitialize = false;
    } else if (isHLSCleanupPending(videoElement)) {
      // If cleanup is pending, wait for it to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
      shouldInitialize = true;
    }

    if (shouldInitialize) {
      try {
        // Start HLS initialization with retry logic
        const hlsPromise = initializeAccordionHLS(videoElement, hlsUrl, false, 2); // Reduced to 2 retries

        // Track initialization
        initializedVideos.add(videoId);
        videoElement.dataset.hlsInitialized = 'true';

        // While HLS is initializing, also prepare for immediate playback
        videoElement.preload = 'auto';

        // Wait for HLS initialization to complete
        await hlsPromise;
      } catch (error) {
        clearTimeout(masterTimeoutId);
        activePreparations.delete(videoId);

        // Find the accordion item for this video and close it
        const accordionItem = videoElement.closest('.js-accordion-item');
        if (accordionItem) {
          const $accordionItem = $(accordionItem);
          closeAccordionOnFailure($accordionItem, 'HLS initialization failed');
        }

        throw error; // Re-throw to be handled by caller
      }
    }

    // Prepare for playback but don't start yet
    videoElement.currentTime = 0;

    // Get video player and activate
    const videoPlayer = getAccordionVideoPlayer();
    if (videoPlayer) {
      videoPlayer.activateVideo(videoElement);
    }

    // Double-check opacity is 0 and unmuted
    videoElement.style.opacity = '0';
    videoElement.muted = false;
    videoElement.volume = 1;

    clearTimeout(masterTimeoutId);
    activePreparations.delete(videoId);
    return videoElement;
  } catch (error) {
    clearTimeout(masterTimeoutId);
    activePreparations.delete(videoId);

    // In case of errors, cancel the loader timeout
    if ((videoElement as any)._loaderTimerId) {
      clearTimeout((videoElement as any)._loaderTimerId);
      delete (videoElement as any)._loaderTimerId;
    }

    if (loaderElement) {
      loaderElement.style.opacity = '0';
      loaderElement.style.visibility = 'hidden';
      loaderElement.classList.remove('is-loading');
    }

    // Re-throw to be handled by caller
    throw error;
  }
}

// Modified playAndFadeInVideo function with additional safety checks and unmute functionality
export function playAndFadeInVideo(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) return;

  const videoId = videoElement.id || 'unknown';

  // ADDITIONAL SAFETY: If video doesn't start playing within 10 seconds, close accordion
  const playbackTimeoutId = setTimeout(() => {
    const accordionItem = videoElement.closest('.js-accordion-item');
    if (accordionItem && accordionItem.classList.contains('active')) {
      closeAccordionOnFailure($(accordionItem), 'Video playback timeout - 10 seconds');
    }
  }, 10000);

  // Clear timeout when video actually starts playing
  const clearPlaybackTimeout = () => {
    clearTimeout(playbackTimeoutId);
  };

  // Ensure opacity is 0 before starting
  videoElement.style.opacity = '0';

  // Refresh autoplay state detection to get the most current state
  autoplayStateManager.refreshDirectLinkDetection();

  // Check if we should start muted due to autoplay restrictions
  const shouldStartMuted = autoplayStateManager.shouldStartMuted();

  // Set initial audio state - CRITICAL: Always start muted for Safari direct links
  if (shouldStartMuted) {
    videoElement.muted = true;
    videoElement.volume = 0;
    autoplayStateManager.setUnmutePending(true);
  } else {
    videoElement.muted = false;
    videoElement.volume = 0; // Start at 0 for fade-in effect
  }

  // Get the loader element reference if it exists
  const loaderElement = (videoElement as any)._loaderElement as HTMLElement | undefined;

  // Find the accordion item container for border management
  const accordionItem = videoElement.closest('.js-accordion-item') as HTMLElement;

  // Get loader start time to calculate elapsed time
  const loaderStartTime = (videoElement as any)._loaderStartTime || Date.now();
  const timeSinceStart = Date.now() - loaderStartTime;
  const minimumLoaderTime = 500 + 400; // 500ms delay + buffer time

  // Clear any pending loader timeout but respect minimum time
  if ((videoElement as any)._loaderTimerId) {
    // Don't clear timeout if we haven't reached minimum time
    if (timeSinceStart < 500) {
      // Let the timeout continue to run
    } else {
      clearTimeout((videoElement as any)._loaderTimerId);
      delete (videoElement as any)._loaderTimerId;
    }
  }

  // Track if video is actually playing successfully
  let videoActuallyPlaying = false;

  // Set up fade-in with GSAP for better control
  const fadeIn = (isActuallyPlaying: boolean = false) => {
    clearPlaybackTimeout(); // Video is ready, clear the timeout

    // Mark video as actually playing
    if (isActuallyPlaying && accordionItem) {
      accordionItem.classList.add('video-playing');
    }

    // Fade in video opacity
    gsap.to(videoElement, {
      opacity: 1,
      duration: 0.75, // Longer fade for visual appeal
      ease: 'expo.inOut',
    });

    // Handle audio fade-in separately based on muted state
    if (shouldStartMuted) {
      // Video starts muted - show unmute overlay AFTER video is visible
      if (accordionItem) {
        // Small delay to ensure video is visible first
        setTimeout(() => {
          unmuteOverlayManager.showUnmuteOverlay(videoElement, accordionItem, () => {
            // Unmute callback - fade in audio with same transition style
            autoplayStateManager.markRealUserInteraction(); // Use real interaction method
            autoplayStateManager.setUnmutePending(false);

            videoElement.muted = false;
            gsap.to(videoElement, {
              volume: 1,
              duration: 0.75,
              ease: 'expo.inOut',
              onComplete: () => {
                // Double check unmuted state after fade completes
                videoElement.muted = false;

                // Handle Safari-specific issue with muted videos
                if (videoElement.muted) {
                  videoElement.muted = false;
                  videoElement.volume = 1;
                }
              },
            });
          });
        }, 300); // Small delay to ensure video fade-in has started
      }
    } else {
      // Normal audio fade-in
      gsap.to(videoElement, {
        volume: 1,
        duration: 0.75,
        ease: 'expo.inOut',
        onComplete: () => {
          // Double check unmuted state after fade completes
          videoElement.muted = false;

          // Handle Safari-specific issue with muted videos
          if (videoElement.muted) {
            videoElement.muted = false;
            videoElement.volume = 1;
          }
        },
      });
    }

    // Only fade out loader if minimum time has passed
    if (loaderElement) {
      // Calculate current time since loader start
      const currentElapsed = Date.now() - loaderStartTime;

      if (currentElapsed < minimumLoaderTime) {
        // Wait until minimum time has passed before fading out
        const waitTime = minimumLoaderTime - currentElapsed;
        setTimeout(
          () => {
            fadeOutLoader();
          },
          Math.max(0, waitTime)
        );
      } else {
        // Minimum time already passed, fade out immediately
        fadeOutLoader();
      }
    }

    // Helper function to fade out the loader
    function fadeOutLoader() {
      if (!loaderElement) return;

      // Fast fade-out for loader
      loaderElement.style.transition = 'opacity 0.1s ease-out';
      loaderElement.style.opacity = '0';

      // After fade completes, hide completely
      setTimeout(() => {
        loaderElement.style.visibility = 'hidden';
        loaderElement.classList.remove('is-loading');
      }, 250); // Match transition duration
    }
  };

  // Add stall detection
  const onBuffering = () => {
    if (loaderElement) {
      // Quickly show loader again if video stalls
      loaderElement.style.transition = 'opacity 0.75s ease-in';
      loaderElement.style.visibility = 'visible';
      loaderElement.style.opacity = '1';
      loaderElement.classList.add('is-loading');
    }
  };

  const onPlaying = () => {
    clearPlaybackTimeout(); // Video started playing, clear timeout
    videoActuallyPlaying = true; // Mark as actually playing

    if (loaderElement && loaderElement.style.opacity === '1') {
      // Hide loader with quick fade when video resumes playing
      loaderElement.style.transition = 'opacity 0.1s ease-out';
      loaderElement.style.opacity = '0';

      // After fade completes, hide completely
      setTimeout(() => {
        loaderElement.style.visibility = 'hidden';
      }, 250);
    }
  };

  // Clear existing handlers before adding new ones
  if ((videoElement as any)._bufferingHandler) {
    videoElement.removeEventListener('waiting', (videoElement as any)._bufferingHandler);
  }

  if ((videoElement as any)._playingHandler) {
    videoElement.removeEventListener('playing', (videoElement as any)._playingHandler);
  }

  // Store handlers for cleanup
  (videoElement as any)._bufferingHandler = onBuffering;
  (videoElement as any)._playingHandler = onPlaying;

  // Add event listeners
  videoElement.addEventListener('waiting', onBuffering);
  videoElement.addEventListener('playing', onPlaying);

  // Play with error handling - updated for muted start logic
  try {
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Video started playing successfully
          videoActuallyPlaying = true;
          fadeIn(true); // Pass true since video is actually playing
        })
        .catch((playError) => {
          // If playback fails and we weren't already muted, try muted
          if (!shouldStartMuted) {
            videoElement.muted = true;
            videoElement.volume = 0;

            videoElement
              .play()
              .then(() => {
                videoActuallyPlaying = true;
                fadeIn(true); // Pass true since video is playing

                // For this fallback case, gradually unmute after playing (not Safari direct link case)
                setTimeout(() => {
                  // Unmute the video
                  videoElement.muted = false;

                  // Fade in volume
                  gsap.to(videoElement, {
                    volume: 1,
                    duration: 0.5,
                    ease: 'expo.out',
                    onComplete: () => {
                      // Ensure unmuted state one final time
                      videoElement.muted = false;
                    },
                  });
                }, 500);
              })
              .catch((mutedPlayError) => {
                // CRITICAL FIX: Don't call fadeIn here - instead close accordion
                // Hide loader in case of failure
                if (loaderElement) {
                  loaderElement.style.opacity = '0';
                  loaderElement.style.visibility = 'hidden';
                  loaderElement.classList.remove('is-loading');
                }

                // Close accordion immediately when video completely fails
                setTimeout(() => {
                  const accordionItem = videoElement.closest('.js-accordion-item');
                  if (accordionItem && accordionItem.classList.contains('active')) {
                    closeAccordionOnFailure(
                      $(accordionItem),
                      'Video playback failed - both normal and muted attempts failed'
                    );
                  }
                }, 500);
              });
          } else {
            // We were already muted and still failed - this shouldn't happen for Safari
            // Try one more time with explicit Safari handling
            videoElement.muted = true;
            videoElement.volume = 0;
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');

            setTimeout(() => {
              videoElement
                .play()
                .then(() => {
                  videoActuallyPlaying = true;
                  fadeIn(true);
                })
                .catch((finalError) => {
                  // Hide loader and close accordion
                  if (loaderElement) {
                    loaderElement.style.opacity = '0';
                    loaderElement.style.visibility = 'hidden';
                    loaderElement.classList.remove('is-loading');
                  }

                  setTimeout(() => {
                    const accordionItem = videoElement.closest('.js-accordion-item');
                    if (accordionItem && accordionItem.classList.contains('active')) {
                      closeAccordionOnFailure(
                        $(accordionItem),
                        'Video playback failed - Safari muted play attempt failed'
                      );
                    }
                  }, 500);
                });
            }, 100);
          }
        });
    } else {
      // Older browsers without Promise support - assume it worked
      videoActuallyPlaying = true;
      fadeIn(true);
    }
  } catch (error) {
    // CRITICAL FIX: Don't call fadeIn here - instead close accordion
    // Hide loader in case of error
    if (loaderElement) {
      loaderElement.style.opacity = '0';
      loaderElement.style.visibility = 'hidden';
      loaderElement.classList.remove('is-loading');
    }

    // Close accordion when video fails to play
    setTimeout(() => {
      const accordionItem = videoElement.closest('.js-accordion-item');
      if (accordionItem && accordionItem.classList.contains('active')) {
        closeAccordionOnFailure($(accordionItem), 'Video play threw an exception');
      }
    }, 500);
  }
}

export function fadeOutVideo(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) return;

  // Find the accordion item container for border management
  const accordionItem = videoElement.closest('.js-accordion-item') as HTMLElement;

  // REMOVE VIDEO-PLAYING CLASS IMMEDIATELY WHEN FADE-OUT STARTS
  if (accordionItem) {
    accordionItem.classList.remove('video-playing');
  }

  // Clean up unmute overlay
  unmuteOverlayManager.cleanup();

  // Cancel any pending loader timeout
  if ((videoElement as any)._loaderTimerId) {
    clearTimeout((videoElement as any)._loaderTimerId);
    delete (videoElement as any)._loaderTimerId;
  }

  // Clean up buffering event listeners
  if ((videoElement as any)._bufferingHandler) {
    videoElement.removeEventListener('waiting', (videoElement as any)._bufferingHandler);
    delete (videoElement as any)._bufferingHandler;
  }

  if ((videoElement as any)._playingHandler) {
    videoElement.removeEventListener('playing', (videoElement as any)._playingHandler);
    delete (videoElement as any)._playingHandler;
  }

  // Hide loader if it exists with immediate fade
  if ((videoElement as any)._loaderElement) {
    const loaderElement = (videoElement as any)._loaderElement as HTMLElement;
    loaderElement.style.transition = 'opacity 0.25s ease-out';
    loaderElement.style.opacity = '0';

    // Quickly hide after fade
    setTimeout(() => {
      loaderElement.style.visibility = 'hidden';
      loaderElement.classList.remove('is-loading');
    }, 250);
  }

  // Use GSAP for better control over the fade-out
  gsap.to(videoElement, {
    opacity: 0,
    volume: 0,
    duration: 0.75,
    ease: 'expo.inOut',
    onComplete: async () => {
      // Check if we're using HLS
      const isUsingHLS = videoElement.getAttribute('data-hls-src') !== null;

      // Special handling for HLS videos to prevent errors
      if (isUsingHLS) {
        // Use our optimized cleanup for HLS
        await cleanupAccordionHLS(videoElement);
      }

      // Directly pause the video when fade completes
      videoElement.pause();
      videoElement.currentTime = 0;

      // Reset video properties to make sure they're correct for next play
      videoElement.muted = false;
      videoElement.volume = 1;

      // Also notify the video player
      const videoPlayer = getAccordionVideoPlayer();
      if (videoPlayer) {
        videoPlayer.deactivateVideo(videoElement);
      }
    },
  });
}

/**
 * Fade out only the audio for videos during page transitions
 * @param videoElement Video element to fade audio for
 */
export function fadeOutAudioOnly(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) return;

  // Find the accordion item container for border management
  const accordionItem = videoElement.closest('.js-accordion-item') as HTMLElement;

  // REMOVE VIDEO-PLAYING CLASS WHEN AUDIO FADES OUT
  if (accordionItem) {
    accordionItem.classList.remove('video-playing');
  }

  // Clean up unmute overlay
  unmuteOverlayManager.cleanup();

  // Cancel any pending loader timeout
  if ((videoElement as any)._loaderTimerId) {
    clearTimeout((videoElement as any)._loaderTimerId);
    delete (videoElement as any)._loaderTimerId;
  }

  // Clean up buffering event listeners
  if ((videoElement as any)._bufferingHandler) {
    videoElement.removeEventListener('waiting', (videoElement as any)._bufferingHandler);
    delete (videoElement as any)._bufferingHandler;
  }

  if ((videoElement as any)._playingHandler) {
    videoElement.removeEventListener('playing', (videoElement as any)._playingHandler);
    delete (videoElement as any)._playingHandler;
  }

  // Hide loader if it exists
  if ((videoElement as any)._loaderElement) {
    ((videoElement as any)._loaderElement as HTMLElement).classList.remove('is-loading');
  }

  // Use GSAP for better control over the audio fade
  gsap.to(videoElement, {
    volume: 0,
    duration: 1.25,
    ease: 'expo.inOut',
    onComplete: async () => {
      // Check if we're using HLS
      const isUsingHLS = videoElement.getAttribute('data-hls-src') !== null;

      // Special handling for HLS videos to prevent errors
      if (isUsingHLS) {
        // Use our optimized cleanup for HLS
        await cleanupAccordionHLS(videoElement);
      }

      // Directly pause the video when fade completes
      videoElement.pause();
      videoElement.currentTime = 0;

      // Reset audio properties for future playback
      videoElement.muted = false;
      videoElement.volume = 1;

      // Also notify the video player
      const videoPlayer = getAccordionVideoPlayer();
      if (videoPlayer) {
        videoPlayer.deactivateVideo(videoElement);
      }
    },
  });
}

/**
 * Reset any video currently playing
 */
export function resetVideo(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) return;

  // Find the accordion item container for border management
  const accordionItem = videoElement.closest('.js-accordion-item') as HTMLElement;

  // REMOVE VIDEO-PLAYING CLASS WHEN RESETTING
  if (accordionItem) {
    accordionItem.classList.remove('video-playing');
  }

  // Clean up unmute overlay
  unmuteOverlayManager.cleanup();

  // Make sure we completely stop the video
  videoElement.pause();
  videoElement.currentTime = 0;

  // Also clean up HLS if needed
  const isUsingHLS = videoElement.getAttribute('data-hls-src') !== null;
  if (isUsingHLS) {
    cleanupAccordionHLS(videoElement);
  }

  // Hide the video
  videoElement.style.opacity = '0';

  // Reset audio state
  videoElement.muted = false;
  videoElement.volume = 1;
}

/**
 * Create the accordion behavior controller
 */
function createAccordionBehavior() {
  let isAnimating = false;

  return {
    init() {
      // Store a reference to the accordion object
      const self = this;

      // Add click handler with real user interaction detection
      $('.js-accordion-item').on('click', function (event) {
        if (isAnimating) return;

        // Check if this is a real user click vs programmatic
        // Real user clicks will have originalEvent and/or proper event coordinates
        // Also check for our programmatic flag
        const isProgrammatic =
          (event as any).isProgrammatic ||
          (event.originalEvent && (event.originalEvent as any).isProgrammatic);

        const isRealUserClick =
          !isProgrammatic &&
          event.originalEvent &&
          event.originalEvent.isTrusted !== false &&
          (typeof event.clientX === 'number' || typeof event.originalEvent.clientX === 'number');

        // Only mark user interaction for real user clicks
        if (isRealUserClick) {
          autoplayStateManager.markRealUserInteraction();
        }

        // 'this' now correctly refers to the clicked DOM element
        self.toggle($(this));
      });

      // Improved hover preloading that only initializes HLS without playing
      $('.js-accordion-item').on('mouseenter', function () {
        if (isAnimating) return;
        if ($(this).hasClass('active')) return; // Skip if already active

        const eventVideoContainer = $(this).find('.event-video')[0];
        const videoElement = eventVideoContainer
          ? eventVideoContainer.querySelector('video')
          : null;

        if (videoElement) {
          // Check if video has an HLS source
          const hlsUrl = videoElement.getAttribute('data-hls-src');
          if (hlsUrl && Hls.isSupported()) {
            // Generate a unique ID for tracking if not already present
            const videoId =
              videoElement.id || `video-${Math.random().toString(36).substring(2, 9)}`;
            if (!videoElement.id) videoElement.id = videoId;

            // Check if cleanup is pending before attempting initialization
            if (isHLSCleanupPending(videoElement)) {
              return; // Skip initialization if cleanup is in progress
            }

            // Only initialize if not already done
            if (!initializedVideos.has(videoId) && !videoElement.dataset.hlsInitialized) {
              // Pass true for preloadOnly parameter - lightweight initialization
              initializeAccordionHLS(videoElement, hlsUrl, true)
                .then(() => {
                  videoElement.dataset.hlsInitialized = 'true';
                  initializedVideos.add(videoId);

                  // Start loading if they keep hovering for at least 500ms
                  setTimeout(() => {
                    if ($(this).is(':hover') && !$(this).hasClass('active')) {
                      startLoadingHLS(videoElement);
                    }
                  }, 500);
                })
                .catch(() => {
                  // Error handled silently
                });
            } else if (videoElement.dataset.hlsInitialized === 'true') {
              // If already initialized, start loading segments after brief hover
              setTimeout(() => {
                if ($(this).is(':hover') && !$(this).hasClass('active')) {
                  startLoadingHLS(videoElement);
                }
              }, 300);
            }
          }
        }
      });
    },

    toggle($clicked) {
      if (isAnimating) return;
      isAnimating = true;

      // DON'T mark user interaction immediately - we need to determine if this is a real user click
      // or a programmatic click from direct link handling

      // Simply remove hover-state class from all items - no need for complex selectors
      document.querySelectorAll('.hover-state').forEach((item) => {
        item.classList.remove('hover-state');
      });

      const accordionBody = $clicked.find('.js-accordion-body')[0];
      const eventVideoContainer = $clicked.find('.event-video')[0];
      const videoElement = eventVideoContainer ? eventVideoContainer.querySelector('video') : null;
      const loaderElement = $clicked.find('.accordion-loader')[0];
      const accordionHeader = $clicked.find('.js-accordion-header')[0];
      const isOpening = !$clicked.hasClass('active');
      let resizeObserver: ResizeObserver;

      // Animation timing parameters - KEEP ORIGINAL VALUES
      const animDuration = 1;
      const animEase = 'expo.inOut';

      if (isOpening) {
        // Set URL slug for social sharing
        const accordionId = $clicked.attr('id');
        if (accordionId) {
          DirectLinkHandler.setAccordionSlug(accordionId);
        }

        // CRITICAL FIX: Immediately hide loader before any animations start
        if (loaderElement) {
          // Force styles with !important to prevent inheritance issues
          loaderElement.setAttribute(
            'style',
            'transition: none !important; ' +
              'opacity: 0 !important; ' +
              'visibility: hidden !important; ' +
              'pointer-events: none !important;'
          );
          loaderElement.classList.remove('is-loading');

          // Force a reflow to ensure styles take effect immediately
          loaderElement.offsetHeight;
        }

        const $openItem = $('.js-accordion-item.active');
        if ($openItem.length) {
          // Clean up unmute overlay for the currently open item
          unmuteOverlayManager.cleanup();

          // Find video element for the currently open accordion
          const openEventVideoContainer = $openItem.find('.event-video')[0];
          const openVideo = openEventVideoContainer
            ? openEventVideoContainer.querySelector('video')
            : null;
          const openBody = $openItem.find('.js-accordion-body')[0];
          const openHeader = $openItem.find('.js-accordion-header')[0];

          // REMOVE VIDEO-PLAYING CLASS FROM CLOSING ACCORDION
          $openItem.removeClass('video-playing');

          // DON'T CLEAR URL WHEN SWITCHING - new accordion already set its URL above

          // CRITICAL: Precisely determine relationship between the accordions
          const clickedIndex = $('.js-accordion-item').index($clicked);
          const openIndex = $('.js-accordion-item').index($openItem);
          const isBelowOpen = clickedIndex > openIndex;

          // Get initial measurements
          const openBodyHeight = $(openBody).height() || 0;
          const initialClickedTop = $clicked.offset()?.top || 0;

          // Remember the starting scroll position
          const initialScrollY = window.scrollY;

          // Create master timeline
          const masterTl = gsap.timeline({
            onComplete: () => {
              isAnimating = false;

              // Exactly position item at top when done
              if (isBelowOpen) {
                window.scrollTo(0, $clicked.offset()?.top || 0);
              }
            },
          });

          // Create closing timeline
          const closeTl = gsap.timeline();

          // 1. Start video fade-out synchronized with accordion closing
          if (openVideo) {
            fadeOutVideo(openVideo);
          }

          // 2. Setup closing animations
          closeTl
            .to(
              openHeader,
              {
                paddingTop: '0rem',
                duration: animDuration,
                ease: animEase,
              },
              0
            )
            .to(
              openBody,
              {
                height: 0,
                duration: animDuration,
                ease: animEase,
                onComplete: () => {
                  $openItem.removeClass('active');
                  gsap.set(openBody, { clearProps: 'all', display: 'none' });
                },
              },
              0
            );

          // 3. Prepare the new accordion for opening
          $clicked.addClass('active');
          gsap.set(accordionBody, {
            display: 'block',
            height: 0,
          });

          // 4. Prepare the new video while accordion is animating - WITH ERROR HANDLING
          if (videoElement) {
            // Start loading the video immediately with error handling
            prepareVideo(videoElement, loaderElement)
              .then((video) => {
                if (video) {
                  playAndFadeInVideo(video);
                }
              })
              .catch((error) => {
                // Video preparation failed - accordion should already be closed by prepareVideo function
                // Reset animation state
                isAnimating = false;
              });
          }

          // 5. RESTORE ORIGINAL FLIP ANIMATION LOGIC
          const openState = Flip.getState(accordionBody);
          gsap.set(accordionBody, { height: getViewportHeight() });

          // Handle the opening animation - ORIGINAL SMOOTH LOGIC
          const openTl = gsap.timeline();
          openTl
            .to(
              accordionHeader,
              {
                paddingTop: getResponsivePadding(),
                duration: animDuration,
                ease: animEase,
              },
              0
            )
            .add(
              Flip.from(openState, {
                duration: animDuration,
                ease: animEase,
                absoluteOnLeave: true,
                onComplete: () => {
                  resizeObserver = new ResizeObserver(() => {
                    if ($clicked.hasClass('active')) {
                      gsap.set(accordionBody, { height: getViewportHeight() });
                    }
                  });
                  resizeObserver.observe(document.documentElement);
                },
              }),
              0
            );

          // 6. Add opening and closing animations to the master timeline
          masterTl.add(closeTl, 0);
          masterTl.add(openTl, 0);

          // 7. Special scroll handling for items below the open one
          if (isBelowOpen) {
            // Calculate target offset - where the item will be after the one above closes
            // Add a responsive adjustment to position it exactly at the top
            const remToPixel = parseFloat(getComputedStyle(document.documentElement).fontSize);

            // Get adjustment based on viewport width
            let adjustmentRem;
            const viewportWidth = window.innerWidth;

            if (viewportWidth <= 480) {
              adjustmentRem = 7; // Mobile devices
            } else if (viewportWidth <= 768) {
              adjustmentRem = 6; // Tablets
            } else if (viewportWidth <= 1024) {
              adjustmentRem = 5; // Small desktops
            } else {
              adjustmentRem = 4; // Large desktops
            }

            const pixelAdjustment = adjustmentRem * remToPixel;

            const targetOffset = initialClickedTop - openBodyHeight + pixelAdjustment;

            // Create a dedicated timeline just for smooth scrolling with proper easing
            const scrollTl = gsap.timeline();
            scrollTl.fromTo(
              window,
              { scrollTo: { y: initialScrollY, autoKill: false } },
              {
                scrollTo: { y: targetOffset, autoKill: false },
                duration: animDuration,
                ease: animEase,
              }
            );

            // Add the scroll timeline to the master
            masterTl.add(scrollTl, 0);
          } else {
            // For items above or at the same level, just scroll to their current position
            masterTl.add(
              gsap.to(window, {
                scrollTo: { y: initialClickedTop, autoKill: false },
                duration: animDuration,
                ease: animEase,
              }),
              0
            );
          }
        } else {
          // No open accordion to close first, just open this one
          const targetPosition = $clicked.offset()?.top;

          // Prepare the new video - WITH ERROR HANDLING
          if (videoElement) {
            prepareVideo(videoElement, loaderElement)
              .then((video) => {
                if (video) {
                  playAndFadeInVideo(video);
                }
              })
              .catch((error) => {
                // Video preparation failed - accordion should already be closed by prepareVideo function
                // Reset animation state
                isAnimating = false;
              });
          }

          const openTl = gsap.timeline({
            onComplete: () => {
              isAnimating = false;
            },
          });

          $clicked.addClass('active');
          gsap.set(accordionBody, {
            display: 'block',
            height: 0,
          });

          // RESTORE ORIGINAL FLIP ANIMATION
          const openState = Flip.getState(accordionBody);
          gsap.set(accordionBody, { height: getViewportHeight() });

          // Synchronized animations that finish together - ORIGINAL LOGIC
          openTl
            .to(
              window,
              {
                scrollTo: {
                  y: targetPosition,
                  autoKill: false,
                },
                duration: animDuration,
                ease: animEase,
              },
              0
            )
            .to(
              accordionHeader,
              {
                paddingTop: getResponsivePadding(),
                duration: animDuration,
                ease: animEase,
              },
              0
            )
            .add(
              Flip.from(openState, {
                duration: animDuration,
                ease: animEase,
                absoluteOnLeave: true,
                onComplete: () => {
                  resizeObserver = new ResizeObserver(() => {
                    if ($clicked.hasClass('active')) {
                      gsap.set(accordionBody, { height: getViewportHeight() });
                      verifyPosition($clicked);
                    }
                  });
                  resizeObserver.observe(document.documentElement);
                  verifyPosition($clicked);
                },
              }),
              0
            );
        }
      } else {
        // Handle closing when already open
        const closeTl = gsap.timeline({
          onComplete: () => {
            isAnimating = false;
          },
        });

        // REMOVE VIDEO-PLAYING CLASS IMMEDIATELY WHEN CLOSING
        $clicked.removeClass('video-playing');

        // Clean up unmute overlay when closing
        unmuteOverlayManager.cleanup();

        // CLEAR URL WHEN CLOSING ACCORDION (only when just closing, not switching)
        DirectLinkHandler.clearAccordionSlug();

        // 1. Start video fade-out synchronized with accordion closing
        if (videoElement) {
          fadeOutVideo(videoElement);
        }

        // 2. Animate the accordion closed
        closeTl
          .to(
            accordionHeader,
            {
              paddingTop: '0rem',
              duration: animDuration,
              ease: animEase,
            },
            'start'
          )
          .to(
            accordionBody,
            {
              height: 0,
              duration: animDuration,
              ease: animEase,
              onComplete: () => {
                $clicked.removeClass('active');
                gsap.set(accordionBody, {
                  clearProps: 'all',
                  display: 'none',
                });
                if (resizeObserver) {
                  resizeObserver.disconnect();
                }
              },
            },
            'start'
          );
      }
    },
  };
}
