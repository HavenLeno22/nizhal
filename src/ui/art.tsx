// Line drawings for the setup cards and the hero's house outline.
// Drawn with currentColor so they follow the theme.
import type { HomeType } from '../engine/home';
import type { RoofType } from '../engine/materials';

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function HomeTypeArt({ type }: { type: HomeType }) {
  if (type === 'independent') {
    return (
      <svg viewBox="0 0 64 48" aria-hidden="true">
        <g {...common}>
          <path d="M10 18h44v24H10z" />
          <path d="M8 18h48" strokeWidth={3} />
          <path d="M28 42V32h8v10" />
          <path d="M16 25h6v5h-6zM42 25h6v5h-6z" />
        </g>
      </svg>
    );
  }
  if (type === 'hut') {
    return (
      <svg viewBox="0 0 64 48" aria-hidden="true">
        <g {...common}>
          <path d="M14 22v20h36V22" />
          <path d="M8 24l46-8" strokeWidth={3} />
          <path d="M28 42V32h8v10" />
          <path d="M40 27h5v4h-5z" />
        </g>
      </svg>
    );
  }
  // Flats: a three-storey block with the home's floor highlighted.
  const level = type === 'topFlat' ? 0 : type === 'middleFlat' ? 1 : 2;
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true">
      <g {...common}>
        <path d="M14 6h36v38H14z" />
        <path d="M14 18.7h36M14 31.3h36" strokeWidth={1.5} />
        <rect x={15} y={7 + level * 12.66} width={34} height={10.7} fill="currentColor" opacity={0.4} stroke="none" />
        <path d="M20 10h6v5h-6zM38 10h6v5h-6zM20 23h6v5h-6zM38 23h6v5h-6zM20 35h6v5h-6zM38 35h6v5h-6z" strokeWidth={1.5} />
      </g>
    </svg>
  );
}

export function RoofArt({ type }: { type: RoofType }) {
  switch (type) {
    case 'rcc':
      return (
        <svg viewBox="0 0 64 40" aria-hidden="true">
          <g {...common}>
            <path d="M8 14h48v6H8z" />
            <path d="M12 20v16M52 20v16" />
          </g>
        </svg>
      );
    case 'rccWeathering':
      return (
        <svg viewBox="0 0 64 40" aria-hidden="true">
          <g {...common}>
            <path d="M8 16h48v6H8z" />
            <path d="M8 12h48v4" strokeWidth={1.5} />
            <path d="M16 12v4M24 12v4M32 12v4M40 12v4M48 12v4" strokeWidth={1.5} />
            <path d="M12 22v14M52 22v14" />
          </g>
        </svg>
      );
    case 'tin':
      return (
        <svg viewBox="0 0 64 40" aria-hidden="true">
          <g {...common}>
            <path d="M6 18l6-4 6 4 6-4 6 4 6-4 6 4 6-4 6 4 6-4" />
            <path d="M12 20v16M52 20v16" />
          </g>
        </svg>
      );
    case 'asbestos':
      return (
        <svg viewBox="0 0 64 40" aria-hidden="true">
          <g {...common}>
            <path d="M6 17c3-5 6-5 9 0s6 5 9 0 6-5 9 0 6 5 9 0 6-5 9 0 6 5 9 0" />
            <path d="M12 20v16M52 20v16" />
          </g>
        </svg>
      );
    case 'clayTile':
      return (
        <svg viewBox="0 0 64 40" aria-hidden="true">
          <g {...common}>
            <path d="M6 26L32 8l26 18" />
            <path d="M14 21q3 3 6 0M22 16q3 3 6 0M34 16q3 3 6 0M42 21q3 3 6 0" strokeWidth={1.5} />
            <path d="M12 24v12M52 24v12" />
          </g>
        </svg>
      );
    case 'thatch':
      return (
        <svg viewBox="0 0 64 40" aria-hidden="true">
          <g {...common}>
            <path d="M4 28L32 4l28 24" />
            <path d="M14 22l4 6M22 15l4 7M32 10v8M42 15l-4 7M50 22l-4 6" strokeWidth={1.5} />
            <path d="M12 26v10M52 26v10" />
          </g>
        </svg>
      );
  }
}

/**
 * The hero's house outline, in a 300 × 240 viewBox. Its roofline follows the
 * home's roof so the hero reads as *this* home.
 */
export function HouseOutline({ roof, homeType }: { roof: RoofType; homeType: HomeType }) {
  const flatRoof = roof === 'rcc' || roof === 'rccWeathering';
  const isFlat = homeType === 'topFlat' || homeType === 'middleFlat' || homeType === 'groundFlat';
  // Roofline, and where it crosses the left (x = 20) and right (x = 280) walls.
  let roofPath: string;
  let left = 52;
  let right = 52;
  if (isFlat || flatRoof) {
    roofPath = isFlat ? 'M14 52H286' : 'M10 52H290M10 52v-12M290 52v-12';
  } else if (roof === 'tin' || roof === 'asbestos') {
    roofPath = 'M6 60L294 36';
    left = 60 - (24 * (20 - 6)) / 288;
    right = 60 - (24 * (280 - 6)) / 288;
  } else {
    roofPath = 'M4 70L150 8L296 70';
    left = 70 - (62 * (20 - 4)) / 146;
    right = left;
  }
  // A water tank on the terrace: the most Indian detail a flat concrete roof can have.
  const tank = (flatRoof || isFlat) && homeType !== 'middleFlat' && homeType !== 'groundFlat';
  return (
    <svg className="house-outline" viewBox="0 0 300 240" preserveAspectRatio="none" aria-hidden="true">
      <path d={roofPath} className="house-outline__roof" vectorEffect="non-scaling-stroke" />
      {tank && <path d="M44 52V30q0-5 5-5h24q5 0 5 5v22M50 25v-4h22v4" className="house-outline__walls" vectorEffect="non-scaling-stroke" />}
      <path d={`M20 ${left.toFixed(1)}V232H280V${right.toFixed(1)}`} className="house-outline__walls" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
