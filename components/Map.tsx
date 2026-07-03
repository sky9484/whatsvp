'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { Event } from '@/lib/types';
import { useTheme } from '@/lib/theme';
import IsoBuilding, { IsoPhotoBuilding, type BuildingKey } from './IsoBuilding';

const KL_CENTER: [number, number] = [101.6953, 3.1478];
const KL_ZOOM = 13;
const SRC = 'events';

export interface BuildingFocus {
  lat: number;
  lng: number;
  title: string;
  status: Event['status'];
  meta?: string;
  design?: BuildingKey | null;
  imageUrl?: string | null;
}

interface MapProps {
  events: Event[];
  onEventSelect: (event: Event) => void;
  geolocateTrigger?: number;
  buildingFocus?: BuildingFocus | null;
}

const ISO_COLORS: Record<Event['status'], { side: string; dark: string }> = {
  live: { side: '#D85A30', dark: '#9c3d1d' },
  upcoming: { side: '#1D9E75', dark: '#136b4f' },
  past: { side: '#9CA3AF', dark: '#6b7280' },
};

// Map layer palette per theme (concrete colours — MapLibre paint can't read CSS vars)
const PIN = {
  light: { live: '#D85A30', upcoming: '#1D9E75', past: '#B4ADA0', stroke: '#F7F5EF', cluster: '#0F6E56', clusterText: '#F7F5EF' },
  dark: { live: '#E9744A', upcoming: '#2EC592', past: '#6b6a64', stroke: '#161614', cluster: '#2AC296', clusterText: '#0d0d0c' },
};

function styleUrl(theme: 'light' | 'dark'): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (key) {
    const style = theme === 'dark' ? 'streets-v2-dark' : 'streets-v2';
    return `https://api.maptiler.com/maps/${style}/style.json?key=${key}`;
  }
  // Free CARTO fallback (raster: no 3D extrusion, but full clustering + pins)
  return theme === 'dark'
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
}

function eventsToGeoJSON(events: Event[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
      properties: { id: e.id, status: e.status },
    })),
  };
}

/** Add the clustered event source + glow/cluster/pin layers for the given theme. */
function addPinLayers(map: maplibregl.Map, theme: 'light' | 'dark', data: GeoJSON.FeatureCollection) {
  const pal = PIN[theme];

  // Only add when missing — data updates happen in the events effect, and a
  // theme swap removes+re-adds everything fresh via setStyle → styledata.
  if (map.getSource(SRC)) return;
  map.addSource(SRC, {
    type: 'geojson',
    data,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 48,
  });

  const statusColor: maplibregl.ExpressionSpecification = [
    'match',
    ['get', 'status'],
    'live', pal.live,
    'upcoming', pal.upcoming,
    pal.past,
  ];

  // Live-presence glow (animated) — sits under the pins
  if (!map.getLayer('ev-glow')) {
    map.addLayer({
      id: 'ev-glow',
      type: 'circle',
      source: SRC,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'live']],
      paint: {
        'circle-color': pal.live,
        'circle-radius': 12,
        'circle-opacity': 0.4,
        'circle-blur': 0.7,
      },
    });
  }

  // Cluster bubbles
  if (!map.getLayer('ev-clusters')) {
    map.addLayer({
      id: 'ev-clusters',
      type: 'circle',
      source: SRC,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': pal.cluster,
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 32],
        'circle-opacity': 0.92,
        'circle-stroke-width': 2,
        'circle-stroke-color': pal.stroke,
      },
    });
  }
  if (!map.getLayer('ev-cluster-count')) {
    map.addLayer({
      id: 'ev-cluster-count',
      type: 'symbol',
      source: SRC,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Bold', 'Noto Sans Bold', 'Open Sans Regular'],
        'text-size': 13,
      },
      paint: { 'text-color': pal.clusterText },
    });
  }

  // Un-clustered leaf pins
  if (!map.getLayer('ev-unclustered')) {
    map.addLayer({
      id: 'ev-unclustered',
      type: 'circle',
      source: SRC,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': statusColor,
        'circle-radius': 7,
        'circle-stroke-width': 2.5,
        'circle-stroke-color': pal.stroke,
      },
    });
  }
}

export default function Map({ events, onEventSelect, geolocateTrigger, buildingFocus }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const isoRef = useRef<HTMLDivElement>(null);
  const [isoVisible, setIsoVisible] = useState(false);

  const { theme } = useTheme();

  // Refs so the persistent styledata handler always reads current values
  const themeRef = useRef(theme);
  const eventsRef = useRef(events);
  const onSelectRef = useRef(onEventSelect);
  const setupRef = useRef<() => void>(() => {});
  themeRef.current = theme;
  eventsRef.current = events;
  onSelectRef.current = onEventSelect;

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(themeRef.current),
      center: KL_CENTER,
      zoom: KL_ZOOM,
      attributionControl: { compact: true },
      pitchWithRotate: true,
      // MapLibre's own docs warn pitch beyond 60° is "experimental and may
      // result in rendering issues" — stay right at the documented-safe
      // ceiling and lean on a closer zoom for the street-view feel instead.
      maxPitch: 70,
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
    }

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    });
    geolocateRef.current = geolocate;
    map.addControl(geolocate, 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    // Re-add layers on initial load AND after every style swap. MapLibre has no
    // 'style.load' event; the reliable "new style is ready" signal after setStyle
    // is 'idle'. setupLayers is idempotent (guards on existing source/layers).
    const setupLayers = () => {
      if (!map.isStyleLoaded()) {
        map.once('idle', setupLayers);
        return;
      }
      addPinLayers(map, themeRef.current, eventsToGeoJSON(eventsRef.current));
    };
    setupRef.current = setupLayers;
    map.on('load', setupLayers);
    // Safety net: if a style swap drops our source, re-add once it's ready.
    map.on('styledata', () => {
      if (!map.getSource(SRC)) map.once('idle', setupLayers);
    });

    // Interactions
    map.on('click', 'ev-clusters', (e) => {
      const feat = map.queryRenderedFeatures(e.point, { layers: ['ev-clusters'] })[0];
      const clusterId = feat?.properties?.cluster_id;
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource;
      if (clusterId == null) return;
      src.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center: (feat.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
    });
    map.on('click', 'ev-unclustered', (e) => {
      const id = e.features?.[0]?.properties?.id;
      const ev = eventsRef.current.find((x) => x.id === id);
      if (ev) onSelectRef.current(ev);
    });
    for (const layer of ['ev-clusters', 'ev-unclustered']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    // Live-presence pulse
    let raf = 0;
    const t0 = performance.now();
    const pulse = (t: number) => {
      if (map.getLayer('ev-glow')) {
        const phase = ((t - t0) % 1800) / 1800; // 0..1
        map.setPaintProperty('ev-glow', 'circle-radius', 10 + phase * 16);
        map.setPaintProperty('ev-glow', 'circle-opacity', 0.45 * (1 - phase));
      }
      raf = requestAnimationFrame(pulse);
    };
    raf = requestAnimationFrame(pulse);

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Theme change → swap basemap (layers re-added on style.load) ─────────────
  const firstThemeRun = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstThemeRun.current) {
      firstThemeRun.current = false;
      return; // initial style already correct
    }
    map.setStyle(styleUrl(theme));
    map.once('idle', () => setupRef.current());
  }, [theme]);

  // ── Update pin data when events change ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(eventsToGeoJSON(events));
  }, [events]);

  // ── Geolocate ───────────────────────────────────────────────────────────────
  const prevTriggerRef = useRef(geolocateTrigger);
  useEffect(() => {
    if (geolocateTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = geolocateTrigger;
      geolocateRef.current?.trigger();
    }
  }, [geolocateTrigger]);

  // ── Isometric building overlay positioning ──────────────────────────────────
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (buildingFocus) {
      // Street-view-ish: close and steeply tilted, like standing on the
      // sidewalk looking up, rather than a top-down isometric establishing
      // shot. Pitch stays at the documented-safe ceiling (see maxPitch above);
      // the closer zoom does most of the work for the "street level" feel.
      map.flyTo({
        center: [buildingFocus.lng, buildingFocus.lat],
        zoom: 18.6,
        pitch: 70,
        bearing: -18,
        duration: 1800,
        essential: true,
      });
      positionIso();
      map.on('move', positionIso);
      map.on('render', positionIso);
      const raf = requestAnimationFrame(() => setIsoVisible(true));
      return () => {
        cancelAnimationFrame(raf);
        map.off('move', positionIso);
        map.off('render', positionIso);
      };
    } else {
      setIsoVisible(false);
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
  }, [buildingFocus, positionIso]);

  const isoColor = buildingFocus ? ISO_COLORS[buildingFocus.status] : null;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />

      {buildingFocus && (
        <div
          ref={isoRef}
          className={`iso-stage ${isoVisible ? 'is-visible' : ''}`}
          style={{ '--iso': isoColor?.side, '--iso-dark': isoColor?.dark } as React.CSSProperties}
        >
          <div className="iso-stage__inner">
            <span className="iso-kicker">
              {buildingFocus.status === 'live' ? '● Happening here' : 'Upcoming here'}
            </span>
            <h3 className="iso-title">{buildingFocus.title}</h3>
            {buildingFocus.design ? (
              <div className="iso-art">
                <div className="iso-spin">
                  <div className="iso-float">
                    <IsoBuilding design={buildingFocus.design} width={210} />
                  </div>
                </div>
              </div>
            ) : buildingFocus.imageUrl ? (
              <div className="iso-art">
                <div className="iso-spin">
                  <div className="iso-float">
                    <IsoPhotoBuilding src={buildingFocus.imageUrl} width={180} />
                  </div>
                </div>
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
