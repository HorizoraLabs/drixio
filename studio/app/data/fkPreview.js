import { executeRawQuery } from '../../lib/api.js';

let popoverEl = null;
let hoverTimer = null;
let closeTimer = null;
let currentTargetCell = null;

function getOrCreatePopover() {
   if (popoverEl) return popoverEl;

   popoverEl = document.createElement('div');
   popoverEl.id = 'fk-preview-popover';
   popoverEl.className = 'fk-preview-popover hidden';
   document.body.appendChild(popoverEl);

   // Keep open when mouse enters popover
   popoverEl.addEventListener('mouseenter', () => {
      if (closeTimer) {
         clearTimeout(closeTimer);
         closeTimer = null;
      }
   });

   // Close when mouse leaves popover (unless returning to cell)
   popoverEl.addEventListener('mouseleave', (e) => {
      if (
         e.relatedTarget &&
         currentTargetCell &&
         currentTargetCell.contains(e.relatedTarget)
      ) {
         return;
      }
      closePopover();
   });

   // Close on escape key
   document.addEventListener('keydown', (e) => {
      if (
         e.key === 'Escape' &&
         popoverEl &&
         !popoverEl.classList.contains('hidden')
      ) {
         closePopover();
      }
   });

   // Close on scroll outside popover
   window.addEventListener(
      'scroll',
      (e) => {
         if (popoverEl && !popoverEl.classList.contains('hidden')) {
            if (!popoverEl.contains(e.target)) {
               closePopover();
            }
         }
      },
      true,
   );

   return popoverEl;
}

export function closePopover() {
   if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
   }
   if (popoverEl) {
      popoverEl.classList.add('hidden');
   }
   currentTargetCell = null;
}

export function jumpToForeignKey(
   targetTable,
   targetCol,
   targetVal,
   sourceTable,
) {
   closePopover();

   // Save navigation history so user can jump back
   window.fkNavHistory = {
      fromTable: sourceTable,
      toTable: targetTable,
      timestamp: Date.now(),
   };

   // Format where clause
   const isNumeric = /^-?\d+(\.\d+)?$/.test(targetVal);
   const formattedVal = isNumeric
      ? targetVal
      : `'${targetVal.replace(/'/g, "''")}'`;
   const whereClause = `"${targetCol}" = ${formattedVal}`;

   // Find sidebar button for target table
   const targetBtn =
      document.querySelector(`.table-btn[data-table="${targetTable}"]`) ||
      Array.from(document.querySelectorAll('.table-btn')).find((b) => {
         const name =
            b.dataset.table || b.querySelector('span')?.textContent.trim();
         return name === targetTable;
      });

   window.AppState.currentTable = targetTable;
   window.AppState.currentTableBtnElement = targetBtn || null;
   window.AppState.currentTab = 'data-btn';

   document
      .querySelectorAll('.table-btn')
      .forEach((b) => b.classList.remove('active'));
   if (targetBtn) targetBtn.classList.add('active');

   // Force re-render of target view container with whereClause
   const viewId = `view-data-btn-${targetTable}`;
   const container = document.getElementById(viewId);
   if (container) container.innerHTML = '';

   window.renderCurrentView(whereClause);
   if (window.showToast) {
      window.showToast(`Jumped to ${targetTable} (${whereClause})`, 'info');
   }
}

export function bindFkPreview(tableContainer, currentTableName) {
   const popover = getOrCreatePopover();

   // Handle direct click on Jump button
   tableContainer.addEventListener('click', (e) => {
      const jumpBtn = e.target.closest('.fk-jump-btn');
      if (!jumpBtn) return;

      e.stopPropagation();
      const targetTable = jumpBtn.dataset.fkTable;
      const targetCol = jumpBtn.dataset.fkCol;
      const targetVal = jumpBtn.dataset.fkVal;

      if (targetTable && targetCol && targetVal !== undefined) {
         jumpToForeignKey(targetTable, targetCol, targetVal, currentTableName);
      }
   });

   // Handle hover on FK cell
   tableContainer.addEventListener('mouseover', (e) => {
      const cell = e.target.closest('.is-fk-cell');
      if (!cell) return;

      if (closeTimer) {
         clearTimeout(closeTimer);
         closeTimer = null;
      }

      if (currentTargetCell === cell) return;
      currentTargetCell = cell;

      if (hoverTimer) clearTimeout(hoverTimer);

      hoverTimer = setTimeout(async () => {
         const targetTable = cell.dataset.fkTable;
         const targetCol = cell.dataset.fkCol;
         const targetVal = cell.dataset.original;

         if (
            !targetTable ||
            !targetCol ||
            targetVal === undefined ||
            targetVal === 'null'
         ) {
            return;
         }

         // Initial loading popover
         popover.innerHTML = `
        <div class="fk-popover-header">
          <div class="fk-popover-title">
            <span class="material-symbols-outlined icon-16" style="color: var(--color-primary);">table_chart</span>
            <span class="fk-popover-table">${targetTable}</span>
            <span class="fk-popover-badge">FK &rarr; ${targetCol}</span>
          </div>
        </div>
        <div class="fk-popover-body">
          <div class="fk-popover-loading">
            <span class="material-symbols-outlined animate-spin icon-16">progress_activity</span>
            <span>Loading relation...</span>
          </div>
        </div>
      `;

         positionPopover(cell, popover);
         popover.classList.remove('hidden');

         // Fetch related row
         const isNumeric = /^-?\d+(\.\d+)?$/.test(targetVal);
         const formattedVal = isNumeric
            ? targetVal
            : `'${targetVal.replace(/'/g, "''")}'`;
         const sql = `SELECT * FROM "${targetTable}" WHERE "${targetCol}" = ${formattedVal} LIMIT 1`;

         try {
            const res = await executeRawQuery(sql);
            if (currentTargetCell !== cell) return; // User already moved away

            if (
               res.success &&
               res.data &&
               res.data.rows &&
               res.data.rows.length > 0
            ) {
               const row = res.data.rows[0];
               const keys = Object.keys(row).slice(0, 7); // Display up to top 7 fields

               let fieldsHtml = '';
               keys.forEach((k) => {
                  let v = row[k];
                  if (v === null || v === undefined) v = 'null';
                  else if (typeof v === 'object') v = JSON.stringify(v);
                  else v = String(v);

                  fieldsHtml += `
              <div class="fk-field-row">
                <span class="fk-field-name">${k}</span>
                <span class="fk-field-value ${v === 'null' ? 'is-null' : ''}" title="${v.replace(/"/g, '&quot;')}">${v}</span>
              </div>
            `;
               });

               popover.innerHTML = `
            <div class="fk-popover-header">
              <div class="fk-popover-title">
                <span class="material-symbols-outlined icon-16" style="color: var(--color-primary);">table_chart</span>
                <span class="fk-popover-table">${targetTable}</span>
                <span class="fk-popover-badge">${targetCol} = ${targetVal}</span>
              </div>
              <button type="button" class="fk-popover-jump-btn" id="btn-fk-popover-jump">
                <span>Jump</span>
                <span class="material-symbols-outlined icon-14">arrow_forward</span>
              </button>
            </div>
            <div class="fk-popover-body">
              <div class="fk-fields-list">${fieldsHtml}</div>
            </div>
            <div class="fk-popover-footer">
              <span class="material-symbols-outlined icon-14">touch_app</span>
              <span>Click to inspect full record</span>
            </div>
          `;

               // Bind click to jump on header button and whole popover
               popover
                  .querySelector('#btn-fk-popover-jump')
                  ?.addEventListener('click', (ev) => {
                     ev.stopPropagation();
                     jumpToForeignKey(
                        targetTable,
                        targetCol,
                        targetVal,
                        currentTableName,
                     );
                  });

               popover.onclick = () => {
                  jumpToForeignKey(
                     targetTable,
                     targetCol,
                     targetVal,
                     currentTableName,
                  );
               };

               positionPopover(cell, popover);
            } else {
               popover.innerHTML = `
            <div class="fk-popover-header">
              <div class="fk-popover-title">
                <span class="material-symbols-outlined icon-16" style="color: var(--color-primary);">table_chart</span>
                <span class="fk-popover-table">${targetTable}</span>
              </div>
            </div>
            <div class="fk-popover-body">
              <div class="fk-popover-empty">
                <span class="material-symbols-outlined icon-18">error_outline</span>
                <span>No matching row found for ${targetCol} = ${targetVal}</span>
              </div>
            </div>
          `;
               positionPopover(cell, popover);
            }
         } catch (err) {
            if (currentTargetCell !== cell) return;
            popover.innerHTML = `
          <div class="fk-popover-body">
            <div class="fk-popover-empty">
              <span>Failed to fetch preview: ${err.message}</span>
            </div>
          </div>
        `;
            positionPopover(cell, popover);
         }
      }, 250);
   });

   tableContainer.addEventListener('mouseout', (e) => {
      const cell = e.target.closest('.is-fk-cell');
      if (!cell) return;

      // If moving inside the same cell, or moving directly into popover, don't close!
      if (
         e.relatedTarget &&
         (cell.contains(e.relatedTarget) ||
            (popover && popover.contains(e.relatedTarget)))
      ) {
         return;
      }

      if (hoverTimer) {
         clearTimeout(hoverTimer);
         hoverTimer = null;
      }

      closeTimer = setTimeout(() => {
         closePopover();
      }, 350);
   });
}

function positionPopover(targetEl, popover) {
   const rect = targetEl.getBoundingClientRect();
   const popoverRect = popover.getBoundingClientRect();

   // Position below cell with 2px gap (seamlessly bridged by ::before)
   let top = rect.bottom + 2;
   let left = rect.left;

   // If overflows bottom of window, flip to top
   if (top + popoverRect.height > window.innerHeight - 10) {
      top = Math.max(10, rect.top - popoverRect.height - 2);
   }

   // If overflows right of window, shift left
   if (left + popoverRect.width > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - popoverRect.width - 10);
   }

   popover.style.top = `${top}px`;
   popover.style.left = `${left}px`;
}
