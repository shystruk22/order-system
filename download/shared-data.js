// ============================================================================
// shared-data.js — Единая база данных для matrix-calc и universal
// Обе страницы подключают этот файл. Данные синхронизируются через
// localStorage + polling каждые 500мс + через Yandex.Диск (storage.js)
// ============================================================================
(function() {
    'use strict';

    // === КЛЮЧИ ХРАНЕНИЯ (без сжатия — чтобы storage.js мог читать) ===
    const DB = {
        PRODUCTS:      'db_products_v1',
        MATRIX_MARKS:  'db_matrix_marks_v1',
        STORES:        'db_stores_v1',
        MARKUPS:       'db_markups_v1',
        SALES:         'db_sales_v1',
        STOCKS:        'db_stocks_v1',
        // Дублируем в старые ключи (для совместимости со storage.js / Yandex.Диск)
        PRODUCTS_LEGACY: 'shared_products_v1',
        MATRIX_LEGACY:  'shared_matrix_v1',
        STORES_LEGACY:  'shared_stores_v1',
        // Для обнаружения изменений
        _TIMESTAMP:    'db_timestamp_v1',
        _SOURCE:       'db_source_v1',
    };

    const now = () => Date.now();

    // Загрузка из localStorage (без сжатия!)
    function dbLoad(key, def) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return def;
            return JSON.parse(raw) || def;
        } catch { return def; }
    }

    // Сохранение в localStorage (без сжатия — storage.js перехватывает)
    function dbSave(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) { console.error('dbSave error:', key, e); }
    }

    function normCode(code) {
        return String(code || '').trim().replace(/^0+/, '') || '0';
    }

    // ============================================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================================
    const SharedData = {
        DB: DB,
        normCode: normCode,

        // === ТОВАРЫ ===
        saveProducts(productsArray, source) {
            if (!Array.isArray(productsArray)) return;
            dbSave(DB.PRODUCTS, productsArray);
            // Дублируем для storage.js / Yandex.Диск
            dbSave(DB.PRODUCTS_LEGACY, productsArray);
            this._touch(source);
        },

        getProducts() {
            return dbLoad(DB.PRODUCTS, []);
        },

        getProductsMap() {
            const arr = this.getProducts();
            const map = {};
            arr.forEach(p => {
                if (p.code) map[normCode(p.code)] = p;
            });
            return map;
        },

        // === ОТМЕТКИ МАТРИЦЫ ===
        saveMatrixMarks(marksObj, source) {
            dbSave(DB.MATRIX_MARKS, marksObj || {});
            this._touch(source);
        },

        getMatrixMarks() {
            return dbLoad(DB.MATRIX_MARKS, {});
        },

        // === МАГАЗИНЫ ===
        saveStores(storesArray, source) {
            dbSave(DB.STORES, storesArray || []);
            dbSave(DB.STORES_LEGACY, storesArray || []);
            this._touch(source);
        },

        getStores() {
            return dbLoad(DB.STORES, []);
        },

        // === НАЦЕНКИ ===
        saveMarkups(data, source) {
            dbSave(DB.MARKUPS, data || {});
            this._touch(source);
        },

        getMarkups() {
            return dbLoad(DB.MARKUPS, {});
        },

        // === ПРОДАЖИ / ОСТАТКИ ===
        saveSales(sales, source) {
            dbSave(DB.SALES, sales || []);
            this._touch(source);
        },

        getSales() {
            return dbLoad(DB.SALES, []);
        },

        saveStocks(stocks, source) {
            dbSave(DB.STOCKS, stocks || []);
            this._touch(source);
        },

        getStocks() {
            return dbLoad(DB.STOCKS, []);
        },

        // === МЕТА ===
        _touch(source) {
            try {
                localStorage.setItem(DB._SOURCE, source || 'unknown');
                localStorage.setItem(DB._TIMESTAMP, String(now()));
            } catch(e) {}
        },

        getTimestamp() {
            return parseInt(localStorage.getItem(DB._TIMESTAMP) || '0');
        },

        getSource() {
            return localStorage.getItem(DB._SOURCE) || '';
        },

        // === КОНВЕРТАЦИИ ===
        mapToArray(matrixObj) {
            return Object.entries(matrixObj).map(([code, p]) => ({
                code: p.code || code,
                nomenclature: p.nomenclature || '',
                name: p.nomenclature || '',
                group: p.group || '',
                packaging: p.packaging || 'ШТ',
                supplier: p.supplier || '',
                quant: p.quant || 1,
                price: p.price || 0,
                inPrice: p.inPrice || 0,
                shelfPrice: p.shelfPrice || 0,
                shelf: p.shelf || 0,
                markup: p.markup || 0
            }));
        },

        arrayToMap(productsArray) {
            const map = {};
            (productsArray || []).forEach(p => {
                if (!p.code) return;
                const nc = normCode(p.code);
                map[nc] = {
                    code: p.code,
                    nomenclature: p.nomenclature || p.name || '',
                    group: p.group || '',
                    packaging: p.packaging || 'ШТ',
                    supplier: p.supplier || '',
                    quant: p.quant || 1,
                    price: p.price || 0,
                    inPrice: p.inPrice || p.price || 0,
                    shelfPrice: p.shelfPrice || 0,
                    shelf: p.shelf || 0,
                    markup: p.markup || 0
                };
            });
            return map;
        }
    };

    // ============================================================================
    // ПОЛИНГ (500мс) — обнаружение изменений от другой вкладки
    // ============================================================================
    SharedData._callbacks = [];
    SharedData._lastTimestamp = SharedData.getTimestamp();

    SharedData.onChange(callback) {
        SharedData._callbacks.push(callback);
    };

    SharedData._poll = function() {
        const ts = SharedData.getTimestamp();
        if (ts !== SharedData._lastTimestamp) {
            const source = SharedData.getSource();
            SharedData._lastTimestamp = ts;
            SharedData._callbacks.forEach(cb => {
                try { cb({ source, timestamp: ts }); } catch(e) {}
            });
        }
    };

    setInterval(SharedData._poll, 500);

    window.SharedData = SharedData;
})();
