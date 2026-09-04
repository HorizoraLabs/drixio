import { updateCell } from './core.js';
import { executeRawQuery } from '../../lib/api.js';

export function bindCellEditor(tableContainer, schema, columns) {
   tableContainer.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td.data-cell');
      if (!td || td.querySelector('input, select')) return;

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
         inputEl = document.createElement('select');
         const loadingOpt = document.createElement('option');
         loadingOpt.value = rawText;
         loadingOpt.textContent = 'Loading...';
         inputEl.appendChild(loadingOpt);

         // Fetch FK options asynchronously
         const { table, column } = colSchema.fkTarget;
         executeRawQuery(`SELECT * FROM "${table}" LIMIT 100`)
            .then((res) => {
               if (res.success && res.data && res.data.rows) {
                  inputEl.innerHTML = ''; // clear loading

                  // Add a null/empty option if nullable
                  if (colSchema.nullable) {
                     const emptyOpt = document.createElement('option');
                     emptyOpt.value = '';
                     emptyOpt.textContent = '-- None --';
                     if (!rawText) emptyOpt.selected = true;
                     inputEl.appendChild(emptyOpt);
                  }

                  // Try to find a display column (e.g. name, title, label)
                  let displayCol = column;
                  if (res.data.columns) {
                     const possibleNames = [
                        'name',
                        'title',
                        'label',
                        'description',
                     ];
                     const found = res.data.columns.find((c) =>
                        possibleNames.includes(c.toLowerCase()),
                     );
                     if (found) displayCol = found;
                  }

                  res.data.rows.forEach((row) => {
                     const val = String(row[column]);
                     const displayVal =
                        displayCol !== column
                           ? `${val} - ${row[displayCol]}`
                           : val;
                     const opt = document.createElement('option');
                     opt.value = val;
                     opt.textContent = displayVal;
                     if (val === rawText) opt.selected = true;
                     inputEl.appendChild(opt);
                  });

                  // If the current rawText isn't in the limit 100, add it manually
                  if (
                     rawText &&
                     !res.data.rows.find((r) => String(r[column]) === rawText)
                  ) {
                     const opt = document.createElement('option');
                     opt.value = rawText;
                     opt.textContent = `${rawText} (Not in limit)`;
                     opt.selected = true;
                     inputEl.appendChild(opt);
                  }
               }
            })
            .catch((err) => {
               loadingOpt.textContent = 'Error loading options';
            });
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
         inputEl = document.createElement('select');
         if (colSchema?.nullable) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '-- None --';
            if (!rawText) emptyOpt.selected = true;
            inputEl.appendChild(emptyOpt);
         }
         options.forEach((opt) => {
            const op = document.createElement('option');
            op.value = opt;
            op.textContent = opt;
            if (opt === rawText) op.selected = true;
            inputEl.appendChild(op);
         });
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
         inputEl = document.createElement('input');
         inputEl.type = 'checkbox';
         inputEl.checked = rawText === '1' || rawText.toLowerCase() === 'true';
      } else {
         inputEl = document.createElement('input');
         inputEl.type = 'text';
         inputEl.value = rawText;
      }

      let isModalOpen = false;

      const openModal = () => {
         isModalOpen = true;
         const overlay = document.getElementById('modal-editor-overlay');
         const textarea = document.getElementById('modal-textarea');
         const cancelBtn = document.getElementById('modal-cancel-btn');
         const saveBtn = document.getElementById('modal-save-btn');
         const title = document.getElementById('modal-title');

         if (!overlay || !textarea) return;

         title.textContent = `Edit ${colName}`;
         textarea.value = inputEl.value;
         overlay.classList.remove('hidden');
         overlay.style.display = 'flex';
         textarea.focus();

         const closeModal = () => {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
            saveBtn.onclick = null;
            cancelBtn.onclick = null;
            isModalOpen = false;
            inputEl.focus();
         };

         cancelBtn.onclick = closeModal;
         saveBtn.onclick = () => {
            inputEl.value = textarea.value;
            closeModal();
            commitEdit();
         };

         // Close on backdrop click
         overlay.onclick = (e) => {
            if (e.target === overlay) closeModal();
         };
      };

      td.innerHTML = '';
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

         inputEl.style.width = '100%';
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
         if (isModalOpen) return;
         let newVal = isBool ? (inputEl.checked ? '1' : '0') : inputEl.value;

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
