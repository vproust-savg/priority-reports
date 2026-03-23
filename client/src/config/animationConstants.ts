// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/animationConstants.ts
// PURPOSE: Shared animation presets and reusable variants.
//          Apple-style: simple ease-out, no springs, no bounce.
//          Every animated component imports from here.
// USED BY: All animated components
// EXPORTS: EASE_*, FADE_*, REDUCED_*
// ═══════════════════════════════════════════════════════════════

// --- Easing presets ---
// WHY: Apple-style motion uses simple ease-out curves (200-250ms).
// No spring physics — everything is clean, restrained, invisible.
export const EASE_DEFAULT = { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const };
export const EASE_FAST = { duration: 0.15, ease: 'easeOut' as const };

// --- Reusable variant sets ---
// WHY: y offset is subtle (4px) — just enough to feel directional
// without calling attention to itself.
export const FADE_SLIDE_UP = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export const FADE_IN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// --- Reduced motion versions — opacity only, no transforms ---
// WHY: REDUCED_FADE and REDUCED_TRANSITION are separate objects because
// Framer Motion requires `transition` as its own prop on motion elements.
// Spreading {...REDUCED_FADE} gives initial/animate/exit, then you pass
// transition={REDUCED_TRANSITION} separately.
export const REDUCED_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const REDUCED_TRANSITION = { duration: 0.15 };
