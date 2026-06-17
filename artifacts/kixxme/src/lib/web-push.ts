import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/web/vapid-public-key", {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json() as { vapid_public_key?: string };
    return data.vapid_public_key ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribe(vapidKey: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await postSubscription(existing);
    return;
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as Uint8Array<ArrayBuffer>,
  });
  await postSubscription(sub);
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  await fetch("/api/push/web/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
}

/**
 * Requests push permission and subscribes after authentication.
 * Silent no-op when SW, Push API, or VAPID key are unavailable.
 */
export function useWebPush(): void {
  const { session } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (!session || done.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    done.current = true;

    (async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const vapidKey = await getVapidKey();
      if (!vapidKey) return;
      await subscribe(vapidKey);
    })();
  }, [session]);
}
