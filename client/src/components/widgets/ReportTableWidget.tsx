// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget — server-side filtering, client-side
//          sorting, column management, expandable rows.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useSortManager } from '../../hooks/useSortManager';
import { useExport } from '../../hooks/useExport';
import { useBBDExtend } from '../../hooks/useBBDExtend';
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
import ExtendExpiryModal from '../modals/ExtendExpiryModal';
import BulkExtendModal from '../modals/BulkExtendModal';
import { countActiveFilters } from '../../config/filterConstants';
import { getDetailComponent } from '../../config/detailRegistry';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState();

  const filtersQuery = useFiltersQuery(reportId);
  const filterColumns = filtersQuery.data?.columns ?? [];

  const query = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page,
    pageSize: 50,
  });

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
    reportId, debouncedGroup, visibleColumnKeys,
  );

  const [copyToast, setCopyToast] = useState<string | null>(null);
  const handleCopy = useCallback((value: string) => {
    setCopyToast(`Copied "${value}"`);
  }, []);

  const {
    extendModal, cellRenderers, handleBulkExtend, handleExtendSuccess, closeModal,
  } = useBBDExtend(reportId, handleCopy);

  const filterLoadError = filtersQuery.error;
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/v1/reports/${reportId}/refresh`, { method: 'POST' });
      if (!res.ok) console.warn(`[refresh] Server returned ${res.status}`);
      await queryClient.invalidateQueries({ queryKey: ['report', reportId] });
    } finally {
      setIsRefreshing(false);
    }
  };

  const data = query.data;
  const displayData = data?.data ?? [];
  const sortedDisplayData = useMemo(() => sortedData(displayData), [sortedData, displayData]);
  const expandConfig = data?.meta?.expandConfig;
  const DetailComponent = expandConfig ? getDetailComponent(reportId) : null;

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const toggleExpand = useCallback((rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
      return next;
    });
  }, []);

  // WHY: Only one panel open at a time — opening one closes the others.
  const handleFilterToggle = () => { setIsFilterOpen(!isFilterOpen); setIsColumnPanelOpen(false); setIsSortPanelOpen(false); };
  const handleColumnToggle = () => { setIsColumnPanelOpen(!isColumnPanelOpen); setIsFilterOpen(false); setIsSortPanelOpen(false); };
  const handleSortToggle = () => { setIsSortPanelOpen(!isSortPanelOpen); setIsFilterOpen(false); setIsColumnPanelOpen(false); };

  return (
    <>
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
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onBulkExtend={reportId === 'bbd' ? handleBulkExtend : undefined}
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
      {filterLoadError && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50/80 border border-red-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-red-500" />
          <span>Failed to load filter options. Try refreshing the page.</span>
        </div>
      )}
      {data?.warnings && data.warnings.length > 0 && data.warnings.map((msg, i) => (
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
            data={sortedDisplayData}
            rowStyleField={data?.meta?.rowStyleField}
            reportId={reportId}
            expandConfig={expandConfig && DetailComponent ? {
              rowKeyField: expandConfig.rowKeyField,
              DetailComponent,
            } : undefined}
            expandedRows={expandedRows}
            onToggleExpand={toggleExpand}
            cellRenderers={cellRenderers}
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
          <Toast message={copyToast} variant="success" onDismiss={() => setCopyToast(null)} />
        )}
      </AnimatePresence>

      {extendModal?.type === 'single' && extendModal.row && (
        <ExtendExpiryModal
          isOpen
          onClose={closeModal}
          serialName={extendModal.row.serialName as string}
          partName={extendModal.row.partNumber as string}
          partDescription={extendModal.row.partDescription as string}
          currentExpiryDate={extendModal.row.expiryDate as string}
          onSuccess={handleExtendSuccess}
        />
      )}

      {extendModal?.type === 'bulk' && (
        <BulkExtendModal
          isOpen
          onClose={closeModal}
          rows={sortedDisplayData}
          onSuccess={handleExtendSuccess}
        />
      )}
    </>
  );
}
