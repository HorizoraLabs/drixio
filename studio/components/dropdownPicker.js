/**
 * Global Reusable Searchable Dropdown Picker Popover Component
 * Provides searchable, categorized option selection with keyboard navigation
 */

let activeDropdownPicker = null;

export function openDropdownPicker({
   anchorEl,
   title = '',
   placeholder = 'Search...',
   items = [],
   initialValue = '',
   onSelect,
   onCancel,
   width = 320,
   maxHeight = 260,
   searchable = true,
   allowCustom = false,
   emptyText = 'No matching options found',
}) {
   closeDropdownPicker();

   // Normalize items array
   const normalizedItems = items.map((it) => {
      if (typeof it === 'string' || typeof it === 'number') {
         return { name: String(it), value: String(it), desc: '', icon: '' };
      }
      return {
         name: String(it.name ?? it.value ?? ''),
         value:
            it.value !== undefined ? String(it.value) : String(it.name ?? ''),
         desc: it.desc ? String(it.desc) : '',
         icon: it.icon || '',
         badge: it.badge || '',
         badgeClass: it.badgeClass || '',
         group: it.group || '',
      };
   });

   const popover = document.createElement('div');
   popover.className = 'dropdown-picker-popover';
   if (width)
      popover.style.width = typeof width === 'number' ? `${width}px` : width;

   popover.innerHTML = /* html */ `
      ${
         searchable
            ? `
      <div class="dropdown-picker-search-wrap">
         <span class="material-symbols-outlined dropdown-picker-search-icon">search</span>
         <input 
            type="text" 
            class="dropdown-picker-search-input" 
            placeholder="${placeholder}" 
            autocomplete="off" 
            spellcheck="false"
         />
      </div>`
            : ''
      }
      <div class="dropdown-picker-list-wrap" style="max-height: ${maxHeight}px;"></div>
   `;

   document.body.appendChild(popover);

   const searchInput = popover.querySelector('.dropdown-picker-search-input');
   const listWrap = popover.querySelector('.dropdown-picker-list-wrap');

   let activeIndex = -1;
   let flatMatching = [];

   const escapeHtml = (str) =>
      String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;');

   const highlightMatch = (text, q) => {
      if (!q) return escapeHtml(text);
      const lower = text.toLowerCase();
      const idx = lower.indexOf(q.toLowerCase());
      if (idx === -1) return escapeHtml(text);
      const before = escapeHtml(text.slice(0, idx));
      const match = escapeHtml(text.slice(idx, idx + q.length));
      const after = escapeHtml(text.slice(idx + q.length));
      return `${before}<mark class="dropdown-picker-mark">${match}</mark>${after}`;
   };

   const renderList = (filter = '') => {
      const q = filter.trim().toLowerCase();
      flatMatching = normalizedItems.filter(
         (it) =>
            it.name.toLowerCase().includes(q) ||
            it.value.toLowerCase().includes(q) ||
            it.desc.toLowerCase().includes(q),
      );

      if (flatMatching.length === 0) {
         if (allowCustom && q) {
            flatMatching = [
               {
                  name: filter.trim(),
                  value: filter.trim(),
                  desc: 'Use custom value',
                  icon: 'add',
               },
            ];
         } else {
            listWrap.innerHTML = /* html */ `
               <div class="dropdown-picker-empty">
                  <span>${emptyText}</span>
               </div>
            `;
            activeIndex = -1;
            return;
         }
      }

      // Compute active item index
      if (
         activeIndex === -1 &&
         initialValue !== undefined &&
         initialValue !== null
      ) {
         const cleanInit = String(initialValue).trim().toLowerCase();
         const foundIdx = flatMatching.findIndex(
            (it) =>
               it.value.toLowerCase() === cleanInit ||
               it.name.toLowerCase() === cleanInit,
         );
         activeIndex = foundIdx !== -1 ? foundIdx : 0;
      } else if (activeIndex === -1 || activeIndex >= flatMatching.length) {
         activeIndex = 0;
      }

      let html = '';
      if (title) {
         html += `<div class="dropdown-picker-section-header">${escapeHtml(title)}</div>`;
      }

      let lastGroup = '';
      flatMatching.forEach((it, idx) => {
         if (it.group && it.group !== lastGroup) {
            lastGroup = it.group;
            html += `<div class="dropdown-picker-section-header">${escapeHtml(it.group)}</div>`;
         }

         const isActive = idx === activeIndex;
         let iconHtml = '';
         if (it.icon) {
            iconHtml =
               it.icon.length <= 3
                  ? `<span class="dropdown-picker-code-icon">${escapeHtml(it.icon)}</span>`
                  : `<span class="material-symbols-outlined dropdown-picker-material-icon">${escapeHtml(it.icon)}</span>`;
         }

         let badgeHtml = '';
         if (it.badge) {
            badgeHtml = `<span class="dropdown-picker-item-badge ${it.badgeClass || ''}">${escapeHtml(it.badge)}</span>`;
         }

         let descHtml = '';
         if (it.desc) {
            descHtml = `<span class="dropdown-picker-item-desc">${highlightMatch(it.desc, q)}</span>`;
         }

         html += /* html */ `
            <div class="dropdown-picker-item ${isActive ? 'active' : ''}" data-index="${idx}">
               <div class="dropdown-picker-item-left">
                  ${iconHtml}
                  <span class="dropdown-picker-item-name">${highlightMatch(it.name, q)}</span>
               </div>
               <div class="dropdown-picker-item-right">
                  ${descHtml}
                  ${badgeHtml}
               </div>
            </div>
         `;
      });

      listWrap.innerHTML = html;

      listWrap.querySelectorAll('.dropdown-picker-item').forEach((itemEl) => {
         itemEl.addEventListener('mouseenter', () => {
            activeIndex = parseInt(itemEl.dataset.index, 10);
            updateActiveItem();
         });

         itemEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const idx = parseInt(itemEl.dataset.index, 10);
            if (flatMatching[idx]) {
               selectItem(flatMatching[idx]);
            }
         });
      });

      scrollActiveIntoView();
   };

   const updateActiveItem = () => {
      const itemsEl = listWrap.querySelectorAll('.dropdown-picker-item');
      itemsEl.forEach((it, i) => {
         if (i === activeIndex) {
            it.classList.add('active');
         } else {
            it.classList.remove('active');
         }
      });
   };

   const scrollActiveIntoView = () => {
      const activeEl = listWrap.querySelector('.dropdown-picker-item.active');
      if (activeEl) {
         activeEl.scrollIntoView({ block: 'nearest' });
      }
   };

   const selectItem = (itemObj) => {
      closeDropdownPicker();
      if (onSelect) onSelect(itemObj.value, itemObj);
   };

   // Position calculation with viewport bounds checking
   const positionPopover = () => {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = width && typeof width === 'number' ? width : 320;
      const popoverHeight =
         maxHeight + (searchable ? 50 : 0) + (title ? 30 : 0);
      const pad = 8;

      let top = rect.bottom + 4;
      let left = rect.left;

      if (top + popoverHeight > window.innerHeight - pad) {
         top = Math.max(pad, rect.top - popoverHeight - 4);
      }

      if (left + popoverWidth > window.innerWidth - pad) {
         left = Math.max(pad, window.innerWidth - popoverWidth - pad);
      }

      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
   };

   positionPopover();
   renderList();

   // Event listeners
   if (searchInput) {
      searchInput.focus();

      searchInput.addEventListener('input', (e) => {
         renderList(e.target.value);
      });

      searchInput.addEventListener('keydown', (e) => {
         if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (flatMatching.length > 0) {
               activeIndex = (activeIndex + 1) % flatMatching.length;
               updateActiveItem();
               scrollActiveIntoView();
            }
         } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (flatMatching.length > 0) {
               activeIndex =
                  (activeIndex - 1 + flatMatching.length) % flatMatching.length;
               updateActiveItem();
               scrollActiveIntoView();
            }
         } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && flatMatching[activeIndex]) {
               selectItem(flatMatching[activeIndex]);
            } else if (allowCustom && searchInput.value.trim()) {
               selectItem({
                  value: searchInput.value.trim(),
                  name: searchInput.value.trim(),
               });
            }
         } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDropdownPicker();
            if (onCancel) onCancel();
         }
      });
   } else {
      popover.tabIndex = -1;
      popover.focus();
      popover.addEventListener('keydown', (e) => {
         if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (flatMatching.length > 0) {
               activeIndex = (activeIndex + 1) % flatMatching.length;
               updateActiveItem();
               scrollActiveIntoView();
            }
         } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (flatMatching.length > 0) {
               activeIndex =
                  (activeIndex - 1 + flatMatching.length) % flatMatching.length;
               updateActiveItem();
               scrollActiveIntoView();
            }
         } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && flatMatching[activeIndex]) {
               selectItem(flatMatching[activeIndex]);
            }
         } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDropdownPicker();
            if (onCancel) onCancel();
         }
      });
   }

   const onDocClick = (e) => {
      if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
         closeDropdownPicker();
         if (onCancel) onCancel();
      }
   };

   setTimeout(() => {
      document.addEventListener('click', onDocClick);
   }, 50);

   activeDropdownPicker = {
      popover,
      cleanup: () => {
         document.removeEventListener('click', onDocClick);
         if (popover.parentNode) popover.remove();
         activeDropdownPicker = null;
      },
   };
}

export function closeDropdownPicker() {
   if (activeDropdownPicker) {
      activeDropdownPicker.cleanup();
   }
}
