export function loadConnectView(container) {
   let selectedType = 'sqlite'; // 'sqlite' | 'postgres' | 'mysql'
   const modes = {
      sqlite: 'create', // 'create' | 'existing'
      postgres: 'existing', // 'existing' | 'create'
      mysql: 'existing', // 'existing' | 'create'
   };

   const render = () => {
      container.innerHTML = /* html */ `
      <div class="connect-container">
        <div class="connect-card">
          <div class="connect-header">
            <div class="connect-icon-box">
              <span class="material-symbols-outlined">cable</span>
            </div>
            <h2 class="connect-title">Connect Database</h2>
            <p class="connect-subtitle">Connect to an existing database or create a new local or server database.</p>
          </div>

          <!-- Type Picker -->
          <div class="connect-types-group">
            <button type="button" class="connect-type-btn ${selectedType === 'sqlite' ? 'active' : ''}" data-type="sqlite">
              <span class="material-symbols-outlined">description</span>
              SQLite
            </button>
            <button type="button" class="connect-type-btn ${selectedType === 'postgres' ? 'active' : ''}" data-type="postgres">
              <span class="material-symbols-outlined">database</span>
              PostgreSQL
            </button>
            <button type="button" class="connect-type-btn ${selectedType === 'mysql' ? 'active' : ''}" data-type="mysql">
              <span class="material-symbols-outlined">storage</span>
              MySQL
            </button>
          </div>

          <!-- Form Area -->
          <div id="connect-form-container">
            ${renderForm()}
          </div>
        </div>
      </div>
    `;

      bindEvents();
   };

   const renderForm = () => {
      const currentMode = modes[selectedType];

      if (selectedType === 'sqlite') {
         return /* html */ `
        <div class="connect-form-panel">
          <div class="connect-submode-pills">
            <button type="button" class="connect-pill-btn ${currentMode === 'create' ? 'active' : ''}" data-mode="create">
              <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">add_circle</span>
              Create New Database
            </button>
            <button type="button" class="connect-pill-btn ${currentMode === 'existing' ? 'active' : ''}" data-mode="existing">
              <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">folder_open</span>
              Connect Existing File
            </button>
          </div>

          ${
             currentMode === 'create'
                ? /* html */ `
            <div class="connect-field">
              <label class="connect-label" for="connect-sqlite-name">Database File Name</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-sqlite-name" class="connect-input mono" placeholder="drixio.sqlite" value="drixio.sqlite" />
              </div>
              <p class="connect-hint">A new SQLite database file will be created in your workspace directory.</p>
            </div>
          `
                : /* html */ `
            <div class="connect-field">
              <label class="connect-label" for="connect-sqlite-path">Database Path / URI</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-sqlite-path" class="connect-input mono" placeholder="./drixio.sqlite" value="./drixio.sqlite" />
              </div>
              <p class="connect-hint">Relative or absolute path (e.g. ./drixio.sqlite or file:./db.sqlite).</p>
            </div>
          `
          }

          <label class="connect-checkbox-row">
            <input type="checkbox" id="connect-save-env" checked />
            <span>Save to <code style="font-size: 11px;">.env</code> (DATABASE_URL)</span>
          </label>

          <div id="connect-error-msg" class="connect-msg-box error hidden"></div>

          <div class="connect-action-row">
            <button type="button" id="connect-submit-btn" class="connect-submit-btn">
              <span class="material-symbols-outlined">${currentMode === 'create' ? 'add' : 'link'}</span>
              <span>${currentMode === 'create' ? 'Create & Connect' : 'Connect'}</span>
            </button>
          </div>
        </div>
      `;
      }

      if (selectedType === 'postgres') {
         return /* html */ `
        <div class="connect-form-panel">
          <div class="connect-submode-pills">
            <button type="button" class="connect-pill-btn ${currentMode === 'existing' ? 'active' : ''}" data-mode="existing">
              <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">link</span>
              Connect Existing
            </button>
            <button type="button" class="connect-pill-btn ${currentMode === 'create' ? 'active' : ''}" data-mode="create">
              <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">add_circle</span>
              Create New Database
            </button>
          </div>

          ${
             currentMode === 'existing'
                ? /* html */ `
            <div class="connect-field">
              <label class="connect-label" for="connect-pg-uri">PostgreSQL Connection URI</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-pg-uri" class="connect-input mono" placeholder="postgresql://postgres:password@localhost:5432/database" />
              </div>
              <p class="connect-hint">Format: postgresql://[user]:[password]@[host]:[port]/[database]</p>
            </div>
          `
                : /* html */ `
            <div class="connect-grid-2">
              <div class="connect-field">
                <label class="connect-label" for="connect-server-host">Server Host</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-host" class="connect-input mono" placeholder="localhost" value="localhost" />
                </div>
              </div>
              <div class="connect-field">
                <label class="connect-label" for="connect-server-port">Server Port</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-port" class="connect-input mono" placeholder="5432" value="5432" />
                </div>
              </div>
            </div>

            <div class="connect-grid-2">
              <div class="connect-field">
                <label class="connect-label" for="connect-server-user">Username</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-user" class="connect-input mono" placeholder="postgres" value="postgres" />
                </div>
              </div>
              <div class="connect-field">
                <label class="connect-label" for="connect-server-pass">Password</label>
                <div class="connect-input-wrap">
                  <input type="password" id="connect-server-pass" class="connect-input mono" placeholder="Leave empty if none" />
                </div>
              </div>
            </div>

            <div class="connect-field">
              <label class="connect-label" for="connect-server-dbname">New Database Name</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-server-dbname" class="connect-input mono" placeholder="e.g. my_project" />
              </div>
              <p class="connect-hint">Connects to your local PostgreSQL server to execute CREATE DATABASE.</p>
            </div>
          `
          }

          <label class="connect-checkbox-row">
            <input type="checkbox" id="connect-save-env" checked />
            <span>Save to <code style="font-size: 11px;">.env</code> (DATABASE_URL)</span>
          </label>

          <div id="connect-error-msg" class="connect-msg-box error hidden"></div>

          <div class="connect-action-row">
            <button type="button" id="connect-submit-btn" class="connect-submit-btn">
              <span class="material-symbols-outlined">${currentMode === 'create' ? 'add' : 'link'}</span>
              <span>${currentMode === 'create' ? 'Create & Connect' : 'Connect'}</span>
            </button>
          </div>
        </div>
      `;
      }

      if (selectedType === 'mysql') {
         return /* html */ `
        <div class="connect-form-panel">
          <div class="connect-submode-pills">
            <button type="button" class="connect-pill-btn ${currentMode === 'existing' ? 'active' : ''}" data-mode="existing">
              <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">link</span>
              Connect Existing
            </button>
            <button type="button" class="connect-pill-btn ${currentMode === 'create' ? 'active' : ''}" data-mode="create">
              <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">add_circle</span>
              Create New Database
            </button>
          </div>

          ${
             currentMode === 'existing'
                ? /* html */ `
            <div class="connect-field">
              <label class="connect-label" for="connect-mysql-uri">MySQL Connection URI</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-mysql-uri" class="connect-input mono" placeholder="mysql://root:password@localhost:3306/database" />
              </div>
              <p class="connect-hint">Format: mysql://[user]:[password]@[host]:[port]/[database]</p>
            </div>
          `
                : /* html */ `
            <div class="connect-grid-2">
              <div class="connect-field">
                <label class="connect-label" for="connect-server-host">Server Host</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-host" class="connect-input mono" placeholder="localhost" value="localhost" />
                </div>
              </div>
              <div class="connect-field">
                <label class="connect-label" for="connect-server-port">Server Port</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-port" class="connect-input mono" placeholder="3306" value="3306" />
                </div>
              </div>
            </div>

            <div class="connect-grid-2">
              <div class="connect-field">
                <label class="connect-label" for="connect-server-user">Username</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-user" class="connect-input mono" placeholder="root" value="root" />
                </div>
              </div>
              <div class="connect-field">
                <label class="connect-label" for="connect-server-pass">Password</label>
                <div class="connect-input-wrap">
                  <input type="password" id="connect-server-pass" class="connect-input mono" placeholder="Leave empty if none" />
                </div>
              </div>
            </div>

            <div class="connect-field">
              <label class="connect-label" for="connect-server-dbname">New Database Name</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-server-dbname" class="connect-input mono" placeholder="e.g. my_project" />
              </div>
              <p class="connect-hint">Connects to your local MySQL server to execute CREATE DATABASE.</p>
            </div>
          `
          }

          <label class="connect-checkbox-row">
            <input type="checkbox" id="connect-save-env" checked />
            <span>Save to <code style="font-size: 11px;">.env</code> (DATABASE_URL)</span>
          </label>

          <div id="connect-error-msg" class="connect-msg-box error hidden"></div>

          <div class="connect-action-row">
            <button type="button" id="connect-submit-btn" class="connect-submit-btn">
              <span class="material-symbols-outlined">${currentMode === 'create' ? 'add' : 'link'}</span>
              <span>${currentMode === 'create' ? 'Create & Connect' : 'Connect'}</span>
            </button>
          </div>
        </div>
      `;
      }

      return '';
   };

   const bindEvents = () => {
      // Type Buttons (SQLite, Postgres, MySQL)
      container.querySelectorAll('.connect-type-btn').forEach((btn) => {
         btn.onclick = () => {
            selectedType = btn.dataset.type;
            render();
         };
      });

      // Submode Pills (Create vs Existing)
      container.querySelectorAll('.connect-pill-btn').forEach((btn) => {
         btn.onclick = () => {
            modes[selectedType] = btn.dataset.mode;
            render();
         };
      });

      // Submit Action
      const submitBtn = container.querySelector('#connect-submit-btn');
      const errorBox = container.querySelector('#connect-error-msg');
      const saveEnvCheckbox = container.querySelector('#connect-save-env');

      if (submitBtn) {
         submitBtn.onclick = async () => {
            const currentMode = modes[selectedType];
            let payload = null;

            if (
               currentMode === 'create' &&
               (selectedType === 'postgres' || selectedType === 'mysql')
            ) {
               const host =
                  container
                     .querySelector('#connect-server-host')
                     ?.value.trim() || 'localhost';
               const port =
                  container
                     .querySelector('#connect-server-port')
                     ?.value.trim() ||
                  (selectedType === 'mysql' ? '3306' : '5432');
               const user =
                  container
                     .querySelector('#connect-server-user')
                     ?.value.trim() ||
                  (selectedType === 'mysql' ? 'root' : 'postgres');
               const password =
                  container.querySelector('#connect-server-pass')?.value || '';
               const dbName = container
                  .querySelector('#connect-server-dbname')
                  ?.value.trim();

               if (!dbName) {
                  if (errorBox) {
                     errorBox.textContent =
                        'Please enter a new database name to create.';
                     errorBox.classList.remove('hidden');
                  }
                  return;
               }

               payload = {
                  mode: 'create',
                  dbType: selectedType,
                  host,
                  port,
                  user,
                  password,
                  dbName,
                  saveToEnv: saveEnvCheckbox?.checked ?? false,
               };
            } else if (selectedType === 'sqlite' && currentMode === 'create') {
               const nameInput = container.querySelector(
                  '#connect-sqlite-name',
               );
               let name = nameInput ? nameInput.value.trim() : '';
               if (!name) name = 'drixio.sqlite';
               if (
                  !name.endsWith('.sqlite') &&
                  !name.endsWith('.db') &&
                  !name.endsWith('.sqlite3')
               ) {
                  name += '.sqlite';
               }
               payload = {
                  url: `./${name}`,
                  createIfNotExist: true,
                  saveToEnv: saveEnvCheckbox?.checked ?? false,
               };
            } else {
               // Existing connection mode (SQLite / Postgres / MySQL)
               let url = '';
               if (selectedType === 'sqlite') {
                  url =
                     container
                        .querySelector('#connect-sqlite-path')
                        ?.value.trim() || '';
               } else if (selectedType === 'postgres') {
                  url =
                     container.querySelector('#connect-pg-uri')?.value.trim() ||
                     '';
               } else if (selectedType === 'mysql') {
                  url =
                     container
                        .querySelector('#connect-mysql-uri')
                        ?.value.trim() || '';
               }

               if (!url) {
                  if (errorBox) {
                     errorBox.textContent =
                        'Please enter a database URL or path.';
                     errorBox.classList.remove('hidden');
                  }
                  return;
               }

               payload = {
                  url,
                  createIfNotExist: false,
                  saveToEnv: saveEnvCheckbox?.checked ?? false,
               };
            }

            const originalBtnHtml = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = /* html */ `
          <span class="material-symbols-outlined animate-spin" style="font-size: 18px;">sync</span>
          <span>Connecting...</span>
        `;
            if (errorBox) errorBox.classList.add('hidden');

            try {
               const res = await fetch('/api/connect', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
               });
               const data = await res.json();

               if (!data.success) {
                  throw new Error(data.error || 'Failed to connect');
               }

               if (window.showToast) {
                  window.showToast(
                     'Database connected successfully!',
                     'success',
                  );
               }

               // Refresh Sidebar table list first so tables are in DOM
               if (window.initSidebar) {
                  await window.initSidebar(true);
               }

               // Switch UI to connected mode
               if (window.setStudioConnectionMode) {
                  window.setStudioConnectionMode(true);
               }

               // Switch tab to data view
               if (window.handleSwitchTab) {
                  window.handleSwitchTab('data-btn');
               }
            } catch (err) {
               submitBtn.disabled = false;
               submitBtn.innerHTML = originalBtnHtml;
               if (errorBox) {
                  errorBox.textContent = err.message;
                  errorBox.classList.remove('hidden');
               }
               if (window.showToast) {
                  window.showToast(err.message, 'error');
               }
            }
         };
      }
   };

   render();
}
