/**
 * Модуль управления клиентами в админ-панели
 */

import { apiFetch } from './api.js';

// DOM элементы
let customerList = null;
let customerForm = null;

/**
 * Инициализация модуля
 */
export function initCustomersModule() {
    customerList = document.getElementById('customer-list');
    customerForm = document.getElementById('customer-form');
    
    if (customerForm) {
        customerForm.addEventListener('submit', addCustomer);
    }
}

/**
 * Загрузить список клиентов
 * @param {Function} [onUnauthorized] - Callback при ошибке авторизации
 */
export async function fetchCustomers(onUnauthorized) {
    if (!customerList) return;
    
    try {
        const customers = await apiFetch('/users/', {}, onUnauthorized);
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
    } catch (error) {
        console.error("Failed to fetch customers:", error);
    }
}

/**
 * Добавить нового клиента
 * @param {Event} event
 */
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
    
    if (photoFile) {
        formData.append('photo', photoFile);
    }

    try {
        await apiFetch('/users/', { method: 'POST', body: formData });
        customerForm.reset();
        fetchCustomers();
    } catch (error) {
        console.error('Failed to add customer:', error);
        alert(`Ошибка: ${error.message}`);
    }
}

/**
 * Удалить клиента
 * @param {string|number} customerId
 * @param {Function} [onUnauthorized]
 */
export async function deleteCustomer(customerId, onUnauthorized) {
    if (!confirm('Вы уверены?')) return;
    
    try {
        await apiFetch(`/users/${customerId}`, { method: 'DELETE' }, onUnauthorized);
        fetchCustomers(onUnauthorized);
    } catch (error) {
        console.error('Failed to delete customer:', error);
    }
}
