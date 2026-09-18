/**
 * Cell Drawer / Inspector for Drixio Studio Data Grid
 * Provides a slide-over panel for editing and inspecting large text, Markdown, and JSON values.
 */

import { updateCell } from './core.js';

let drawerEl = null;
let currentCellTarget = null;
let currentColSchema = null;

function getOrCreateDrawer() {
   if (drawerEl) return drawerEl;

   drawerEl = document.createElement('div');
   drawerEl.id = 'cell-drawer-overlay';
   drawerEl.className = 'cell-drawer-overlay hidden';

   drawerEl.innerHTML = /* html */ `
     <div class="cell-drawer-backdrop" id="cell-drawer-backdrop"></div>
     <div class="cell-drawer-panel" id="cell-drawer-panel">
       <div class="cell-drawer-header">
         <div class="cell-drawer-title-group">
           <div class="flex items-center gap-2">
             <span class="material-symbols-outlined text-primary icon-20" id="cell-drawer-type-icon">code</span>
             <h3 class="cell-drawer-title" id="cell-drawer-col-title">Column Inspector</h3>
           </div>
           <div class="cell-drawer-meta" id="cell-drawer-meta">
             <span class="cell-drawer-type-badge" id="cell-drawer-type-badge">TEXT</span>
             <span class="cell-drawer-row-badge" id="cell-drawer-row-badge">Row #0</span>
           </div>
         </div>
         <button type="button" class="modal-close-btn" id="cell-drawer-close-btn" title="Close Drawer (Esc)">
           <span class="material-symbols-outlined">close</span>
         </button>
       </div>

       <!-- Toolbar Actions -->
       <div class="cell-drawer-toolbar">
         <div class="flex items-center gap-2" id="cell-drawer-json-tools">
           <button type="button" class="cell-drawer-tool-btn" id="btn-drawer-prettify" title="Format JSON">
             <span class="material-symbols-outlined icon-14">auto_fix_high</span>
             <span>Prettify</span>
           </button>
           <button type="button" class="cell-drawer-tool-btn" id="btn-drawer-minify" title="Minify JSON">
             <span class="material-symbols-outlined icon-14">compress</span>
             <span>Minify</span>
           </button>
           <span class="json-valid-badge" id="json-valid-badge">Valid JSON</span>
         </div>
         <div class="flex items-center gap-2 ml-auto">
           <button type="button" class="cell-drawer-tool-btn" id="btn-drawer-wrap" title="Toggle Word Wrap">
             <span class="material-symbols-outlined icon-14">wrap_text</span>
             <span id="btn-drawer-wrap-text">Wrap: ON</span>
           </button>
           <button type="button" class="cell-drawer-tool-btn" id="btn-drawer-copy" title="Copy to clipboard">
             <span class="material-symbols-outlined icon-14">content_copy</span>
             <span>Copy</span>
           </button>
         </div>
       </div>

       <!-- Content Editor Area -->
       <div class="cell-drawer-body">
         <textarea id="cell-drawer-textarea" class="cell-drawer-textarea font-mono" spellcheck="false" autocomplete="off"></textarea>
       </div>

       <!-- Footer Stats & Actions -->
       <div class="cell-drawer-footer">
         <div class="cell-drawer-stats text-12 text-secondary" id="cell-drawer-stats">
           0 characters &middot; 0 lines
         </div>
         <div class="flex items-center gap-2">
           <button type="button" class="btn-secondary" id="btn-drawer-cancel">Cancel</button>
           <button type="button" class="btn-primary flex items-center gap-1.5" id="btn-drawer-apply">
             <span class="material-symbols-outlined icon-16">check</span>
             <span>Apply to Cell</span>
           </button>
         </div>
       </div>
     </div>
   `;

   document.body.appendChild(drawerEl);

   const closeBtn = document.getElementById('cell-drawer-close-btn');
   const cancelBtn = document.getElementById('btn-drawer-cancel');
   const backdrop = document.getElementById('cell-drawer-backdrop');
   const applyBtn = document.getElementById('btn-drawer-apply');
   const prettifyBtn = document.getElementById('btn-drawer-prettify');
   const minifyBtn = document.getElementById('btn-drawer-minify');
   const copyBtn = document.getElementById('btn-drawer-copy');
   const wrapBtn = document.getElementById('btn-drawer-wrap');
   const wrapText = document.getElementById('btn-drawer-wrap-text');
   const textarea = document.getElementById('cell-drawer-textarea');

   const closeFn = () => {
      drawerEl.classList.add('hidden');
      currentCellTarget = null;
      currentColSchema = null;
   };

   closeBtn.onclick = closeFn;
   cancelBtn.onclick = closeFn;
   backdrop.onclick = closeFn;

   document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawerEl.classList.contains('hidden')) {
         closeFn();
      }
   });

   let isWrapped = true;
   wrapBtn.onclick = () => {
      isWrapped = !isWrapped;
      textarea.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
      wrapText.textContent = isWrapped ? 'Wrap: ON' : 'Wrap: OFF';
   };

   copyBtn.onclick = async () => {
      try {
         await navigator.clipboard.writeText(textarea.value);
         window.showToast?.('Copied content to clipboard', 'success');
      } catch {
         window.showToast?.('Failed to copy', 'error');
      }
   };

   prettifyBtn.onclick = () => {
      try {
         const parsed = JSON.parse(textarea.value);
         textarea.value = JSON.stringify(parsed, null, 2);
         updateStatsAndValidation();
      } catch (e) {
         window.showToast?.('Cannot prettify invalid JSON: ' + e.message, 'warning');
      }
   };

   minifyBtn.onclick = () => {
      try {
         const parsed = JSON.parse(textarea.value);
         textarea.value = JSON.stringify(parsed);
         updateStatsAndValidation();
      } catch (e) {
         window.showToast?.('Cannot minify invalid JSON: ' + e.message, 'warning');
      }
   };

   textarea.oninput = () => {
      updateStatsAndValidation();
   };

   applyBtn.onclick = () => {
      if (window.AppState?.isReadOnly) {
         window.showToast?.('Database is in Read-Only protection mode.', 'warning');
         return;
      }
      if (!currentCellTarget) return;

      const newVal = textarea.value;
      const columns = window.DataGrid?.columns || [];
      if (window.DataGrid) window.DataGrid.currentTransaction = [];
      updateCell(currentCellTarget, newVal, columns, true);
      if (window.DataGrid?.currentTransaction?.length > 0) {
         window.DataGrid.history.push(window.DataGrid.currentTransaction);
      }
      if (window.DataGrid) window.DataGrid.currentTransaction = null;
      window.updateSidebarDirtyState?.();
      window.showToast?.('Cell updated', 'success');
      closeFn();
   };

   return drawerEl;
}

function updateStatsAndValidation() {
   const textarea = document.getElementById('cell-drawer-textarea');
   const statsEl = document.getElementById('cell-drawer-stats');
   const badgeEl = document.getElementById('json-valid-badge');
   if (!textarea) return;

   const text = textarea.value;
   const charCount = text.length;
   const lineCount = text ? text.split('\n').length : 0;
   const byteSize = new Blob([text]).size;

   if (statsEl) {
      statsEl.textContent = `${charCount.toLocaleString()} chars · ${lineCount.toLocaleString()} lines · ${byteSize.toLocaleString()} bytes`;
   }

   if (badgeEl) {
      const trimmed = text.trim();
      const looksLikeJson =
         (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));

      if (!looksLikeJson && trimmed !== '') {
         badgeEl.style.display = 'none';
      } else {
         badgeEl.style.display = 'inline-flex';
         try {
            JSON.parse(text);
            badgeEl.textContent = 'Valid JSON';
            badgeEl.className = 'json-valid-badge is-valid';
         } catch {
            badgeEl.textContent = 'Invalid JSON';
            badgeEl.className = 'json-valid-badge is-invalid';
         }
      }
   }
}

export function openCellDrawer(td, colSchema) {
   const drawer = getOrCreateDrawer();
   currentCellTarget = td;
   currentColSchema = colSchema;

   const colName = td.dataset.col || 'Cell';
   const rowIndex = td.dataset.rowIdx !== undefined ? td.dataset.rowIdx : 0;
   const typeUpper = (colSchema?.type || 'TEXT').toUpperCase();

   let rawVal = '';
   const pk = td.dataset.pk;
   const insertIdx = td.dataset.insertIndex;
   const pendingVal =
      insertIdx !== undefined
         ? window.DataGrid?.pendingInserts?.[parseInt(insertIdx, 10)]?.[colName]
         : pk !== undefined
           ? window.DataGrid?.pendingEdits?.[pk]?.[colName]
           : undefined;

   if (pendingVal !== undefined) {
      rawVal = String(pendingVal);
   } else if (td.dataset.original !== undefined) {
      rawVal = td.dataset.original;
   } else {
      rawVal = td.textContent === 'null' ? '' : td.textContent;
   }

   document.getElementById('cell-drawer-col-title').textContent = colName;
   document.getElementById('cell-drawer-type-badge').textContent = typeUpper;
   document.getElementById('cell-drawer-row-badge').textContent = `Row #${parseInt(rowIndex, 10) + 1}`;

   const typeIcon = document.getElementById('cell-drawer-type-icon');
   const isJson =
      typeUpper.includes('JSON') ||
      rawVal.trim().startsWith('{') ||
      rawVal.trim().startsWith('[');
   if (typeIcon) {
      typeIcon.textContent = isJson ? 'data_object' : 'notes';
   }

   const jsonTools = document.getElementById('cell-drawer-json-tools');
   if (jsonTools) {
      jsonTools.style.display = isJson ? 'flex' : 'none';
   }

   const textarea = document.getElementById('cell-drawer-textarea');
   if (textarea) {
      if (isJson) {
         try {
            const parsed = JSON.parse(rawVal);
            textarea.value = JSON.stringify(parsed, null, 2);
         } catch {
            textarea.value = rawVal;
         }
      } else {
         textarea.value = rawVal;
      }
   }

   const applyBtn = document.getElementById('btn-drawer-apply');
   if (applyBtn) {
      if (window.AppState?.isReadOnly) {
         applyBtn.disabled = true;
         applyBtn.innerHTML =
            '<span class="material-symbols-outlined icon-16">lock</span><span>Read-Only Mode</span>';
      } else {
         applyBtn.disabled = false;
         applyBtn.innerHTML =
            '<span class="material-symbols-outlined icon-16">check</span><span>Apply to Cell</span>';
      }
   }

   updateStatsAndValidation();
   drawer.classList.remove('hidden');
   setTimeout(() => textarea?.focus(), 80);
}

