/**
 * AI Configuration Modal Component for Drixio Studio
 * Manages provider presets (DeepSeek, Ollama, OpenAI, Custom), API keys, Base URLs, and connection tests.
 * Standardized using Drixio Global createModal component.
 */

import { testAiApi } from '../lib/api.js';
import { createModal } from './modal.js';

const STORAGE_KEY = 'drixio_ai_config';

export const AI_PRESETS = {
   deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      placeholderKey: 'sk-... (DeepSeek API Key)',
      badge: 'Recommended',
   },
   ollama: {
      name: 'Ollama (Local Offline)',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
      placeholderKey: 'ollama (no key needed)',
      badge: '100% Free & Local',
   },
   openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      placeholderKey: 'sk-... (OpenAI API Key)',
   },
   custom: {
      name: 'Custom OpenAI-Compatible',
      baseUrl: 'https://your-api.com/v1',
      model: 'gpt-3.5-turbo',
      placeholderKey: 'Your API key',
   },
};

export function getStoredAiConfig() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
   } catch {}
   return {
      provider: 'deepseek',
      baseUrl: AI_PRESETS.deepseek.baseUrl,
      apiKey: '',
      model: AI_PRESETS.deepseek.model,
   };
}

export function saveAiConfig(cfg) {
   try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
   } catch {}
}

export function openAiConfigModal(onSaved) {
   const current = getStoredAiConfig();
   const activeProvider = current.provider || 'deepseek';

   const modalInstance = createModal({
      id: 'ai-config-modal-overlay',
      className: 'ai-config-modal',
      icon: 'smart_toy',
      iconColor: 'primary',
      title: 'AI Assistant Settings',
      subtitle: 'Configure AI models for Text-to-SQL, query explain, and auto-repair',
      badge: 'OPT-IN',
      width: '560px',
      body: /* html */ `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- Provider Presets -->
          <div>
            <label class="form-label" style="font-size: 11px; font-weight: 700; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 8px;">Select Provider</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" id="ai-provider-options">
              ${Object.entries(AI_PRESETS)
                 .map(([key, preset]) => {
                    const isSelected = key === activeProvider;
                    return `
                <button type="button" class="ai-provider-card ${isSelected ? 'selected' : ''}" data-provider="${key}">
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-13">${preset.name}</span>
                    ${preset.badge ? `<span class="ai-provider-badge">${preset.badge}</span>` : ''}
                  </div>
                  <div class="text-11 text-secondary mt-1 font-mono" style="opacity: 0.8;">${preset.model}</div>
                </button>
              `;
                 })
                 .join('')}
            </div>
          </div>

          <!-- Base URL Input -->
          <div>
            <label class="form-label" for="ai-base-url-input" style="font-size: 12px; font-weight: 600; color: var(--color-text-secondary); display: block; margin-bottom: 6px;">Base URL</label>
            <input type="text" id="ai-base-url-input" class="modal-input font-mono" value="${current.baseUrl || ''}" placeholder="https://api.deepseek.com/v1" style="width: 100%; height: 36px; padding: 0 10px; font-size: 12.5px;" spellcheck="false" autocomplete="off" />
          </div>

          <!-- API Key Input -->
          <div>
            <label class="form-label" for="ai-api-key-input" style="font-size: 12px; font-weight: 600; color: var(--color-text-secondary); display: block; margin-bottom: 6px;">API Key</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="ai-api-key-input" class="modal-input font-mono" value="${current.apiKey || ''}" placeholder="Enter your API Key..." style="width: 100%; height: 36px; padding: 0 38px 0 10px; font-size: 12.5px;" spellcheck="false" autocomplete="off" />
              <button type="button" id="btn-toggle-key-visibility" class="modal-input-icon-btn" style="position: absolute; right: 6px; background: transparent; border: none; color: var(--color-text-soft); cursor: pointer; display: flex; align-items: center;" title="Show/hide key">
                <span class="material-symbols-outlined" style="font-size: 16px;">visibility</span>
              </button>
            </div>
            <div class="text-11 text-secondary mt-2" style="opacity: 0.75;">Stored safely in your local browser storage. Never sent to any third party.</div>
          </div>

          <!-- Model Name Input -->
          <div>
            <label class="form-label" for="ai-model-input" style="font-size: 12px; font-weight: 600; color: var(--color-text-secondary); display: block; margin-bottom: 6px;">Model Name</label>
            <input type="text" id="ai-model-input" class="modal-input font-mono" value="${current.model || ''}" placeholder="deepseek-chat" style="width: 100%; height: 36px; padding: 0 10px; font-size: 12.5px;" spellcheck="false" autocomplete="off" />
          </div>

          <!-- Test Connection Diagnostic Bar -->
          <div id="ai-test-status" class="ai-test-status hidden" style="padding: 10px 14px; border-radius: 6px; font-size: 12px;"></div>
        </div>
      `,
      footer: /* html */ `
        <div class="flex items-center justify-between w-full">
          <button type="button" id="btn-ai-test-connection" class="btn-secondary flex items-center gap-1.5" style="padding: 6px 12px; font-size: 12px;">
            <span class="material-symbols-outlined" style="font-size: 15px;">wifi_tethering</span>
            <span>Test Connection</span>
          </button>
          <div class="flex items-center gap-2">
            <button type="button" id="cancel-ai-config-btn" class="btn-secondary">Cancel</button>
            <button type="button" id="save-ai-config-btn" class="btn-primary flex items-center gap-1.5">
              <span class="material-symbols-outlined" style="font-size: 16px;">check</span>
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      `,
   });

   const cancelBtn = document.getElementById('cancel-ai-config-btn');
   const saveBtn = document.getElementById('save-ai-config-btn');
   const testBtn = document.getElementById('btn-ai-test-connection');
   const toggleKeyBtn = document.getElementById('btn-toggle-key-visibility');
   const keyInput = document.getElementById('ai-api-key-input');
   const urlInput = document.getElementById('ai-base-url-input');
   const modelInput = document.getElementById('ai-model-input');
   const testStatus = document.getElementById('ai-test-status');

   if (cancelBtn) {
      cancelBtn.onclick = () => modalInstance.close();
   }

   // Toggle password visibility
   if (toggleKeyBtn && keyInput) {
      toggleKeyBtn.onclick = () => {
         const isPwd = keyInput.type === 'password';
         keyInput.type = isPwd ? 'text' : 'password';
         const icon = toggleKeyBtn.querySelector('.material-symbols-outlined');
         if (icon) icon.textContent = isPwd ? 'visibility_off' : 'visibility';
      };
   }

   // Preset selection
   let selectedProvider = activeProvider;
   const modalOverlay = document.getElementById('ai-config-modal-overlay');
   if (modalOverlay) {
      modalOverlay.querySelectorAll('.ai-provider-card').forEach((card) => {
         card.onclick = () => {
            modalOverlay.querySelectorAll('.ai-provider-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedProvider = card.dataset.provider;

            const preset = AI_PRESETS[selectedProvider];
            if (preset) {
               if (urlInput) urlInput.value = preset.baseUrl;
               if (modelInput) modelInput.value = preset.model;
               if (keyInput) {
                  keyInput.placeholder = preset.placeholderKey;
                  if (selectedProvider === 'ollama' && !keyInput.value) {
                     keyInput.value = 'ollama';
                  }
               }
            }
         };
      });
   }

   // Test connection
   if (testBtn) {
      testBtn.onclick = async () => {
         const cfg = {
            provider: selectedProvider,
            baseUrl: urlInput ? urlInput.value.trim() : '',
            apiKey: keyInput ? keyInput.value.trim() : '',
            model: modelInput ? modelInput.value.trim() : '',
         };

         testBtn.disabled = true;
         testBtn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size: 15px;">progress_activity</span><span>Testing...</span>';
         if (testStatus) testStatus.className = 'ai-test-status hidden';

         try {
            const res = await testAiApi(cfg);
            testBtn.disabled = false;
            testBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 15px;">wifi_tethering</span><span>Test Connection</span>';

            if (testStatus) {
               testStatus.classList.remove('hidden');
               if (res.success) {
                  testStatus.className = 'ai-test-status success';
                  testStatus.innerHTML = `✓ ${res.message || 'Connected successfully!'}`;
               } else {
                  testStatus.className = 'ai-test-status error';
                  testStatus.innerHTML = `✕ Test failed: ${res.error || 'Check Base URL and API Key'}`;
               }
            }
         } catch (err) {
            testBtn.disabled = false;
            testBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 15px;">wifi_tethering</span><span>Test Connection</span>';
            if (testStatus) {
               testStatus.classList.remove('hidden');
               testStatus.className = 'ai-test-status error';
               testStatus.innerHTML = `✕ Test error: ${err.message}`;
            }
         }
      };
   }

   // Save settings
   if (saveBtn) {
      saveBtn.onclick = () => {
         const cfg = {
            provider: selectedProvider,
            baseUrl: urlInput ? urlInput.value.trim() : '',
            apiKey: keyInput ? keyInput.value.trim() : '',
            model: modelInput ? modelInput.value.trim() : '',
         };
         saveAiConfig(cfg);
         window.showToast?.('AI settings saved successfully!', 'success');
         modalInstance.close();
         if (onSaved) onSaved(cfg);
      };
   }
}
