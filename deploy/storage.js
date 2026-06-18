/**
 * Storage — Синхронизация данных через Яндекс.Диск REST API
 * 
 * Заменяет File System Access API на Yandex.Disk для работы с разных компьютеров.
 * При загрузке страницы: скачивает данные с Диска → записывает в localStorage
 * При сохранении: собирает из localStorage → загружает на Диск
 * 
 * Токен берётся из config.js (window.YANDEX_TOKEN)
 */

(function() {
    'use strict';

    const DATA_FILENAME = 'order_system_data.json';
    const APP_DIR = 'Приложения/Категорийный/sneki-app';
    const DISK_PATH = APP_DIR + '/' + DATA_FILENAME;
    const API_BASE = 'https://cloud-api.yandex.net/v1/disk';
    const AUTO_SAVE_INTERVAL = 30000; // 30 секунд
    const SYNC_DEBOUNCE = 2000; // 2 секунты после изменения

    let syncTimeout = null;
    let autoSaveInterval = null;
    let isReady = false;
    let syncInProgress = false;
    let lastSyncError = null;

    // ============================================================================
    // ПОЛУЧЕНИЕ ТОКЕНА
    // ============================================================================
    function getToken() {
        if (window.YANDEX_TOKEN) return window.YANDEX_TOKEN;
        return null;
    }

    // ============================================================================
    // HTTP ЗАПРОСЫ К ЯНДЕКС.ДИСКУ
    // ============================================================================
    async function diskRequest(url, options) {
        const token = getToken();
        if (!token) throw new Error('Токен Яндекс.Диска не настроен');

        const opts = options || {};
        const response = await fetch(url, {
            ...opts,
            headers: {
                'Authorization': 'OAuth ' + token,
                ...(opts.headers || {})
            }
        });

        if (response.status === 401) throw new Error('Токен Яндекс.Диска недействителен');
        if (response.status === 403) throw new Error('Нет доступа к Яндекс.Диску');
        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Ошибка API (${response.status}): ${errText}`);
        }

        return response;
    }

    // ============================================================================
    // ПРОВЕРКА СУЩЕСТВОВАНИЯ ФАЙЛА НА ДИСКЕ
    // ============================================================================
    async function checkFileExists() {
        try {
            const resp = await diskRequest(`${API_BASE}/resources?path=${encodeURIComponent(DISK_PATH)}&fields=resource_id,modified`);
            if (resp.status === 200) {
                const info = await resp.json();
                return info;
            }
        } catch (e) {
            if (e.message.includes('404') || e.message.includes('Не найден')) return null;
            console.warn('[Storage] Проверка файла:', e.message);
        }
        return null;
    }

    // ============================================================================
    // ЗАГРУЗКА ДАННЫХ С ЯНДЕКС.ДИСКА
    // ============================================================================
    async function downloadFromDisk() {
        const token = getToken();
        if (!token) {
            console.warn('[Storage] Нет токена Яндекс.Диска — работаем только с localStorage');
            return false;
        }

        try {
            showStatus('⬇️ Синхронизация с облаком...', 'info');

            // Получаем ссылку для скачивания
            const resp = await diskRequest(`${API_BASE}/resources/download?path=${encodeURIComponent(DISK_PATH)}`);
            const info = await resp.json();
            const downloadUrl = info.href;

            // Скачиваем файл
            const dataResp = await fetch(downloadUrl);
            if (!dataResp.ok) throw new Error('Ошибка скачивания файла');

            const jsonText = await dataResp.text();
            const cloudData = JSON.parse(jsonText);

            // Записываем в localStorage — БЕЗОПАСНО: не затираем локальные данные пустыми из облака
            if (cloudData.stores) {
                const stores = cloudData.stores;
                
                // Безопасная запись: берём из облака только если значение реально содержит данные.
                // Не перезаписываем локальные данные null, undefined или пустым массивом/объектом.
                const hasData = (val) => {
                    if (val === null || val === undefined) return false;
                    if (Array.isArray(val)) return val.length > 0;
                    if (typeof val === 'object') return Object.keys(val).length > 0;
                    if (typeof val === 'string') return val.length > 0;
                    if (typeof val === 'number') return true;
                    return true;
                };
                const set = (key, val) => { 
                    if (hasData(val)) localStorage.setItem(key, JSON.stringify(val)); 
                };
                set('shared_products_v1', stores.products);
                set('shared_matrix_v1', stores.matrix);
                set('shared_sales_v1', stores.sales);
                set('shared_stocks_v1', stores.stocks);
                set('shared_writeoffs_v1', stores.writeoffs);
                set('shared_stores_v1', stores.storesList);
                set('shared_saved_assortments_v1', stores.savedAssortments);
                set('shared_saved_matrices_v1', stores.savedMatrices);

                // Специфичные для matrix-calc
                set('matrixcalc_mandatory_v1', stores.matrixcalc_mandatory);
                set('matrixcalc_results_v1', stores.matrixcalc_results);
                set('matrixcalc_settings_v1', stores.matrixcalc_settings);

                // Специфичные для universal
                set('univ_suppliers_v1', stores.univ_suppliers);
                set('univ_currentSupplier_v1', stores.univ_currentSupplier);
                set('univ_defaultMarkup_v1', stores.univ_defaultMarkup);
                set('univ_groupMarkups_v1', stores.univ_groupMarkups);
                // Universal — своя копия ассортимента, матрицы, продаж и остатков
                set('univ_products_v1', stores.univ_products);
                set('univ_matrix_v1', stores.univ_matrix);
                set('univ_own_sales_v1', stores.univ_own_sales);
                set('univ_own_stocks_v1', stores.univ_own_stocks);
                set('univ_saved_versions_v1', stores.univ_saved_versions);

                // Специфичные для fridges (только планограммы + аналитика)
                set('fridge_planograms_v1', stores.fridge_planograms);
                set('fridge_writeoffs_v1', stores.fridge_writeoffs);
                set('fridge_sales_v1', stores.fridge_sales);

                // shared-data.js ключи (для синхронизации universal ↔ matrix-calc)
                set('db_products_v1', stores.db_products);
                set('db_matrix_marks_v1', stores.db_matrix_marks);
                set('db_stores_v1', stores.db_stores);
                set('db_markups_v1', stores.db_markups);
                set('db_sales_v1', stores.db_sales);
                set('db_stocks_v1', stores.db_stocks);
                // sneki.html specific
                set('sneki_matrix_v2', stores.sneki_matrix);
                set('sneki_products_v2', stores.sneki_products);
                set('sneki_rcStocks_v2', stores.sneki_rcStocks);
                set('sneki_sales_v2', stores.sneki_sales);
                set('sneki_stocks_v2', stores.sneki_stocks);
                set('sneki_shelfValues_v2', stores.sneki_shelfValues);
                set('sneki_quants_v2', stores.sneki_quants);
                set('sneki_groupMarkups_v2', stores.sneki_groupMarkups);
                set('sneki_groupQuants_v2', stores.sneki_groupQuants);
                set('sneki_groupDays_v2', stores.sneki_groupDays);
                set('sneki_manualPrices_v2', stores.sneki_manualPrices);
                set('sneki_warehouseMarkup_v2', stores.sneki_warehouseMarkup);
                set('sneki_vatRate_v2', stores.sneki_vatRate);
                set('sneki_rcManualOrders_v2', stores.sneki_rcManualOrders);
                set('sneki_results_v2', stores.sneki_results);
                set('sneki_rcResults_v2', stores.sneki_rcResults);

                // fish-order specific
                set('fish_assortment_v1', stores.fish_assortment);
                set('fish_matrix_v1', stores.fish_matrix);
                set('fish_sales_v1', stores.fish_sales);
                set('fish_stocks_v1', stores.fish_stocks);
                set('fish_schedule_v1', stores.fish_schedule);
                set('fish_intransit_v1', stores.fish_intransit);
                set('fish_supplier_assortment_v1', stores.fish_supplier_assortment);
                set('fish_supplier_prices_v1', stores.fish_supplier_prices);
                set('fish_store_supplier_prefs_v1', stores.fish_store_supplier_prefs);
                set('fish_stock_consumption_v1', stores.fish_stock_consumption);
                set('fish_saved_order_v1', stores.fish_saved_order);
                set('fish_store_wishes_v1', stores.fish_store_wishes);
            }

            // Сбрасываем флаг изменений
            if (window.SharedUtils) window.SharedUtils.clearDirty();

            showStatus('✅ Данные загружены из облака', 'success');
            return true;
        } catch (e) {
            if (e.message.includes('404') || e.message.includes('Не найден')) {
                showStatus('☁️ Файл не найден на Диске — используем локальные данные', 'info');
            } else {
                showStatus('❌ Ошибка загрузки: ' + e.message, 'error');
                lastSyncError = e.message;
            }
            return false;
        }
    }

    // ============================================================================
    // СОБРАТЬ ВСЕ ДАННЫЕ ИЗ localStorage
    // ============================================================================
    function collectAllData() {
        // Безопасное получение JSON значения из localStorage
        const get = (key) => {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null || raw === undefined) return null;
                return JSON.parse(raw);
            } catch { return null; }
        };

        return {
            version: 2,
            lastSaved: new Date().toISOString(),
            appVersion: '3.0',
            stores: {
                // Общие
                products: get('shared_products_v1'),
                matrix: get('shared_matrix_v1'),
                sales: get('shared_sales_v1'),
                stocks: get('shared_stocks_v1'),
                writeoffs: get('shared_writeoffs_v1'),
                storesList: get('shared_stores_v1'),
                savedAssortments: get('shared_saved_assortments_v1'),
                savedMatrices: get('shared_saved_matrices_v1'),

                // matrix-calc
                matrixcalc_mandatory: get('matrixcalc_mandatory_v1'),
                matrixcalc_results: get('matrixcalc_results_v1'),
                matrixcalc_settings: get('matrixcalc_settings_v1'),

                // universal
                univ_suppliers: get('univ_suppliers_v1'),
                univ_currentSupplier: get('univ_currentSupplier_v1'),
                univ_defaultMarkup: get('univ_defaultMarkup_v1'),
                univ_groupMarkups: get('univ_groupMarkups_v1'),
                // universal — своя копия
                univ_products: get('univ_products_v1'),
                univ_matrix: get('univ_matrix_v1'),
                univ_own_sales: get('univ_own_sales_v1'),
                univ_own_stocks: get('univ_own_stocks_v1'),
                univ_saved_versions: get('univ_saved_versions_v1'),

                // fridges (только планограммы + аналитика)
                fridge_planograms: get('fridge_planograms_v1'),
                fridge_writeoffs: get('fridge_writeoffs_v1'),
                fridge_sales: get('fridge_sales_v1'),

                // shared-data.js ключи (для синхронизации universal ↔ matrix-calc)
                db_products: get('db_products_v1'),
                db_matrix_marks: get('db_matrix_marks_v1'),
                db_stores: get('db_stores_v1'),
                db_markups: get('db_markups_v1'),
                db_sales: get('db_sales_v1'),
                db_stocks: get('db_stocks_v1'),
                // sneki.html specific
                sneki_matrix: get('sneki_matrix_v2'),
                sneki_products: get('sneki_products_v2'),
                sneki_rcStocks: get('sneki_rcStocks_v2'),
                sneki_sales: get('sneki_sales_v2'),
                sneki_stocks: get('sneki_stocks_v2'),
                sneki_shelfValues: get('sneki_shelfValues_v2'),
                sneki_quants: get('sneki_quants_v2'),
                sneki_groupMarkups: get('sneki_groupMarkups_v2'),
                sneki_groupQuants: get('sneki_groupQuants_v2'),
                sneki_groupDays: get('sneki_groupDays_v2'),
                sneki_manualPrices: get('sneki_manualPrices_v2'),
                sneki_warehouseMarkup: get('sneki_warehouseMarkup_v2'),
                sneki_vatRate: get('sneki_vatRate_v2'),
                sneki_rcManualOrders: get('sneki_rcManualOrders_v2'),
                sneki_results: get('sneki_results_v2'),
                sneki_rcResults: get('sneki_rcResults_v2'),

                // fish-order specific
                fish_assortment: get('fish_assortment_v1'),
                fish_matrix: get('fish_matrix_v1'),
                fish_sales: get('fish_sales_v1'),
                fish_stocks: get('fish_stocks_v1'),
                fish_schedule: get('fish_schedule_v1'),
                fish_intransit: get('fish_intransit_v1'),
                fish_supplier_assortment: get('fish_supplier_assortment_v1'),
                fish_supplier_prices: get('fish_supplier_prices_v1'),
                fish_store_supplier_prefs: get('fish_store_supplier_prefs_v1'),
                fish_stock_consumption: get('fish_stock_consumption_v1'),
                fish_saved_order: get('fish_saved_order_v1'),
                fish_store_wishes: get('fish_store_wishes_v1')
            }
        };
    }

    // ============================================================================
    // СОЗДАНИЕ ПАПКИ НА ЯНДЕКС.ДИСКЕ (если не существует)
    // ============================================================================
    async function ensureDirExists(dirPath) {
        try {
            await diskRequest(`${API_BASE}/resources?path=${encodeURIComponent(dirPath)}`);
            return; // уже существует
        } catch (e) {
            if (e.message.includes('404') || e.message.includes('Не найден')) {
                // Папки нет — создаём (mkdir по пути)
                const parts = dirPath.split('/').filter(Boolean);
                let current = '';
                for (const part of parts) {
                    current += (current ? '/' : '') + part;
                    try {
                        await diskRequest(`${API_BASE}/resources?path=${encodeURIComponent(current)}`);
                    } catch (e2) {
                        if (e2.message.includes('404') || e2.message.includes('Не найден')) {
                            await diskRequest(`${API_BASE}/resources?path=${encodeURIComponent(current)}`, {
                                method: 'PUT'
                            });
                        }
                    }
                }
            }
        }
    }

    // ============================================================================
    // ЗАГРУЗКА ДАННЫХ НА ЯНДЕКС.ДИСК
    // ============================================================================
    async function uploadToDisk() {
        const token = getToken();
        if (!token) {
            console.warn('[Storage] Нет токена — пропускаем загрузку');
            return false;
        }

        if (syncInProgress) return false;
        syncInProgress = true;

        try {
            // Сначала проверяем/создаём папку
            await ensureDirExists(APP_DIR);

            const data = collectAllData();
            const jsonStr = JSON.stringify(data);

            // Получаем ссылку для загрузки (GET + overwrite = true для перезаписи)
            const resp = await diskRequest(
                `${API_BASE}/resources/upload?path=${encodeURIComponent(DISK_PATH)}&overwrite=true`
            );
            const info = await resp.json();
            const uploadUrl = info.href;

            // Загружаем файл
            const uploadResp = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: jsonStr
            });

            if (!uploadResp.ok) throw new Error('Ошибка загрузки файла');

            // Сбрасываем флаг и обновляем время последней синхронизации
            if (window.SharedUtils) {
                window.SharedUtils.clearDirty();
                window.SharedUtils.setLastSync(new Date().toISOString());
            }

            showStatus('💾 Данные сохранены в облако', 'success');
            lastSyncError = null;
            return true;
        } catch (e) {
            showStatus('❌ Ошибка сохранения: ' + e.message, 'error');
            lastSyncError = e.message;
            return false;
        } finally {
            syncInProgress = false;
        }
    }

    // ============================================================================
    // ДЕБАУНС СИНХРОНИЗАЦИИ
    // ============================================================================
    function scheduleSync() {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            uploadToDisk();
        }, SYNC_DEBOUNCE);
    }

    // ============================================================================
    // СТАТУС-БАР
    // ============================================================================
    function showStatus(message, type) {
        let status = document.getElementById('cloudSyncStatus');
        if (!status) {
            status = document.createElement('div');
            status.id = 'cloudSyncStatus';
            status.style.cssText = `
                position: fixed; bottom: 60px; left: 16px;
                background: #1f2937; color: white;
                padding: 8px 18px; border-radius: 8px;
                font-size: 12px; font-family: system-ui;
                z-index: 99997; opacity: 0; transition: opacity 0.3s;
                display: flex; align-items: center; gap: 6px;
                max-width: 90vw; white-space: nowrap;
                pointer-events: none !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            document.body.appendChild(status);
        }

        status.textContent = message;
        status.style.opacity = '1';

        if (type === 'error') status.style.background = '#dc2626';
        else if (type === 'success') status.style.background = '#059669';
        else if (type === 'info') status.style.background = '#2563eb';
        else status.style.background = '#1f2937';

        setTimeout(() => { status.style.opacity = '0'; }, 3000);
    }

    // ============================================================================
    // ФОРМА НАСТРОЙКИ OAUTH (модальное окно)
    // ============================================================================
    function showOAuthModal() {
        // Убираем старый модал если есть
        const old = document.getElementById('yandexOAuthModal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'yandexOAuthModal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(0,0,0,0.5); display: flex;
            align-items: center; justify-content: center;
            font-family: system-ui, sans-serif;
        `;

        const savedClientId = window.YANDEX_CLIENT_ID || '';
        const savedSecret = window.YANDEX_CLIENT_SECRET || '';

        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; padding: 24px;
                        width: 420px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #111;">Настройка Яндекс.Диск</h2>
                <p style="margin: 0 0 16px 0; font-size: 13px; color: #666;">
                    Введите данные OAuth-приложения для подключения облака
                </p>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: #444; display: block; margin-bottom: 4px;">
                            Client ID
                        </label>
                        <input id="oauthClientId" type="text" placeholder="Вставьте Client ID из oauth.yandex.ru"
                            value="${savedClientId}"
                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px;
                                   font-size: 14px; box-sizing: border-box; outline: none;"
                            onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#d1d5db'">
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: #444; display: block; margin-bottom: 4px;">
                            Client Secret
                        </label>
                        <input id="oauthClientSecret" type="password" placeholder="Вставьте Client Secret"
                            value="${savedSecret}"
                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px;
                                   font-size: 14px; box-sizing: border-box; outline: none;"
                            onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#d1d5db'">
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <label style="font-size: 12px; font-weight: 600; color: #444;">
                                Код подтверждения
                            </label>
                            <button id="oauthGetCodeBtn" style="font-size: 11px; color: #7c3aed; background: none; border: none;
                                cursor: pointer; text-decoration: underline; padding: 0;"
                                onmouseover="this.style.color='#6d28d9'" onmouseout="this.style.color='#7c3aed'">
                                Получить новый код
                            </button>
                        </div>
                        <input id="oauthCode" type="text" placeholder="Нажмите 'Получить новый код' выше"
                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px;
                                   font-size: 14px; box-sizing: border-box; outline: none;"
                            onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#d1d5db'">
                    </div>

                    <div id="oauthStatus" style="font-size: 12px; color: #666; min-height: 20px;"></div>

                    <div style="display: flex; gap: 8px;">
                        <button id="oauthSubmitBtn" style="
                            flex: 1; padding: 10px; background: #7c3aed; color: white;
                            border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
                            cursor: pointer; transition: background 0.2s;"
                            onmouseover="this.style.background='#6d28d9'" onmouseout="this.style.background='#7c3aed'">
                            Получить токен
                        </button>
                        <button id="oauthManualBtn" style="
                            padding: 10px 16px; background: #f3f4f6; color: #374151;
                            border: none; border-radius: 8px; font-size: 13px; cursor: pointer;
                            transition: background 0.2s;"
                            onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
                            Ввести токен вручную
                        </button>
                    </div>

                    <div id="oauthManualArea" style="display: none;">
                        <label style="font-size: 12px; font-weight: 600; color: #444; display: block; margin-bottom: 4px;">
                            OAuth-токен
                        </label>
                        <input id="oauthManualToken" type="text" placeholder="Готовый OAuth-токен Яндекс.Диска"
                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px;
                                   font-size: 14px; box-sizing: border-box; outline: none; margin-bottom: 8px;"
                            onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#d1d5db'">
                        <button id="oauthManualSave" style="
                            width: 100%; padding: 10px; background: #059669; color: white;
                            border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                            Сохранить токен
                        </button>
                    </div>

                    <button id="oauthCloseBtn" style="
                        margin-top: 4px; padding: 6px; background: none; border: none;
                        color: #9ca3af; font-size: 12px; cursor: pointer; width: 100%; text-align: center;">
                        Отмена
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Кнопка 'Получить новый код' — открывает страницу авторизации Яндекса
        document.getElementById('oauthGetCodeBtn').onclick = () => {
            const cid = document.getElementById('oauthClientId').value.trim();
            if (!cid) {
                document.getElementById('oauthStatus').innerHTML = '<span style="color:#dc2626">Сначала введите Client ID</span>';
                return;
            }
            const url = 'https://oauth.yandex.ru/authorize?response_type=code&client_id=' + encodeURIComponent(cid);
            window.open(url, '_blank');
            document.getElementById('oauthStatus').innerHTML = '<span style="color:#2563eb">В открывшемся окне авторизуйтесь и скопируйте код из адресной строки</span>';
        };

        // Закрытие по фону
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Закрытие кнопкой
        document.getElementById('oauthCloseBtn').onclick = () => modal.remove();

        // Показать ручной ввод
        document.getElementById('oauthManualBtn').onclick = () => {
            const area = document.getElementById('oauthManualArea');
            area.style.display = area.style.display === 'none' ? 'block' : 'none';
        };

        // Сохранить токен вручную
        document.getElementById('oauthManualSave').onclick = () => {
            const tkn = document.getElementById('oauthManualToken').value.trim();
            if (!tkn) {
                document.getElementById('oauthStatus').innerHTML = '<span style="color:#dc2626">Введите токен</span>';
                return;
            }
            if (window.setYandexToken(tkn)) {
                document.getElementById('oauthStatus').innerHTML = '<span style="color:#059669">Токен сохранён!</span>';
                setTimeout(() => modal.remove(), 500);
                // Перезагружаем для применения
                setTimeout(() => location.reload(), 700);
            }
        };

        // Обмен кода на токен
        document.getElementById('oauthSubmitBtn').onclick = async () => {
            const clientId = document.getElementById('oauthClientId').value.trim();
            const clientSecret = document.getElementById('oauthClientSecret').value.trim();
            const code = document.getElementById('oauthCode').value.trim();
            const status = document.getElementById('oauthStatus');
            const submitBtn = document.getElementById('oauthSubmitBtn');

            if (!clientId || !clientSecret || !code) {
                status.innerHTML = '<span style="color:#dc2626">Заполните все три поля</span>';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Подождите...';
            submitBtn.style.background = '#9ca3af';
            status.innerHTML = '<span style="color:#2563eb">Обмениваем код на токен...</span>';

            try {
                const accessToken = await window.exchangeCodeForToken(code, clientId, clientSecret);
                status.innerHTML = '<span style="color:#059669">Токен получен и сохранён!</span>';
                setTimeout(() => modal.remove(), 500);
                setTimeout(() => location.reload(), 700);
            } catch (err) {
                status.innerHTML = '<span style="color:#dc2626">Ошибка: ' + err.message + '</span>';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Получить токен';
                submitBtn.style.background = '#7c3aed';
            }
        };
    }

    // ============================================================================
    // КНОПКА РУЧНОЙ СИНХРОНИЗАЦИИ
    // ============================================================================
    function showSyncButton() {
        const btn = document.createElement('button');
        btn.id = 'cloudSyncBtn';
        btn.title = 'Нажмите для ручной синхронизации с облаком';
        btn.style.cssText = `
            position: fixed; bottom: 16px; left: 16px;
            background: #7c3aed; color: white;
            padding: 10px 16px; border-radius: 8px;
            font-size: 13px; font-family: system-ui;
            z-index: 99998; border: none; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.2s;
            display: flex; align-items: center; gap: 6px;
        `;
        btn.innerHTML = '☁️';
        btn.onclick = async (e) => {
            // Shift + клик — всегда открывает настройки OAuth (даже с токеном)
            if (e.shiftKey) {
                showOAuthModal();
                return;
            }

            // Если токена нет — показываем форму настройки
            if (!getToken()) {
                showOAuthModal();
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '⏳';
            btn.style.background = '#f59e0b';
            await uploadToDisk();
            await downloadFromDisk();
            btn.disabled = false;
            btn.innerHTML = '☁️';
            btn.style.background = '#7c3aed';

            // Если есть флаг dirty — перезагружаем страницу
            if (window.SharedUtils && window.SharedUtils.isDirty()) {
                setTimeout(() => location.reload(), 1000);
            }
        };
        document.body.appendChild(btn);
    }

    // ============================================================================
    // ПОДПИСКА НА ИЗМЕНЕНИЯ localStorage
    // ============================================================================
    function setupSyncListeners() {
        // Перехватываем localStorage.setItem для автоматической синхронизации
        const originalSetItem = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function(key, value) {
            originalSetItem(key, value);

            // Пропускаем системные ключи — не триггерим синхронизацию
            if (key.startsWith('cloud_')) return;
            if (key === 'shared_utils_migrated_v1') return;

            // Обновляем кнопку
            const btn = document.getElementById('cloudSyncBtn');
            if (btn && !btn.disabled) {
                btn.style.background = '#f59e0b';
                btn.innerHTML = '💾';
            }

            // Планируем синхронизацию
            scheduleSync();
        };

        // Сохранение при уходе со страницы
        window.addEventListener('beforeunload', (e) => {
            if (window.SharedUtils && window.SharedUtils.isDirty()) {
                // Отправляем синхронизацию (fire-and-forget)
                if (navigator.sendBeacon) {
                    // Лучше бы использовать sendBeacon, но для REST API нужен PUT
                    // Просто пытаемся отправить
                    uploadToDisk().catch(() => {});
                }
            }
        });
    }

    // ============================================================================
    // АВТОМАТИЧЕСКАЯ ПЕРИОДИЧЕСКАЯ СИНХРОНИЗАЦИЯ
    // ============================================================================
    function startAutoSync() {
        autoSaveInterval = setInterval(() => {
            if (window.SharedUtils && window.SharedUtils.isDirty()) {
                uploadToDisk().catch(() => {});
            }
        }, AUTO_SAVE_INTERVAL);
    }

    // ============================================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================================
    async function init() {
        // Ждём загрузки DOM
        if (document.readyState === 'loading') {
            await new Promise(r => document.addEventListener('DOMContentLoaded', r));
        }

        try {
            const token = getToken();
            if (!token) {
                console.warn('[Storage] Токен Яндекс.Диска не найден. Нажмите "Облако" для ввода токена.');
                showSyncButton();
                showStatus('⚠️ Нажмите "Облако" для ввода токена Яндекс.Диска', 'info');
                isReady = true;
                window.dispatchEvent(new CustomEvent('cloudStorageReady'));
                return;
            }

            // Показываем кнопку
            showSyncButton();

            // Скачиваем данные с Диска
            const btn = document.getElementById('cloudSyncBtn');
            if (btn) {
                btn.innerHTML = '⬇️';
                btn.disabled = true;
            }

            await downloadFromDisk();

            // Настраиваем слушатели
            setupSyncListeners();
            startAutoSync();

            // Готово
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '☁️';
            }

            isReady = true;

            // Отправляем событие готовности
            window.dispatchEvent(new CustomEvent('cloudStorageReady'));
        } catch (e) {
            console.error('[Storage] Ошибка инициализации:', e);
            isReady = true;
            window.dispatchEvent(new CustomEvent('cloudStorageReady'));
        }
    }

    init();

    // ============================================================================
    // PUBLIC API
    // ============================================================================
    window.CloudStorage = {
        download: downloadFromDisk,
        upload: uploadToDisk,
        isReady: () => isReady,
        getLastError: () => lastSyncError,
        waitForReady: () => new Promise(resolve => {
            if (isReady) return resolve();
            window.addEventListener('cloudStorageReady', resolve, { once: true });
        })
    };

    console.log('[Storage] Модуль инициализирован');
})();
