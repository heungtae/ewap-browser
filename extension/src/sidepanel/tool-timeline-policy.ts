/**
 * An Act proposal owns the visible lifecycle of its approved action. Keeping
 * that lifecycle on the proposal avoids presenting execution as a second,
 * unrelated card. Read-only tools have no proposal and remain timeline items.
 */
export const shouldRenderToolTimelineCard = (
  hasActionReview: boolean,
): boolean => !hasActionReview;
