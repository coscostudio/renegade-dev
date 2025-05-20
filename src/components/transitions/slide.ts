import { gsap } from 'gsap';

import {
  animateBackgroundToActiveLink,
  areClicksBlocked,
  blockClicks,
  getSlideDirection,
  unblockClicks,
} from '../navigation';

/**
 * Enhanced slide transition between main pages
 * With improved handling of the Archive page
 */
export const slideTransition = {
  name: 'slide-transition',
  custom: ({ current, next }) => {
    return current.namespace !== 'legal' && next.namespace !== 'legal';
  },
  sync: true,

  before(data) {
    // Make sure to block clicks at the start
    blockClicks();

    // IMPORTANT: If we're coming from archive page, ensure cleanup happens first
    if (data.current?.namespace === 'archive' && (window as any).archiveView) {
      try {
        // Ensure transitions flag is set to prevent animations during cleanup
        (window as any).archiveView.isTransitioning = true;

        // Force a quick fadeOut with minimal animation
        (window as any).archiveView.fadeOut().catch(() => {});

        // Set a brief timeout to ensure animations have started
        setTimeout(() => {
          try {
            // Full cleanup with safety checks
            if ((window as any).archiveView) {
              (window as any).archiveView.destroy();
              delete (window as any).archiveView;
            }
          } catch (e) {}
        }, 100);
      } catch (e) {}
    }

    if (data?.next?.container) {
      // Apply all critical styles in one batch
      requestAnimationFrame(() => {
        // Set background color immediately on the next container
        data.next.container.style.backgroundColor = '#0F0F0F';

        // Add a temporary style to ensure no black flashes during WebGL init
        if (data.next.namespace === 'archive' && !document.getElementById('prevent-flash-style')) {
          const style = document.createElement('style');
          style.id = 'prevent-flash-style';
          style.textContent = `
            /* Prevent any black flash during transition */
            .page-wrapper, 
            .barba-container, 
            [data-barba-namespace="archive"],
            canvas,
            #c,
            body {
              background-color: #0F0F0F !important;
            }
            
            /* Force all new canvases to have correct bg color */
            canvas {
              background-color: #0F0F0F !important;
            }
          `;
          document.head.appendChild(style);
        }

        // Don't set opacity if going TO archive page - it has its own initialization
        if (data.next.namespace === 'archive') {
          gsap.set(data.next.container, {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            visibility: 'visible',
            backgroundColor: '#0F0F0F',
          });
        } else {
          gsap.set(data.next.container, {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            visibility: 'visible',
            opacity: 0, // Start with opacity 0 for fade-in for non-archive destinations
          });
        }
      });
    }
  },

  async leave(data) {
    // Don't re-block clicks if already blocked
    if (!areClicksBlocked()) {
      blockClicks();
    }

    // Cache currentScroll to avoid layout thrashing
    const currentScroll = window.scrollY;
    const direction = getSlideDirection(data.current.namespace, data.next.namespace);
    const tl = gsap.timeline();

    // Set position once to avoid layout thrashing
    gsap.set(data.current.container, {
      position: 'fixed',
      top: -currentScroll,
      left: 0,
      width: '100%',
    });

    // Add link animation
    tl.add(animateBackgroundToActiveLink(data), 0);

    // Ensure consistent timing across all page transitions
    const fadeDuration = 0.8;
    const fadeEase = 'power2.inOut';
    const slideDuration = 1.5;
    const slideEase = 'expo.inOut';

    // Archive specific transitions
    if (data.current.namespace === 'archive' && (window as any).archiveView) {
      try {
        const { archiveView } = window as any;

        // Make sure archiveView knows we're transitioning
        archiveView.isTransitioning = true;

        // Fade out the archive view - this handles the WebGL grid fade
        archiveView.fadeOut();

        // Apply fade-out to the entire container for consistency with other pages
        tl.to(
          data.current.container,
          {
            opacity: 0,
            duration: fadeDuration,
            ease: fadeEase,
          },
          0
        );

        // Also fade out any possible canvas elements directly
        const canvasElements = data.current.container.querySelectorAll('canvas');
        if (canvasElements.length > 0) {
          tl.to(
            canvasElements,
            {
              opacity: 0,
              duration: fadeDuration,
              ease: fadeEase,
            },
            0
          );
        }

        // Fade out the archive container explicitly
        const archiveContainer = document.getElementById('archive-container');
        if (archiveContainer) {
          tl.to(
            archiveContainer,
            {
              opacity: 0,
              duration: fadeDuration,
              ease: fadeEase,
            },
            0
          );
        }
      } catch (e) {}
    }
    // For non-archive pages, add a simple fade-out
    else {
      // Add fade out for all content in the container
      tl.to(
        data.current.container,
        {
          opacity: 0,
          duration: fadeDuration,
          ease: fadeEase,
        },
        0
      );

      // Find specific elements that benefit from individual fade handling
      const fadeElements = data.current.container.querySelectorAll(
        'img, video, canvas, .fade-item'
      );
      if (fadeElements.length > 0) {
        tl.to(
          fadeElements,
          {
            opacity: 0,
            duration: fadeDuration * 0.75, // Slightly faster than container
            ease: fadeEase,
            stagger: 0.05,
          },
          0
        );
      }
    }

    // Main container slide animation - happens simultaneously with fades
    tl.to(
      data.current.container,
      {
        x: direction === 'right' ? '-100%' : '100%',
        duration: slideDuration,
        ease: slideEase,
      },
      0
    );

    return tl;
  },

  enter(data) {
    const direction = getSlideDirection(data.current.namespace, data.next.namespace);
    const tl = gsap.timeline();

    // Create loading overlay IMMEDIATELY for archive transitions to prevent flash
    if (data.next.namespace === 'archive') {
      // Add styles first
      addGridLoaderStyles();

      // Check if an overlay already exists and remove it
      const existingOverlay = document.querySelector('.grid-loader-overlay');
      if (existingOverlay) {
        existingOverlay.parentNode?.removeChild(existingOverlay);
      }

      // Create overlay immediately before the transition starts
      const loaderOverlay = document.createElement('div');
      loaderOverlay.className = 'grid-loader-overlay';

      // Apply critical styles - just the background and z-index
      loaderOverlay.style.zIndex = '998';
      loaderOverlay.style.backgroundColor = '#0F0F0F';

      // Create the loader element but DO NOT add the is-loading class yet
      const loader = document.createElement('div');
      loader.className = 'grid-loader'; // No is-loading class = invisible text
      loader.textContent = ''; // Text will be added via CSS

      // Set initial opacity to 0 (override the CSS)
      loader.style.opacity = '0';

      // Add loader to overlay and overlay to container
      loaderOverlay.appendChild(loader);
      data.next.container.appendChild(loaderOverlay);

      // Store reference to loader element for the onComplete callback
      const loaderElement = loader;

      // Set initial position
      gsap.set(data.next.container, {
        x: direction === 'right' ? '100%' : '-100%',
      });

      // Force background color during transition to prevent flashing
      data.next.container.style.backgroundColor = '#0F0F0F';

      const canvasElements = data.next.container.querySelectorAll('canvas');
      canvasElements.forEach((canvas) => {
        canvas.style.backgroundColor = '#0F0F0F';
      });

      // For archive destination, do the slide and THEN show loader text
      tl.to(
        data.next.container,
        {
          x: 0,
          duration: 1.5,
          ease: 'expo.inOut',
          onComplete: () => {
            // Add is-loading class
            if (loaderElement) {
              loaderElement.classList.add('is-loading');

              // Use GSAP for a much faster fade-in
              gsap.fromTo(
                loaderElement,
                { opacity: 0 },
                {
                  opacity: 1,
                  duration: 0.15, // Very fast fade-in
                  ease: 'power2.out',
                }
              );
            }
          },
        },
        0
      );
    } else {
      // For non-archive destinations
      // Set initial position
      gsap.set(data.next.container, {
        x: direction === 'right' ? '100%' : '-100%',
        opacity: 0,
      });

      // Animate the container sliding in
      tl.to(
        data.next.container,
        {
          x: 0,
          duration: 1.5,
          ease: 'expo.inOut',
        },
        0
      );

      // Fade in the container
      tl.to(
        data.next.container,
        {
          opacity: 1,
          duration: 1.2, // Slightly shorter than the slide
          ease: 'power2.inOut',
        },
        0.2 // Start fade slightly after slide begins
      );

      // Find specific elements that benefit from individual fade handling
      const fadeElements = data.next.container.querySelectorAll('img, video, canvas, .fade-item');
      if (fadeElements.length > 0) {
        tl.fromTo(
          fadeElements,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 1,
            ease: 'power2.inOut',
            stagger: 0.1,
          },
          0.4 // Start after main container begins fading
        );
      }
    }

    return tl;
  },

  after(data) {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Remove our temporary style if it exists
    const tempStyle = document.getElementById('prevent-flash-style');
    if (tempStyle) {
      tempStyle.remove();
    }

    // Additional safety check for cleanup, with try-catch
    if (data.current?.namespace === 'archive') {
      try {
        if ((window as any).archiveView) {
          // The destroy method now handles proper cleanup timing
          (window as any).archiveView.destroy();
          delete (window as any).archiveView;
        }

        // Clear any WebGL canvas elements just to be safe
        const oldCanvases = document.querySelectorAll('canvas');
        oldCanvases.forEach((canvas) => {
          try {
            const gl = canvas.getContext('webgl');
            if (gl) {
              const ext = gl.getExtension('WEBGL_lose_context');
              if (ext) ext.loseContext();
            }
          } catch (e) {
            // Silent error handling
          }
        });

        // Force garbage collection hint
        if ((window as any).gc) (window as any).gc();
      } catch (e) {
        // Silent error handling - don't let cleanup issues block navigation
      }
    }

    // Clean props in a single operation to reduce reflows
    gsap.set([data.current.container, data.next.container], {
      clearProps: 'position,top,left,width,transform,opacity',
    });

    window.scrollTo(0, 0);

    // IMPORTANT: Always unblock clicks as soon as the transition is complete
    // Remove the setTimeout delay that was causing the issue
    unblockClicks();
  },
};

// Function to add grid loader styles directly in slide.ts
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
      z-index: 998; /* Lower z-index to avoid blocking menu */
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: background-color 0.4s ease, opacity 0.4s ease;
      pointer-events: none; /* Allow clicks to pass through */
    }

    .grid-loader {
      color: #fafafa;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0;
      transition: opacity 0.4s ease; /* Slightly longer transition */
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
