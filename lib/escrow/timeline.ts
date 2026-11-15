// lib/escrow/timeline.ts — Canonical Buyer-First Escrow Timeline derivation
import {
  OrderStatus,
  type Delivery,
  type Order,
  type SafeMeetMeetup,
} from '@/lib/types';
import { canBuyerReviewProof } from './proofAndSplit';

export type EscrowStepKey = 'escrow' | 'proof' | 'dispatch' | 'handover';
export type EscrowStepState = 'done' | 'current' | 'upcoming' | 'issue';

export interface EscrowTimelineStep {
  key: EscrowStepKey;
  label: string;
  detail: string;
  state: EscrowStepState;
}

export interface EscrowTimelineModel {
  mode: 'ACTIVE' | 'COMPLETED' | 'TERMINAL_ISSUE';
  headline: string;
  sublabel: string;
  activeStepIndex: 0 | 1 | 2 | 3;
  splitPayPending: boolean;
  canApproveProof: boolean;
  canReleaseWithPin: boolean;
  steps: EscrowTimelineStep[];
}

function formatNaira(amount: number): string {
  return `₦${Math.max(0, Math.round(amount)).toLocaleString()}`;
}

export function deriveEscrowTimeline(params: {
  order: Order;
  delivery?: Delivery;
  meetup?: SafeMeetMeetup;
}): EscrowTimelineModel {
  const { order, delivery, meetup } = params;
  const isSafeMeet = Boolean(order.safeMeetLocationId) || order.deliveryMethod === 'SAFE_MEET';
  const splitPayPending =
    order.status === OrderStatus.PARTIAL_DEPOSIT_PAID &&
    Number(order.balanceRemaining || 0) > 0 &&
    !order.isBalanceSettled;

  const canApproveProof = canBuyerReviewProof(order);
  const canReleaseWithPin =
    [
      OrderStatus.PAID_ESCROW,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
    ].includes(order.status) && !splitPayPending;

  const isTerminalIssue = [
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
    OrderStatus.DISPUTED,
    OrderStatus.REFUND_REQUESTED,
  ].includes(order.status);

  const isPaymentPending = [
    OrderStatus.PENDING,
    OrderStatus.PENDING_BANK_TRANSFER,
    OrderStatus.INVOICE_SENT,
    OrderStatus.COD_PENDING,
  ].includes(order.status);

  const isCompleted = order.status === OrderStatus.DELIVERED_SUCCESS;

  const proof = order.dispatchProof;
  const deliveryInFlight =
    Boolean(delivery) &&
    [
      'PICKED_UP',
      'IN_TRANSIT',
      'ARRIVED_AT_HUB',
      'OUT_FOR_DELIVERY',
      'DELIVERY_ATTEMPTED',
    ].includes(delivery!.status);
  const deliveryAssigned =
    Boolean(delivery) &&
    ['RIDER_ASSIGNED', 'READY_FOR_PICKUP', 'AWAITING_RIDER'].includes(delivery!.status);
  const deliveryArrived = delivery?.status === 'DELIVERED';
  const meetupLive =
    Boolean(meetup) &&
    ['SCHEDULED', 'BUYER_ARRIVED', 'SELLER_ARRIVED'].includes(meetup!.status);
  const meetupDone = meetup?.status === 'COMPLETED';

  // Step 1: Escrow Held / Deposit
  const step1: EscrowTimelineStep = isPaymentPending
    ? {
        key: 'escrow',
        label: 'Escrow Lock',
        detail:
          order.status === OrderStatus.COD_PENDING
            ? 'Pay on delivery pending'
            : 'Complete payment to lock escrow',
        state: 'current',
      }
    : splitPayPending
      ? {
          key: 'escrow',
          label: 'Deposit Held',
          detail: `${formatNaira(order.balanceRemaining || 0)} balance left`,
          state: 'current',
        }
      : {
          key: 'escrow',
          label: 'Escrow Held',
          detail: `${formatNaira(order.totalAmount)} protected`,
          state: 'done',
        };

  // Step 2: Live Condition Proof
  const dispatchedOrDelivered =
    isCompleted ||
    order.status === OrderStatus.SHIPPED ||
    order.status === OrderStatus.OUT_FOR_DELIVERY ||
    deliveryInFlight ||
    deliveryArrived;

  const step2: EscrowTimelineStep =
    proof?.status === 'APPROVED'
      ? {
          key: 'proof',
          label: 'Live Proof',
          detail: 'Condition verified',
          state: 'done',
        }
      : proof?.status === 'SUBMITTED'
        ? {
            key: 'proof',
            label: 'Live Proof',
            detail: 'Review clip before dispatch',
            state: 'current',
          }
        : proof?.status === 'CHANGES_REQUESTED'
          ? {
              key: 'proof',
              label: 'Live Proof',
              detail: 'New photo/clip requested',
              state: 'current',
            }
          : dispatchedOrDelivered
            ? {
                key: 'proof',
                label: 'Live Proof',
                detail: 'Pre-dispatch window passed',
                state: 'done',
              }
            : step1.state === 'done'
              ? {
                  key: 'proof',
                  label: 'Live Proof',
                  detail: 'Seller preparing live check',
                  state: 'current',
                }
              : {
                  key: 'proof',
                  label: 'Live Proof',
                  detail: 'Pre-dispatch inspection',
                  state: 'upcoming',
                };

  // Step 3: Rider / SafeMeet
  const step3: EscrowTimelineStep =
    isCompleted || deliveryArrived || meetupDone
      ? {
          key: 'dispatch',
          label: isSafeMeet ? 'SafeMeet' : 'Rider',
          detail: isSafeMeet ? 'Meetup handover reached' : 'Delivered to destination',
          state: 'done',
        }
      : deliveryInFlight || order.status === OrderStatus.OUT_FOR_DELIVERY
        ? {
            key: 'dispatch',
            label: isSafeMeet ? 'SafeMeet' : 'Rider',
            detail:
              delivery?.status === 'OUT_FOR_DELIVERY'
                ? 'Courier arriving nearby'
                : 'Courier on the way',
            state: 'current',
          }
        : order.status === OrderStatus.SHIPPED || deliveryAssigned || meetupLive
          ? {
              key: 'dispatch',
              label: isSafeMeet ? 'SafeMeet' : 'Rider',
              detail: isSafeMeet
                ? meetup?.status === 'BUYER_ARRIVED' || meetup?.status === 'SELLER_ARRIVED'
                  ? 'Arrival check-in live'
                  : 'Verified meetup scheduled'
                : delivery?.courierName
                  ? `${delivery.courierName} assigned`
                  : 'Dispatched with tracking',
              state: 'current',
            }
          : {
              key: 'dispatch',
              label: isSafeMeet ? 'SafeMeet' : 'Rider',
              detail: isSafeMeet ? 'Escrow hub handover' : 'Courier dispatch',
              state: 'upcoming',
            };

  // Step 4: PIN Release & Instant Payout
  const step4: EscrowTimelineStep = isCompleted
    ? {
        key: 'handover',
        label: 'PIN Release',
        detail: 'Completed & funds released',
        state: 'done',
      }
    : deliveryArrived || order.status === OrderStatus.OUT_FOR_DELIVERY
      ? {
          key: 'handover',
          label: 'PIN Release',
          detail: splitPayPending ? 'Settle balance first' : 'Inspect & share 6-digit PIN',
          state: 'current',
        }
      : {
          key: 'handover',
          label: 'PIN Release',
          detail: 'Protected until confirmed',
          state: 'upcoming',
        };

  const steps: EscrowTimelineStep[] = [step1, step2, step3, step4];

  if (isTerminalIssue) {
    const issueIdx: 0 | 1 | 2 | 3 =
      order.status === OrderStatus.CANCELLED
        ? 0
        : order.status === OrderStatus.DISPUTED || order.status === OrderStatus.REFUND_REQUESTED
          ? 3
          : 3;

    steps[issueIdx] = {
      ...steps[issueIdx],
      state: 'issue',
      detail:
        order.status === OrderStatus.DISPUTED
          ? 'Dispute under escrow review'
          : order.status === OrderStatus.REFUND_REQUESTED
            ? 'Refund review active'
            : order.status === OrderStatus.REFUNDED
              ? 'Refunded to buyer'
              : 'Order cancelled',
    };

    const headline =
      order.status === OrderStatus.DISPUTED
        ? 'Escrow frozen · Dispute active'
        : order.status === OrderStatus.REFUND_REQUESTED
          ? 'Refund requested · Escrow held'
          : order.status === OrderStatus.REFUNDED
            ? 'Refund completed'
            : 'Order cancelled';

    const sublabel =
      order.status === OrderStatus.DISPUTED || order.status === OrderStatus.REFUND_REQUESTED
        ? 'Funds remain locked safely while Trust & Safety resolves the claim.'
        : 'No further handover or PIN action is required for this order.';

    return {
      mode: 'TERMINAL_ISSUE',
      headline,
      sublabel,
      activeStepIndex: issueIdx,
      splitPayPending,
      canApproveProof: false,
      canReleaseWithPin: false,
      steps,
    };
  }

  if (isCompleted) {
    return {
      mode: 'COMPLETED',
      headline: 'Delivered & escrow released',
      sublabel: 'PIN confirmed — seller payout settled.',
      activeStepIndex: 3,
      splitPayPending: false,
      canApproveProof: false,
      canReleaseWithPin: false,
      steps,
    };
  }

  // Derive active step index & actionable headline
  let activeStepIndex: 0 | 1 | 2 | 3 = 0;
  let headline = 'Escrow protection ready';
  let sublabel = 'Payment is locked safely until you confirm handover with your 6-digit PIN.';

  if (isPaymentPending) {
    activeStepIndex = 0;
    headline = 'Complete payment to lock escrow';
    sublabel = 'Seller will only prepare dispatch after escrow secures your funds.';
  } else if (splitPayPending) {
    activeStepIndex = 0;
    headline = `Split-pay deposit held · ${formatNaira(order.balanceRemaining || 0)} left`;
    sublabel = 'Settle the remaining balance before releasing your delivery PIN.';
  } else if (canApproveProof) {
    activeStepIndex = 1;
    headline = 'Action needed · Review live condition proof';
    sublabel = 'Inspect the seller’s photo/video and approve before the courier sets off.';
  } else if (deliveryArrived || order.status === OrderStatus.OUT_FOR_DELIVERY) {
    activeStepIndex = 3;
    headline = 'Final check · Confirm with your 6-digit PIN';
    sublabel = 'Inspect the item in person first, then share or enter your PIN to release escrow.';
  } else if (step3.state === 'current') {
    activeStepIndex = 2;
    headline = isSafeMeet ? 'SafeMeet™ handover live' : 'Rider en route with live tracking';
    sublabel = isSafeMeet
      ? 'Check in at the verified SafeMeet hub when you and the seller arrive.'
      : 'Keep your 6-digit PIN private until the item passes your physical inspection.';
  } else {
    activeStepIndex = 1;
    headline = 'Escrow locked · Waiting for seller proof & dispatch';
    sublabel = 'Ask the seller for a live photo/video or wait for courier pickup.';
  }

  return {
    mode: 'ACTIVE',
    headline,
    sublabel,
    activeStepIndex,
    splitPayPending,
    canApproveProof,
    canReleaseWithPin,
    steps,
  };
}
