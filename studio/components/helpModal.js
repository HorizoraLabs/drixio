/**
 * Help & Shortcuts Modal Component for Drixio Studio
 * Shows global keyboard shortcuts, tips, and documentation links.
 */

let helpModalOverlay = null;

export function openHelpModal() {
   if (!helpModalOverlay) {
      createHelpModalDOM();
   }
   helpModalOverlay.classList.remove('hidden');
}

export function closeHelpModal() {
   if (helpModalOverlay) {
      helpModalOverlay.classList.add('hidden');
   }
}

function createHelpModalDOM() {
   helpModalOverlay = document.createElement('div');
   helpModalOverlay.id = 'help-modal-overlay';
   helpModalOverlay.className = 'modal-overlay hidden';

   helpModalOverlay.innerHTML = /* html */ `
      <div class="modal-container help-modal-card">
         <div class="modal-header">
            <div class="import-modal-title-wrap">
               <div class="import-icon-badge">
                  <span class="material-symbols-outlined">help</span>
               </div>
               <div>
                  <h3 class="import-modal-title">Shortcuts & Documentation</h3>
                  <p class="import-modal-subtitle">Drixio Studio Edition Tips & Resources</p>
               </div>
            </div>
            <button type="button" id="help-modal-close-btn" class="modal-close-btn" aria-label="Close modal">✕</button>
         </div>

         <div class="help-modal-body">
            <div class="shortcuts-group">
               <h4 class="shortcuts-group-title">Global Shortcuts</h4>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Quick Search / Focus Table Filter</span>
                  <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>/</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Close Modal / Dismiss Popover</span>
                  <div class="shortcut-keys"><kbd>Esc</kbd></div>
               </div>
            </div>

            <div class="shortcuts-group">
               <h4 class="shortcuts-group-title">Data Grid & Editor</h4>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Inline Edit Cell</span>
                  <div class="shortcut-keys"><kbd>Double Click</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Save Cell Edit</span>
                  <div class="shortcut-keys"><kbd>Enter</kbd></div>
               </div>
               <div class="shortcut-row">
                  <span class="shortcut-desc">Run Query in SQL Console</span>
                  <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></div>
               </div>
            </div>

            <div class="help-links-group">
               <a href="https://github.com/TerKSDev/drixio" target="_blank" rel="noopener noreferrer" class="help-link-card">
                  <span class="material-symbols-outlined">code</span>
                  <div>
                     <span class="link-card-title">GitHub Repository</span>
                     <span class="link-card-desc">Source code, releases, and roadmap</span>
                  </div>
                  <span class="material-symbols-outlined card-arrow">open_in_new</span>
               </a>
               <a href="https://github.com/TerKSDev/drixio/issues" target="_blank" rel="noopener noreferrer" class="help-link-card">
                  <span class="material-symbols-outlined">bug_report</span>
                  <div>
                     <span class="link-card-title">Report an Issue</span>
                     <span class="link-card-desc">Found a bug or have a suggestion?</span>
                  </div>
                  <span class="material-symbols-outlined card-arrow">open_in_new</span>
               </a>
            </div>
         </div>

         <div class="modal-footer help-modal-footer">
            <span class="help-version-tag">Drixio Studio Edition</span>
            <button type="button" id="help-modal-done-btn" class="import-cancel-btn">Close</button>
         </div>
      </div>
   `;

   document.body.appendChild(helpModalOverlay);

   const closeBtn = document.getElementById('help-modal-close-btn');
   const doneBtn = document.getElementById('help-modal-done-btn');

   closeBtn?.addEventListener('click', closeHelpModal);
   doneBtn?.addEventListener('click', closeHelpModal);

   helpModalOverlay.addEventListener('click', (e) => {
      if (e.target === helpModalOverlay) {
         closeHelpModal();
      }
   });

   document.addEventListener('keydown', (e) => {
      if (
         e.key === 'Escape' &&
         helpModalOverlay &&
         !helpModalOverlay.classList.contains('hidden')
      ) {
         closeHelpModal();
      }
   });
}
