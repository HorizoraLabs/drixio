/**
 * Standard Global Modal Component for Drixio Studio
 *
 * Provides consistent DOM structure, theme adaptability, keyboard accessibility,
 * and unified backdrop/header/body/footer lifecycle management.
 */

/**
 * Creates and mounts a standardized modal instance.
 *
 * @param {Object} options
 * @param {string} [options.id] - Optional DOM ID for the overlay
 * @param {string} [options.className] - Additional class name(s) for the modal container
 * @param {string} [options.icon] - Material Symbols icon name (e.g. 'help', 'keyboard', 'bookmark')
 * @param {string} [options.iconColor] - 'primary' | 'warning' | 'error' | 'success' | custom CSS color
 * @param {string} options.title - Modal title text
 * @param {string} [options.subtitle] - Optional subtitle or description text below title
 * @param {string} [options.badge] - Optional status badge text next to title
 * @param {string} [options.badgeColor] - Optional badge style
 * @param {string} [options.width='520px'] - Modal width (e.g. '480px', '640px', '800px')
 * @param {string} [options.maxWidth='92vw'] - Modal maximum width
 * @param {string|HTMLElement} [options.body] - Body HTML string or HTMLElement
 * @param {string|HTMLElement} [options.footer] - Optional footer HTML string or HTMLElement
 * @param {boolean} [options.showCloseBtn=true] - Whether to show the top-right close button
 * @param {boolean} [options.closeOnEsc=true] - Whether pressing Esc closes the modal
 * @param {boolean} [options.closeOnBackdrop=true] - Whether clicking overlay backdrop closes the modal
 * @param {Function} [options.onClose] - Callback when modal is closed
 * @param {Function} [options.onOpen] - Callback when modal is opened
 * @returns {Object} Modal control instance
 */
export function createModal(options = {}) {
   const {
      id = `modal-${Date.now()}`,
      className = '',
      icon = '',
      iconColor = 'primary',
      title = '',
      subtitle = '',
      badge = '',
      width = '520px',
      maxWidth = '92vw',
      body = '',
      footer = null,
      showCloseBtn = true,
      closeOnEsc = true,
      closeOnBackdrop = true,
      onClose = null,
      onOpen = null,
   } = options;

   // Destroy any existing modal with the same ID
   const existing = document.getElementById(id);
   if (existing) existing.remove();

   const overlay = document.createElement('div');
   overlay.id = id;
   overlay.className = 'modal-overlay';

   const isPredefinedColor = [
      'primary',
      'warning',
      'error',
      'success',
   ].includes(iconColor);
   const iconBadgeClass = isPredefinedColor
      ? `modal-icon-badge ${iconColor}`
      : 'modal-icon-badge';
   const iconCustomStyle =
      !isPredefinedColor && iconColor ? `color: ${iconColor};` : '';

   overlay.innerHTML = /* html */ `
    <div class="modal-container ${className}" style="width: ${width}; max-width: ${maxWidth};">
      <div class="modal-header">
        <div class="modal-title-wrap">
          ${
             icon
                ? `<div class="${iconBadgeClass}" style="${iconCustomStyle}">
                     <span class="material-symbols-outlined">${icon}</span>
                   </div>`
                : ''
          }
          <div class="modal-title-col">
            <div class="modal-title-row">
              <h3 class="modal-title-text">${title}</h3>
              ${badge ? `<span class="modal-title-badge">${badge}</span>` : ''}
            </div>
            ${subtitle ? `<p class="modal-subtitle-text">${subtitle}</p>` : ''}
          </div>
        </div>
        ${
           showCloseBtn
              ? `<button type="button" class="modal-close-btn" title="Close (Esc)" aria-label="Close modal">
                   <span class="material-symbols-outlined">close</span>
                 </button>`
              : ''
        }
      </div>
      <div class="modal-body"></div>
      ${footer ? `<div class="modal-footer"></div>` : ''}
    </div>
  `;

   const container = overlay.querySelector('.modal-container');
   const header = overlay.querySelector('.modal-header');
   const bodyEl = overlay.querySelector('.modal-body');
   const footerEl = overlay.querySelector('.modal-footer');
   const closeBtn = overlay.querySelector('.modal-close-btn');

   // Populate body
   if (bodyEl) {
      if (typeof body === 'string') {
         bodyEl.innerHTML = body;
      } else if (body instanceof HTMLElement) {
         bodyEl.appendChild(body);
      }
   }

   // Populate footer
   if (footerEl && footer) {
      if (typeof footer === 'string') {
         footerEl.innerHTML = footer;
      } else if (footer instanceof HTMLElement) {
         footerEl.appendChild(footer);
      }
   }

   let isClosed = false;

   const close = () => {
      if (isClosed) return;
      isClosed = true;
      window.removeEventListener('keydown', handleKeydown);
      overlay.remove();
      if (typeof onClose === 'function') {
         onClose();
      }
   };

   const handleKeydown = (e) => {
      if (closeOnEsc && e.key === 'Escape') {
         e.preventDefault();
         close();
      }
   };

   if (closeBtn) {
      closeBtn.onclick = (e) => {
         e.stopPropagation();
         close();
      };
   }

   if (closeOnBackdrop) {
      overlay.onclick = (e) => {
         if (e.target === overlay) {
            close();
         }
      };
   }

   window.addEventListener('keydown', handleKeydown);

   document.body.appendChild(overlay);

   if (typeof onOpen === 'function') {
      onOpen(overlay);
   }

   return {
      overlay,
      container,
      header,
      body: bodyEl,
      footer: footerEl,
      close,
      destroy: close,
      setTitle: (newTitle) => {
         const t = header.querySelector('.modal-title-text');
         if (t) t.textContent = newTitle;
      },
      setSubtitle: (newSub) => {
         let s = header.querySelector('.modal-subtitle-text');
         if (!s && newSub) {
            const col = header.querySelector('.modal-title-col');
            if (col) {
               s = document.createElement('p');
               s.className = 'modal-subtitle-text';
               col.appendChild(s);
            }
         }
         if (s) s.textContent = newSub;
      },
   };
}
