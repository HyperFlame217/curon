/**
 * ModalManager Singleton
 * Manages a queue of modals to prevent overlapping UI elements.
 */
const ModalManager = (function() {
  let _queue = [];
  let _current = null;
  let _prevFocus = null;

  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  return {
    /**
     * Enqueue a modal to be shown.
     * @param {string} id - The DOM ID of the modal element.
     * @param {Object} options - Configuration for the modal.
     * @param {Function} options.onOpen - Callback when modal opens.
     * @param {Function} options.onClose - Callback when modal closes.
     */
    open(id, options = {}) {
      if (_current === id) return; // Already open

      if (_current) {
        console.log(`[ModalManager] Enqueuing modal: ${id}`);
        _queue.push({ id, options });
        return;
      }

      this._doOpen(id, options);
    },

    /**
     * Internal open logic
     */
    _doOpen(id, options) {
      _current = id;
      _prevFocus = document.activeElement;
      const el = document.getElementById(id);
      if (!el) {
        console.error(`[ModalManager] Modal element not found: ${id}`);
        this.close(id);
        return;
      }

      console.log(`[ModalManager] Opening modal: ${id}`);
      el.classList.add('show');

      const focusable = [...el.querySelectorAll(FOCUSABLE)];
      if (focusable.length) focusable[0].focus();

      const trapHandler = (e) => {
        if (e.key !== 'Tab' || _current !== id) return;
        const panel = document.getElementById(id);
        if (!panel) return;
        const focusableNow = [...panel.querySelectorAll(FOCUSABLE)];
        if (!focusableNow.length) { e.preventDefault(); return; }
        const first = focusableNow[0];
        const last = focusableNow[focusableNow.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', trapHandler);
      el._trapHandler = trapHandler;

      if (typeof options.onOpen === 'function') options.onOpen();
    },

    /**
     * Close the current modal and trigger the next one in queue.
     * @param {string} id - The DOM ID of the modal to close.
     */
    close(id) {
      if (_current !== id) {
        // If it's in queue, remove it
        _queue = _queue.filter(m => m.id !== id);
        return;
      }

      const el = document.getElementById(id);
      if (el) {
        if (el._trapHandler) document.removeEventListener('keydown', el._trapHandler);
        el.classList.remove('show');
      }

      console.log(`[ModalManager] Closed modal: ${id}`);
      _current = null;
      if (_prevFocus && _prevFocus.focus) _prevFocus.focus();

      if (_queue.length > 0) {
        const next = _queue.shift();
        setTimeout(() => this._doOpen(next.id, next.options), 150);
      }
    },

    /**
     * Check if a specific modal is currently open.
     * @param {string} id
     * @returns {boolean}
     */
    isOpen(id) {
      return _current === id;
    },

    /**
     * Get the ID of the currently open modal.
     * @returns {string|null}
     */
    getCurrent() {
      return _current;
    }
  };
})();

// Global alias
window.MODAL = ModalManager;
