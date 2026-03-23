// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/LoadingBar.tsx
// PURPOSE: Thin gradient progress bar for two-phase data loading.
//          Shows indeterminate pulse during Phase 1 (quick query),
//          fills to 100% during Phase 2 (base dataset).
// USED BY: ReportTableWidget
// EXPORTS: LoadingBar (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { SPRING_GENTLE } from '../config/animationConstants';

// WHY: Only 'idle', 'quick', and 'base' are used by ReportTableWidget.
// 'idle' = hidden, 'quick' = Phase 1 indeterminate pulse, 'base' = Phase 2 filling.
type LoadingPhase = 'idle' | 'quick' | 'base';

interface LoadingBarProps {
  phase: LoadingPhase;
}

const BAR_GRADIENT = 'linear-gradient(90deg, var(--color-primary), #5AC8FA)';

export default function LoadingBar({ phase }: LoadingBarProps) {
  if (phase === 'idle') return null;

  return (
    <div className="mx-5 mt-2 h-0.5 bg-primary/10 rounded-full overflow-hidden">
      {phase === 'quick' && (
        <div
          className="h-full rounded-full"
          style={{
            background: BAR_GRADIENT,
            animation: 'loading-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {phase === 'base' && (
        <motion.div
          className="h-full rounded-full"
          style={{ background: BAR_GRADIENT }}
          initial={{ width: '60%' }}
          animate={{ width: '100%' }}
          transition={SPRING_GENTLE}
        />
      )}
    </div>
  );
}
