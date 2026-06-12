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
    (onDone?: () => void) => {
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
            onError: () => setState("error"),
          }
        );
      };

      setState("locating");

      // iOS WKWebView does not support navigator.geolocation, so on the native
      // shell we go through the Capacitor Geolocation plugin (it triggers the
      // OS permission prompt and reads coordinates natively).
      if (Capacitor.isNativePlatform()) {
        void (async () => {
          try {
            const perm = await Geolocation.requestPermissions();
            if (perm.location === "denied" && perm.coarseLocation === "denied") {
              setState("denied");
              return;
            }
            const pos = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000,
            });
            submit(pos.coords.latitude, pos.coords.longitude);
          } catch {
            setState("error");
          }
        })();
        return;
      }

      if (!("geolocation" in navigator)) {
        setState("unsupported");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => submit(pos.coords.latitude, pos.coords.longitude),
        (err) => {
          setState(err.code === err.PERMISSION_DENIED ? "denied" : "error");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    },
    [update, qc]
  );

  return { request, state, isPending: update.isPending };
}
