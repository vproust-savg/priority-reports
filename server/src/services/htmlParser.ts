// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/htmlParser.ts
// PURPOSE: Parses HTML remarks from Priority's DOCUMENTSTEXT_SUBFORM
//          into structured key-value fields for the GRV Log report.
//          Priority stores inspection data as styled HTML — this
//          strips tags and extracts known field names.
// USED BY: reports/grvLog.ts
// EXPORTS: parseGrvRemarks, GrvRemarkFields
// ═══════════════════════════════════════════════════════════════

export interface GrvRemarkFields {
  driverId: string | null;
  licensePlate: string | null;
  truckTemp: string | null;
  productTemp: string | null;
  productCondition: string | null;
  truckCondition: string | null;
  comments: string | null;
  receivingTime: string | null;
}

// WHY: Map from normalized key prefixes to output field names.
// Priority HTML uses verbose labels like "Truck Temp. °F (dry if ambient)".
// We match on the start of the key to handle minor label variations.
const FIELD_MAP: Array<{ prefix: string; field: keyof GrvRemarkFields }> = [
  { prefix: 'driver id', field: 'driverId' },
  { prefix: 'licence plate', field: 'licensePlate' },
  { prefix: 'truck temp', field: 'truckTemp' },
  { prefix: 'product surface temp', field: 'productTemp' },
  { prefix: 'condition of product', field: 'productCondition' },
  { prefix: 'condition of truck', field: 'truckCondition' },
  { prefix: 'comments', field: 'comments' },
  { prefix: 'time of receiving', field: 'receivingTime' },
];

const EMPTY_FIELDS: GrvRemarkFields = {
  driverId: null,
  licensePlate: null,
  truckTemp: null,
  productTemp: null,
  productCondition: null,
  truckCondition: null,
  comments: null,
  receivingTime: null,
};

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&deg;/gi, '°')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function parseGrvRemarks(html: string | null): GrvRemarkFields {
  if (!html || html.trim() === '') return { ...EMPTY_FIELDS };

  // Strip <style> blocks entirely
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert <br> and block-level boundaries to newlines before stripping tags
  // WHY: Priority wraps each section in <p> or <div> — without this,
  // "Test line 2</p><div>Truck Temp" collapses into one line.
  // WHY: Priority's <br> tags often have data-* attributes: <br data-abc="true">
  text = text.replace(/<br[^>]*\/?>/gi, '\n');
  text = text.replace(/<\/?(p|div)\s*\/?>/gi, '\n');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeEntities(text);

  const result: GrvRemarkFields = { ...EMPTY_FIELDS };

  const lines = text.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = line.slice(0, colonIdx).trim().toLowerCase();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (!rawKey || !rawValue) continue;

    for (const { prefix, field } of FIELD_MAP) {
      if (rawKey.startsWith(prefix)) {
        result[field] = rawValue;
        break;
      }
    }
  }

  return result;
}
