// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/cells/AttachmentsCell.test.tsx
// PURPOSE: Tests the paperclip + popover + download trigger.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AttachmentsCell } from './AttachmentsCell';

const ATTACHMENTS = [
  { num: 1, filename: 'invoice.pdf' },
  { num: 2, filename: 'photo.jpg' },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AttachmentsCell', () => {
  it('renders nothing for empty attachments array', () => {
    const { container } = render(
      <AttachmentsCell value={[]} docNo="RT1" type="N" />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders nothing for null attachments', () => {
    const { container } = render(
      <AttachmentsCell value={null} docNo="RT1" type="N" />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders paperclip + count for non-empty array', () => {
    render(<AttachmentsCell value={ATTACHMENTS} docNo="RT1" type="N" />);
    const trigger = screen.getByRole('button', { name: /attachments/i });
    expect(trigger.textContent).toContain('2');
  });

  it('clicking trigger reveals filenames in a popover', () => {
    render(<AttachmentsCell value={ATTACHMENTS} docNo="RT1" type="N" />);
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('clicking a filename triggers a download anchor with the correct URL', () => {
    // Spy on document.createElement and capture the anchor click.
    const clickSpy = vi.fn();
    const created: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag.toLowerCase() === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = clickSpy;
        created.push(anchor);
      }
      return el;
    });

    render(<AttachmentsCell value={ATTACHMENTS} docNo="RT26000013" type="N" />);
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    fireEvent.click(screen.getByText('invoice.pdf'));

    expect(clickSpy).toHaveBeenCalled();
    const a = created[created.length - 1];
    expect(a.getAttribute('href')).toBe('/api/v1/attachments/DOCUMENTS_N/RT26000013/N/1');
    expect(a.download).toBe('invoice.pdf');
  });

  it('uses the integer num (not the filename) in the URL', () => {
    const clickSpy = vi.fn();
    const created: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag.toLowerCase() === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
        created.push(el as HTMLAnchorElement);
      }
      return el;
    });

    render(<AttachmentsCell value={ATTACHMENTS} docNo="RT26000013" type="N" />);
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    fireEvent.click(screen.getByText('photo.jpg'));

    const a = created[created.length - 1];
    // Verify URL ends with /2 (the num), not the filename
    expect(a.getAttribute('href')).toBe('/api/v1/attachments/DOCUMENTS_N/RT26000013/N/2');
    expect(a.download).toBe('photo.jpg');
  });

  it('closes the popover when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <AttachmentsCell value={ATTACHMENTS} docNo="RT1" type="N" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('invoice.pdf')).toBeNull();
  });

  // WHY: The popover must render via React portal into document.body so it
  // escapes the table's overflow context. Inside the Airtable iframe, the
  // table cell / row / widget card has overflow clipping that hid the
  // previous position:absolute popover.
  it('renders the popover via a portal outside the cell container', () => {
    const { container } = render(
      <AttachmentsCell value={ATTACHMENTS} docNo="RT1" type="N" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    const popover = screen.getByRole('menu');
    // The popover must NOT be a descendant of the rendered container
    // (which is where the trigger button lives) — it must live in document.body.
    expect(container.contains(popover)).toBe(false);
    expect(document.body.contains(popover)).toBe(true);
  });

  it('positions the popover with position:fixed (escapes overflow contexts)', () => {
    render(<AttachmentsCell value={ATTACHMENTS} docNo="RT1" type="N" />);
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    const popover = screen.getByRole('menu') as HTMLElement;
    expect(popover.style.position).toBe('fixed');
  });

});
