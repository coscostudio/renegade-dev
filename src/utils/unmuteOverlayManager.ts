import { gsap } from 'gsap';

/**
 * Manages the unmute overlay for Safari autoplay restrictions
 */
class UnmuteOverlayManager {
  private static instance: UnmuteOverlayManager;
  private overlay: HTMLElement | null = null;
  private button: HTMLElement | null = null;
  private currentVideo: HTMLVideoElement | null = null;
  private currentAccordion: HTMLElement | null = null;
  private clickHandler: ((event: Event) => void) | null = null;

  private constructor() {}

  public static getInstance(): UnmuteOverlayManager {
    if (!UnmuteOverlayManager.instance) {
      UnmuteOverlayManager.instance = new UnmuteOverlayManager();
    }
    return UnmuteOverlayManager.instance;
  }

  /**
   * Show the unmute overlay for a specific video and accordion
   */
  public showUnmuteOverlay(
    videoElement: HTMLVideoElement,
    accordionElement: HTMLElement,
    onUnmute: () => void
  ): void {
    // Find or create overlay elements
    this.findOrCreateOverlayElements();

    if (!this.overlay || !this.button) {
      console.warn('Unmute overlay elements not found');
      return;
    }

    // Store references
    this.currentVideo = videoElement;
    this.currentAccordion = accordionElement;

    // Position overlay within the accordion
    this.positionOverlay(accordionElement);

    // Remove any existing click handler
    if (this.clickHandler) {
      this.button.removeEventListener('click', this.clickHandler);
    }

    // Create new click handler
    this.clickHandler = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();

      // Call the unmute callback
      onUnmute();

      // Hide the overlay
      this.hideUnmuteOverlay();
    };

    // Add click handler
    this.button.addEventListener('click', this.clickHandler);

    // Show the overlay with animation
    this.overlay.style.display = 'flex'; // Use flex for proper centering

    gsap.fromTo(
      this.overlay,
      {
        opacity: 0,
        visibility: 'hidden',
      },
      {
        opacity: 1,
        visibility: 'visible',
        duration: 0.3,
        ease: 'power2.out',
      }
    );
  }

  /**
   * Hide the unmute overlay
   */
  public hideUnmuteOverlay(): void {
    if (!this.overlay) return;

    gsap.to(this.overlay, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.out',
      onComplete: () => {
        if (this.overlay) {
          this.overlay.style.display = 'none';
          this.overlay.style.visibility = 'hidden';
        }
        this.cleanup();
      },
    });
  }

  /**
   * Check if overlay is currently visible
   */
  public isVisible(): boolean {
    return this.overlay && this.overlay.style.display !== 'none';
  }

  /**
   * Clean up overlay when accordion closes or changes
   */
  public cleanup(): void {
    // Remove click handler
    if (this.clickHandler && this.button) {
      this.button.removeEventListener('click', this.clickHandler);
      this.clickHandler = null;
    }

    // Hide overlay immediately if still visible
    if (this.overlay && this.overlay.style.display !== 'none') {
      this.overlay.style.display = 'none';
      this.overlay.style.visibility = 'hidden';
      this.overlay.style.opacity = '0';

      // Move overlay back to its original parent (main_wrapper) if it was moved
      const mainWrapper = document.querySelector('.main_wrapper');
      if (mainWrapper && this.overlay.parentElement !== mainWrapper) {
        mainWrapper.appendChild(this.overlay);
      }
    }

    // Reset any accordion body positioning we may have set
    if (this.currentAccordion) {
      const accordionBody = this.currentAccordion.querySelector(
        '.js-accordion-body'
      ) as HTMLElement;
      if (accordionBody && accordionBody.style.position === 'relative') {
        // Only reset if we set it (check if it was originally static)
        const bodyComputedStyle = window.getComputedStyle(accordionBody);
        if (bodyComputedStyle.position === 'relative') {
          accordionBody.style.position = '';
        }
      }
    }

    // Clear references
    this.currentVideo = null;
    this.currentAccordion = null;
  }

  /**
   * Find or create the overlay elements
   */
  private findOrCreateOverlayElements(): void {
    // Try to find existing overlay (it might be in main_wrapper or moved to an accordion body)
    this.overlay = document.querySelector('.unmute-overlay');
    this.button = document.querySelector('.unmute-button');

    // If overlay exists but button doesn't, look for button within overlay
    if (this.overlay && !this.button) {
      this.button = this.overlay.querySelector('.unmute-button');
    }

    // If not found, log warning - they should exist in Webflow
    if (!this.overlay) {
      console.warn(
        'Unmute overlay (.unmute-overlay) not found in DOM. Please add it to your Webflow main_wrapper.'
      );
    }
    if (!this.button) {
      console.warn(
        'Unmute button (.unmute-button) not found in DOM. Please add it inside the .unmute-overlay.'
      );
    }

    // Ensure overlay has initial hidden state
    if (this.overlay) {
      this.overlay.style.display = 'none';
      this.overlay.style.visibility = 'hidden';
      this.overlay.style.opacity = '0';
    }
  }

  /**
   * Position the overlay within the specified accordion
   */
  private positionOverlay(accordionElement: HTMLElement): void {
    if (!this.overlay) return;

    // Find the accordion body (where video is displayed)
    const accordionBody = accordionElement.querySelector('.js-accordion-body') as HTMLElement;
    if (!accordionBody) return;

    // Reset any previous positioning
    this.overlay.style.position = '';
    this.overlay.style.top = '';
    this.overlay.style.left = '';
    this.overlay.style.width = '';
    this.overlay.style.height = '';

    // Position overlay absolutely within the accordion body
    // This way it only covers the video area, not the entire page
    this.overlay.style.position = 'absolute';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = '100%';
    this.overlay.style.height = '100%';
    this.overlay.style.zIndex = '100'; // Above video but not above page elements

    // Ensure the accordion body has relative positioning to contain the absolute overlay
    const bodyComputedStyle = window.getComputedStyle(accordionBody);
    if (bodyComputedStyle.position === 'static') {
      accordionBody.style.position = 'relative';
    }

    // Move the overlay to be a direct child of the accordion body
    // This ensures it's positioned relative to the accordion, not the viewport
    if (this.overlay.parentElement !== accordionBody) {
      accordionBody.appendChild(this.overlay);
    }

    // Ensure it's properly styled for centering the button within the accordion
    this.overlay.style.display = 'flex';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.justifyContent = 'center';
    this.overlay.style.pointerEvents = 'none'; // Allow clicks to pass through the overlay

    // But make sure the button itself can be clicked
    if (this.button) {
      this.button.style.pointerEvents = 'auto';
    }
  }

  /**
   * Update overlay position (call this if window resizes)
   * With absolute positioning within accordion, this is much simpler
   */
  public updatePosition(): void {
    if (this.currentAccordion && this.overlay && this.overlay.style.display !== 'none') {
      // With absolute positioning, we just need to ensure the accordion body still has relative positioning
      const accordionBody = this.currentAccordion.querySelector(
        '.js-accordion-body'
      ) as HTMLElement;
      if (accordionBody) {
        const bodyComputedStyle = window.getComputedStyle(accordionBody);
        if (bodyComputedStyle.position === 'static') {
          accordionBody.style.position = 'relative';
        }
      }
      // No need to recalculate coordinates since we're positioned relative to the accordion body
    }
  }
}

export const unmuteOverlayManager = UnmuteOverlayManager.getInstance();
