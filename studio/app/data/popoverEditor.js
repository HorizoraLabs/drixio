let activeEditor = null;

/**
 * Open a Supabase-style floating popover editor attached to the target cell.
 * Features:
 * - Direct multiline text editing for VARCHAR, TEXT, JSON, etc.
 * - Footer with [Enter] Save changes, [Esc] Cancel changes, and [Fullscreen] toggle
 * - Expands to centered modal overlay when fullscreen button is toggled
 * - Auto-saves on outside click or Enter
 *
 * @param {Object} options
 * @param {HTMLTableCellElement} options.td - The table cell being edited
 * @param {string} options.colName - Name of the column
 * @param {string} [options.colType] - Type of the column
 * @param {string} options.initialValue - Current text value
 * @param {(val: string) => void} options.onSave - Callback when changes are saved
 * @param {() => void} [options.onCancel] - Callback when changes are cancelled
 */
export function openSupabaseCellEditor({
   td,
   colName,
   colType = '',
   initialValue = '',
   onSave,
   onCancel,
}) {
   if (activeEditor) {
      activeEditor.close(true);
   }

   const backdrop = document.createElement('div');
   backdrop.className = 'supabase-editor-backdrop hidden';

   const popover = document.createElement('div');
   popover.className = 'supabase-cell-editor-popover';

   const textarea = document.createElement('textarea');
   textarea.className = 'supabase-editor-textarea';
   textarea.placeholder = 'Enter value...';
   textarea.value = initialValue;

   const footer = document.createElement('div');
   footer.className = 'supabase-editor-footer';

   const footerLeft = document.createElement('div');
   footerLeft.className = 'supabase-editor-footer-left';

   const saveBtn = document.createElement('button');
   saveBtn.type = 'button';
   saveBtn.className = 'supabase-editor-shortcut-btn btn-save';
   saveBtn.title = 'Save changes (Enter or Ctrl+Enter)';
   saveBtn.innerHTML = `
      <span class="supabase-kbd-badge">↵</span>
      <span>Save changes</span>
   `;

   const cancelBtn = document.createElement('button');
   cancelBtn.type = 'button';
   cancelBtn.className = 'supabase-editor-shortcut-btn btn-cancel';
   cancelBtn.title = 'Cancel changes (Esc)';
   cancelBtn.innerHTML = `
      <span class="supabase-kbd-badge">Esc</span>
      <span>Cancel changes</span>
   `;

   footerLeft.appendChild(saveBtn);
   footerLeft.appendChild(cancelBtn);

   const footerRight = document.createElement('div');
   footerRight.className = 'supabase-editor-footer-right';

   const expandBtn = document.createElement('button');
   expandBtn.type = 'button';
   expandBtn.className = 'supabase-editor-expand-btn';
   expandBtn.title = 'Toggle Fullscreen Editor';
   expandBtn.innerHTML = `<span class="material-symbols-outlined supabase-expand-icon">fullscreen</span>`;

   footerRight.appendChild(expandBtn);
   footer.appendChild(footerLeft);
   footer.appendChild(footerRight);

   popover.appendChild(textarea);
   popover.appendChild(footer);

   document.body.appendChild(backdrop);
   document.body.appendChild(popover);

   // Compute viewport-safe position relative to td
   const updatePosition = () => {
      if (isExpanded) return;
      const tdRect = td.getBoundingClientRect();
      const popoverWidth = Math.max(tdRect.width, 360);
      const popoverHeight = 240;
      const pad = 12;

      let top = tdRect.top;
      let left = tdRect.left;

      if (top + popoverHeight > window.innerHeight - pad) {
         top = Math.max(pad, window.innerHeight - popoverHeight - pad);
      }
      if (left + popoverWidth > window.innerWidth - pad) {
         left = Math.max(pad, window.innerWidth - popoverWidth - pad);
      }

      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.width = `${popoverWidth}px`;
      popover.style.height = `${popoverHeight}px`;
   };

   let isExpanded = false;
   let isClosed = false;

   updatePosition();

   const toggleExpand = () => {
      isExpanded = !isExpanded;
      if (isExpanded) {
         popover.classList.add('is-expanded');
         backdrop.classList.remove('hidden');
         expandBtn.innerHTML = `<span class="material-symbols-outlined supabase-expand-icon">fullscreen_exit</span>`;
         expandBtn.title = 'Collapse Editor';
      } else {
         popover.classList.remove('is-expanded');
         backdrop.classList.add('hidden');
         expandBtn.innerHTML = `<span class="material-symbols-outlined supabase-expand-icon">fullscreen</span>`;
         expandBtn.title = 'Toggle Fullscreen Editor';
         updatePosition();
      }
      textarea.focus();
   };

   expandBtn.onclick = (e) => {
      e.stopPropagation();
      toggleExpand();
   };

   backdrop.onclick = (e) => {
      e.stopPropagation();
      close(true);
   };

   const close = (save = false) => {
      if (isClosed) return;
      isClosed = true;
      document.removeEventListener('pointerdown', onOutsidePointer);
      window.removeEventListener('resize', updatePosition);
      popover.remove();
      backdrop.remove();
      activeEditor = null;

      if (save) {
         if (onSave) onSave(textarea.value);
      } else {
         if (onCancel) onCancel();
      }
   };

   const onOutsidePointer = (e) => {
      if (popover.contains(e.target)) return;
      close(true);
   };

   // Prevent immediate outside click triggered by double-click event propagation
   setTimeout(() => {
      if (!isClosed) {
         document.addEventListener('pointerdown', onOutsidePointer);
      }
   }, 80);

   window.addEventListener('resize', updatePosition);

   saveBtn.onclick = (e) => {
      e.stopPropagation();
      close(true);
   };

   cancelBtn.onclick = (e) => {
      e.stopPropagation();
      close(false);
   };

   textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
         // Enter saves changes
         e.preventDefault();
         close(true);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
         // Ctrl/Cmd + Enter saves changes
         e.preventDefault();
         close(true);
      } else if (e.key === 'Escape') {
         // Esc cancels changes
         e.preventDefault();
         close(false);
      } else if (e.key === 'Tab') {
         e.preventDefault();
         // Insert 2 spaces for tab indent inside multiline text
         const start = textarea.selectionStart;
         const end = textarea.selectionEnd;
         textarea.value =
            textarea.value.substring(0, start) +
            '  ' +
            textarea.value.substring(end);
         textarea.selectionStart = textarea.selectionEnd = start + 2;
      }
   });

   activeEditor = { close };

   requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
   });
}
