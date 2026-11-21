import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  lat: number | null;
  lng: number | null;
  radius: number;
  onPick: (lat: number, lng: number) => void;
}

// Only used to centre the empty map (Rajajinagar, Bengaluru). It is never saved as a community location.
const DEFAULT_VIEW: [number, number] = [12.9916, 77.5521];

/** Tap-to-pin map (OpenStreetMap — free, no API key). Shows the GPS radius as a circle. */
export function MapPicker({ lat, lng, radius, onPick }: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinRef = useRef<L.CircleMarker | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!el.current) return;
    const hasPos = lat !== null && lng !== null;
    const map = L.map(el.current, { zoomControl: true }).setView(
      hasPos ? [lat as number, lng as number] : DEFAULT_VIEW,
      hasPos ? 17 : 13
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => pickRef.current(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    const t = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      pinRef.current = null;
      ringRef.current = null;
    };
    // map is created once; position updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat === null || lng === null) {
      pinRef.current?.remove();
      ringRef.current?.remove();
      pinRef.current = null;
      ringRef.current = null;
      return;
    }
    const pos: L.LatLngExpression = [lat, lng];
    if (!pinRef.current) {
      pinRef.current = L.circleMarker(pos, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#10b981",
        fillOpacity: 1,
      }).addTo(map);
    } else {
      pinRef.current.setLatLng(pos);
    }
    const r = Math.max(10, radius || 100);
    if (!ringRef.current) {
      ringRef.current = L.circle(pos, {
        radius: r,
        color: "#38bdf8",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 0.15,
      }).addTo(map);
    } else {
      ringRef.current.setLatLng(pos);
      ringRef.current.setRadius(r);
    }
    map.setView(pos, Math.max(map.getZoom(), 16));
  }, [lat, lng, radius]);

  return <div ref={el} className="h-[270px] w-full overflow-hidden rounded-2xl border border-[#1e3a5f]" />;
}
