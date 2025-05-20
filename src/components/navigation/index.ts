import {
  animateBackgroundToActiveLink,
  blockActivePageClicks,
  createActiveLinkBackground,
  getActiveLinkBackground,
  getSlideDirection,
  setActiveLinkBackground,
  setInitialPosition,
} from './ActiveLinkBackground';
import { areClicksBlocked, blockClicks, createClickBlocker, unblockClicks } from './ClickBlocker';

export {
  // ActiveLinkBackground exports
  animateBackgroundToActiveLink,
  // ClickBlocker exports
  areClicksBlocked,
  blockActivePageClicks,
  blockClicks,
  createActiveLinkBackground,
  createClickBlocker,
  getActiveLinkBackground,
  getSlideDirection,
  setActiveLinkBackground,
  setInitialPosition,
  unblockClicks,
};

export default {
  createActiveLinkBackground,
  blockActivePageClicks,
  createClickBlocker,
};
