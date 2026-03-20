// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/mockData.ts
// PURPOSE: Provides mock report data for Spec 01 demo widgets.
//          Will be replaced by real Priority API calls in Spec 02.
// USED BY: routes/reports.ts
// EXPORTS: MOCK_REPORTS
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';

interface MockReport {
  name: string;
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
}

export const MOCK_REPORTS: Record<string, MockReport> = {
  'demo-sales-orders': {
    name: 'Recent Sales Orders',
    columns: [
      { key: 'ORDNAME', label: 'Order #', type: 'string' },
      { key: 'CUSTNAME', label: 'Customer', type: 'string' },
      { key: 'QPRICE', label: 'Amount', type: 'currency' },
      { key: 'CURDATE', label: 'Date', type: 'date' },
      { key: 'ORDSTATUSDES', label: 'Status', type: 'string' },
    ],
    data: [
      { ORDNAME: 'SO-24001', CUSTNAME: 'Whole Foods Market', QPRICE: 15420.50, CURDATE: '2026-03-15', ORDSTATUSDES: 'Shipped' },
      { ORDNAME: 'SO-24002', CUSTNAME: 'Trader Joes', QPRICE: 8930.00, CURDATE: '2026-03-16', ORDSTATUSDES: 'Processing' },
      { ORDNAME: 'SO-24003', CUSTNAME: 'Costco Wholesale', QPRICE: 42100.00, CURDATE: '2026-03-17', ORDSTATUSDES: 'Shipped' },
      { ORDNAME: 'SO-24004', CUSTNAME: 'Sprouts Farmers', QPRICE: 6750.25, CURDATE: '2026-03-18', ORDSTATUSDES: 'Pending' },
      { ORDNAME: 'SO-24005', CUSTNAME: 'HEB Grocery', QPRICE: 19800.00, CURDATE: '2026-03-18', ORDSTATUSDES: 'Processing' },
      { ORDNAME: 'SO-24006', CUSTNAME: 'Whole Foods Market', QPRICE: 11200.00, CURDATE: '2026-03-19', ORDSTATUSDES: 'Pending' },
      { ORDNAME: 'SO-24007', CUSTNAME: 'Kroger', QPRICE: 28350.75, CURDATE: '2026-03-19', ORDSTATUSDES: 'Shipped' },
      { ORDNAME: 'SO-24008', CUSTNAME: 'Publix', QPRICE: 5600.00, CURDATE: '2026-03-20', ORDSTATUSDES: 'Processing' },
    ],
  },
  'demo-inventory': {
    name: 'Inventory Levels',
    columns: [
      { key: 'PARTNAME', label: 'SKU', type: 'string' },
      { key: 'PARTDES', label: 'Description', type: 'string' },
      { key: 'TBALANCE', label: 'On Hand', type: 'number' },
      { key: 'MINBAL', label: 'Reorder Point', type: 'number' },
      { key: 'VALUE', label: 'Value', type: 'currency' },
    ],
    data: [
      { PARTNAME: 'OOL-500', PARTDES: 'Organic Olive Oil 500ml', TBALANCE: 450, MINBAL: 100, VALUE: 6750.00 },
      { PARTNAME: 'BLS-250', PARTDES: 'Balsamic Vinegar 250ml', TBALANCE: 82, MINBAL: 150, VALUE: 2460.00 },
      { PARTNAME: 'HNY-340', PARTDES: 'Raw Honey 340g', TBALANCE: 320, MINBAL: 80, VALUE: 4800.00 },
      { PARTNAME: 'PST-500', PARTDES: 'Artisan Pasta 500g', TBALANCE: 15, MINBAL: 200, VALUE: 112.50 },
      { PARTNAME: 'SAL-200', PARTDES: 'Fleur de Sel 200g', TBALANCE: 600, MINBAL: 100, VALUE: 5400.00 },
      { PARTNAME: 'TOM-680', PARTDES: 'San Marzano Tomatoes 680g', TBALANCE: 45, MINBAL: 300, VALUE: 247.50 },
    ],
  },
};
