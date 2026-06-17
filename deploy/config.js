// Токен Яндекс.Диска — вводится один раз, сохраняется в localStorage
(function() {
    'use strict';

    const TOKEN_KEY = 'yandex_disk_token';

    // Читаем из localStorage (сохраняется навсегда, пока не очистишь)
    let token = localStorage.getItem(TOKEN_KEY) || '';
    window.YANDEX_TOKEN = token;

    if (!token) {
        console.log('[config] Токен не найден. Нажмите кнопку "Облако" внизу страницы для ввода.');
    } else {
        console.log('[config] Токен загружен из localStorage');
    }

    // Установка токена (вызывается из storage.js при клике на "Облако")
    window.setYandexToken = function(newToken) {
        newToken = (newToken || '').trim();
        if (!newToken) return false;
        localStorage.setItem(TOKEN_KEY, newToken);
        window.YANDEX_TOKEN = newToken;
        console.log('[config] Токен сохранён');
        return true;
    };

    // Очистка токена
    window.clearYandexToken = function() {
        localStorage.removeItem(TOKEN_KEY);
        window.YANDEX_TOKEN = '';
        console.log('[config] Токен удалён');
    };
})();
