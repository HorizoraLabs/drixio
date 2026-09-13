import {
   runConsoleQuery,
   runExplainQuery,
   renderQueryResultToBody,
   renderConsoleMessages,
   clearConsoleMessages,
} from './core.js';
import { isSafeModeEnabled, setSafeModeEnabled } from './safeModal.js';
import { fetchSnippetsApi, deleteSnippetApi } from '../../lib/api.js';
import { openSaveSnippetModal } from './snippetsModal.js';
import { showContextMenu } from '../../components/contextMenu.js';
import { createModal } from '../../components/modal.js';

export const bindConsoleEvents = (editor, resultsBody) => {
   // ==================== TABS STATE MANAGEMENT ====================
   const defaultTabSql = window.AppState.lastQuery || 'SELECT 1 + 1 AS ping;';

   let tabs = [];
   try {
      const raw = localStorage.getItem('drixio_sql_tabs');
      if (raw) tabs = JSON.parse(raw);
   } catch {
      tabs = [];
   }

   if (!Array.isArray(tabs) || tabs.length === 0) {
      tabs = [
         {
            id: 'tab-1',
            title: 'Untitled query 1',
            sql: defaultTabSql,
            isDirty: false,
            lastResult: null,
         },
      ];
   }

   let activeTabId = localStorage.getItem('drixio_active_tab_id') || tabs[0].id;
   if (!tabs.find((t) => t.id === activeTabId)) {
      activeTabId = tabs[0].id;
   }

   const saveTabsToStorage = () => {
      try {
         // Store tabs without heavy result DOM
         const serialized = tabs.map((t) => ({
            id: t.id,
            title: t.title,
            sql: t.sql,
            isDirty: t.isDirty,
            isPreview: Boolean(t.isPreview),
            lastResult: t.lastResult,
         }));
         localStorage.setItem('drixio_sql_tabs', JSON.stringify(serialized));
         localStorage.setItem('drixio_active_tab_id', activeTabId);
      } catch (err) {
         console.warn('Failed to save tabs to localStorage', err);
      }
   };

   const getActiveTab = () => tabs.find((t) => t.id === activeTabId) || tabs[0];

   const tabsContainer = document.getElementById('console-tabs-container');
   if (tabsContainer) {
      tabsContainer.addEventListener(
         'wheel',
         (e) => {
            if (e.deltaY !== 0) {
               e.preventDefault();
               tabsContainer.scrollLeft += e.deltaY;
            }
         },
         { passive: false },
      );
   }

   const renderTabs = () => {
      if (!tabsContainer) return;
      tabsContainer.innerHTML = '';

      tabs.forEach((tab) => {
         const isActive = tab.id === activeTabId;
         const tabEl = document.createElement('div');
         tabEl.className = `console-tab ${isActive ? 'active' : ''} ${tab.isPreview ? 'preview' : ''}`;
         tabEl.dataset.tabId = tab.id;

         const icon = document.createElement('span');
         icon.className = 'material-symbols-outlined console-tab-icon';
         icon.textContent = 'terminal';

         const titleSpan = document.createElement('span');
         titleSpan.className = 'console-tab-title';
         titleSpan.textContent = tab.title;
         titleSpan.title = tab.isPreview
            ? 'Preview tab (double click or edit to keep)'
            : 'Double click to rename, right click for options';

         tabEl.appendChild(icon);
         tabEl.appendChild(titleSpan);

         if (tab.isDirty) {
            const dot = document.createElement('span');
            dot.className = 'tab-dirty-dot';
            dot.title = 'Unsaved changes';
            tabEl.appendChild(dot);
         }

         if (tabs.length > 1) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'tab-close-btn';
            closeBtn.title = 'Close tab (Ctrl+W)';
            closeBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px;">close</span>`;
            closeBtn.onclick = (e) => {
               e.stopPropagation();
               closeTab(tab.id);
            };
            tabEl.appendChild(closeBtn);
         }

         // Switch tab on left click
         tabEl.onclick = () => {
            if (activeTabId !== tab.id) {
               switchTab(tab.id);
            }
         };

         // Middle-click on Tab closes it immediately (browser standard)
         tabEl.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
               e.preventDefault();
               e.stopPropagation();
               closeTab(tab.id);
            }
         });

         // Right-click context menu (Matching Data Table context menu style)
         tabEl.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, [
               {
                  icon: 'edit',
                  label: 'Rename Tab',
                  shortcut: 'Double Click',
                  action: () => {
                     titleSpan.dispatchEvent(
                        new MouseEvent('dblclick', { bubbles: true }),
                     );
                  },
               },
               {
                  icon: 'content_copy',
                  label: 'Duplicate Tab',
                  action: () => {
                     createNewTab(`${tab.title} (Copy)`, tab.sql);
                  },
               },
               'divider',
               {
                  icon: 'close',
                  label: 'Close Tab',
                  shortcut: 'Ctrl+W',
                  action: () => {
                     closeTab(tab.id);
                  },
               },
               {
                  icon: 'close_fullscreen',
                  label: 'Close Other Tabs',
                  disabled: tabs.length <= 1,
                  action: () => {
                     tabs = [tab];
                     activeTabId = tab.id;
                     saveTabsToStorage();
                     renderTabs();
                  },
               },
               {
                  icon: 'playlist_remove',
                  label: 'Close Tabs to Right',
                  disabled: tabs.indexOf(tab) === tabs.length - 1,
                  action: () => {
                     const myIdx = tabs.indexOf(tab);
                     tabs = tabs.slice(0, myIdx + 1);
                     if (!tabs.find((t) => t.id === activeTabId)) {
                        activeTabId = tab.id;
                     }
                     saveTabsToStorage();
                     renderTabs();
                  },
               },
            ]);
         };

         // Inline rename on double click / promote preview tab
         titleSpan.ondblclick = (e) => {
            e.stopPropagation();
            if (tab.isPreview) {
               tab.isPreview = false;
               saveTabsToStorage();
            }

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'console-tab-rename-input';
            input.value = tab.title;

            const finishRename = () => {
               const val = input.value.trim();
               if (val) tab.title = val;
               saveTabsToStorage();
               renderTabs();
            };

            input.onblur = finishRename;
            input.onkeydown = (ke) => {
               if (ke.key === 'Enter') {
                  ke.preventDefault();
                  input.blur();
               } else if (ke.key === 'Escape') {
                  ke.preventDefault();
                  renderTabs();
               }
            };

            titleSpan.replaceWith(input);
            input.focus();
            input.select();
         };

         tabsContainer.appendChild(tabEl);

         if (isActive) {
            setTimeout(() => {
               tabEl.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                  inline: 'nearest',
               });
            }, 0);
         }
      });
   };

   const switchTab = (newTabId) => {
      const curTab = getActiveTab();
      if (curTab) {
         curTab.sql = editor.value;
      }

      activeTabId = newTabId;
      const nextTab = getActiveTab();
      if (nextTab) {
         editor.value = nextTab.sql;
         updateHighlight();
         updateLineNumbers();
         renderQueryResultToBody(nextTab.lastResult, resultsBody);
      }

      saveTabsToStorage();
      renderTabs();
      editor.focus({ preventScroll: true });
   };

   const createNewTab = (title = null, sql = '', isPreview = false) => {
      const curTab = getActiveTab();
      if (curTab) {
         curTab.sql = editor.value;
      }

      const newId = `tab-${Date.now()}`;
      const newTitle = title || `Untitled query ${tabs.length + 1}`;
      const newTab = {
         id: newId,
         title: newTitle,
         sql: sql || 'SELECT * FROM users LIMIT 50;',
         isDirty: false,
         isPreview: Boolean(isPreview),
         lastResult: null,
      };

      tabs.push(newTab);
      activeTabId = newId;

      editor.value = newTab.sql;
      updateHighlight();
      updateLineNumbers();
      renderQueryResultToBody(null, resultsBody);

      saveTabsToStorage();
      renderTabs();
      editor.focus({ preventScroll: true });
   };

   // Smart loader with preview tab support:
   // If isPreview is true, reuses existing preview tab instead of piling up tabs
   const openOrLoadQuery = (title, sql, isPreview = false) => {
      const curTab = getActiveTab();
      const defaultPing = 'SELECT 1 + 1 AS ping;';
      const isCleanUntitled =
         curTab &&
         !curTab.isDirty &&
         curTab.title.startsWith('Untitled query') &&
         (curTab.sql.trim() === '' || curTab.sql.trim() === defaultPing);

      // Check if there is already an active or existing preview tab
      const existingPreviewTab = tabs.find((t) => t.isPreview);

      if (isPreview && existingPreviewTab) {
         existingPreviewTab.title = title;
         existingPreviewTab.sql = sql;
         existingPreviewTab.lastResult = null;
         existingPreviewTab.isDirty = false;
         switchTab(existingPreviewTab.id);
         return;
      }

      if (isCleanUntitled) {
         curTab.title = title || curTab.title;
         curTab.sql = sql;
         curTab.lastResult = null;
         curTab.isPreview = Boolean(isPreview);
         editor.value = sql;
         updateHighlight();
         updateLineNumbers();
         renderQueryResultToBody(null, resultsBody);
         saveTabsToStorage();
         renderTabs();
         editor.focus({ preventScroll: true });
      } else {
         createNewTab(title, sql, isPreview);
      }
   };

   const closeTab = (tabId) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;

      tabs.splice(idx, 1);
      if (tabs.length === 0) {
         tabs.push({
            id: `tab-${Date.now()}`,
            title: 'Untitled query 1',
            sql: 'SELECT 1 + 1 AS ping;',
            isDirty: false,
            lastResult: null,
         });
         activeTabId = tabs[0].id;
      } else if (activeTabId === tabId) {
         const nextIdx = Math.max(0, idx - 1);
         activeTabId = tabs[nextIdx].id;
      }

      const active = getActiveTab();
      editor.value = active.sql;
      updateHighlight();
      updateLineNumbers();
      renderQueryResultToBody(active.lastResult, resultsBody);

      saveTabsToStorage();
      renderTabs();
      editor.focus({ preventScroll: true });
   };

   const addTabBtn = document.getElementById('console-add-tab-btn');
   if (addTabBtn) {
      addTabBtn.onclick = () => createNewTab();
   }

   const sidebarNewBtn = document.getElementById('console-new-query-btn');
   if (sidebarNewBtn) {
      sidebarNewBtn.onclick = () => createNewTab();
   }

   // ==================== LINE NUMBERS GUTTER & SELECTION ====================
   const lineNumbers = document.getElementById('sql-line-numbers');

   const getLineOffsets = (text) => {
      const lines = text.split('\n');
      const starts = [];
      const ends = [];
      let cur = 0;
      for (let i = 0; i < lines.length; i++) {
         starts.push(cur);
         const lineLen = lines[i].length;
         cur += lineLen;
         if (i < lines.length - 1) {
            cur += 1; // include \n
            ends.push(cur);
         } else {
            ends.push(cur);
         }
      }
      return { lines, starts, ends };
   };

   const updateGutterActiveLines = () => {
      if (!lineNumbers) return;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const { starts, ends } = getLineOffsets(editor.value);

      const numElements = lineNumbers.querySelectorAll('.sql-line-num');
      numElements.forEach((el, idx) => {
         const lineStart = starts[idx];
         const lineEnd = ends[idx];
         const isSelected =
            start !== end &&
            Math.max(start, lineStart) < Math.min(end, lineEnd);
         if (isSelected) {
            el.classList.add('selected');
         } else {
            el.classList.remove('selected');
         }
      });
   };

   const updateLineNumbers = () => {
      if (!lineNumbers) return;
      const count = editor.value.split('\n').length;
      let html = '';
      for (let i = 1; i <= count; i++) {
         html += `<div class="sql-line-num" data-line="${i}">${i}</div>`;
      }
      lineNumbers.innerHTML = html;
      updateGutterActiveLines();
   };

   // Sync line numbers scrolling
   editor.addEventListener('scroll', () => {
      if (lineNumbers) {
         lineNumbers.scrollTop = editor.scrollTop;
      }
   });

   // VS Code-style gutter click and drag selection
   if (lineNumbers) {
      let isGutterDragging = false;
      let dragAnchorLine = 1;

      const getLineFromEvent = (e) => {
         const rect = lineNumbers.getBoundingClientRect();
         const relY = e.clientY - rect.top + lineNumbers.scrollTop - 12; // 12px top padding
         const count = editor.value.split('\n').length;
         const targetLine = Math.floor(relY / 19.5) + 1; // 19.5px exact line height
         return Math.max(1, Math.min(count, targetLine));
      };

      const onGutterMouseDown = (e) => {
         if (e.button !== 0) return; // Left-click only
         e.preventDefault();
         const clickedLine = getLineFromEvent(e);
         dragAnchorLine = clickedLine;
         isGutterDragging = true;

         const { starts, ends } = getLineOffsets(editor.value);
         const selStart = starts[clickedLine - 1] ?? 0;
         const selEnd = ends[clickedLine - 1] ?? editor.value.length;

         editor.focus({ preventScroll: true });
         editor.setSelectionRange(selStart, selEnd);
         updateSelectionState();

         window.addEventListener('mousemove', onGutterMouseMove);
         window.addEventListener('mouseup', onGutterMouseUp);
      };

      const onGutterMouseMove = (e) => {
         if (!isGutterDragging) return;
         const currentLine = getLineFromEvent(e);
         const { starts, ends } = getLineOffsets(editor.value);

         if (currentLine >= dragAnchorLine) {
            const selStart = starts[dragAnchorLine - 1] ?? 0;
            const selEnd = ends[currentLine - 1] ?? editor.value.length;
            editor.setSelectionRange(selStart, selEnd, 'forward');
         } else {
            const selStart = starts[currentLine - 1] ?? 0;
            const selEnd = ends[dragAnchorLine - 1] ?? editor.value.length;
            editor.setSelectionRange(selStart, selEnd, 'backward');
         }

         updateSelectionState();
      };

      const onGutterMouseUp = () => {
         if (!isGutterDragging) return;
         isGutterDragging = false;
         window.removeEventListener('mousemove', onGutterMouseMove);
         window.removeEventListener('mouseup', onGutterMouseUp);
      };

      lineNumbers.addEventListener('mousedown', onGutterMouseDown);
   }

   // ==================== SELECTION & EXECUTION HELPERS ====================
   let cachedSelectedSql = '';

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

      updateGutterActiveLines();

      if (
         typeof start === 'number' &&
         typeof end === 'number' &&
         start !== end
      ) {
         const selected = editor.value.substring(start, end).trim();
         if (selected) {
            cachedSelectedSql = selected;
            if (runBtnText) runBtnText.textContent = 'Run Selection';
            return;
         }
      }

      cachedSelectedSql = '';
      if (runBtnText) runBtnText.textContent = 'Run';
   };

   const executeAndReset = async () => {
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
         const active = getActiveTab();
         if (active && active.isPreview) {
            active.isPreview = false;
            saveTabsToStorage();
            renderTabs();
         }
         const res = await runConsoleQuery(
            targetSql,
            editor,
            resultsBody,
            false,
            (finalResult) => {
               if (active) {
                  active.lastResult = finalResult;
                  active.isDirty = false;
                  saveTabsToStorage();
                  renderTabs();
               }
            },
         );
         if (res && active) {
            active.lastResult = res;
            active.isDirty = false;
            saveTabsToStorage();
            renderTabs();
         }
         loadAndRenderHistory();
      }
      updateHighlight();
   };

   // ==================== RUN & EXPLAIN BUTTONS ====================
   const runBtn = document.getElementById('run-sql-btn');
   if (runBtn) {
      runBtn.onclick = () => executeAndReset();
   }

   const explainBtn = document.getElementById('explain-sql-btn');
   if (explainBtn) {
      explainBtn.onclick = async () => {
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
            const active = getActiveTab();
            const res = await runExplainQuery(
               targetSql,
               editor,
               resultsBody,
               (explainRes) => {
                  if (active) {
                     active.lastResult = explainRes;
                     saveTabsToStorage();
                  }
               },
            );
            if (res && active) {
               active.lastResult = res;
               saveTabsToStorage();
            }
         }
      };
   }

   // ==================== SAFE MODE GUARD ====================
   const safeBtn = document.getElementById('console-safe-toggle-btn');
   const safeText = document.getElementById('console-safe-text');

   const updateSafeBtnUi = () => {
      if (!safeBtn) return;
      const enabled = isSafeModeEnabled();
      if (enabled) {
         safeBtn.className = 'console-safe-shield-btn active';
         safeBtn.title =
            'Safe Mode: Protection ON (Destructive queries will prompt for confirmation)';
         if (safeText) safeText.textContent = 'Safe Mode ON';
      } else {
         safeBtn.className = 'console-safe-shield-btn disabled';
         safeBtn.title = 'Safe Mode: Protection OFF (Click to re-enable guard)';
         if (safeText) safeText.textContent = 'Safe Mode OFF';
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
      window.addEventListener('drixio-safemode-changed', updateSafeBtnUi);
   }

   // ==================== SAVE QUERY BUTTON (Ctrl+S) ====================
   const saveSnippetBtn = document.getElementById('console-save-snippet-btn');
   const handleSaveCurrentQuery = () => {
      const active = getActiveTab();
      openSaveSnippetModal({
         defaultTitle: active?.title || 'Untitled query',
         defaultSql: editor.value,
         onSaved: () => {
            if (active) {
               active.isDirty = false;
               active.isPreview = false;
               saveTabsToStorage();
               renderTabs();
            }
            loadAndRenderSavedQueries();
         },
      });
   };

   if (saveSnippetBtn) {
      saveSnippetBtn.onclick = handleSaveCurrentQuery;
   }

   // ==================== SYNTAX HIGHLIGHTING & AUTOCOMPLETE ====================
   const highlightLayer = document.getElementById('sql-highlight-layer');

   const updateHighlight = () => {
      let text = editor.value;

      if (text === '') {
         if (highlightLayer) highlightLayer.innerHTML = '';
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

      if (text.endsWith('\n')) {
         text += ' ';
      }

      if (highlightLayer) highlightLayer.innerHTML = text;
   };

   // Autocomplete Popup
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
      'CREATE TABLE',
      'ALTER TABLE',
      'DROP TABLE',
      'PRIMARY KEY',
      'FOREIGN KEY',
      'COUNT(*)',
      'SUM()',
      'AVG()',
      'DISTINCT',
      'VALUES',
      'EXPLAIN',
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
      updateLineNumbers();
      editor.focus({ preventScroll: true });
   };

   // ==================== EDITOR STATUS BAR & SQL FORMATTER (Plan A) ====================
   const cursorPositionEl = document.getElementById('console-cursor-pos');
   const selSeparatorEl = document.getElementById('console-sel-separator');
   const selectionInfoEl = document.getElementById('console-selection-info');
   const dialectEl = document.getElementById('console-status-dialect');
   const formatBtn = document.getElementById('console-format-sql-btn');
   const shortcutsBtn = document.getElementById('console-shortcuts-btn');

   const updateCursorAndSelectionInfo = () => {
      if (!editor) return;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const text = editor.value;

      const textBefore = text.substring(0, end);
      const lines = textBefore.split('\n');
      const curLine = lines.length;
      const curCol = lines[lines.length - 1].length + 1;

      if (cursorPositionEl) {
         cursorPositionEl.textContent = `Ln ${curLine}, Col ${curCol}`;
      }

      if (selectionInfoEl) {
         if (
            typeof start === 'number' &&
            typeof end === 'number' &&
            start !== end
         ) {
            const charCount = Math.abs(end - start);
            const selText = text.substring(start, end);
            const selLines = selText.split('\n').length;
            selectionInfoEl.textContent =
               selLines > 1
                  ? `${charCount} selected (${selLines} lines)`
                  : `${charCount} selected`;
            selectionInfoEl.classList.remove('hidden');
            if (selSeparatorEl) selSeparatorEl.classList.remove('hidden');
         } else {
            selectionInfoEl.classList.add('hidden');
            if (selSeparatorEl) selSeparatorEl.classList.add('hidden');
         }
      }

      if (dialectEl) {
         const dbType = window.AppState?.dbType || 'SQLITE';
         dialectEl.textContent = (
            dbType === 'none' ? 'SQL' : dbType
         ).toUpperCase();
      }
   };

   const formatSql = (sql) => {
      if (!sql || !sql.trim()) return sql;
      let text = sql.trim().replace(/\r\n/g, '\n');

      const keywords = [
         'SELECT',
         'FROM',
         'WHERE',
         'AND',
         'OR',
         'ORDER BY',
         'GROUP BY',
         'LEFT JOIN',
         'RIGHT JOIN',
         'INNER JOIN',
         'CROSS JOIN',
         'FULL JOIN',
         'JOIN',
         'ON',
         'AS',
         'INSERT INTO',
         'VALUES',
         'UPDATE',
         'SET',
         'DELETE FROM',
         'CREATE TABLE',
         'DROP TABLE',
         'ALTER TABLE',
         'HAVING',
         'LIMIT',
         'OFFSET',
         'UNION ALL',
         'UNION',
         'CASE',
         'WHEN',
         'THEN',
         'ELSE',
         'END',
         'PRIMARY KEY',
         'FOREIGN KEY',
         'NOT NULL',
         'DEFAULT',
         'DESC',
         'ASC',
         'IN',
         'IS NULL',
         'IS NOT NULL',
         'IS',
         'LIKE',
         'BETWEEN',
         'EXISTS',
         'COUNT',
         'SUM',
         'AVG',
         'MIN',
         'MAX',
         'PRAGMA',
         'EXPLAIN',
      ];

      // Protect string literals from modification
      const parts = text.split(/('(?:''|[^'])*'|"(?:""|[^"])*")/g);
      for (let i = 0; i < parts.length; i += 2) {
         if (!parts[i]) continue;
         keywords.forEach((kw) => {
            const regex = new RegExp(`\\b${kw}\\b`, 'gi');
            parts[i] = parts[i].replace(regex, kw);
         });
      }
      text = parts.join('');

      // Add linebreaks before major clauses
      const majorClauses = [
         'FROM',
         'WHERE',
         'GROUP BY',
         'HAVING',
         'ORDER BY',
         'LIMIT',
         'OFFSET',
         'LEFT JOIN',
         'RIGHT JOIN',
         'INNER JOIN',
         'CROSS JOIN',
         'JOIN',
         'SET',
         'VALUES',
      ];
      majorClauses.forEach((cl) => {
         const re = new RegExp(`[ \\t]+(${cl}\\b)`, 'g');
         text = text.replace(re, '\n$1');
      });

      // Indent AND / OR
      text = text.replace(/[ \t]+(AND\b|OR\b)/g, '\n  $1');

      return text;
   };

   const formatCurrentQuery = () => {
      const oldVal = editor.value;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      let hasChanged = false;

      if (
         typeof start === 'number' &&
         typeof end === 'number' &&
         start !== end
      ) {
         const selected = editor.value.substring(start, end);
         const formatted = formatSql(selected);
         if (formatted !== selected) {
            editor.setRangeText(formatted, start, end, 'select');
            hasChanged = true;
         }
      } else {
         const formatted = formatSql(editor.value);
         if (formatted !== oldVal) {
            editor.value = formatted;
            hasChanged = true;
         }
      }

      const active = getActiveTab();
      if (active) {
         active.sql = editor.value;
         if (hasChanged) {
            active.isDirty = true;
            if (active.isPreview) active.isPreview = false;
            saveTabsToStorage();
            renderTabs();
         }
      }
      updateHighlight();
      updateLineNumbers();
      updateCursorAndSelectionInfo();
      if (window.showToast) {
         window.showToast(
            hasChanged ? 'SQL Formatted' : 'Already formatted',
            'info',
         );
      }
   };

   if (formatBtn) {
      formatBtn.onclick = formatCurrentQuery;
   }

   const showShortcutsModal = () => {
      createModal({
         id: 'console-shortcuts-modal',
         icon: 'keyboard',
         iconColor: 'primary',
         title: 'SQL Console Shortcuts',
         subtitle: 'Keyboard shortcuts for query editing and execution',
         badge: 'Editor',
         width: '480px',
         body: /* html */ `
            <div class="shortcuts-modal-body" style="padding: 0;">
               <div class="shortcut-row">
                  <span class="shortcut-row-label">Run Query / Run Selection</span>
                  <div class="shortcut-row-keys"><kbd>Ctrl</kbd> + <kbd>↵ Enter</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-row-label">Format SQL</span>
                  <div class="shortcut-row-keys"><kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>F</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-row-label">Save Query</span>
                  <div class="shortcut-row-keys"><kbd>Ctrl</kbd> + <kbd>S</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-row-label">New Query Tab</span>
                  <div class="shortcut-row-keys"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-row-label">Close Tab</span>
                  <div class="shortcut-row-keys"><kbd>Ctrl</kbd> + <kbd>W</kbd> or <kbd>Middle Click</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-row-label">Indent / Outdent Selection</span>
                  <div class="shortcut-row-keys"><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-row-label">Toggle Fullscreen Editor</span>
                  <div class="shortcut-row-keys"><kbd>Esc</kbd> to exit</div>
               </div>
            </div>
         `,
      });
   };

   if (shortcutsBtn) {
      shortcutsBtn.onclick = showShortcutsModal;
   }

   // Editor Input Event
   editor.addEventListener('input', () => {
      const active = getActiveTab();
      if (active) {
         active.sql = editor.value;
         active.isDirty = true;
         if (active.isPreview) {
            active.isPreview = false;
         }
         renderTabs();
      }
      updateHighlight();
      updateLineNumbers();
      checkAutocomplete();
      updateSelectionState();
      updateCursorAndSelectionInfo();
   });

   editor.addEventListener('select', () => {
      updateSelectionState();
      updateCursorAndSelectionInfo();
   });
   editor.addEventListener('mouseup', () => {
      updateSelectionState();
      updateCursorAndSelectionInfo();
   });
   editor.addEventListener('click', updateCursorAndSelectionInfo);
   editor.addEventListener('keyup', (e) => {
      updateCursorAndSelectionInfo();
      if (
         e.key.startsWith('Arrow') ||
         e.key === 'Home' ||
         e.key === 'End' ||
         e.shiftKey
      ) {
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

   // Keydown event in Editor
   editor.addEventListener('keydown', (e) => {
      // Autocomplete navigation
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

      // Run Query: Ctrl/Cmd + Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
         e.preventDefault();
         closePopup();
         executeAndReset();
         return;
      }

      // Format SQL: Shift + Alt + F
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
         e.preventDefault();
         formatCurrentQuery();
         return;
      }

      // Save Query: Ctrl/Cmd + S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
         e.preventDefault();
         handleSaveCurrentQuery();
         return;
      }

      // Close Tab: Ctrl/Cmd + W
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
         e.preventDefault();
         closeTab(activeTabId);
         return;
      }

      // New Tab: Ctrl/Cmd + Alt + N
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') {
         e.preventDefault();
         createNewTab();
         return;
      }

      // Tab indentation
      if (e.key === 'Tab') {
         e.preventDefault();
         const start = editor.selectionStart;
         const end = editor.selectionEnd;
         const val = editor.value;

         if (start === end) {
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
            const before = val.substring(0, start);
            const after = val.substring(end);
            const lineStart = before.lastIndexOf('\n') + 1;
            const fullSelectedText = val.substring(lineStart, end);
            const lines = fullSelectedText.split('\n');

            if (e.shiftKey) {
               const unindentedLines = lines.map((line) =>
                  line.replace(/^(?:  | )/, ''),
               );
               const newText = unindentedLines.join('\n');
               editor.value = val.substring(0, lineStart) + newText + after;
               editor.selectionStart = lineStart;
               editor.selectionEnd = lineStart + newText.length;
            } else {
               const indentedLines = lines.map((line) => '  ' + line);
               const newText = indentedLines.join('\n');
               editor.value = val.substring(0, lineStart) + newText + after;
               editor.selectionStart = lineStart;
               editor.selectionEnd = lineStart + newText.length;
            }
         }
         updateHighlight();
         updateLineNumbers();
      }
   });

   // ==================== SIDEBAR MANAGEMENT (Table Editor SideNav Style) ====================
   const sidebar = document.getElementById('console-sidebar');
   const toggleSidebarBtn = document.getElementById(
      'console-toggle-sidebar-btn',
   );
   const newQueryBtn = document.getElementById('console-new-query-btn');
   const searchInput = document.getElementById('console-sidebar-search-input');
   const searchClearBtn = document.getElementById('console-search-clear-btn');
   const consoleDbType = document.getElementById('console-db-type');

   // Sync DB type from main sidebar if available
   const brandTypeEl = document.getElementById('brand-db-type');
   if (consoleDbType && brandTypeEl) {
      consoleDbType.textContent = brandTypeEl.textContent || 'CONNECTED';
   }

   const setSidebarCollapsed = (collapsed) => {
      if (!sidebar) return;
      if (collapsed) {
         sidebar.classList.add('collapsed');
      } else {
         sidebar.classList.remove('collapsed');
      }
      localStorage.setItem(
         'drixio_console_sidebar_collapsed',
         collapsed ? 'true' : 'false',
      );
   };

   const isSidebarCollapsed =
      localStorage.getItem('drixio_console_sidebar_collapsed') === 'true';
   if (isSidebarCollapsed) {
      setSidebarCollapsed(true);
   }

   if (toggleSidebarBtn) {
      toggleSidebarBtn.onclick = () => {
         const isCurrentlyCollapsed =
            sidebar?.classList.contains('collapsed') || false;
         setSidebarCollapsed(!isCurrentlyCollapsed);
      };
   }

   // New Query button inside sidebar
   if (newQueryBtn) {
      newQueryBtn.onclick = () => {
         createNewTab();
      };
   }

   // Section accordion collapse toggles
   document.querySelectorAll('.console-tree-section-header').forEach((hdr) => {
      hdr.onclick = () => {
         const section = hdr.closest('.console-tree-section');
         if (section) section.classList.toggle('collapsed');
      };
   });

   // Load and render Saved Queries
   const savedQueriesList = document.getElementById(
      'console-saved-queries-list',
   );
   const savedCountBadge = document.getElementById('saved-queries-count');

   let cachedSnippets = [];

   const loadAndRenderSavedQueries = async () => {
      if (!savedQueriesList) return;
      try {
         const res = await fetchSnippetsApi();
         if (res.success && Array.isArray(res.data)) {
            cachedSnippets = res.data;
            if (savedCountBadge)
               savedCountBadge.textContent = String(cachedSnippets.length);
            renderSavedQueriesFiltered();
         } else {
            savedQueriesList.innerHTML = `<div class="sidebar-tree-empty">No saved queries</div>`;
         }
      } catch {
         savedQueriesList.innerHTML = `<div class="sidebar-tree-empty">Error loading</div>`;
      }
   };

   const renderSavedQueriesFiltered = () => {
      if (!savedQueriesList) return;
      const query = (searchInput?.value || '').trim().toLowerCase();

      let list = cachedSnippets;
      if (query) {
         list = cachedSnippets.filter(
            (s) =>
               (s.title || '').toLowerCase().includes(query) ||
               (s.sql || '').toLowerCase().includes(query),
         );
      }

      if (list.length === 0) {
         savedQueriesList.innerHTML = `<div class="sidebar-tree-empty">No queries found</div>`;
         return;
      }

      savedQueriesList.innerHTML = list
         .map(
            (s) => `
         <button type="button" class="table-btn query-item-btn" data-id="${s.id}" title="${s.title}">
           <div class="table-btn-label">
             <i class="material-symbols-outlined table-item-icon">description</i>
             <span class="table-name-text">${s.title}</span>
           </div>
           ${
              !s.isBuiltin
                 ? `<span class="query-item-delete-btn" title="Delete query">
                      <span class="material-symbols-outlined">delete</span>
                    </span>`
                 : ''
           }
         </button>
       `,
         )
         .join('');

      savedQueriesList.querySelectorAll('.query-item-btn').forEach((itemEl) => {
         const id = itemEl.getAttribute('data-id');
         const snippet = cachedSnippets.find((s) => s.id === id);
         if (!snippet) return;

         itemEl.onclick = (e) => {
            if (e.target.closest('.query-item-delete-btn')) return;
            openOrLoadQuery(snippet.title, snippet.sql);
         };

         const delBtn = itemEl.querySelector('.query-item-delete-btn');
         if (delBtn) {
            delBtn.onclick = async (e) => {
               e.stopPropagation();
               if (confirm(`Delete query "${snippet.title}"?`)) {
                  const res = await deleteSnippetApi(snippet.id);
                  if (res.success) {
                     loadAndRenderSavedQueries();
                  }
               }
            };
         }
      });
   };

   // Search input live filtering & clear button
   if (searchInput) {
      searchInput.oninput = () => {
         const val = searchInput.value.trim();
         if (searchClearBtn) {
            if (val) searchClearBtn.classList.remove('hidden');
            else searchClearBtn.classList.add('hidden');
         }
         renderSavedQueriesFiltered();
         renderTemplates();
      };

      if (searchClearBtn) {
         searchClearBtn.onclick = () => {
            searchInput.value = '';
            searchClearBtn.classList.add('hidden');
            renderSavedQueriesFiltered();
            renderTemplates();
            searchInput.focus();
         };
      }
   }

   // Built-in Templates
   const templatesList = document.getElementById('console-templates-list');
   const BUILTIN_TEMPLATES = [
      {
         title: 'Select all users',
         sql: 'SELECT * FROM user LIMIT 50;',
      },
      {
         title: 'Count rows in table',
         sql: 'SELECT count(*) AS total_rows FROM user;',
      },
      {
         title: 'Show database tables',
         sql: "SELECT * FROM sqlite_master WHERE type='table';",
      },
      {
         title: 'Create table blueprint',
         sql: `CREATE TABLE example (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name VARCHAR(255) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`,
      },
      {
         title: 'Inspect table schema',
         sql: "PRAGMA table_info('user');",
      },
      {
         title: 'Check index coverage',
         sql: "PRAGMA index_list('user');",
      },
      {
         title: 'Ping / Health check',
         sql: 'SELECT 1 + 1 AS ping;',
      },
   ];

   const renderTemplates = () => {
      if (!templatesList) return;
      const templatesCountBadge = document.getElementById('templates-count');
      const query = (searchInput?.value || '').trim().toLowerCase();
      let list = BUILTIN_TEMPLATES;
      if (query) {
         list = BUILTIN_TEMPLATES.filter(
            (t) =>
               t.title.toLowerCase().includes(query) ||
               t.sql.toLowerCase().includes(query),
         );
      }

      if (templatesCountBadge) {
         templatesCountBadge.textContent = list.length;
      }

      if (list.length === 0) {
         templatesList.innerHTML = `<div class="sidebar-tree-empty">No templates match</div>`;
         return;
      }

      templatesList.innerHTML = list
         .map(
            (tpl) => `
         <button type="button" class="table-btn query-item-btn template-item" data-title="${tpl.title}" title="${tpl.title}">
           <div class="table-btn-label">
             <i class="material-symbols-outlined table-item-icon" style="color: #f59e0b;">lightbulb</i>
             <span class="table-name-text">${tpl.title}</span>
           </div>
         </button>
       `,
         )
         .join('');

      templatesList.querySelectorAll('.template-item').forEach((el) => {
         const title = el.getAttribute('data-title');
         const tpl = BUILTIN_TEMPLATES.find((t) => t.title === title);
         if (!tpl) return;
         el.onclick = () => {
            openOrLoadQuery(tpl.title, tpl.sql, true); // Open in preview mode!
         };
      });
   };

   // Recent Query History with LocalStorage persistence
   try {
      const storedHist = localStorage.getItem('drixio_query_history');
      if (storedHist) {
         window.AppState.queryHistory = JSON.parse(storedHist);
      }
   } catch {
      // ignore
   }
   if (!window.AppState.queryHistory) {
      window.AppState.queryHistory = [];
   }

   const saveHistoryToStorage = () => {
      try {
         localStorage.setItem(
            'drixio_query_history',
            JSON.stringify(window.AppState.queryHistory || []),
         );
      } catch {
         // ignore
      }
   };

   const historyList = document.getElementById('console-recent-history-list');
   const clearHistoryBtn = document.getElementById('console-clear-history-btn');

   const loadAndRenderHistory = () => {
      if (!historyList) return;
      const history = window.AppState.queryHistory || [];

      if (clearHistoryBtn) {
         if (history.length > 0) clearHistoryBtn.classList.remove('hidden');
         else clearHistoryBtn.classList.add('hidden');
      }

      if (history.length === 0) {
         historyList.innerHTML = `<div class="sidebar-tree-empty">No recent queries</div>`;
         return;
      }

      historyList.innerHTML = history
         .slice(0, 15)
         .map(
            (sql, idx) => `
         <button type="button" class="table-btn query-item-btn history-item" data-idx="${idx}" title="${sql}">
           <div class="table-btn-label">
             <i class="material-symbols-outlined table-item-icon">history</i>
             <span class="table-name-text">${sql.replace(/\s+/g, ' ')}</span>
           </div>
           <span class="query-item-delete-btn" title="Remove from history">
             <span class="material-symbols-outlined">close</span>
           </span>
         </button>
       `,
         )
         .join('');

      historyList.querySelectorAll('.history-item').forEach((el) => {
         const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
         const sql = history[idx];
         if (!sql) return;

         el.onclick = (e) => {
            if (e.target.closest('.query-item-delete-btn')) return;
            openOrLoadQuery('Recent query', sql, true); // Open in preview mode!
         };

         const delBtn = el.querySelector('.query-item-delete-btn');
         if (delBtn) {
            delBtn.onclick = (e) => {
               e.stopPropagation();
               window.AppState.queryHistory.splice(idx, 1);
               saveHistoryToStorage();
               loadAndRenderHistory();
            };
         }
      });
   };

   if (clearHistoryBtn) {
      clearHistoryBtn.onclick = () => {
         if (confirm('Clear all recent query history?')) {
            window.AppState.queryHistory = [];
            saveHistoryToStorage();
            loadAndRenderHistory();
         }
      };
   }

   // Clear Results Button
   const clearResultsBtn = document.getElementById('console-clear-results-btn');
   if (clearResultsBtn) {
      clearResultsBtn.onclick = () => {
         const active = getActiveTab();
         if (active) {
            active.lastResult = null;
            saveTabsToStorage();
         }
         renderQueryResultToBody(null, resultsBody);
      };
   }

   // ==================== HORIZONTAL RESIZER LOGIC ====================
   const resizerHandle = document.querySelector(
      '.console-h-resizer .console-resizer-handle',
   );
   const editorPane = document.getElementById('console-editor-pane');

   if (resizerHandle && editorPane) {
      let isDragging = false;
      let startY = 0;
      let startHeight = 0;

      const onMouseDown = (e) => {
         if (e.button !== 0) return;
         isDragging = true;
         startY = e.clientY;
         startHeight = editorPane.getBoundingClientRect().height;
         resizerHandle.classList.add('is-dragging');
         document.body.style.userSelect = 'none';
         document.body.style.cursor = 'row-resize';

         window.addEventListener('mousemove', onMouseMove);
         window.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
         if (!isDragging) return;
         const deltaY = e.clientY - startY;
         let newHeight = startHeight + deltaY;

         const minH = 120;
         const maxH = Math.max(minH, window.innerHeight * 0.75);
         newHeight = Math.max(minH, Math.min(newHeight, maxH));

         editorPane.style.height = `${newHeight}px`;
      };

      const onMouseUp = () => {
         if (!isDragging) return;
         isDragging = false;
         resizerHandle.classList.remove('is-dragging');
         document.body.style.userSelect = '';
         document.body.style.cursor = '';

         window.removeEventListener('mousemove', onMouseMove);
         window.removeEventListener('mouseup', onMouseUp);

         const finalH = editorPane.getBoundingClientRect().height;
         localStorage.setItem(
            'drixio_console_editor_height',
            Math.round(finalH).toString(),
         );
      };

      resizerHandle.addEventListener('mousedown', onMouseDown);
   }

   // ==================== FULLSCREEN MAXIMIZE LOGIC ====================
   const expandBtn = document.getElementById('console-expand-editor-btn');
   const expandBtnIcon = document.getElementById('console-expand-btn-icon');

   const toggleFullscreen = () => {
      if (!editorPane) return;
      const isFull = editorPane.classList.toggle('is-fullscreen');
      const iconName = isFull ? 'close_fullscreen' : 'open_in_full';
      if (expandBtnIcon) expandBtnIcon.textContent = iconName;
      if (expandBtn) {
         expandBtn.title = isFull
            ? 'Exit Fullscreen (Esc)'
            : 'Toggle Fullscreen Editor (Esc to exit)';
      }

      setTimeout(() => {
         editor.focus({ preventScroll: true });
         updateHighlight();
         updateLineNumbers();
      }, 50);
   };

   if (expandBtn) expandBtn.onclick = toggleFullscreen;

   window.addEventListener('keydown', (e) => {
      if (
         e.key === 'Escape' &&
         editorPane?.classList.contains('is-fullscreen')
      ) {
         e.preventDefault();
         toggleFullscreen();
      }
   });

   // ==================== RESULTS / MESSAGES TABS SWITCHER ====================
   const resultsTabBtns = document.querySelectorAll('.results-tab-btn');
   const resultsBodyEl = document.getElementById('console-results-body');
   const messagesBodyEl = document.getElementById('console-messages-body');
   const clearMessagesBtn = document.getElementById(
      'console-clear-messages-btn',
   );

   resultsTabBtns.forEach((btn) => {
      btn.onclick = () => {
         resultsTabBtns.forEach((b) => b.classList.remove('active'));
         btn.classList.add('active');
         const tabKey = btn.getAttribute('data-tab');
         if (tabKey === 'results') {
            resultsBodyEl?.classList.remove('hidden');
            messagesBodyEl?.classList.add('hidden');
         } else if (tabKey === 'messages') {
            resultsBodyEl?.classList.add('hidden');
            messagesBodyEl?.classList.remove('hidden');
            renderConsoleMessages();
         }
      };
   });

   if (clearMessagesBtn) {
      clearMessagesBtn.onclick = () => {
         clearConsoleMessages();
      };
   }

   // ==================== INITIAL BOOTSTRAP ====================
   const activeInitialTab = getActiveTab();
   editor.value = activeInitialTab.sql;
   renderTabs();
   updateHighlight();
   updateLineNumbers();
   renderQueryResultToBody(activeInitialTab.lastResult, resultsBody);
   loadAndRenderSavedQueries();
   renderTemplates();
   loadAndRenderHistory();
   updateCursorAndSelectionInfo();
   editor.focus({ preventScroll: true });
};
