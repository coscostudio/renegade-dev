interface VideoPlayerOptions {
  debug?: boolean;
}

class AccordionVideoPlayer {
  private videos: HTMLVideoElement[] = [];
  private activeVideos: Set<HTMLVideoElement> = new Set();
  private visibilityHandler: () => void;
  private isDestroyed: boolean = false;
  private options: VideoPlayerOptions;

  constructor(options: VideoPlayerOptions = {}) {
    this.options = {
      debug: false,
      ...options,
    };

    // Handle page visibility changes (tab switching)
    this.visibilityHandler = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Initialize video tracking
   * @param container Element to search for videos, defaults to document
   */
  public init(container: Element = document): void {
    if (this.isDestroyed) {
      return;
    }

    // Get all videos in container
    const videos = container.querySelectorAll('video');
    if (!videos.length) {
      return;
    }

    // Setup each video
    videos.forEach((video) => {
      if (this.videos.includes(video)) return; // Skip already tracked videos

      // Set initial state
      video.autoplay = false;
      video.muted = false;

      // Store the video
      this.videos.push(video);
    });
  }

  /**
   * Mark a video as active (accordion open)
   * @param video Video to mark as active
   */
  public activateVideo(video: HTMLVideoElement): void {
    if (!this.videos.includes(video)) {
      this.videos.push(video);
    }

    this.activeVideos.add(video);

    // Play if document is visible
    if (!document.hidden) {
      this.playVideo(video);
    }
  }

  /**
   * Mark a video as inactive (accordion closed)
   * @param video Video to mark as inactive
   */
  public deactivateVideo(video: HTMLVideoElement): void {
    this.activeVideos.delete(video);
    this.resetVideo(video);
  }

  /**
   * Reset and pause all videos
   */
  public resetAllVideos(): void {
    this.videos.forEach((video) => {
      this.resetVideo(video);
    });
    this.activeVideos.clear();
  }

  /**
   * Reset and pause videos in specified container
   * @param container Element containing videos to reset
   */
  public resetVideosInContainer(container: Element): void {
    const videos = container.querySelectorAll('video');
    videos.forEach((video) => {
      this.resetVideo(video);
      this.activeVideos.delete(video);
    });
  }

  /**
   * Reset and pause specific video
   * @param video Video element to reset
   */
  public resetVideo(video: HTMLVideoElement): void {
    video.pause();
    video.currentTime = 0;
  }

  /**
   * Play video with error handling
   */
  private playVideo(video: HTMLVideoElement): void {
    if (video.paused) {
      video.play().catch((error) => {
        // Handle autoplay restrictions gracefully
      });
    }
  }

  /**
   * Handle document visibility changes (tab switching)
   */
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Pause all videos when tab is not visible
      this.activeVideos.forEach((video) => {
        if (!video.paused) {
          video.pause();
        }
      });
    } else {
      // Resume active videos when tab becomes visible
      this.activeVideos.forEach((video) => {
        if (video.paused) {
          this.playVideo(video);
        }
      });
    }
  }

  /**
   * Debug logging (no-op function)
   */
  private debug(message: string): void {
    // Debug logging removed
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Remove event listeners
    document.removeEventListener('visibilitychange', this.visibilityHandler);

    // Reset all videos
    this.videos.forEach((video) => {
      video.pause();
      video.currentTime = 0;
    });

    // Clear data structures
    this.videos = [];
    this.activeVideos.clear();

    this.isDestroyed = true;
  }
}

export default AccordionVideoPlayer;
