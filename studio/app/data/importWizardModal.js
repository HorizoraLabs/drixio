/**
 * Smart Column Mapping Wizard for CSV & JSON Import
 * Previews file content, intelligently maps source headers to table columns,
 * and allows users to customize field mapping or skip specific columns.
 */

export function openImportWizardModal({ tableName, schema, file, onComplete }) {
   let modal = document.getElementById('import-wizard-modal');
   if (modal) modal.remove();

   modal = document.createElement('div');
   modal.id = 'import-wizard-modal';
   modal.className = 'modal-overlay';

   const reader = new FileReader();
   reader.onload = (e) => {
      const text = e.target.result;
      const isJson = file.name.endsWith('.json');
      let headers = [];
      let sampleRows = [];
      let totalRows = 0;
      let allParsedRecords = [];

      try {
         if (isJson) {
            const parsed = JSON.parse(text);
            allParsedRecords = Array.isArray(parsed) ? parsed : [parsed];
            totalRows = allParsedRecords.length;
            if (totalRows > 0) {
               headers = Object.keys(allParsedRecords[0]);
               sampleRows = allParsedRecords.slice(0, 3);
            }
         } else {
            // Parse CSV
            const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
            if (lines.length > 0) {
               headers = parseCsvLine(lines[0]);
               totalRows = lines.length - 1;
               sampleRows = lines.slice(1, 4).map((l) => parseCsvLine(l));
            }
         }
      } catch (err) {
         alert('Failed to parse file: ' + err.message);
         return;
      }

      if (headers.length === 0) {
         alert('No columns detected in the uploaded file.');
         return;
      }

      renderWizardContent(
         modal,
         tableName,
         schema,
         file.name,
         totalRows,
         headers,
         sampleRows,
         isJson,
         text,
         allParsedRecords,
         onComplete,
      );
   };

   reader.readAsText(file);
}

function parseCsvLine(line) {
   const result = [];
   let current = '';
   let inQuotes = false;
   for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
         if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
         } else {
            inQuotes = !inQuotes;
         }
      } else if (char === ',' && !inQuotes) {
         result.push(current.trim());
         current = '';
      } else {
         current += char;
      }
   }
   result.push(current.trim());
   return result;
}

function renderWizardContent(
   modal,
   tableName,
   schema,
   fileName,
   totalRows,
   headers,
   sampleRows,
   isJson,
   rawText,
   allParsedRecords,
   onComplete,
) {
   const tableColNames = schema.map((c) => c.name);

   // Auto-match score algorithm: case-insensitive, ignores _ and -
   const autoMatch = (srcHeader) => {
      const cleanSrc = srcHeader.toLowerCase().replace(/[-_ ]/g, '');
      for (const col of schema) {
         const cleanCol = col.name.toLowerCase().replace(/[-_ ]/g, '');
         if (cleanSrc === cleanCol) return col.name;
      }
      return '';
   };

   const rowsHtml = headers
      .map((header, hIdx) => {
         const matchedCol = autoMatch(header);
         const samples = sampleRows
            .map((r) => {
               const val = isJson ? r[header] : r[hIdx];
               return val !== undefined && val !== null ? String(val) : '';
            })
            .filter((v) => v !== '')
            .slice(0, 2);

         const sampleText =
            samples.length > 0
               ? samples.map((s) => `<code class="import-sample-pill">${escapeHtml(s)}</code>`).join(' ')
               : '<span style="color: var(--color-text-subtle); font-size: 11px;">(empty)</span>';

         const optionsHtml = [
            `<option value="">-- Skip this column (跳过) --</option>`,
            ...schema.map((c) => {
               const isSelected = c.name === matchedCol;
               return `<option value="${c.name}" ${isSelected ? 'selected' : ''}>${c.name} (${(c.type || 'text').toLowerCase()})${c.isPk ? ' [PK]' : ''}</option>`;
            }),
         ].join('');

         return `
        <tr style="border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06));">
          <td style="padding: 10px 12px; font-weight: 600; font-family: monospace; color: var(--color-text-main);">
            <div>${escapeHtml(header)}</div>
            <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">${sampleText}</div>
          </td>
          <td style="padding: 10px 8px; text-align: center; color: var(--color-text-subtle);">
            <span class="material-symbols-outlined" style="font-size: 18px;">arrow_forward</span>
          </td>
          <td style="padding: 10px 12px;">
            <select class="import-mapping-select modal-input" data-src-header="${escapeHtml(header)}" data-src-idx="${hIdx}" style="width: 100%; height: 34px; font-size: 12.5px;">
              ${optionsHtml}
            </select>
          </td>
        </tr>
      `;
      })
      .join('');

   modal.innerHTML = /* html */ `
     <div class="modal-container" style="max-width: 680px; width: 92vw; background: var(--color-surface, #1e1e24); border-radius: 8px; border: 1px solid var(--color-border, #333); box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column;">
       <div class="modal-header" style="padding: 14px 20px; border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06)); display: flex; justify-content: space-between; align-items: center;">
         <div class="flex items-center gap-2">
           <span class="material-symbols-outlined text-primary" style="font-size: 20px;">tune</span>
           <h3 class="m-0 text-15 font-semibold">Import Data: Column Mapping Wizard</h3>
         </div>
         <button id="close-import-wizard-btn" class="modal-close-btn" title="Close">
           <span class="material-symbols-outlined">close</span>
         </button>
       </div>

       <div style="padding: 14px 20px; background: rgba(0,0,0,0.15); border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06)); font-size: 12.5px; color: var(--color-text-soft); display: flex; align-items: center; justify-content: space-between;">
         <div>
           Importing <strong style="color: var(--color-text-main);">${escapeHtml(fileName)}</strong> &middot; ~${totalRows.toLocaleString()} rows into <strong style="color: var(--color-primary);">${tableName}</strong>
         </div>
         <span style="font-size: 11px; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 10px;">${isJson ? 'JSON' : 'CSV'}</span>
       </div>

       <div style="padding: 0 20px; max-height: 380px; overflow-y: auto;">
         <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
           <thead>
             <tr style="border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.08)); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-subtle);">
               <th style="padding: 10px 12px; width: 45%;">Source File Column</th>
               <th style="padding: 10px 8px; width: 10%; text-align: center;"></th>
               <th style="padding: 10px 12px; width: 45%;">Destination Table Column</th>
             </tr>
           </thead>
           <tbody>
             ${rowsHtml}
           </tbody>
         </table>
       </div>

       <div class="modal-footer" style="padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06)); background: rgba(0,0,0,0.1);">
         <div style="font-size: 12px; color: var(--color-text-soft);">
           Check field mappings and click Import to start.
         </div>
         <div class="flex items-center gap-2">
           <button id="cancel-import-wizard-btn" class="btn-secondary">Cancel</button>
           <button id="submit-import-wizard-btn" class="btn-primary flex items-center gap-1.5">
             <span class="material-symbols-outlined" style="font-size: 16px;">upload</span>
             <span>Confirm & Import</span>
           </button>
         </div>
       </div>
     </div>
   `;

   document.body.appendChild(modal);

   const closeBtn = document.getElementById('close-import-wizard-btn');
   const cancelBtn = document.getElementById('cancel-import-wizard-btn');
   const submitBtn = document.getElementById('submit-import-wizard-btn');

   const closeFn = () => modal.remove();
   closeBtn.onclick = closeFn;
   cancelBtn.onclick = closeFn;

   submitBtn.onclick = async () => {
      // Build mapping: { [srcHeader]: targetCol }
      const mapping = {};
      modal.querySelectorAll('.import-mapping-select').forEach((sel) => {
         const srcHeader = sel.dataset.srcHeader;
         const targetCol = sel.value;
         if (targetCol) {
            mapping[srcHeader] = targetCol;
         }
      });

      if (Object.keys(mapping).length === 0) {
         alert('Please map at least one column to import.');
         return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML =
         '<span class="material-symbols-outlined animate-spin" style="font-size: 16px;">progress_activity</span><span>Transforming & Importing...</span>';

      try {
         // Transform data to mapped JSON
         let transformedData = [];
         if (isJson) {
            transformedData = allParsedRecords.map((rec) => {
               const row = {};
               for (const [src, tgt] of Object.entries(mapping)) {
                  row[tgt] = rec[src];
               }
               return row;
            });
         } else {
            const lines = rawText.split(/\r?\n/).filter((l) => l.trim() !== '');
            const fileHeaders = parseCsvLine(lines[0]);
            for (let i = 1; i < lines.length; i++) {
               const vals = parseCsvLine(lines[i]);
               const row = {};
               fileHeaders.forEach((srcH, hIdx) => {
                  const targetCol = mapping[srcH];
                  if (targetCol) {
                     row[targetCol] = vals[hIdx];
                  }
               });
               transformedData.push(row);
            }
         }

         // Upload as JSON payload
         const blob = new Blob([JSON.stringify(transformedData)], {
            type: 'application/json',
         });
         const formData = new FormData();
         formData.append('file', blob, `${tableName}_mapped.json`);
         formData.append('format', 'json');

         const res = await fetch(`/api/tables/${encodeURIComponent(tableName)}/import`, {
            method: 'POST',
            body: formData,
         });
         const jsonRes = await res.json();

         if (jsonRes.success) {
            closeFn();
            window.showToast?.(
               jsonRes.message || `Imported ${transformedData.length} rows successfully!`,
               'success',
            );
            if (onComplete) onComplete();
         } else {
            alert(jsonRes.error || 'Failed to import data');
            submitBtn.disabled = false;
            submitBtn.innerHTML =
               '<span class="material-symbols-outlined" style="font-size: 16px;">upload</span><span>Confirm & Import</span>';
         }
      } catch (err) {
         alert('Import error: ' + err.message);
         submitBtn.disabled = false;
         submitBtn.innerHTML =
            '<span class="material-symbols-outlined" style="font-size: 16px;">upload</span><span>Confirm & Import</span>';
      }
   };
}

function escapeHtml(str) {
   if (!str) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

