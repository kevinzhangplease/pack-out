import type { Transport } from '../data/types';
import type { LoadZoneGroup } from '../engine/load';

/**
 * The load plan. One memorable, functional device rather than scattered
 * ornament — drawn from the subject's own world: a vehicle load diagram of the
 * kind that goes on the inside of a van door, nose at the top, tappable zones.
 *
 * It switches with the transport, because the same list gets loaded into a van
 * in the morning and onto a back at lunchtime, and the shape of the problem
 * changes completely between them.
 */

interface ZoneShape {
  zone: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Minivan, top-down, nose at the top. Proportions are a van, not a car. */
const VEHICLE_SHAPES: ZoneShape[] = [
  { zone: 'roof', x: 6, y: 6, w: 108, h: 22 },
  { zone: 'cabin-front', x: 18, y: 46, w: 84, h: 40 },
  { zone: 'cabin-rear', x: 18, y: 90, w: 84, h: 44 },
  { zone: 'boot-front', x: 18, y: 138, w: 84, h: 44 },
  { zone: 'boot-rear', x: 18, y: 186, w: 84, h: 34 },
  { zone: 'under-floor', x: 18, y: 224, w: 84, h: 20 },
  { zone: 'hitch', x: 30, y: 254, w: 60, h: 18 },
];

/** Pack, side-on: the zones are stacked the way the pack is. */
const PACK_SHAPES: ZoneShape[] = [
  { zone: 'lid', x: 24, y: 20, w: 72, h: 30 },
  { zone: 'core', x: 24, y: 54, w: 72, h: 74 },
  { zone: 'bottom', x: 24, y: 132, w: 72, h: 48 },
  { zone: 'hipbelt', x: 10, y: 184, w: 100, h: 22 },
  { zone: 'outside', x: 10, y: 210, w: 100, h: 26 },
];

/** Kayak, top-down, bow at the top. */
const BOAT_SHAPES: ZoneShape[] = [
  { zone: 'bow', x: 38, y: 26, w: 44, h: 66 },
  { zone: 'day-hatch', x: 38, y: 96, w: 44, h: 26 },
  { zone: 'cockpit', x: 34, y: 126, w: 52, h: 48 },
  { zone: 'stern', x: 38, y: 178, w: 44, h: 62 },
  { zone: 'deck', x: 6, y: 96, w: 24, h: 78 },
];

const SHAPES: Record<Transport, ZoneShape[]> = {
  vehicle: VEHICLE_SHAPES,
  carried: PACK_SHAPES,
  boat: BOAT_SHAPES,
};

/**
 * The diagram uses short labels; the full ones (with the reason a zone is what
 * it is) belong in the panel underneath, where there is room to read them.
 */
const SHORT_LABELS: Record<string, string> = {
  'cabin-front': 'Cabin, front',
  'cabin-rear': 'Cabin, rear',
  'boot-front': 'Boot, fwd',
  'boot-rear': 'Boot, tailgate',
  'under-floor': 'Under floor',
  core: 'Core',
  bottom: 'Bottom',
  lid: 'Lid',
  hipbelt: 'Hipbelt',
  outside: 'Outside',
  'day-hatch': 'Day hatch',
};

const VIEWBOX: Record<Transport, string> = {
  vehicle: '0 0 120 280',
  carried: '0 0 120 244',
  boat: '0 0 120 250',
};

export function LoadPlan({
  transport,
  groups,
  selected,
  onSelect,
}: {
  transport: Transport;
  groups: LoadZoneGroup[];
  selected: string | null;
  onSelect: (zone: string | null) => void;
}) {
  const byZone = new Map(groups.map((g) => [String(g.zone), g]));
  const shapes = SHAPES[transport];
  const heaviest = Math.max(1, ...groups.map((g) => g.weight_g));

  return (
    <div className="loadplan">
      <svg
        className="loadplan__svg"
        viewBox={VIEWBOX[transport]}
        role="group"
        aria-label={`Load plan, ${transport}`}
      >
        <Outline transport={transport} />

        {shapes.map((shape) => {
          const group = byZone.get(shape.zone);
          const count = group?.lines.length ?? 0;
          const fill = group ? 0.12 + 0.5 * (group.weight_g / heaviest) : 0;
          const isSelected = selected === shape.zone;

          return (
            <g
              key={shape.zone}
              className={
                count === 0
                  ? 'loadplan__zone is-empty'
                  : isSelected
                    ? 'loadplan__zone is-selected'
                    : 'loadplan__zone'
              }
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${group?.label ?? shape.zone}: ${count} item${count === 1 ? '' : 's'}`}
              onClick={() => onSelect(isSelected ? null : shape.zone)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(isSelected ? null : shape.zone);
                }
              }}
            >
              <rect
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
                rx={2}
                className="loadplan__rect"
                style={{ fillOpacity: fill }}
              />
              <text x={shape.x + 4} y={shape.y + 11} className="loadplan__label">
                {(SHORT_LABELS[shape.zone] ?? group?.label ?? shape.zone).toUpperCase()}
              </text>
              {count > 0 && (
                <text
                  x={shape.x + shape.w - 4}
                  /* A short zone has no room for a second line, so the count
                     shares the label's baseline instead of overlapping it. */
                  y={shape.h < 28 ? shape.y + 11 : shape.y + shape.h - 5}
                  className="loadplan__count"
                  textAnchor="end"
                >
                  {count} · {(group!.weight_g / 1000).toFixed(1)}kg
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="loadplan__legend">
        {transport === 'vehicle' && 'Nose at the top. Darker means heavier.'}
        {transport === 'carried' && 'Side on. Darker means heavier.'}
        {transport === 'boat' && 'Bow at the top. Darker means heavier.'}
        {' Tap a zone.'}
      </p>
    </div>
  );
}

/** The vessel itself, so the zones read as being inside something. */
function Outline({ transport }: { transport: Transport }) {
  if (transport === 'vehicle') {
    return (
      <>
        <path
          d="M14 38 Q14 32 26 32 L94 32 Q106 32 106 38 L106 248 Q106 254 94 254 L26 254 Q14 254 14 248 Z"
          className="loadplan__body"
        />
        {/* Windscreen: this is the front, and you should not have to be told. */}
        <path d="M26 36 L94 36 L88 44 L32 44 Z" className="loadplan__glass" />
      </>
    );
  }
  if (transport === 'carried') {
    return (
      <path
        d="M20 16 Q20 10 30 10 L90 10 Q100 10 100 16 L100 182 Q100 190 90 190 L30 190 Q20 190 20 182 Z"
        className="loadplan__body"
      />
    );
  }
  return (
    <path
      d="M60 6 Q84 60 84 124 Q84 190 60 244 Q36 190 36 124 Q36 60 60 6 Z"
      className="loadplan__body"
    />
  );
}
