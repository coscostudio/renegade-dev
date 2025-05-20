import { gsap } from 'gsap';

import {
  blockClicks,
  getActiveLinkBackground,
  getSlideDirection,
  unblockClicks,
} from '../navigation';

/**
 * Fade transition for navigating TO legal page
 */
export const fadeToLegalTransition = {
  name: 'fade-transition',
  to: { namespace: 'legal' },
  sync: false,

  before(data) {
    blockClicks();
    // Make sure the next container is ready with proper styling
    if (data?.next?.container) {
      gsap.set(data.next.container, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        opacity: 0,
        visibility: 'visible',
        zIndex: 10, // Ensure it appears above current content
      });
    }
  },

  leave(data) {
    // Create a simple fade out for the current page
    const tl = gsap.timeline({
      onComplete: () => unblockClicks(),
    });

    // Hide the active link background when going to legal page
    const activeLinkBackground = getActiveLinkBackground();
    if (activeLinkBackground) {
      tl.to(
        activeLinkBackground,
        {
          opacity: 0,
          duration: 0.5,
          ease: 'power2.out',
        },
        0
      );
    }

    // Simple fade out of current container
    tl.to(
      data.current.container,
      {
        opacity: 0,
        duration: 0.8,
        ease: 'power2.inOut',
      },
      0
    );

    return tl;
  },

  enter(data) {
    // Simple fade in for the legal page
    return gsap.to(data.next.container, {
      opacity: 1,
      duration: 0.8,
      ease: 'power2.inOut',
    });
  },

  after(data) {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    unblockClicks();

    // Clear all positional and opacity properties
    gsap.set([data.current.container, data.next.container], {
      clearProps: 'all',
    });

    window.scrollTo(0, 0);
  },
};

/**
 * Fade transition for navigating FROM legal page
 */
export const fadeFromLegalTransition = {
  name: 'fade-from-legal-transition',
  from: { namespace: 'legal' },
  sync: true, // Changed to true for a more synchronized transition

  before(data) {
    blockClicks();

    // Make sure the next container is visible but with opacity 0
    if (data?.next?.container) {
      gsap.set(data.next.container, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        opacity: 0,
        visibility: 'visible',
      });
    }

    // Make sure the active link background is hidden at the start
    const activeLinkBackground = getActiveLinkBackground();
    if (activeLinkBackground) {
      gsap.set(activeLinkBackground, { opacity: 0 });
    }
  },

  leave(data) {
    // Simple fade out of legal page
    return gsap.to(data.current.container, {
      opacity: 0,
      duration: 0.8,
      ease: 'power2.inOut',
      onComplete: () => {
        // Set next container to full opacity when leave completes
        if (data?.next?.container) {
          gsap.set(data.next.container, { opacity: 1 });
        }
        unblockClicks();
      },
    });
  },

  enter(data) {
    // Create a timeline for the next page appearance
    const tl = gsap.timeline();
    const activeLinkBackground = getActiveLinkBackground();

    // For the main pages, fade in the active link background
    if (['index', 'info', 'archive'].includes(data.next.namespace) && activeLinkBackground) {
      // First position it correctly based on the target page
      const nextNamespace = data.next.namespace;
      const nextLink = document.querySelector(`.menulink[data-nav-target="${nextNamespace}"]`);

      if (nextLink) {
        const linkRect = nextLink.getBoundingClientRect();
        const containerRect = document.querySelector('.menu_container')?.getBoundingClientRect();

        if (containerRect) {
          gsap.set(activeLinkBackground, {
            left: linkRect.left - containerRect.left,
            width: linkRect.width,
            height: linkRect.height,
            opacity: 0,
          });

          // Fade in the background
          tl.to(
            activeLinkBackground,
            {
              opacity: 1,
              duration: 0.5,
              ease: 'power2.inOut',
            },
            0.2 // Small delay after the legal page fade out
          );
        }
      }
    }

    // The next container is already visible, we don't animate it further
    return tl;
  },

  after(data) {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    unblockClicks();

    // Clear all transition properties
    gsap.set([data.current.container, data.next.container], {
      clearProps: 'all',
    });

    window.scrollTo(0, 0);
  },
};
