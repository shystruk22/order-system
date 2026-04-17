// ============================================================================
// shared-utils.js — Общие утилиты для всех страниц (кроме sneki.html)
// Версия 3.0 — унифицированная библиотека
// ============================================================================

(function() {
    'use strict';

    // ============================================================================
    // ЕДИНЫЕ КЛЮЧИ ХРАНЕНИЯ
    // ============================================================================
    const STORAGE_KEYS = {
        // Общие данные (общие для matrix-calc и universal)
        PRODUCTS: 'shared_products_v1',       // Ассортимент — каталог товаров
        MATRIX: 'shared_matrix_v1',           // Матрица ДА/НЕТ по ТТ (object keyed by code)
        SALES: 'shared_sales_v1',             // Продажи
        STOCKS: 'shared_stocks_v1',           // Остатки (с daysPresent)
        WRITEOFFS: 'shared_writeoffs_v1',     // Списания
        STORES: 'shared_stores_v1',           // Справочник магазинов
        SAVED_ASSORTMENTS: 'shared_saved_assortments_v1', // Сохранённые снапшоты ассортимента
        SAVED_MATRICES: 'shared_saved_matrices_v1',       // Сохранённые снапшоты матриц

        // Специфичные для matrix-calc
        MATRIXCALC_MANDATORY: 'matrixcalc_mandatory_v1',
        MATRIXCALC_RESULTS: 'matrixcalc_results_v1',
        MATRIXCALC_SETTINGS: 'matrixcalc_settings_v1',

        // Специфичные для universal
        UNIV_SUPPLIERS: 'univ_suppliers_v1',
        UNIV_CURRENT_SUPPLIER: 'univ_currentSupplier_v1',
        UNIV_DEFAULT_MARKUP: 'univ_defaultMarkup_v1',
        UNIV_GROUP_MARKUPS: 'univ_groupMarkups_v1',
        // Universal — своя копия ассортимента и матрицы (редактируемая)
        UNIV_PRODUCTS: 'univ_products_v1',
        UNIV_MATRIX: 'univ_matrix_v1',
        // Universal — свои продажи и остатки для расчёта заказов (НЕ перезаписывают matrix-calc)
        UNIV_OWN_SALES: 'univ_own_sales_v1',
        UNIV_OWN_STOCKS: 'univ_own_stocks_v1',
        // Universal — свои сохранённые версии assortment + matrix
        UNIV_SAVED_VERSIONS: 'univ_saved_versions_v1',

        // Специфичные для fridges (только планограммы — свои, остальное берёт из общих)
        FRIDGE_PLANOGRAMS: 'fridge_planograms_v1',
        // Fridge — аналитика свои списания и продажи
        FRIDGE_WRITEOFFS: 'fridge_writeoffs_v1',
        FRIDGE_SALES: 'fridge_sales_v1',

        // Системные
        LAST_SYNC: 'cloud_last_sync_v1',
        DIRTY_FLAG: 'cloud_dirty_v1'
    };

    // ============================================================================
    // РАБОТА С localStorage (с поддержкой LZ-String сжатия)
    // ============================================================================
    function load(key, defaultValue) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return defaultValue;
            if (data.startsWith('{') || data.startsWith('[')) {
                return JSON.parse(data) || defaultValue;
            }
            // Попробуем распаковать LZ-String
            if (typeof LZString !== 'undefined') {
                try {
                    return JSON.parse(LZString.decompressFromUTF16(data)) || defaultValue;
                } catch {
                    return JSON.parse(data) || defaultValue;
                }
            }
            return JSON.parse(data) || defaultValue;
        } catch (e) {
            console.warn('SharedUtils.load error for key', key, e);
            return defaultValue;
        }
    }

    function save(key, data) {
        try {
            const json = JSON.stringify(data);
            // Используем LZ-String если доступен и данные большие
            if (typeof LZString !== 'undefined' && json.length > 1000) {
                const compressed = LZString.compressToUTF16(json);
                // LZ-String может увеличить размер для маленьких данных
                localStorage.setItem(key, compressed);
            } else {
                localStorage.setItem(key, json);
            }
            // Помечаем данные как грязные для синхронизации
            markDirty();
        } catch (e) {
            console.error('SharedUtils.save error for key', key, e);
        }
    }

    // ============================================================================
    // DEBOUNCE СОХРАНЕНИЯ
    // ============================================================================
    let _saveTimeout = null;
    function debounceSave(key, data, delay) {
        delay = delay || 300;
        if (_saveTimeout) clearTimeout(_saveTimeout);
        _saveTimeout = setTimeout(() => {
            save(key, data);
        }, delay);
    }

    // ============================================================================
    // ОБЩИЕ УТИЛИТЫ
    // ============================================================================

    // Нормализация кода товара (убираем лидирующие нули)
    function normCode(code) {
        return String(code || '').trim().replace(/^0+/, '') || '0';
    }

    // Экранирование HTML
    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ============================================================================
    // ПАРСИНГ EXCEL ФАЙЛОВ
    // ============================================================================

    // Чтение Excel файла — возвращает Promise с JSON-массивом
    function readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    resolve(jsonData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsArrayBuffer(file);
        });
    }

    // Чтение Excel файла с колбэком (для совместимости)
    function readExcelFileCB(file, callback) {
        readExcelFile(file).then(data => callback(null, data)).catch(err => callback(err, null));
    }

    // ============================================================================
    // ПАРСИНГ ПРОДАЖ (из sneki.html — стандартная версия)
    // Формат: Строка 1-2 = заголовки, далее:
    //   Кол 0: Название ТТ (склад|магазин|основной) ИЛИ код товара (цифры)
    //   Кол 1: Количество продаж
    // ============================================================================
    function parseSales(json) {
        const items = [];
        const foundTTs = new Set();
        let curTT = '';

        for (let i = 2; i < json.length; i++) {
            const r = json[i];
            if (!r || r.length === 0) continue;

            const c0 = String(r[0] || '').trim();
            const qty = parseFloat(String(r[1])) || 0;

            const isTT = /склад|магазин|основной/i.test(c0) && !/^\d/.test(c0);
            const isProductCode = /^\d/.test(c0);

            if (isTT) {
                curTT = c0;
                foundTTs.add(curTT);
            } else if (isProductCode && curTT && qty > 0) {
                items.push({ tt: curTT, code: normCode(c0), quantity: qty });
            }
        }

        console.log(`[SharedUtils] Парсинг продаж: ${items.length} записей, ${foundTTs.size} ТТ`);
        return { items, foundTTs: Array.from(foundTTs) };
    }

    // ============================================================================
    // ПАРСИНГ ОСТАТКОВ (из sneki.html — стандартная версия с daysPresent)
    // Формат: Строки 1-2 = заголовки, Строка 3 = подзаголовки дат
    //   Кол 0: Название ТТ ИЛИ Наименование товара
    //   Кол 1: Код товара
    //   Кол 2+: Дневные остатки (последняя колонка = текущий остаток)
    // ============================================================================
    function parseStocks(json) {
        const items = [];
        const foundTTs = new Set();
        let curTT = '';
        let lastCol = 0;

        // Находим максимальную колонку
        for (let i = 0; i < json.length; i++) {
            if (json[i]) lastCol = Math.max(lastCol, json[i].length - 1);
        }

        for (let i = 3; i < json.length; i++) {
            const r = json[i];
            if (!r || r.length < 3) continue;

            const c0 = String(r[0] || '').trim();
            const code = String(r[1] || '').trim();

            const isTT = /склад|магазин|основной/i.test(c0) && !/^\d/.test(code);
            const isProductCode = /^\d/.test(code) || code.length >= 5;

            if (isTT) {
                curTT = c0;
                foundTTs.add(curTT);
            } else if (isProductCode && curTT && c0) {
                // Считаем daysPresent — количество дней где остаток > 0
                let daysPresent = 0;
                let totalDays = 0;
                for (let col = 2; col <= lastCol; col++) {
                    const val = r[col];
                    if (val !== undefined && val !== null && val !== '') {
                        totalDays++;
                        if ((parseFloat(String(val)) || 0) > 0) daysPresent++;
                    }
                }
                items.push({
                    tt: curTT,
                    code: normCode(code),
                    productName: c0,
                    currentStock: parseFloat(String(r[lastCol])) || 0,
                    daysPresent,
                    totalDays
                });
            }
        }

        console.log(`[SharedUtils] Парсинг остатков: ${items.length} записей, ${foundTTs.size} ТТ`);
        return { items, foundTTs: Array.from(foundTTs) };
    }

    // ============================================================================
    // ПАРСИНГ СПИСАНИЙ
    // Формат аналогичен продажам: ТТ | Код/Наименование | Количество
    // ============================================================================
    function parseWriteoffs(json) {
        const items = [];
        const foundTTs = new Set();
        let curTT = '';

        for (let i = 2; i < json.length; i++) {
            const r = json[i];
            if (!r || r.length === 0) continue;

            const c0 = String(r[0] || '').trim();
            const isTT = /склад|магазин|основной/i.test(c0) && !/^\d/.test(c0);
            const isProductCode = /^\d/.test(c0);

            if (isTT) {
                curTT = c0;
                foundTTs.add(curTT);
            } else if (isProductCode && curTT) {
                const qty = parseFloat(String(r[1])) || 0;
                if (qty > 0) {
                    items.push({ tt: curTT, code: normCode(c0), quantity: qty });
                }
            }
        }

        // Альтернативный формат: ТТ | (name) | Код | Кол-во
        if (items.length === 0 && json.length > 3) {
            for (let i = 2; i < json.length; i++) {
                const r = json[i];
                if (!r || r.length === 0) continue;

                const c0 = String(r[0] || '').trim();
                const isTT = /склад|магазин|тт/i.test(c0) && !/^\d+$/.test(c0);
                if (isTT) {
                    curTT = c0;
                    foundTTs.add(curTT);
                } else if (curTT) {
                    const code = /^\d+$/.test(c0) ? c0 : String(r[1] || '').trim();
                    const qty = parseFloat(String(r[2] || r[1])) || 0;
                    if (/^\d+$/.test(code) && qty > 0) {
                        items.push({ tt: curTT, code: normCode(code), quantity: qty });
                    }
                }
            }
        }

        console.log(`[SharedUtils] Парсинг списаний: ${items.length} записей, ${foundTTs.size} ТТ`);
        return { items, foundTTs: Array.from(foundTTs) };
    }

    // ============================================================================
    // ПАРСИНГ АССОРТИМЕНТА
    // Структура (строка 0 = заголовок, строка 1 = подзаголовок, данные с 2):
    //   Кол 0: Группа
    //   Кол 1: Наименование
    //   Кол 2: Код
    //   Кол 3: Упаковка (ШТ, КГ, Ж/Б и т.д.)
    //   Кол 4: Поставщик
    //   Кол 5: Цена (входная)
    //   Кол 6: Полка (минимальный остаток)
    //   Кол 7: Квант (шаг заказа для КГ)
    // ============================================================================
    function parseAssortment(json) {
        const items = [];
        const newShelf = {};

        // Автоопределение: ищем строку заголовка с ключевыми словами
        let headerRow = 1;
        for (let i = 0; i < Math.min(5, json.length); i++) {
            const row = (json[i] || []).map(c => String(c || '').trim().toLowerCase());
            const hasGroup = row.some(c => c === 'группа' || c === 'групп');
            const hasCode = row.some(c => c === 'код' || c === 'код товара' || c === 'код(товар)');
            if (hasGroup && hasCode) {
                headerRow = i;
                break;
            }
        }

        for (let i = headerRow + 1; i < json.length; i++) {
            const r = json[i];
            if (!r || r.length < 3) continue;

            const group = String(r[0] || '').trim();
            const name = String(r[1] || '').trim();
            const code = normCode(r[2]);

            if (!code || (!name && !group)) continue;

            const packaging = String(r[3] || 'ШТ').toUpperCase().trim();
            const supplier = String(r[4] || '').trim();
            const price = parseFloat(String(r[5] || '0').replace(',', '.')) || 0;
            const shelf = parseFloat(String(r[6] || '0').replace(',', '.')) || 0;
            const quant = parseFloat(String(r[7] || '1').replace(',', '.')) || 1;

            items.push({
                code, nomenclature: name, group, packaging, supplier,
                price, inPrice: price, shelf, quant
            });

            if (shelf > 0) newShelf[code] = shelf;
        }

        console.log(`[SharedUtils] Парсинг ассортимента: ${items.length} товаров (заголовок строка ${headerRow})`);
        return { items, newShelf };
    }

    // ============================================================================
    // ПАРСИНГ СПРАВОЧНИКА МАГАЗИНОВ
    // ============================================================================
    function parseStoresData(json) {
        const stores = [];
        for (let i = 1; i < json.length; i++) {
            const r = json[i];
            if (!r || r.length < 2 || !r[0]) continue;

            stores.push({
                tt: String(r[0] || '').trim(),
                tt2: String(r[1] || '').trim(),
                codeSabina: String(r[2] || '').trim(),
                priority: parseInt(String(r[3])) || 0,
                eranis: String(r[4] || '').trim(),
                fiasCode: String(r[5] || '').trim(),
                storeNumber: String(r[6] || '').trim(),
                codeKanzler: String(r[7] || '').trim(),
                codeAlliance: String(r[8] || '').trim(),
                latitude: parseFloat(String(r[9])) || 0,
                longitude: parseFloat(String(r[10])) || 0,
                fridges: parseInt(String(r[11])) || 0,
                doors: parseInt(String(r[12])) || 0,
                phone: String(r[13] || '').trim(),
                ttInFactory: String(r[14] || '').trim(),
                storeNumberFactory: String(r[15] || '').trim(),
                oldName: String(r[16] || '').trim(),
                cranes: parseInt(String(r[17])) || 0,
                priceType: String(r[18] || '').trim(),
                fridgeCabinets: parseInt(String(r[19])) || 0
            });
        }
        return stores;
    }

    // ============================================================================
    // РАСЧЁТ ЗАКАЗА (из sneki.html — основная формула)
    // ============================================================================
    function calculateOrder(packaging, stock, avgDay, period, shelf, quant) {
        // shelf = null когда не учитываем полку, = число когда учитываем
        const minStock = shelf != null ? shelf : 0;
        const prelim = stock - (avgDay * period) - minStock;

        if (prelim > 1) return 0;
        if (prelim < 0) {
            const need = Math.abs(prelim);
            if (packaging === 'КГ') {
                return Math.ceil(need / quant) * quant;
            }
            return Math.ceil(need);
        }
        if (packaging === 'КГ') {
            return prelim <= 0.6 ? quant : 0;
        }
        return 1;
    }

    // ============================================================================
    // СТИЛИЗОВАННЫЙ ЭКСПОРТ EXCEL (из matrix-calc.html)
    // Создаёт лист с авто-шириной колонок, кириллической поддержкой, шрифтами и рамками
    // ============================================================================
    function createStyledSheet(data, headers, leftAlignCols) {
        leftAlignCols = leftAlignCols || [];
        const allData = [headers, ...data];
        const ws = XLSX.utils.aoa_to_sheet(allData);

        const range = XLSX.utils.decode_range(ws['!ref']);
        const numRows = range.e.r + 1;
        const numCols = range.e.c + 1;

        // Вычисляем ширину колонок по содержимому (с учётом кириллицы)
        const colWidths = new Array(numCols).fill(0);
        for (let c = 0; c < numCols; c++) {
            for (let r = 0; r < numRows; r++) {
                const cellAddress = XLSX.utils.encode_cell({ r: r, c: c });
                const cell = ws[cellAddress];
                if (cell && cell.v !== undefined) {
                    const cellText = String(cell.v);
                    const cyrillicCount = (cellText.match(/[а-яА-ЯёЁ]/g) || []).length;
                    const otherCount = cellText.length - cyrillicCount;
                    const estimatedWidth = Math.ceil(cyrillicCount * 1.5 + otherCount * 1.0) + 2;
                    colWidths[c] = Math.max(colWidths[c], estimatedWidth);
                }
            }
            colWidths[c] = Math.max(colWidths[c], 8);
            colWidths[c] = Math.min(colWidths[c], 60);
        }
        ws['!cols'] = colWidths.map(w => ({ wch: w }));

        // Высота строк 15 пунктов
        ws['!rows'] = [];
        for (let r = 0; r < numRows; r++) {
            ws['!rows'][r] = { hpt: 15 };
        }

        // Форматирование ячеек
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r: r, c: c });
                const cell = ws[cellAddress];
                if (cell) {
                    if (r === 0) {
                        // Шапка — светло-голубой фон
                        cell.s = {
                            fill: { fgColor: { rgb: "B8CCE4" } },
                            font: { bold: true, sz: 10 },
                            alignment: { horizontal: "center", vertical: "center", wrapText: false },
                            border: {
                                top: { style: "dotted", color: { rgb: "808080" } },
                                bottom: { style: "dotted", color: { rgb: "808080" } },
                                left: { style: "dotted", color: { rgb: "808080" } },
                                right: { style: "dotted", color: { rgb: "808080" } }
                            }
                        };
                    } else {
                        // Данные
                        const isLeftAlign = leftAlignCols.includes(c);
                        cell.s = {
                            font: { sz: 10 },
                            alignment: {
                                horizontal: isLeftAlign ? "left" : "center",
                                vertical: "center",
                                wrapText: false
                            },
                            border: {
                                top: { style: "dotted", color: { rgb: "808080" } },
                                bottom: { style: "dotted", color: { rgb: "808080" } },
                                left: { style: "dotted", color: { rgb: "808080" } },
                                right: { style: "dotted", color: { rgb: "808080" } }
                            }
                        };
                    }
                }
            }
        }

        return ws;
    }

    // ============================================================================
    // БАЗОВЫЙ ЭКСПОРТ В EXCEL
    // ============================================================================
    function exportToExcel(data, filename) {
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, filename);
    }

    // ============================================================================
    // ОБРАТНАЯ СОВМЕСТИМОСТЬ: Миграция старых ключей
    // При первой загрузке переносим данные из старых ключей в новые
    // ============================================================================
    function migrateOldKeys() {
        const migrationKey = 'shared_utils_migrated_v1';
        if (load(migrationKey, false)) return; // Уже мигрировано

        console.log('[SharedUtils] Миграция старых ключей...');

        // matrix-calc ключи
        const oldNewMap = {
            'matrixcalc_products_v1': STORAGE_KEYS.PRODUCTS,
            'matrixcalc_sales_v1': STORAGE_KEYS.SALES,
            'matrixcalc_stocks_v1': STORAGE_KEYS.STOCKS,
            'matrixcalc_writeoffs_v1': STORAGE_KEYS.WRITEOFFS,
            'matrixcalc_saved_assortments_v2': STORAGE_KEYS.SAVED_ASSORTMENTS,
            'stores_data_v1': STORAGE_KEYS.STORES
        };

        Object.entries(oldNewMap).forEach(([oldKey, newKey]) => {
            const oldData = localStorage.getItem(oldKey);
            const newData = localStorage.getItem(newKey);
            if (oldData && !newData) {
                localStorage.setItem(newKey, oldData);
                console.log(`  ${oldKey} → ${newKey}`);
            }
        });

        // universal матрица → общая матрица (только если общей ещё нет)
        const univMatrix = localStorage.getItem('univ_matrix_v8');
        if (univMatrix && !localStorage.getItem(STORAGE_KEYS.MATRIX)) {
            localStorage.setItem(STORAGE_KEYS.MATRIX, univMatrix);
            console.log('  univ_matrix_v8 → shared_matrix_v1');
        }

        // universal продажи/остатки
        const univSales = localStorage.getItem('univ_sales_v8');
        if (univSales && !localStorage.getItem(STORAGE_KEYS.SALES)) {
            localStorage.setItem(STORAGE_KEYS.SALES, univSales);
            console.log('  univ_sales_v8 → shared_sales_v1');
        }
        const univStocks = localStorage.getItem('univ_stocks_v8');
        if (univStocks && !localStorage.getItem(STORAGE_KEYS.STOCKS)) {
            localStorage.setItem(STORAGE_KEYS.STOCKS, univStocks);
            console.log('  univ_stocks_v8 → shared_stocks_v1');
        }

        save(migrationKey, true);
        console.log('[SharedUtils] Миграция завершена');
    }

    // ============================================================================
    // CLOUD SYNC HELPERS
    // ============================================================================
    function markDirty() {
        try { localStorage.setItem(STORAGE_KEYS.DIRTY_FLAG, '1'); } catch {}
    }

    function isDirty() {
        try { return localStorage.getItem(STORAGE_KEYS.DIRTY_FLAG) === '1'; } catch { return false; }
    }

    function clearDirty() {
        try { localStorage.removeItem(STORAGE_KEYS.DIRTY_FLAG); } catch {}
    }

    function getLastSync() {
        return load(STORAGE_KEYS.LAST_SYNC, null);
    }

    function setLastSync(timestamp) {
        save(STORAGE_KEYS.LAST_SYNC, timestamp);
    }

    // ============================================================================
    // ЗАГРУЗКА МАГАЗИНОВ (общая для всех страниц)
    // ============================================================================
    function loadStores() {
        const data = load(STORAGE_KEYS.STORES, []);
        if (Array.isArray(data) && data.length > 0) {
            return data.map(s => ({ tt: s.tt || s.name || s }));
        }
        return [];
    }

    // ============================================================================
    // ЭКСПОРТ В ГЛОБАЛЬНЫЙ ОБЪЕКТ
    // ============================================================================
    window.SharedUtils = {
        STORAGE_KEYS,
        load,
        save,
        debounceSave,
        normCode,
        esc,
        readExcelFile,
        readExcelFileCB,
        parseSales,
        parseStocks,
        parseWriteoffs,
        parseAssortment,
        parseStoresData,
        calculateOrder,
        createStyledSheet,
        exportToExcel,
        migrateOldKeys,
        markDirty,
        isDirty,
        clearDirty,
        getLastSync,
        setLastSync,
        loadStores
    };

    // Автоматическая миграция при загрузке
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', migrateOldKeys);
    } else {
        migrateOldKeys();
    }

    console.log('[SharedUtils] Загружен v3.0');
})();
