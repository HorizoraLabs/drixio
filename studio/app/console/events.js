import { runConsoleQuery } from './core.js';
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

   const executeAndReset = () => {
      runConsoleQuery(null, editor, historyPane);
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
         snippetsList.innerHTML = `<div class="p-3 text-12 text-center" style="color: var(--color-text-soft);">No snippets found.</div>`;
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
                ${s.isBuiltin ? `<span class="snippet-tag-pill" style="color: #f59e0b; border-color: rgba(245, 158, 11, 0.3);">Built-in</span>` : ''}
              </div>
              ${s.description ? `<div class="snippet-card-desc">${s.description}</div>` : ''}
              ${tagsHtml ? `<div class="snippet-card-tags">${tagsHtml}</div>` : ''}
              <pre class="snippet-sql-preview">${escapedSql}</pre>
              <div class="snippet-card-actions">
                <div class="snippet-card-actions-left">
                  <button type="button" class="header-btn primary snip-run-btn" style="height: 24px; padding: 0 8px; font-size: 11px; gap: 3px;" title="${hasParams ? 'Run with Parameters' : 'Run Query'}">
                    <span class="material-symbols-outlined" style="font-size: 14px;">play_arrow</span>
                    <span>Run</span>
                  </button>
                  <button type="button" class="header-btn secondary snip-insert-btn" style="height: 24px; padding: 0 8px; font-size: 11px; gap: 3px;" title="Insert into Editor">
                    <span class="material-symbols-outlined" style="font-size: 14px;">input</span>
                    <span>Insert</span>
                  </button>
                </div>
                <div class="snippet-card-actions-right">
                  <button type="button" class="icon-btn snip-edit-btn" title="Edit Snippet">
                    <span class="material-symbols-outlined" style="font-size: 14px;">edit</span>
                  </button>
                  ${
                     !s.isBuiltin
                        ? `
                  <button type="button" class="icon-btn snip-delete-btn" title="Delete Snippet">
                    <span class="material-symbols-outlined" style="font-size: 14px; color: var(--color-error);">delete</span>
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
               editor.focus();
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
};
