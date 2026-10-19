export function isTrialExpired(colmado: { subscriptionStatus?: string; trialEndDate?: string } | null | undefined): boolean {
  if (colmado?.subscriptionStatus !== 'Trial') return false;
  const end = Date.parse(colmado.trialEndDate || '');
  return !Number.isFinite(end) || Date.now() >= end;
}

export function isSubscriptionBlocked(colmado: { subscriptionStatus?: string; trialEndDate?: string; suspensionNoticeEnabled?: boolean } | null | undefined): boolean {
  return colmado?.suspensionNoticeEnabled === true || colmado?.subscriptionStatus === 'Suspended' || colmado?.subscriptionStatus === 'Pending' || isTrialExpired(colmado);
}
