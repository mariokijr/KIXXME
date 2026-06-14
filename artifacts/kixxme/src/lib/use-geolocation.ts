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
              maximumAge: 300000,
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

      // On web we use enableHighAccuracy:false — it relies on WiFi/IP positioning
      // which works on every device (desktop and mobile) without GPS hardware.
      // GPS-level precision is not needed for a social app; WiFi/cell is sufficient.
      navigator.geolocation.getCurrentPosition(
        (pos) => submit(pos.coords.latitude, pos.coords.longitude),
        (err) => handleGeoError(err.code),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
      );
    },
    [update, qc]
  );

  return { request, state, isPending: update.isPending };
}
