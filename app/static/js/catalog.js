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
            const displayQuantity = itemInCart ? flower.quantity - itemInCart.quantity : flower.quantity;

            const flowerDiv = document.createElement('div');
            flowerDiv.className = 'flower-item';
            
            // Hide the item if it's in the cart and the quantity is fully reserved.
            if (displayQuantity <= 0) {
                flowerDiv.classList.add('hidden');
            }

            let actionHtml = `<p><a href="/static/login.html">Войдите</a>, чтобы добавить в корзину</p>`;
            if (authToken) {
                actionHtml = `
                    <div class="quantity-selector" data-id="${flower.id}" data-name="${flower.name}" data-price="${flower.price}" data-max-quantity="${flower.quantity}">
                        <button class="change-qty-btn" data-change="-1">-</button>
                        <input type="number" class="quantity-input" value="1" min="1" max="${displayQuantity > 0 ? displayQuantity : 1}">
                        <button class="change-qty-btn" data-change="1">+</button>
                    </div>
                    <button class="add-to-cart-btn" ${displayQuantity <= 0 ? 'disabled' : ''}>Добавить в корзину</button>
                `;
            }
            flowerDiv.innerHTML = `
                <img src="${flower.image_url}" alt="${flower.name}">
                <h3>${flower.name}</h3>
                <p>${flower.description || ''}</p>
                <p><strong>Цена:</strong> ${flower.price} руб.</p>
                <p><strong>В наличии:</strong> ${displayQuantity} шт.</p>
                ${actionHtml}
            `;
            catalog.appendChild(flowerDiv);
        });
    } catch (error) {
        catalog.innerHTML = `<p style="color:red;">${error.message}</p>`;
    }
}

/**
 * Обработчик добавления товара в корзину
 * @param {HTMLElement} flowerItem - Элемент товара
 */
export function handleAddToCart(flowerItem) {
    const quantitySelector = flowerItem.querySelector('.quantity-selector');
    const quantity = parseInt(quantitySelector.querySelector('.quantity-input').value);
    const { id, name, price, maxQuantity } = quantitySelector.dataset;

    const cart = getCart();
    const existingQty = cart[id] ? cart[id].quantity : 0;
    const newQty = existingQty + quantity;

    if (newQty > parseInt(maxQuantity)) {
        alert(`Нельзя добавить больше, чем есть в наличии (${maxQuantity} шт.).`);
        return;
    }
    
    cart[id] = { name, price: parseFloat(price), quantity: newQty, maxQuantity: parseInt(maxQuantity) };
    saveCart(cart, updateNav);
    showToast(`"${name}" (${quantity} шт) добавлено.`, '/static/cart.html', 'В корзину');
    initCatalogPage(); // Re-render the catalog to update stock display
}
