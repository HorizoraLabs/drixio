import { updateSchemaCell } from './core.js';
import { openIndexModal, openPkFkModal, openEnumModal } from './modals.js';
import { openTypePicker } from '../../components/typePicker.js';
import { openSupabaseCellEditor } from '../data/popoverEditor.js';
import { openDropdownPicker } from '../../components/dropdownPicker.js';

export function bindSchemaCellEditor(tableContainer, columns) {
   tableContainer.addEventListener('click', (e) => {
      const manageBtn =
         e.target.closest('.btn-manage-indexes') ||
         e.target.closest('.manage-indexes-cell');
      if (manageBtn) {
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
      if (!td || td.querySelector('input, select, textarea')) return;

      const colKey = td.dataset.colKey;
      if (colKey === 'indexing') {
         openIndexModal();
         return;
      }
      const isNewRow = td.dataset.insertIndex !== undefined;

      const rawText =
         isNewRow ||
         td.textContent === '-' ||
         td.textContent === '+ New' ||
         td.textContent.includes('Add column') ||
         td.textContent.includes('Add Column') ||
         td.textContent === '+ Add Row' ||
         td.textContent === 'null'
            ? ''
            : td.dataset.original !== undefined && td.dataset.original !== '-'
              ? td.dataset.original
              : td.textContent.trim().startsWith('Yes')
                ? '1'
                : td.textContent.trim() === 'No'
                  ? ''
                  : td.textContent.trim();

      if (colKey === 'name' || colKey === 'defaultValue') {
         openSupabaseCellEditor({
            td,
            colName: colKey === 'name' ? 'Column Name' : 'Default Value',
            colType: colKey === 'name' ? 'VARCHAR' : 'DEFAULT',
            initialValue: rawText,
            onSave: (newVal) => {
               window.SchemaGrid.currentTransaction = [];
               updateSchemaCell(td, newVal, columns);
               if (window.SchemaGrid.currentTransaction.length > 0)
                  window.SchemaGrid.history.push(
                     window.SchemaGrid.currentTransaction,
                  );
               window.SchemaGrid.currentTransaction = null;
            },
         });
         return;
      }

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

         openDropdownPicker({
            anchorEl: td,
            title: 'Nullable Constraint',
            placeholder: 'Search constraint...',
            items: [
               {
                  name: 'No',
                  value: 'No',
                  desc: 'NOT NULL constraint (Cannot be empty)',
                  icon: 'lock',
               },
               {
                  name: 'Yes',
                  value: 'Yes',
                  desc: 'Allows NULL / empty values',
                  icon: 'check',
               },
            ],
            initialValue: rawText === '1' || rawText === 'Yes' ? 'Yes' : 'No',
            onSelect: (val) => {
               window.SchemaGrid.currentTransaction = [];
               updateSchemaCell(td, val, columns);
               if (window.SchemaGrid.currentTransaction.length > 0)
                  window.SchemaGrid.history.push(
                     window.SchemaGrid.currentTransaction,
                  );
               window.SchemaGrid.currentTransaction = null;
            },
         });
         return;
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

         openDropdownPicker({
            anchorEl: td,
            title: 'Unique Constraint',
            placeholder: 'Search constraint...',
            items: [
               {
                  name: 'No',
                  value: 'No',
                  desc: 'Duplicate values allowed',
                  icon: 'close',
               },
               {
                  name: 'Yes',
                  value: 'Yes',
                  desc: 'Enforces UNIQUE constraint',
                  icon: 'verified',
               },
            ],
            initialValue: rawText === '1' || rawText === 'Yes' ? 'Yes' : 'No',
            onSelect: (val) => {
               window.SchemaGrid.currentTransaction = [];
               updateSchemaCell(td, val, columns);
               if (window.SchemaGrid.currentTransaction.length > 0)
                  window.SchemaGrid.history.push(
                     window.SchemaGrid.currentTransaction,
                  );
               window.SchemaGrid.currentTransaction = null;
            },
         });
         return;
      } else if (colKey === 'type') {
         const origColName = td.dataset.pk;
         const colSchema = window.SchemaGrid?.schema?.find(
            (c) => c.name === origColName,
         );
         openTypePicker({
            anchorEl: td,
            initialValue: rawText,
            dialect: window.AppState?.dbType,
            onSelect: (newType) => {
               if (newType === 'ENUM') {
                  setTimeout(() => openEnumModal(td, colSchema), 10);
                  return;
               }
               window.SchemaGrid.currentTransaction = [];
               updateSchemaCell(td, newType, columns);
               if (window.SchemaGrid.currentTransaction.length > 0)
                  window.SchemaGrid.history.push(
                     window.SchemaGrid.currentTransaction,
                  );
               window.SchemaGrid.currentTransaction = null;
            },
         });
         return;
      } else {
         inputEl = document.createElement('input');
         inputEl.type = 'text';
         inputEl.value = rawText;
      }

      td.innerHTML = '';
      td.classList.add('cell-editing');
      td.appendChild(inputEl);

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
         td.classList.remove('cell-editing');
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
