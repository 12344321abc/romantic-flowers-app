/**
 * Модуль управления заказами в админ-панели
 */

import { apiFetch } from './api.js';

// DOM элементы
let orderList = null;

/**
 * Инициализация модуля
 */
export function initOrdersModule() {
    orderList = document.getElementById('order-list');
}

/**
 * Загрузить список заказов
 * @param {Function} [onUnauthorized] - Callback при ошибке авторизации
 */
export async function fetchOrders(onUnauthorized) {
    if (!orderList) return;
    
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
            
            const itemsHtml = order.items.map(item => {
                const details = flowerDetails[item.flower_batch_id];
                const name = details ? details.name : `ID: ${item.flower_batch_id}`;
                return `<li><b>${name}</b> - ${item.quantity} шт. по цене ${item.price_at_time_of_order.toFixed(2)} руб.</li>`;
            }).join('');

            orderDiv.innerHTML = `
                <h4>Заказ #${order.id} от ${new Date(order.created_at).toLocaleString()}</h4>
                <p><strong>Клиент:</strong> ${customerNames[order.customer_id] || `ID: ${order.customer_id}`}</p>
                <p><strong>Статус:</strong> ${order.status}</p>
                <p><strong>Комментарий:</strong> ${order.customer_comment || 'Нет'}</p>
                <p><strong>Состав:</strong></p>
                <ul>${itemsHtml}</ul>
            `;
            orderList.appendChild(orderDiv);
        });
    } catch (error) {
        console.error("Failed to fetch orders:", error);
        if (orderList) {
            orderList.innerHTML = '<p>Ошибка при загрузке заказов.</p>';
        }
    }
}
