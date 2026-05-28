// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/customerReturnsParser.ts
// PURPOSE: Parses HTML remarks from Priority's DOCUMENTSTEXT_SUBFORM
//          on DOCUMENTS_N into 4 structured Customer Returns fields.
//          Mirrors htmlParser.ts (GRV) — same cleaning pipeline,
//          different FIELD_MAP.
// USED BY: reports/customerReturns.ts
// EXPORTS: parseCustomerReturnsRemarks, CustomerReturnsRemarkFields
// ═══════════════════════════════════════════════════════════════

export interface CustomerReturnsRemarkFields {
  requestedBy: string | null;
  requestMethod: string | null;
  returnDetails: string | null;
  foodSafetyConcern: string | null;
}

// WHY: Match on lowercase prefix to handle label variations and
// inconsistent casing typed by Priority users.
const FIELD_MAP: Array<{ prefix: string; field: keyof CustomerReturnsRemarkFields }> = [
  { prefix: 'requested by', field: 'requestedBy' },
  { prefix: 'request method', field: 'requestMethod' },
  { prefix: 'return details', field: 'returnDetails' },
  { prefix: 'food safety concern', field: 'foodSafetyConcern' },
];

const EMPTY_FIELDS: CustomerReturnsRemarkFields = {
  requestedBy: null,
  requestMethod: null,
  returnDetails: null,
  foodSafetyConcern: null,
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

export function parseCustomerReturnsRemarks(html: string | null): CustomerReturnsRemarkFields {
  if (!html || html.trim() === '') return { ...EMPTY_FIELDS };

  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<br[^>]*\/?>/gi, '\n');
  text = text.replace(/<\/?(p|div)\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);

  const result: CustomerReturnsRemarkFields = { ...EMPTY_FIELDS };

  for (const line of text.split('\n')) {
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
