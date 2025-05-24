import { cleanURL, getEventParams, isValidEventId } from './urlParams';

/**
 * Handle direct linking to accordion items
 */
export class DirectLinkHandler {
  private static instance: DirectLinkHandler;
  private targetEventId: string | null = null;
  private hasDirectLink: boolean = false;
  private accordionOpened: boolean = false;

  private constructor() {
    const params = getEventParams();
    if (params.event && isValidEventId(params.event)) {
      this.targetEventId = params.event;
      this.hasDirectLink = true;
      console.log(`Direct link detected: ${params.event}`);
    }
  }

  public static getInstance(): DirectLinkHandler {
    if (!DirectLinkHandler.instance) {
      DirectLinkHandler.instance = new DirectLinkHandler();
    }
    return DirectLinkHandler.instance;
  }

  /**
   * Check if there's a valid direct link
   */
  public hasValidDirectLink(): boolean {
    return this.hasDirectLink;
  }

  /**
   * Get the target event ID
   */
  public getTargetEventId(): string | null {
    return this.targetEventId;
  }

  /**
   * Should skip preloader for direct links
   */
  public shouldSkipPreloader(): boolean {
    return this.hasDirectLink;
  }

  /**
   * Check if accordion has already been opened
   */
  public hasOpenedAccordion(): boolean {
    return this.accordionOpened;
  }

  /**
   * Open the target accordion
   */
  public async openTargetAccordion(): Promise<void> {
    if (!this.targetEventId || this.accordionOpened) return;

    console.log(`Attempting to open accordion: ${this.targetEventId}`);

    // Wait for DOM to be ready
    await this.waitForDOM();

    // Find the accordion item
    const accordionItem = document.getElementById(this.targetEventId);
    if (!accordionItem || !accordionItem.classList.contains('js-accordion-item')) {
      console.warn(`Accordion item with ID "${this.targetEventId}" not found`);
      return;
    }

    // Wait a bit more to ensure all scripts are loaded
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Check if accordion functionality is available
    if (!this.isAccordionReady()) {
      console.warn('Accordion functionality not ready yet, retrying...');
      // Retry after a longer delay
      setTimeout(() => {
        this.openTargetAccordion();
      }, 1000);
      return;
    }

    // Mark as opened to prevent multiple attempts
    this.accordionOpened = true;

    // Scroll to the accordion item first
    accordionItem.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    // Wait for scroll to complete then trigger click
    setTimeout(() => {
      console.log(`Triggering click on accordion: ${this.targetEventId}`);
      accordionItem.click();

      // Clean URL after successful opening
      setTimeout(() => {
        cleanURL();
        console.log('URL cleaned after accordion opened');
      }, 1500);
    }, 500);
  }

  /**
   * Check if accordion functionality is ready
   */
  private isAccordionReady(): boolean {
    // Check if accordion items have click handlers
    const accordionItems = document.querySelectorAll('.js-accordion-item');
    if (accordionItems.length === 0) return false;

    // Check if jQuery and accordion scripts are loaded
    if (typeof window.$ === 'undefined') return false;

    // Check if the accordion items have been initialized
    // (This is a heuristic - in practice the accordion should be ready if DOM is ready and scripts loaded)
    return true;
  }

  /**
   * Wait for DOM and accordion items to be ready
   */
  private waitForDOM(): Promise<void> {
    return new Promise((resolve) => {
      const checkReady = () => {
        if (
          document.readyState === 'complete' &&
          document.querySelectorAll('.js-accordion-item').length > 0
        ) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      // If already ready, resolve immediately
      if (
        document.readyState === 'complete' &&
        document.querySelectorAll('.js-accordion-item').length > 0
      ) {
        resolve();
      } else {
        checkReady();
      }
    });
  }

  /**
   * Reset the handler (useful for navigation)
   */
  public reset(): void {
    this.accordionOpened = false;
    // Don't reset the target - it should persist for the session
  }
}

export const directLinkHandler = DirectLinkHandler.getInstance();
