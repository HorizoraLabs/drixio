/**
 * AI Copilot Docked Right Panel for Drixio Studio SQL Console
 * Native right-hand conversation assistant with resizable splitter,
 * query refinement, error fixing, and 1-click snippet saving.
 */

import { generateSqlApi, fixSqlApi } from '../../lib/api.js';
import {
   getStoredAiConfig,
   openAiConfigModal,
} from '../../components/aiConfigModal.js';
import { openSaveSnippetModal } from './snippetsModal.js';

let activeChatPanelEl = null;
let activeResizerEl = null;
let docKeyHandler = null;

// Session-level chat history
let chatHistory = [];
let isGenerating = false;
let currentLoadingText = '';

export function toggleAiPromptBar({
   editorTextarea,
   highlightLayer,
   currentTable,
   onRunQuery,
   onInsertSql,
}) {
   if (activeChatPanelEl) {
      closeAiPromptBar();
      return;
   }
   openAiPromptBar({
      editorTextarea,
      highlightLayer,
      currentTable,
      onRunQuery,
      onInsertSql,
   });
}

export function closeAiPromptBar() {
   if (docKeyHandler) {
      document.removeEventListener('keydown', docKeyHandler);
      docKeyHandler = null;
   }
   if (activeResizerEl) {
      activeResizerEl.remove();
      activeResizerEl = null;
   }
   if (activeChatPanelEl) {
      activeChatPanelEl.remove();
      activeChatPanelEl = null;
   }
   const aiBtn = document.getElementById('console-ai-btn');
   if (aiBtn) aiBtn.classList.remove('active');
}

export function openAiPromptBar({
   editorTextarea,
   highlightLayer,
   currentTable,
   onRunQuery,
   onInsertSql,
   initialPrompt = '',
}) {
   closeAiPromptBar();

   const wrapper = document.querySelector('.sql-editor-wrapper');
   if (!wrapper) return;

   const panel = document.createElement('div');
   panel.id = 'console-ai-chat-panel';
   panel.className = 'console-ai-chat-panel';

   // Restore persisted panel width
   const savedWidth = localStorage.getItem('drixio_ai_panel_width');
   if (savedWidth) {
      const num = parseInt(savedWidth, 10);
      if (!isNaN(num) && num >= 280 && num <= 800) {
         panel.style.width = `${num}px`;
      }
   }

   // Create draggable vertical splitter
   const resizer = document.createElement('div');
   resizer.id = 'console-ai-v-resizer';
   resizer.className = 'console-ai-v-resizer';
   resizer.title = 'Drag to resize AI Assistant width (Double click to reset)';
   resizer.innerHTML = '<div class="console-ai-v-pill"></div>';

   bindResizerEvents(resizer, panel);

   activeResizerEl = resizer;
   activeChatPanelEl = panel;

   wrapper.appendChild(resizer);
   wrapper.appendChild(panel);

   const aiBtn = document.getElementById('console-ai-btn');
   if (aiBtn) aiBtn.classList.add('active');

   renderChatPanel({
      editorTextarea,
      highlightLayer,
      currentTable,
      onRunQuery,
      onInsertSql,
   });

   docKeyHandler = (e) => {
      if (e.key === 'Escape' && activeChatPanelEl) {
         if (
            document.querySelector(
               '.modal-overlay:not(.hidden), .command-palette-container.is-open',
            )
         ) {
            return;
         }
         if (window.AppState?.currentTab === 'sql-btn') {
            closeAiPromptBar();
         }
      }
   };
   document.addEventListener('keydown', docKeyHandler);

   if (initialPrompt) {
      sendMessage(initialPrompt, {
         editorTextarea,
         currentTable,
         onRunQuery,
         onInsertSql,
      });
   }
}

function bindResizerEvents(resizer, panel) {
   let isDragging = false;
   let startX = 0;
   let startWidth = 0;

   const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      resizer.classList.add('is-dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
   };

   const onMouseMove = (ev) => {
      if (!isDragging) return;
      const deltaX = startX - ev.clientX; // dragging left increases width
      let newWidth = startWidth + deltaX;
      const minW = 280;
      const maxW = Math.min(800, window.innerWidth * 0.65);
      newWidth = Math.max(minW, Math.min(newWidth, maxW));
      panel.style.width = `${newWidth}px`;
   };

   const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('is-dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalW = Math.round(panel.getBoundingClientRect().width);
      localStorage.setItem('drixio_ai_panel_width', finalW.toString());
   };

   resizer.addEventListener('mousedown', onMouseDown);

   resizer.addEventListener('dblclick', () => {
      panel.style.width = '380px';
      localStorage.setItem('drixio_ai_panel_width', '380');
      window.showToast?.('Reset AI panel width to 380px', 'info');
   });
}

function getActiveModelLabel() {
   const cfg = getStoredAiConfig();
   if (cfg.model) return cfg.model;
   if (cfg.provider === 'deepseek') return 'deepseek-chat';
   if (cfg.provider === 'ollama') return 'llama3';
   if (cfg.provider === 'openai') return 'gpt-4o-mini';
   return 'AI Copilot';
}

function getSuggestions(currentTable) {
   if (currentTable) {
      return [
         {
            icon: 'bar_chart',
            label: `Count total records in ${currentTable}`,
            prompt: `Count total records in ${currentTable}`,
         },
         {
            icon: 'schedule',
            label: `Recent records in ${currentTable}`,
            prompt: `Find the most recent 10 records from ${currentTable} ordered by primary key or created date`,
         },
         {
            icon: 'filter_alt',
            label: `Select non-null active records`,
            prompt: `Select all columns from ${currentTable} where status is active or non-null limit 50`,
         },
      ];
   }
   return [
      {
         icon: 'table_rows',
         label: 'Count all tables and rows',
         prompt: 'Count rows for all tables and summarize record counts',
      },
      {
         icon: 'query_stats',
         label: 'Summary stats of database',
         prompt: 'Select summary statistics from primary data tables',
      },
      {
         icon: 'join_inner',
         label: 'Join primary tables',
         prompt: 'Write a JOIN query between the main tables based on foreign keys',
      },
   ];
}

function renderChatPanel(ctx) {
   if (!activeChatPanelEl) return;

   const modelName = getActiveModelLabel();
   const activeTable = ctx.currentTable || window.AppState?.currentTable;
   const suggestions = getSuggestions(activeTable);

   activeChatPanelEl.innerHTML = /* html */ `
     <!-- Panel Header -->
     <div class="ai-panel-header">
       <div class="ai-panel-header-left">
         <div class="ai-panel-title-icon">
           <span class="material-symbols-outlined">auto_awesome</span>
         </div>
         <span class="ai-panel-title">AI Assistant</span>
         <button type="button" class="ai-panel-model-pill" id="ai-panel-model-pill" title="Configure AI Model & API Key">
           <span>${escapeHtml(modelName)}</span>
           <span class="material-symbols-outlined" style="font-size: 11px;">tune</span>
         </button>
       </div>
       <div class="ai-panel-header-right">
         <button type="button" id="btn-ai-panel-reset" class="ai-panel-icon-btn" title="New Chat (Clear Conversation)">
           <span class="material-symbols-outlined" style="font-size: 15px;">restart_alt</span>
         </button>
         <button type="button" id="btn-ai-panel-settings" class="ai-panel-icon-btn" title="AI Settings">
           <span class="material-symbols-outlined" style="font-size: 15px;">settings</span>
         </button>
         <button type="button" id="btn-ai-panel-close" class="ai-panel-icon-btn" title="Close Panel (Esc)">
           <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
         </button>
       </div>
     </div>

     <!-- Messages Area -->
     <div class="ai-panel-messages" id="ai-panel-messages">
       ${
          chatHistory.length === 0
             ? /* html */ `
          <div class="ai-panel-welcome">
            <div class="ai-panel-welcome-card">
              <div class="ai-panel-welcome-badge">
                <span class="material-symbols-outlined" style="font-size: 14px;">psychology</span>
                <span>Ready to Assist</span>
              </div>
              <h4>Ask AI to write or fix SQL</h4>
              <p>Type your query request in plain English or Chinese. Contextual suggestions below:</p>
              <div class="ai-panel-chips">
                ${suggestions
                   .map(
                      (s) => /* html */ `
                  <button type="button" class="ai-panel-chip" data-prompt="${escapeAttr(s.prompt)}">
                    <span class="material-symbols-outlined">${s.icon}</span>
                    <span>${escapeHtml(s.label)}</span>
                  </button>
                `,
                   )
                   .join('')}
              </div>
            </div>
          </div>
       `
             : renderMessageHistory()
       }

       ${
          isGenerating
             ? /* html */ `
          <div class="ai-panel-msg-loading">
            <span class="material-symbols-outlined animate-spin">progress_activity</span>
            <span>${escapeHtml(currentLoadingText || 'Generating SQL query...')}</span>
          </div>
       `
             : ''
       }
     </div>

     <!-- Footer / Input Area -->
     <div class="ai-panel-footer">
       <div class="ai-panel-input-container">
         <textarea
           id="ai-panel-textarea"
           class="ai-panel-textarea"
           placeholder="${chatHistory.length > 0 ? 'Ask follow-up or refine query...' : 'Describe query to generate...'}"
           rows="1"
         ></textarea>
         <button
           type="button"
           id="btn-ai-panel-send"
           class="ai-panel-send-btn"
           title="Send message (Enter)"
           ${isGenerating ? 'disabled' : ''}
         >
           <span class="material-symbols-outlined" style="font-size: 16px;">arrow_upward</span>
         </button>
       </div>
       <div class="ai-panel-hints">
         <span><b>↵</b> to send &middot; <b>Shift+↵</b> newline</span>
         <span><b>Esc</b> close</span>
       </div>
     </div>
   `;

   attachPanelEvents(ctx);
   scrollToBottom();
}

function renderMessageHistory() {
   return chatHistory
      .map((msg, index) => {
         if (msg.role === 'user') {
            return /* html */ `
            <div class="ai-panel-msg-row ai-panel-msg-user">
              <div class="ai-panel-msg-bubble">
                <div class="ai-panel-msg-text">${escapeHtml(msg.content)}</div>
              </div>
            </div>
          `;
         }

         // Assistant message
         return /* html */ `
          <div class="ai-panel-msg-row ai-panel-msg-assistant" data-msg-idx="${index}">
            <div class="ai-panel-msg-bubble">
              ${msg.explanation ? `<div class="ai-panel-msg-text">${escapeHtml(msg.explanation)}</div>` : ''}
              ${
                 msg.sql
                    ? /* html */ `
                <div class="ai-panel-code-block">
                  <div class="ai-panel-code-header">
                    <span class="ai-panel-code-lang">SQL</span>
                    <button type="button" class="ai-panel-copy-btn" data-sql="${escapeAttr(msg.sql)}">
                      <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre class="ai-panel-code-pre"><code>${escapeHtml(msg.sql)}</code></pre>
                  <div class="ai-panel-code-actions">
                    <button type="button" class="ai-panel-action-btn" data-action="save" data-sql="${escapeAttr(msg.sql)}" title="Save as reusable query snippet">
                      <span class="material-symbols-outlined" style="font-size: 13px;">bookmark_add</span>
                      <span>Save</span>
                    </button>
                    <button type="button" class="ai-panel-action-btn" data-action="insert" data-sql="${escapeAttr(msg.sql)}" title="Insert query into editor">
                      <span class="material-symbols-outlined" style="font-size: 13px;">input</span>
                      <span>Insert</span>
                    </button>
                    <button type="button" class="ai-panel-action-btn primary" data-action="run" data-sql="${escapeAttr(msg.sql)}" title="Execute query directly">
                      <span class="material-symbols-outlined" style="font-size: 13px;">play_arrow</span>
                      <span>Run</span>
                    </button>
                  </div>
                </div>
              `
                    : ''
              }
              ${
                 msg.isError
                    ? /* html */ `
                <div class="ai-panel-msg-error">
                  <span class="material-symbols-outlined">error</span>
                  <span>${escapeHtml(msg.content)}</span>
                </div>
              `
                    : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
}

function attachPanelEvents(ctx) {
   if (!activeChatPanelEl) return;

   const closeBtn = document.getElementById('btn-ai-panel-close');
   const settingsBtn = document.getElementById('btn-ai-panel-settings');
   const modelPill = document.getElementById('ai-panel-model-pill');
   const resetBtn = document.getElementById('btn-ai-panel-reset');
   const textarea = document.getElementById('ai-panel-textarea');
   const sendBtn = document.getElementById('btn-ai-panel-send');

   closeBtn?.addEventListener('click', closeAiPromptBar);

   const handleOpenSettings = () => {
      openAiConfigModal(() => {
         renderChatPanel(ctx);
      });
   };

   settingsBtn?.addEventListener('click', handleOpenSettings);
   modelPill?.addEventListener('click', handleOpenSettings);

   resetBtn?.addEventListener('click', () => {
      chatHistory = [];
      renderChatPanel(ctx);
   });

   // Chips
   activeChatPanelEl.querySelectorAll('.ai-panel-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
         const prompt = chip.getAttribute('data-prompt');
         if (prompt) {
            sendMessage(prompt, ctx);
         }
      });
   });

   // Copy buttons
   activeChatPanelEl.querySelectorAll('.ai-panel-copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
         const sql = btn.getAttribute('data-sql');
         if (!sql) return;
         navigator.clipboard?.writeText(sql).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 13px; color: #10b981;">check</span><span style="color: #10b981;">Copied</span>`;
            setTimeout(() => {
               btn.innerHTML = originalHtml;
            }, 1600);
         });
      });
   });

   // Action buttons: save, insert, run
   activeChatPanelEl.querySelectorAll('.ai-panel-action-btn').forEach((btn) => {
      const action = btn.getAttribute('data-action');
      const sql = btn.getAttribute('data-sql');
      if (!sql) return;

      if (action === 'save') {
         btn.addEventListener('click', () => {
            const msgIdx = btn.closest('.ai-panel-msg-assistant')?.dataset.msgIdx;
            const targetMsg = msgIdx !== undefined ? chatHistory[parseInt(msgIdx, 10)] : null;
            const rawTitle = targetMsg?.explanation || 'AI Query';
            const defaultTitle = rawTitle
               .replace(/[`*#\r\n]/g, ' ')
               .replace(/\s+/g, ' ')
               .trim()
               .slice(0, 36) || 'AI Query';

            openSaveSnippetModal({
               defaultSql: sql,
               defaultTitle,
               onSaved: () => {
                  window.showToast?.('Saved query to Saved Queries', 'success');
               },
            });
         });
      } else if (action === 'insert') {
         btn.addEventListener('click', () => {
            if (ctx.onInsertSql) {
               ctx.onInsertSql(sql);
            } else if (ctx.editorTextarea) {
               ctx.editorTextarea.value = sql;
               ctx.editorTextarea.dispatchEvent(
                  new Event('input', { bubbles: true }),
               );
            }
            window.showToast?.('SQL inserted into editor', 'success');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 13px; color: #10b981;">check</span><span>Inserted</span>`;
            setTimeout(() => {
               btn.innerHTML = originalHtml;
            }, 1600);
         });
      } else if (action === 'run') {
         btn.addEventListener('click', () => {
            if (ctx.editorTextarea) {
               ctx.editorTextarea.value = sql;
               ctx.editorTextarea.dispatchEvent(
                  new Event('input', { bubbles: true }),
               );
            }
            if (ctx.onRunQuery) {
               ctx.onRunQuery(sql);
            }
            window.showToast?.('Running SQL query...', 'info');
         });
      }
   });

   // Textarea auto-resize and Enter to send
   if (textarea) {
      textarea.addEventListener('input', () => {
         textarea.style.height = 'auto';
         textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
      });

      textarea.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = textarea.value.trim();
            if (text && !isGenerating) {
               sendMessage(text, ctx);
            }
         } else if (e.key === 'Escape') {
            closeAiPromptBar();
         }
      });

      setTimeout(() => textarea.focus(), 60);
   }

   sendBtn?.addEventListener('click', () => {
      if (textarea) {
         const text = textarea.value.trim();
         if (text && !isGenerating) {
            sendMessage(text, ctx);
         }
      }
   });
}

function scrollToBottom() {
   requestAnimationFrame(() => {
      const messagesEl = document.getElementById('ai-panel-messages');
      if (messagesEl) {
         messagesEl.scrollTop = messagesEl.scrollHeight;
      }
   });
}

async function sendMessage(promptText, ctx) {
   if (!promptText || isGenerating) return;

   const aiCfg = getStoredAiConfig();
   if (!aiCfg.apiKey && aiCfg.provider !== 'ollama') {
      openAiConfigModal(() => {
         sendMessage(promptText, ctx);
      });
      return;
   }

   chatHistory.push({
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
   });

   isGenerating = true;
   currentLoadingText = 'Generating SQL query...';
   renderChatPanel(ctx);

   const historyForApi = chatHistory
      .slice(0, -1)
      .filter((m) => m.content || m.sql)
      .map((m) => ({
         role: m.role,
         content: m.sql
            ? `SQL: ${m.sql}\nExplanation: ${m.explanation || ''}`
            : m.content,
      }));

   try {
      const res = await generateSqlApi({
         prompt: promptText,
         currentTable: ctx.currentTable || window.AppState?.currentTable,
         history: historyForApi,
         config: aiCfg,
      });

      isGenerating = false;

      if (res.success && res.data) {
         chatHistory.push({
            role: 'assistant',
            explanation: res.data.explanation || '',
            sql: res.data.sql || '',
            model: res.data.model || aiCfg.model || 'AI',
            timestamp: Date.now(),
         });
      } else {
         chatHistory.push({
            role: 'assistant',
            content: res.error || 'Failed to generate query. Please check your AI API key and provider configuration.',
            isError: true,
            timestamp: Date.now(),
         });
      }
   } catch (err) {
      isGenerating = false;
      chatHistory.push({
         role: 'assistant',
         content: err.message || 'Network error while contacting AI API.',
         isError: true,
         timestamp: Date.now(),
      });
   }

   renderChatPanel(ctx);
}

export async function triggerAiFix({
   sql,
   error,
   editorTextarea,
   highlightLayer,
   currentTable,
   onRunQuery,
   onInsertSql,
}) {
   const aiCfg = getStoredAiConfig();
   if (!aiCfg.apiKey && aiCfg.provider !== 'ollama') {
      openAiConfigModal(() => {
         triggerAiFix({
            sql,
            error,
            editorTextarea,
            highlightLayer,
            currentTable,
            onRunQuery,
            onInsertSql,
         });
      });
      return;
   }

   openAiPromptBar({
      editorTextarea,
      highlightLayer,
      currentTable,
      onRunQuery,
      onInsertSql,
   });

   const cleanError = error ? String(error).replace(/\s+/g, ' ').trim() : 'Unknown error';
   const userPrompt = `Fix error in SQL query:\n${cleanError}`;

   chatHistory.push({
      role: 'user',
      content: userPrompt,
      timestamp: Date.now(),
   });

   isGenerating = true;
   currentLoadingText = 'Diagnosing error and generating fix...';
   renderChatPanel({
      editorTextarea,
      highlightLayer,
      currentTable,
      onRunQuery,
      onInsertSql,
   });

   try {
      const res = await fixSqlApi({
         sql,
         error: cleanError,
         currentTable: currentTable || window.AppState?.currentTable,
         config: aiCfg,
      });

      isGenerating = false;

      if (res.success && res.data) {
         chatHistory.push({
            role: 'assistant',
            explanation: res.data.explanation || 'Fixed query error based on schema.',
            sql: res.data.fixedSql || '',
            model: res.data.model || aiCfg.model || 'AI',
            timestamp: Date.now(),
         });
      } else {
         chatHistory.push({
            role: 'assistant',
            content: res.error || 'Failed to fix SQL error automatically.',
            isError: true,
            timestamp: Date.now(),
         });
      }
   } catch (err) {
      isGenerating = false;
      chatHistory.push({
         role: 'assistant',
         content: err.message || 'Network error while generating fix.',
         isError: true,
         timestamp: Date.now(),
      });
   }

   renderChatPanel({
      editorTextarea,
      highlightLayer,
      currentTable,
      onRunQuery,
      onInsertSql,
   });
}

function escapeHtml(str) {
   if (!str) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
   if (!str) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
}
