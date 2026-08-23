/**
 * Flat single-color gesture pictograms, built only from rounded rects,
 * circles and simple triangles so all of them share the same visual weight.
 * They inherit color via `currentColor` — tint them from the parent with
 * a text-* class.
 */

type IconProps = { className?: string };

function IconBase({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      {children}
    </svg>
  );
}

/** Small open hand used by the Go / Back icons. */
function SmallPalm() {
  return (
    <g>
      <rect x="4.4" y="5.6" width="2.2" height="7" rx="1.1" />
      <rect x="7" y="4.2" width="2.2" height="8.2" rx="1.1" />
      <rect x="9.6" y="4.6" width="2.2" height="7.8" rx="1.1" />
      <rect x="12.2" y="5.8" width="2.2" height="6.6" rx="1.1" />
      {/* thumb */}
      <rect x="2.2" y="10.2" width="2.2" height="5.4" rx="1.1" transform="rotate(-35 3.3 12.9)" />
      {/* palm */}
      <rect x="4.4" y="11" width="10" height="8.6" rx="3.8" />
    </g>
  );
}

/** Head with turn arrows — LOOK (steer with your head) */
export function LookIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      {/* head */}
      <circle cx="12" cy="9.6" r="5" />
      {/* shoulders */}
      <rect x="5.6" y="16" width="12.8" height="6" rx="3" />
      {/* turn arrows */}
      <path d="M5 6.9 1.9 9.6 5 12.3z" />
      <path d="M19 6.9 22.1 9.6 19 12.3z" />
    </IconBase>
  );
}

/** Palm facing the camera + up arrow — GO (walk forward) */
export function GoIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <SmallPalm />
      {/* forward arrow */}
      <path d="M20 4.6 17.4 9h5.2z" />
      <rect x="19.2" y="8.6" width="1.6" height="6.2" rx="0.8" />
    </IconBase>
  );
}

/** Back of the hand + down arrow — BACK (walk backward) */
export function BackIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <SmallPalm />
      {/* backward arrow */}
      <path d="M20 19.4 17.4 15h5.2z" />
      <rect x="19.2" y="9.2" width="1.6" height="6.2" rx="0.8" />
    </IconBase>
  );
}

/** Thumbs up — JUMP */
export function ThumbIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      {/* sleeve */}
      <rect x="3.2" y="10.6" width="3.4" height="9" rx="1.4" />
      {/* folded fingers */}
      <rect x="7.6" y="10.6" width="12.2" height="9" rx="3.6" />
      {/* thumb */}
      <rect x="9" y="2.4" width="3.2" height="10.4" rx="1.6" transform="rotate(-14 10.6 7.6)" />
    </IconBase>
  );
}

/** Pinch holding a tiny block — BUILD (place a block) */
export function PinchIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      {/* three raised fingers */}
      <rect x="10.8" y="3.4" width="2.5" height="7.6" rx="1.25" />
      <rect x="13.8" y="3" width="2.5" height="7.9" rx="1.25" />
      <rect x="16.7" y="4.2" width="2.5" height="6.9" rx="1.25" />
      {/* palm */}
      <rect x="9" y="9.6" width="11.4" height="10.4" rx="4.4" />
      {/* index reaching toward the block */}
      <rect x="6.4" y="4.8" width="2.6" height="7.6" rx="1.3" transform="rotate(-34 7.7 8.6)" />
      {/* thumb reaching toward the block */}
      <rect x="5.6" y="11" width="2.6" height="7.2" rx="1.3" transform="rotate(46 6.9 14.6)" />
      {/* the block being pinched */}
      <rect x="2.4" y="7.2" width="3.6" height="3.6" rx="0.8" />
    </IconBase>
  );
}

/** Index finger poking a cracked block — BREAK (point at a block to mine it) */
export function PointIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      {/* extended index */}
      <rect x="8.6" y="2.8" width="2.6" height="9.4" rx="1.3" />
      {/* curled fingers, stacked shorter than the index */}
      <rect x="11.8" y="7.6" width="2.4" height="4.6" rx="1.2" />
      <rect x="14.6" y="8.2" width="2.4" height="4" rx="1.2" />
      {/* palm */}
      <rect x="8.2" y="11" width="9.6" height="9" rx="3.8" />
      {/* thumb */}
      <rect x="6.2" y="12" width="2.4" height="5.6" rx="1.2" transform="rotate(38 7.4 14.8)" />
      {/* the block taking the hit, with a chip out of it */}
      <rect x="1.6" y="3.4" width="4.6" height="4.6" rx="0.8" />
      <path d="M6.4 8.8 4.6 10.6 6.4 10.6z" />
    </IconBase>
  );
}

/** A block with an orbit ring around it — ORBIT (fist-drag around a target) */
export function OrbitIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      {/* the grabbed block */}
      <rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1.1" />
      {/* orbit path */}
      <ellipse
        cx="12"
        cy="12"
        rx="9"
        ry="4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {/* direction arrowhead on the ring */}
      <path d="M19.6 9.4 23 11.9l-4 1.3z" />
    </IconBase>
  );
}
