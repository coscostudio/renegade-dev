export function createClickBlocker(): void {
  // Check if the click blocker already exists
  if (document.querySelector('.transition-blocker')) {
    return;
  }

  const blocker = document.createElement('div');
  Object.assign(blocker.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '9998',
    backgroundColor: 'transparent', // Transparent but will still block clicks
    pointerEvents: 'all', // intercept all clicks
    display: 'none',
    cursor: 'inherit',
  });

  // Add event listeners to prevent all interactions
  blocker.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  blocker.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  blocker.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false }
  );

  blocker.classList.add('transition-blocker');
  document.body.appendChild(blocker);
}

// Track whether clicks are currently blocked
let isBlocked = false;

/**
 * Block all clicks during transitions
 */
export function blockClicks(): void {
  if (isBlocked) return; // Prevent multiple blocking calls

  isBlocked = true;
  const blocker = document.querySelector('.transition-blocker');
  if (blocker) {
    blocker.style.display = 'block';
    document.body.style.pointerEvents = 'none'; // Disable clicks on the body
    (blocker as HTMLElement).style.pointerEvents = 'all'; // But keep blocker clickable
  }
}

/**
 * Unblock clicks after transitions
 */
export function unblockClicks(): void {
  isBlocked = false;
  const blocker = document.querySelector('.transition-blocker');
  if (blocker) {
    blocker.style.display = 'none';
    document.body.style.pointerEvents = ''; // Re-enable clicks on the body
  }
}

/**
 * Check if clicks are currently blocked
 */
export function areClicksBlocked(): boolean {
  return isBlocked;
}
