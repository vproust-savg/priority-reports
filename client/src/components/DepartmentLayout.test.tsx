// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/DepartmentLayout.test.tsx
// PURPOSE: Tests that pages flagged hiddenFromNav get no nav tab
//          while visible pages keep theirs.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DepartmentLayout from './DepartmentLayout';
import { departments } from '../config/departments';

describe('DepartmentLayout nav tabs', () => {
  it('hides the Supabase receiving log tab but keeps Receiving Log', () => {
    const foodSafety = departments.find((d) => d.id === 'food-safety')!;
    render(
      <MemoryRouter initialEntries={['/food-safety/receiving-log']}>
        <DepartmentLayout department={foodSafety} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Receiving Log' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Receiving Log (Supabase)' })).not.toBeInTheDocument();
  });
});
