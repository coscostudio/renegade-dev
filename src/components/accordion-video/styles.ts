export function addAccordionStyles(): void {
  // Check if styles have already been added
  if (document.getElementById('accordion-styles')) {
    return;
  }

  // Add loading indicators styles with no transitions (will be handled by JS)
  const loadingStyle = document.createElement('style');
  loadingStyle.id = 'accordion-loading-styles';
  loadingStyle.textContent = `
      .accordion-loader {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #fafafa;
        z-index: 3; /* Higher z-index to ensure it appears above video */
        opacity: 0;
        visibility: hidden;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        pointer-events: none; /* Ensure it doesn't interfere with clicks */
      }
  
      /* No transitions or opacity changes here - JS will handle that */
      .accordion-loader.is-loading {
      }
  
      @keyframes loadingDots {
        0% { content: '.'; }
        33% { content: '..'; }
        66% { content: '...'; }
      }
  
      .accordion-loader::before {
        content: 'loading';
        display: inline-block;
      }
      
      .accordion-loader::after {
        content: '.';
        display: inline-block;
        animation: loadingDots .75s infinite;
        min-width: 24px;
      }
    `;
  document.head.appendChild(loadingStyle);

  // Add accordion component styles
  const accordionStyle = document.createElement('style');
  accordionStyle.id = 'accordion-styles';
  accordionStyle.textContent = `
      .js-accordion-item {
        min-height: 4rem;
        background-color: transparent;
        transition: background-color 0.3s ease, color 0.3s ease;
        font-size: 0;
        line-height: 0;
        position: relative;
        border-top: 0.5rem solid #fafafa;
        overflow: hidden;
      }
      
      @media (max-width: 768px) {
        .js-accordion-item {
          min-height: 6.125rem;
        }
      }
      
      .js-accordion-item > * {
        font-size: 1rem;
        line-height: normal;
        transition: color 0.3s ease; /* Add transition for all child elements */
      }
      
      /* Modify hover styles to only apply on non-touch devices */
      @media (hover: hover) {
        .js-accordion-item:not(.active):hover {
          background-color: #fafafa !important;
          color: #0F0F0F !important;
        }
        
        /* Change text color for all content within the accordion item */
        .js-accordion-item:not(.active):hover * {
          color: #0F0F0F !important;
        }
      }
      
      /* For touch devices, add a class-based approach instead */
      .js-accordion-item.hover-state {
        background-color: #fafafa !important;
        color: #0F0F0F !important;
      }
      
      /* Change text color for touch devices */
      .js-accordion-item.hover-state * {
        color: #0F0F0F !important;
      }
      
      .js-accordion-item.active {
        min-height: 4rem;
        background-color: #0F0F0F !important;
        color: #fafafa !important;
        border-top: none !important;
      }
      
      .js-accordion-item.active * {
        color: #fafafa !important;
      }
      
      @media (max-width: 768px) {
        .js-accordion-item.active {
          min-height: 6.125rem;
        }
      }
   
      .js-accordion-item.active + .js-accordion-item {
        border-top: none !important;
      }
      
      .js-accordion-body {
        top: -1px !important;
        height: calc(101vh + 1rem);
        height: calc(101dvh + 1rem);
        width: 100%;
        margin: 0;
        padding: 0;
        position: absolute;
        background-color: #0F0F0F;
        display: none;
        vertical-align: top;
        line-height: 0;
        top: 0;
        left: 0;
        will-change: height;
        transform-origin: top;
      }
      
      .js-accordion-body * {
        line-height: 0;
      }
      
      .js-accordion-body .event-video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        object-fit: cover;
        display: block;
        z-index: 1;
      }
    `;
  document.head.appendChild(accordionStyle);
}
