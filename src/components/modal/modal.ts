export class ModalManager {
  private modalTriggers: NodeListOf<Element>;
  private modal: HTMLElement | null;
  private closeButton: HTMLElement | null;
  private fadeInDuration: number = 300;
  private fadeOutDuration: number = 200;

  constructor() {
    this.initialize();
  }

  public initialize(): void {
    // Get elements
    this.modalTriggers = document.querySelectorAll('.modal-trigger');
    this.modal = document.querySelector('.modal-section');
    this.closeButton = document.querySelector('.modal-close');

    // Initialize modal state
    if (this.modal) {
      this.modal.style.opacity = '0';
      this.modal.style.display = 'none';
      this.modal.style.transition = `opacity ${this.fadeInDuration}ms ease`;
    }

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    // Click event listeners - all triggers
    if (this.modalTriggers) {
      this.modalTriggers.forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          this.openModal();
        });
      });
    }

    // Click event listener - close button
    if (this.closeButton) {
      this.closeButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal();
      });
    }

    // Close modal when clicking outside
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        // Only close if clicking directly on the modal background, not its children
        if (e.target === this.modal) {
          this.closeModal();
        }
      });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });
  }

  private openModal(): void {
    if (!this.modal) return;

    this.modal.style.display = 'flex';

    // Force a reflow for the transition to work properly
    this.modal.offsetHeight;

    // Fade in
    this.modal.style.opacity = '1';

    // Prevent page scrolling while modal is open
    document.body.style.overflow = 'hidden';
  }

  private closeModal(): void {
    if (!this.modal) return;

    // Fade out
    this.modal.style.opacity = '0';

    // Wait for animation to complete before hiding
    setTimeout(() => {
      if (this.modal) {
        this.modal.style.display = 'none';

        // Re-enable page scrolling
        document.body.style.overflow = '';
      }
    }, this.fadeOutDuration);
  }

  // Clean up event listeners when needed (e.g., page transitions)
  public destroy(): void {
    // Remove all event listeners
    if (this.modalTriggers) {
      this.modalTriggers.forEach((trigger) => {
        trigger.replaceWith(trigger.cloneNode(true));
      });
    }

    if (this.closeButton) {
      this.closeButton.replaceWith(this.closeButton.cloneNode(true));
    }

    if (this.modal) {
      this.modal.replaceWith(this.modal.cloneNode(true));
    }
  }
}

// Singleton pattern for modal management
let instance: ModalManager | null = null;

export const initializeModal = (): ModalManager => {
  if (instance) {
    instance.destroy();
  }
  instance = new ModalManager();
  return instance;
};

export const destroyModal = (): void => {
  if (instance) {
    instance.destroy();
    instance = null;
  }
};

export default { initializeModal, destroyModal };
