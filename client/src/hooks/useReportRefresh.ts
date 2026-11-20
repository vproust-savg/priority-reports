import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FilterGroup } from '@shared/types';
import type { RefreshDateRange } from '@shared/utils/refreshDateRange';
import { nowInLA } from '@shared/utils/timezone';
import { toISODate } from '@shared/utils/weekUtils';
import { getRefreshDateRange } from '../utils/refreshDateRange';

const rangeErrors = {
  invalidDates: 'Pick a date range of 31 days or fewer to refresh',
  ambiguousDates: 'Use one Date condition in the main AND group to refresh',
  reversed: 'Set the end date on or after the start date to refresh',
  tooLong: 'Refresh covers at most 31 days; narrow the Date filter',
};

type Attempt =
  | { phase: 'pending' | 'reloading' | 'processed'; range?: RefreshDateRange }
  | { phase: 'failed'; range?: RefreshDateRange; message: string };

const unconfirmed = 'Could not confirm the refresh. Try again before exporting.';

async function requestRefresh(reportId: string, range?: RefreshDateRange): Promise<string | undefined> {
  const failure = range ? unconfirmed : 'Could not confirm the table refresh.';
  const request: RequestInit = { method: 'POST' };
  if (range) {
    request.headers = { 'Content-Type': 'application/json' };
    request.body = JSON.stringify(range);
  }
  try {
    const response = await fetch(`/api/v1/reports/${reportId}/refresh`, request);
    if (!response.ok) return failure;
    if (!range) return;
    const body = await response.json();
    switch (body?.status) {
      case 'done': return;
      case 'partial': return 'Priority refresh was incomplete. Refresh these dates again before exporting.';
      case 'error': return 'Priority refresh failed. Try again before exporting.';
      case 'timeout': return 'Refresh timed out. It may still be running.';
      case 'busy': return 'Priority is busy. Try refreshing again later.';
      default: return unconfirmed;
    }
  } catch {
    return failure;
  }
}

export function useReportRefresh(
  reportId: string, sourceRefresh: boolean, filterGroup: FilterGroup, tableReady: boolean, tableFailed: boolean,
) {
  const client = useQueryClient();
  const latest = useRef(0);
  const [attempt, setAttempt] = useState<Attempt>();
  const visibleRange = () => getRefreshDateRange(filterGroup, toISODate(nowInLA()));

  async function handleRefresh() {
    const id = ++latest.current;
    const selection = sourceRefresh ? visibleRange() : undefined;
    if (selection && 'reason' in selection) {
      setAttempt({ phase: 'failed', message: rangeErrors[selection.reason] });
      return;
    }
    const range = selection?.range;
    setAttempt({ phase: 'pending', range });
    const message = await requestRefresh(reportId, range);
    const queries = { queryKey: ['report', reportId] };
    if (message && latest.current === id) setAttempt({ phase: 'failed', message, range });
    if (range && !message) {
      if (latest.current === id) setAttempt({ phase: 'reloading', range });
      // Invalidation alone can reuse an in-flight first load with no cached data.
      // Abort that pre-commit read before asking for the newly saved rows.
      await client.cancelQueries(queries);
    }
    await client.invalidateQueries(queries);
    if (!message && latest.current === id) setAttempt({ phase: 'processed', range });
  }

  const range = attempt?.range;
  const selection = range && visibleRange();
  const dateLabel = range && `${range.from} through ${range.to}`;
  const changedRange = !!range && (!selection || !('range' in selection) ||
    selection.range.from !== range.from || selection.range.to !== range.to);
  const isRefreshing = attempt?.phase === 'pending' || attempt?.phase === 'reloading';
  const exportDisabled = sourceRefresh && (!tableReady || changedRange || (!!attempt && attempt.phase !== 'processed'));

  let notice: string | undefined;
  if (attempt?.phase === 'failed') notice = attempt.message;
  else if (range) {
    if (attempt?.phase === 'pending') notice = 'Refreshing from Priority for';
    else if (attempt?.phase === 'reloading') notice = 'Reloading table after Priority processed';
    else if (tableFailed) notice = 'Table reload failed. Priority processed';
    else if (changedRange) notice = 'Priority processed';
    else if (!tableReady) notice = 'Waiting for the table to load for';
    else notice = 'Refreshed from Priority for';
  }

  const needsAttention = attempt?.phase === 'failed' || changedRange || tableFailed;
  return { handleRefresh, isRefreshing, notice, dateLabel, changedRange, exportDisabled, needsAttention };
}
