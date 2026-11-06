export function isStandalone(): boolean {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so touch support is what tells them apart.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** There is no install prompt on iOS, so this is the moment to show the manual guide. */
export function shouldOfferInstallGuide(): boolean {
  return isIos() && !isStandalone();
}
