class VideoCacheManager {
  private static instance: VideoCacheManager;
  private videoCache: Map<string, string> = new Map();
  private isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  private preloadingDisabled = false;

  private constructor() {
    // Check if data saver mode is enabled
    if ((navigator as any).connection && (navigator as any).connection.saveData) {
      this.preloadingDisabled = true;
    }

    // CRITICAL: Only preload the preloader video if it exists
    this.preloadOnlyPreloaderVideo();
  }

  static getInstance(): VideoCacheManager {
    if (!VideoCacheManager.instance) {
      VideoCacheManager.instance = new VideoCacheManager();
    }
    return VideoCacheManager.instance;
  }

  /**
   * Only preload the preloader video for faster initial loading
   * CRITICAL: This is the only video we preload
   */
  private preloadOnlyPreloaderVideo(): void {
    // Skip if preloading is disabled
    if (this.preloadingDisabled) return;

    // Only preload the preloader video
    const preloaderVideos = document.querySelectorAll('.preloader-video');
    if (preloaderVideos.length > 0) {
      preloaderVideos.forEach((video) => {
        // Only preload HLS sources - removed MP4 fallback
        const hlsSrc = video.getAttribute('data-hls-src');
        if (hlsSrc) {
          // Use appropriate 'fetch' instead of 'video' for m3u8 files
          this.addPreloadLink(hlsSrc, 'fetch');
        }
      });
    }

    // CRITICAL: Do NOT preload any accordion videos
  }

  /**
   * Add a preload link to document head
   */
  private addPreloadLink(url: string, as: string = 'video'): void {
    // For HLS content (.m3u8 files), always use 'fetch'
    if (url.includes('.m3u8')) {
      as = 'fetch';
    }

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = url;
    link.crossOrigin = 'anonymous';
    link.setAttribute('data-video-preload', 'true');
    document.head.appendChild(link);
  }

  /**
   * Get a video by URL (no caching for most videos to save bandwidth)
   * CRITICAL: Only cache preloader video, return direct URLs for all others
   */
  async getVideo(url: string): Promise<string | undefined> {
    // For Safari, just return the URL directly
    if (this.isSafari) return url;

    // For other browsers, check if it's already cached
    if (this.videoCache.has(url)) return this.videoCache.get(url);

    // Only cache preloader videos
    if (this.isPreloaderVideo(url)) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        this.videoCache.set(url, objectUrl);
        return objectUrl;
      } catch (error) {
        // Silent error handling
      }
    }

    // For all other videos, just return the URL directly without caching
    return url;
  }

  /**
   * Check if this is a preloader video URL
   */
  private isPreloaderVideo(url: string): boolean {
    // Check if any preloader video has this URL
    const preloaderVideos = document.querySelectorAll('.preloader-video');
    for (let i = 0; i < preloaderVideos.length; i++) {
      const video = preloaderVideos[i] as HTMLElement;

      // Check HLS src
      if (video.getAttribute('data-hls-src') === url) {
        return true;
      }
    }

    return false;
  }

  /**
   * Clean up cached videos
   */
  cleanup(): void {
    if (!this.isSafari) {
      this.videoCache.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      this.videoCache.clear();
    }

    // Also remove any preload links
    document.querySelectorAll('link[data-video-preload="true"]').forEach((link) => {
      link.remove();
    });
  }
}

export const videoCacheManager = VideoCacheManager.getInstance();
