// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useClickOutside.test.ts
// PURPOSE: Regression tests for useClickOutside — specifically the
//          invariant that descendants of the ref'd element do NOT
//          trigger onOutside. The TableToolbar click-outside regression
//          (ebefceb) violated exactly this invariant.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { useClickOutside } from './useClickOutside';

function mountNode(parent: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  parent.appendChild(el);
  return el;
}

describe('useClickOutside', () => {
  let container: HTMLElement;
  let inside: HTMLElement;
  let descendant: HTMLElement;
  let outside: HTMLElement;

  beforeEach(() => {
    container = mountNode(document.body);
    inside = mountNode(container);
    descendant = mountNode(inside); // nested inside the ref'd element
    outside = mountNode(document.body);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fires onOutside when mousedown target is outside the ref', () => {
    const onOutside = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(inside);
      useClickOutside(ref, onOutside, true);
    });
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when mousedown target is the ref element itself', () => {
    const onOutside = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(inside);
      useClickOutside(ref, onOutside, true);
    });
    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('does NOT fire when mousedown target is a descendant of the ref element (regression)', () => {
    // WHY: This is the exact scenario the TableToolbar regression broke —
    // clicks on elements inside the guarded region must be treated as "inside".
    const onOutside = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(inside);
      useClickOutside(ref, onOutside, true);
    });
    descendant.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('also handles touchstart events', () => {
    const onOutside = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(inside);
      useClickOutside(ref, onOutside, true);
    });
    outside.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does not attach listeners when disabled', () => {
    const onOutside = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(inside);
      useClickOutside(ref, onOutside, false);
    });
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('detaches listeners on unmount', () => {
    const onOutside = vi.fn();
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement>(inside);
      useClickOutside(ref, onOutside, true);
    });
    unmount();
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onOutside).not.toHaveBeenCalled();
  });
});
