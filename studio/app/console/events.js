import { runConsoleQuery } from './core.js';

export const bindConsoleEvents = (editor, historyPane) => {
   // History Navigation State
   let historyIndex = -1;
   let draftQuery = '';

   const executeAndReset = () => {
      runConsoleQuery(null, editor, historyPane);
      historyIndex = -1;
      draftQuery = '';
      updateHighlight();
   };

   const runBtn = document.getElementById('run-sql-btn');
   if (runBtn) {
      runBtn.onclick = () => executeAndReset();
   }

   const clearBtn = document.getElementById('console-clear-editor-btn');
   if (clearBtn) {
      clearBtn.onclick = () => {
         editor.value = '';
         updateHighlight();
         editor.focus();
      };
   }

   document.querySelectorAll('.template-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
         const templateSql = chip.getAttribute('data-sql');
         if (templateSql) {
            editor.value = templateSql;
            updateHighlight();
            editor.focus();
         }
      });
   });

   const highlightLayer = document.getElementById('sql-highlight-layer');

   const updateHighlight = () => {
      let text = editor.value;

      if (text === '') {
         if (highlightLayer)
            highlightLayer.innerHTML =
               '<span class="hl-placeholder">Write your SQL query here (e.g. SELECT * FROM users)...</span>';
         return;
      }

      text = text
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;');

      const keywords = [
         'SELECT',
         'FROM',
         'WHERE',
         'AND',
         'OR',
         'IN',
         'NOT',
         'NULL',
         'IS',
         'ORDER',
         'BY',
         'GROUP',
         'ASC',
         'DESC',
         'LIMIT',
         'OFFSET',
         'JOIN',
         'INNER',
         'LEFT',
         'RIGHT',
         'ON',
         'AS',
         'CREATE',
         'TABLE',
         'DROP',
         'ALTER',
         'INSERT',
         'INTO',
         'VALUES',
         'UPDATE',
         'SET',
         'DELETE',
         'PRAGMA',
         'EXPLAIN',
         'QUERY',
         'PLAN',
         'WITH',
         'UNION',
         'ALL',
         'HAVING',
         'LIKE',
         'BETWEEN',
         'EXISTS',
         'CASE',
         'WHEN',
         'THEN',
         'ELSE',
         'END',
         'CAST',
         'DEFAULT',
         'PRIMARY',
         'KEY',
         'FOREIGN',
         'UNIQUE',
         'CHECK',
         'REFERENCES',
         'AUTOINCREMENT',
         'COUNT',
         'SUM',
         'AVG',
         'MIN',
         'MAX',
         'COALESCE',
         'BEGIN',
         'COMMIT',
         'ROLLBACK',
         'INDEX',
         'VIEW',
         'TRIGGER',
         'REPLACE',
         'CROSS',
         'FULL',
         'OUTER',
      ];
      const tokenRegex = new RegExp(
         `('.*?'|".*?")|\\b(\\d+)\\b|\\b(${keywords.join('|')})\\b`,
         'gi',
      );

      text = text.replace(tokenRegex, (match, strGrp, numGrp, kwGrp) => {
         if (strGrp) return `<span class="hl-string">${strGrp}</span>`;
         if (numGrp) return `<span class="hl-number">${numGrp}</span>`;
         if (kwGrp)
            return `<span class="hl-keyword">${kwGrp.toUpperCase()}</span>`;
         return match;
      });

      if (text.endsWith('\\n')) {
         text += ' ';
      }

      if (highlightLayer) highlightLayer.innerHTML = text;
   };

   // Autocomplete Popup Setup
   const popup = document.getElementById('console-autocomplete-popup');
   let activeIndex = 0;
   let currentSuggestions = [];
   let currentWordMatch = null;

   const SQL_KEYWORDS = [
      'SELECT',
      'FROM',
      'WHERE',
      'INSERT INTO',
      'UPDATE',
      'SET',
      'DELETE FROM',
      'JOIN',
      'LEFT JOIN',
      'RIGHT JOIN',
      'INNER JOIN',
      'ON',
      'ORDER BY',
      'GROUP BY',
      'HAVING',
      'LIMIT',
      'OFFSET',
      'AND',
      'OR',
      'NOT',
      'IN',
      'IS NULL',
      'IS NOT NULL',
      'LIKE',
      'BETWEEN',
      'EXISTS',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
      'CREATE TABLE',
      'ALTER TABLE',
      'DROP TABLE',
      'PRIMARY KEY',
      'FOREIGN KEY',
      'COUNT(*)',
      'SUM()',
      'AVG()',
      'MIN()',
      'MAX()',
      'DISTINCT',
      'AS',
      'VALUES',
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'PRAGMA',
      'EXPLAIN',
      'WITH',
      'UNION ALL',
   ];

   const getTables = () => {
      const btns = document.querySelectorAll('.table-btn[data-table]');
      return Array.from(btns)
         .map((b) => b.getAttribute('data-table'))
         .filter(Boolean);
   };

   const closePopup = () => {
      if (popup) {
         popup.classList.add('hidden');
         popup.innerHTML = '';
      }
      currentSuggestions = [];
      activeIndex = 0;
      currentWordMatch = null;
   };

   const renderPopup = () => {
      if (!popup || currentSuggestions.length === 0) {
         closePopup();
         return;
      }
      popup.innerHTML = currentSuggestions
         .map(
            (item, idx) => `
         <div class="autocomplete-item ${idx === activeIndex ? 'active' : ''}" data-idx="${idx}">
           <div class="autocomplete-item-left">
             <span class="material-symbols-outlined autocomplete-item-icon">${item.icon}</span>
             <span class="autocomplete-item-text">${item.text}</span>
           </div>
           <span class="autocomplete-item-type">${item.type}</span>
         </div>
       `,
         )
         .join('');
      popup.classList.remove('hidden');

      popup.querySelectorAll('.autocomplete-item').forEach((itemEl) => {
         itemEl.onmousedown = (e) => {
            e.preventDefault();
            const idx = parseInt(itemEl.dataset.idx, 10);
            applySuggestion(idx);
         };
      });
   };

   const checkAutocomplete = () => {
      const cursor = editor.selectionStart;
      const textBefore = editor.value.slice(0, cursor);
      const match = textBefore.match(/([a-zA-Z0-9_]+)$/);
      if (!match) {
         closePopup();
         return;
      }

      const prefix = match[1];
      currentWordMatch = {
         prefix,
         start: cursor - prefix.length,
         end: cursor,
      };

      const prefixLower = prefix.toLowerCase();
      const suggestions = [];

      // 1. Match database tables first
      const tables = getTables();
      tables.forEach((tbl) => {
         if (
            tbl.toLowerCase().startsWith(prefixLower) &&
            tbl.toLowerCase() !== prefixLower
         ) {
            suggestions.push({
               text: tbl,
               type: 'table',
               icon: 'table_chart',
            });
         }
      });

      // 2. Match SQL Keywords
      SQL_KEYWORDS.forEach((kw) => {
         if (
            kw.toLowerCase().startsWith(prefixLower) &&
            kw.toLowerCase() !== prefixLower
         ) {
            suggestions.push({
               text: kw,
               type: 'keyword',
               icon: 'code',
            });
         }
      });

      currentSuggestions = suggestions.slice(0, 8);
      activeIndex = 0;
      if (currentSuggestions.length > 0) {
         renderPopup();
      } else {
         closePopup();
      }
   };

   const applySuggestion = (idx = activeIndex) => {
      const chosen = currentSuggestions[idx];
      if (!chosen || !currentWordMatch) return;

      const before = editor.value.slice(0, currentWordMatch.start);
      const after = editor.value.slice(currentWordMatch.end);
      const insertText = chosen.text + ' ';

      editor.value = before + insertText + after;
      const newCursor = currentWordMatch.start + insertText.length;
      editor.selectionStart = newCursor;
      editor.selectionEnd = newCursor;

      closePopup();
      updateHighlight();
      editor.focus();
   };

   editor.addEventListener('input', () => {
      updateHighlight();
      checkAutocomplete();
   });

   editor.addEventListener('blur', () => {
      setTimeout(closePopup, 150);
   });

   editor.addEventListener('scroll', () => {
      if (highlightLayer) {
         highlightLayer.scrollTop = editor.scrollTop;
         highlightLayer.scrollLeft = editor.scrollLeft;
      }
   });

   // Initial highlight
   updateHighlight();

   editor.addEventListener('keydown', (e) => {
      // Handle Autocomplete Navigation
      if (
         popup &&
         !popup.classList.contains('hidden') &&
         currentSuggestions.length > 0
      ) {
         if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % currentSuggestions.length;
            renderPopup();
            return;
         } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex =
               (activeIndex - 1 + currentSuggestions.length) %
               currentSuggestions.length;
            renderPopup();
            return;
         } else if (
            e.key === 'Tab' ||
            (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)
         ) {
            e.preventDefault();
            applySuggestion(activeIndex);
            return;
         } else if (e.key === 'Escape') {
            e.preventDefault();
            closePopup();
            return;
         }
      }

      const history = window.AppState.queryHistory || [];

      if (e.key === 'ArrowUp') {
         // Allow history nav if cursor is at the very beginning of the input
         if (editor.selectionStart === 0 && editor.selectionEnd === 0) {
            if (historyIndex < history.length - 1) {
               e.preventDefault();
               if (historyIndex === -1) {
                  draftQuery = editor.value; // Save current typing before navigating
               }
               historyIndex++;
               editor.value = history[historyIndex];
               updateHighlight();

               // Move cursor to end of text
               setTimeout(() => {
                  editor.selectionStart = editor.value.length;
                  editor.selectionEnd = editor.value.length;
               }, 0);
            }
         }
      } else if (e.key === 'ArrowDown') {
         // Allow history nav down if cursor is at the very end of the input
         if (
            editor.selectionStart === editor.value.length &&
            editor.selectionEnd === editor.value.length
         ) {
            if (historyIndex > -1) {
               e.preventDefault();
               historyIndex--;
               if (historyIndex === -1) {
                  editor.value = draftQuery;
               } else {
                  editor.value = history[historyIndex];
               }
               updateHighlight();

               // Move cursor to end of text
               setTimeout(() => {
                  editor.selectionStart = editor.value.length;
                  editor.selectionEnd = editor.value.length;
               }, 0);
            }
         }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
         e.preventDefault();
         closePopup();
         executeAndReset();
      } else if (e.key === 'Enter' && !e.shiftKey) {
         const val = editor.value.trim();
         if (val.endsWith(';')) {
            e.preventDefault();
            closePopup();
            executeAndReset();
         }
      }
   });
};
