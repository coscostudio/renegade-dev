import { gsap } from 'gsap';

import { WebGLGrid } from './WebGLGrid';

export class ArchiveView {
  private container: HTMLElement;
  private scene: WebGLGrid | null = null;
  private images: any[] = [];
  public isTransitioning = false;
  private isDestroyed = false;
  private rafId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private zoomUI: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private boundHandleResize: () => void;
  private introDelayed = false; // Flag to track if intro should be delayed
  private introTimer: any = null; // Timer for delayed intro

  constructor(container: HTMLElement, delayIntro = false) {
    this.container = container;
    this.introDelayed = delayIntro;

    // Find all images from CMS for use in grid
    const imageElements = Array.from(container.querySelectorAll('.cms-image'));

    // Always use all images, regardless of device
    this.images = imageElements.map((img) => {
      const imgEl = img as HTMLImageElement;
      return {
        file: {
          url: imgEl.src,
          details: {
            image: {
              width: imgEl.naturalWidth || 800,
              height: imgEl.naturalHeight || 1200,
            },
          },
          contentType: 'image/jpeg',
          color: '#0F0F0F',
        },
      };
    });

    // Bind the resize handler once to preserve reference
    this.boundHandleResize = this.handleResize.bind(this);

    // Setup DOM and styles
    this.setupDOM();
  }

  // New method to trigger the delayed intro sequence
  public triggerIntroSequence(): void {
    if (!this.scene || this.isDestroyed) return;

    // Don't trigger if intro is already shown
    if (this.scene.isIntroShown) {
      return;
    }

    // Clear any pending intro timer
    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }

    // Immediately make loader background transparent to make grid visible
    const gridLoaderOverlay = document.querySelector('.grid-loader-overlay');
    if (gridLoaderOverlay) {
      // Make background transparent but keep loading text visible
      gridLoaderOverlay.style.backgroundColor = 'transparent';

      // Begin fade out of text (but not complete removal yet)
      const loader = gridLoaderOverlay.querySelector('.grid-loader');
      if (loader && loader.classList.contains('is-loading')) {
        gsap.to(loader, {
          opacity: 0.5, // Reduce opacity but don't fully hide yet
          duration: 0.25,
          ease: 'power2.out',
        });
      }
    }

    // Start the intro sequence in the WebGL grid
    this.scene.startIntroSequence();

    // Show the grid now that intro is starting
    this.show();
  }

  private setupDOM(): void {
    // Create a dedicated container for the archive grid
    const archiveContainer = document.createElement('div');
    archiveContainer.className = 'archive-container';
    archiveContainer.id = 'archive-container';
    archiveContainer.style.position = 'fixed';
    archiveContainer.style.top = '0';
    archiveContainer.style.left = '0';
    archiveContainer.style.width = '100vw';
    archiveContainer.style.height = '100vh';
    archiveContainer.style.backgroundColor = '#0F0F0F';
    archiveContainer.style.zIndex = '10';
    archiveContainer.style.overflow = 'hidden';

    // Create canvas with id 'c'
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'c';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.backgroundColor = '#0F0F0F';
    archiveContainer.appendChild(this.canvas);

    // Create zoom UI
    this.zoomUI = document.createElement('div');
    this.zoomUI.className = 'archiveZoomUI';
    this.zoomUI.style.position = 'fixed';
    this.zoomUI.style.zIndex = '999';
    this.zoomUI.style.display = 'flex';
    this.zoomUI.style.bottom = '2rem';
    this.zoomUI.style.left = '50%';
    this.zoomUI.style.transform = 'translateX(-50%)';
    this.zoomUI.style.opacity = '0';
    this.zoomUI.style.transition = 'opacity 0.3s ease';

    // Create zoom out button
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'archiveZoomUI__button';
    zoomOutBtn.setAttribute('data-action', 'zoom-out');
    zoomOutBtn.style.width = '40px';
    zoomOutBtn.style.height = '40px';
    zoomOutBtn.style.padding = '10px';
    zoomOutBtn.style.backgroundColor = '#424242';
    zoomOutBtn.style.border = 'none';
    zoomOutBtn.style.cursor = 'pointer';
    zoomOutBtn.style.display = 'flex';
    zoomOutBtn.style.alignItems = 'center';
    zoomOutBtn.style.justifyContent = 'center';
    zoomOutBtn.style.color = 'white';
    zoomOutBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="2" viewBox="0 0 18 2" fill="none">
  <path d="M1.43994 1H16.5599" stroke="#F3F2F0" stroke-width="1.62" stroke-linecap="square" stroke-linejoin="round"/>
</svg>
    `;

    // Create zoom in button
    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'archiveZoomUI__button';
    zoomInBtn.setAttribute('data-action', 'zoom-in');
    zoomInBtn.style.width = '40px';
    zoomInBtn.style.height = '40px';
    zoomInBtn.style.padding = '10px';
    zoomInBtn.style.backgroundColor = '#424242';
    zoomInBtn.style.border = 'none';
    zoomInBtn.style.cursor = 'pointer';
    zoomInBtn.style.display = 'flex';
    zoomInBtn.style.alignItems = 'center';
    zoomInBtn.style.justifyContent = 'center';
    zoomInBtn.style.color = 'white';
    zoomInBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
  <path d="M8.99994 1.43945V16.5595M1.43994 8.99945H16.5599" stroke="#F3F2F0" stroke-width="1.62" stroke-linecap="square" stroke-linejoin="round"/>
</svg>
    `;

    this.zoomUI.appendChild(zoomOutBtn);
    this.zoomUI.appendChild(zoomInBtn);

    // Add event listeners for zoom buttons
    zoomOutBtn.addEventListener('click', () => {
      if (this.scene?.isIntroShown) {
        this.scene.zoom('zoom-out');
      }
    });

    zoomInBtn.addEventListener('click', () => {
      if (this.scene?.isIntroShown) {
        this.scene.zoom('zoom-in');
      }
    });

    // Add to the container
    this.container.appendChild(this.zoomUI);

    // Add the archive container to the container
    this.container.appendChild(archiveContainer);

    // Set up resize observer
    this.setupResizeObserver(archiveContainer);
  }

  // Set up a ResizeObserver to handle container resizing
  private setupResizeObserver(container: HTMLElement): void {
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === container && this.scene) {
            // The container has been resized, update the WebGLGrid
            this.scene.setWindow();
          }
        }
      });
      this.resizeObserver.observe(container);
    } else {
      // Fallback for browsers without ResizeObserver
      window.addEventListener('resize', this.boundHandleResize);
    }
  }

  // Resize handler for fallback
  private handleResize = (): void => {
    if (this.scene) {
      this.scene.setWindow();
    }
  };

  public async init(): Promise<void> {
    try {
      this.isTransitioning = true;

      // Ensure canvas exists
      if (!this.canvas) {
        this.canvas = document.getElementById('c') as HTMLCanvasElement;
        if (!this.canvas) {
          throw new Error('Canvas not found');
        }
      }

      // Detect if mobile for WebGLGrid initialization
      const isMobile = this.isMobileViewport();

      // Create WebGL grid with the introDelayed flag
      this.scene = new WebGLGrid(this.canvas, this.images, isMobile, this.introDelayed);

      // Register callback for when intro is mostly done
      this.scene.onIntroMostlyDone = () => {
        this.showZoomUI();
      };

      // Start rendering loop
      this.startRenderLoop();

      this.isTransitioning = false;
    } catch (error) {
      this.isTransitioning = false;
      throw error;
    }
  }

  private isMobileViewport(): boolean {
    return window.innerWidth <= 960;
  }

  private startRenderLoop(): void {
    // Cancel any existing animation frame
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    // Update function that calls itself recursively
    const update = () => {
      if (this.isDestroyed) return;

      if (this.scene) {
        this.scene.render();
      }
      this.rafId = requestAnimationFrame(update);
    };

    // Start the loop
    this.rafId = requestAnimationFrame(update);
  }

  public show(): void {
    if (!this.scene) {
      return;
    }

    // Show container
    const archiveContainer = document.getElementById('archive-container');
    if (archiveContainer) {
      gsap.to(archiveContainer, {
        autoAlpha: 1,
        duration: 0.5,
        ease: 'power2.inOut',
      });
    }

    // Immediately make loader background transparent to let grid show through
    const gridLoaderOverlay = document.querySelector('.grid-loader-overlay');
    if (gridLoaderOverlay) {
      // Make background transparent immediately
      gridLoaderOverlay.style.backgroundColor = 'transparent';

      // Fade out with timing that matches intro sequence
      gsap.to(gridLoaderOverlay, {
        opacity: 0,
        delay: 1.5,
        duration: 1.2,
        ease: 'power2.inOut',
        onComplete: () => {
          if (gridLoaderOverlay.parentNode) {
            gridLoaderOverlay.parentNode.removeChild(gridLoaderOverlay);
          }
        },
      });
    }

    // Note: The zoom UI is shown by the WebGLGrid intro animation callback
  }

  // Method to show zoom UI when WebGLGrid calls back
  public showZoomUI(): void {
    if (this.zoomUI) {
      gsap.to(this.zoomUI, {
        opacity: 1,
        duration: 0.75,
        ease: 'power2.inOut',
      });
    }

    // Force-remove any loader that might still be visible
    const gridLoaderOverlay = document.querySelector('.grid-loader-overlay');
    if (gridLoaderOverlay && gridLoaderOverlay.parentNode) {
      // Force immediate removal, no animation
      gridLoaderOverlay.parentNode.removeChild(gridLoaderOverlay);
    }
  }

  public async fadeOut(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Mark as transitioning
      this.isTransitioning = true;

      // Create consistent timing with other page transitions
      const duration = 0.8;
      const ease = 'power2.inOut';

      // Fade out container
      const archiveContainer = document.getElementById('archive-container');
      if (archiveContainer) {
        // Apply a fade to the grid container and its contents
        gsap.to(archiveContainer, {
          opacity: 0,
          duration: duration,
          ease: ease,
          onComplete: () => {
            this.isTransitioning = false;
            resolve();
          },
        });
      } else {
        this.isTransitioning = false;
        resolve();
      }

      // Fade out zoom UI with the same timing
      if (this.zoomUI) {
        gsap.to(this.zoomUI, {
          opacity: 0,
          duration: duration,
          ease: ease,
        });
      }

      // Also apply grayscale effect on the WebGL grid if possible
      if (this.scene) {
        try {
          // Just increase the existing grayscale property to 1
          gsap.to(this.scene, {
            grayscale: 1,
            duration: duration,
            ease: ease,
            onUpdate: () => {
              // Force a render to update the grayscale effect
              this.scene?.render();
            },
          });
        } catch (e) {}
      }
    });
  }

  public destroy(): void {
    // Prevent multiple destroy calls
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Stop rendering immediately (doesn't affect visuals)
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Clean up resize observer (doesn't affect visuals)
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener('resize', this.boundHandleResize);
    }

    // Clean up any intro timer
    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }

    // Schedule resource cleanup for AFTER transitions complete
    setTimeout(() => {
      // Cleanup WebGL resources
      if (this.scene) {
        try {
          this.scene.destroy();
          this.scene = null;
        } catch (e) {}
      }

      // Only remove DOM elements after transitions are complete
      setTimeout(() => {
        try {
          const archiveContainer = document.getElementById('archive-container');
          if (archiveContainer) {
            archiveContainer.remove();
          }

          if (this.zoomUI) {
            this.zoomUI.remove();
            this.zoomUI = null;
          }

          // Explicitly null out the canvas reference
          this.canvas = null;

          // Clear image references to help garbage collection
          this.images = [];
        } catch (e) {}
      }, 300);
    }, 800);
  }
}
