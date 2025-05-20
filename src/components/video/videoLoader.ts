import { cleanupHLSVideo, initializeHLSVideo } from './hlsVideoLoader';

/**
 * Initialize video elements in a container
 * @param container Element containing videos to initialize
 * @param isPreloader Whether this is for the preloader (special treatment)
 * @param forceAllVideos Whether to force initialization of all videos (not recommended)
 */
export async function initializeVideo(
  container: Element,
  isPreloader: boolean = false,
  forceAllVideos: boolean = false
) {
  // Exclude accordion videos (event-video) to prevent preloading issues
  // Only initialize preloader videos or visible non-accordion videos
  const videos = isPreloader
    ? container.querySelectorAll('.preloader-video')
    : Array.from(container.querySelectorAll('video')).filter(
        (video) =>
          (isVideoVisible(video) || forceAllVideos) &&
          !video.closest('.event-video') && // Skip accordion event videos
          !video.hasAttribute('data-hls-src') // Skip all HLS videos that aren't preloader
      );

  const promises = Array.from(videos).map(async (video) => {
    // Skip already initialized videos
    if (video.dataset.initialized === 'true') return;

    // Set common video properties
    video.muted = false;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');

    // Preloader gets higher priority initialization
    if (isPreloader) {
      const hlsUrl = video.getAttribute('data-hls-src');
      if (hlsUrl) {
        try {
          // Initialize preloader video with high quality settings
          await initializeHLSVideo(video, hlsUrl);
          video.dataset.initialized = 'true';
          return;
        } catch (error) {
          // Silent error handling
        }
      }
      // Mark as initialized
      video.dataset.initialized = 'true';
      return;
    }

    // Non-preloader videos are initialized with metadata only
    // to avoid downloading everything at once
    video.preload = 'metadata';
    video.dataset.initialized = 'true';
  });

  await Promise.all(promises);
}

/**
 * Check if a video element is in the viewport
 */
function isVideoVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= -window.innerHeight &&
    rect.left >= -window.innerWidth &&
    rect.bottom <= window.innerHeight * 2 &&
    rect.right <= window.innerWidth * 2
  );
}

/**
 * Clean up function for videos
 */
export function cleanupVideo(container: Element) {
  const videos = container.querySelectorAll('video');
  videos.forEach((video) => {
    // Clean up HLS if used
    cleanupHLSVideo(video);

    // Pause and reset video
    video.pause();
    video.currentTime = 0;

    // Remove all initialization flags
    delete video.dataset.initialized;
    delete video.dataset.hlsInitialized;
  });
}
