// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/htmlParser.test.ts
// PURPOSE: Tests parseGrvRemarks — confirms both the template default
//          labels and the hand-typed label variants parse correctly.
// USED BY: Vitest (server suite)
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { parseGrvRemarks } from './htmlParser';

describe('parseGrvRemarks', () => {
  it('parses the template default labels (License Plate, Time of Receiving)', () => {
    const html = '<p>License Plate: ABC123<br>Time of Receiving: 14:30</p>';
    const r = parseGrvRemarks(html);
    expect(r.licensePlate).toBe('ABC123');
    expect(r.receivingTime).toBe('14:30');
  });

  it('parses the hand-typed variants (Licence Plate, Receiving Time)', () => {
    const html = '<p>Licence Plate: XYZ789<br>Receiving Time: 09:15</p>';
    const r = parseGrvRemarks(html);
    expect(r.licensePlate).toBe('XYZ789');
    expect(r.receivingTime).toBe('09:15');
  });

  it('still parses the other inspection fields', () => {
    const html = [
      'Driver ID: D-42',
      'Truck Temp. °F (dry if ambient): 34',
      'Product Surface Temp °F: 38',
      'Condition of Product (accept/reject): Accept',
      'Condition of Truck (accept/reject): Reject',
      'Comments: looked good',
    ].join('<br>');
    const r = parseGrvRemarks(`<p>${html}</p>`);
    expect(r.driverId).toBe('D-42');
    expect(r.truckTemp).toBe('34');
    expect(r.productTemp).toBe('38');
    expect(r.productCondition).toBe('Accept');
    expect(r.truckCondition).toBe('Reject');
    expect(r.comments).toBe('looked good');
  });
});
