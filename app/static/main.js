document.addEventListener('DOMContentLoaded', () => {

    const API_URL = '';
    let authToken = localStorage.getItem('authToken');

    // =================================================================
    // UTILITY FUNCTIONS
    // =================================================================

    const getElement = (id) => document.getElementById(id);

    function getCart() {
        return JSON.parse(localStorage.getItem('cart')) || {};
    }

    function saveCart(cart) {
        localStorage.setItem('cart', JSON.stringify(cart));
        updateNav();
    }

    // =================================================================
    // API FUNCTIONS
    // =================================================================

    async function apiFetch(endpoint, options = {}) {
        const headers = { ...options.headers };
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        if (!(options.body instanceof FormData) && options.body) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(API_URL + endpoint, { ...options, headers });

        if (response.status === 401) {
            logout();
            throw new Error('Сессия истекла или недействительна. Пожалуйста, войдите снова.');
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: `Ошибка сервера: ${response.status}` }));
            throw new Error(err.detail);
        }
        return response.status === 204 ? null : response.json();
    }

    // =================================================================
    // NAVIGATION & AUTH
    // =================================================================

    function updateNav() {
        const mainNav = getElement('main-nav');
        if (!mainNav) return;

        const cart = getCart();
        const count = Object.keys(cart).length;

        let navHtml = '<a href="/">Каталог</a>';
        if (authToken) {
            navHtml += `<a href="/static/account.html">Личный кабинет</a>`;
            navHtml += `<a href="/static/cart.html">Корзина (${count})</a>`;
            navHtml += '<a href="#" id="logout-btn">Выйти</a>';
        } else {
            navHtml += '<a href="/static/login.html">Вход для клиентов</a>';
        }
        mainNav.innerHTML = navHtml;

        const logoutBtn = getElement('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', e => {
                e.preventDefault();
                logout();
            });
        }
    }

    function logout() {
        localStorage.removeItem('authToken');
        authToken = null;
        if (window.location.pathname.includes('cart.html')) {
            window.location.href = '/static/login.html';
        } else {
            initPage();
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const loginError = getElement('login-error');
        const username = getElement('username').value;
        const password = getElement('password').value;
        const formData = new URLSearchParams({ username, password });

        try {
            const response = await fetch(API_URL + '/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
            });
            if (!response.ok) {
                 throw new Error('Неверный логин или пароль.');
            }
            const data = await response.json();
            localStorage.setItem('authToken', data.access_token);
            authToken = data.access_token;
            window.location.href = '/';
        } catch (error) {
            loginError.textContent = error.message;
        }
    }

    // =================================================================
    // PAGE-SPECIFIC LOGIC
    // =================================================================

    async function initCatalogPage() {
        const catalog = getElement('flower-catalog');
        try {
            const flowers = await apiFetch('/flowers/');
            const availableFlowers = flowers.filter(f => f.status === 'available');
            catalog.innerHTML = '';

            if (availableFlowers.length === 0) {
                catalog.innerHTML = `
                    <div class="empty-catalog-message">
                        <p>На данный момент свежих цветов в наличии нет.</p>
                        <p>Подпишитесь, чтобы первым узнать о новой поставке!</p>
                        <a href="https://t.me/romantic_shopping_bot" target="_blank" rel="noopener noreferrer" class="button">🔔 Оповещения в Telegram</a>
                    </div>
                `;
                return;
            }

            availableFlowers.forEach(flower => {
                const flowerDiv = document.createElement('div');
                flowerDiv.className = 'flower-item';
                let actionHtml = `<p><a href="/static/login.html">Войдите</a>, чтобы добавить в корзину</p>`;
                if (authToken) {
                    actionHtml = `
                        <div class="quantity-selector" data-id="${flower.id}" data-name="${flower.name}" data-price="${flower.price}" data-max-quantity="${flower.quantity}">
                            <button class="change-qty-btn" data-change="-1">-</button>
                            <input type="number" class="quantity-input" value="1" min="1" max="${flower.quantity}">
                            <button class="change-qty-btn" data-change="1">+</button>
                        </div>
                        <button class="add-to-cart-btn">Добавить в корзину</button>
                    `;
                }
                flowerDiv.innerHTML = `
                    <img src="${flower.image_url}" alt="${flower.name}">
                    <h3>${flower.name}</h3>
                    <p>${flower.description || ''}</p>
                    <p><strong>Цена:</strong> ${flower.price} руб.</p>
                    <p><strong>В наличии:</strong> ${flower.quantity} шт.</p>
                    ${actionHtml}
                `;
                catalog.appendChild(flowerDiv);
            });
        } catch (error) {
            catalog.innerHTML = `<p style="color:red;">${error.message}</p>`;
        }
    }

    function initCartPage() {
        if (!authToken) {
            window.location.href = '/static/login.html';
            return;
        }
        const cart = getCart();
        const cartKeys = Object.keys(cart);
        const container = getElement('cart-items-container');
        container.innerHTML = '';
        
        if (cartKeys.length === 0) {
            getElement('cart-empty-message').classList.remove('hidden');
            getElement('cart-summary').classList.add('hidden');
            return;
        }
        
        getElement('cart-empty-message').classList.add('hidden');
        getElement('cart-summary').classList.remove('hidden');

        let totalPrice = 0;
        cartKeys.forEach(id => {
            const item = cart[id];
            const itemDiv = document.createElement('div');
            itemDiv.className = 'cart-item';
            itemDiv.innerHTML = `
                <div class="cart-item-info">
                   <span>${item.name}</span>
                   <span>${(item.price * item.quantity).toFixed(2)} руб.</span>
                </div>
                <div class="cart-item-controls">
                    <button class="change-qty-btn" data-id="${id}" data-change="-1">-</button>
                    <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="${item.maxQuantity}" data-id="${id}">
                    <button class="change-qty-btn" data-id="${id}" data-change="1">+</button>
                    <button class="remove-from-cart-btn" data-id="${id}">Удалить</button>
                </div>
            `;
            container.appendChild(itemDiv);
            totalPrice += item.price * item.quantity;
        });
        getElement('cart-total-price').textContent = totalPrice.toFixed(2);
    }

    async function handlePlaceOrder(e) {
        e.preventDefault();
        const cart = getCart();
        const items = Object.keys(cart).map(id => ({
            flower_batch_id: parseInt(id),
            quantity: cart[id].quantity
        }));
        const customer_comment = getElement('customer-comment').value;

        try {
            await apiFetch('/orders/', {
                method: 'POST',
                body: JSON.stringify({ items, customer_comment })
            });
            alert('Заказ успешно оформлен!');
            localStorage.removeItem('cart');
            window.location.href = '/';
        } catch(error) {
            alert(`Ошибка оформления заказа: ${error.message}`);
        }
    }
    
    async function initAccountPage() {
        if (!authToken) {
            window.location.href = '/static/login.html';
            return;
        }
        try {
            const [user, orders, flowers] = await Promise.all([
                apiFetch('/users/me/'),
                apiFetch('/orders/me/'),
                apiFetch('/flowers/')
            ]);
            
            getElement('user-contact-name').textContent = user.contact_name || 'Не указано';
            getElement('user-username').textContent = user.username;
            getElement('user-address').textContent = user.address || 'Не указан';

            const container = getElement('order-history-container');
            container.innerHTML = '';
            
            if (orders.length === 0) {
                getElement('no-orders-message').classList.remove('hidden');
                return;
            }

            const flowerDetails = flowers.reduce((acc, flower) => {
                acc[flower.id] = { name: flower.name };
                return acc;
            }, {});

            orders.forEach(order => {
                const orderDiv = document.createElement('div');
                orderDiv.className = 'order-item'; // Reuse styles
                const itemsHtml = order.items.map(item => {
                    const details = flowerDetails[item.flower_batch_id];
                    const name = details ? details.name : `ID: ${item.flower_batch_id}`;
                    return `<li><b>${name}</b> - ${item.quantity} шт. по цене ${item.price_at_time_of_order.toFixed(2)} руб.</li>`
                }).join('');
                
                orderDiv.innerHTML = `
                    <h4>Заказ #${order.id} от ${new Date(order.created_at).toLocaleString()}</h4>
                    <p><strong>Статус:</strong> ${order.status}</p>
                    <p><strong>Комментарий:</strong> ${order.customer_comment || 'Нет'}</p>
                    <ul>${itemsHtml}</ul>
                `;
                container.appendChild(orderDiv);
            });

        } catch (error) {
            console.error('Failed to load account data:', error);
            getElement('account-info').innerHTML = `<p style="color:red;">${error.message}</p>`;
        }
    }


    // =================================================================
    // INITIALIZATION & EVENT LISTENERS
    // =================================================================

    function initPage() {
        updateNav();
        // Route to the correct page initializer
        if (getElement('flower-catalog')) initCatalogPage();
        if (getElement('login-form')) getElement('login-form').addEventListener('submit', handleLogin);
        if (getElement('cart-items-container')) initCartPage();
        if (getElement('order-form')) getElement('order-form').addEventListener('submit', handlePlaceOrder);
        if (getElement('order-history-container')) initAccountPage();
    }
    
    function updateCartQuantity(id, newQuantity) {
        let cart = getCart();
        if (cart[id]) {
            // Clamp the quantity between 1 and max available
            const clampedQty = Math.max(1, Math.min(newQuantity, cart[id].maxQuantity));
            cart[id].quantity = clampedQty;
            saveCart(cart);
            initCartPage();
        }
    }

    document.body.addEventListener('click', e => {
        if (e.target.matches('.add-to-cart-btn')) {
            const flowerItem = e.target.closest('.flower-item');
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
            saveCart(cart);
            alert(`Добавлено в корзину: ${name} (${quantity} шт)`);
        }
        if (e.target.matches('.remove-from-cart-btn')) {
            const { id } = e.target.dataset;
            let cart = getCart();
            delete cart[id];
            saveCart(cart);
            initCartPage();
        }
        if (e.target.matches('.change-qty-btn')) {
            const quantityInput = e.target.parentElement.querySelector('.quantity-input');
            const currentValue = parseInt(quantityInput.value);
            const change = parseInt(e.target.dataset.change);
            const newValue = currentValue + change;
            if (newValue >= parseInt(quantityInput.min)) {
                quantityInput.value = newValue;
            }
        }
    });
    
    document.body.addEventListener('input', e => {
        // Sanitize input for all quantity fields to allow only natural numbers
        if (e.target.matches('.quantity-input')) {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            // If in cart, trigger an update immediately
            if (e.target.closest('.cart-item-controls')) {
                const { id } = e.target.dataset;
                const newQuantity = parseInt(e.target.value, 10);
                if (!isNaN(newQuantity)) {
                     updateCartQuantity(id, newQuantity);
                }
            }
        }
    });

    document.body.addEventListener('change', e => {
        // Final validation when user leaves the input field
        if (e.target.matches('.quantity-input')) {
            const min = parseInt(e.target.min, 10) || 1;
            const max = parseInt(e.target.max, 10);
            let value = parseInt(e.target.value, 10);

            if (isNaN(value) || value < min) {
                e.target.value = min;
            } else if (!isNaN(max) && value > max) {
                e.target.value = max;
            }
            
            // Trigger a final update for cart items
             if (e.target.closest('.cart-item-controls')) {
                const { id } = e.target.dataset;
                const newQuantity = parseInt(e.target.value, 10);
                // No need to check isNaN here, as we've already sanitized it
                updateCartQuantity(id, newQuantity);
            }
        }
    });

    // START THE APP
    initPage();
});