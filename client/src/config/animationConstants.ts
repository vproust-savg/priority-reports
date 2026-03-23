// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/animationConstants.ts
// PURPOSE: Shared animation spring presets and reusable variants.
//          Every animated component imports from here — never
//          inline spring values.
// USED BY: All animated components
// EXPORTS: SPRING_*, EASE_*, FADE_*, REDUCED_*
// ═══════════════════════════════════════════════════════════════

// --- Named spring presets ---
// WHY: Centralized configs prevent drift between components.
// Each preset serves a specific interaction category.
export const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 35 };
export const SPRING_GENTLE = { type: 'spring' as const, stiffness: 300, damping: 25 };
export const SPRING_BOUNCY = { type: 'spring' as const, stiffness: 400, damping: 15 };
export const SPRING_STIFF = { type: 'spring' as const, stiffness: 600, damping: 20 };
export const EASE_FADE = { duration: 0.2, ease: 'easeOut' as const };

// --- Reusable variant sets ---
export const FADE_SLIDE_UP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const FADE_SCALE = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
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
