/**
 * Supabase-style Data Type Picker Popover Component
 * Provides a searchable, categorized database data type selector
 */

export const TYPE_CATALOG = [
   {
      category: 'POSTGRES DATA TYPES',
      types: [
         { name: 'int2', value: 'int2', desc: 'Signed two-byte integer (smallint)', icon: '#' },
         { name: 'int4', value: 'int4', desc: 'Signed four-byte integer (integer)', icon: '#' },
         { name: 'int8', value: 'int8', desc: 'Signed eight-byte integer (bigint)', icon: '#' },
         { name: 'float4', value: 'float4', desc: 'Single precision floating-point number (4 bytes)', icon: '#' },
         { name: 'float8', value: 'float8', desc: 'Double precision floating-point number (8 bytes)', icon: '#' },
         { name: 'numeric', value: 'numeric', desc: 'Exact numeric of selectable precision', icon: '#' },
         { name: 'json', value: 'json', desc: 'Textual JSON data', icon: '{ }' },
         { name: 'jsonb', value: 'jsonb', desc: 'Binary JSON data, decomposed', icon: '{ }' },
         { name: 'text', value: 'text', desc: 'Variable-length character string', icon: 'abc' },
         { name: 'varchar(255)', value: 'varchar(255)', desc: 'Variable-length character string with limit', icon: 'abc' },
         { name: 'uuid', value: 'uuid', desc: 'Universally unique identifier', icon: 'key' },
         { name: 'date', value: 'date', desc: 'Calendar date (year, month, day)', icon: 'schedule' },
         { name: 'time', value: 'time', desc: 'Time of day without time zone', icon: 'schedule' },
         { name: 'timetz', value: 'timetz', desc: 'Time of day including time zone', icon: 'schedule' },
         { name: 'timestamp', value: 'timestamp', desc: 'Date and time without time zone', icon: 'schedule' },
         { name: 'timestamptz', value: 'timestamptz', desc: 'Date and time with time zone', icon: 'schedule' },
         { name: 'bool', value: 'boolean', desc: 'Logical boolean (true/false)', icon: 'toggle_on' },
         { name: 'bytea', value: 'bytea', desc: 'Binary data ("byte array")', icon: 'data_array' },
         { name: 'ENUM', value: 'ENUM', desc: 'User-defined enumeration values', icon: 'list' },
      ],
   },
];

let activePicker = null;

export function openTypePicker({ anchorEl, initialValue = '', onSelect, onCancel }) {
   closeTypePicker();

   const popover = document.createElement('div');
   popover.className = 'type-picker-popover';
   popover.innerHTML = /* html */ `
      <div class="type-picker-search-wrap">
         <span class="material-symbols-outlined type-picker-search-icon">search</span>
         <input 
            type="text" 
            class="type-picker-search-input" 
            placeholder="Search types..." 
            autocomplete="off" 
            spellcheck="false"
         />
      </div>
      <div class="type-picker-list-wrap"></div>
   `;

   document.body.appendChild(popover);

   const searchInput = popover.querySelector('.type-picker-search-input');
   const listWrap = popover.querySelector('.type-picker-list-wrap');

   let activeIndex = -1;
   let flatMatchingTypes = [];

   const allTypes = [];
   TYPE_CATALOG.forEach((cat) => {
      cat.types.forEach((t) => allTypes.push(t));
   });

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
      return `${before}<mark class="type-picker-mark">${match}</mark>${after}`;
   };

   const renderList = (filter = '') => {
      const q = filter.trim().toLowerCase();
      flatMatchingTypes = allTypes.filter(
         (t) =>
            t.name.toLowerCase().includes(q) ||
            t.desc.toLowerCase().includes(q) ||
            t.value.toLowerCase().includes(q),
      );

      if (flatMatchingTypes.length === 0) {
         listWrap.innerHTML = /* html */ `
            <div class="type-picker-empty">
               <span>No matching data types found</span>
            </div>
         `;
         activeIndex = -1;
         return;
      }

      // Default active index to initial value or first item
      if (activeIndex === -1 && initialValue) {
         const cleanInit = initialValue.trim().toUpperCase();
         const foundIdx = flatMatchingTypes.findIndex(
            (t) =>
               t.value.toUpperCase() === cleanInit ||
               t.name.toUpperCase() === cleanInit ||
               (cleanInit === 'INTEGER' && t.name === 'int4') ||
               (cleanInit === 'INT' && t.name === 'int4') ||
               (cleanInit === 'BIGINT' && t.name === 'int8') ||
               (cleanInit === 'SMALLINT' && t.name === 'int2') ||
               (cleanInit.startsWith('VARCHAR') && t.name.startsWith('varchar')) ||
               (cleanInit === 'BOOLEAN' && (t.name === 'bool' || t.value === 'boolean')),
         );
         activeIndex = foundIdx !== -1 ? foundIdx : 0;
      } else if (activeIndex === -1 || activeIndex >= flatMatchingTypes.length) {
         activeIndex = 0;
      }

      let html = `<div class="type-picker-section-header">POSTGRES DATA TYPES</div>`;

      flatMatchingTypes.forEach((t, idx) => {
         const isActive = idx === activeIndex;
         const iconContent =
            t.icon.length <= 3
               ? `<span class="type-picker-code-icon">${t.icon}</span>`
               : `<span class="material-symbols-outlined type-picker-material-icon">${t.icon}</span>`;

         html += /* html */ `
            <div class="type-picker-item ${isActive ? 'active' : ''}" data-index="${idx}" data-val="${t.value}">
               <div class="type-picker-item-left">
                  ${iconContent}
                  <span class="type-picker-item-name">${highlightMatch(t.name, q)}</span>
               </div>
               <span class="type-picker-item-desc">${highlightMatch(t.desc, q)}</span>
            </div>
         `;
      });

      listWrap.innerHTML = html;

      listWrap.querySelectorAll('.type-picker-item').forEach((itemEl) => {
         itemEl.addEventListener('mouseenter', () => {
            activeIndex = parseInt(itemEl.dataset.index, 10);
            updateActiveItem();
         });

         itemEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            selectType(itemEl.dataset.val);
         });
      });

      scrollActiveIntoView();
   };

   const updateActiveItem = () => {
      const items = listWrap.querySelectorAll('.type-picker-item');
      items.forEach((it, i) => {
         if (i === activeIndex) {
            it.classList.add('active');
         } else {
            it.classList.remove('active');
         }
      });
   };

   const scrollActiveIntoView = () => {
      const activeEl = listWrap.querySelector('.type-picker-item.active');
      if (activeEl) {
         activeEl.scrollIntoView({ block: 'nearest' });
      }
   };

   const selectType = (typeVal) => {
      closeTypePicker();
      if (onSelect) onSelect(typeVal);
   };

   // Position calculation
   const positionPopover = () => {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 380;
      const popoverHeight = 320;
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
   searchInput.focus();

   searchInput.addEventListener('input', (e) => {
      renderList(e.target.value);
   });

   searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
         e.preventDefault();
         if (flatMatchingTypes.length > 0) {
            activeIndex = (activeIndex + 1) % flatMatchingTypes.length;
            updateActiveItem();
            scrollActiveIntoView();
         }
      } else if (e.key === 'ArrowUp') {
         e.preventDefault();
         if (flatMatchingTypes.length > 0) {
            activeIndex = (activeIndex - 1 + flatMatchingTypes.length) % flatMatchingTypes.length;
            updateActiveItem();
            scrollActiveIntoView();
         }
      } else if (e.key === 'Enter') {
         e.preventDefault();
         if (activeIndex >= 0 && flatMatchingTypes[activeIndex]) {
            selectType(flatMatchingTypes[activeIndex].value);
         }
      } else if (e.key === 'Escape') {
         e.preventDefault();
         closeTypePicker();
         if (onCancel) onCancel();
      }
   });

   const onDocClick = (e) => {
      if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
         closeTypePicker();
         if (onCancel) onCancel();
      }
   };

   setTimeout(() => {
      document.addEventListener('click', onDocClick);
   }, 50);

   activePicker = {
      popover,
      cleanup: () => {
         document.removeEventListener('click', onDocClick);
         if (popover.parentNode) popover.remove();
         activePicker = null;
      },
   };
}

export function closeTypePicker() {
   if (activePicker) {
      activePicker.cleanup();
   }
}
