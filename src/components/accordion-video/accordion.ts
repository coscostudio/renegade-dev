import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import Hls from 'hls.js';

import {
  cleanupAccordionHLS,
  initializeAccordionHLS,
  isHLSCleanupPending,
  startLoadingHLS,
} from '../video/hlsVideoLoader';
import { getAccordionVideoPlayer } from './index';
import { addAccordionStyles } from './styles';

gsap.registerPlugin(Flip, ScrollToPlugin);

// Track which videos have been initialized
const initializedVideos = new Set<string>();

// Track observer for viewport-based loading
let intersectionObserver: IntersectionObserver | null = null;

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

              // Only preload if not already done and NOT on a low-data connection
              const isLowData =
                (navigator as any).connection && (navigator as any).connection.saveData;
              if (
                !initializedVideos.has(videoId) &&
                !videoElement.dataset.hlsInitialized &&
                !isLowData
              ) {
                // Initialize but only load manifest, not segments - set true for preloadOnly
                initializeAccordionHLS(videoElement, hlsUrl, true)
                  .then(() => {
                    videoElement.dataset.hlsInitialized = 'true';
                    initializedVideos.add(videoId);
                  })
                  .catch(() => {
                    // Error handled silently
                  });
              }
            }
          }

          // Stop observing once we've prepared this video
          intersectionObserver?.unobserve(container);
        }
      });
    },
    {
      // Use a more generous margin to prepare videos before they're visible
      threshold: 0,
      rootMargin: '200px 0px',
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
 * Prepare a video for playback without starting the fade
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

  try {
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

    // Generate a unique ID for tracking if not already present
    const videoId = videoElement.id || `video-${Math.random().toString(36).substring(2, 9)}`;
    if (!videoElement.id) videoElement.id = videoId;

    // Check for HLS source
    const hlsUrl = videoElement.getAttribute('data-hls-src');
    if (!hlsUrl) {
      return null; // No HLS source available
    }

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
      // Initialize new HLS instance with full loading
      try {
        // Start HLS initialization with full quality
        const hlsPromise = initializeAccordionHLS(videoElement, hlsUrl);

        // Track initialization
        initializedVideos.add(videoId);
        videoElement.dataset.hlsInitialized = 'true';

        // While HLS is initializing, also prepare for immediate playback
        videoElement.preload = 'auto';

        // Wait for HLS initialization to complete
        await hlsPromise;
      } catch (error) {
        // Silent error handling
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

    return videoElement;
  } catch (error) {
    // Silent error handling
  }

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

  return null;
}

// Modified playAndFadeInVideo function in src/components/accordion-video/accordion.ts
export function playAndFadeInVideo(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) return;

  // Ensure opacity is 0 before starting
  videoElement.style.opacity = '0';

  // Ensure video is not muted and volume is initially 0 for fade-in
  videoElement.muted = false;
  videoElement.volume = 0;

  // Get the loader element reference if it exists
  const loaderElement = (videoElement as any)._loaderElement as HTMLElement | undefined;

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

  // Set up fade-in with GSAP for better control
  const fadeIn = () => {
    gsap.to(videoElement, {
      opacity: 1,
      volume: 1,
      duration: 0.75, // Longer fade for visual appeal
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

  // Play with error handling
  try {
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          fadeIn();
        })
        .catch(() => {
          // If playback fails, try with muted first then unmute
          videoElement.muted = true;
          videoElement
            .play()
            .then(() => {
              fadeIn();

              // Gradually unmute after playing
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
            .catch(() => {
              // Make video visible anyway as a last resort
              fadeIn();

              // Hide loader in case of failure
              if (loaderElement) {
                loaderElement.style.opacity = '0';
                loaderElement.style.visibility = 'hidden';
                loaderElement.classList.remove('is-loading');
              }
            });
        });
    } else {
      // Older browsers without Promise support
      fadeIn();
    }
  } catch (error) {
    // Make video visible anyway if play fails
    fadeIn();

    // Hide loader in case of error
    if (loaderElement) {
      loaderElement.style.opacity = '0';
      loaderElement.style.visibility = 'hidden';
      loaderElement.classList.remove('is-loading');
    }
  }
}

export function fadeOutVideo(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) return;

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

      // Add click handler
      $('.js-accordion-item').on('click', function () {
        if (isAnimating) return;
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

    // Updated toggle method for createAccordionBehavior

    toggle($clicked) {
      if (isAnimating) return;
      isAnimating = true;

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

      // Animation timing parameters
      const animDuration = 1;
      const animEase = 'expo.inOut';

      if (isOpening) {
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
          // Find video element for the currently open accordion
          const openEventVideoContainer = $openItem.find('.event-video')[0];
          const openVideo = openEventVideoContainer
            ? openEventVideoContainer.querySelector('video')
            : null;
          const openBody = $openItem.find('.js-accordion-body')[0];
          const openHeader = $openItem.find('.js-accordion-header')[0];

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

          // 4. Prepare the new video while accordion is animating
          let preparedVideo: HTMLVideoElement | null = null;

          if (videoElement) {
            // Start loading the video immediately
            prepareVideo(videoElement, loaderElement)
              .then((video) => {
                preparedVideo = video;
                // Once we have the video ready, play and fade it in sync with the opening animation
                if (preparedVideo) {
                  playAndFadeInVideo(preparedVideo);
                }
              })
              .catch(() => {
                // Error handled silently
              });
          }

          const openState = Flip.getState(accordionBody);
          gsap.set(accordionBody, { height: getViewportHeight() });

          // 5. Handle the opening animation
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

          // Prepare the new video
          let preparedVideo: HTMLVideoElement | null = null;

          if (videoElement) {
            prepareVideo(videoElement, loaderElement)
              .then((video) => {
                preparedVideo = video;
                // Start video fade-in synchronized with accordion opening
                if (preparedVideo) {
                  playAndFadeInVideo(preparedVideo);
                }
              })
              .catch(() => {
                // Error handled silently
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

          const openState = Flip.getState(accordionBody);
          gsap.set(accordionBody, { height: getViewportHeight() });

          // Synchronized animations that finish together
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
