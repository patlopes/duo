export function isStandalone(): boolean {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so touch support is what tells them apart.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/** Phones in a browser tab are who the install guide is for; desktop is secondary (spec 1). */
export function shouldOfferInstallGuide(): boolean {
  return (isIos() || isAndroid()) && !isStandalone();
}
