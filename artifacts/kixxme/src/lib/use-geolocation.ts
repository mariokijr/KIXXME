import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateMyLocation,
  getGetMyProfileQueryKey,
  getListProfilesQueryKey,
  getListMapUsersQueryKey,
} from "@workspace/api-client-react";

export type GeoState = "idle" | "locating" | "done" | "error" | "denied" | "unsupported";

export function useGeolocation() {
  const update = useUpdateMyLocation();
  const qc = useQueryClient();
  const [state, setState] = useState<GeoState>("idle");

  const request = useCallback(
    (onDone?: () => void) => {
      if (!("geolocation" in navigator)) {
        setState("unsupported");
        return;
      }
      setState("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          update.mutate(
            {
              data: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              },
            },
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
        },
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
