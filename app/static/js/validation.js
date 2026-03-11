/**
 * Модуль валидации форм
 */

/**
 * Правила валидации
 */
const validationRules = {
    required: (value) => {
        if (value === null || value === undefined || value === '') {
            return 'Это поле обязательно для заполнения';
        }
        return null;
    },
    
    minLength: (min) => (value) => {
        if (value && value.length < min) {
            return `Минимальная длина: ${min} символов`;
        }
        return null;
    },
    
    maxLength: (max) => (value) => {
        if (value && value.length > max) {
            return `Максимальная длина: ${max} символов`;
        }
        return null;
    },
    
    email: (value) => {
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return 'Введите корректный email';
        }
        return null;
    },
    
    phone: (value) => {
        if (value && !/^[\d\s\-+()]{7,20}$/.test(value)) {
            return 'Введите корректный номер телефона';
        }
        return null;
    },
    
    minValue: (min) => (value) => {
        if (value !== '' && Number(value) < min) {
            return `Минимальное значение: ${min}`;
        }
        return null;
    },
    
    maxValue: (max) => (value) => {
        if (value !== '' && Number(value) > max) {
            return `Максимальное значение: ${max}`;
        }
        return null;
    },
    
    positiveNumber: (value) => {
        if (value !== '' && (isNaN(Number(value)) || Number(value) <= 0)) {
            return 'Введите положительное число';
        }
        return null;
    },
    
    integer: (value) => {
        if (value !== '' && !Number.isInteger(Number(value))) {
            return 'Введите целое число';
        }
        return null;
    },
    
    match: (otherFieldId, fieldName) => (value) => {
        const otherField = document.getElementById(otherFieldId);
        if (otherField && value !== otherField.value) {
            return `Значение должно совпадать с полем "${fieldName}"`;
        }
        return null;
    },
    
    username: (value) => {
        if (value && !/^[a-zA-Z0-9_]{3,30}$/.test(value)) {
            return 'Логин должен содержать 3-30 символов (буквы, цифры, _)';
        }
        return null;
    },
    
    password: (value) => {
        if (value && value.length < 3) {
            return 'Пароль должен содержать минимум 3 символа';
        }
        return null;
    }
};

/**
 * Показать ошибку валидации для поля
 * @param {HTMLElement} field - Поле формы
 * @param {string} message - Сообщение об ошибке
 */
function showFieldError(field, message) {
    // Удаляем предыдущую ошибку
    clearFieldError(field);
    
    // Добавляем класс ошибки
    field.classList.add('field-error');
    
    // Создаём элемент с сообщением об ошибке
    const errorEl = document.createElement('span');
    errorEl.className = 'validation-error';
    errorEl.textContent = message;
    
    // Вставляем после поля
    field.parentNode.insertBefore(errorEl, field.nextSibling);
}

/**
 * Очистить ошибку валидации для поля
 * @param {HTMLElement} field - Поле формы
 */
function clearFieldError(field) {
    field.classList.remove('field-error');
    const errorEl = field.parentNode.querySelector('.validation-error');
    if (errorEl) {
        errorEl.remove();
    }
}

/**
 * Очистить все ошибки валидации в форме
 * @param {HTMLFormElement} form - Форма
 */
export function clearFormErrors(form) {
    form.querySelectorAll('.field-error').forEach(field => {
        field.classList.remove('field-error');
    });
    form.querySelectorAll('.validation-error').forEach(el => {
        el.remove();
    });
}

/**
 * Валидировать одно поле
 * @param {HTMLElement} field - Поле формы
 * @param {Array<Function>} rules - Массив правил валидации
 * @returns {boolean} - Прошло ли поле валидацию
 */
export function validateField(field, rules) {
    const value = field.value;
    
    for (const rule of rules) {
        const error = rule(value);
        if (error) {
            showFieldError(field, error);
            return false;
        }
    }
    
    clearFieldError(field);
    return true;
}

/**
 * Валидировать форму
 * @param {HTMLFormElement} form - Форма
 * @param {Object} fieldRules - Объект с правилами для каждого поля {fieldId: [rules]}
 * @returns {boolean} - Прошла ли форма валидацию
 */
export function validateForm(form, fieldRules) {
    clearFormErrors(form);
    let isValid = true;
    
    for (const [fieldId, rules] of Object.entries(fieldRules)) {
        const field = form.querySelector(`#${fieldId}`) || form.querySelector(`[name="${fieldId}"]`);
        if (field) {
            const fieldValid = validateField(field, rules);
            if (!fieldValid) {
                isValid = false;
            }
        }
    }
    
    return isValid;
}

/**
 * Настроить валидацию в реальном времени для формы
 * @param {HTMLFormElement} form - Форма
 * @param {Object} fieldRules - Объект с правилами для каждого поля
 */
export function setupLiveValidation(form, fieldRules) {
    for (const [fieldId, rules] of Object.entries(fieldRules)) {
        const field = form.querySelector(`#${fieldId}`) || form.querySelector(`[name="${fieldId}"]`);
        if (field) {
            field.addEventListener('blur', () => validateField(field, rules));
            field.addEventListener('input', () => {
                // Очищаем ошибку при вводе
                if (field.classList.contains('field-error')) {
                    clearFieldError(field);
                }
            });
        }
    }
}

// Экспорт правил для использования в других модулях
export const rules = validationRules;
