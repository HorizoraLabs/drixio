export function getFilterQuery() {
   const t = window.AppState?.currentTable;
   if (!t) return '';
   const filterVal = document.getElementById(`filter-val-${t}`)?.value.trim();
   const filterOp = document.getElementById(`filter-op-${t}`)?.value;
   const filterCol = document.getElementById(`filter-col-${t}`)?.value;

   let query = '';
   if (filterVal || filterOp === 'IS NULL') {
      let safeVal = filterVal;
      if (
         safeVal &&
         !safeVal.startsWith("'") &&
         !safeVal.endsWith("'") &&
         isNaN(Number(safeVal))
      ) {
         const isRawSql =
            safeVal.toUpperCase().includes(' AND ') ||
            safeVal.toUpperCase().includes(' OR ');
         if (!isRawSql) {
            safeVal = `'${safeVal.replace(/'/g, "''")}'`;
         }
      }
      query = `"${filterCol}" ${filterOp} ${safeVal}`;
   }
   return query;
}

export function formatDisplayVal(val, colSchema) {
   if (val === null || val === undefined || val === 'null' || val === '') {
      return { html: '<em>null</em>', title: '' };
   }
   const typeUpper = (colSchema?.type || '').toUpperCase();
   const isDate = typeUpper === 'DATE';
   const isDateTime =
      typeUpper.includes('DATETIME') || typeUpper.includes('TIMESTAMP');
   const isBool = typeUpper.includes('BOOL') || typeUpper === 'TINYINT(1)';

   const strVal = String(val).trim();

   // Handle fixed-point decimal scaling (e.g. NUMERIC(30,2) or DECIMAL(10,2))
   const decimalMatch = typeUpper.match(
      /(?:NUMERIC|DECIMAL|FLOAT|DOUBLE)\s*\(\s*\d+\s*,\s*(\d+)\s*\)/,
   );
   if (
      decimalMatch &&
      !isNaN(Number(strVal)) &&
      !strVal.toLowerCase().includes('e')
   ) {
      const scale = parseInt(decimalMatch[1], 10);
      if (scale > 0) {
         let [intPart, decPart = ''] = strVal.split('.');
         if (decPart.length < scale) {
            decPart = decPart.padEnd(scale, '0');
            const formatted = `${intPart}.${decPart}`;
            return {
               html: formatted,
               title: strVal !== formatted ? `Raw: ${strVal}` : '',
            };
         }
      }
   }

   // Handle Boolean badges
   if (isBool) {
      const isTrue = strVal === '1' || strVal.toLowerCase() === 'true';
      const isFalse = strVal === '0' || strVal.toLowerCase() === 'false';
      if (isTrue) {
         return {
            html: '<span class="badge-bool bool-true">true</span>',
            title: `Boolean: ${strVal}`,
         };
      } else if (isFalse) {
         return {
            html: '<span class="badge-bool bool-false">false</span>',
            title: `Boolean: ${strVal}`,
         };
      }
   }

   if ((isDate || isDateTime) && strVal) {
      let dateObj = null;
      let isNumeric = false;
      if (/^\d{13}$/.test(strVal)) {
         dateObj = new Date(parseInt(strVal, 10));
         isNumeric = true;
      } else if (/^\d{10}$/.test(strVal)) {
         dateObj = new Date(parseInt(strVal, 10) * 1000);
         isNumeric = true;
      } else if (
         strVal.includes('T') ||
         strVal.includes('Z') ||
         (isDate && strVal.length > 10 && strVal.includes(' '))
      ) {
         dateObj = new Date(
            strVal.includes(' ') && !strVal.includes('T')
               ? strVal.replace(' ', 'T')
               : strVal,
         );
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
         const y = dateObj.getFullYear();
         const m = String(dateObj.getMonth() + 1).padStart(2, '0');
         const d = String(dateObj.getDate()).padStart(2, '0');
         let formatted = `${y}-${m}-${d}`;
         if (isDateTime) {
            const h = String(dateObj.getHours()).padStart(2, '0');
            const min = String(dateObj.getMinutes()).padStart(2, '0');
            const s = String(dateObj.getSeconds()).padStart(2, '0');
            formatted += ` ${h}:${min}:${s}`;
         }
         return {
            html: formatted.replace(/</g, '&lt;'),
            title: isNumeric
               ? `Raw Timestamp: ${strVal}`
               : strVal !== formatted
                 ? `Raw: ${strVal}`
                 : '',
         };
      }
   }

   return {
      html: strVal.replace(/</g, '&lt;'),
      title: '',
   };
}

export function generateRowHtml(row, rowIndex, pkColumn, columns, schema = []) {
   let html = `<td class="row-header" data-row-idx="${rowIndex}">${rowIndex + 1}</td>`;
   const pkValue = pkColumn ? row[pkColumn] : rowIndex;
   columns.forEach((col, cIdx) => {
      const colSchema = schema.find((c) => c.name === col);
      let rawVal = row[col];
      if (typeof rawVal === 'object' && rawVal !== null) {
         if (rawVal.type === 'Buffer' && Array.isArray(rawVal.data)) {
            rawVal = `[BLOB ${rawVal.data.length} B]`;
         } else {
            rawVal = JSON.stringify(rawVal);
         }
      }
      const val =
         rawVal !== null && rawVal !== undefined ? String(rawVal) : 'null';
      const safeValForAttr = val.replace(/"/g, '&quot;');
      const { html: safeValForHtml, title: cellTitle } = formatDisplayVal(
         val,
         colSchema,
      );
      const titleAttr = cellTitle ? ` title="${cellTitle}"` : '';

      const isFk = colSchema && colSchema.fkTarget && val !== 'null';
      if (isFk) {
         const fkTable = colSchema.fkTarget.table;
         const fkCol = colSchema.fkTarget.column;
         html += `<td class="data-cell is-fk-cell" data-row-idx="${rowIndex}" data-col-idx="${cIdx}" data-pk="${pkValue}" data-col="${col}" data-original="${safeValForAttr}" data-fk-table="${fkTable}" data-fk-col="${fkCol}"${titleAttr}><span class="cell-text">${safeValForHtml}</span><button type="button" class="fk-jump-btn" title="View & jump to ${fkTable} (${fkCol} = ${safeValForAttr})" data-fk-table="${fkTable}" data-fk-col="${fkCol}" data-fk-val="${safeValForAttr}"><span class="material-symbols-outlined">open_in_new</span></button></td>`;
      } else {
         html += `<td class="data-cell" data-row-idx="${rowIndex}" data-col-idx="${cIdx}" data-pk="${pkValue}" data-col="${col}" data-original="${safeValForAttr}"${titleAttr}><span class="cell-text">${safeValForHtml}</span></td>`;
      }
   });
   return html;
}
