// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/templateService.ts
// PURPOSE: Fetches Excel templates from the Airtable "API Reports"
//          table and caches them in-memory with a 24h TTL.
//          Returns Buffer (not URL — Airtable URLs expire).
// USED BY: routes/export.ts
// EXPORTS: getTemplate
// ═══════════════════════════════════════════════════════════════

import { env } from '../config/environment';

const AIRTABLE_BASE_ID = 'appjwOgR4HsXeGIda';
const AIRTABLE_TABLE_ID = 'tblvqv3S31KQhKRU6';
const REPORT_ID_FIELD = 'fldrsiqwORzxJ6Ouq';
const TEMPLATE_FIELD = 'fldTbiJ7t4Ldd3cH9';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  buffer: Buffer;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getTemplate(reportId: string): Promise<Buffer | null> {
  // Check cache
  const cached = cache.get(reportId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.buffer;
  }

  if (!env.AIRTABLE_TOKEN) {
    console.warn('[templateService] AIRTABLE_TOKEN not set — skipping template fetch');
    return null;
  }

  try {
    // WHY: Filter by Report ID field to find the matching record.
    // Use field ID (not name) because field names can change.
    const filterFormula = encodeURIComponent(`{${REPORT_ID_FIELD}}="${reportId}"`);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${filterFormula}`;

    const listResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
    });

    if (!listResponse.ok) {
      console.error(`[templateService] Airtable list failed: ${listResponse.status}`);
      return null;
    }

    const data = await listResponse.json() as {
      records: Array<{ fields: Record<string, unknown> }>;
    };

    if (data.records.length === 0) return null;

    // WHY: Template field is multipleAttachments — returns an array of
    // { url, filename, size, type } objects. Pick the first one.
    const templateField = data.records[0].fields[TEMPLATE_FIELD] as
      Array<{ url: string; filename: string }> | undefined;

    if (!templateField || templateField.length === 0) return null;

    const attachmentUrl = templateField[0].url;

    // WHY: Download the actual file and cache the Buffer.
    // Airtable attachment URLs are temporary and expire after hours.
    const downloadResponse = await fetch(attachmentUrl);
    if (!downloadResponse.ok) {
      console.error(`[templateService] Template download failed: ${downloadResponse.status}`);
      return null;
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    cache.set(reportId, { buffer, fetchedAt: Date.now() });
    return buffer;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[templateService] Failed to fetch template: ${message}`);
    return null;
  }
}
