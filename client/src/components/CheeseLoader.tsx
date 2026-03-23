// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/CheeseLoader.tsx
// PURPOSE: Branded cheese wheel loading animation. SVG wheel with
//          two animation variants: trailing sweep and slice cut.
//          Pure CSS keyframes — no Framer Motion, no external libs.
// USED BY: ReportTableWidget
// EXPORTS: CheeseLoader (default)
// ═══════════════════════════════════════════════════════════════

import TableSkeleton from './TableSkeleton';

interface CheeseLoaderProps {
  variant?: 'slice-reveal' | 'slice-cut';
}

// WHY: 6 wedges at 60deg each. Pre-computed arc endpoints for a circle
// centered at (40,40) with radius 36. Formula: (40 + 36*sin(angle), 40 - 36*cos(angle))
const WEDGE_PATHS = [
  'M40,40 L40,4 A36,36 0 0,1 71.18,22 Z',
  'M40,40 L71.18,22 A36,36 0 0,1 71.18,58 Z',
  'M40,40 L71.18,58 A36,36 0 0,1 40,76 Z',
  'M40,40 L40,76 A36,36 0 0,1 8.82,58 Z',
  'M40,40 L8.82,58 A36,36 0 0,1 8.82,22 Z',
  'M40,40 L8.82,22 A36,36 0 0,1 40,4 Z',
];

// WHY: Holes are subtle texture (15-30% opacity lighter gold), NOT opaque
// white cartoon cutouts. Varying sizes and opacities for organic feel.
const HOLES = [
  { cx: 48, cy: 18, r: 2.5, opacity: 0.25 },
  { cx: 58, cy: 32, r: 2, opacity: 0.2 },
  { cx: 55, cy: 48, r: 3, opacity: 0.3 },
  { cx: 35, cy: 25, r: 1.5, opacity: 0.15 },
  { cx: 28, cy: 42, r: 2.5, opacity: 0.25 },
  { cx: 42, cy: 58, r: 2, opacity: 0.2 },
  { cx: 22, cy: 55, r: 1.5, opacity: 0.15 },
  { cx: 50, cy: 24, r: 1.5, opacity: 0.2 },
];

export default function CheeseLoader({ variant = 'slice-reveal' }: CheeseLoaderProps) {
  return (
    <div role="status" aria-label="Loading data">
      <div className="flex flex-col items-center justify-center py-16">
        <svg
          viewBox="0 0 80 80"
          width="96"
          height="96"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(180, 140, 50, 0.15))' }}
        >
          <defs>
            <radialGradient id="cheese-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#DCBA5C" />
              <stop offset="100%" stopColor="#C89A30" />
            </radialGradient>
            <style>{`
              @keyframes cheese-sweep {
                0%   { opacity: 0; }
                8%   { opacity: 1; }
                58%  { opacity: 1; }
                67%  { opacity: 0; }
                100% { opacity: 0; }
              }
              .sweep-wedge {
                opacity: 0;
                animation: cheese-sweep 3.6s cubic-bezier(0.25, 0.1, 0.25, 1) infinite both;
              }
              .pop-wedge {
                transform-origin: 40px 40px;
                animation-duration: 3.9s;
                animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
                animation-iteration-count: infinite;
                animation-fill-mode: both;
              }
              @keyframes pop-0 {
                0% { transform: translate(0,0) rotate(0); }
                6.5% { transform: translate(4px,-6.9px) rotate(3deg); }
                9% { transform: translate(4px,-6.9px) rotate(3deg); }
                15.5% { transform: translate(0,0) rotate(0); }
                100% { transform: translate(0,0) rotate(0); }
              }
              @keyframes pop-1 {
                0% { transform: translate(0,0) rotate(0); }
                6.5% { transform: translate(8px,0px) rotate(3deg); }
                9% { transform: translate(8px,0px) rotate(3deg); }
                15.5% { transform: translate(0,0) rotate(0); }
                100% { transform: translate(0,0) rotate(0); }
              }
              @keyframes pop-2 {
                0% { transform: translate(0,0) rotate(0); }
                6.5% { transform: translate(4px,6.9px) rotate(3deg); }
                9% { transform: translate(4px,6.9px) rotate(3deg); }
                15.5% { transform: translate(0,0) rotate(0); }
                100% { transform: translate(0,0) rotate(0); }
              }
              @keyframes pop-3 {
                0% { transform: translate(0,0) rotate(0); }
                6.5% { transform: translate(-4px,6.9px) rotate(3deg); }
                9% { transform: translate(-4px,6.9px) rotate(3deg); }
                15.5% { transform: translate(0,0) rotate(0); }
                100% { transform: translate(0,0) rotate(0); }
              }
              @keyframes pop-4 {
                0% { transform: translate(0,0) rotate(0); }
                6.5% { transform: translate(-8px,0px) rotate(3deg); }
                9% { transform: translate(-8px,0px) rotate(3deg); }
                15.5% { transform: translate(0,0) rotate(0); }
                100% { transform: translate(0,0) rotate(0); }
              }
              @keyframes pop-5 {
                0% { transform: translate(0,0) rotate(0); }
                6.5% { transform: translate(-4px,-6.9px) rotate(3deg); }
                9% { transform: translate(-4px,-6.9px) rotate(3deg); }
                15.5% { transform: translate(0,0) rotate(0); }
                100% { transform: translate(0,0) rotate(0); }
              }
              @media (prefers-reduced-motion: reduce) {
                .sweep-wedge, .pop-wedge {
                  animation: none !important;
                  opacity: 1 !important;
                  transform: none !important;
                }
              }
            `}</style>
          </defs>

          {WEDGE_PATHS.map((d, i) => {
            const isSweep = variant === 'slice-reveal';
            return (
              <path
                key={i}
                d={d}
                fill="url(#cheese-gradient)"
                stroke="#B8912E"
                strokeWidth="0.5"
                className={isSweep ? 'sweep-wedge' : 'pop-wedge'}
                style={isSweep
                  ? { animationDelay: `${i * 0.6}s` }
                  : { animationName: `pop-${i}`, animationDelay: `${i * 0.65}s` }
                }
              />
            );
          })}

          {HOLES.map((h, i) => (
            <circle
              key={`hole-${i}`}
              cx={h.cx}
              cy={h.cy}
              r={h.r}
              fill="#E0BE6A"
              fillOpacity={h.opacity}
              stroke="#C49B38"
              strokeWidth="0.3"
            />
          ))}
        </svg>
        <p className="mt-4 text-sm text-slate-500">Preparing your report...</p>
      </div>
      <div className="opacity-50">
        <TableSkeleton />
      </div>
    </div>
  );
}
