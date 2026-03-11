/**
 * Модуль для управления индикаторами загрузки
 */

/**
 * Создать спиннер
 * @param {string} [size=''] - Размер спиннера ('lg' для большого)
 * @returns {HTMLElement}
 */
export function createSpinner(size = '') {
    const spinner = document.createElement('div');
    spinner.className = 'spinner' + (size ? ` spinner-${size}` : '');
    return spinner;
}

/**
 * Показать спиннер в контейнере
 * @param {HTMLElement} container - Контейнер
 * @param {string} [size='lg'] - Размер спиннера
 */
export function showContainerSpinner(container, size = 'lg') {
    container.innerHTML = '';
    const spinnerContainer = document.createElement('div');
    spinnerContainer.className = 'spinner-container';
    spinnerContainer.appendChild(createSpinner(size));
    container.appendChild(spinnerContainer);
}

/**
 * Показать оверлей загрузки поверх элемента
 * @param {HTMLElement} element - Элемент
 * @returns {HTMLElement} - Созданный оверлей
 */
export function showLoadingOverlay(element) {
    // Убеждаемся, что у элемента position: relative
    const position = getComputedStyle(element).position;
    if (position === 'static') {
        element.style.position = 'relative';
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.appendChild(createSpinner('lg'));
    element.appendChild(overlay);
    
    return overlay;
}

/**
 * Скрыть оверлей загрузки
 * @param {HTMLElement} overlay - Оверлей
 */
export function hideLoadingOverlay(overlay) {
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
}

/**
 * Установить состояние загрузки для кнопки
 * @param {HTMLButtonElement} button - Кнопка
 * @param {boolean} isLoading - Состояние загрузки
 */
export function setButtonLoading(button, isLoading) {
    if (isLoading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

/**
 * Обёртка для асинхронной функции с автоматическим спиннером на кнопке
 * @param {HTMLButtonElement} button - Кнопка
 * @param {Function} asyncFn - Асинхронная функция
 * @returns {Promise}
 */
export async function withButtonLoading(button, asyncFn) {
    setButtonLoading(button, true);
    try {
        return await asyncFn();
    } finally {
        setButtonLoading(button, false);
    }
}

/**
 * Обёртка для асинхронной функции с оверлеем на контейнере
 * @param {HTMLElement} container - Контейнер
 * @param {Function} asyncFn - Асинхронная функция
 * @returns {Promise}
 */
export async function withContainerLoading(container, asyncFn) {
    const overlay = showLoadingOverlay(container);
    try {
        return await asyncFn();
    } finally {
        hideLoadingOverlay(overlay);
    }
}
