// Utility to handle URL parameters for direct linking
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
  const validEvents = [
    'rae-sremmurd',
    'vtss',
    'chase-satus-venice-beach',
    'sheck-wes',
    'i-hate-models',
    'beltran',
    'j-balvin',
    'converse',
    'elements-festival',
    'denzel-curry',
    'mochakk',
    'nia-archives',
    'eli-brown',
    'skream',
    'carlita',
    'chase-status-brooklyn-banks',
    '02-24-24',
    'fred-yachty',
    'fred-again',
  ];
  return validEvents.includes(eventId);
}

/**
 * Clean URL by removing query parameters
 */
export function cleanURL(): void {
  if (window.history && window.history.pushState) {
    const url = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.pushState({ path: url }, '', url);
  }
}
