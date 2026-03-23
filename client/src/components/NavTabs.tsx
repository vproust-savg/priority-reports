// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/NavTabs.tsx
// PURPOSE: Navigation tabs with a sliding pill indicator.
//          The pill glides between tabs using Framer Motion layout
//          animation (layoutId), providing visual continuity.
// USED BY: DepartmentLayout.tsx
// EXPORTS: NavTabs (default)
// ═══════════════════════════════════════════════════════════════

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EASE_DEFAULT } from '../config/animationConstants';
import type { PageConfig } from '@shared/types';

interface NavTabsProps {
  pages: PageConfig[];
  currentPath: string;
}

export default function NavTabs({ pages, currentPath }: NavTabsProps) {
  const reduced = useReducedMotion();

  return (
    <nav className="flex gap-1 -mb-px">
      {pages.map((page) => {
        // WHY: Exact match plus trailing-slash variant. Using startsWith would
        // cause false positives (e.g., '/purchasing/bbd-archive' would match '/purchasing/bbd').
        const isActive = currentPath === page.path || currentPath === page.path + '/';
        return (
          <Link
            key={page.id}
            to={page.path}
            className={`relative pb-3 px-3 text-sm font-medium transition-colors duration-150 ${
              isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="nav-indicator"
                className="absolute inset-0 bottom-1 bg-primary/10 rounded-lg"
                transition={reduced ? { duration: 0 } : EASE_DEFAULT}
                layout={!reduced}
              />
            )}
            <span className="relative z-10">{page.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
