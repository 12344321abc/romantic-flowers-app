/**
 * Утилитарные функции для приложения
 */

/**
 * Получить элемент по ID
 * @param {string} id - ID элемента
 * @returns {HTMLElement|null}
 */
export const getElement = (id) => document.getElementById(id);

/**
 * Получить корзину из localStorage
 * @returns {Object} Объект корзины
 */
export function getCart() {
    return JSON.parse(localStorage.getItem('cart')) || {};
}

/**
 * Сохранить корзину в localStorage
 * @param {Object} cart - Объект корзины
 * @param {Function} updateNavCallback - Callback для обновления навигации
 */
export function saveCart(cart, updateNavCallback) {
    localStorage.setItem('cart', JSON.stringify(cart));
    if (updateNavCallback) {
        updateNavCallback();
    }
}

/**
 * Показать toast-уведомление
 * @param {string} message - Текст сообщения
 * @param {string} [linkUrl] - URL ссылки (опционально)
 * @param {string} [linkText] - Текст ссылки (опционально)
 */
export function showToast(message, linkUrl, linkText) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let content = `<span class="toast-message">${message}</span>`;
    if (linkUrl && linkText) {
        content += `<a href="${linkUrl}" class="toast-link">${linkText}</a>`;
    }
    toast.innerHTML = content;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        });
    }, 4000);
}

/**
 * Форматировать число как валюту с разделителем тысяч
 * @param {number} value - Значение
 * @returns {string} Форматированная строка
 */
export function formatCurrency(value) {
    return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
