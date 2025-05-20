import { gsap } from 'gsap';

// Store the active link background element
let activeLinkBackground: HTMLDivElement | null = null;

/**
 * Create and initialize the active link background element
 */
export function createActiveLinkBackground(): void {
  activeLinkBackground = document.createElement('div');
  activeLinkBackground.classList.add('active-link-background');

  // Initial styles
  Object.assign(activeLinkBackground.style, {
    position: 'absolute',
    top: '0',
    background: '#424242',
    zIndex: '1',
    pointerEvents: 'none',
    willChange: 'transform',
  });

  const menuContainer = document.querySelector('.menu_container');
  if (menuContainer) {
    menuContainer.appendChild(activeLinkBackground);
    setInitialPosition();
    setupActiveLinkBackgroundResize();
  }
}

/**
 * Set the initial position of the active link background based on the current page
 */
export function setInitialPosition(): void {
  if (!activeLinkBackground) return;

  const currentLink = document.querySelector('.menulink.w--current');
  if (currentLink) {
    const linkRect = currentLink.getBoundingClientRect();
    const containerRect = document.querySelector('.menu_container')?.getBoundingClientRect();

    if (containerRect) {
      activeLinkBackground.style.left = `${linkRect.left - containerRect.left}px`;
      activeLinkBackground.style.width = `${linkRect.width}px`;
      activeLinkBackground.style.height = `${linkRect.height}px`;
    }
  }
}

/**
 * Determine the slide direction based on namespaces
 */
export function getSlideDirection(currentNS: string, nextNS: string): 'left' | 'right' {
  const pages = ['index', 'info', 'archive', 'legal'];
  const currentIndex = pages.indexOf(currentNS);
  const nextIndex = pages.indexOf(nextNS);
  return currentIndex < nextIndex ? 'right' : 'left';
}

/**
 * Animate the background to the active link
 */
export function animateBackgroundToActiveLink(data: any): gsap.core.Tween | undefined {
  if (!activeLinkBackground) return;

  const nextNamespace = data?.next?.namespace || 'index';
  const nextLink = document.querySelector(`.menulink[data-nav-target="${nextNamespace}"]`);

  if (!nextLink) return;

  const linkRect = nextLink.getBoundingClientRect();
  const containerRect = document.querySelector('.menu_container')?.getBoundingClientRect();

  if (!containerRect) return;

  return gsap.to(activeLinkBackground, {
    left: linkRect.left - containerRect.left,
    width: linkRect.width,
    height: linkRect.height,
    duration: 1.5,
    ease: 'expo.inOut',
  });
}

/**
 * Set up the resize observer for the active link background
 */
function setupActiveLinkBackgroundResize(): void {
  if (!activeLinkBackground) return;

  const resizeObserver = new ResizeObserver(
    debounce(() => {
      const currentLink = document.querySelector('.menulink.w--current');
      if (currentLink && activeLinkBackground) {
        const linkRect = currentLink.getBoundingClientRect();
        const containerRect = document.querySelector('.menu_container')?.getBoundingClientRect();

        if (containerRect) {
          gsap.to(activeLinkBackground, {
            left: linkRect.left - containerRect.left,
            width: linkRect.width,
            height: linkRect.height,
            duration: 0.3,
            ease: 'power2.out',
          });
        }
      }
    }, 100)
  );

  // Observe both document and menu container for any size changes
  resizeObserver.observe(document.documentElement);
  const menuContainer = document.querySelector('.menu_container');
  if (menuContainer) {
    resizeObserver.observe(menuContainer);
  }
}

/**
 * Block clicks on the active page's navigation elements
 */
export function blockActivePageClicks(): void {
  // Clear existing blocks first
  document.querySelectorAll('.menulink, [data-nav-target="index"]').forEach((link) => {
    link.style.cursor = '';
    link.style.pointerEvents = '';
  });

  setTimeout(() => {
    const currentNamespace = document.body.getAttribute('data-barba-namespace');

    // Block current menu link
    const currentLink = document.querySelector('.menulink.w--current');
    if (currentLink) {
      currentLink.style.cursor = 'default';
      currentLink.style.pointerEvents = 'none';
    }

    // If on index, block both menu link and logo
    if (currentNamespace === 'index') {
      document
        .querySelectorAll('.menulink.w--current, [data-nav-target="index"]:not(.menulink)')
        .forEach((link) => {
          link.style.cursor = 'default';
          link.style.pointerEvents = 'none';
        });
    }
  }, 50);
}

/**
 * Get the active link background element
 */
export function getActiveLinkBackground(): HTMLDivElement | null {
  return activeLinkBackground;
}

/**
 * Set the active link background element
 */
export function setActiveLinkBackground(element: HTMLDivElement | null): void {
  activeLinkBackground = element;
}

/**
 * Debounce helper function
 */
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
}
