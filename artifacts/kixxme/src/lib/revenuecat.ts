import type {
  PurchasesOffering,
  PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { isNativeApp, nativePlatform } from "./native";

// Public RevenueCat SDK keys, injected at build time by vite (define). These are
// PUBLIC, platform-scoped keys (safe to embed in the client) — distinct from the
// secret REST key the server uses. Empty on the web build / when unset.
declare const __RC_IOS_KEY__: string;
declare const __RC_ANDROID_KEY__: string;

export type PlanKey = "plus_monthly" | "plus_annual" | "gold_monthly" | "gold_annual";
export type KixxmePackages = Record<PlanKey, PurchasesPackage | null>;

let configured = false;
let configurePromise: Promise<boolean> | null = null;

function platformApiKey(): string {
  const ios = typeof __RC_IOS_KEY__ === "string" ? __RC_IOS_KEY__ : "";
  const android = typeof __RC_ANDROID_KEY__ === "string" ? __RC_ANDROID_KEY__ : "";
  if (nativePlatform === "ios") return ios;
  if (nativePlatform === "android") return android;
  return "";
}

/** True when IAP can run: native shell + a configured public SDK key. */
export function isRevenueCatAvailable(): boolean {
  return isNativeApp && platformApiKey() !== "";
}

/**
 * Configures the RevenueCat SDK once (idempotent). The plugin is dynamically
 * imported so it never lands in the web bundle. Returns false (no-op) on web or
 * when no platform key is set.
 */
export async function configureRevenueCat(): Promise<boolean> {
  if (!isNativeApp) return false;
  if (configured) return true;
  if (configurePromise) return configurePromise;

  const apiKey = platformApiKey();
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      `[revenuecat] no public SDK key for "${nativePlatform}" — IAP disabled. ` +
        "Rebuild with REVENUECAT_IOS_KEY / REVENUECAT_ANDROID_KEY set.",
    );
    return false;
  }

  configurePromise = (async () => {
    try {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      await Purchases.configure({ apiKey });
      configured = true;
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[revenuecat] configure failed", e);
      return false;
    } finally {
      configurePromise = null;
    }
  })();

  return configurePromise;
}

/** Associates the RevenueCat anonymous id with the Supabase user id. */
export async function rcLogIn(userId: string): Promise<void> {
  if (!(await configureRevenueCat())) return;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.logIn({ appUserID: userId });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[revenuecat] logIn failed", e);
  }
}

/** Detaches the current user (returns the SDK to an anonymous id). */
export async function rcLogOut(): Promise<void> {
  if (!isNativeApp || !configured) return;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.logOut();
  } catch {
    // RC rejects when logging out an already-anonymous user — harmless.
  }
}

function emptyPackages(): KixxmePackages {
  return {
    plus_monthly: null,
    plus_annual: null,
    gold_monthly: null,
    gold_annual: null,
  };
}

/**
 * Loads the current offering and maps its packages onto our four plan slots.
 * Matching is resilient: it inspects the package identifier, the underlying
 * store product id, and the RC package type, so the dashboard can name things
 * with our convention (`plus_monthly`…) or rely on the standard MONTHLY/ANNUAL
 * package types.
 */
export async function loadKixxmePackages(): Promise<KixxmePackages> {
  const result = emptyPackages();
  if (!(await configureRevenueCat())) return result;

  let offering: PurchasesOffering | null = null;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const offerings = await Purchases.getOfferings();
    offering = offerings.current ?? null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[revenuecat] getOfferings failed", e);
    return result;
  }
  if (!offering) return result;

  for (const pkg of offering.availablePackages) {
    const hay = `${pkg.identifier} ${pkg.product.identifier} ${String(pkg.packageType)}`.toLowerCase();
    const tier = hay.includes("gold") ? "gold" : hay.includes("plus") ? "plus" : null;
    const interval =
      hay.includes("annual") || hay.includes("anual") || hay.includes("year")
        ? "annual"
        : hay.includes("monthly") || hay.includes("mensual") || hay.includes("month")
          ? "monthly"
          : null;
    if (tier && interval) {
      result[`${tier}_${interval}` as PlanKey] = pkg;
    }
  }
  return result;
}

/** Runs the store purchase flow; returns the active entitlement ids. */
export async function purchasePackage(aPackage: PurchasesPackage): Promise<string[]> {
  await configureRevenueCat();
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const res = await Purchases.purchasePackage({ aPackage });
  return Object.keys(res.customerInfo.entitlements.active ?? {});
}

/** Restores prior purchases; returns the active entitlement ids. */
export async function restorePurchases(): Promise<string[]> {
  await configureRevenueCat();
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const res = await Purchases.restorePurchases();
  return Object.keys(res.customerInfo.entitlements.active ?? {});
}

/** True when a purchase error is just the user dismissing the store sheet. */
export function isUserCancelled(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { userCancelled?: boolean; code?: unknown };
  // `userCancelled` is RevenueCat's canonical signal; the code check is a
  // version-robust fallback (PURCHASE_CANCELLED is enum value "1"). We avoid a
  // broad message regex so unrelated errors mentioning "cancel" aren't swallowed.
  if (err.userCancelled === true) return true;
  const code = String(err.code ?? "");
  return code === "1" || /purchase[_ ]?cancelled/i.test(code);
}
