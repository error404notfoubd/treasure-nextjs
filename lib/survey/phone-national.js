/** Display grouping for NANP national digits (after fixed +1). */
export function formatNanpNationalDisplay(digits) {
  const d = String(digits).replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/** Build full number for validation/API: E.164 country code + national digits. */
export function composeSurveyPhoneE164(countryCode, nationalDigits) {
  const nd = String(nationalDigits).replace(/\D/g, '');
  let cc = String(countryCode || '+1').trim();
  if (!cc.startsWith('+')) cc = `+${cc.replace(/\D/g, '')}`;
  else cc = `+${cc.slice(1).replace(/\D/g, '')}`;
  return `${cc}${nd}`;
}
