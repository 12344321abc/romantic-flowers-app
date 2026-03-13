/**
 * Модуль каталога товаров
 */

import { getElement, getCart, saveCart, showToast } from './utils.js';
import { apiFetch, getAuthToken } from './api.js';
import { updateNav, logout } from './navigation.js';
import { showContainerSpinner } from './loading.js';

/**
 * Инициализация страницы каталога
 */
export async function initCatalogPage() {
    const catalog = getElement('flower-catalog');
    if (!catalog) return;
    
    const authToken = getAuthToken();
    
    // Показываем спиннер пока загружается каталог
    showContainerSpinner(catalog);
    
    try {
        const flowers = await apiFetch('/flowers/', {}, logout);
        const availableFlowers = flowers.filter(f => f.status === 'available');
        const cart = getCart();
        catalog.innerHTML = '';

        if (availableFlowers.length === 0) {
            catalog.classList.add('is-empty');
            catalog.innerHTML = `
                <div class="empty-catalog-message">
                    <p>На данный момент свежих цветов в наличии нет.</p>
                    <p>Подпишитесь, чтобы первым узнать о новой поставке!</p>
                    <a href="https://t.me/romantic_shopping_bot" target="_blank" rel="noopener noreferrer" class="button">🔔 Оповещения в Telegram</a>
                </div>
            `;
            return;
        }
        
        catalog.classList.remove('is-empty');
        availableFlowers.forEach(flower => {
            const itemInCart = cart[flower.id];
            const inCartQty = itemInCart ? itemInCart.quantity : 0;
            const displayQuantity = flower.quantity - inCartQty;

            const flowerDiv = document.createElement('div');
            flowerDiv.className = 'flower-item';
            
            // Hide the item if it's in the cart and the quantity is fully reserved.
            if (displayQuantity <= 0) {
                flowerDiv.classList.add('hidden');
            }

            let actionHtml = `<p class="login-prompt"><a href="/static/login.html">Войдите</a>, чтобы добавить в корзину</p>`;
            if (authToken) {
                actionHtml = renderCartActions(flower.id, flower.name, flower.price, flower.quantity, inCartQty);
            }
            flowerDiv.innerHTML = `
                <img src="${flower.image_url}" alt="${flower.name}">
                <div class="flower-content">
                    <h3>${flower.name}</h3>
                    <p class="flower-description">${flower.description || ''}</p>
                    <div class="flower-meta">
                        <span class="flower-price">${flower.price} ₽</span>
                        <span class="flower-stock">В наличии: ${displayQuantity} шт.</span>
                    </div>
                </div>
                <div class="actions-container">
                    ${actionHtml}
                </div>
            `;
            catalog.appendChild(flowerDiv);
        });
    } catch (error) {
        catalog.innerHTML = `<p style="color:red;">${error.message}</p>`;
    }
}

/**
 * Генерирует HTML для action-секции карточки цветка (Ozon-стиль)
 * @param {number} id - ID цветка
 * @param {string} name - Название
 * @param {number} price - Цена
 * @param {number} maxQuantity - Максимальное количество на складе
 * @param {number} inCartQty - Количество в корзине
 */
function renderCartActions(id, name, price, maxQuantity, inCartQty) {
    const displayQuantity = maxQuantity - inCartQty;
    
    if (inCartQty > 0) {
        // Товар в корзине - показываем счётчик (Ozon стиль)
        return `
            <div class="cart-counter" data-id="${id}" data-name="${name}" data-price="${price}" data-max-quantity="${maxQuantity}">
                <button class="cart-counter-btn minus" data-action="decrease">−</button>
                <a href="/static/cart.html" class="cart-counter-value">${inCartQty}</a>
                <button class="cart-counter-btn plus" data-action="increase" ${displayQuantity <= 0 ? 'disabled' : ''}>+</button>
            </div>
        `;
    } else {
        // Товар не в корзине - кнопка добавления
        return `
            <button class="add-to-cart-btn" data-id="${id}" data-name="${name}" data-price="${price}" data-max-quantity="${maxQuantity}" ${displayQuantity <= 0 ? 'disabled' : ''}>
                В корзину
            </button>
        `;
    }
}

/**
 * Обработчик первого добавления товара в корзину
 * @param {HTMLElement} button - Кнопка "В корзину"
 */
export function handleAddToCart(button) {
    const flowerItem = button.closest('.flower-item');
    const { id, name, price, maxQuantity } = button.dataset;
    
    const cart = getCart();
    const maxQty = parseInt(maxQuantity);
    
    // Добавляем 1 штуку
    cart[id] = { name, price: parseFloat(price), quantity: 1, maxQuantity: maxQty };
    saveCart(cart, updateNav);
    showToast(`"${name}" добавлен в корзину`, '/static/cart.html', 'Перейти');
    
    // Обновляем UI
    updateFlowerCardUI(flowerItem, id, name, parseFloat(price), maxQty, 1);
}

/**
 * Изменить количество товара в корзине (+ / -)
 * @param {HTMLElement} button - Кнопка + или -
 */
export function handleCartCounterChange(button) {
    const flowerItem = button.closest('.flower-item');
    const counter = button.closest('.cart-counter');
    const { id, name, price, maxQuantity } = counter.dataset;
    const action = button.dataset.action;
    
    const cart = getCart();
    const maxQty = parseInt(maxQuantity);
    const currentQty = cart[id] ? cart[id].quantity : 0;
    
    let newQty = currentQty;
    if (action === 'increase') {
        newQty = Math.min(currentQty + 1, maxQty);
    } else if (action === 'decrease') {
        newQty = currentQty - 1;
    }
    
    if (newQty <= 0) {
        // Удаляем из корзины
        delete cart[id];
        saveCart(cart, updateNav);
        showToast(`"${name}" удалён из корзины`);
    } else if (newQty !== currentQty) {
        cart[id] = { name, price: parseFloat(price), quantity: newQty, maxQuantity: maxQty };
        saveCart(cart, updateNav);
    }
    
    // Обновляем UI
    updateFlowerCardUI(flowerItem, id, name, parseFloat(price), maxQty, newQty);
}

/**
 * Обновить UI карточки цветка
 */
function updateFlowerCardUI(flowerItem, id, name, price, maxQuantity, inCartQty) {
    const stockElement = flowerItem.querySelector('.flower-stock');
    const actionsContainer = flowerItem.querySelector('.actions-container');
    const displayQuantity = maxQuantity - inCartQty;
    
    // Обновляем текст остатка
    stockElement.textContent = `В наличии: ${displayQuantity} шт.`;
    
    // Перерисовываем action-секцию
    actionsContainer.innerHTML = renderCartActions(id, name, price, maxQuantity, inCartQty);
}
