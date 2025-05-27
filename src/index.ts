// src/index.ts
import barba from '@barba/core';
import { restartWebflow } from '@finsweet/ts-utils';
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { Flip } from 'gsap/Flip';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

// Import from components
import {
  destroyAccordionVideoPlayer,
  fadeOutAudioOnly,
  initializeAccordion,
} from './components/accordion-video';
import { destroyModal, initializeModal } from './components/modal/modal';
import {
  blockActivePageClicks,
  blockClicks,
  createActiveLinkBackground,
  createClickBlocker,
  unblockClicks,
} from './components/navigation';
import { onPreloaderComplete, playPreloader } from './components/preloader';
import { getTransitions } from './components/transitions';
import { videoCacheManager } from './components/video/cacheManager';
import { cleanupHLSVideo } from './components/video/hlsVideoLoader';
import { initializeVideo } from './components/video/videoLoader';
import { ArchiveView } from './components/WebGLGrid/ArchiveView';
import { directLinkHandler } from './utils/directLinkHandler';
import { unmuteOverlayManager } from './utils/unmuteOverlayManager';

/**
 * Add the grid loader styles
 */
function addGridLoaderStyles() {
  // Check if styles have already been added
  if (document.getElementById('grid-loading-styles')) {
    return;
  }

  // Add loading indicators styles
  const loadingStyle = document.createElement('style');
  loadingStyle.id = 'grid-loading-styles';
  loadingStyle.textContent = `
    .grid-loader-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: #0F0F0F;
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: opacity 0.5s ease;
      pointer-events: none; /* Allow clicks to pass through */
    }

    .grid-loader {
      color: #fafafa;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .grid-loader.is-loading {
      opacity: 1;
    }

    @keyframes loadingDots {
      0% { content: '.'; }
      33% { content: '..'; }
      66% { content: '...'; }
    }

    .grid-loader::before {
      content: 'loading';
      display: inline-block;
    }
    
    .grid-loader::after {
      content: '.';
      display: inline-block;
      animation: loadingDots .75s infinite;
      min-width: 24px;
    }
  `;
  document.head.appendChild(loadingStyle);
}

/**
 * Create a fullscreen grid loader overlay
 */
function createGridLoader(container) {
  // Add the styles
  addGridLoaderStyles();

  // Remove any existing loader overlay
  const existingOverlay = document.querySelector('.grid-loader-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Create the loader overlay
  const loaderOverlay = document.createElement('div');
  loaderOverlay.className = 'grid-loader-overlay';

  // Create the loader element
  const loader = document.createElement('div');
  loader.className = 'grid-loader';
  loader.textContent = ''; // Text will be added via CSS

  // Add loader to overlay and overlay to container
  loaderOverlay.appendChild(loader);
  container.appendChild(loaderOverlay);

  // Activate the loader
  setTimeout(() => {
    loader.classList.add('is-loading');
  }, 10);

  return {
    overlay: loaderOverlay,
    loader: loader,
    show() {
      loaderOverlay.style.opacity = '1';
      setTimeout(() => {
        loader.classList.add('is-loading');
      }, 10);
    },
    hide() {
      loader.classList.remove('is-loading');
      loaderOverlay.style.opacity = '0';
      setTimeout(() => {
        // Remove the overlay after transition completes
        if (loaderOverlay.parentNode) {
          loaderOverlay.parentNode.removeChild(loaderOverlay);
        }
      }, 500); // Match the transition duration
    },
  };
}

// Register GSAP plugins
gsap.registerPlugin(Draggable, Flip, ScrollToPlugin);

// Flag to track if preloader has been called
let preloaderCalled = false;

// Add flags to track initialization state
let isInitialPageLoad = true;
let archiveGridInitializing = false;
let archiveGridInitialized = false;
const preloaderExitTimeline = null;

function isLegalPage(): boolean {
  return (
    window.location.pathname.includes('/legal') ||
    window.location.href.includes('/legal') ||
    document.body.getAttribute('data-barba-namespace') === 'legal' ||
    document.querySelector('[data-barba-namespace="legal"]') !== null
  );
}

/**
 * Check if the current page is the archive page
 */
function isArchivePage(): boolean {
  return (
    window.location.pathname.includes('/archive') ||
    window.location.href.includes('/archive') ||
    document.body.getAttribute('data-barba-namespace') === 'archive' ||
    document.querySelector('[data-barba-namespace="archive"]') !== null
  );
}

/**
 * Initialize the Archive View for direct page loads
 */
function initArchiveViewForDirectLoad(delayIntro = false) {
  // Only proceed if we're on the archive page
  if (!isArchivePage()) return;

  // Set flag to prevent duplicate initialization
  if (archiveGridInitialized) {
    return;
  }

  // Set background color immediately - critical for visual smoothness
  document.body.style.backgroundColor = '#0F0F0F';
  document.body.classList.add('archive-page');

  // Find the container where ArchiveView should be initialized
  const container =
    document.querySelector('[data-barba-namespace="archive"]') ||
    document.querySelector('.page-wrapper');

  if (!container) {
    return;
  }

  // Apply initial styling
  container.style.backgroundColor = '#0F0F0F';

  // Only create loading overlay for non-delayed direct loads
  // (For preloader sequence, we don't want to show the loading indicator)
  if (!delayIntro) {
    // Create loading indicator manually
    // First add the styles
    if (!document.getElementById('grid-loading-styles')) {
      const loadingStyle = document.createElement('style');
      loadingStyle.id = 'grid-loading-styles';
      loadingStyle.textContent = `
        .grid-loader-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: #0F0F0F;
          z-index: 998; /* Lower z-index to avoid blocking menu */
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 1;
          transition: opacity 0.5s ease;
          pointer-events: none; /* Allow clicks to pass through */
        }

        .grid-loader {
          color: #fafafa;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .grid-loader.is-loading {
          opacity: 1;
        }

        @keyframes loadingDots {
          0% { content: '.'; }
          33% { content: '..'; }
          66% { content: '...'; }
        }

        .grid-loader::before {
          content: 'loading';
          display: inline-block;
        }
        
        .grid-loader::after {
          content: '.';
          display: inline-block;
          animation: loadingDots .75s infinite;
          min-width: 24px;
        }
      `;
      document.head.appendChild(loadingStyle);
    }

    // Remove any existing loader overlay
    const existingOverlay = document.querySelector('.grid-loader-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create the loader overlay
    const loaderOverlay = document.createElement('div');
    loaderOverlay.className = 'grid-loader-overlay';

    // Create the loader element
    const loader = document.createElement('div');
    loader.className = 'grid-loader';
    loader.textContent = ''; // Text will be added via CSS

    // Add loader to overlay and overlay to container
    loaderOverlay.appendChild(loader);
    container.appendChild(loaderOverlay);

    // Activate the loader
    setTimeout(() => {
      loader.classList.add('is-loading');
    }, 10);
  }

  // Check for existing instance and clean it up safely
  if ((window as any).archiveView) {
    try {
      (window as any).archiveView.destroy();
      delete (window as any).archiveView;

      // Wait a moment to ensure cleanup is completed
      setTimeout(() => {
        // Initialize ArchiveView with a small delay to ensure DOM is fully ready
        initializeArchiveView();
      }, 100);
    } catch (e) {
      // Still try to initialize even if cleanup fails
      initializeArchiveView();
    }
  } else {
    // Initialize directly if no existing instance
    initializeArchiveView();
  }

  // Helper function to initialize the archive view
  function initializeArchiveView() {
    archiveGridInitializing = true;

    setTimeout(async () => {
      try {
        // Initialize ArchiveView with images from DOM, passing the container and delayIntro flag
        const archiveView = new ArchiveView(container as HTMLElement, delayIntro);
        await archiveView.init();

        // Mark as initialized
        archiveGridInitialized = true;
        archiveGridInitializing = false;

        // Store reference to archiveView for later cleanup
        (window as any).archiveView = archiveView;

        // Only show immediately if we're not delaying the intro
        if (!delayIntro) {
          archiveView.show();
        } else {
        }

        // Note: We don't need to manually hide the loader here
        // The modified ArchiveView.showZoomUI() method will hide the loader when intro is mostly done
      } catch (error) {
        archiveGridInitializing = false;

        // Make sure content is visible even if grid fails
        (container as HTMLElement).style.opacity = '1';
        (container as HTMLElement).style.visibility = 'visible';

        // Hide loader overlay on error
        const loaderOverlay = document.querySelector('.grid-loader-overlay');
        if (loaderOverlay && loaderOverlay.parentNode) {
          gsap.to(loaderOverlay, {
            opacity: 0,
            duration: 0.3,
            onComplete: () => {
              if (loaderOverlay.parentNode) {
                loaderOverlay.parentNode.removeChild(loaderOverlay);
              }
            },
          });
        }
      }
    }, 100);
  }
}

/**
 * Set up early initialization of the grid but delay the intro animation
 * This allows WebGL resources to load during the preloader but prevents
 * animations from competing with the preloader exit
 */
function setupEarlyGridInitialization() {
  // Flag to track if we've already initialized
  let gridInitialized = false;

  // Try to initialize as early as possible - during preloader video playback
  const checkForPreloader = setInterval(() => {
    const preloader = document.querySelector('.preloader-container');
    const preloaderVideo = document.querySelector('.preloader-video');

    // When preloader and video exist, we can start early init
    if (preloader && preloaderVideo && !gridInitialized) {
      // Only initialize once
      gridInitialized = true;
      clearInterval(checkForPreloader);

      earlyInitializeArchiveGrid();

      // Set up observer to detect when preloader exit animation completes
      setupPreloaderExitCompletionObserver();
    }
  }, 300);

  // Failsafe: Clear interval after 10 seconds regardless
  setTimeout(() => {
    clearInterval(checkForPreloader);
  }, 10000);

  /**
   * Initialize the grid early but with delayed intro
   */
  function earlyInitializeArchiveGrid() {
    // Only proceed if we're on the archive page and not already initialized
    if (!isArchivePage() || archiveGridInitialized || archiveGridInitializing) return;

    // Find the container where ArchiveView should be initialized
    const container =
      document.querySelector('[data-barba-namespace="archive"]') ||
      document.querySelector('.page-wrapper');

    if (!container) {
      return;
    }

    archiveGridInitializing = true;

    try {
      // Create ArchiveView with delayIntro=true
      const archiveView = new ArchiveView(container as HTMLElement, true);

      // Initialize but don't show yet
      archiveView
        .init()
        .then(() => {
          // Store reference for later use
          (window as any).archiveView = archiveView;
          archiveGridInitialized = true;
          archiveGridInitializing = false;

          // DO NOT call archiveView.show() yet - that will happen after preloader exit
        })
        .catch((error) => {
          archiveGridInitializing = false;

          // Fallback to normal initialization if early init fails
          initArchiveViewForDirectLoad(false);
        });
    } catch (error) {
      archiveGridInitializing = false;
    }
  }

  /**
   * Set up observer to detect when preloader exit animation completes
   */
  function setupPreloaderExitCompletionObserver() {
    // Watch for the preloader element being removed from DOM
    const bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.removedNodes.length) {
          // Check if preloader was removed
          for (let i = 0; i < mutation.removedNodes.length; i++) {
            const node = mutation.removedNodes[i];
            if (
              node.nodeType === 1 &&
              (node as Element).classList &&
              (node as Element).classList.contains('preloader-container')
            ) {
              bodyObserver.disconnect();

              // Trigger intro sequence if grid is initialized
              if (archiveGridInitialized && (window as any).archiveView) {
                // Add a 0.5 second delay before starting the intro animation
                // This creates a smoother transition between preloader exit and grid intro
                setTimeout(() => {
                  if ((window as any).archiveView && !(window as any).archiveView.isDestroyed) {
                    (window as any).archiveView.triggerIntroSequence();
                  }
                }, 500);
              } else {
                // Fallback if grid isn't initialized yet

                initArchiveViewForDirectLoad(false);
              }

              break;
            }
          }
        }
      }
    });

    // Start observing document body for preloader removal
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Failsafe: If observer doesn't trigger, use a timer as backup
    const failsafeTimer = setTimeout(() => {
      // Only trigger if intro hasn't already been triggered
      if (
        archiveGridInitialized &&
        (window as any).archiveView &&
        !(window as any).archiveView.isIntroShown &&
        !(window as any).archiveView.isDestroyed
      ) {
        // Use the same 0.5s delay as normal flow
        setTimeout(() => {
          if ((window as any).archiveView && !(window as any).archiveView.isDestroyed) {
            (window as any).archiveView.triggerIntroSequence();
          }
        }, 500);
      }
      bodyObserver.disconnect();
    }, 6000); // 6 second failsafe

    // Function to clear failsafe when not needed
    return () => {
      clearTimeout(failsafeTimer);
      bodyObserver.disconnect();
    };
  }
}

/**
 * Handle direct link accordion opening
 */
function handleDirectLinkAccordion() {
  // Only handle on index/home page
  if (window.location.pathname !== '/' && !window.location.pathname.includes('index')) {
    return;
  }

  if (directLinkHandler.hasValidDirectLink() && !directLinkHandler.hasOpenedAccordion()) {
    // For modified preloader sequence, coordinate with preloader
    if (directLinkHandler.shouldUseModifiedPreloader()) {
      // Wait for accordion initialization to complete, then set up coordination
      setTimeout(() => {
        directLinkHandler.openTargetAccordion(true); // true = coordinate with preloader
      }, 500);
    } else {
      // Standard opening for non-preloader contexts
      setTimeout(() => {
        directLinkHandler.openTargetAccordion(false); // false = standard opening
      }, 1000);
    }
  }
}

// Initialize preloader before anything else
document.addEventListener('DOMContentLoaded', () => {
  if (!preloaderCalled) {
    if (!isLegalPage()) {
      preloaderCalled = true;

      // Disable home link if on homepage (for direct page loads with preloader)
      disableHomeLinkOnHomepage();

      // Set up exit animation observer for direct loads to archive page
      if (isArchivePage() && isInitialPageLoad) {
        setupEarlyGridInitialization();
      }

      // Also register preloader completion as a fallback
      onPreloaderComplete(() => {
        // For direct loads to archive page - fallback only
        if (
          isArchivePage() &&
          isInitialPageLoad &&
          !archiveGridInitialized &&
          !archiveGridInitializing
        ) {
          initArchiveViewForDirectLoad(false);
        } else if (!isArchivePage() && !directLinkHandler.shouldUseModifiedPreloader()) {
          // For non-archive pages without modified preloader, handle accordion opening
          handleDirectLinkAccordion();
        }
        // Note: For modified preloader sequence, accordion opening is handled by the coordinated sequence
      });

      // Start the preloader
      playPreloader()
        .then(() => {
          // After preloader completes, handle direct link accordion opening for standard sequences
          if (!directLinkHandler.shouldUseModifiedPreloader()) {
            handleDirectLinkAccordion();
          }
          // Note: Modified preloader sequence handles accordion opening internally
        })
        .catch((e) => {
          // If preloader fails, make sure we still initialize the grid or handle direct links
          if (isArchivePage() && isInitialPageLoad && !archiveGridInitialized) {
            initArchiveViewForDirectLoad(false);
          } else {
            handleDirectLinkAccordion();
          }
        });
    } else {
      preloaderCalled = true;
      // Ensure loading class is removed
      document.body.classList.remove('loading');

      // Make sure the page is immediately visible
      const pageWrapper = document.querySelector('.page-wrapper');
      if (pageWrapper) {
        (pageWrapper as HTMLElement).style.transform = 'none';
        (pageWrapper as HTMLElement).style.opacity = '1';
        (pageWrapper as HTMLElement).style.visibility = 'visible';
      }

      // Remove any preloader elements that might be present
      const preloader = document.querySelector('.preloader-container');
      if (preloader) {
        preloader.remove();
      }

      // Handle direct links on legal page too (though preloader is skipped)
      handleDirectLinkAccordion();
    }
  }
});

// Clean up video cache on unload
window.addEventListener('unload', () => {
  videoCacheManager.cleanup();
});

// Handle window resize to update unmute overlay position
window.addEventListener('resize', () => {
  unmuteOverlayManager.updatePosition();
});

/**
 * Disable home link when on homepage
 */
function disableHomeLinkOnHomepage(): void {
  // Only disable on homepage/index
  const isHomepage =
    window.location.pathname === '/' ||
    window.location.pathname.includes('index') ||
    document.body.getAttribute('data-barba-namespace') === 'index';

  if (isHomepage) {
    const homeLink = document.querySelector('.homelink');
    if (homeLink) {
      (homeLink as HTMLElement).style.pointerEvents = 'none';
      (homeLink as HTMLElement).style.cursor = 'default';
    }
  }
}

// Barba initialization
barba.init({
  transitions: getTransitions(),
  views: [
    // Legal page view
    {
      namespace: 'legal',
      beforeEnter() {
        destroyModal();
      },
      afterEnter() {
        restartWebflow();
        unblockClicks();
        document.body.style.overflow = '';

        // Handle direct links even on legal page
        handleDirectLinkAccordion();
      },
      beforeLeave() {
        // Any cleanup specific to legal page
      },
    },

    // Home page view
    {
      namespace: 'index',
      afterEnter() {
        restartWebflow();
        initializeAccordion();

        // Disable home link on homepage
        disableHomeLinkOnHomepage();

        // Handle direct link accordion opening after accordion is initialized
        setTimeout(() => {
          handleDirectLinkAccordion();
        }, 500);
      },
      beforeLeave() {
        // Reset direct link handler for navigation
        directLinkHandler.reset();
      },
    },

    // Info page view
    {
      namespace: 'info',
      afterEnter() {
        restartWebflow();
      },
    },

    // Archive page view
    {
      namespace: 'archive',
      beforeEnter(data) {
        document.body.classList.add('archive-page');

        // Apply critical styling immediately to prevent flashing
        requestAnimationFrame(() => {
          // Force the correct background color everywhere
          document.body.style.backgroundColor = '#0F0F0F';
          data.next.container.style.backgroundColor = '#0F0F0F';

          // Add a global style to prevent any black flashing
          if (!document.getElementById('prevent-flash-style')) {
            const style = document.createElement('style');
            style.id = 'prevent-flash-style';
            style.textContent = `
              /* Force all backgrounds to correct color */
              .archive-container, 
              canvas,
              #c,
              body.archive-page,
              .grid-loader-overlay {
                background-color: #0F0F0F !important;
              }
            `;
            document.head.appendChild(style);
          }
        });
      },

      async afterEnter(data) {
        // Set background colors
        data.next.container.style.backgroundColor = '#0F0F0F';
        document.body.style.backgroundColor = '#0F0F0F';

        // For Barba transitions only - not initial page load
        if (!isInitialPageLoad) {
          // Reset the initialization state for Barba navigation
          archiveGridInitialized = false;

          // Standard initialization for Barba transitions
          try {
            // Clean up any existing instance
            if ((window as any).archiveView) {
              (window as any).archiveView.destroy();
              delete (window as any).archiveView;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // Initialize with images from DOM
            const archiveView = new ArchiveView(data.next.container, false);
            await archiveView.init();
            (window as any).archiveView = archiveView;
            archiveGridInitialized = true;

            // Make loader background transparent immediately after initialization
            const gridLoaderOverlay = document.querySelector('.grid-loader-overlay');
            if (gridLoaderOverlay) {
              // Make background transparent so grid becomes visible
              gridLoaderOverlay.style.backgroundColor = 'transparent';

              // We'll let the overlay remain until the grid's show method
              // automatically removes it at the appropriate time
            }

            // Show the archive
            archiveView.show();
          } catch (error) {
            // If grid initialization fails, still show the container
            // and remove loading styles to prevent page from being stuck
            const initStyles = document.getElementById('prevent-flash-style');
            if (initStyles) initStyles.remove();

            // Hide loader overlay on error
            const loaderOverlay = document.querySelector('.grid-loader-overlay');
            if (loaderOverlay && loaderOverlay.parentNode) {
              gsap.to(loaderOverlay, {
                opacity: 0,
                duration: 0.4,
                ease: 'power2.inOut',
                onComplete: () => {
                  if (loaderOverlay.parentNode) {
                    loaderOverlay.parentNode.removeChild(loaderOverlay);
                  }
                },
              });
            }
          }
        } else {
        }
      },

      // Add beforeLeave hook specifically for archive page
      beforeLeave() {
        // No visual changes should be made here - just let Barba handle the transition
        // We'll set the isTransitioning flag in the before hook
      },
    },
  ],
});

// Barba Hooks - UPDATED FOR BACKEND STABILITY WITHOUT VISUAL CHANGES
barba.hooks.before((data) => {
  // Once Barba transitions occur, we're no longer in initial load
  isInitialPageLoad = false;

  // Ensure clicks are blocked at the very start of any transition
  blockClicks();

  // Clean up unmute overlay before any page transition
  unmuteOverlayManager.cleanup();

  // For Archive page, just mark as transitioning but DON'T modify visuals
  if (data.current?.namespace === 'archive' && (window as any).archiveView) {
    try {
      // Only set the flag to prevent new animations starting
      (window as any).archiveView.isTransitioning = true;

      // DO NOT call fadeOut or any other visual changes here!
    } catch (e) {}
  }

  // Handle accordion videos when leaving index page
  if (data.current?.namespace === 'index') {
    // Find all active accordion videos and fade out only their audio
    const accordionItems = document.querySelectorAll('.js-accordion-item.active');
    accordionItems.forEach((item) => {
      const eventVideoContainer = item.querySelector('.event-video');
      const videoElement = eventVideoContainer
        ? eventVideoContainer.querySelector('video') || item.querySelector('video')
        : item.querySelector('video');

      if (videoElement) {
        // Use our new function to fade out only the audio
        fadeOutAudioOnly(videoElement);
      }
    });

    // Reset direct link handler when leaving index page
    directLinkHandler.reset();
  }

  destroyModal();
  destroyAccordionVideoPlayer();

  // Clean up videos except active accordion videos from index page
  document.querySelectorAll('video').forEach((video) => {
    // Skip videos in active accordion items when transitioning from index
    const isInActiveAccordion =
      data.current?.namespace === 'index' && video.closest('.js-accordion-item.active') !== null;

    if (!isInActiveAccordion) {
      cleanupHLSVideo(video);
    }
  });
});

barba.hooks.leave((data) => {
  if (data.current.namespace === 'archive') {
    // Reset flag when leaving archive page
    archiveGridInitializing = false;
  }
});

barba.hooks.enter(() => {
  const preloader = document.querySelector('.loader_wrapper');
  if (preloader) {
    preloader.style.display = 'none';
  }
});

barba.hooks.after(async ({ current, next }) => {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // For Archive page - schedule resource cleanup AFTER transitions complete
  if (current?.namespace === 'archive') {
    // Wait for transitions to complete before cleaning up
    setTimeout(() => {
      try {
        if ((window as any).archiveView) {
          // The destroy method now handles proper cleanup timing
          (window as any).archiveView.destroy();
          delete (window as any).archiveView;
        }
      } catch (e) {
        // Silent error handling
      }
    }, 800); // Delay until transitions are complete
  }

  // Make sure clicks are unblocked
  unblockClicks();

  // Clear any existing blocks before applying new ones
  document.querySelectorAll('.menulink, .logo-nav').forEach((link) => {
    link.style.cursor = '';
    link.style.pointerEvents = '';
  });

  // Apply new blocks after a short delay
  setTimeout(blockActivePageClicks, 50);

  // Restart Webflow and initialize components
  restartWebflow();
  initializeVideo(document);
  initializeModal();

  // Handle direct links for the new page
  if (next?.namespace === 'index') {
    setTimeout(() => {
      handleDirectLinkAccordion();
    }, 500);
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  createActiveLinkBackground();
  createClickBlocker();
  blockActivePageClicks();
  initializeVideo(document);

  // Disable home link if on homepage (for direct page loads)
  disableHomeLinkOnHomepage();

  if (!preloaderCalled) {
    if (!isLegalPage()) {
      preloaderCalled = true;
      // Start the preloader - setupEarlyGridInitialization is called earlier
      playPreloader()
        .then(() => {
          handleDirectLinkAccordion();
        })
        .catch(() => {
          handleDirectLinkAccordion();
        });
    } else {
      preloaderCalled = true;
      document.body.classList.remove('loading');
      handleDirectLinkAccordion();
    }
  }

  initializeModal();
});

// Exports
export { blockClicks, createClickBlocker, unblockClicks };
