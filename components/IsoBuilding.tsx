'use client';

/**
 * Isometric building renderer. Each design is a list of stacked/positioned boxes
 * projected with a true 30° isometric transform; the three visible faces of each
 * box are shaded (top / +x / +y) for depth and painter-sorted back-to-front.
 *
 * Landmark designs (klcc, millerz, mdec) are hand-authored from each building's
 * real massing. User-uploaded buildings render as an isometric photo card instead
 * (see IsoPhotoBuilding) — same stage, swappable art.
 */

export type BuildingKey = 'klcc' | 'millerz' | 'mdec';

export interface IsoBox {
  x: number; y: number; z: number; // footprint origin + base elevation
  w: number; d: number; h: number; // size
}

interface Design {
  palette: 'steel' | 'stone' | 'glass';
  boxes: IsoBox[];
}

const S = 13; // unit scale (px)

// [top, +x face, +y face]
const PALETTES: Record<Design['palette'], [string, string, string]> = {
  steel: ['#E9ECF0', '#C3CAD3', '#9DA7B3'],
  stone: ['#EFEADC', '#D6CFBC', '#BAB199'],
  glass: ['#D9F0E9', '#A7D6C8', '#79BCA9'],
};

function proj(x: number, y: number, z: number): [number, number] {
  return [(x - y) * 0.866 * S, (x + y) * 0.5 * S - z * S];
}

/** Build a tapered tower (KLCC-style stepped setbacks) at footprint origin. */
function tower(ox: number, oy: number, tiers: number, baseW: number, tierH: number): IsoBox[] {
  const boxes: IsoBox[] = [];
  for (let i = 0; i < tiers; i++) {
    const w = baseW - i * (baseW * 0.12);
    const inset = (baseW - w) / 2;
    boxes.push({ x: ox + inset, y: oy + inset, z: i * tierH, w, d: w, h: tierH + 0.02 });
  }
  const topZ = tiers * tierH;
  const c = baseW / 2 - 0.25;
  // pinnacle + spire
  boxes.push({ x: ox + c - 0.4, y: oy + c - 0.4, z: topZ, w: 1.3, d: 1.3, h: 1.6 });
  boxes.push({ x: ox + c, y: oy + c, z: topZ + 1.6, w: 0.5, d: 0.5, h: 2.6 });
  return boxes;
}

const DESIGNS: Record<BuildingKey, Design> = {
  // Twin towers + skybridge
  klcc: {
    palette: 'steel',
    boxes: [
      ...tower(0, 0, 6, 3, 2.3),
      ...tower(4.4, 1.2, 6, 3, 2.3),
      // double-decker skybridge connecting the towers at mid-height
      { x: 2.9, y: 1.85, z: 6.4, w: 1.6, d: 0.55, h: 0.45 },
      { x: 2.9, y: 1.85, z: 7.1, w: 1.6, d: 0.55, h: 0.45 },
    ],
  },
  // Cluster of slim towers on a retail podium
  millerz: {
    palette: 'stone',
    boxes: [
      { x: 0, y: 0, z: 0, w: 6.2, d: 5, h: 1.6 }, // podium
      { x: 0.5, y: 0.6, z: 1.6, w: 1.6, d: 1.6, h: 11 },
      { x: 2.5, y: 0.5, z: 1.6, w: 1.6, d: 1.6, h: 14 },
      { x: 0.7, y: 2.7, z: 1.6, w: 1.6, d: 1.6, h: 9.5 },
      { x: 3.0, y: 2.6, z: 1.6, w: 1.7, d: 1.7, h: 12.5 },
      { x: 4.6, y: 1.4, z: 1.6, w: 1.2, d: 1.2, h: 7.5 }, // office block
    ],
  },
  // Modern Cyberjaya corporate mid-rise (stepped, with canopy) — stylized
  mdec: {
    palette: 'glass',
    boxes: [
      { x: 0, y: 0, z: 0, w: 5.6, d: 4.4, h: 4.2 }, // main slab
      { x: 0.8, y: 0.8, z: 4.2, w: 4, d: 3, h: 2.6 }, // setback upper floors
      { x: 1.6, y: 1.5, z: 6.8, w: 2.4, d: 1.8, h: 1.2 }, // rooftop plant
      { x: -0.5, y: -0.5, z: 0, w: 6.6, d: 0.5, h: 0.8 }, // entrance canopy fin
    ],
  },
};

function BoxFaces({ box, palette }: { box: IsoBox; palette: [string, string, string] }) {
  const { x, y, z, w, d, h } = box;
  const z1 = z + h;
  const pts = (arr: [number, number, number][]) =>
    arr.map(([px, py, pz]) => proj(px, py, pz).join(',')).join(' ');

  const top = pts([
    [x, y, z1], [x + w, y, z1], [x + w, y + d, z1], [x, y + d, z1],
  ]);
  const right = pts([
    [x + w, y, z], [x + w, y + d, z], [x + w, y + d, z1], [x + w, y, z1],
  ]);
  const left = pts([
    [x, y + d, z], [x + w, y + d, z], [x + w, y + d, z1], [x, y + d, z1],
  ]);

  return (
    <g>
      <polygon points={left} fill={palette[2]} />
      <polygon points={right} fill={palette[1]} />
      <polygon points={top} fill={palette[0]} stroke="rgba(27,27,24,0.06)" strokeWidth={0.5} />
    </g>
  );
}

export default function IsoBuilding({
  design,
  width = 200,
  className,
}: {
  design: BuildingKey;
  width?: number;
  className?: string;
}) {
  const spec = DESIGNS[design];
  const palette = PALETTES[spec.palette];

  // Painter's order: back-to-front, bottom-to-top
  const ordered = [...spec.boxes].sort(
    (a, b) => a.x + a.y + a.z * 0.5 - (b.x + b.y + b.z * 0.5)
  );

  // Compute bounds from every corner so the viewBox frames the whole building
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of spec.boxes) {
    for (const [dx, dy, dz] of [
      [0, 0, 0], [b.w, 0, 0], [0, b.d, 0], [b.w, b.d, 0],
      [0, 0, b.h], [b.w, 0, b.h], [0, b.d, b.h], [b.w, b.d, b.h],
    ] as [number, number, number][]) {
      const [sx, sy] = proj(b.x + dx, b.y + dy, b.z + dz);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
  }
  const pad = 8;
  const vbW = maxX - minX + pad * 2;
  const vbH = maxY - minY + pad * 2;
  const height = (width * vbH) / vbW;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`${minX - pad} ${minY - pad} ${vbW} ${vbH}`}
      className={className}
      style={{ filter: 'drop-shadow(6px 12px 14px rgba(27,27,24,0.28))', overflow: 'visible' }}
      aria-hidden
    >
      {ordered.map((box, i) => (
        <BoxFaces key={i} box={box} palette={palette} />
      ))}
    </svg>
  );
}

/** Isometric card for a user-uploaded building photo (the community path). */
export function IsoPhotoBuilding({ src, width = 168 }: { src: string; width?: number }) {
  return (
    <div
      style={{
        width,
        height: width * 0.82,
        transform: 'skewY(-12deg) rotate(0deg)',
        borderRadius: 8,
        overflow: 'hidden',
        border: '2px solid #1B1B18',
        boxShadow: '6px 9px 0 #1D9E75, 10px 16px 22px rgba(27,27,24,0.32)',
        background: '#F7F5EF',
      }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'saturate(0.92) contrast(1.04)',
        }}
      />
    </div>
  );
}

export const LANDMARK_KEYS: BuildingKey[] = ['klcc', 'millerz', 'mdec'];
