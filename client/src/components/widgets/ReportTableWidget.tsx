// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget — server-side filtering, client-side
//          sorting, column management, source refresh and export.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useSortManager } from '../../hooks/useSortManager';
import { useReportRefresh } from '../../hooks/useReportRefresh';
import { useExport } from '../../hooks/useExport';
import { useClickOutside } from '../../hooks/useClickOutside';
import { AnimatePresence, motion } from 'framer-motion';
import { PANEL_FADE } from '../../config/animationConstants';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import SortPanel from '../sort/SortPanel';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import LoadingToast from '../LoadingToast';
import EmptyState from '../EmptyState';
import ErrorState from '../ErrorState';
import CopyableCell from '../cells/CopyableCell';
import { AttachmentsCell } from './cells/AttachmentsCell';
import type { Attachment } from './cells/AttachmentsCell';
import { countActiveFilters } from '../../config/filterConstants';
import { findWidgetByReportId } from '../../config/pages';
import { formatCellValue } from '../../utils/formatters';
import type { PriorityEnvironment } from '@shared/types';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState(reportId);

  // WHY: Per-widget disableCache opt-in (set on grv-log in pages.ts) flows
  // through to the hook so TanStack treats every search as always-fresh.
  const widgetConfig = findWidgetByReportId(reportId);

  // WHY: Every mount starts on Live (plain state, no persistence) — a
  // food-safety user can never inherit UAT from a previous session.
  // activeEnv stays undefined for widgets without the toggle so their
  // requests and queryKeys are byte-identical to before this feature.
  const envToggleEnabled = !!widgetConfig?.envToggle;
  const [priorityEnv, setPriorityEnv] = useState<PriorityEnvironment>('production');
  const activeEnv = envToggleEnabled ? priorityEnv : undefined;
  const handleEnvChange = useCallback((next: PriorityEnvironment) => {
    setPriorityEnv(next);
    setPage(1); // WHY: page N of Live has no meaning in UAT's result set
  }, [setPage]);

  const filtersQuery = useFiltersQuery(reportId, activeEnv);
  const filterColumns = filtersQuery.data?.columns ?? [];

  // WHY: clientSidePagination reports return the whole result set in one query.
  // Fetch page 1 once and paginate locally so page changes don't refetch.
  const clientPaged = !!widgetConfig?.clientSidePagination;
  const query = useReportQuery(
    reportId,
    { filterGroup: debouncedGroup, page: clientPaged ? 1 : page, pageSize: 50, environment: activeEnv },
    { disableCache: widgetConfig?.disableCache },
  );

  const {
    managedColumns, visibleColumns, hiddenCount,
    isColumnPanelOpen, setIsColumnPanelOpen,
    toggleColumn, reorderColumns, showAll, hideAll,
  } = useColumnManager(query.data?.columns);

  const {
    sortRules, sortedData, addSort, removeSort, updateSort,
    reorderSorts, clearAll: clearAllSorts,
    isSortPanelOpen, setIsSortPanelOpen, sortCount,
  } = useSortManager(visibleColumns);

  // WHY: Stable reference for useExport dependency — only changes when
  // the actual set of visible column keys changes, not on every render.
  const visibleColumnKeys = useMemo(
    () => visibleColumns.map((c) => c.key),
    [visibleColumns],
  );

  const { isExporting, toast, clearToast, triggerExport } = useExport(
    reportId, debouncedGroup, visibleColumnKeys, activeEnv,
  );

  const [copyToast, setCopyToast] = useState<{ message: string; anchor: DOMRect } | null>(null);
  const handleCopy = useCallback((value: string, anchor: DOMRect) => {
    setCopyToast({ message: `Copied "${value}"`, anchor });
  }, []);

  const filterLoadError = filtersQuery.error;
  const tableReady = filterGroup === debouncedGroup && query.isSuccess && query.fetchStatus === 'idle';
  const { handleRefresh, isRefreshing, notice, dateLabel, changedRange, exportDisabled, needsAttention } = useReportRefresh(
    reportId, !!widgetConfig?.sourceRefresh, filterGroup, tableReady, query.isError,
  );

  const data = query.data;
  const displayData = data?.data ?? [];
  const sortedDisplayData = useMemo(() => sortedData(displayData), [sortedData, displayData]);
  // WHY: For clientSidePagination, slice the sorted full set to the current page
  // (global sort, then page window). Standard reports already arrive paginated.
  const pagedData = useMemo(
    () => (clientPaged ? sortedDisplayData.slice((page - 1) * 50, page * 50) : sortedDisplayData),
    [clientPaged, sortedDisplayData, page],
  );
  // WHY: Generic copy-renderer source — any column the server flagged
  // copyable: true gets a CopyableCell. Empty/null values fall through
  // to the default formatter (e.g., em-dash) so we don't render an
  // affordance for a value that isn't there.
  const copyRenderers = useMemo(() => {
    const map: Record<string, (value: unknown) => ReactNode> = {};
    for (const col of data?.columns ?? []) {
      if (!col.copyable) continue;
      map[col.key] = (value: unknown) => {
        if (value == null || value === '') {
          return formatCellValue(value, col.type).formatted;
        }
        return <CopyableCell value={String(value)} onCopy={handleCopy} />;
      };
    }
    return map;
  }, [data?.columns, handleCopy]);

  // WHY: AttachmentsCell renders the paperclip + popover for the
  // 'attachments' column. Needs docNo and type from the row for the
  // download URL (/api/v1/attachments/DOCUMENTS_N/:docNo/:type/:num).
  const attachmentsRenderer = useMemo<Record<string, (value: unknown, row: Record<string, unknown>) => ReactNode>>(
    () => ({
      attachments: (value, row) => (
        <AttachmentsCell
          value={value as Attachment[] | null}
          docNo={String(row.docNo ?? '')}
          type={String(row.type ?? '')}
        />
      ),
    }),
    [],
  );

  const mergedRenderers = useMemo(
    () => ({ ...copyRenderers, ...attachmentsRenderer }),
    [copyRenderers, attachmentsRenderer],
  );

  // WHY: Only one panel open at a time — opening one closes the others.
  const handleFilterToggle = () => { setIsFilterOpen(!isFilterOpen); setIsColumnPanelOpen(false); setIsSortPanelOpen(false); };
  const handleColumnToggle = () => { setIsColumnPanelOpen(!isColumnPanelOpen); setIsFilterOpen(false); setIsSortPanelOpen(false); };
  const handleSortToggle = () => { setIsSortPanelOpen(!isSortPanelOpen); setIsFilterOpen(false); setIsColumnPanelOpen(false); };

  // WHY: Click-outside guard must wrap toolbar AND its panels. If the ref only
  // wraps the toolbar itself, mousedowns inside a panel register as "outside"
  // and close it — breaking every interaction (filter inputs, sort rules, etc.)
  const toolbarWrapRef = useRef<HTMLDivElement>(null);
  const anyToolbarPanelOpen = isFilterOpen || isColumnPanelOpen || isSortPanelOpen;
  const closeAllToolbarPanels = useCallback(() => {
    setIsFilterOpen(false);
    setIsColumnPanelOpen(false);
    setIsSortPanelOpen(false);
  }, [setIsFilterOpen, setIsColumnPanelOpen, setIsSortPanelOpen]);
  useClickOutside(toolbarWrapRef, closeAllToolbarPanels, anyToolbarPanelOpen);

  return (
    <>
      {/* WHY: Single wrapper for toolbar + panels so useClickOutside treats
          clicks inside any panel as "inside" — closes only on real outside clicks. */}
      <div ref={toolbarWrapRef}>
        <TableToolbar
          activeFilterCount={countActiveFilters(filterGroup)}
          isFilterOpen={isFilterOpen}
          onFilterToggle={handleFilterToggle}
          hiddenColumnCount={hiddenCount}
          isColumnPanelOpen={isColumnPanelOpen}
          onColumnToggle={handleColumnToggle}
          sortCount={sortCount}
          isSortPanelOpen={isSortPanelOpen}
          onSortToggle={handleSortToggle}
          isExporting={isExporting}
          onExport={triggerExport}
          exportDisabled={exportDisabled}
          isRefreshing={isRefreshing}
          onRefresh={widgetConfig?.sourceRefresh && isExporting ? undefined : handleRefresh}
          refreshLabel={widgetConfig?.sourceRefresh ? 'Refresh Date filter range from Priority' : undefined}
          priorityEnv={activeEnv}
          onEnvChange={envToggleEnabled ? handleEnvChange : undefined}
        />
        <AnimatePresence>
          {isFilterOpen && (
            <motion.div key="filter-panel" {...PANEL_FADE}>
              <FilterBuilder
                filterGroup={filterGroup}
                onChange={handleFilterChange}
                columns={filterColumns}
                filterOptions={filtersQuery.data?.filters}
                filterOptionsLoading={filtersQuery.isLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isColumnPanelOpen && (
            <motion.div key="column-panel" {...PANEL_FADE}>
              <ColumnManagerPanel
                managedColumns={managedColumns}
                onToggle={toggleColumn}
                onReorder={reorderColumns}
                onShowAll={showAll}
                onHideAll={hideAll}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isSortPanelOpen && (
            <motion.div key="sort-panel" {...PANEL_FADE}>
              <SortPanel
                sortRules={sortRules}
                columns={visibleColumns}
                onAddSort={addSort}
                onRemoveSort={removeSort}
                onUpdateSort={updateSort}
                onReorderSorts={reorderSorts}
                onClearAll={clearAllSorts}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {filterLoadError && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50/80 border border-red-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-red-500" />
          <span>Failed to load filter options. Try refreshing the page.</span>
        </div>
      )}
      <div role="status" aria-label="Source refresh" aria-atomic="true">
        {notice && (
          <div className={`mx-5 mt-2 px-3 py-2 text-xs border rounded-lg ${needsAttention
            ? 'text-amber-700 bg-amber-50/80 border-amber-200/60'
            : 'text-[var(--color-text-secondary)] border-[var(--color-gold-subtle)]'}`}>
            <span>{notice}</span>{dateLabel && <span> {dateLabel}.</span>}
            {changedRange && <span> The Date filter changed. Refresh the selected dates before exporting.</span>}
          </div>
        )}
      </div>
      {(data?.warnings ?? []).map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}
      {query.isLoading && <LoadingToast />}
      {query.error && <ErrorState onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.error && displayData.length === 0 && <EmptyState />}

      {!query.isLoading && displayData.length > 0 && (
        <>
          <ReportTable
            columns={visibleColumns.length > 0 ? visibleColumns : data!.columns}
            data={pagedData}
            cellRenderers={mergedRenderers}
          />
          <Pagination
            page={page}
            pageSize={50}
            totalCount={data!.pagination.totalCount}
            totalPages={data!.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <AnimatePresence>
        {toast && (
          <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {copyToast && (
          <Toast
            message={copyToast.message}
            anchor={copyToast.anchor}
            variant="success"
            onDismiss={() => setCopyToast(null)}
          />
        )}
      </AnimatePresence>

    </>
  );
}
