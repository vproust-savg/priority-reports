// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsParser.test.ts
// PURPOSE: Unit tests for Customer Returns HTML remarks parser.
//          Mirrors htmlParser.test.ts structure.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { parseCustomerReturnsRemarks } from '../src/services/customerReturnsParser';

const FULL_HTML = `
<style>.ExternalClass{width:100%}</style>
<p>Requested By : Jean<br>
Request Method (Email, Phone, Text) : Email</p>
<p>Return Details : cheese is moldy<br>
Food Safety Concern (Yes/No) : No</p>
`;

describe('parseCustomerReturnsRemarks', () => {
  it('extracts all 4 fields from full HTML', () => {
    const r = parseCustomerReturnsRemarks(FULL_HTML);
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBe('Email');
    expect(r.returnDetails).toBe('cheese is moldy');
    expect(r.foodSafetyConcern).toBe('No');
  });

  it('returns nulls for missing fields', () => {
    const r = parseCustomerReturnsRemarks('<p>Requested By : Jean</p>');
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBeNull();
    expect(r.returnDetails).toBeNull();
    expect(r.foodSafetyConcern).toBeNull();
  });

  it('returns all nulls for null input', () => {
    const r = parseCustomerReturnsRemarks(null);
    expect(r.requestedBy).toBeNull();
    expect(r.requestMethod).toBeNull();
    expect(r.returnDetails).toBeNull();
    expect(r.foodSafetyConcern).toBeNull();
  });

  it('returns all nulls for empty string', () => {
    expect(parseCustomerReturnsRemarks('').requestedBy).toBeNull();
  });

  it('returns all nulls for whitespace-only string', () => {
    expect(parseCustomerReturnsRemarks('   \n  ').requestedBy).toBeNull();
  });

  it('decodes HTML entities and trims whitespace', () => {
    const html = '<p>Requested By&nbsp;:&nbsp; Jean &amp; Co </p>';
    expect(parseCustomerReturnsRemarks(html).requestedBy).toBe('Jean & Co');
  });

  it('handles <br> tags with data attributes', () => {
    const html = 'Requested By : Jean<br data-foo="x">Request Method : Email';
    const r = parseCustomerReturnsRemarks(html);
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBe('Email');
  });

  it('ignores lines without colons', () => {
    const html = '<p>No colon here</p><p>Requested By : Jean</p>';
    expect(parseCustomerReturnsRemarks(html).requestedBy).toBe('Jean');
  });

  it('handles colons inside values', () => {
    const html = '<p>Return Details : Item received at 10:30 AM; moldy</p>';
    expect(parseCustomerReturnsRemarks(html).returnDetails).toBe(
      'Item received at 10:30 AM; moldy',
    );
  });

  it('case-insensitive prefix matching', () => {
    expect(parseCustomerReturnsRemarks('<p>REQUESTED BY : Jean</p>').requestedBy).toBe('Jean');
    expect(parseCustomerReturnsRemarks('<p>requested by : Jean</p>').requestedBy).toBe('Jean');
  });

  it('Food Safety Concern Yes/No values pass through unchanged', () => {
    expect(parseCustomerReturnsRemarks('<p>Food Safety Concern (Yes/No) : Yes</p>').foodSafetyConcern).toBe('Yes');
    expect(parseCustomerReturnsRemarks('<p>Food Safety Concern (Yes/No) : No</p>').foodSafetyConcern).toBe('No');
  });
});
