/**
 * Модуль управления заказами в админ-панели
 */

import { apiFetch } from './api.js';
import { showContainerSpinner } from '../loading.js';

// DOM элементы
let orderList = null;

// Доступные статусы заказов
let availableStatuses = ['new', 'processing', 'ready', 'completed', 'cancelled'];

// Локализация статусов
const statusLabels = {
    'new': 'Новый',
    'processing': 'В обработке',
    'ready': 'Готов',
    'completed': 'Завершён',
    'cancelled': 'Отменён'
};

// Callback для перезагрузки при ошибке авторизации
let unauthorizedCallback = null;

/**
 * Инициализация модуля
 */
export function initOrdersModule() {
    orderList = document.getElementById('order-list');
    // Загружаем доступные статусы с сервера
    loadStatuses();
}

/**
 * Загрузить доступные статусы с сервера
 */
async function loadStatuses() {
    try {
        const statuses = await apiFetch('/orders/statuses/list');
        if (Array.isArray(statuses)) {
            availableStatuses = statuses;
        }
    } catch (error) {
        console.error("Failed to load statuses:", error);
    }
}

/**
 * Обновить статус заказа
 * @param {number} orderId - ID заказа
 * @param {string} newStatus - Новый статус
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        await apiFetch(`/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        }, unauthorizedCallback);
        
        // Перезагружаем список заказов
        fetchOrders(unauthorizedCallback);
    } catch (error) {
        console.error("Failed to update order status:", error);
        alert(`Ошибка при обновлении статуса: ${error.message}`);
    }
}

/**
 * Создать выпадающий список для выбора статуса
 * @param {number} orderId - ID заказа
 * @param {string} currentStatus - Текущий статус
 * @returns {string} HTML для select
 */
function createStatusSelect(orderId, currentStatus) {
    const options = availableStatuses.map(status => {
        const selected = status === currentStatus ? 'selected' : '';
        const label = statusLabels[status] || status;
        return `<option value="${status}" ${selected}>${label}</option>`;
    }).join('');
    
    return `
        <select class="order-status-select" data-order-id="${orderId}" data-status="${currentStatus}">
            ${options}
        </select>
    `;
}

/**
 * Загрузить список заказов
 * @param {Function} [onUnauthorized] - Callback при ошибке авторизации
 */
export async function fetchOrders(onUnauthorized) {
    if (!orderList) return;
    unauthorizedCallback = onUnauthorized;
    
    showContainerSpinner(orderList);
    
    try {
        const [orders, users, flowers] = await Promise.all([
            apiFetch('/orders/', {}, onUnauthorized),
            apiFetch('/users/', {}, onUnauthorized),
            apiFetch('/flowers/', {}, onUnauthorized)
        ]);
        
        orderList.innerHTML = '';
        
        if (orders.length === 0) {
            orderList.innerHTML = '<p>Пока не было ни одного заказа.</p>';
            return;
        }

        // Создаём карту имён клиентов
        const customerNames = users.reduce((acc, user) => {
            acc[user.id] = user.contact_name || user.username;
            return acc;
        }, {});

        // Создаём карту деталей цветов
        const flowerDetails = flowers.reduce((acc, flower) => {
            acc[flower.id] = { name: flower.name, description: flower.description };
            return acc;
        }, {});

        // Сортируем заказы по дате (новые сверху)
        orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        orders.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.className = 'order-item';
            orderDiv.dataset.status = order.status;
            
            const itemsHtml = order.items.map(item => {
                const details = flowerDetails[item.flower_batch_id];
                const name = details ? details.name : `ID: ${item.flower_batch_id}`;
                return `<li><b>${name}</b> - ${item.quantity} шт. по цене ${item.price_at_time_of_order.toFixed(2)} руб.</li>`;
            }).join('');

            const statusSelect = createStatusSelect(order.id, order.status);

            orderDiv.innerHTML = `
                <h4>Заказ #${order.id} от ${new Date(order.created_at).toLocaleString()}</h4>
                <p><strong>Клиент:</strong> ${customerNames[order.customer_id] || `ID: ${order.customer_id}`}</p>
                <p><strong>Статус:</strong> ${statusSelect}</p>
                <p><strong>Комментарий:</strong> ${order.customer_comment || 'Нет'}</p>
                <p><strong>Состав:</strong></p>
                <ul>${itemsHtml}</ul>
            `;
            orderList.appendChild(orderDiv);
        });
        
        // Добавляем обработчики для изменения статуса
        orderList.querySelectorAll('.order-status-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const orderId = e.target.dataset.orderId;
                const newStatus = e.target.value;
                updateOrderStatus(orderId, newStatus);
                // Update color coding
                e.target.dataset.status = newStatus;
                e.target.closest('.order-item').dataset.status = newStatus;
            });
        });
    } catch (error) {
        console.error("Failed to fetch orders:", error);
        if (orderList) {
            orderList.innerHTML = '<p>Ошибка при загрузке заказов.</p>';
        }
    }
}
