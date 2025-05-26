// Utility to handle URL parameters for direct linking
import { isValidAccordionId } from './accordionConfig';

export interface EventParams {
  event: string | null;
}

/**
 * Extract event parameter from URL
 */
export function getEventParams(): EventParams {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    event: urlParams.get('event'),
  };
}

/**
 * Validate if event parameter corresponds to a valid accordion
 */
export function isValidEventId(eventId: string): boolean {
  return isValidAccordionId(eventId);
}

/**
 * Add event parameter to URL for social sharing and context
 */
export function setEventInURL(eventId: string): void {
  if (window.history && window.history.pushState) {
    const url = new URL(window.location.href);
    url.searchParams.set('event', eventId);
    window.history.pushState({ path: url.toString() }, '', url.toString());
  }
}

/**
 * Remove event parameter from URL when accordion is closed
 */
export function clearEventFromURL(): void {
  if (window.history && window.history.pushState) {
    const url = new URL(window.location.href);

    // Only proceed if there's actually an event parameter to remove
    if (url.searchParams.has('event')) {
      url.searchParams.delete('event');

      // Push the clean URL to history
      window.history.pushState({ path: url.toString() }, '', url.toString());
    }
  }
}
