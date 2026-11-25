/**
 * Trees Pinyin Storybook Library — Membership Gating & Media URL Resolver
 * Connects to existing/future Trees Pinyin subscription state in localStorage
 * and provides unified Cloudflare R2 / local relative media URL resolution.
 */
(function (global) {
  const PRO_STORAGE_KEYS = [
    'tp_pro_member',
    'tp_subscription_active',
    'tp_member_token'
  ];

  // Validated local/demo access codes or future backend token hook
  const VALID_LOCAL_CODES = ['TREESPRO', 'DEER2026', 'TPFAMILY'];

  function checkUrlProFlag() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('pro') === '1') return true;
      if (params.get('pro') === '0') return false;
    } catch (e) {}
    return null;
  }

  function isProMember() {
    const urlFlag = checkUrlProFlag();
    if (urlFlag !== null) return urlFlag;
    try {
      for (const key of PRO_STORAGE_KEYS) {
        const val = (localStorage.getItem(key) || '').trim().toLowerCase();
        if (val && val !== '0' && val !== 'false' && val !== 'none' && val !== 'expired') {
          return true;
        }
      }
      // Also honor JSON membership object if set by main site auth flow
      const rawProfile = localStorage.getItem('tp_member_profile');
      if (rawProfile) {
        const profile = JSON.parse(rawProfile);
        if (profile && (profile.isPro === true || profile.tier === 'pro' || profile.status === 'active')) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function setLocalProStatus(active, codeOrToken = 'active') {
    try {
      if (active) {
        localStorage.setItem('tp_pro_member', 'true');
        localStorage.setItem('tp_subscription_active', codeOrToken || 'active');
      } else {
        PRO_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
        localStorage.removeItem('tp_member_profile');
      }
    } catch (e) {}
  }

  function activateWithCode(inputCode) {
    const clean = String(inputCode || '').trim().toUpperCase();
    if (!clean) return { ok: false, message: 'Please enter your member access code.' };
    if (VALID_LOCAL_CODES.includes(clean) || /^TPPRO-[A-Z0-9]{4,}$/.test(clean)) {
      setLocalProStatus(true, clean);
      return { ok: true, message: 'Pro Membership unlocked! Enjoy the full library.' };
    }
    return { ok: false, message: 'Code not recognized. Please check your confirmation email or subscribe.' };
  }

  function canReadPage(bookEntry, pageIndex) {
    if (!bookEntry || !bookEntry.isPro) return true;
    const freePages = typeof bookEntry.freePages === 'number' ? bookEntry.freePages : 3;
    if (pageIndex < freePages) return true;
    return isProMember();
  }

  function resolveMediaUrl(mediaBaseUrl, assetPath) {
    if (!assetPath) return '';
    const trimmed = String(assetPath).trim();
    if (!trimmed) return '';
    if (/^(https?:\/\/|data:|blob:|\/)/i.test(trimmed)) return trimmed;
    const cleanAsset = trimmed.replace(/^\.\//, '');
    if (!mediaBaseUrl) return cleanAsset;
    const base = String(mediaBaseUrl).endsWith('/') ? String(mediaBaseUrl) : `${mediaBaseUrl}/`;
    return `${base}${cleanAsset}`;
  }

  global.TreesStoriesMembership = {
    isProMember,
    setLocalProStatus,
    activateWithCode,
    canReadPage,
    resolveMediaUrl
  };
})(typeof window !== 'undefined' ? window : self);
