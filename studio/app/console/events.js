import { runConsoleQuery, runExplainQuery } from './core.js';
import { isSafeModeEnabled, setSafeModeEnabled } from './safeModal.js';
import { fetchSnippetsApi, deleteSnippetApi } from '../../lib/api.js';
import {
   openSaveSnippetModal,
   openParametricQueryModal,
   extractVariables,
} from './snippetsModal.js';

export const bindConsoleEvents = (editor, historyPane) => {
   // History Navigation State
   let historyIndex = -1;
   let draftQuery = '';
   let cachedSelectedSql = '';

   // Intelligently parse SQL statements separated by semicolons (ignoring semicolons inside quotes)
   const getStatementAtCursor = (text, cursorIndex) => {
      if (!text || !text.includes(';')) return text.trim();
      const statements = [];
      let start = 0;
      let inSingle = false;
      let inDouble = false;

      for (let i = 0; i < text.length; i++) {
         const ch = text[i];
         const prev = i > 0 ? text[i - 1] : '';
         if (ch === "'" && !inDouble && prev !== '\\') {
            inSingle = !inSingle;
         } else if (ch === '"' && !inSingle && prev !== '\\') {
            inDouble = !inDouble;
         } else if (ch === ';' && !inSingle && !inDouble) {
            statements.push({
               start,
               end: i + 1,
               sql: text.slice(start, i + 1).trim(),
            });
            start = i + 1;
         }
      }

      if (start < text.length) {
         const remaining = text.slice(start).trim();
         if (remaining) {
            statements.push({ start, end: text.length, sql: remaining });
         }
      }

      const activeStmt = statements.find(
         (s) => cursorIndex >= s.start && cursorIndex <= s.end,
      );
      return (
         activeStmt?.sql ||
         statements[statements.length - 1]?.sql ||
         text.trim()
      );
   };

   const updateSelectionState = () => {
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const runBtnText = document.getElementById('run-sql-btn-text');
      const runBtn = document.getElementById('run-sql-btn');

      if (
         typeof start === 'number' &&
         typeof end === 'number' &&
         start !== end
      ) {
         const selected = editor.value.substring(start, end).trim();
         if (selected) {
            cachedSelectedSql = selected;
            if (runBtnText) runBtnText.textContent = 'Run Selection';
            if (runBtn) {
               runBtn.title = 'Run Selected SQL (Ctrl+Enter)';
               runBtn.classList.add('has-selection');
            }
            return;
         }
      }

      cachedSelectedSql = '';
      if (runBtnText) runBtnText.textContent = 'Run';
      if (runBtn) {
         runBtn.title = 'Run SQL Query (Ctrl+Enter)';
         runBtn.classList.remove('has-selection');
      }
   };

   const executeAndReset = () => {
      let targetSql = cachedSelectedSql;
      if (!targetSql) {
         const start = editor.selectionStart;
         const end = editor.selectionEnd;
         if (
            typeof start === 'number' &&
            typeof end === 'number' &&
            start !== end
         ) {
            targetSql = editor.value.substring(start, end).trim();
         }
      }

      if (!targetSql) {
         const fullText = editor.value.trim();
         if (fullText) {
            targetSql =
               getStatementAtCursor(editor.value, editor.selectionStart) ||
               fullText;
         }
      }

      if (targetSql) {
         runConsoleQuery(targetSql, editor, historyPane);
      }
      historyIndex = -1;
      draftQuery = '';
      updateHighlight();
   };

   const safeBtn = document.getElementById('console-safe-toggle-btn');
   const safeText = document.getElementById('console-safe-text');

   const updateSafeBtnUi = () => {
      if (!safeBtn || !safeText) return;
      const enabled = isSafeModeEnabled();
      if (enabled) {
         safeBtn.className = 'console-safe-toggle-btn active';
         safeText.textContent = 'Safe Mode ON';
         safeBtn.title =
            'Safe Mode: Protection ON (Destructive queries will prompt for confirmation)';
      } else {
         safeBtn.className = 'console-safe-toggle-btn disabled';
         safeText.textContent = 'Safe Mode OFF';
         safeBtn.title = 'Safe Mode: Protection OFF (Click to re-enable guard)';
      }
   };

   if (safeBtn) {
      updateSafeBtnUi();
      safeBtn.onclick = () => {
         const current = isSafeModeEnabled();
         setSafeModeEnabled(!current);
         updateSafeBtnUi();
         if (window.showToast) {
            window.showToast(
               !current
                  ? 'Safe Mode enabled (Destructive query guard ON)'
                  : 'Safe Mode disabled (Guard OFF)',
               !current ? 'success' : 'info',
            );
         }
      };

      window.addEventListener('drixio-safemode-changed', () => {
         updateSafeBtnUi();
      });
   }

   const runBtn = document.getElementById('run-sql-btn');
   if (runBtn) {
      runBtn.onclick = () => executeAndReset();
   }

   const explainBtn = document.getElementById('explain-sql-btn');
   if (explainBtn) {
      explainBtn.onclick = () => {
         let targetSql = cachedSelectedSql;
         if (!targetSql) {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            if (
               typeof start === 'number' &&
               typeof end === 'number' &&
               start !== end
            ) {
               targetSql = editor.value.substring(start, end).trim();
            }
         }
         if (!targetSql) {
            const fullText = editor.value.trim();
            if (fullText) {
               targetSql =
                  getStatementAtCursor(editor.value, editor.selectionStart) ||
                  fullText;
            }
         }
         if (targetSql) {
            runExplainQuery(targetSql, editor, historyPane);
         }
      };
   }

   const clearBtn = document.getElementById('console-clear-editor-btn');
   if (clearBtn) {
      clearBtn.onclick = () => {
         editor.value = '';
         updateHighlight();
         editor.focus({ preventScroll: true });
      };
   }

   document.querySelectorAll('.template-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
         const templateSql = chip.getAttribute('data-sql');
         if (templateSql) {
            editor.value = templateSql;
            updateHighlight();
            editor.focus({ preventScroll: true });
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
      editor.focus({ preventScroll: true });
   };

   editor.addEventListener('input', () => {
      updateHighlight();
      checkAutocomplete();
      updateSelectionState();
   });

   editor.addEventListener('select', updateSelectionState);
   editor.addEventListener('mouseup', updateSelectionState);
   editor.addEventListener('keyup', (e) => {
      if (
         e.key.startsWith('Arrow') ||
         e.key === 'Home' ||
         e.key === 'End' ||
         e.shiftKey
      ) {
         updateSelectionState();
      }
   });
   document.addEventListener('selectionchange', () => {
      if (document.activeElement === editor) {
         updateSelectionState();
      }
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
      } else if (e.key === 'Tab') {
         e.preventDefault();
         const start = editor.selectionStart;
         const end = editor.selectionEnd;
         const val = editor.value;

         if (start === end) {
            // No text selected: insert 2 spaces at cursor
            const tabSpaces = '  ';
            if (document.queryCommandSupported?.('insertText')) {
               document.execCommand('insertText', false, tabSpaces);
            } else {
               editor.value =
                  val.substring(0, start) + tabSpaces + val.substring(end);
               editor.selectionStart = editor.selectionEnd =
                  start + tabSpaces.length;
            }
         } else {
            // Multi-line selection: indent or outdent
            const before = val.substring(0, start);
            const after = val.substring(end);

            // Find start of the first selected line
            const lineStart = before.lastIndexOf('\n') + 1;
            const fullSelectedText = val.substring(lineStart, end);
            const lines = fullSelectedText.split('\n');

            if (e.shiftKey) {
               // Outdent: remove up to 2 leading spaces per line
               const unindentedLines = lines.map((line) =>
                  line.replace(/^(?:  | )/, ''),
               );
               const newText = unindentedLines.join('\n');
               editor.value = val.substring(0, lineStart) + newText + after;
               editor.selectionStart = lineStart;
               editor.selectionEnd = lineStart + newText.length;
            } else {
               // Indent: add 2 leading spaces per line
               const indentedLines = lines.map((line) => '  ' + line);
               const newText = indentedLines.join('\n');
               editor.value = val.substring(0, lineStart) + newText + after;
               editor.selectionStart = lineStart;
               editor.selectionEnd = lineStart + newText.length;
            }
         }
         updateHighlight();
      } else if (e.key === 'Enter' && !e.shiftKey) {
         const val = editor.value.trim();
         if (val.endsWith(';')) {
            e.preventDefault();
            closePopup();
            executeAndReset();
         }
      }
   });

   // ==================== SNIPPETS DRAWER LOGIC ====================
   const snippetsDrawer = document.getElementById('console-snippets-drawer');
   const snippetsList = document.getElementById('snippets-list-container');
   const snippetsSearchInput = document.getElementById('snippets-search-input');
   const snippetsToggleBtn = document.getElementById(
      'console-snippets-toggle-btn',
   );
   const consoleSaveSnippetBtn = document.getElementById(
      'console-save-snippet-btn',
   );
   const drawerCloseBtn = document.getElementById('close-snippets-drawer-btn');
   const drawerNewBtn = document.getElementById('snippets-drawer-new-btn');

   let cachedSnippets = [];

   const loadAndRenderSnippets = async () => {
      if (!snippetsList) return;
      try {
         const res = await fetchSnippetsApi();
         if (res.success && Array.isArray(res.data)) {
            cachedSnippets = res.data;
            applySnippetsFilter();
         } else {
            snippetsList.innerHTML = `<div class="p-3 text-12 text-center" style="color: var(--color-error);">Failed to load snippets</div>`;
         }
      } catch (err) {
         snippetsList.innerHTML = `<div class="p-3 text-12 text-center" style="color: var(--color-error);">Error loading snippets: ${err.message}</div>`;
      }
   };

   const applySnippetsFilter = () => {
      if (!snippetsList) return;
      const query = (snippetsSearchInput?.value || '').trim().toLowerCase();
      let list = cachedSnippets;
      if (query) {
         list = cachedSnippets.filter((s) => {
            const matchTitle = (s.title || '').toLowerCase().includes(query);
            const matchDesc = (s.description || '')
               .toLowerCase()
               .includes(query);
            const matchSql = (s.sql || '').toLowerCase().includes(query);
            const matchTag = (s.tags || []).some((t) =>
               t.toLowerCase().includes(query),
            );
            return matchTitle || matchDesc || matchSql || matchTag;
         });
      }

      if (list.length === 0) {
         snippetsList.innerHTML = `
          <div class="snippets-empty-state">
            <span class="material-symbols-outlined">bookmark_border</span>
            <span>No snippets found</span>
          </div>`;
         return;
      }

      snippetsList.innerHTML = list
         .map((s) => {
            const hasParams = extractVariables(s.sql).length > 0;
            const tagsHtml = (s.tags || [])
               .map((t) => `<span class="snippet-tag-pill">${t}</span>`)
               .join('');
            const escapedSql = (s.sql || '')
               .replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
            return /* html */ `
            <div class="snippet-card" data-id="${s.id}">
              <div class="snippet-card-title-row">
                <span class="snippet-card-title" title="${s.title}">${s.title}</span>
                ${s.isBuiltin ? `<span class="snippet-badge-builtin">Built-in</span>` : ''}
              </div>
              ${s.description ? `<div class="snippet-card-desc">${s.description}</div>` : ''}
              ${tagsHtml ? `<div class="snippet-card-tags">${tagsHtml}</div>` : ''}
              <pre class="snippet-sql-preview">${escapedSql}</pre>
              <div class="snippet-card-actions">
                <div class="snippet-card-actions-left">
                  <button type="button" class="snippet-btn primary snip-run-btn" title="${hasParams ? 'Run with Parameters' : 'Run Query'}">
                    <span class="material-symbols-outlined" style="font-size: 14px;">play_arrow</span>
                    <span>Run</span>
                  </button>
                  <button type="button" class="snippet-btn secondary snip-insert-btn" title="Insert into Editor">
                    <span class="material-symbols-outlined" style="font-size: 14px;">input</span>
                    <span>Insert</span>
                  </button>
                </div>
                <div class="snippet-card-actions-right">
                  <button type="button" class="snippet-action-btn snip-edit-btn" title="Edit Snippet">
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  ${
                     !s.isBuiltin
                        ? `
                  <button type="button" class="snippet-action-btn delete snip-delete-btn" title="Delete Snippet">
                    <span class="material-symbols-outlined">delete</span>
                  </button>`
                        : ''
                  }
                </div>
              </div>
            </div>
          `;
         })
         .join('');

      // Attach card listeners
      snippetsList.querySelectorAll('.snippet-card').forEach((cardEl) => {
         const id = cardEl.getAttribute('data-id');
         const snippet = cachedSnippets.find((s) => s.id === id);
         if (!snippet) return;

         cardEl
            .querySelector('.snip-run-btn')
            ?.addEventListener('click', () => {
               const vars = extractVariables(snippet.sql);
               if (vars.length > 0) {
                  openParametricQueryModal({
                     snippet,
                     onExecute: (finalSql) => {
                        runConsoleQuery(finalSql, editor, historyPane);
                     },
                  });
               } else {
                  runConsoleQuery(snippet.sql, editor, historyPane);
               }
            });

         cardEl
            .querySelector('.snip-insert-btn')
            ?.addEventListener('click', () => {
               editor.value = snippet.sql;
               updateHighlight();
               editor.focus({ preventScroll: true });
            });

         cardEl
            .querySelector('.snip-edit-btn')
            ?.addEventListener('click', () => {
               openSaveSnippetModal({
                  snippetId: snippet.id,
                  defaultTitle: snippet.title,
                  defaultSql: snippet.sql,
                  defaultDescription: snippet.description,
                  defaultTags: snippet.tags || [],
                  onSaved: () => loadAndRenderSnippets(),
               });
            });

         cardEl
            .querySelector('.snip-delete-btn')
            ?.addEventListener('click', async () => {
               if (
                  confirm(
                     `Are you sure you want to delete snippet "${snippet.title}"?`,
                  )
               ) {
                  const res = await deleteSnippetApi(snippet.id);
                  if (res.success) {
                     if (window.showToast)
                        window.showToast('Snippet deleted', 'info');
                     loadAndRenderSnippets();
                  } else {
                     alert(`Failed to delete snippet: ${res.error}`);
                  }
               }
            });
      });
   };

   if (snippetsToggleBtn && snippetsDrawer) {
      snippetsToggleBtn.onclick = () => {
         const isHidden = snippetsDrawer.classList.contains('hidden');
         if (isHidden) {
            snippetsDrawer.classList.remove('hidden');
            loadAndRenderSnippets();
         } else {
            snippetsDrawer.classList.add('hidden');
         }
      };
   }

   if (drawerCloseBtn && snippetsDrawer) {
      drawerCloseBtn.onclick = () => {
         snippetsDrawer.classList.add('hidden');
      };
   }

   if (consoleSaveSnippetBtn) {
      consoleSaveSnippetBtn.onclick = () => {
         openSaveSnippetModal({
            defaultSql: editor.value,
            onSaved: () => {
               if (
                  snippetsDrawer &&
                  !snippetsDrawer.classList.contains('hidden')
               ) {
                  loadAndRenderSnippets();
               }
            },
         });
      };
   }

   if (drawerNewBtn) {
      drawerNewBtn.onclick = () => {
         openSaveSnippetModal({
            defaultSql: '',
            onSaved: () => loadAndRenderSnippets(),
         });
      };
   }

   if (snippetsSearchInput) {
      snippetsSearchInput.addEventListener('input', applySnippetsFilter);
   }

   window.addEventListener('drixio-snippets-updated', () => {
      if (snippetsDrawer && !snippetsDrawer.classList.contains('hidden')) {
         loadAndRenderSnippets();
      }
   });

   // ==================== CONSOLE RESIZER LOGIC ====================
   const resizerHandle = document.querySelector('.console-resizer-handle');
   const inputPane = document.getElementById('console-input-pane');

   if (resizerHandle && inputPane) {
      let isDragging = false;
      let startY = 0;
      let startHeight = 0;

      const onMouseDown = (e) => {
         if (e.button !== 0) return;
         isDragging = true;
         startY = e.clientY;
         startHeight = inputPane.getBoundingClientRect().height;
         resizerHandle.classList.add('is-dragging');
         document.body.style.userSelect = 'none';
         document.body.style.cursor = 'row-resize';

         window.addEventListener('mousemove', onMouseMove);
         window.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
         if (!isDragging) return;
         const deltaY = startY - e.clientY;
         let newHeight = startHeight + deltaY;

         const minH = 140;
         const maxH = Math.max(minH, window.innerHeight * 0.75);
         newHeight = Math.max(minH, Math.min(newHeight, maxH));

         inputPane.style.height = `${newHeight}px`;
      };

      const onMouseUp = () => {
         if (!isDragging) return;
         isDragging = false;
         resizerHandle.classList.remove('is-dragging');
         document.body.style.userSelect = '';
         document.body.style.cursor = '';

         window.removeEventListener('mousemove', onMouseMove);
         window.removeEventListener('mouseup', onMouseUp);

         const finalH = inputPane.getBoundingClientRect().height;
         localStorage.setItem(
            'drixio_console_pane_height',
            Math.round(finalH).toString(),
         );
      };

      resizerHandle.addEventListener('mousedown', onMouseDown);
   }

   // ==================== FULLSCREEN MAXIMIZE LOGIC ====================
   const expandBtn = document.getElementById('console-expand-editor-btn');
   const expandBtnIcon = document.getElementById('console-expand-btn-icon');

   const toggleFullscreen = () => {
      if (!inputPane) return;
      const isFull = inputPane.classList.toggle('is-fullscreen');
      const iconName = isFull ? 'close_fullscreen' : 'open_in_full';
      if (expandBtnIcon) expandBtnIcon.textContent = iconName;
      if (expandBtn) {
         expandBtn.title = isFull
            ? 'Exit Fullscreen (Esc)'
            : 'Toggle Fullscreen Editor (Esc to exit)';
      }

      if (isFull) {
         inputPane.dataset.prevHeight = inputPane.style.height;
         inputPane.style.height = '';
      } else {
         if (inputPane.dataset.prevHeight) {
            inputPane.style.height = inputPane.dataset.prevHeight;
         }
      }

      setTimeout(() => {
         editor.focus({ preventScroll: true });
         updateHighlight();
      }, 50);
   };

   if (expandBtn) expandBtn.onclick = toggleFullscreen;

   const editorWrapper = document.querySelector('.sql-editor-wrapper');
   if (editorWrapper) {
      editorWrapper.addEventListener('click', (e) => {
         if (
            !e.target.closest('#console-expand-editor-btn') &&
            !e.target.closest('#console-autocomplete-popup')
         ) {
            editor.focus({ preventScroll: true });
         }
      });
   }

   window.addEventListener('keydown', (e) => {
      if (
         e.key === 'Escape' &&
         inputPane?.classList.contains('is-fullscreen')
      ) {
         e.preventDefault();
         toggleFullscreen();
      }
   });
};
