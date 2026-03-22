// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/htmlParser.test.ts
// PURPOSE: Unit tests for GRV HTML remarks parser.
//          Tests normal, partial, empty, and real UAT HTML.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { parseGrvRemarks } from '../src/services/htmlParser';

const FULL_HTML = `
<style>.ExternalClass{width:100%}</style>
<p>Driver ID : John Smith<br>
Licence Plate : ABC-1234</p>
<div>Truck Temp. °F (dry if ambient) : 34<br>
Product Surface Temp. °F : 36</div>
<p>Condition of Product (accept/reject) : accept<br>
Condition of Truck (accept/reject) : accept</p>
<p>Comments : All good</p>
`;

describe('parseGrvRemarks', () => {
  it('extracts all 7 fields from full HTML', () => {
    const result = parseGrvRemarks(FULL_HTML);
    expect(result.driverId).toBe('John Smith');
    expect(result.licensePlate).toBe('ABC-1234');
    expect(result.truckTemp).toBe('34');
    expect(result.productTemp).toBe('36');
    expect(result.productCondition).toBe('accept');
    expect(result.truckCondition).toBe('accept');
    expect(result.comments).toBe('All good');
  });

  it('returns nulls for missing fields', () => {
    const partial = '<p>Driver ID : Jane Doe</p>';
    const result = parseGrvRemarks(partial);
    expect(result.driverId).toBe('Jane Doe');
    expect(result.licensePlate).toBeNull();
    expect(result.truckTemp).toBeNull();
    expect(result.productTemp).toBeNull();
    expect(result.productCondition).toBeNull();
    expect(result.truckCondition).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('returns all nulls for null input', () => {
    const result = parseGrvRemarks(null);
    expect(result.driverId).toBeNull();
    expect(result.licensePlate).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('returns all nulls for empty string', () => {
    const result = parseGrvRemarks('');
    expect(result.driverId).toBeNull();
  });

  it('handles HTML entities and extra whitespace', () => {
    const html = '<p>Driver ID&nbsp;:&nbsp; Test &amp; Value </p>';
    const result = parseGrvRemarks(html);
    expect(result.driverId).toBe('Test & Value');
  });

  it('handles real UAT HTML structure', () => {
    // WHY: This matches the actual HTML from Priority UAT record GR26000488
    const uatHtml = `<style>.ExternalClass {width:100%;}.ExternalClass,.ExternalClass p,.ExternalClass span,.ExternalClass font,.ExternalClass td {line-height: 100%;}</style><p>Driver ID : Test line 1<br>Licence Plate : Test line 2</p><div>Truck Temp. &deg;F (dry if ambient) : Test line 3<br>Product Surface Temp. &deg;F : Test line 4</div><p>Condition of Product (accept/reject) : Test line 5<br>Condition of Truck (accept/reject) : Test line 6</p><p>Comments : Test line 7</p>`;
    const result = parseGrvRemarks(uatHtml);
    expect(result.driverId).toBe('Test line 1');
    expect(result.licensePlate).toBe('Test line 2');
    expect(result.truckTemp).toBe('Test line 3');
    expect(result.productTemp).toBe('Test line 4');
    expect(result.productCondition).toBe('Test line 5');
    expect(result.truckCondition).toBe('Test line 6');
    expect(result.comments).toBe('Test line 7');
  });

  it('returns all nulls for whitespace-only string', () => {
    const result = parseGrvRemarks('   \n  ');
    expect(result.driverId).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('handles <br> tags with data attributes', () => {
    // WHY: Priority's <br> tags often have data-* attributes
    const html = 'Driver ID : DRV-1<br data-abc="true">Licence Plate : XYZ-999';
    const result = parseGrvRemarks(html);
    expect(result.driverId).toBe('DRV-1');
    expect(result.licensePlate).toBe('XYZ-999');
  });

  it('ignores lines without colons', () => {
    const html = '<p>No colon here</p><p>Driver ID : DRV-99</p>';
    expect(parseGrvRemarks(html).driverId).toBe('DRV-99');
  });

  it('handles colons in values (e.g., time format)', () => {
    const html = '<p>Comments : Arrived at 10:30 AM</p>';
    expect(parseGrvRemarks(html).comments).toBe('Arrived at 10:30 AM');
  });
});
