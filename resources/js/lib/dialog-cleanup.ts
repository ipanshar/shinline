/**
 * Утилита для принудительной очистки следов от Radix UI Dialog
 * Исправляет проблему с aria-hidden и заблокированным pointer-events
 */

export function cleanupDialogArtifacts() {
    // Сброс pointer-events на body
    document.body.style.pointerEvents = '';
    document.body.style.overflow = '';
    
    // Удаление атрибута блокировки скролла
    document.body.removeAttribute('data-scroll-locked');
    
    // Удаление aria-hidden со всех элементов кроме скриптов и стилей
    const hiddenElements = document.querySelectorAll('[aria-hidden="true"]');
    hiddenElements.forEach(el => {
        if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
            el.removeAttribute('aria-hidden');
        }
    });
    
    // Удаление data-aria-hidden
    const dataHiddenElements = document.querySelectorAll('[data-aria-hidden="true"]');
    dataHiddenElements.forEach(el => {
        el.removeAttribute('data-aria-hidden');
    });
    
    // Убираем inert атрибут
    const inertElements = document.querySelectorAll('[inert]');
    inertElements.forEach(el => {
        el.removeAttribute('inert');
    });
    
    // Убираем pointer-events: none со всех элементов
    document.querySelectorAll('[style*="pointer-events"]').forEach(el => {
        if (el instanceof HTMLElement) {
            el.style.pointerEvents = '';
        }
    });
}

/**
 * Хук для использования с диалогами - вызывать при закрытии
 */
export function useDialogCleanup() {
    return () => {
        // Небольшая задержка для завершения анимации закрытия
        requestAnimationFrame(() => {
            setTimeout(cleanupDialogArtifacts, 100);
        });
    };
}
