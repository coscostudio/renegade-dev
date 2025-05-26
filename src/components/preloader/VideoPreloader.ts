import { gsap } from 'gsap';

import { directLinkHandler } from '../../utils/directLinkHandler';
import {
  loadingCoordinator,
  PreloaderState as GlobalPreloaderState,
} from '../../utils/loadingCoordinator';
import { cleanupHLSVideo, initializeHLSVideo } from '../video/hlsVideoLoader';

/**
 * State machine for tracking preloader status
 */
enum PreloaderState {
  IDLE, // Initial state
  LOADING, // Video is loading
  PLAYING, // Video is playing
  PAUSED, // Video is paused due to visibility
  EXITING, // Exit animation in progress
  COMPLETED, // Preloader finished
  SKIPPED, // Preloader was skipped
}

/**
 * Video preloader that shows a fullscreen video before revealing the site
 */
export class VideoPreloader {
  private initialized: boolean = false;
  private hlsInitialized: boolean = false;
  private startTimestamp: number = 0;
  private preloaderPromise: Promise<void> | null = null;
  private masterSafetyTimeout: any = null;
  private visibilityChangeHandler: any = null;
  private isPageVisible: boolean = true;
  private visibilityChangeTime: number = 0;
  private accumulatedPlayTime: number = 0;
  private playStartTime: number = 0;
  private requiredPlayDuration: number = 0;
  private videoElement: HTMLVideoElement | null = null;
  private videoCover: HTMLElement | null = null;
  private pendingVisibilityResume: boolean = false;

  // State tracking
  private state: PreloaderState = PreloaderState.IDLE;

  // Configuration values
  private minPlayDuration: number = 2000; // Minimum play time in milliseconds
  private exitAnimationDuration: number = 1.2; // Duration of exit animation in seconds
  private safetyBuffer: number = 0.1; // 10% safety buffer
  private maxLoadTime: number = 2500; // Maximum time to wait for video (2 seconds)
  private maxPlayTime: number = 10000; // Maximum video play time (10 seconds)
  private visibilityHideDelay: number = 300; // Delay before reacting to visibility (prevents quick tab switches)
  private visibilityShowDelay: number = 300; // Delay before resuming after visibility change

  /**
   * Update state changes
   */
  private setState(newState: PreloaderState): void {
    const elapsed = Date.now() - this.startTimestamp;

    // Prevent invalid state transitions
    if (this.state === PreloaderState.EXITING && newState !== PreloaderState.COMPLETED) {
      return;
    }

    this.state = newState;

    // Update the global loading coordinator when state changes
    this.updateGlobalLoadingState(newState);
  }

  /**
   * Check if the page is currently visible
   */
  private checkPageVisibility(): boolean {
    return document.visibilityState === 'visible';
  }

  /**
   * Handle visibility changes
   */
  private handleVisibilityChange = (): void => {
    const isVisible = this.checkPageVisibility();
    const currentTime = Date.now();

    // Only handle visibility changes if we're in LOADING, PLAYING or PAUSED state
    if (
      ![PreloaderState.LOADING, PreloaderState.PLAYING, PreloaderState.PAUSED].includes(this.state)
    ) {
      return;
    }

    // Handle becoming hidden
    if (!isVisible && this.isPageVisible) {
      this.isPageVisible = false;
      this.visibilityChangeTime = currentTime;

      // Use setTimeout to prevent reacting to quick tab switches
      setTimeout(() => {
        // Only proceed if still hidden and still in PLAYING state
        if (!this.checkPageVisibility() && this.state === PreloaderState.PLAYING) {
          // Update accumulated play time
          if (this.playStartTime > 0) {
            this.accumulatedPlayTime += currentTime - this.playStartTime;
            this.playStartTime = 0;
          }

          // Pause the video
          if (this.videoElement && !this.videoElement.paused) {
            this.videoElement.pause();
          }

          this.setState(PreloaderState.PAUSED);
        }
      }, this.visibilityHideDelay);
    }

    // Handle becoming visible
    if (isVisible && !this.isPageVisible) {
      this.isPageVisible = true;

      // Use setTimeout to prevent reacting to quick tab switches
      setTimeout(() => {
        // Only proceed if still visible and in PAUSED state
        if (this.checkPageVisibility() && this.state === PreloaderState.PAUSED) {
          // Check if we've been hidden for too long (> 5 seconds)
          const hiddenDuration = currentTime - this.visibilityChangeTime;
          if (hiddenDuration > 5000) {
            // Skip to exit if hidden for too long
            if (this.videoElement) {
              // Flag that we're waiting for visibility resume
              this.pendingVisibilityResume = true;

              // Play video but immediately skip to near the end
              if (this.videoElement.duration && this.videoElement.duration > 1) {
                this.videoElement.currentTime = this.videoElement.duration - 0.5;
              }
              this.videoElement.play().catch(() => {
                // If play fails, force exit
                this.pendingVisibilityResume = false;
                this.startExit();
              });
            } else {
              // No video element, just exit
              this.startExit();
            }
          } else {
            // Resume normal playback if hidden for short time
            if (this.videoElement) {
              this.videoElement.play().catch(() => {
                // If play fails, force exit
                this.startExit();
              });
              this.playStartTime = currentTime;
              this.setState(PreloaderState.PLAYING);
            } else {
              // No video element, just exit
              this.startExit();
            }
          }
        }
      }, this.visibilityShowDelay);
    }
  };

  /**
   * Create cover over video element
   */
  private createCover(preloader: HTMLElement): HTMLElement {
    // Remove any existing cover first to avoid duplicates
    if (this.videoCover && this.videoCover.parentNode) {
      this.videoCover.parentNode.removeChild(this.videoCover);
    }

    // Create a new cover element
    const cover = document.createElement('div');
    cover.id = 'preloader-video-cover';

    // Set inline styles to ensure it appears correctly
    cover.style.cssText = `
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #0F0F0F !important;
      z-index: 10001 !important;
      display: block !important;
      visibility: visible !important;
      pointer-events: none !important;
      opacity: 1 !important;
      transition: opacity 0.15s ease-out, background-color 0.15s ease-out;
    `;

    // Add to DOM
    preloader.appendChild(cover);

    // Store reference
    this.videoCover = cover;

    return cover;
  }

  /**
   * Hide cover with a brief fade-in transition
   */
  private hideCover(): void {
    if (this.videoCover) {
      // Add a transition for smooth fade
      this.videoCover.style.transition = 'opacity 0.15s ease-out, background-color 0.15s ease-out';
      this.videoCover.style.backgroundColor = 'transparent';
      this.videoCover.style.opacity = '0';

      // Don't clear the reference in case we need it later
    }
  }

  /**
   * Force start the exit sequence
   */
  private startExit(): void {
    if (this.state !== PreloaderState.EXITING && this.state !== PreloaderState.COMPLETED) {
      // Find necessary elements
      const preloader = document.querySelector('.preloader-container') as HTMLElement;
      const pageWrapper = document.querySelector('.page-wrapper') as HTMLElement;

      if (preloader && pageWrapper) {
        // Get computed style for pageWrapper
        const computedStyle = window.getComputedStyle(pageWrapper);
        const originalWidth = computedStyle.width;

        // Ensure cover is visible when exiting without video
        if (!this.videoCover) {
          this.createCover(preloader);
        }

        // Execute exit animation
        this.setState(PreloaderState.EXITING);
        this.executeExit(preloader, pageWrapper, this.videoElement, originalWidth);
      }
    }
  }

  /**
   * Update the global loading coordinator based on preloader state
   */
  private updateGlobalLoadingState(state: PreloaderState): void {
    // Map internal state to global state
    switch (state) {
      case PreloaderState.IDLE:
        loadingCoordinator.setPreloaderState(GlobalPreloaderState.NOT_STARTED);
        break;
      case PreloaderState.LOADING:
      case PreloaderState.PAUSED: // Handle paused like IN_PROGRESS
        loadingCoordinator.setPreloaderState(GlobalPreloaderState.IN_PROGRESS);
        break;
      case PreloaderState.PLAYING:
        loadingCoordinator.setPreloaderState(GlobalPreloaderState.VIDEO_PLAYING);
        break;
      case PreloaderState.EXITING:
        // Keep IN_PROGRESS state until fully completed
        break;
      case PreloaderState.COMPLETED:
        loadingCoordinator.setPreloaderState(GlobalPreloaderState.COMPLETED);
        break;
      case PreloaderState.SKIPPED:
        loadingCoordinator.setPreloaderState(GlobalPreloaderState.SKIPPED);
        break;
    }
  }

  /**
   * Initialize the preloader styles
   */
  private init(): void {
    if (this.initialized) return;

    const style = document.createElement('style');
    style.textContent = `
      body.loading {
        overflow: hidden !important;
        height: 100vh !important;
      }

      .preloader-container {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 101vh !important;
        height: 101dvh !important;
        z-index: 9999 !important;
        background: #0F0F0F !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }

      .preloader-video {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: relative !important;
        z-index: 10000 !important; /* Video at lowest level */
      }

      .preloader-logo {
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        mix-blend-mode: difference !important;
        z-index: 10002 !important; /* Logo at the highest level */
        pointer-events: none !important;
        visibility: visible !important;
        opacity: 1 !important;
      }

      .page-wrapper {
        transform: translateY(100vh);
        position: fixed;
        width: 100%;
      }
    `;
    document.head.appendChild(style);

    this.initialized = true;

    // Set up visibility change listener
    this.isPageVisible = this.checkPageVisibility();
    this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  /**
   * Clean up event listeners
   */
  private cleanup(): void {
    // Remove visibility change listener
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }

    // Clean up cover reference
    this.videoCover = null;
  }

  /**
   * Prepare the video for playback
   */
  private async prepareVideo(video: HTMLVideoElement): Promise<void> {
    // Save reference to the video element
    this.videoElement = video;

    // Skip if we're already exiting
    if (this.state === PreloaderState.EXITING || this.state === PreloaderState.COMPLETED) {
      return Promise.reject(new Error('Cannot prepare video - preloader is exiting or completed'));
    }

    // Skip standard preparation if HLS was already initialized
    if (this.hlsInitialized) {
      return Promise.resolve();
    }

    // Set state to LOADING
    this.setState(PreloaderState.LOADING);

    return new Promise<void>((resolve, reject) => {
      // Reset video to beginning
      video.currentTime = 0;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.loop = false;
      video.crossOrigin = 'anonymous';

      // Safety timeout
      const safetyTimeout = setTimeout(() => {
        cleanupEvents();
        reject(new Error('Video preparation timeout'));
      }, this.maxLoadTime);

      // Event listeners
      const onLoadedMetadata = () => {
        video.currentTime = 0;
      };

      const onCanPlay = () => {
        cleanupEvents();
        resolve();
      };

      const onError = (error: any) => {
        cleanupEvents();
        reject(error);
      };

      const cleanupEvents = () => {
        clearTimeout(safetyTimeout);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
      };

      // Add event listeners
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);

      // If video is already ready, resolve immediately
      if (video.readyState >= 3) {
        cleanupEvents();
        resolve();
      }

      // Trigger load
      video.load();
    });
  }

  /**
   * Detect when video is actually playing and showing frames
   */
  private async detectVideoPlayback(video: HTMLVideoElement): Promise<void> {
    // Skip if we're already exiting
    if (this.state === PreloaderState.EXITING || this.state === PreloaderState.COMPLETED) {
      return Promise.reject(new Error('Cannot play video - preloader is exiting or completed'));
    }

    // Check visibility before starting playback
    if (!this.isPageVisible) {
      this.setState(PreloaderState.PAUSED);

      // Return a promise that will be resolved when visibility changes
      return new Promise<void>((resolve, reject) => {
        // Set up a function to check visibility periodically
        const checkVisibility = () => {
          if (this.checkPageVisibility()) {
            // Visibility restored, continue with playback
            this.isPageVisible = true;
            resolve();
          } else if (
            this.state === PreloaderState.EXITING ||
            this.state === PreloaderState.COMPLETED
          ) {
            // Preloader exited while waiting
            reject(new Error('Preloader exited while waiting for visibility'));
          } else {
            // Keep checking
            setTimeout(checkVisibility, 200);
          }
        };

        // Start checking
        checkVisibility();
      });
    }

    const playAttemptTime = Date.now();
    // Initialize play start time
    this.playStartTime = playAttemptTime;

    return new Promise<void>((resolve, reject) => {
      // Track time position to detect actual frame display
      let lastTimePosition = -1;
      let timeUpdateCount = 0;
      let progressReported = false;

      // Set up events to detect playback
      const onPlaying = () => {
        // This means attempt succeeded, but frames might not be visible yet
        (window as any).__videoPlayingStarted = true;
      };

      // This fires when playback position changes (frames are displayed)
      const onTimeUpdate = () => {
        timeUpdateCount++;
        const { currentTime } = video;

        // If time has advanced, frames are being displayed
        if (currentTime > lastTimePosition && currentTime > 0) {
          if (!progressReported) {
            progressReported = true;

            // Frames are confirmed visible
            (window as any).__videoFramesConfirmed = true;

            // IMPORTANT: Now that frames are confirmed visible, make the cover transparent
            this.hideCover();

            // Show video and resolve
            video.classList.add('is-playing');
            cleanup();
            resolve();
          }
        }

        lastTimePosition = currentTime;
      };

      const onStalled = () => {
        // Video stalled event
      };

      const onBuffering = () => {
        // Video buffering event
      };

      const onError = (error: any) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('stalled', onStalled);
        video.removeEventListener('waiting', onBuffering);
        video.removeEventListener('error', onError);
      };

      // Add event listeners
      video.addEventListener('playing', onPlaying);
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('stalled', onStalled);
      video.addEventListener('waiting', onBuffering);
      video.addEventListener('error', onError);

      // Start playing
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          cleanup();
          reject(error);
        });
      }
    });
  }

  /**
   * Handle video ended event (skip to exit if not completed)
   */
  private onVideoEnded = () => {
    if (this.state === PreloaderState.PLAYING || this.state === PreloaderState.PAUSED) {
      this.startExit();
    }
  };

  /**
   * Calculate how long to play the video before exit
   */
  private calculatePlayDuration(video: HTMLVideoElement): number {
    // Get video duration with fallback
    const videoDuration = !isNaN(video.duration) ? video.duration : 3;

    // Calculate exit buffer with safety margin
    const exitBuffer = this.exitAnimationDuration + this.exitAnimationDuration * this.safetyBuffer;

    // Calculate milliseconds to play, ensuring minimum duration
    const playTime = Math.max((videoDuration - exitBuffer) * 1000, this.minPlayDuration);

    // Cap at maximum play time
    const finalPlayTime = Math.min(playTime, this.maxPlayTime);

    // Store required play duration
    this.requiredPlayDuration = finalPlayTime;

    return finalPlayTime;
  }

  /**
   * Wait for the specified duration while monitoring video progress
   */
  private async waitForPlayDuration(video: HTMLVideoElement, duration: number): Promise<void> {
    const startTime = Date.now();
    let lastTimeCheck = video.currentTime;
    let stalledCount = 0;
    let lastCheckTime = startTime;

    // Listen for video ended event
    video.addEventListener('ended', this.onVideoEnded);

    return new Promise<void>((resolve) => {
      const checkProgress = () => {
        // Handle visibility changes affecting playback timing
        const currentTime = Date.now();
        const timeSinceLastCheck = currentTime - lastCheckTime;
        lastCheckTime = currentTime;

        // Stop if we're already exiting or completed
        if (this.state === PreloaderState.EXITING || this.state === PreloaderState.COMPLETED) {
          cleanupAndResolve();
          return;
        }

        // Skip checking if we're paused due to visibility
        if (this.state === PreloaderState.PAUSED) {
          setTimeout(checkProgress, 200);
          return;
        }

        // Handle pending visibility resume
        if (this.pendingVisibilityResume) {
          if (video.currentTime > 0 && !video.paused) {
            this.pendingVisibilityResume = false;
            cleanupAndResolve();
            return;
          }
        }

        // Check elapsed play time, accounting for visibility pauses
        let elapsedPlayTime = 0;
        if (this.playStartTime > 0) {
          // Add current playback time to accumulated time
          elapsedPlayTime = this.accumulatedPlayTime + (currentTime - this.playStartTime);
        } else {
          // Use only accumulated time if currently paused
          elapsedPlayTime = this.accumulatedPlayTime;
        }

        // Check if video is still progressing
        if (video.currentTime > lastTimeCheck + 0.1) {
          // Reset stalled counter
          stalledCount = 0;
        } else {
          // Video might be stalled
          stalledCount++;

          if (stalledCount >= 15) {
            // Stalled for ~1.5 seconds, force exit
            cleanupAndResolve();
            return;
          }
        }

        // Update check
        lastTimeCheck = video.currentTime;

        // Check if we've played long enough
        if (elapsedPlayTime >= duration) {
          cleanupAndResolve();
        } else {
          setTimeout(checkProgress, 100);
        }
      };

      const cleanupAndResolve = () => {
        // Remove ended event listener
        video.removeEventListener('ended', this.onVideoEnded);
        resolve();
      };

      // Start checking with a slight delay
      setTimeout(checkProgress, 100);
    });
  }

  /**
   * Execute the exit animation
   */
  private async executeExit(
    preloader: HTMLElement,
    pageWrapper: HTMLElement,
    video: HTMLVideoElement | null,
    originalWidth: string
  ): Promise<void> {
    // Set exiting state
    this.setState(PreloaderState.EXITING);

    const preloaderHeight = preloader.offsetHeight;
    const animStartTime = Date.now();

    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          // Clean up
          pageWrapper.style.position = 'static';
          pageWrapper.style.width = originalWidth;
          pageWrapper.style.transform = 'none';
          document.body.classList.remove('loading');

          // Clean up HLS video if used
          if (this.hlsInitialized && video) {
            cleanupHLSVideo(video);
          }

          // Remove preloader
          preloader.remove();

          // Set completed state
          this.setState(PreloaderState.COMPLETED);

          // Clear master safety timeout
          if (this.masterSafetyTimeout) {
            clearTimeout(this.masterSafetyTimeout);
            this.masterSafetyTimeout = null;
          }

          // Clean up resources and event listeners
          this.cleanup();

          resolve();
        },
      });

      // Slide animation
      tl.to(preloader, {
        y: -preloaderHeight,
        duration: this.exitAnimationDuration,
        ease: 'expo.inOut',
      }).to(
        pageWrapper,
        {
          y: 0,
          duration: this.exitAnimationDuration,
          ease: 'expo.inOut',
        },
        '<'
      );
    });
  }

  /**
   * Emergency cleanup if animation fails
   */
  private emergencyCleanup(
    preloader: HTMLElement,
    pageWrapper: HTMLElement,
    video: HTMLVideoElement | null,
    originalWidth: string
  ): void {
    // Reset styles
    pageWrapper.style.position = 'static';
    pageWrapper.style.width = originalWidth;
    pageWrapper.style.transform = 'none';
    document.body.classList.remove('loading');

    // Clean up video
    if (video && this.hlsInitialized) {
      cleanupHLSVideo(video);
    }

    // Remove preloader
    preloader.remove();
    this.setState(PreloaderState.COMPLETED);

    // Clean up resources and event listeners
    this.cleanup();
  }

  /**
   * Skip preloader immediately and reveal the page
   */
  private skipPreloader(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Set state to skipped
      this.setState(PreloaderState.SKIPPED);

      // Find elements
      const preloader = document.querySelector('.preloader-container') as HTMLElement;
      const pageWrapper = document.querySelector('.page-wrapper') as HTMLElement;

      if (preloader && pageWrapper) {
        // Get computed style for pageWrapper
        const computedStyle = window.getComputedStyle(pageWrapper);
        const originalWidth = computedStyle.width;

        // Immediately clean up styles without animation
        pageWrapper.style.position = 'static';
        pageWrapper.style.width = originalWidth;
        pageWrapper.style.transform = 'none';
        pageWrapper.style.opacity = '1';
        pageWrapper.style.visibility = 'visible';
        document.body.classList.remove('loading');

        // Remove preloader immediately
        if (preloader.parentNode) {
          preloader.parentNode.removeChild(preloader);
        }

        // Clean up resources
        this.cleanup();
      } else {
        // Just ensure loading class is removed
        document.body.classList.remove('loading');

        // Make page wrapper visible if it exists
        if (pageWrapper) {
          pageWrapper.style.transform = 'none';
          pageWrapper.style.opacity = '1';
          pageWrapper.style.visibility = 'visible';
        }
      }

      resolve();
    });
  }

  /**
   * Execute logo-only preloader sequence for direct links
   */
  private async executeLogoOnlySequence(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Set state
      this.setState(PreloaderState.LOADING);

      // Find elements
      const preloader = document.querySelector('.preloader-container') as HTMLElement;
      const pageWrapper = document.querySelector('.page-wrapper') as HTMLElement;
      const video = preloader?.querySelector('.preloader-video') as HTMLVideoElement;

      if (!preloader || !pageWrapper) {
        this.setState(PreloaderState.COMPLETED);
        resolve();
        return;
      }

      // Hide video if present
      if (video) {
        video.style.display = 'none';
      }

      // Initialize styles and setup
      this.init();

      // Save original styles
      const computedStyle = window.getComputedStyle(pageWrapper);
      const originalWidth = computedStyle.width;

      // Set loading class
      document.body.classList.add('loading');

      // Position page wrapper
      const preloaderHeight = preloader.offsetHeight;
      gsap.set(pageWrapper, {
        y: preloaderHeight,
        position: 'fixed',
        width: '100%',
        opacity: 1,
        visibility: 'visible',
      });

      // Show logo only for a brief moment
      setTimeout(() => {
        this.setState(PreloaderState.EXITING);

        // Get scroll target if set by direct link handler
        const scrollTarget = (window as any).__directLinkScrollTarget || 0;

        // Execute coordinated slide-up animation
        this.executeCoordinatedExit(preloader, pageWrapper, originalWidth, scrollTarget).then(
          () => {
            // Complete the coordinated opening
            if (directLinkHandler.hasValidDirectLink()) {
              directLinkHandler.completeCoordinatedOpening();
            }
            resolve();
          }
        );
      }, 800); // Brief pause to show logo
    });
  }

  /**
   * Execute coordinated exit animation with scroll positioning
   */
  private async executeCoordinatedExit(
    preloader: HTMLElement,
    pageWrapper: HTMLElement,
    originalWidth: string,
    scrollTarget: number
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const preloaderHeight = preloader.offsetHeight;

      const tl = gsap.timeline({
        onComplete: () => {
          // Clean up
          pageWrapper.style.position = 'static';
          pageWrapper.style.width = originalWidth;
          pageWrapper.style.transform = 'none';
          document.body.classList.remove('loading');

          // Remove preloader
          preloader.remove();

          // Set completed state
          this.setState(PreloaderState.COMPLETED);

          // Clean up resources and event listeners
          this.cleanup();

          resolve();
        },
      });

      // Coordinated slide animation with scroll positioning
      tl.to(preloader, {
        y: -preloaderHeight,
        duration: this.exitAnimationDuration,
        ease: 'expo.inOut',
      })
        .to(
          pageWrapper,
          {
            y: 0,
            duration: this.exitAnimationDuration,
            ease: 'expo.inOut',
          },
          '<'
        )
        .to(
          window,
          {
            scrollTo: {
              y: scrollTarget,
              autoKill: false,
            },
            duration: this.exitAnimationDuration,
            ease: 'expo.inOut',
          },
          '<'
        );
    });
  }

  /**
   * Public method to start the preloader
   */
  async playPreloader(): Promise<void> {
    // Check if we should use modified preloader sequence for direct links
    if (directLinkHandler.shouldUseModifiedPreloader()) {
      loadingCoordinator.setPreloaderState(GlobalPreloaderState.IN_PROGRESS);
      return this.executeLogoOnlySequence();
    }

    // Skip for legal page
    if (
      window.location.pathname.includes('/legal') ||
      window.location.href.includes('/legal') ||
      document.body.getAttribute('data-barba-namespace') === 'legal'
    ) {
      document.body.classList.remove('loading');
      loadingCoordinator.skipPreloader();
      return this.skipPreloader();
    }

    // Set IN_PROGRESS state immediately to block other loading
    loadingCoordinator.setPreloaderState(GlobalPreloaderState.IN_PROGRESS);

    // Prevent multiple initializations
    if (this.state !== PreloaderState.IDLE && this.state !== PreloaderState.COMPLETED) {
      return this.preloaderPromise || Promise.resolve();
    }

    // Reset to IDLE if we were previously COMPLETED
    if (this.state === PreloaderState.COMPLETED) {
      this.setState(PreloaderState.IDLE);
    }

    // Create promise
    this.preloaderPromise = this._playPreloader();
    return this.preloaderPromise;
  }

  /**
   * Internal implementation
   */
  private async _playPreloader(): Promise<void> {
    // Record start time
    this.startTimestamp = Date.now();

    // Initialize play timing variables
    this.accumulatedPlayTime = 0;
    this.playStartTime = 0;
    this.requiredPlayDuration = 0;
    this.videoElement = null;
    this.videoCover = null;

    // Check initial visibility
    this.isPageVisible = this.checkPageVisibility();

    // Initialize styles
    this.init();

    // Get elements
    const preloader = document.querySelector('.preloader-container') as HTMLElement;
    if (!preloader) {
      this.setState(PreloaderState.COMPLETED);
      return;
    }

    // Create cover div immediately
    this.createCover(preloader);

    const video = preloader.querySelector('.preloader-video') as HTMLVideoElement;
    const pageWrapper = document.querySelector('.page-wrapper') as HTMLElement;

    // Failsafe: If page wrapper missing, exit
    if (!pageWrapper) {
      this.setState(PreloaderState.COMPLETED);
      if (preloader) {
        document.body.classList.remove('loading');
        preloader.remove();
      }
      return;
    }

    // Save original styles
    const computedStyle = window.getComputedStyle(pageWrapper);
    const originalWidth = computedStyle.width;

    // Set loading class
    document.body.classList.add('loading');

    // Position page wrapper
    const preloaderHeight = preloader.offsetHeight;
    gsap.set(pageWrapper, {
      y: preloaderHeight,
      position: 'fixed',
      width: '100%',
      opacity: 1,
      visibility: 'visible',
    });

    // Initialize frame detection flags
    (window as any).__videoPlayingStarted = false;
    (window as any).__videoFramesConfirmed = false;

    // STRICT KILLSWITCH:
    const killswitch = setTimeout(() => {
      // Only trigger if frames aren't confirmed yet
      if (
        !(window as any).__videoFramesConfirmed &&
        this.state !== PreloaderState.EXITING &&
        this.state !== PreloaderState.COMPLETED
      ) {
        // Pause video if playing
        if (video && !video.paused) {
          try {
            video.pause();
          } catch (e) {
            // Ignore errors
          }
        }

        // Start exit
        this.setState(PreloaderState.EXITING);
        this.executeExit(preloader, pageWrapper, video || null, originalWidth);
      }
    }, 2500);

    // Master safety timeout (absolute last resort)
    this.masterSafetyTimeout = setTimeout(
      () => {
        if (this.state !== PreloaderState.COMPLETED) {
          // Execute exit
          if (this.state !== PreloaderState.EXITING) {
            this.executeExit(preloader, pageWrapper, video || null, originalWidth).catch(() => {
              this.emergencyCleanup(preloader, pageWrapper, video || null, originalWidth);
            });
          }
        }
      },
      this.maxLoadTime + this.maxPlayTime + 2000
    );

    try {
      // Reset flags
      this.hlsInitialized = false;
      let videoInitialized = false;

      // Process video
      if (video) {
        video.crossOrigin = 'anonymous';

        // Try HLS if URL provided
        const hlsUrl = video.getAttribute('data-hls-src');
        if (hlsUrl) {
          const hlsStartTime = Date.now();

          try {
            // Wrap in timeout
            const hlsPromise = initializeHLSVideo(video, hlsUrl);
            const timeoutPromise = new Promise<void>((_, reject) => {
              setTimeout(() => reject(new Error('HLS timeout')), this.maxLoadTime);
            });

            await Promise.race([hlsPromise, timeoutPromise]);

            this.hlsInitialized = true;
            videoInitialized = true;
          } catch (error) {
            this.hlsInitialized = false;
          }
        }

        // Try standard method if HLS failed
        if (!videoInitialized && this.state !== PreloaderState.EXITING) {
          try {
            // Wrap in timeout
            const prepPromise = this.prepareVideo(video);
            const timeoutPromise = new Promise<void>((_, reject) => {
              setTimeout(() => reject(new Error('Video preparation timeout')), this.maxLoadTime);
            });

            await Promise.race([prepPromise, timeoutPromise]);

            videoInitialized = true;
          } catch (error) {
            videoInitialized = false;
          }
        }

        // Play video if initialized and not exiting
        if (videoInitialized && this.state !== PreloaderState.EXITING) {
          try {
            // Wait for actual frames to display
            await this.detectVideoPlayback(video);

            // Only proceed if not already exiting
            if (this.state !== PreloaderState.EXITING && this.state !== PreloaderState.COMPLETED) {
              // Set playing state
              this.setState(PreloaderState.PLAYING);

              // Calculate play duration
              const playDuration = this.calculatePlayDuration(video);

              // Wait for calculated duration
              await this.waitForPlayDuration(video, playDuration);

              // If still playing, start exit
              if (this.state === PreloaderState.PLAYING || this.state === PreloaderState.PAUSED) {
                await this.executeExit(preloader, pageWrapper, video, originalWidth);
              }
            }
          } catch (error) {
            // Handle exit if not already exiting
            if (this.state !== PreloaderState.EXITING && this.state !== PreloaderState.COMPLETED) {
              this.setState(PreloaderState.EXITING);
              await this.executeExit(preloader, pageWrapper, video, originalWidth);
            }
          }
        } else if (
          this.state !== PreloaderState.EXITING &&
          this.state !== PreloaderState.COMPLETED
        ) {
          // Video couldn't be initialized
          this.setState(PreloaderState.EXITING);
          await this.executeExit(preloader, pageWrapper, video, originalWidth);
        }
      } else {
        // No video element
        await new Promise((resolve) => setTimeout(resolve, 500)); // Brief delay

        if (this.state !== PreloaderState.EXITING && this.state !== PreloaderState.COMPLETED) {
          this.setState(PreloaderState.EXITING);
          await this.executeExit(preloader, pageWrapper, null, originalWidth);
        }
      }

      // Clear killswitch
      clearTimeout(killswitch);
    } catch (error) {
      // Final catch-all error handler
      // Clear killswitch
      clearTimeout(killswitch);

      // Emergency cleanup if not already completed
      if (this.state !== PreloaderState.COMPLETED) {
        this.emergencyCleanup(preloader, pageWrapper, video || null, originalWidth);
      }
    } finally {
      // Clear promise reference
      this.preloaderPromise = null;
    }
  }
}

export default VideoPreloader;
