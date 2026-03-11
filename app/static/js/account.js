/**
 * Модуль личного кабинета
 */

import { getElement, formatCurrency } from './utils.js';
import { apiFetch, getAuthToken } from './api.js';
import { logout } from './navigation.js';
import { showContainerSpinner } from './loading.js';

// Локализация статусов заказов
const statusLabels = {
    'new': 'Новый',
    'processing': 'В обработке',
    'ready': 'Готов к выдаче',
    'completed': 'Завершён',
    'cancelled': 'Отменён'
};

/**
 * Инициализация страницы личного кабинета
 */
export async function initAccountPage() {
    const authToken = getAuthToken();
    if (!authToken) {
        window.location.href = '/static/login.html';
        return;
    }
    
    const container = getElement('order-history-container');
    if (!container) return;
    
    // Показываем спиннер пока загружаются данные
    showContainerSpinner(container);
    
    try {
        const [user, orders, flowers] = await Promise.all([
            apiFetch('/users/me/', {}, logout),
            apiFetch('/orders/me/', {}, logout),
            apiFetch('/flowers/', {}, logout)
        ]);
        
        const contactNameEl = getElement('user-contact-name');
        const usernameEl = getElement('user-username');
        const addressEl = getElement('user-address');
        
        if (contactNameEl) contactNameEl.textContent = user.contact_name || 'Не указано';
        if (usernameEl) usernameEl.textContent = user.username;
        if (addressEl) addressEl.textContent = user.address || 'Не указан';

        container.innerHTML = '';
        
        if (orders.length === 0) {
            getElement('no-orders-message')?.classList.remove('hidden');
            return;
        }

        const flowerDetails = flowers.reduce((acc, flower) => {
            acc[flower.id] = { name: flower.name };
            return acc;
        }, {});

        orders.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.className = 'order-item';
            const itemsHtml = order.items.map(item => {
                const details = flowerDetails[item.flower_batch_id];
                const name = details ? details.name : `ID: ${item.flower_batch_id}`;
                return `<li><b>${name}</b> - ${item.quantity} шт. по цене ${formatCurrency(item.price_at_time_of_order)} руб.</li>`
            }).join('');
            
            const statusLabel = statusLabels[order.status] || order.status;
            
            orderDiv.innerHTML = `
                <h4>Заказ #${order.id} от ${new Date(order.created_at).toLocaleString()}</h4>
                <p><strong>Статус:</strong> <span class="status-badge status-${order.status}">${statusLabel}</span></p>
                <p><strong>Комментарий:</strong> ${order.customer_comment || 'Нет'}</p>
                <ul>${itemsHtml}</ul>
            `;
            orderDiv.dataset.status = order.status;
            container.appendChild(orderDiv);
        });

    } catch (error) {
        console.error('Failed to load account data:', error);
        const accountInfo = getElement('account-info');
        if (accountInfo) {
            accountInfo.innerHTML = `<p style="color:red;">${error.message}</p>`;
        }
    }
}
