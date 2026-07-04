// Токен Яндекс.Диска — вводится один раз, сохраняется в localStorage
(function() {
    'use strict';

    const TOKEN_KEY = 'yandex_disk_token';
    const CLIENT_ID_KEY = 'yandex_client_id';
    const CLIENT_SECRET_KEY = 'yandex_client_secret';

    // Новые кредо приложения
    const DEFAULT_CLIENT_ID = '03b8476330a34436adbc8758809e4071';
    const DEFAULT_CLIENT_SECRET = '5527b53190fb4a3781563f70a9a46d3d';

    // Читаем из localStorage, если нет — подставляем дефолтные
    let token = localStorage.getItem(TOKEN_KEY) || '';
    let clientId = localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
    let clientSecret = localStorage.getItem(CLIENT_SECRET_KEY) || DEFAULT_CLIENT_SECRET;
    window.YANDEX_TOKEN = token;
    window.YANDEX_CLIENT_ID = clientId;
    window.YANDEX_CLIENT_SECRET = clientSecret;

    if (token) {
        console.log('[config] Токен загружен из localStorage');
    } else {
        console.log('[config] Токен не найден. Нажмите кнопку "Облако" для авторизации через Яндекс.');
    }

    // Сохранение токена
    window.setYandexToken = function(newToken) {
        newToken = (newToken || '').trim();
        if (!newToken) return false;
        localStorage.setItem(TOKEN_KEY, newToken);
        window.YANDEX_TOKEN = newToken;
        console.log('[config] Токен сохранён');
        return true;
    };

    // Сохранение client_id и client_secret
    window.setYandexCredentials = function(id, secret) {
        id = (id || '').trim();
        secret = (secret || '').trim();
        if (!id || !secret) return false;
        localStorage.setItem(CLIENT_ID_KEY, id);
        localStorage.setItem(CLIENT_SECRET_KEY, secret);
        window.YANDEX_CLIENT_ID = id;
        window.YANDEX_CLIENT_SECRET = secret;
        console.log('[config] Client ID и Secret сохранены');
        return true;
    };

    // Обмен кода подтверждения на токен
    window.exchangeCodeForToken = async function(code, id, secret) {
        code = (code || '').trim();
        id = (id || '').trim();
        secret = (secret || '').trim();
        if (!code || !id || !secret) {
            throw new Error('Не указан код подтверждения, Client ID или Client Secret');
        }

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: id,
            client_secret: secret
        });

        const response = await fetch('https://oauth.yandex.ru/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error_description || data.error || 'Ошибка получения токена');
        }

        if (data.access_token) {
            window.setYandexCredentials(id, secret);
            window.setYandexToken(data.access_token);
            return data.access_token;
        }

        throw new Error('Токен не получен от сервера');
    };

    // Обновление токена (refresh)
    window.refreshYandexToken = async function() {
        const id = localStorage.getItem(CLIENT_ID_KEY) || '';
        const secret = localStorage.getItem(CLIENT_SECRET_KEY) || '';
        const refreshToken = localStorage.getItem('yandex_refresh_token') || '';
        if (!id || !secret || !refreshToken) return false;

        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: id,
            client_secret: secret
        });

        try {
            const response = await fetch('https://oauth.yandex.ru/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            const data = await response.json();
            if (data.access_token) {
                window.setYandexToken(data.access_token);
                if (data.refresh_token) {
                    localStorage.setItem('yandex_refresh_token', data.refresh_token);
                }
                return true;
            }
        } catch (e) {
            console.warn('[config] Ошибка обновления токена:', e);
        }
        return false;
    };

    // Очистка всех данных
    window.clearYandexToken = function() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(CLIENT_ID_KEY);
        localStorage.removeItem(CLIENT_SECRET_KEY);
        localStorage.removeItem('yandex_refresh_token');
        window.YANDEX_TOKEN = '';
        window.YANDEX_CLIENT_ID = '';
        window.YANDEX_CLIENT_SECRET = '';
        console.log('[config] Все данные Яндекс удалены');
    };
})();
