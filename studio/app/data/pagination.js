/**
 * Data Grid Bottom Pagination Footer for Drixio Studio
 * Matches modern developer database tools (e.g. Supabase Studio / DBeaver)
 * Left: [←] Page [ 1 ] of X [→] [ 50 rows ∨ ] X records
 * Right: [Columns 16/16]
 */

import { openDropdownPicker } from '../../components/dropdownPicker.js';

export function renderPaginationFooter({
   container,
   tableName,
   totalRecords = -1,
   currentCount = 0,
   onPageChange,
   onLimitChange,
}) {
   if (!container || !window.DataGrid) return;

   const limit = window.DataGrid.pagination?.limit || 50;
   const offset = window.DataGrid.pagination?.offset || 0;
   const currentPage = Math.max(1, Math.floor(offset / limit) + 1);

   let totalPages = 1;
   if (totalRecords >= 0) {
      totalPages = Math.max(1, Math.ceil(totalRecords / limit));
   } else if (window.DataGrid.pagination?.hasMore) {
      totalPages = currentPage + 1;
   } else {
      totalPages = currentPage;
   }

   const recordsText =
      totalRecords >= 0
         ? `${totalRecords.toLocaleString()} records`
         : `${currentCount.toLocaleString()} records`;

   const isPrevDisabled = currentPage <= 1;
   const isNextDisabled = currentPage >= totalPages;

   container.innerHTML = /* html */ `
     <div class="data-grid-footer" id="data-grid-footer-${tableName}">
       <div class="footer-left-group">
         <button
           type="button"
           class="pagination-nav-btn ${isPrevDisabled ? 'is-disabled' : ''}"
           id="pagination-prev-${tableName}"
           ${isPrevDisabled ? 'disabled' : ''}
           title="Previous page"
           aria-label="Previous page"
         >
           <span class="material-symbols-outlined icon-16">arrow_back</span>
         </button>

         <span class="pagination-text-label">Page</span>
         
         <input
           type="number"
           class="pagination-page-input"
           id="pagination-page-input-${tableName}"
           value="${currentPage}"
           min="1"
           max="${totalPages}"
           title="Jump to page (Press Enter)"
         />
         
         <span class="pagination-total-pages">of ${totalPages}</span>

         <button
           type="button"
           class="pagination-nav-btn ${isNextDisabled ? 'is-disabled' : ''}"
           id="pagination-next-${tableName}"
           ${isNextDisabled ? 'disabled' : ''}
           title="Next page"
           aria-label="Next page"
         >
           <span class="material-symbols-outlined icon-16">arrow_forward</span>
         </button>

         <div class="footer-divider"></div>

          <div class="footer-page-size-wrap">
            <button type="button" id="footer-btn-page-size-${tableName}" class="footer-btn" title="Select rows per page">
              <span>${limit} rows</span>
              <span class="material-symbols-outlined" style="font-size: 15px; color: var(--color-text-soft);">arrow_drop_down</span>
            </button>
          </div>

          <span class="footer-records-count" id="footer-records-count-${tableName}">
            ${recordsText}
          </span>
        </div>

        <div class="footer-right-group">
          <div id="col-visibility-mount-${tableName}" class="footer-col-visibility-mount"></div>
        </div>
      </div>
    `;

   // Event Bindings
   const prevBtn = document.getElementById(`pagination-prev-${tableName}`);
   if (prevBtn && !isPrevDisabled) {
      prevBtn.onclick = () => {
         onPageChange(currentPage - 1);
      };
   }

   const nextBtn = document.getElementById(`pagination-next-${tableName}`);
   if (nextBtn && !isNextDisabled) {
      nextBtn.onclick = () => {
         onPageChange(currentPage + 1);
      };
   }

   const pageInput = document.getElementById(`pagination-page-input-${tableName}`);
   if (pageInput) {
      const handleJump = () => {
         const target = parseInt(pageInput.value, 10);
         if (!isNaN(target) && target >= 1 && target <= totalPages && target !== currentPage) {
            onPageChange(target);
         } else {
            pageInput.value = String(currentPage);
         }
      };

      pageInput.onkeydown = (e) => {
         if (e.key === 'Enter') {
            e.preventDefault();
            handleJump();
         }
      };
      pageInput.onblur = handleJump;
   }

   const pageSizeBtn = document.getElementById(`footer-btn-page-size-${tableName}`);
   if (pageSizeBtn) {
      pageSizeBtn.onclick = (e) => {
         e.stopPropagation();
         openDropdownPicker({
            anchorEl: pageSizeBtn,
            searchable: false,
            width: 120,
            initialValue: String(limit),
            items: [
               { name: '25 rows', value: '25' },
               { name: '50 rows', value: '50' },
               { name: '100 rows', value: '100' },
               { name: '200 rows', value: '200' },
            ],
            onSelect: (val) => {
               const newLimit = parseInt(val, 10);
               if (newLimit && onLimitChange) {
                  onLimitChange(newLimit);
               }
            },
         });
      };
   }
}
