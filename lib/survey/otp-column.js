/** True when PostgREST/Supabase rejects otp_last_sent_at (column not migrated yet). */
export function isMissingOtpLastSentAtColumn(error) {
  const msg = String(error?.message ?? error ?? '');
  return (
    msg.includes('otp_last_sent_at') ||
    (msg.includes('schema cache') &&
      (msg.toLowerCase().includes('survey_responses') || msg.toLowerCase().includes('users')))
  );
}
