'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { Event } from '@/lib/types';
import IsoBuilding, { IsoPhotoBuilding, type BuildingKey } from './IsoBuilding';

const KL_CENTER: [number, number] = [101.6953, 3.1478];
const KL_ZOOM = 13;
const BUILDINGS_LAYER_ID = 'whatsvp-3d-buildings';

export interface BuildingFocus {
  lat: number;
  lng: number;
  title: string;
  status: Event['status'];
  meta?: string;
  /** A hand-authored landmark design key, if this venue is a known building. */
  design?: BuildingKey | null;
  /** A user-uploaded building photo (community-generated isometric card). */
  imageUrl?: string | null;
}

interface MapProps {
  events: Event[];
  onEventSelect: (event: Event) => void;
  geolocateTrigger?: number; // bump this number to trigger "near me"
  /** Set (a fresh object) to fly to + tilt over a venue's building. Null resets the view. */
  buildingFocus?: BuildingFocus | null;
}

const ISO_COLORS: Record<Event['status'], { side: string; dark: string }> = {
  live: { side: '#D85A30', dark: '#9c3d1d' },
  upcoming: { side: '#1D9E75', dark: '#136b4f' },
  past: { side: '#9CA3AF', dark: '#6b7280' },
};

/**
 * Adds a fill-extrusion layer so OSM buildings render in 3D. Works only on a
 * vector basemap (MapTiler) — the CARTO raster fallback can't extrude, so this
 * detects the building source-layer from the loaded style and no-ops otherwise.
 */
function add3DBuildings(map: maplibregl.Map) {
  if (map.getLayer(BUILDINGS_LAYER_ID)) return;

  const style = map.getStyle();
  const layers = style?.layers ?? [];

  // If the style already ships a 3D building layer, leave it alone.
  if (layers.some((l) => l.type === 'fill-extrusion')) return;

  // Find the vector source that exposes a 'building' source-layer by reusing
  // whatever 2D building layer the style already has.
  const buildingLayer = layers.find(
    (l) => 'source-layer' in l && l['source-layer'] === 'building' && 'source' in l && l.source
  ) as (maplibregl.LayerSpecification & { source: string }) | undefined;

  if (!buildingLayer) return; // raster / no building data → nothing to extrude

  // Insert below the first symbol (label) layer so place names stay on top.
  const firstSymbolId = layers.find((l) => l.type === 'symbol')?.id;

  const height: maplibregl.ExpressionSpecification = [
    'coalesce',
    ['get', 'render_height'],
    ['get', 'height'],
    0,
  ];
  const base: maplibregl.ExpressionSpecification = [
    'coalesce',
    ['get', 'render_min_height'],
    ['get', 'min_height'],
    0,
  ];

  map.addLayer(
    {
      id: BUILDINGS_LAYER_ID,
      type: 'fill-extrusion',
      source: buildingLayer.source,
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        // Warm paper-stone tones, darker as buildings get taller (sense of depth).
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          height,
          0, '#E4E1D8',
          40, '#CFC8B8',
          150, '#ADA593',
        ],
        // Grow buildings in as you zoom past 14 → 16 for a smooth reveal.
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14, 0,
          16, height,
        ],
        'fill-extrusion-base': base,
        'fill-extrusion-opacity': 0.9,
      },
    },
    firstSymbolId
  );
}

export default function Map({
  events,
  onEventSelect,
  geolocateTrigger,
  buildingFocus,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const isoRef = useRef<HTMLDivElement>(null);
  const [isoVisible, setIsoVisible] = useState(false);

  const styleUrl = (): string => {
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (key) {
      return `https://api.maptiler.com/maps/streets/style.json?key=${key}`;
    }
    // Free fallback — no API key required (raster: no 3D extrusion)
    return 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  };

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: KL_CENTER,
      zoom: KL_ZOOM,
      attributionControl: { compact: true },
      pitchWithRotate: true,
      maxPitch: 70,
    });

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    });
    geolocateRef.current = geolocate;

    map.addControl(geolocate, 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => add3DBuildings(map));

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update pins when events change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addMarkers = () => {
      // Clear existing
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      for (const event of events) {
        const el = document.createElement('div');
        el.className = `event-pin event-pin--${event.status}`;
        el.setAttribute('aria-label', event.title);
        el.setAttribute('role', 'button');
        el.tabIndex = 0;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([event.lng, event.lat])
          .addTo(map);

        const handleSelect = () => onEventSelect(event);
        el.addEventListener('click', handleSelect);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') handleSelect();
        });

        markersRef.current.push(marker);
      }
    };

    // If map style is already loaded, add markers immediately; else wait
    if (map.isStyleLoaded()) {
      addMarkers();
    } else {
      map.once('load', addMarkers);
    }
  }, [events, onEventSelect]);

  // Trigger geolocate when parent bumps the counter
  const prevTriggerRef = useRef(geolocateTrigger);
  useEffect(() => {
    if (geolocateTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = geolocateTrigger;
      geolocateRef.current?.trigger();
    }
  }, [geolocateTrigger]);

  // Keep the isometric label pinned to the building as the camera moves.
  const positionIso = useCallback(() => {
    const map = mapRef.current;
    const el = isoRef.current;
    if (!map || !el || !buildingFocus) return;
    const p = map.project([buildingFocus.lng, buildingFocus.lat]);
    const { width, height } = map.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const onScreen = p.x >= 0 && p.x <= width / dpr && p.y >= -40 && p.y <= height / dpr;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.visibility = onScreen ? 'visible' : 'hidden';
  }, [buildingFocus]);

  // Fly to + tilt over a building when a venue is focused; reset when cleared.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (buildingFocus) {
      map.flyTo({
        center: [buildingFocus.lng, buildingFocus.lat],
        zoom: 17.5,
        pitch: 60,
        bearing: -18,
        duration: 1400,
        essential: true,
      });
      positionIso();
      map.on('move', positionIso);
      map.on('render', positionIso);
      // Trigger the rise-in transition on the next frame
      const raf = requestAnimationFrame(() => setIsoVisible(true));
      return () => {
        cancelAnimationFrame(raf);
        map.off('move', positionIso);
        map.off('render', positionIso);
      };
    } else {
      setIsoVisible(false);
      // Reset to flat overview pitch (keep current center/zoom)
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
  }, [buildingFocus, positionIso]);

  const isoColor = buildingFocus ? ISO_COLORS[buildingFocus.status] : null;

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* Isometric 3D building typography — only while a venue is focused */}
      {buildingFocus && (
        <div
          ref={isoRef}
          className={`iso-stage ${isoVisible ? 'is-visible' : ''}`}
          style={
            {
              '--iso': isoColor?.side,
              '--iso-dark': isoColor?.dark,
            } as React.CSSProperties
          }
        >
          <div className="iso-stage__inner">
            <span className="iso-kicker">
              {buildingFocus.status === 'live' ? '● Happening here' : 'Upcoming here'}
            </span>
            <h3 className="iso-title">{buildingFocus.title}</h3>
            {buildingFocus.design ? (
              <div className="iso-art">
                <IsoBuilding design={buildingFocus.design} width={210} />
              </div>
            ) : buildingFocus.imageUrl ? (
              <div className="iso-art">
                <IsoPhotoBuilding src={buildingFocus.imageUrl} width={180} />
              </div>
            ) : null}
            {buildingFocus.meta && <div className="iso-meta">{buildingFocus.meta}</div>}
            <div className="iso-anchor" />
            <div className="iso-dot" />
          </div>
        </div>
      )}
    </div>
  );
}
