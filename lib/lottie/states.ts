// lib/lottie/states.ts
// Central map of the Aurora Flow Lottie states.
// Every state has a static (icon/CSS) fallback rendered underneath the
// animation by the consuming component — see components/ui/EmptyState.tsx
// and components/ui/Toast.tsx — so the UI stays coherent when Lottie is
// slow, disabled, or reduced-motion is requested.

import goodsaleLoader from './goodsale-loader.json';
import escrowShield from './escrow-shield.json';
import successCheck from './success-check.json';
import emptySearch from './empty-search.json';
import emptyCart from './empty-cart.json';
import emptyChat from './empty-chat.json';
import errorState from './error-state.json';

export type LottieState =
  | 'loader'
  | 'escrow'
  | 'success'
  | 'empty-search'
  | 'empty-cart'
  | 'empty-chat'
  | 'error';

export const lottieStates: Record<LottieState, unknown> = {
  loader: goodsaleLoader,
  escrow: escrowShield,
  success: successCheck,
  'empty-search': emptySearch,
  'empty-cart': emptyCart,
  'empty-chat': emptyChat,
  error: errorState,
};

export default lottieStates;
