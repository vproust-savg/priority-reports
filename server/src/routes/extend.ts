// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/extend.ts
// PURPOSE: POST endpoint for extending expiration dates via the
//          Priority EXPDSERIAL/EXPDEXT_SUBFORM API. Supports
//          single and bulk operations.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createExtendRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry, postWithRetry, extractErrorMessage } from '../services/priorityHttp';

const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    serialName: z.string().regex(/^[a-zA-Z0-9_\- ]+$/),
    days: z.number().int().min(1).max(365),
  })).min(1).max(100),
});

interface ExtendResult {
  serialName: string;
  success: boolean;
  newExpiryDate?: string;
  error?: string;
}

// WHY: Adds N days to an ISO date string and returns Priority format.
function addDaysToDate(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('.')[0] + 'Z';
}

async function processExtendItem(
  serialName: string, days: number, baseUrl: string,
): Promise<ExtendResult> {
  // Step 1: Look up current expiry date from EXPDSERIAL
  const escapedName = serialName.replace(/'/g, "''");
  const lookupUrl = `${baseUrl}EXPDSERIAL(SERIALNAME='${escapedName}')?$select=SERIALNAME,EXPIRYDATE`;

  const lookupResponse = await fetchWithRetry(lookupUrl);

  if (lookupResponse.status === 404) {
    return { serialName, success: false, error: 'Lot not found in expiration tracking system' };
  }

  if (lookupResponse.status < 200 || lookupResponse.status >= 300) {
    const msg = extractErrorMessage(lookupResponse.body);
    return { serialName, success: false, error: `Lookup failed: ${msg}` };
  }

  const lookupData = JSON.parse(lookupResponse.body);
  const currentExpiryDate = lookupData.EXPIRYDATE as string;

  if (!currentExpiryDate) {
    return { serialName, success: false, error: 'No expiry date found on EXPDSERIAL record' };
  }

  // Step 2: Calculate new expiry date
  const newExpiryDate = addDaysToDate(currentExpiryDate, days);

  // Step 3: POST new extension record via subform navigation
  // WHY: Direct PATCH on EXPDSERIAL fails with "insufficient form privileges".
  // Priority requires navigating to the subform collection and POSTing there.
  const postUrl = `${baseUrl}EXPDSERIAL(SERIALNAME='${escapedName}')/EXPDEXT_SUBFORM`;
  const postBody = {
    RENEWDATE: currentExpiryDate,
    EXPIRYDATE: newExpiryDate,
  };

  const postResponse = await postWithRetry(postUrl, postBody);

  if (postResponse.status < 200 || postResponse.status >= 300) {
    const msg = extractErrorMessage(postResponse.body);
    return { serialName, success: false, error: `Extension failed: ${msg}` };
  }

  return { serialName, success: true, newExpiryDate };
}

export function createExtendRouter(): Router {
  const router = Router();

  router.post('/bbd/extend', async (req, res) => {
    const parsed = ExtendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { items } = parsed.data;
    const config = getPriorityConfig();

    const results: ExtendResult[] = [];
    for (const item of items) {
      const result = await processExtendItem(item.serialName, item.days, config.baseUrl);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`[bbd-extend] Extended ${successCount}/${results.length} lots`);

    res.json({ results });
  });

  return router;
}
