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

  // Add accordion component styles - minimal since Webflow handles layout
  const accordionStyle = document.createElement('style');
  accordionStyle.id = 'accordion-styles';
  accordionStyle.textContent = `
      /* DON'T modify .accordion or .js-accordion - Webflow handles flexbox/gap */
      
      .js-accordion-item {
        /* Don't modify background, margins, or gaps - Webflow handles this */
        min-height: 4rem;
        transition: background-color 0.3s ease, color 0.3s ease;
        font-size: 0;
        line-height: 0;
        position: relative;
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
        transition: color 0.3s ease;
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
      }
      
      .js-accordion-item.active * {
        color: #fafafa !important;
      }
      
      @media (max-width: 768px) {
        .js-accordion-item.active {
          min-height: 6.125rem;
        }
      }
      
      .js-accordion-body {
        top: 0;
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
        left: 0;
        will-change: height;
        transform-origin: top;
      }
      
      .js-accordion-body * {
        line-height: 0;
      }
      
      .js-accordion-body .event-video {
        position: absolute;
        /* Extend video by 0.5px on top and bottom to cover gaps */
        top: -0.5px;
        left: 0;
        width: 100%;
        height: calc(100% + 1px); /* +1px total (0.5px top + 0.5px bottom) */
        margin: 0;
        padding: 0;
        object-fit: cover;
        display: block;
        z-index: 1;
      }
    `;
  document.head.appendChild(accordionStyle);
}
