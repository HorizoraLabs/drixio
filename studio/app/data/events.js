import { updateCell } from './core.js';
import { fetchTableWithName } from '../../lib/api.js';
import { openSupabaseCellEditor } from './popoverEditor.js';
import { openDropdownPicker } from '../../components/dropdownPicker.js';

export function bindCellEditor(tableContainer, schema, columns) {
   tableContainer.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td.data-cell');
      if (!td || td.querySelector('input, select')) return;
      if (e.target.closest('.cell-drawer-trigger-btn, .fk-jump-btn')) return;

      if (window.AppState?.isReadOnly) {
         window.showToast?.(
            'Database is in Read-Only protection mode. Editing is disabled.',
            'warning',
         );
         return;
      }

      const colName = td.dataset.col;
      const colSchema = schema.find((c) => c.name === colName);
      const typeUpper = colSchema?.type?.toUpperCase() || '';
      const isBlob =
         typeUpper.includes('BLOB') ||
         typeUpper === 'BYTEA' ||
         typeUpper.includes('BINARY');
      if (isBlob) {
         if (window.showToast) {
            window.showToast(
               'Binary (BLOB) data cannot be edited directly.',
               'info',
            );
         }
         return;
      }

      const isEnum =
         typeUpper.includes('ENUM') ||
         (colSchema?.enumValues && colSchema.enumValues.length > 0);
      const isDate = typeUpper === 'DATE';
      const isDateTime =
         typeUpper.includes('DATETIME') || typeUpper.includes('TIMESTAMP');
      const isBool = typeUpper.includes('BOOL') || typeUpper === 'TINYINT(1)';
      const isTime = typeUpper === 'TIME' || typeUpper.startsWith('TIME(');

      const isGhost =
         td.classList.contains('ghost-row') ||
         (td.dataset.insertIndex !== undefined &&
            !td.classList.contains('cell-edited'));

      const pk = td.dataset.pk;
      const insertIdx = td.dataset.insertIndex;
      const pendingVal =
         insertIdx !== undefined
            ? window.DataGrid?.pendingInserts?.[parseInt(insertIdx, 10)]?.[
                 colName
              ]
            : pk !== undefined
              ? window.DataGrid?.pendingEdits?.[pk]?.[colName]
              : undefined;

      let rawText = '';
      if (!isGhost) {
         if (pendingVal !== undefined) {
            rawText = String(pendingVal);
         } else if (td.dataset.original !== undefined) {
            rawText = td.dataset.original;
         } else {
            rawText =
               td.querySelector('.cell-text')?.textContent.trim() ||
               td.textContent.trim();
         }
      }

      if (
         rawText === 'null' ||
         rawText === '+ New' ||
         rawText === '+ Add Row'
      ) {
         rawText = '';
      }

      let inputEl;
      if (colSchema && colSchema.fkTarget) {
         const { table, column } = colSchema.fkTarget;
         fetchTableWithName(table, { limit: 200 })
            .then((res) => {
               if (res.success && res.data && res.data.rows) {
                  let displayCol = column;
                  if (res.data.columns) {
                     const possibleNames = [
                        'name',
                        'title',
                        'label',
                        'description',
                        'username',
                        'email',
                     ];
                     const found = res.data.columns.find((c) =>
                        possibleNames.includes(c.toLowerCase()),
                     );
                     if (found) displayCol = found;
                  }

                  const fkItems = [];
                  if (colSchema.nullable) {
                     fkItems.push({
                        name: '-- None --',
                        value: '',
                        desc: 'Set to NULL',
                        icon: 'block',
                     });
                  }

                  res.data.rows.forEach((row) => {
                     const val = String(row[column]);
                     const desc =
                        displayCol !== column && row[displayCol]
                           ? String(row[displayCol])
                           : `Row in ${table}`;
                     fkItems.push({
                        name: val,
                        value: val,
                        desc: desc,
                        icon: 'link',
                     });
                  });

                  if (
                     rawText &&
                     !res.data.rows.find((r) => String(r[column]) === rawText)
                  ) {
                     fkItems.unshift({
                        name: rawText,
                        value: rawText,
                        desc: 'Current value',
                        icon: 'link',
                     });
                  }

                  openDropdownPicker({
                     anchorEl: td,
                     title: `REFERENCES ${table.toUpperCase()}.${column.toUpperCase()}`,
                     placeholder: `Search ${table} by ${displayCol}...`,
                     items: fkItems,
                     initialValue: rawText,
                     width: 360,
                     onSelect: (newVal) => {
                        window.DataGrid.currentTransaction = [];
                        updateCell(td, newVal, columns);
                        if (window.DataGrid.currentTransaction.length > 0)
                           window.DataGrid.history.push(
                              window.DataGrid.currentTransaction,
                           );
                        window.DataGrid.currentTransaction = null;
                     },
                  });
               }
            })
            .catch((err) => {
               if (window.showToast)
                  window.showToast(
                     'Failed to load FK targets: ' + err.message,
                     'error',
                  );
            });
         return;
      } else if (isEnum) {
         let options = colSchema?.enumValues || [];
         if (options.length === 0 && colSchema?.type) {
            const enumMatch = colSchema.type.match(/enum\((.*?)\)/i);
            if (enumMatch) {
               options = enumMatch[1]
                  .split(',')
                  .map((s) => s.trim().replace(/^'|'$/g, ''));
            }
         }

         const enumItems = [];
         if (colSchema?.nullable) {
            enumItems.push({
               name: '-- None --',
               value: '',
               desc: 'Set to NULL',
               icon: 'block',
            });
         }
         options.forEach((opt) => {
            enumItems.push({
               name: opt,
               value: opt,
               desc: 'Enum option',
               icon: 'label',
            });
         });

         openDropdownPicker({
            anchorEl: td,
            title: 'ENUM VALUES',
            placeholder: 'Search enum values...',
            items: enumItems,
            initialValue: rawText,
            width: 300,
            onSelect: (newVal) => {
               window.DataGrid.currentTransaction = [];
               updateCell(td, newVal, columns);
               if (window.DataGrid.currentTransaction.length > 0)
                  window.DataGrid.history.push(
                     window.DataGrid.currentTransaction,
                  );
               window.DataGrid.currentTransaction = null;
            },
         });
         return;
      } else if (isDate) {
         inputEl = document.createElement('input');
         inputEl.type = 'date';
         let dateVal = '';
         if (rawText) {
            if (/^\d{13}$/.test(rawText)) {
               const d = new Date(parseInt(rawText, 10));
               if (!isNaN(d.getTime())) {
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  dateVal = `${y}-${m}-${day}`;
               }
            } else if (/^\d{10}$/.test(rawText)) {
               const d = new Date(parseInt(rawText, 10) * 1000);
               if (!isNaN(d.getTime())) {
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  dateVal = `${y}-${m}-${day}`;
               }
            } else if (/^\d{4}-\d{2}-\d{2}/.test(rawText)) {
               dateVal = rawText.slice(0, 10);
            } else {
               const d = new Date(rawText);
               if (!isNaN(d.getTime())) {
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  dateVal = `${y}-${m}-${day}`;
               }
            }
         }
         inputEl.value = dateVal;
      } else if (isDateTime) {
         inputEl = document.createElement('input');
         inputEl.type = 'datetime-local';
         let dtVal = '';
         if (rawText) {
            let d = null;
            if (/^\d{13}$/.test(rawText)) {
               d = new Date(parseInt(rawText, 10));
            } else if (/^\d{10}$/.test(rawText)) {
               d = new Date(parseInt(rawText, 10) * 1000);
            } else if (rawText.includes('T') || rawText.includes(' ')) {
               d = new Date(rawText.replace(' ', 'T'));
            } else {
               d = new Date(rawText);
            }
            if (d && !isNaN(d.getTime())) {
               const y = d.getFullYear();
               const m = String(d.getMonth() + 1).padStart(2, '0');
               const day = String(d.getDate()).padStart(2, '0');
               const h = String(d.getHours()).padStart(2, '0');
               const min = String(d.getMinutes()).padStart(2, '0');
               dtVal = `${y}-${m}-${day}T${h}:${min}`;
            }
         }
         inputEl.value = dtVal;
      } else if (isTime) {
         inputEl = document.createElement('input');
         inputEl.type = 'time';
         inputEl.step = '1';
         inputEl.value = rawText ? rawText.slice(0, 8) : '';
      } else if (isBool) {
         const isNullable = colSchema ? colSchema.nullable !== false : true;
         const isTrue = rawText === '1' || rawText.toLowerCase() === 'true';
         const isFalse = rawText === '0' || rawText.toLowerCase() === 'false';
         const currentVal = isTrue ? '1' : isFalse ? '0' : '';

         const boolItems = [
            {
               name: 'true',
               value: '1',
               desc: 'Logical True',
               icon: 'check_circle',
               badge: 'true',
               badgeClass: 'bool-true',
            },
            {
               name: 'false',
               value: '0',
               desc: 'Logical False',
               icon: 'cancel',
               badge: 'false',
               badgeClass: 'bool-false',
            },
         ];

         if (isNullable) {
            boolItems.push({
               name: 'null',
               value: '',
               desc: 'Empty / NULL value',
               icon: 'remove',
               badge: 'null',
               badgeClass: 'bool-null',
            });
         }

         openDropdownPicker({
            anchorEl: td,
            title: 'BOOLEAN VALUE',
            placeholder: 'Filter true / false / null...',
            items: boolItems,
            initialValue: currentVal,
            width: 280,
            onSelect: (newVal) => {
               window.DataGrid.currentTransaction = [];
               updateCell(td, newVal, columns);
               if (window.DataGrid.currentTransaction.length > 0)
                  window.DataGrid.history.push(
                     window.DataGrid.currentTransaction,
                  );
               window.DataGrid.currentTransaction = null;
            },
         });
         return;
      } else {
         const isTextLike =
            !isEnum &&
            !isDate &&
            !isDateTime &&
            !isTime &&
            !isBool &&
            !(colSchema && colSchema.fkTarget) &&
            (typeUpper === '' ||
               typeUpper.includes('TEXT') ||
               typeUpper.includes('VARCHAR') ||
               typeUpper.includes('CHAR') ||
               typeUpper.includes('JSON') ||
               typeUpper.includes('CLOB') ||
               typeUpper.includes('STRING'));

         if (isTextLike) {
            openSupabaseCellEditor({
               td,
               colName,
               colType: typeUpper,
               initialValue: rawText,
               onSave: (newVal) => {
                  window.DataGrid.currentTransaction = [];
                  updateCell(td, newVal, columns);
                  if (window.DataGrid.currentTransaction.length > 0)
                     window.DataGrid.history.push(
                        window.DataGrid.currentTransaction,
                     );
                  window.DataGrid.currentTransaction = null;
               },
            });
            return;
         }

         inputEl = document.createElement('input');
         inputEl.type = 'text';
         inputEl.value = rawText;
      }

      let isModalOpen = false;

      const openModal = () => {
         isModalOpen = true;
         openSupabaseCellEditor({
            td,
            colName,
            colType: typeUpper,
            initialValue: inputEl.value,
            onSave: (newVal) => {
               inputEl.value = newVal;
               isModalOpen = false;
               commitEdit();
            },
            onCancel: () => {
               isModalOpen = false;
               inputEl.focus();
            },
         });
      };

      td.innerHTML = '';
      td.classList.add('cell-editing');
      td.appendChild(inputEl);
      if (
         typeUpper === '' ||
         (!isEnum &&
            !isDate &&
            !isDateTime &&
            !isTime &&
            !isBool &&
            !(colSchema && colSchema.fkTarget))
      ) {
         const expandBtn = document.createElement('span');
         expandBtn.className = 'material-symbols-outlined cell-expand-btn';
         expandBtn.textContent = 'open_in_full';
         expandBtn.title = 'Open Full Editor (Shift + Enter)';
         expandBtn.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
         };
         expandBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openModal();
         };
         td.appendChild(expandBtn);

         inputEl.style.paddingRight = '32px';

         inputEl.addEventListener('keydown', (e2) => {
            if (e2.key === 'Enter' && e2.shiftKey) {
               e2.preventDefault();
               openModal();
            } else if (e2.key === 'Enter') {
               inputEl.blur();
            }
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
      } else {
         inputEl.addEventListener('keydown', (e2) => {
            if (e2.key === 'Enter') inputEl.blur();
            if (e2.key === 'Tab') {
               // Allow keyboard navigation between segments inside date/time inputs
               if (isDate || isDateTime || isTime) return;
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
      }

      inputEl.focus();

      const commitEdit = () => {
         td.classList.remove('cell-editing');
         if (isModalOpen) return;
         let newVal = inputEl.value;

         // Handle fixed-point decimal scaling (e.g. Numeric(30,2) or Decimal(10,2))
         const decimalMatch = typeUpper.match(
            /(?:NUMERIC|DECIMAL|FLOAT|DOUBLE)\s*\(\s*\d+\s*,\s*(\d+)\s*\)/,
         );
         if (
            decimalMatch &&
            newVal &&
            !isNaN(Number(newVal)) &&
            !newVal.toLowerCase().includes('e')
         ) {
            const scale = parseInt(decimalMatch[1], 10);
            if (scale > 0) {
               let [intPart, decPart = ''] = newVal.split('.');
               if (decPart.length < scale) {
                  decPart = decPart.padEnd(scale, '0');
                  newVal = `${intPart}.${decPart}`;
               }
            }
         }

         if (isTime && newVal && /^\d{2}:\d{2}$/.test(newVal)) {
            newVal += ':00';
         }

         if (isDate && newVal) {
            // If rawText was originally a numeric timestamp, convert back to timestamp
            if (/^\d{13}$/.test(rawText)) {
               const parsed = new Date(newVal);
               if (!isNaN(parsed.getTime())) newVal = String(parsed.getTime());
            } else if (/^\d{10}$/.test(rawText)) {
               const parsed = new Date(newVal);
               if (!isNaN(parsed.getTime()))
                  newVal = String(Math.floor(parsed.getTime() / 1000));
            }
         } else if (isDateTime && newVal) {
            // Check if rawText was originally a numeric timestamp
            if (/^\d{13}$/.test(rawText)) {
               const parsed = new Date(newVal);
               if (!isNaN(parsed.getTime())) newVal = String(parsed.getTime());
            } else if (/^\d{10}$/.test(rawText)) {
               const parsed = new Date(newVal);
               if (!isNaN(parsed.getTime()))
                  newVal = String(Math.floor(parsed.getTime() / 1000));
            } else {
               newVal = newVal.replace('T', ' ');
               if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(newVal)) {
                  newVal += ':00';
               }
            }
         }

         window.DataGrid.currentTransaction = [];
         updateCell(td, newVal, columns);
         if (window.DataGrid.currentTransaction.length > 0)
            window.DataGrid.history.push(window.DataGrid.currentTransaction);
         window.DataGrid.currentTransaction = null;
      };

      inputEl.addEventListener('blur', () => {
         setTimeout(() => {
            if (!isModalOpen && document.activeElement !== inputEl)
               commitEdit();
         }, 120);
      });
   });
}
