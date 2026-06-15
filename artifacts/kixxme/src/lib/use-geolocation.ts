import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateMyLocation,
  getGetMyProfileQueryKey,
  getListProfilesQueryKey,
  getListMapUsersQueryKey,
} from "@workspace/api-client-react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type GeoState = "idle" | "locating" | "done" | "error" | "denied" | "unsupported";

export function useGeolocation() {
  const update = useUpdateMyLocation();
  const qc = useQueryClient();
  const [state, setState] = useState<GeoState>("idle");

  const request = useCallback(
    (onDone?: () => void, onError?: (state: GeoState) => void) => {
      const submit = (latitude: number, longitude: number) => {
        update.mutate(
          { data: { latitude, longitude } },
          {
            onSuccess: () => {
              setState("done");
              qc.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
              qc.invalidateQueries({ queryKey: getListProfilesQueryKey() });
              qc.invalidateQueries({ queryKey: getListMapUsersQueryKey() });
              onDone?.();
            },
            onError: () => {
              setState("error");
              onError?.("error");
            },
          }
        );
      };

      const handleGeoError = (code: number) => {
        const newState: GeoState =
          code === GeolocationPositionError.PERMISSION_DENIED
            ? "denied"
            : "error";
        setState(newState);
        onError?.(newState);
      };

      setState("locating");

      // iOS WKWebView does not support navigator.geolocation, so on the native
      // shell we go through the Capacitor Geolocation plugin.
      if (Capacitor.isNativePlatform()) {
        void (async () => {
          try {
            const perm = await Geolocation.requestPermissions();
            if (perm.location === "denied" && perm.coarseLocation === "denied") {
              setState("denied");
              onError?.("denied");
              return;
            }
            const pos = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 30000,
            });
            submit(pos.coords.latitude, pos.coords.longitude);
          } catch {
            setState("error");
            onError?.("error");
          }
        })();
        return;
      }

      if (!("geolocation" in navigator)) {
        setState("unsupported");
        onError?.("unsupported");
        return;
      }

      // enableHighAccuracy:true asks the browser for GPS / precise WiFi triangulation
      // instead of coarse IP-based positioning (which can be 20–50 km off).
      // maximumAge:30000 — accept a cached position no older than 30 s so the
      // browser can satisfy the request instantly if the user barely moved, but
      // never serves a stale IP-based fix from a previous session.
      navigator.geolocation.getCurrentPosition(
        (pos) => submit(pos.coords.latitude, pos.coords.longitude),
        (err) => handleGeoError(err.code),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    },
    [update, qc]
  );

  return { request, state, isPending: update.isPending };
}
