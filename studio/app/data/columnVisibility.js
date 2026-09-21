/**
 * Column Visibility Manager for Drixio Studio Data Grid
 * Allows showing/hiding table columns with local storage persistence per table.
 * Uses the unified DropdownPicker popover component.
 */

import { openDropdownPicker } from '../../components/dropdownPicker.js';

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
     <div class="col-visibility-wrap">
        <button type="button" id="btn-col-visibility-${tableName}" class="footer-btn" title="Toggle column visibility">
          <span class="material-symbols-outlined" style="font-size: 15px; color: var(--color-primary);">view_column</span>
          <span>Columns</span>
          <span class="col-vis-badge" id="col-vis-badge-${tableName}">${visibleCount}/${totalCols}</span>
        </button>
     </div>
   `;

   const btn = document.getElementById(`btn-col-visibility-${tableName}`);
   const badgeEl = document.getElementById(`col-vis-badge-${tableName}`);

   const updateBadge = () => {
      if (badgeEl) {
         badgeEl.textContent = `${totalCols - hiddenSet.size}/${totalCols}`;
      }
   };

   // Initial application
   applyColumnVisibility(tableName, hiddenSet);

   btn.onclick = (e) => {
      e.stopPropagation();

      const items = schema.map((c) => ({
         name: c.name,
         value: c.name,
         badge: c.isPk ? 'PK' : (c.type || '').toLowerCase(),
         badgeClass: c.isPk ? 'col-vis-pk-tag' : 'col-vis-type-tag',
         checked: !hiddenSet.has(c.name),
         disabled: !!c.isPk,
      }));

      openDropdownPicker({
         anchorEl: btn,
         title: 'Display Columns',
         placeholder: 'Search columns...',
         searchable: true,
         multiple: true,
         width: 250,
         items,
         quickActions: [
            {
               label: 'Show All',
               onClick: (currentItems, rerender) => {
                  hiddenSet.clear();
                  saveHiddenColumns(tableName, hiddenSet);
                  applyColumnVisibility(tableName, hiddenSet);
                  updateBadge();
                  currentItems.forEach((it) => {
                     it.checked = true;
                  });
                  rerender();
                  if (onChanged) onChanged(hiddenSet);
               },
            },
            {
               label: 'Hide Non-PK',
               onClick: (currentItems, rerender) => {
                  schema.forEach((c) => {
                     if (!c.isPk) hiddenSet.add(c.name);
                  });
                  saveHiddenColumns(tableName, hiddenSet);
                  applyColumnVisibility(tableName, hiddenSet);
                  updateBadge();
                  currentItems.forEach((it) => {
                     const isPk = schema.find((s) => s.name === it.value)?.isPk;
                     it.checked = !!isPk;
                  });
                  rerender();
                  if (onChanged) onChanged(hiddenSet);
               },
            },
         ],
         onToggle: (itemObj, isChecked) => {
            const col = itemObj.value;
            if (isChecked) {
               hiddenSet.delete(col);
            } else {
               hiddenSet.add(col);
            }
            saveHiddenColumns(tableName, hiddenSet);
            applyColumnVisibility(tableName, hiddenSet);
            updateBadge();
            if (onChanged) onChanged(hiddenSet);
         },
      });
   };
}
