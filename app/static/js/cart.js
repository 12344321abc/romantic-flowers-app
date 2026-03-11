/**
 * Модуль корзины покупок
 */

import { getElement, getCart, saveCart, formatCurrency } from './utils.js';
import { apiFetch, getAuthToken } from './api.js';
import { updateNav, logout } from './navigation.js';

const MINIMUM_ORDER_VALUE = 5000;

/**
 * Обновить количество товара в корзине
 * @param {string} id - ID товара
 * @param {number} newQuantity - Новое количество
 */
export function updateCartQuantity(id, newQuantity) {
    let cart = getCart();
    if (cart[id]) {
        // Clamp the quantity between 1 and max available
        const clampedQty = Math.max(1, Math.min(newQuantity, cart[id].maxQuantity));
        cart[id].quantity = clampedQty;
        saveCart(cart, updateNav);
        initCartPage();
    }
}

/**
 * Удалить товар из корзины
 * @param {string} id - ID товара
 */
export function removeFromCart(id) {
    let cart = getCart();
    delete cart[id];
    saveCart(cart, updateNav);
    initCartPage();
}

/**
 * Инициализация страницы корзины
 */
export function initCartPage() {
    const authToken = getAuthToken();
    if (!authToken) {
        window.location.href = '/static/login.html';
        return;
    }
    
    const cart = getCart();
    const cartKeys = Object.keys(cart);
    const container = getElement('cart-items-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (cartKeys.length === 0) {
        getElement('cart-empty-message')?.classList.remove('hidden');
        getElement('cart-summary')?.classList.add('hidden');
        return;
    }
    
    getElement('cart-empty-message')?.classList.add('hidden');
    getElement('cart-summary')?.classList.remove('hidden');

    let totalPrice = 0;
    cartKeys.forEach(id => {
        const item = cart[id];
        const itemDiv = document.createElement('div');
        itemDiv.className = 'cart-item';
        itemDiv.innerHTML = `
            <div class="cart-item-info">
               <span>${item.name}</span>
               <span>${formatCurrency(item.price * item.quantity)} ₽</span>
            </div>
            <div class="cart-item-controls">
                <div class="quantity-selector" data-id="${id}" data-display-max="${item.maxQuantity}">
                    <button class="change-qty-btn" data-id="${id}" data-change="-1">−</button>
                    <span class="quantity-display">${item.quantity}</span>
                    <button class="change-qty-btn" data-id="${id}" data-change="1">+</button>
                </div>
                <button class="remove-from-cart-btn" data-id="${id}">Удалить</button>
            </div>
        `;
        container.appendChild(itemDiv);
        totalPrice += item.price * item.quantity;
    });
    
    const totalPriceEl = getElement('cart-total-price');
    if (totalPriceEl) {
        totalPriceEl.textContent = formatCurrency(totalPrice);
    }
    
    const placeOrderBtn = getElement('place-order-btn');
    const cartMinimumError = getElement('cart-minimum-error');

    if (totalPrice < MINIMUM_ORDER_VALUE) {
        if (placeOrderBtn) placeOrderBtn.disabled = true;
        if (cartMinimumError) {
            const remainingAmount = MINIMUM_ORDER_VALUE - totalPrice;
            cartMinimumError.textContent = `Для оформления заказа добавьте еще товаров на ${formatCurrency(remainingAmount)} руб.`;
            cartMinimumError.style.display = 'block';
        }
    } else {
        if (placeOrderBtn) placeOrderBtn.disabled = false;
        if (cartMinimumError) {
            cartMinimumError.textContent = '';
            cartMinimumError.style.display = 'none';
        }
    }
}

/**
 * Обработчик оформления заказа
 * @param {Event} e - Событие submit
 */
export async function handlePlaceOrder(e) {
    e.preventDefault();
    const cart = getCart();
    const items = Object.keys(cart).map(id => ({
        flower_batch_id: parseInt(id),
        quantity: cart[id].quantity
    }));
    const customerComment = getElement('customer-comment')?.value || '';

    try {
        await apiFetch('/orders/', {
            method: 'POST',
            body: JSON.stringify({ items, customer_comment: customerComment })
        }, logout);
        alert('Заказ успешно оформлен!');
        localStorage.removeItem('cart');
        window.location.href = '/';
    } catch(error) {
        alert(`Ошибка оформления заказа: ${error.message}`);
    }
}
