window.SentinelInputGuard = (() => {
  const externalPattern = /https?:\/\/|www\.|\b(?:subscribe|follow|like and share|thank you for watching|for more information|visit our|comments section|documentation requisition|sendaimedia|kenhu)\b|اشتركوا? في القناة|اشترك في القناة/i;

  function check(value) {
    const text = String(value || '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    if (externalPattern.test(text)) return { ok: false, reason: 'external' };
    if (!/[\u0600-\u06FF]/.test(text)) return { ok: false, reason: 'not_arabic' };
    return { ok: true, reason: 'arabic' };
  }

  return { check };
})();
