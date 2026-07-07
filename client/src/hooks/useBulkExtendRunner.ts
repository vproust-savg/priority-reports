// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useBulkExtendRunner.ts
// PURPOSE: Chunked bulk-extend runner — splits a selection into
//          50-item requests (server caps at 100), submits them
//          sequentially with progress/ETA, supports cancel between
//          chunks and resume that never re-extends succeeded lots.
// USED BY: BulkExtendModal
// EXPORTS: useBulkExtendRunner, chunkBulkItems, BULK_CHUNK_SIZE,
//          BULK_MAX_ITEMS, BulkExtendItem, BulkProgress, BulkRunnerState
// ═══════════════════════════════════════════════════════════════

import { useCallback, useRef, useState } from 'react';
import { useExtendExpiry } from './useExtendExpiry';
import type { ExtendResult, RowData } from './useExtendExpiry';

// WHY: 50 keeps each request ~35-40s of Priority calls (2 lookup GETs +
// 50 POSTs at the 95/min limiter) — well under HTTP timeouts, and half
// the server's 100-item defense cap.
export const BULK_CHUNK_SIZE = 50;
// WHY: Victor's stated ceiling. 1,000 lots ≈ 12 min and 10% of Priority's
// 10K/month write quota — anything beyond that needs a deliberate decision.
export const BULK_MAX_ITEMS = 1000;

export interface BulkExtendItem {
  serialName: string;
  days: number;
  rowData?: RowData;
}

export interface BulkProgress {
  processed: number;
  total: number;
  etaSeconds: number | null;
}

export type BulkRunnerState = 'idle' | 'running' | 'paused' | 'done';

export function chunkBulkItems<T>(items: T[], size: number = BULK_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function useBulkExtendRunner() {
  const { extend } = useExtendExpiry({ invalidateOnSuccess: false });
  const [state, setState] = useState<BulkRunnerState>('idle');
  const [progress, setProgress] = useState<BulkProgress>({ processed: 0, total: 0, etaSeconds: null });
  const [results, setResults] = useState<ExtendResult[]>([]);
  const [runError, setRunError] = useState('');

  // WHY: Refs, not state — the run loop reads these between awaits and must
  // see current values, not a stale closure snapshot.
  const itemsRef = useRef<BulkExtendItem[]>([]);
  const resultsRef = useRef<Map<string, ExtendResult>>(new Map());
  const cancelRef = useRef(false);

  const syncResults = useCallback(() => {
    setResults(Array.from(resultsRef.current.values()));
    setProgress((prev) => ({ ...prev, processed: resultsRef.current.size }));
  }, []);

  const runPending = useCallback(async () => {
    // WHY: Resume must never re-extend a succeeded lot (each run would add
    // another +N days in Priority). Failed items DO retry.
    const pending = itemsRef.current.filter(
      (item) => resultsRef.current.get(item.serialName)?.success !== true,
    );
    const total = itemsRef.current.length;

    setState('running');
    setRunError('');
    cancelRef.current = false;

    const chunks = chunkBulkItems(pending);
    const durations: number[] = [];

    for (let c = 0; c < chunks.length; c++) {
      if (cancelRef.current) {
        setState('paused');
        return;
      }

      const startedAt = Date.now();
      try {
        const response = await extend({ items: chunks[c] });
        durations.push(Date.now() - startedAt);
        for (const result of response.results) {
          resultsRef.current.set(result.serialName, result);
        }
        syncResults();

        const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
        const remainingChunks = chunks.length - (c + 1);
        setProgress({
          processed: resultsRef.current.size,
          total,
          etaSeconds: remainingChunks > 0 ? Math.round((avgMs * remainingChunks) / 1000) : 0,
        });
      } catch (err) {
        setRunError(err instanceof Error ? err.message : 'Network error');
        setState('paused');
        return;
      }
    }

    setProgress({ processed: resultsRef.current.size, total, etaSeconds: null });
    setState('done');
  }, [extend, syncResults]);

  const start = useCallback((items: BulkExtendItem[]) => {
    itemsRef.current = items;
    resultsRef.current = new Map();
    setResults([]);
    setProgress({ processed: 0, total: items.length, etaSeconds: null });
    return runPending();
  }, [runPending]);

  const resume = useCallback(() => runPending(), [runPending]);

  // WHY: Takes effect at the next chunk boundary — the in-flight request
  // completes (its extends are already committed in Priority).
  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    itemsRef.current = [];
    resultsRef.current = new Map();
    cancelRef.current = false;
    setResults([]);
    setRunError('');
    setProgress({ processed: 0, total: 0, etaSeconds: null });
    setState('idle');
  }, []);

  return { state, progress, results, runError, start, resume, cancel, reset };
}
