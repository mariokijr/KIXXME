import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * The old "Favoritos" page now lives inside Discover ("Cuadrícula" = your likes)
 * and matches live at /matches. Keep the route as a redirect so old links and
 * bookmarks still land somewhere sensible.
 */
export default function Favorites() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/discover", { replace: true });
  }, [setLocation]);
  return null;
}
