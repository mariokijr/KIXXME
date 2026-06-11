// Detect Apple/iOS devices so the "Continuar con Apple" button only shows there
// (Apple's guidelines require Sign in with Apple on iOS when other social logins
// are offered, and we keep it iPhone-only per product requirement).
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOS =
    navigator.platform === "MacIntel" &&
    typeof (navigator as any).maxTouchPoints === "number" &&
    (navigator as any).maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}
