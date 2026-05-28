// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/attachments.ts
// PURPOSE: Proxies file bytes from Priority's EXTFILES_SUBFORM back
//          to the browser as a downloadable attachment. Uses Priority's
//          integer-key subform pattern to fetch one record by EXTFILENUM.
// USED BY: index.ts (mounted at /api/v1/attachments)
// EXPORTS: createAttachmentsRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { queryPriority } from '../services/priorityClient';

// WHY: Allowlist — only entities explicitly listed can be read via this route.
// Add new entities here AFTER confirming their EXTFILES_SUBFORM field names.
const ALLOWED_ENTITIES = new Set(['DOCUMENTS_N']);

// WHY: Strict input regex blocks OData injection (no quotes) and path
// traversal (no slashes / parent dirs). Allows alphanumeric, dot, space,
// dash, underscore in the docNo/type segments.
const SAFE_KEY = /^[a-zA-Z0-9._ -]+$/;
const POSITIVE_INT = /^\d+$/;

export function createAttachmentsRouter(): Router {
  const router = Router();

  router.get('/:entity/:docNo/:type/:extfilenum', async (req, res) => {
    const { entity, docNo, type, extfilenum } = req.params;

    if (!ALLOWED_ENTITIES.has(entity)) {
      res.status(400).json({ error: `Entity '${entity}' is not allowed.` });
      return;
    }
    if (!SAFE_KEY.test(docNo) || !SAFE_KEY.test(type) || !POSITIVE_INT.test(extfilenum)) {
      res.status(400).json({ error: 'Invalid path parameter.' });
      return;
    }

    const fileNum = Number.parseInt(extfilenum, 10);

    try {
      // WHY: Integer-key subform access (Pattern B) returns a single record;
      // wrap it via $filter on the list endpoint so queryPriority's standard
      // value-array response shape works without a new code path.
      // WHY (no quotes around fileNum): EXTFILENUM is Edm.Int64 — OData
      // requires unquoted integers for numeric comparisons.
      const subformPath = `${entity}(DOCNO='${docNo}',TYPE='${type}')/EXTFILES_SUBFORM`;
      const result = await queryPriority(subformPath, {
        $filter: `EXTFILENUM eq ${fileNum}`,
        $select: 'EXTFILEDES,SUFFIX,EXTFILENAME',
        $top: 1,
      });

      const record = result.value[0];
      if (!record) {
        res.status(404).json({ error: `Attachment ${fileNum} not found.` });
        return;
      }

      const dataUri = record.EXTFILENAME as string | undefined;
      if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
        res.status(502).json({ error: 'Priority returned no file data.' });
        return;
      }

      const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        res.status(502).json({ error: 'Priority file payload was malformed.' });
        return;
      }
      const [, mime, b64] = match;
      const bytes = Buffer.from(b64, 'base64');

      // WHY: Reconstruct the display filename (EXTFILEDES is truncated to 32
      // chars in Priority; SUFFIX carries the extension). Without this the
      // browser would prompt with no extension.
      const desRaw = typeof record.EXTFILEDES === 'string' ? record.EXTFILEDES : `attachment-${fileNum}`;
      const suffix = typeof record.SUFFIX === 'string' && record.SUFFIX.length > 0 ? `.${record.SUFFIX}` : '';
      const filename = `${desRaw}${suffix}`;

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(bytes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      res.status(502).json({ error: `Priority fetch failed: ${msg}` });
    }
  });

  return router;
}
