"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { promotionColorClassName } from "@/lib/promotion-colors";
import type { Coordinates, Restroom } from "@/types/restroom";

type RestroomMapProps = {
  center: Coordinates;
  restrooms: Restroom[];
  selectedId: string | null;
  onSelect: (restroom: Restroom) => void;
};

const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function MapMotion({ center, selected }: { center: Coordinates; selected: Restroom | undefined }) {
  const map = useMap();

  useEffect(() => {
    const nextCenter: L.LatLngExpression = selected
      ? [selected.latitude, selected.longitude]
      : [center.latitude, center.longitude];
    map.flyTo(nextCenter, selected ? 16 : 14, { duration: 0.75 });
  }, [center, map, selected]);

  return null;
}

function restroomIcon(restroom: Restroom, selected: boolean) {
  const promoted = Boolean(restroom.promotion);
  return L.divIcon({
    className: "map-marker-shell",
    html: `<div class="map-marker${promoted ? ` featured ${promotionColorClassName(restroom.promotion!.colorKey)}` : ""}${selected ? " selected" : ""}"><span>${promoted ? "SP" : restroom.reviewCount ? restroom.rating.toFixed(1) : "WC"}</span><i></i></div>`,
    iconAnchor: [25, 44],
    iconSize: [50, 50],
    popupAnchor: [0, -44],
  });
}

const userIcon = L.divIcon({
  className: "user-marker-shell",
  html: '<div class="user-marker"><span></span></div>',
  iconAnchor: [13, 13],
  iconSize: [26, 26],
});

export default function RestroomMap({ center, restrooms, selectedId, onSelect }: RestroomMapProps) {
  const selected = useMemo(
    () => restrooms.find((restroom) => restroom.id === selectedId),
    [restrooms, selectedId],
  );
  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  const tileAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim() || DEFAULT_TILE_ATTRIBUTION;

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      className="leaflet-map"
      scrollWheelZoom
      zoom={14}
      zoomControl={false}
    >
      <TileLayer attribution={tileAttribution} url={tileUrl} />
      <Circle
        center={[center.latitude, center.longitude]}
        pathOptions={{ color: "#2f63ff", fillColor: "#2f63ff", fillOpacity: 0.08, weight: 1 }}
        radius={180}
      />
      <Marker icon={userIcon} position={[center.latitude, center.longitude]}>
        <Popup><strong>Your map location</strong></Popup>
      </Marker>
      {restrooms.map((restroom) => (
        <Marker
          eventHandlers={{ click: () => onSelect(restroom) }}
          icon={restroomIcon(restroom, selectedId === restroom.id)}
          key={restroom.id}
          position={[restroom.latitude, restroom.longitude]}
        >
          <Popup>
            <button className="map-popup" onClick={() => onSelect(restroom)}>
              {restroom.promotion && <small>Sponsored by {restroom.promotion.businessName}</small>}
              <strong>{restroom.name}</strong>
              <span>{restroom.promotion ? restroom.promotion.headline : `${restroom.openNow === null ? "Hours unknown" : restroom.openNow ? "Open now" : "Closed"} · ${restroom.reviewCount ? `${restroom.cleanlinessRating.toFixed(1)} clean` : "Not rated"}`}</span>
            </button>
          </Popup>
        </Marker>
      ))}
      <MapMotion center={center} selected={selected} />
    </MapContainer>
  );
}
