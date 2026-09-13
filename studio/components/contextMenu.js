let menuElement = null;
let activeItemIndex = -1;

function createMenuElement() {
   if (menuElement) return;
   menuElement = document.createElement('div');
   menuElement.className = 'drixio-context-menu';
   document.body.appendChild(menuElement);

   // Hide on outside click
   document.addEventListener('pointerdown', (e) => {
      if (
         menuElement.classList.contains('visible') &&
         !menuElement.contains(e.target)
      ) {
         hideContextMenu();
      }
   });

   // Keyboard navigation
   document.addEventListener('keydown', (e) => {
      if (!menuElement.classList.contains('visible')) return;

      if (e.key === 'Escape') {
         e.preventDefault();
         e.stopPropagation();
         hideContextMenu();
         return;
      }

      const itemEls = Array.from(
         menuElement.querySelectorAll(
            '.drixio-context-menu-item:not(.disabled)',
         ),
      );
      if (itemEls.length === 0) return;

      if (e.key === 'ArrowDown') {
         e.preventDefault();
         e.stopPropagation();
         activeItemIndex = (activeItemIndex + 1) % itemEls.length;
         updateItemFocus(itemEls);
      } else if (e.key === 'ArrowUp') {
         e.preventDefault();
         e.stopPropagation();
         activeItemIndex =
            (activeItemIndex - 1 + itemEls.length) % itemEls.length;
         updateItemFocus(itemEls);
      } else if (e.key === 'Enter') {
         if (activeItemIndex >= 0 && activeItemIndex < itemEls.length) {
            e.preventDefault();
            e.stopPropagation();
            itemEls[activeItemIndex].click();
         }
      }
   });

   // Hide on outside scroll
   window.addEventListener(
      'scroll',
      (e) => {
         if (menuElement.classList.contains('visible')) {
            if (!menuElement.contains(e.target)) {
               hideContextMenu();
            }
         }
      },
      true,
   );
}

function updateItemFocus(itemEls) {
   itemEls.forEach((el, idx) => {
      if (idx === activeItemIndex) {
         el.classList.add('focused');
         el.scrollIntoView({ block: 'nearest' });
      } else {
         el.classList.remove('focused');
      }
   });
}

export function showContextMenu(e, items) {
   if (e.preventDefault) e.preventDefault();
   if (e.stopPropagation) e.stopPropagation();

   createMenuElement();

   menuElement.innerHTML = '';
   menuElement.classList.remove('visible');
   activeItemIndex = -1;

   items.forEach((item) => {
      if (item.type === 'divider' || item === 'divider') {
         const divider = document.createElement('div');
         divider.className = 'drixio-context-menu-divider';
         menuElement.appendChild(divider);
         return;
      }

      const div = document.createElement('div');
      div.className = 'drixio-context-menu-item';
      if (item.danger) div.classList.add('danger');
      if (item.disabled) div.classList.add('disabled');

      const iconHtml = item.icon
         ? `<span class="material-symbols-outlined drixio-menu-icon">${item.icon}</span>`
         : '';
      const checkHtml = item.checked
         ? `<span class="material-symbols-outlined drixio-menu-check">check</span>`
         : '';
      const shortcutHtml = item.shortcut
         ? `<span class="drixio-menu-shortcut">${item.shortcut}</span>`
         : '';
      const descHtml = item.desc
         ? `<span class="drixio-menu-desc">${item.desc}</span>`
         : '';

      div.innerHTML = /* html */ `
         ${iconHtml}
         <div class="drixio-menu-content">
            <span class="drixio-menu-label">${item.label}</span>
            ${descHtml}
         </div>
         ${shortcutHtml}
         ${checkHtml}
      `;

      div.addEventListener('mouseenter', () => {
         const itemEls = Array.from(
            menuElement.querySelectorAll(
               '.drixio-context-menu-item:not(.disabled)',
            ),
         );
         activeItemIndex = itemEls.indexOf(div);
         updateItemFocus(itemEls);
      });

      div.addEventListener('click', (ev) => {
         if (item.disabled) return;
         ev.stopPropagation();
         hideContextMenu();
         if (item.action) item.action();
      });

      menuElement.appendChild(div);
   });

   // Position calculation with viewport padding
   requestAnimationFrame(() => {
      const rect = menuElement.getBoundingClientRect();
      let x = e.clientX ?? 0;
      let y = e.clientY ?? 0;
      let originX = 'left';
      let originY = 'top';

      const pad = 8;
      if (x + rect.width > window.innerWidth - pad) {
         x = Math.max(pad, window.innerWidth - rect.width - pad);
         originX = 'right';
      }
      if (y + rect.height > window.innerHeight - pad) {
         y = Math.max(pad, window.innerHeight - rect.height - pad);
         originY = 'bottom';
      }

      menuElement.style.transformOrigin = `${originY} ${originX}`;
      menuElement.style.left = `${x}px`;
      menuElement.style.top = `${y}px`;
      menuElement.classList.add('visible');
   });
}

export function hideContextMenu() {
   if (menuElement) {
      menuElement.classList.remove('visible');
      activeItemIndex = -1;
   }
}
