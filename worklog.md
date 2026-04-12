---
Task ID: 1
Agent: main
Task: Fix 4 issues in fish-order.html v3.8

Work Log:
- Read uploaded screenshot and analyzed fish-order.html (2881 lines)
- Identified 4 issues: (1) days of presence not parsed, (2) suppliers not pulled from assortment, (3) incorrect calculation, (4) inconsistent button styles
- Fixed ensureSupplierAssortment() to auto-extract suppliers from matrix[code].supplier, auto-create deliverySchedule entries, and populate supplierPrices from inPrice
- Replaced parseStocksLocal with SharedUtils.parseStocks for consistent parsing, added productName→name mapping and diagnostic logging
- Fixed calculation: when daysUntil=99 (no delivery schedule), fallback to period instead of using 99; added effectiveDays fallback when daysPresent=0
- Added daysPresent and effectiveDays to result objects for proper tooltip display
- Unified all button styles to consistent pattern: inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
- Added Итого row to delivery schedule table showing aggregated day counts per supplier
- Added weekend column highlighting (Сб, Вс columns get bg-red-50/100)
- Updated showCalcDetail tooltip to show proper daysPresent/effectiveDays info
- Updated version to 3.8

Stage Summary:
- File: /home/z/my-project/download/fish-order.html (v3.8, 2960 lines)
- Key fixes: supplier auto-sync, stock parsing via SharedUtils, calculation fallback, button unification, schedule Итого row + weekend highlighting
