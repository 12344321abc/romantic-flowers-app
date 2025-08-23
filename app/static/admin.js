document.addEventListener('DOMContentLoaded', () => {
    // --- Global Elements ---
    const loginView = document.getElementById('admin-login-view');
    const adminView = document.getElementById('admin-main-view');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const loginError = document.getElementById('login-error');
    const mainViews = document.querySelectorAll('#admin-main-view main > div');
    const navButtons = document.querySelectorAll('.nav-btn');

    // --- Flower View Elements ---
    const flowerForm = document.getElementById('flower-form');
    const flowerList = document.getElementById('flower-list');
    
    // --- Customer View Elements ---
    const customerForm = document.getElementById('customer-form');
    const customerList = document.getElementById('customer-list');
    
    // --- Order View Elements ---
    const orderList = document.getElementById('order-list');
    
    const API_URL = '';
    let authToken = localStorage.getItem('authToken');

    // ---- View Management ----
    const switchView = (viewId) => {
        mainViews.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId)?.classList.remove('hidden');

        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewId);
        });

        if (viewId === 'flowers-view') fetchFlowers();
        if (viewId === 'customers-view') fetchCustomers();
        if (viewId === 'orders-view') fetchOrders();
    };

    // ---- Auth ----
    const updateLoginView = async () => {
        if (!authToken) {
            loginView.classList.remove('hidden');
            adminView.classList.add('hidden');
            return;
        }
        
        try {
            // This request will succeed only if the user is an admin
            await apiFetch('/users/me/admin/');
            loginView.classList.add('hidden');
            adminView.classList.remove('hidden');
            // Check if a view is already active, otherwise switch to default
            if (!document.querySelector('.nav-btn.active')) {
                switchView('flowers-view');
            }
        } catch (error) {
            // If the token is invalid or the user is not an admin, logout and show login form
            logout();
        }
    };
    
    async function login(username, password) {
        const formData = new URLSearchParams({ username, password });
        try {
            const response = await fetch(`${API_URL}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
            });
            if (!response.ok) throw new Error('Неверный логин или пароль');
            const data = await response.json();
            authToken = data.access_token;
            localStorage.setItem('authToken', authToken);
            loginError.textContent = '';
            updateLoginView();
        } catch (error) {
            loginError.textContent = error.message;
        }
    }
    
    function logout() {
        localStorage.removeItem('authToken');
        authToken = null;
        updateLoginView();
    }

    // ---- Generic API Fetch ----
    async function apiFetch(url, options = {}) {
        const headers = { ...options.headers };
        if (!(options.body instanceof FormData)) {
             headers['Content-Type'] = 'application/json';
        }
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        const response = await fetch(API_URL + url, { ...options, headers });
        if (response.status === 401) {
            logout();
            throw new Error('Unauthorized');
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail);
        }
        return response.status === 204 ? null : response.json();
    }

    // ---- Flowers Logic ----
    async function fetchFlowers() {
        try {
            const flowers = await apiFetch('/flowers/');
            flowerList.innerHTML = ''; 
            flowers.forEach(flower => {
                const flowerDiv = document.createElement('div');
                flowerDiv.className = 'flower-item';
                flowerDiv.innerHTML = `
                    <img src="${flower.image_url}" alt="${flower.name}">
                    <h3>${flower.name}</h3>
                    <p>${flower.description}</p>
                    <p><strong>Цена:</strong> ${flower.price} руб.</p>
                    <p><strong>Остаток:</strong> ${flower.quantity} шт.</p>
                    <p><strong>Статус:</strong> ${flower.status}</p>
                    <div class="actions-container">
                        <div class="quantity-control" data-id="${flower.id}">
                            <input type="number" class="quantity-input" placeholder="Кол-во" min="1">
                            <button class="add-btn" title="Добавить количество">+</button>
                            <button class="sell-btn" title="Продать количество">»</button>
                        </div>
                        <button class="delete-btn" data-id="${flower.id}">Удалить партию</button>
                    </div>
                `;
                flowerList.appendChild(flowerDiv);
            });
        } catch(error) { console.error("Failed to fetch flowers:", error); }
    }
    
    async function addFlower(event) {
        event.preventDefault();
        const formData = new FormData();
        const imageFile = document.getElementById('flower-image').files[0];
        if (!imageFile) { alert('Пожалуйста, выберите изображение.'); return; }
        formData.append('name', document.getElementById('flower-name').value);
        formData.append('description', document.getElementById('flower-description').value);
        formData.append('price', document.getElementById('flower-price').value);
        formData.append('quantity', document.getElementById('flower-quantity').value);
        formData.append('image', imageFile);
        try {
            await apiFetch('/flowers/', { method: 'POST', body: formData });
            flowerForm.reset();
            fetchFlowers();
        } catch (error) { console.error('Failed to add flower:', error); alert(`Ошибка: ${error.message}`); }
    }

    async function deleteFlower(flowerId) {
        if (!confirm('Вы уверены?')) return;
        try {
            await apiFetch(`/flowers/${flowerId}`, { method: 'DELETE' });
            fetchFlowers();
        } catch (error) { console.error('Failed to delete flower:', error); }
    }

    async function sellFlowers(flowerId, quantity) {
        try {
            await apiFetch(`/flowers/${flowerId}/sell`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
            fetchFlowers();
        } catch (error) { console.error('Failed to sell flowers:', error); }
    }

    async function addFlowerQuantity(flowerId, quantity) {
        try {
            await apiFetch(`/flowers/${flowerId}/add`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
            fetchFlowers();
        } catch (error) { console.error('Failed to add quantity:', error); }
    }
    
    // ---- Customers Logic ----
    async function fetchCustomers() {
        try {
            const customers = await apiFetch('/users/');
            customerList.innerHTML = '';
            customers.filter(u => u.role === 'customer').forEach(customer => {
                const customerDiv = document.createElement('div');
                customerDiv.className = 'customer-item';
                customerDiv.innerHTML = `
                    <img src="${customer.photo_url || 'https://via.placeholder.com/100'}" alt="${customer.contact_name}">
                    <h4>${customer.contact_name}</h4>
                    <p>Логин: ${customer.username}</p>
                    <p>Адрес: ${customer.address || 'Не указан'}</p>
                     <details>
                        <summary>Заметки админа</summary>
                        <p>${customer.admin_notes || 'Нет заметок.'}</p>
                    </details>
                    <button class="delete-customer-btn" data-id="${customer.id}">Удалить</button>
                `;
                customerList.appendChild(customerDiv);
            });
        } catch(error) { console.error("Failed to fetch customers:", error); }
    }

    async function addCustomer(event) {
        event.preventDefault();
        const password = document.getElementById('customer-password').value;
        const passwordConfirm = document.getElementById('customer-password-confirm').value;

        if (password !== passwordConfirm) {
            alert('Пароли не совпадают!');
            return;
        }

        const formData = new FormData();
        const photoFile = document.getElementById('customer-photo').files[0];
        
        formData.append('username', document.getElementById('customer-username').value);
        formData.append('password', password);
        formData.append('contact_name', document.getElementById('customer-contact-name').value);
        formData.append('address', document.getElementById('customer-address').value);
        formData.append('admin_notes', document.getElementById('customer-admin-notes').value);
        if (photoFile) formData.append('photo', photoFile);

        try {
            await apiFetch('/users/', { method: 'POST', body: formData });
            customerForm.reset();
            fetchCustomers();
        } catch (error) { console.error('Failed to add customer:', error); alert(`Ошибка: ${error.message}`); }
    }

     async function deleteCustomer(customerId) {
        if (!confirm('Вы уверены?')) return;
        try {
            await apiFetch(`/users/${customerId}`, { method: 'DELETE' });
            fetchCustomers();
        } catch (error) { console.error('Failed to delete customer:', error); }
    }

    // ---- Orders Logic ----
    async function fetchOrders() {
        try {
            // Fetch all necessary data in parallel
            const [orders, users, flowers] = await Promise.all([
                apiFetch('/orders/'),
                apiFetch('/users/'),
                apiFetch('/flowers/')
            ]);
            
            orderList.innerHTML = '';
            if (orders.length === 0) {
                orderList.innerHTML = '<p>Пока не было ни одного заказа.</p>';
                return;
            }

            // Create lookup maps for faster access
            const customerNames = users.reduce((acc, user) => {
                acc[user.id] = user.contact_name || user.username;
                return acc;
            }, {});

            const flowerDetails = flowers.reduce((acc, flower) => {
                acc[flower.id] = { name: flower.name, description: flower.description };
                return acc;
            }, {});

            orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            orders.forEach(order => {
                const orderDiv = document.createElement('div');
                orderDiv.className = 'order-item';
                
                let itemsHtml = order.items.map(item => {
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
        } catch(error) {
            console.error("Failed to fetch orders:", error);
            orderList.innerHTML = '<p>Ошибка при загрузке заказов.</p>';
        }
    }
    
    // ---- Global Event Listeners ----
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        login(e.target.username.value, e.target.password.value);
    });

    logoutBtn.addEventListener('click', () => {
        logout();
    });

    document.querySelector('header nav').addEventListener('click', (e) => {
        if (e.target.classList.contains('nav-btn')) switchView(e.target.dataset.view);
    });

    customerForm.addEventListener('submit', addCustomer);
    customerList.addEventListener('click', e => {
        if (e.target.classList.contains('delete-customer-btn')) deleteCustomer(e.target.dataset.id);
    });
    
    flowerForm.addEventListener('submit', addFlower);
    flowerList.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('delete-btn')) {
            deleteFlower(target.dataset.id);
            return;
        }
        
        const quantityControl = target.closest('.quantity-control');
        if (quantityControl && target.tagName === 'BUTTON') {
            const flowerId = quantityControl.dataset.id;
            const quantityInput = quantityControl.querySelector('.quantity-input');
            const quantity = parseInt(quantityInput.value, 10);
            if(isNaN(quantity) || quantity <= 0) {
                alert('Введите корректное количество.');
                return;
            }
            if (target.classList.contains('add-btn')) addFlowerQuantity(flowerId, quantity);
            else if (target.classList.contains('sell-btn')) sellFlowers(flowerId, quantity);
            quantityInput.value = '';
        }
    });

    // Initial load
    updateLoginView();
});