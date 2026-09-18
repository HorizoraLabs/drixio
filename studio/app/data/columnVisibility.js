/**
 * Column Visibility Manager for Drixio Studio Data Grid
 * Allows showing/hiding table columns with local storage persistence per table.
 */

const STORAGE_PREFIX = 'drixio_col_vis_';

export function getHiddenColumns(tableName) {
   try {
      const raw = localStorage.getItem(STORAGE_PREFIX + tableName);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
   } catch {
      return new Set();
   }
}

export function saveHiddenColumns(tableName, hiddenSet) {
   try {
      const arr = Array.from(hiddenSet);
      localStorage.setItem(STORAGE_PREFIX + tableName, JSON.stringify(arr));
   } catch {}
}

export function applyColumnVisibility(tableName, hiddenSet) {
   const tableEl = document.getElementById(`data-grid-table-${tableName}`);
   if (!tableEl) return;

   // Hide or show THs
   tableEl.querySelectorAll('th[data-col]').forEach((th) => {
      const col = th.dataset.col;
      th.style.display = hiddenSet.has(col) ? 'none' : '';
   });

   // Hide or show TDs
   tableEl.querySelectorAll('td[data-col]').forEach((td) => {
      const col = td.dataset.col;
      td.style.display = hiddenSet.has(col) ? 'none' : '';
   });
}

export function renderColumnVisibilityButton({
   container,
   tableName,
   schema,
   onChanged,
}) {
   if (!container) return;

   const hiddenSet = getHiddenColumns(tableName);
   const totalCols = schema.length;
   const visibleCount = totalCols - hiddenSet.size;

   container.innerHTML = /* html */ `
     <div class="col-visibility-wrap relative" style="position: relative;">
       <button type="button" id="btn-col-visibility-${tableName}" class="col-visibility-btn" title="Toggle column visibility">
         <span class="material-symbols-outlined" style="font-size: 15px;">view_column</span>
         <span>Columns</span>
         <span class="col-vis-badge" id="col-vis-badge-${tableName}">${visibleCount}/${totalCols}</span>
       </button>
       <div id="col-vis-dropdown-${tableName}" class="col-vis-dropdown hidden" role="menu">
         <div class="col-vis-header">
           <input type="text" id="col-vis-search-${tableName}" placeholder="Search columns..." class="col-vis-search-input" autocomplete="off" spellcheck="false" />
           <div class="col-vis-quick-actions">
             <button type="button" id="btn-col-vis-show-all-${tableName}" class="col-vis-action-link">Show All</button>
             <span class="col-vis-divider">&middot;</span>
             <button type="button" id="btn-col-vis-hide-all-${tableName}" class="col-vis-action-link">Hide Non-PK</button>
           </div>
         </div>
         <div class="col-vis-list" id="col-vis-list-${tableName}"></div>
       </div>
     </div>
   `;

   const btn = document.getElementById(`btn-col-visibility-${tableName}`);
   const dropdown = document.getElementById(`col-vis-dropdown-${tableName}`);
   const searchInput = document.getElementById(`col-vis-search-${tableName}`);
   const listEl = document.getElementById(`col-vis-list-${tableName}`);
   const showAllBtn = document.getElementById(`btn-col-vis-show-all-${tableName}`);
   const hideAllBtn = document.getElementById(`btn-col-vis-hide-all-${tableName}`);
   const badgeEl = document.getElementById(`col-vis-badge-${tableName}`);

   const updateBadge = () => {
      if (badgeEl) {
         badgeEl.textContent = `${totalCols - hiddenSet.size}/${totalCols}`;
      }
   };

   const renderList = (filterText = '') => {
      const q = filterText.toLowerCase().trim();
      const filtered = schema.filter((c) => !q || c.name.toLowerCase().includes(q));

      listEl.innerHTML = filtered
         .map((c) => {
            const isPk = !!c.isPk;
            const isChecked = !hiddenSet.has(c.name);
            const safeName = String(c.name)
               .replace(/&/g, '&amp;')
               .replace(/"/g, '&quot;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
            return `
           <label class="col-vis-item ${isPk ? 'is-pk' : ''}">
             <input type="checkbox" data-col="${safeName}" ${isChecked ? 'checked' : ''} ${isPk ? 'disabled' : ''} />
             <span class="col-vis-col-name">${safeName}</span>
             ${isPk ? '<span class="col-vis-pk-tag">PK</span>' : `<span class="col-vis-type-tag">${(c.type || '').toLowerCase()}</span>`}
           </label>
         `;
         })
         .join('');

      listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
         cb.onchange = (e) => {
            const col = e.target.dataset.col;
            if (e.target.checked) {
               hiddenSet.delete(col);
            } else {
               hiddenSet.add(col);
            }
            saveHiddenColumns(tableName, hiddenSet);
            applyColumnVisibility(tableName, hiddenSet);
            updateBadge();
            if (onChanged) onChanged(hiddenSet);
         };
      });
   };

   renderList();
   applyColumnVisibility(tableName, hiddenSet);

   // Toggle dropdown
   btn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('hidden');
      document.querySelectorAll('.col-vis-dropdown').forEach((d) => d.classList.add('hidden'));
      if (isOpen) {
         dropdown.classList.remove('hidden');
         renderList(searchInput ? searchInput.value : '');
         setTimeout(() => searchInput?.focus(), 50);
      }
   };

   searchInput.oninput = (e) => {
      renderList(e.target.value);
   };

   showAllBtn.onclick = (e) => {
      e.stopPropagation();
      hiddenSet.clear();
      saveHiddenColumns(tableName, hiddenSet);
      renderList(searchInput.value);
      applyColumnVisibility(tableName, hiddenSet);
      updateBadge();
      if (onChanged) onChanged(hiddenSet);
   };

   hideAllBtn.onclick = (e) => {
      e.stopPropagation();
      schema.forEach((c) => {
         if (!c.isPk) hiddenSet.add(c.name);
      });
      saveHiddenColumns(tableName, hiddenSet);
      renderList(searchInput.value);
      applyColumnVisibility(tableName, hiddenSet);
      updateBadge();
      if (onChanged) onChanged(hiddenSet);
   };

   const closeDropdown = (e) => {
      if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
         dropdown.classList.add('hidden');
      }
   };
   document.addEventListener('click', closeDropdown);
}

