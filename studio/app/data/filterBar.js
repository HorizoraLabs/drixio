/**
 * Supabase-style Table Filter & Search Bar
 * Handles multi-step popover filtering (Columns -> Operators -> Value) and compound pill chips.
 */

// Operator definition with labels, symbols, and groupings matching Supabase
export const OPERATOR_GROUPS = [
   {
      category: 'COMPARISON',
      operators: [
         { label: 'Equals', op: '=', symbol: '=' },
         { label: 'Not equal', op: '<>', symbol: '<>' },
         { label: 'Greater than', op: '>', symbol: '>' },
         { label: 'Less than', op: '<', symbol: '<' },
         { label: 'Greater or equal', op: '>=', symbol: '>=' },
         { label: 'Less or equal', op: '<=', symbol: '<=' },
      ],
   },
   {
      category: 'PATTERN MATCHING',
      operators: [
         { label: 'Like', op: 'LIKE', symbol: '~~' },
         { label: 'iLike', op: 'ILIKE', symbol: '~~*' },
         { label: 'Not Like', op: 'NOT LIKE', symbol: '!~~' },
      ],
   },
   {
      category: 'NULL CHECKS',
      operators: [
         { label: 'Is null', op: 'IS NULL', symbol: 'is null', isUnary: true },
         {
            label: 'Is not null',
            op: 'IS NOT NULL',
            symbol: 'is not null',
            isUnary: true,
         },
         { label: 'In list', op: 'IN', symbol: 'in' },
      ],
   },
];

// Persistent state per table
const tableFiltersState = new Map();

/**
 * Get or initialize state for a table
 */
export function getTableFilterState(tableName) {
   if (!tableFiltersState.has(tableName)) {
      tableFiltersState.set(tableName, {
         activeFilters: [], // Array of { id, col, op, val, symbol }
         freeTextSearch: '',
         draft: null, // { id?, col, op, val, step: 'column'|'operator'|'value' }
      });
   }
   return tableFiltersState.get(tableName);
}

/**
 * Reset all filters for a table
 */
export function clearTableFilters(tableName) {
   const state = getTableFilterState(tableName);
   state.activeFilters = [];
   state.freeTextSearch = '';
   state.draft = null;
}

/**
 * Check if a table has any active filter or search text
 */
export function hasActiveFilters(tableName) {
   const state = getTableFilterState(tableName);
   return state.activeFilters.length > 0 || !!state.freeTextSearch;
}

/**
 * Construct SQL WHERE clause from active filters and free text search
 */
export function buildTableWhereClause(tableName, schema = []) {
   const state = getTableFilterState(tableName);
   const clauses = [];

   // 1. Process active filter pills
   for (const filter of state.activeFilters) {
      if (filter.type === 'sql' || filter.op === 'RAW') {
         if (filter.val && filter.val.trim()) {
            clauses.push(`(${filter.val.trim()})`);
         }
         continue;
      }

      const { col, op, val } = filter;
      if (!col || !op) continue;

      if (op === 'IS NULL' || op === 'IS NOT NULL') {
         clauses.push(`"${col}" ${op}`);
         continue;
      }

      if (op === 'IN') {
         let formattedVal = (val || '').trim();
         if (!formattedVal.startsWith('(')) formattedVal = `(${formattedVal})`;
         clauses.push(`"${col}" IN ${formattedVal}`);
         continue;
      }

      const escapedVal = (val || '').replace(/'/g, "''");

      if (op === 'LIKE') {
         const pattern =
            escapedVal.includes('%') || escapedVal.includes('_')
               ? escapedVal
               : `%${escapedVal}%`;
         clauses.push(`"${col}" LIKE '${pattern}'`);
         continue;
      }

      if (op === 'ILIKE') {
         const pattern =
            escapedVal.includes('%') || escapedVal.includes('_')
               ? escapedVal
               : `%${escapedVal}%`;
         // Standard universal ILIKE fallback for Postgres/SQLite/MySQL
         clauses.push(`LOWER("${col}") LIKE LOWER('${pattern}')`);
         continue;
      }

      if (op === 'NOT LIKE') {
         const pattern =
            escapedVal.includes('%') || escapedVal.includes('_')
               ? escapedVal
               : `%${escapedVal}%`;
         clauses.push(`"${col}" NOT LIKE '${pattern}'`);
         continue;
      }

      // Comparison operators (=, <>, !=, >, <, >=, <=)
      const isNum = !isNaN(Number(val)) && val.trim() !== '';
      const safeVal = isNum ? val.trim() : `'${escapedVal}'`;
      const sqlOp = op === '!=' ? '<>' : op;
      clauses.push(`"${col}" ${sqlOp} ${safeVal}`);
   }

   // 2. Process free text search fallback
   if (state.freeTextSearch && state.freeTextSearch.trim()) {
      const searchStr = state.freeTextSearch.trim().replace(/'/g, "''");
      const textCols = schema
         .filter((c) => {
            const t = (c.type || '').toUpperCase();
            return (
               t.includes('CHAR') ||
               t.includes('TEXT') ||
               t.includes('VARCHAR') ||
               t.includes('STRING') ||
               !t
            );
         })
         .map((c) => c.name);

      const targetCols =
         textCols.length > 0 ? textCols : schema.map((c) => c.name);
      if (targetCols.length > 0) {
         const textClauses = targetCols.map(
            (c) => `LOWER("${c}") LIKE LOWER('%${searchStr}%')`,
         );
         clauses.push(`(${textClauses.join(' OR ')})`);
      }
   }

   return clauses.join(' AND ');
}

/**
 * Initialize and render the Filter Bar for a table
 */
export function renderFilterBar({
   container,
   tableName,
   schema = [],
   onFilterChange,
}) {
   const state = getTableFilterState(tableName);

   const colsList = schema.map((c) => c.name);
   const sampleCol = colsList[0] || 'id';
   const dynamicPlaceholder = `Filter table (e.g. ${sampleCol} = 1, status = 'active') or search...`;

   container.innerHTML = /* html */ `
      <div class="filter-bar-container" id="filter-bar-container-${tableName}">
         <div class="filter-bar-input-box" id="filter-bar-box-${tableName}">
            <span class="material-symbols-outlined filter-bar-search-icon">search</span>
            <div class="filter-bar-pills" id="filter-bar-pills-${tableName}"></div>
            <input 
               type="text" 
               id="filter-bar-input-${tableName}" 
               class="filter-bar-input" 
               placeholder="${dynamicPlaceholder}" 
               autocomplete="off" 
               spellcheck="false"
               value="${state.freeTextSearch || ''}"
            />
            <button 
               type="button" 
               id="filter-bar-clear-all-${tableName}" 
               class="filter-bar-clear-btn ${hasActiveFilters(tableName) ? '' : 'hidden'}" 
               title="Clear all filters"
            >
               <span class="material-symbols-outlined">close</span>
            </button>
         </div>
         <div class="filter-popover hidden" id="filter-popover-${tableName}"></div>
      </div>
   `;

   const pillsContainer = document.getElementById(
      `filter-bar-pills-${tableName}`,
   );
   const inputEl = document.getElementById(`filter-bar-input-${tableName}`);
   const clearAllBtn = document.getElementById(
      `filter-bar-clear-all-${tableName}`,
   );
   const popover = document.getElementById(`filter-popover-${tableName}`);
   const inputBox = document.getElementById(`filter-bar-box-${tableName}`);

   // Helper: Update placeholder based on whether pills exist
   const updateInputPlaceholder = () => {
      if (state.activeFilters.length > 0) {
         inputEl.placeholder = 'Add more filters or SQL conditions...';
      } else {
         inputEl.placeholder = dynamicPlaceholder;
      }
      if (clearAllBtn) {
         if (hasActiveFilters(tableName)) {
            clearAllBtn.classList.remove('hidden');
         } else {
            clearAllBtn.classList.add('hidden');
         }
      }
   };

   // Helper: Render active pill chips
   const renderPills = () => {
      pillsContainer.innerHTML = '';
      state.activeFilters.forEach((filter) => {
         const pill = document.createElement('div');
         pill.className = 'filter-pill';
         pill.dataset.filterId = filter.id;
         if (state.draft && state.draft.id === filter.id) {
            pill.classList.add('is-editing');
         }

         if (filter.type === 'sql' || filter.op === 'RAW') {
            pill.innerHTML = `
               <span class="material-symbols-outlined" style="font-size: 14px; color: var(--color-primary); line-height: 1;">code</span>
               <span class="filter-pill-val" title="${escapeHtml(filter.val)}">${escapeHtml(filter.val)}</span>
               <button type="button" class="filter-pill-remove" title="Remove condition">&times;</button>
            `;
         } else {
            const isUnary =
               filter.op === 'IS NULL' || filter.op === 'IS NOT NULL';
            const valHtml = isUnary
               ? ''
               : `<span class="filter-pill-val" title="${escapeHtml(filter.val)}">${escapeHtml(filter.val)}</span>`;

            pill.innerHTML = `
               <span class="filter-pill-col">${escapeHtml(filter.col)}</span>
               <span class="filter-pill-op">${escapeHtml(filter.symbol || filter.op)}</span>
               ${valHtml}
               <button type="button" class="filter-pill-remove" title="Remove filter">&times;</button>
            `;
         }

         // Click remove
         const removeBtn = pill.querySelector('.filter-pill-remove');
         removeBtn.onclick = (e) => {
            e.stopPropagation();
            state.activeFilters = state.activeFilters.filter(
               (f) => f.id !== filter.id,
            );
            if (state.draft && state.draft.id === filter.id) state.draft = null;
            renderPills();
            updateInputPlaceholder();
            onFilterChange();
         };

         // Click pill body to edit
         pill.onclick = (e) => {
            e.stopPropagation();
            if (filter.type === 'sql' || filter.op === 'RAW') {
               state.activeFilters = state.activeFilters.filter(
                  (f) => f.id !== filter.id,
               );
               renderPills();
               inputEl.value = filter.val;
               inputEl.focus();
               openPopover();
               updatePopoverPosition();
               return;
            }
            const isUnary =
               filter.op === 'IS NULL' || filter.op === 'IS NOT NULL';
            state.draft = { ...filter, step: isUnary ? 'operator' : 'value' };
            openPopover();
         };

         pillsContainer.appendChild(pill);
      });

      updateInputPlaceholder();
   };

   const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;');
   };

   const parseQuickFilter = (rawText) => {
      if (!rawText) return null;
      if (/\b(AND|OR)\b/i.test(rawText)) return null;
      const match = rawText.match(
         /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|!=|<>|>=|<=|>|<|LIKE|ILIKE)\s*(.+)$/i,
      );
      if (!match) return null;
      const [, rawCol, rawOp, rawVal] = match;
      const matchedCol = colsList.find(
         (c) => c.toLowerCase() === rawCol.toLowerCase(),
      );
      if (!matchedCol) return null;
      const cleanVal = rawVal.trim().replace(/^['"]|['"]$/g, '');
      return {
         col: matchedCol,
         op: rawOp.toUpperCase() === '<>' ? '!=' : rawOp.toUpperCase(),
         val: cleanVal,
      };
   };

   const parseSqlExpression = (rawText) => {
      if (!rawText || typeof rawText !== 'string') return null;
      let text = rawText.trim();
      if (!text) return null;

      // Detect accidental full SELECT statement
      if (/^SELECT\b/i.test(text)) {
         const whereMatch = text.match(/\bWHERE\s+([\s\S]+)$/i);
         if (whereMatch && whereMatch[1].trim()) {
            return {
               type: 'sql',
               val: whereMatch[1].trim(),
               isExtracted: true,
            };
         }
         return {
            type: 'select_warning',
         };
      }

      // If user started with WHERE, strip it
      if (/^WHERE\s+/i.test(text)) {
         text = text.replace(/^WHERE\s+/i, '').trim();
         if (text) {
            return {
               type: 'sql',
               val: text,
            };
         }
      }

      // Detect compound expressions (AND, OR, BETWEEN, IN, etc.)
      const hasSqlKeywords =
         /\b(AND|OR|IN\s*\(|NOT\s+IN\s*\(|BETWEEN|NOT\s+BETWEEN|IS\s+NULL|IS\s+NOT\s+NULL)\b/i.test(
            text,
         );
      if (hasSqlKeywords) {
         const hasKnownColumn = colsList.some((col) => {
            const regex = new RegExp(
               `(^|[^a-zA-Z0-9_])${col}([^a-zA-Z0-9_]|$)`,
               'i',
            );
            return regex.test(text);
         });
         if (hasKnownColumn) {
            return {
               type: 'sql',
               val: text,
            };
         }
      }

      return null;
   };

   // Popover Step 1: Columns List
   const renderColumnsStep = (filterKeyword = '') => {
      const kw = filterKeyword.toLowerCase().trim();
      const filteredCols = colsList.filter(
         (col) => !kw || col.toLowerCase().includes(kw),
      );
      const quickFilter = parseQuickFilter(filterKeyword);
      const sqlExpr = !quickFilter ? parseSqlExpression(filterKeyword) : null;

      let itemsHtml = '';

      if (quickFilter) {
         itemsHtml += `
            <div class="filter-popover-item filter-popover-smart-item active" data-smart-action="true">
               <div class="filter-popover-item-label">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: var(--color-primary);">filter_alt</span>
                  <span>Add filter: <strong>${quickFilter.col}</strong> ${quickFilter.op} <strong>${escapeHtml(quickFilter.val)}</strong></span>
               </div>
               <span class="filter-kbd-hint">↵ Enter</span>
            </div>
         `;
      } else if (sqlExpr && sqlExpr.type === 'sql') {
         itemsHtml += `
            <div class="filter-popover-item filter-popover-smart-item active" data-sql-action="true">
               <div class="filter-popover-item-label">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #10b981;">code</span>
                  <span>Apply SQL condition: <strong>${escapeHtml(sqlExpr.val)}</strong></span>
               </div>
               <span class="filter-kbd-hint">↵ Enter</span>
            </div>
         `;
      } else if (sqlExpr && sqlExpr.type === 'select_warning') {
         itemsHtml += `
            <div class="filter-popover-empty">
               <span class="material-symbols-outlined empty-icon" style="color: var(--color-warning);">lightbulb</span>
               <div class="empty-text">
                  <span class="empty-title">This bar filters the current table directly</span>
                  <span class="empty-hint">Enter conditions like <code>${sampleCol} = 1</code> without SELECT, or switch to <strong>SQL Editor</strong> for full queries.</span>
               </div>
            </div>
         `;
      }

      if (
         filteredCols.length === 0 &&
         !quickFilter &&
         (!sqlExpr || sqlExpr.type !== 'sql')
      ) {
         if (!sqlExpr || sqlExpr.type !== 'select_warning') {
            itemsHtml = `
               <div class="filter-popover-empty">
                  <span class="material-symbols-outlined empty-icon">search</span>
                  <div class="empty-text">
                     <span class="empty-title">No columns match "<strong>${escapeHtml(filterKeyword)}</strong>"</span>
                     <span class="empty-hint">Press <kbd class="filter-kbd-hint">↵ Enter</kbd> to search table records</span>
                  </div>
               </div>
            `;
         }
      } else {
         itemsHtml += filteredCols
            .map((col, idx) => {
               const colSchema = schema.find((c) => c.name === col);
               const typeStr = colSchema?.type || '';
               const isSelected =
                  !quickFilter &&
                  (!sqlExpr || sqlExpr.type !== 'sql') &&
                  idx === 0;
               return `
               <div class="filter-popover-item ${isSelected ? 'active' : ''}" data-col="${col}">
                  <div class="filter-popover-item-label">
                     <span>${col}</span>
                  </div>
                  ${typeStr ? `<span class="filter-popover-col-type">${typeStr}</span>` : ''}
               </div>`;
            })
            .join('');
      }

      popover.innerHTML = `
         <div class="filter-popover-scroll">
            ${itemsHtml}
         </div>
      `;

      const smartAction = popover.querySelector('[data-smart-action="true"]');
      if (smartAction) {
         smartAction.addEventListener('mouseenter', () => {
            popover
               .querySelectorAll('.filter-popover-item')
               .forEach((it) => it.classList.remove('active'));
            smartAction.classList.add('active');
         });

         smartAction.onclick = (e) => {
            e.stopPropagation();
            commitDraftFilter(quickFilter);
         };
      }

      const sqlAction = popover.querySelector('[data-sql-action="true"]');
      if (sqlAction && sqlExpr) {
         sqlAction.addEventListener('mouseenter', () => {
            popover
               .querySelectorAll('.filter-popover-item')
               .forEach((it) => it.classList.remove('active'));
            sqlAction.classList.add('active');
         });

         sqlAction.onclick = (e) => {
            e.stopPropagation();
            commitDraftFilter({
               id: `sql-${Date.now()}`,
               type: 'sql',
               col: 'SQL',
               op: 'RAW',
               symbol: 'SQL',
               val: sqlExpr.val,
            });
         };
      }

      popover
         .querySelectorAll(
            '.filter-popover-item:not([data-smart-action="true"]):not([data-sql-action="true"])',
         )
         .forEach((item) => {
            item.addEventListener('mouseenter', () => {
               popover
                  .querySelectorAll('.filter-popover-item')
                  .forEach((it) => it.classList.remove('active'));
               item.classList.add('active');
            });

            item.onclick = (e) => {
               e.stopPropagation();
               const col = item.dataset.col;
               state.draft = {
                  id: state.draft?.id || null,
                  col,
                  op: state.draft?.op || '=',
                  val: state.draft?.val || '',
                  step: 'operator',
               };
               inputEl.value = '';
               renderOperatorStep();
               inputEl.focus();
               updatePopoverPosition();
            };
         });
   };

   // Popover Step 2: Operators List
   const renderOperatorStep = () => {
      let contentHtml = '';
      let isFirst = true;
      OPERATOR_GROUPS.forEach((group) => {
         contentHtml += `<div class="filter-category-title">${group.category}</div>`;
         group.operators.forEach((item) => {
            const isSelected = state.draft?.op
               ? state.draft.op === item.op
               : isFirst;
            if (isSelected) isFirst = false;
            contentHtml += `
               <div class="filter-popover-item ${isSelected ? 'active' : ''}" data-op="${item.op}" data-symbol="${item.symbol}" data-unary="${!!item.isUnary}">
                  <span>${item.label}</span>
                  <span class="filter-op-badge">${item.symbol}</span>
               </div>
            `;
         });
      });

      popover.innerHTML = `
         <div class="filter-popover-header">
            <button type="button" class="filter-popover-back-btn" id="filter-popover-back-col" title="Back to columns">
               <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <div class="filter-popover-title-text">
               <span>Filter by</span>
               <strong>${state.draft.col}</strong>
            </div>
         </div>
         <div class="filter-popover-scroll">
            ${contentHtml}
         </div>
      `;

      const backBtn = document.getElementById('filter-popover-back-col');
      if (backBtn) {
         backBtn.onclick = (e) => {
            e.stopPropagation();
            state.draft.step = 'column';
            renderColumnsStep();
            inputEl.focus();
            updatePopoverPosition();
         };
      }

      popover.querySelectorAll('.filter-popover-item').forEach((item) => {
         item.addEventListener('mouseenter', () => {
            popover
               .querySelectorAll('.filter-popover-item')
               .forEach((it) => it.classList.remove('active'));
            item.classList.add('active');
         });

         item.onclick = (e) => {
            e.stopPropagation();
            const op = item.dataset.op;
            const symbol = item.dataset.symbol;
            const isUnary = item.dataset.unary === 'true';

            state.draft.op = op;
            state.draft.symbol = symbol;

            if (isUnary) {
               // Unary operators (IS NULL, IS NOT NULL) need no value input
               commitDraftFilter({ ...state.draft, val: '' });
            } else {
               state.draft.step = 'value';
               renderValueStep();
            }
         };
      });
   };

   // Popover Step 3: Value Input
   const renderValueStep = () => {
      const col = state.draft.col;
      const op = state.draft.op;
      const symbol = state.draft.symbol || op;

      let placeholder = 'Enter value...';
      if (op === 'LIKE' || op === 'ILIKE' || op === 'NOT LIKE') {
         placeholder = 'Search string or %pattern%...';
      } else if (op === 'IN') {
         placeholder = 'val1, val2, val3...';
      }

      popover.innerHTML = `
         <div class="filter-popover-header">
            <button type="button" class="filter-popover-back-btn" id="filter-popover-back-op" title="Back to operators">
               <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <div class="filter-popover-title-text">
               <span>${col}</span>
               <span class="filter-op-badge">${symbol}</span>
            </div>
         </div>
         <div class="filter-popover-form">
            <input 
               type="text" 
               id="filter-popover-val-input" 
               class="filter-popover-value-input" 
               placeholder="${placeholder}" 
               value="${state.draft.val || ''}"
               autocomplete="off"
            />
            <div class="filter-popover-form-actions">
               <button type="button" class="filter-popover-btn" id="filter-popover-cancel-btn">Cancel</button>
               <button type="button" class="filter-popover-btn primary" id="filter-popover-apply-btn">
                  Apply <span class="filter-kbd-hint">↵</span>
               </button>
            </div>
         </div>
      `;

      const valInput = document.getElementById('filter-popover-val-input');
      const applyBtn = document.getElementById('filter-popover-apply-btn');
      const cancelBtn = document.getElementById('filter-popover-cancel-btn');
      const backBtn = document.getElementById('filter-popover-back-op');

      if (backBtn) {
         backBtn.onclick = (e) => {
            e.stopPropagation();
            state.draft.step = 'operator';
            renderOperatorStep();
            inputEl.focus();
            updatePopoverPosition();
         };
      }

      if (cancelBtn) {
         cancelBtn.onclick = (e) => {
            e.stopPropagation();
            closePopover();
         };
      }

      const apply = () => {
         const val = valInput.value.trim();
         commitDraftFilter({ ...state.draft, val });
      };

      if (applyBtn) applyBtn.onclick = apply;
      if (valInput) {
         valInput.focus();
         valInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
               e.preventDefault();
               apply();
            } else if (e.key === 'Escape') {
               e.preventDefault();
               closePopover();
            } else if (e.key === 'Backspace' && !valInput.value) {
               e.preventDefault();
               state.draft.step = 'operator';
               renderOperatorStep();
               inputEl.focus();
               updatePopoverPosition();
            }
         };
      }
   };

   // Commit the draft filter to activeFilters and reload table
   const commitDraftFilter = (filterData) => {
      if (
         filterData.id &&
         state.activeFilters.some((f) => f.id === filterData.id)
      ) {
         // Update existing filter
         const idx = state.activeFilters.findIndex(
            (f) => f.id === filterData.id,
         );
         state.activeFilters[idx] = {
            ...state.activeFilters[idx],
            ...filterData,
         };
      } else {
         // Add new filter
         const newFilter = {
            id:
               filterData.id ||
               `filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: filterData.type || 'standard',
            col: filterData.col,
            op: filterData.op,
            symbol: filterData.symbol || filterData.op,
            val: filterData.val,
         };
         state.activeFilters.push(newFilter);
      }

      state.draft = null;
      closePopover();
      renderPills();
      inputEl.value = '';
      state.freeTextSearch = '';
      onFilterChange();
   };

   // Text measurement helper for accurate caret following
   let measureCanvas = null;
   const getTextWidth = (text, font) => {
      if (!text) return 0;
      if (!measureCanvas) {
         measureCanvas = document.createElement('canvas');
      }
      const ctx = measureCanvas.getContext('2d');
      if (ctx) {
         ctx.font = font || '12px Inter, sans-serif';
         return ctx.measureText(text).width;
      }
      return text.length * 7;
   };

   // Dynamically position dropdown popover beneath active caret or edited pill
   const updatePopoverPosition = () => {
      if (!popover || popover.classList.contains('hidden')) return;

      const containerEl = document.getElementById(
         `filter-bar-container-${tableName}`,
      );
      if (!containerEl) return;

      let rawLeft = 14;

      // If editing an existing pill, anchor popover directly below that pill
      if (state.draft && state.draft.id) {
         const pillEl = pillsContainer.querySelector(
            `[data-filter-id="${state.draft.id}"]`,
         );
         if (pillEl) {
            rawLeft = pillEl.offsetLeft;
         }
      } else if (inputEl) {
         // Follow current text cursor / caret position in input
         const style = window.getComputedStyle(inputEl);
         const font = `${style.fontSize || '12px'} ${style.fontFamily || 'Inter, sans-serif'}`;
         const caretPos = inputEl.selectionStart ?? inputEl.value.length;
         const textBeforeCaret = inputEl.value.slice(0, caretPos);
         const textOffset = getTextWidth(textBeforeCaret, font);

         rawLeft = inputEl.offsetLeft + textOffset;
      }

      // Bound within container width to prevent right edge overflow
      const containerWidth = containerEl.clientWidth || 600;
      const popoverWidth = popover.offsetWidth || 280;
      const maxLeft = Math.max(14, containerWidth - popoverWidth - 16);
      const clampedLeft = Math.max(14, Math.min(rawLeft, maxLeft));

      popover.style.left = `${clampedLeft}px`;
   };

   // Popover Open / Close Controls
   const openPopover = () => {
      popover.classList.remove('hidden');
      if (!state.draft) {
         state.draft = { step: 'column' };
         renderColumnsStep(inputEl.value);
      } else if (state.draft.step === 'column') {
         renderColumnsStep(inputEl.value);
      } else if (state.draft.step === 'operator') {
         renderOperatorStep();
      } else if (state.draft.step === 'value') {
         renderValueStep();
      }
      requestAnimationFrame(updatePopoverPosition);
   };

   const closePopover = () => {
      popover.classList.add('hidden');
      state.draft = null;
      renderPills();
   };

   // Input element events
   inputEl.addEventListener('focus', () => {
      openPopover();
   });

   inputEl.addEventListener('input', () => {
      const val = inputEl.value;
      state.freeTextSearch = val;
      updateInputPlaceholder();

      if (
         !popover.classList.contains('hidden') &&
         (!state.draft || state.draft.step === 'column')
      ) {
         renderColumnsStep(val);
      }
      updatePopoverPosition();
   });

   inputEl.addEventListener('keyup', () => {
      updatePopoverPosition();
   });

   inputEl.addEventListener('click', () => {
      updatePopoverPosition();
   });

   inputEl.addEventListener('keydown', (e) => {
      const isPopoverOpen = !popover.classList.contains('hidden');

      // 1. Arrow Up / Down navigation inside popover list
      if (isPopoverOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
         e.preventDefault();
         const items = Array.from(
            popover.querySelectorAll('.filter-popover-item'),
         );
         if (items.length > 0) {
            let activeIdx = items.findIndex((el) =>
               el.classList.contains('active'),
            );
            if (e.key === 'ArrowDown') {
               activeIdx =
                  activeIdx === -1 ? 0 : (activeIdx + 1) % items.length;
            } else {
               activeIdx =
                  activeIdx === -1
                     ? items.length - 1
                     : (activeIdx - 1 + items.length) % items.length;
            }
            items.forEach((el, idx) => {
               el.classList.toggle('active', idx === activeIdx);
            });
            items[activeIdx].scrollIntoView({ block: 'nearest' });
         }
         return;
      }

      // 2. Escape: close dropdown
      if (e.key === 'Escape') {
         closePopover();
         inputEl.blur();
         return;
      }

      // 3. Enter: select active item or submit free text search
      if (e.key === 'Enter') {
         e.preventDefault();
         if (isPopoverOpen) {
            const activeItem =
               popover.querySelector('.filter-popover-item.active') ||
               popover.querySelector('.filter-popover-item');
            if (activeItem) {
               activeItem.click();
               return;
            }
         }
         // Direct check if user entered a quick filter or SQL condition
         const trimmed = inputEl.value.trim();
         const quickFilter = parseQuickFilter(trimmed);
         if (quickFilter) {
            commitDraftFilter(quickFilter);
            return;
         }
         const sqlExpr = parseSqlExpression(trimmed);
         if (sqlExpr && sqlExpr.type === 'sql') {
            commitDraftFilter({
               id: `sql-${Date.now()}`,
               type: 'sql',
               col: 'SQL',
               op: 'RAW',
               symbol: 'SQL',
               val: sqlExpr.val,
            });
            return;
         }
         // If no popover item available, treat as search
         closePopover();
         onFilterChange();
         return;
      }

      // 4. Backspace: step back or remove last pill
      if (e.key === 'Backspace' && !inputEl.value) {
         if (isPopoverOpen && state.draft && state.draft.step === 'operator') {
            e.preventDefault();
            state.draft.step = 'column';
            renderColumnsStep('');
            inputEl.focus();
            updatePopoverPosition();
            return;
         }
         if (state.activeFilters.length > 0) {
            state.activeFilters.pop();
            renderPills();
            onFilterChange();
            updatePopoverPosition();
         }
      }
   });

   // Clicking container focuses input
   inputBox.addEventListener('click', (e) => {
      if (
         e.target.closest('.filter-pill') ||
         e.target.closest('.filter-bar-clear-btn')
      )
         return;
      inputEl.focus();
   });

   // Clear all button
   if (clearAllBtn) {
      clearAllBtn.onclick = (e) => {
         e.stopPropagation();
         clearTableFilters(tableName);
         inputEl.value = '';
         renderPills();
         closePopover();
         onFilterChange();
      };
   }

   // Click outside handler
   const outsideClickHandler = (e) => {
      const containerEl = document.getElementById(
         `filter-bar-container-${tableName}`,
      );
      if (!containerEl) {
         document.removeEventListener('click', outsideClickHandler);
         return;
      }
      if (!containerEl.contains(e.target)) {
         closePopover();
      }
   };
   document.addEventListener('click', outsideClickHandler);

   // Initial render of pills
   renderPills();
}
