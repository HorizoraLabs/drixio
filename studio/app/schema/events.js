import { updateSchemaCell } from './core.js';
import { openIndexModal, openPkFkModal, openEnumModal } from './modals.js';
import { STANDARD_DATA_TYPES } from '../../lib/dataTypes.js';

export function bindSchemaCellEditor(tableContainer, columns) {
   tableContainer.addEventListener('click', (e) => {
      const manageCell = e.target.closest('.manage-indexes-cell');
      if (manageCell) {
         openIndexModal();
         return;
      }
      const enumBadge = e.target.closest('.badge-enum');
      if (enumBadge) {
         const td = enumBadge.closest('td.data-cell');
         if (td) {
            const origColName = td.dataset.pk;
            const colSchema = window.SchemaGrid?.schema?.find(
               (c) => c.name === origColName,
            );
            openEnumModal(td, colSchema);
            return;
         }
      }
   });

   tableContainer.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td.data-cell');
      if (!td || td.querySelector('input, select')) return;

      const colKey = td.dataset.colKey;
      const isNewRow = td.dataset.insertIndex !== undefined;

      const rawText =
         isNewRow ||
         td.textContent === '-' ||
         td.textContent === '+ New' ||
         td.textContent.includes('Add column') ||
         td.textContent === '+ Add Row' ||
         td.textContent === 'null'
            ? ''
            : td.textContent.trim().startsWith('Yes')
              ? '1'
              : td.textContent.trim() === 'No'
                ? ''
                : td.textContent;

      let inputEl;
      if (colKey === 'isPk') {
         openPkFkModal(td, td.textContent);
         return;
      } else if (colKey === 'nullable') {
         const origColName = td.dataset.pk;
         const colSchema = window.SchemaGrid?.schema?.find(
            (c) => c.name === origColName,
         );
         const pendingPk = window.SchemaGrid?.pendingEdits?.[origColName]?.isPk;
         const isPk =
            pendingPk !== undefined
               ? typeof pendingPk === 'string'
                  ? pendingPk.includes('PK') || pendingPk.includes('PFK')
                  : !!pendingPk
               : colSchema
                 ? colSchema.isPk
                 : false;
         const newRowPkVal =
            isNewRow &&
            window.SchemaGrid?.pendingInserts?.[
               parseInt(td.dataset.insertIndex, 10)
            ]?.isPk;
         const newRowPk =
            typeof newRowPkVal === 'string'
               ? newRowPkVal.includes('PK') || newRowPkVal.includes('PFK')
               : !!newRowPkVal;

         if (isPk || newRowPk) {
            if (window.showToast) {
               window.showToast('Primary Key cannot be nullable.', 'error');
            } else {
               alert('Primary Key cannot be nullable.');
            }
            return;
         }

         inputEl = document.createElement('select');
         const opts = ['No', 'Yes'];
         opts.forEach((opt) => {
            const op = document.createElement('option');
            op.value = opt;
            op.textContent = opt;
            if (
               (opt === 'Yes' && rawText === '1') ||
               (opt === 'No' && rawText === '')
            )
               op.selected = true;
            inputEl.appendChild(op);
         });
      } else if (colKey === 'isUnique') {
         const origColName = td.dataset.pk;
         const colSchema = window.SchemaGrid?.schema?.find(
            (c) => c.name === origColName,
         );
         const pendingPk = window.SchemaGrid?.pendingEdits?.[origColName]?.isPk;
         const isPk =
            pendingPk !== undefined
               ? typeof pendingPk === 'string'
                  ? pendingPk.includes('PK') || pendingPk.includes('PFK')
                  : !!pendingPk
               : colSchema
                 ? colSchema.isPk
                 : false;
         const newRowPkVal =
            isNewRow &&
            window.SchemaGrid?.pendingInserts?.[
               parseInt(td.dataset.insertIndex, 10)
            ]?.isPk;
         const newRowPk =
            typeof newRowPkVal === 'string'
               ? newRowPkVal.includes('PK') || newRowPkVal.includes('PFK')
               : !!newRowPkVal;

         if (isPk || newRowPk) {
            if (window.showToast) {
               window.showToast(
                  'Primary Key is always unique and locked.',
                  'error',
               );
            } else {
               alert('Primary Key is always unique and locked.');
            }
            return;
         }

         inputEl = document.createElement('select');
         const opts = ['No', 'Yes'];
         opts.forEach((opt) => {
            const op = document.createElement('option');
            op.value = opt;
            op.textContent = opt;
            if (
               (opt === 'Yes' && rawText === '1') ||
               (opt === 'No' && rawText === '')
            )
               op.selected = true;
            inputEl.appendChild(op);
         });
      } else if (colKey === 'type') {
         const origColName = td.dataset.pk;
         const colSchema = window.SchemaGrid?.schema?.find(
            (c) => c.name === origColName,
         );
         inputEl = document.createElement('select');
         const opts = [...STANDARD_DATA_TYPES];
         if (
            rawText &&
            !opts.some((o) => o.toUpperCase() === rawText.toUpperCase())
         ) {
            opts.unshift(rawText);
         }
         opts.forEach((opt) => {
            const op = document.createElement('option');
            op.value = opt;
            op.textContent = opt === 'ENUM' ? 'ENUM (Configure...)' : opt;
            if (opt.toUpperCase() === rawText.toUpperCase()) op.selected = true;
            inputEl.appendChild(op);
         });

         inputEl.addEventListener('change', (ev) => {
            if (ev.target.value === 'ENUM') {
               inputEl.blur();
               setTimeout(() => openEnumModal(td, colSchema), 10);
            }
         });
      } else {
         inputEl = document.createElement('input');
         inputEl.type = 'text';
         inputEl.value = rawText;
      }

      td.innerHTML = '';
      td.appendChild(inputEl);
      inputEl.style.width = '100%';

      inputEl.addEventListener('keydown', (e2) => {
         if (e2.key === 'Enter') inputEl.blur();
         if (e2.key === 'Tab') {
            e2.preventDefault();
            inputEl.blur();
            document.body.dispatchEvent(
               new KeyboardEvent('keydown', {
                  key: 'Tab',
                  shiftKey: e2.shiftKey,
                  bubbles: true,
               }),
            );
         }
      });

      inputEl.focus();

      const commitEdit = () => {
         let newVal = inputEl.value;
         if (colKey === 'type' && newVal === 'ENUM') {
            return;
         }

         window.SchemaGrid.currentTransaction = [];
         updateSchemaCell(td, newVal, columns);
         if (window.SchemaGrid.currentTransaction.length > 0)
            window.SchemaGrid.history.push(
               window.SchemaGrid.currentTransaction,
            );
         window.SchemaGrid.currentTransaction = null;
      };

      inputEl.addEventListener('blur', () => {
         commitEdit();
      });
   });
}
