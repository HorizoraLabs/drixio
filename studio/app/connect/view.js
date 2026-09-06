export function loadConnectView(container) {
   let selectedType = 'sqlite'; // 'sqlite' | 'postgres' | 'mysql'
   const modes = {
      sqlite: 'create', // 'create' | 'existing'
      postgres: 'existing', // 'existing' | 'create'
      mysql: 'existing', // 'existing' | 'create'
   };

   let testStatus = {
      state: 'idle', // 'idle' | 'testing' | 'success' | 'error'
      message:
         'Click "Test Connection" to verify connection parameters before proceeding.',
      latencyMs: null,
      error: '',
   };

   const engineMeta = {
      sqlite: {
         name: 'SQLite',
         badge: 'Local File',
         icon: 'description',
         desc: 'Zero-config local file database.',
      },
      postgres: {
         name: 'PostgreSQL',
         badge: 'Server Instance',
         icon: 'database',
         desc: 'Enterprise object-relational database.',
      },
      mysql: {
         name: 'MySQL',
         badge: 'Server Instance',
         icon: 'storage',
         desc: 'High-performance relational database.',
      },
   };

   const modeDescriptions = {
      sqlite: {
         create: {
            title: 'About Create New (SQLite)',
            desc: 'Initializes a new, zero-configuration SQLite database file directly in your workspace directory root. No database server or credentials needed.',
            action:
               'Will initialize a new SQLite database file and prepare schema.',
         },
         existing: {
            title: 'About Connect Existing (SQLite)',
            desc: 'Connects to an existing SQLite database file (.sqlite, .db, .sqlite3) located in your workspace or file system to inspect schema and browse data.',
            action: 'Will verify existing file on disk and inspect tables.',
         },
      },
      postgres: {
         create: {
            title: 'About Create New (PostgreSQL)',
            desc: 'Connects to your PostgreSQL server instance using administrative credentials and automatically executes "CREATE DATABASE" to set up your project database.',
            action:
               'Will connect to PostgreSQL server and run CREATE DATABASE.',
         },
         existing: {
            title: 'About Connect Existing (PostgreSQL)',
            desc: 'Connects to an already running PostgreSQL database instance via standard connection URI. Automatically introspects schemas, tables, and foreign keys.',
            action: 'Will establish client connection and map schema tables.',
         },
      },
      mysql: {
         create: {
            title: 'About Create New (MySQL)',
            desc: 'Connects to your MySQL / MariaDB server instance using administrative credentials and executes "CREATE DATABASE" to initialize your new database.',
            action: 'Will connect to MySQL server and run CREATE DATABASE.',
         },
         existing: {
            title: 'About Connect Existing (MySQL)',
            desc: 'Connects to an existing MySQL / MariaDB database service via standard connection URI. Instantly maps tables and relation structures.',
            action: 'Will connect to MySQL database and inspect tables.',
         },
      },
   };

   const presets = {
      sqlite: [
         {
            label: 'drixio.sqlite',
            val: 'drixio.sqlite',
            path: './drixio.sqlite',
         },
         { label: 'data.db', val: 'data.db', path: './data.db' },
      ],
      postgres: [
         {
            label: 'Default',
            uri: 'postgresql://postgres:postgres@localhost:5432/postgres',
         },
         { label: 'Localhost', uri: 'postgresql://localhost:5432/mydb' },
      ],
      mysql: [
         {
            label: 'Default',
            uri: 'mysql://root:password@localhost:3306/mysql',
         },
         { label: 'No Pass', uri: 'mysql://root:@localhost:3306/mydb' },
      ],
   };

   const parseConnectionUri = (rawUri) => {
      if (!rawUri || typeof rawUri !== 'string') return null;
      let clean = rawUri.trim();
      clean = clean.replace(/^["']|["']$/g, '');
      if (clean.includes('=')) {
         clean = clean
            .split('=')
            .slice(1)
            .join('=')
            .trim()
            .replace(/^["']|["']$/g, '');
      }
      try {
         let uriToParse = clean;
         if (!clean.includes('://')) {
            uriToParse = `${selectedType}://${clean}`;
         }
         const url = new URL(uriToParse);
         const proto = url.protocol.replace(':', '').toLowerCase();
         const dialect = proto.startsWith('post')
            ? 'postgres'
            : proto.startsWith('my')
              ? 'mysql'
              : proto;

         const host = url.hostname || 'localhost';
         const defaultPort = dialect === 'mysql' ? '3306' : '5432';
         const port = url.port || defaultPort;
         const defaultUser = dialect === 'mysql' ? 'root' : 'postgres';
         const user = decodeURIComponent(url.username || defaultUser);
         const password = decodeURIComponent(url.password || '');
         const pathname = url.pathname.replace(/^\//, '');
         const defaultDb = dialect === 'mysql' ? 'mysql' : 'postgres';
         const dbName = decodeURIComponent(pathname.split('?')[0] || defaultDb);

         return {
            dialect,
            host,
            port,
            user,
            password,
            dbName,
         };
      } catch {
         return null;
      }
   };

   const applyParsedUri = (rawUri) => {
      const parsed = parseConnectionUri(rawUri);
      if (!parsed) {
         if (window.showToast) {
            window.showToast('Invalid connection string format.', 'error');
         }
         return false;
      }

      if (
         parsed.dialect &&
         parsed.dialect !== selectedType &&
         ['postgres', 'mysql'].includes(parsed.dialect)
      ) {
         selectedType = parsed.dialect;
         render();
      }

      const hostInput = container.querySelector('#connect-server-host');
      const portInput = container.querySelector('#connect-server-port');
      const userInput = container.querySelector('#connect-server-user');
      const passInput = container.querySelector('#connect-server-pass');
      const dbInput = container.querySelector('#connect-server-dbname');
      const smartUriInput = container.querySelector('#connect-smart-uri-input');

      if (hostInput) hostInput.value = parsed.host;
      if (portInput) portInput.value = parsed.port;
      if (userInput) userInput.value = parsed.user;
      if (passInput) passInput.value = parsed.password;
      if (dbInput) dbInput.value = parsed.dbName;
      if (smartUriInput && smartUriInput.value.trim() !== rawUri.trim()) {
         smartUriInput.value = rawUri.trim();
      }

      updatePreviewUI();
      if (testStatus.state !== 'idle') {
         testStatus = {
            state: 'idle',
            message: '',
            latencyMs: null,
            error: '',
         };
         updateTestStatusUI();
      }

      if (window.showToast) {
         window.showToast(
            'Parameters auto-filled from connection URL!',
            'success',
         );
      }
      return true;
   };

   const getCalculatedUrl = () => {
      const currentMode = modes[selectedType];
      if (selectedType === 'sqlite') {
         if (currentMode === 'create') {
            const nameInput = container.querySelector('#connect-sqlite-name');
            let name = nameInput?.value.trim() || 'drixio.sqlite';
            if (
               !name.endsWith('.sqlite') &&
               !name.endsWith('.db') &&
               !name.endsWith('.sqlite3')
            ) {
               name += '.sqlite';
            }
            return `./${name}`;
         }
         return (
            container.querySelector('#connect-sqlite-path')?.value.trim() ||
            './drixio.sqlite'
         );
      }

      if (selectedType === 'postgres' || selectedType === 'mysql') {
         const host =
            container.querySelector('#connect-server-host')?.value.trim() ||
            'localhost';
         const defaultPort = selectedType === 'postgres' ? '5432' : '3306';
         const port =
            container.querySelector('#connect-server-port')?.value.trim() ||
            defaultPort;
         const defaultUser = selectedType === 'postgres' ? 'postgres' : 'root';
         const user =
            container.querySelector('#connect-server-user')?.value.trim() ||
            defaultUser;
         const password =
            container.querySelector('#connect-server-pass')?.value || '';
         const defaultDb =
            currentMode === 'create'
               ? 'new_db'
               : selectedType === 'postgres'
                 ? 'postgres'
                 : 'mysql';
         const dbName =
            container.querySelector('#connect-server-dbname')?.value.trim() ||
            defaultDb;

         const auth = password
            ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
            : user
              ? `${encodeURIComponent(user)}@`
              : '';
         return `${selectedType}://${auth}${host}:${port}/${dbName}`;
      }

      return '';
   };

   const getTargetDbName = () => {
      const currentMode = modes[selectedType];
      if (selectedType === 'sqlite') {
         if (currentMode === 'create') {
            const name =
               container.querySelector('#connect-sqlite-name')?.value.trim() ||
               'drixio.sqlite';
            return name;
         }
         const pathVal =
            container.querySelector('#connect-sqlite-path')?.value.trim() ||
            'drixio.sqlite';
         return pathVal.split(/[/\\]/).pop() || 'drixio.sqlite';
      }
      const defaultDb =
         currentMode === 'create'
            ? 'new_db'
            : selectedType === 'postgres'
              ? 'postgres'
              : 'mysql';
      return (
         container.querySelector('#connect-server-dbname')?.value.trim() ||
         defaultDb
      );
   };

   const getTargetLocation = () => {
      if (selectedType === 'sqlite') {
         return `<workspace root>/${getTargetDbName()}`;
      }
      const host =
         container.querySelector('#connect-server-host')?.value.trim() ||
         'localhost';
      const defaultPort = selectedType === 'postgres' ? '5432' : '3306';
      const port =
         container.querySelector('#connect-server-port')?.value.trim() ||
         defaultPort;
      return `${host}:${port}`;
   };

   const updatePreviewUI = () => {
      const urlBox = container.querySelector('#preview-conn-url');
      const dbNameBox = container.querySelector('#preview-db-name');
      const locationBox = container.querySelector('#preview-location');
      const envBox = container.querySelector('#preview-env-output');
      const saveEnvCheckbox = container.querySelector('#connect-save-env');

      const url = getCalculatedUrl();
      if (urlBox) urlBox.textContent = url;
      if (dbNameBox) dbNameBox.textContent = getTargetDbName();
      if (locationBox) locationBox.textContent = getTargetLocation();
      if (envBox) {
         if (saveEnvCheckbox?.checked) {
            envBox.textContent = `DATABASE_URL="${url}"`;
            envBox.classList.remove('disabled');
         } else {
            envBox.textContent = '(Will not write to .env)';
            envBox.classList.add('disabled');
         }
      }
   };

   const updateTestStatusUI = () => {
      const statusBadge = container.querySelector('#test-status-badge');
      const statusMsg = container.querySelector('#test-status-msg');
      const testBtn = container.querySelector('#run-test-btn');

      if (!statusBadge || !statusMsg || !testBtn) return;

      if (testStatus.state === 'testing') {
         statusBadge.className = 'test-badge testing';
         statusBadge.innerHTML = /* html */ `
            <span class="material-symbols-outlined animate-spin" style="font-size: 13px;">sync</span>
            <span>Testing Connection...</span>
         `;
         statusMsg.textContent = 'Contacting database target...';
         testBtn.disabled = true;
      } else if (testStatus.state === 'success') {
         statusBadge.className = 'test-badge success';
         statusBadge.innerHTML = /* html */ `
            <span class="status-dot green"></span>
            <span>Reachable ${testStatus.latencyMs !== null ? `(${testStatus.latencyMs}ms)` : ''}</span>
         `;
         statusMsg.textContent = testStatus.message;
         testBtn.disabled = false;
      } else if (testStatus.state === 'error') {
         statusBadge.className = 'test-badge error';
         statusBadge.innerHTML = /* html */ `
            <span class="status-dot red"></span>
            <span>Connection Failed</span>
         `;
         statusMsg.textContent =
            testStatus.error || 'Unable to establish connection.';
         testBtn.disabled = false;
      } else {
         statusBadge.className = 'test-badge idle';
         statusBadge.innerHTML = /* html */ `
            <span class="status-dot gray"></span>
            <span>Not Tested</span>
         `;
         statusMsg.textContent =
            'Click "Test Connection" to verify connectivity before proceeding.';
         testBtn.disabled = false;
      }
   };

   const runTestConnection = async () => {
      testStatus = {
         state: 'testing',
         message: '',
         latencyMs: null,
         error: '',
      };
      updateTestStatusUI();

      const currentMode = modes[selectedType];
      let payload = null;

      if (
         currentMode === 'create' &&
         (selectedType === 'postgres' || selectedType === 'mysql')
      ) {
         const host =
            container.querySelector('#connect-server-host')?.value.trim() ||
            'localhost';
         const port =
            container.querySelector('#connect-server-port')?.value.trim() ||
            (selectedType === 'mysql' ? '3306' : '5432');
         const user =
            container.querySelector('#connect-server-user')?.value.trim() ||
            (selectedType === 'mysql' ? 'root' : 'postgres');
         const password =
            container.querySelector('#connect-server-pass')?.value || '';
         const dbName =
            container.querySelector('#connect-server-dbname')?.value.trim() ||
            'new_db';
         payload = {
            mode: 'create',
            dbType: selectedType,
            host,
            port,
            user,
            password,
            dbName,
         };
      } else if (selectedType === 'sqlite' && currentMode === 'create') {
         const nameInput = container.querySelector('#connect-sqlite-name');
         let name = nameInput ? nameInput.value.trim() : 'drixio.sqlite';
         if (
            !name.endsWith('.sqlite') &&
            !name.endsWith('.db') &&
            !name.endsWith('.sqlite3')
         )
            name += '.sqlite';
         payload = { mode: 'create', dbType: 'sqlite', url: `./${name}` };
      } else {
         let url = '';
         if (selectedType === 'sqlite') {
            url =
               container.querySelector('#connect-sqlite-path')?.value.trim() ||
               './drixio.sqlite';
         } else {
            url = getCalculatedUrl();
         }
         payload = { mode: 'existing', dbType: selectedType, url };
      }

      try {
         const res = await fetch('/api/test-connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
         });
         const data = await res.json();
         if (!data.success) {
            throw new Error(data.error || 'Connection test failed');
         }
         testStatus = {
            state: 'success',
            message:
               data.data?.message || 'Database target reachable and verified.',
            latencyMs: data.data?.latencyMs ?? 1,
            error: '',
         };
      } catch (err) {
         testStatus = {
            state: 'error',
            message: '',
            latencyMs: null,
            error: err.message,
         };
      }
      updateTestStatusUI();
   };

   const render = () => {
      const currentMode = modes[selectedType];
      const engine = engineMeta[selectedType];
      const modeExplanation = modeDescriptions[selectedType]?.[currentMode] || {
         title: '',
         desc: '',
         action: '',
      };
      const activePresets = presets[selectedType] || [];

      container.innerHTML = /* html */ `
      <div class="connect-fullpage">
        <!-- True 2-Column Workbench: Left = Configuration, Right = Live Diagnostics & Preview -->
        <div class="connect-workbench-layout">
          <!-- Left Column: Unified Configuration Panel -->
          <section class="connect-config-pane">
            <!-- Step 1: Engine Selection -->
            <div class="connect-form-section">
              <div class="connect-section-header">
                <span class="connect-step-tag">1</span>
                <span>Select Database Dialect</span>
              </div>
              <div class="connect-engine-grid">
                ${['sqlite', 'postgres', 'mysql']
                   .map((type) => {
                      const meta = engineMeta[type];
                      const isActive = selectedType === type;
                      return /* html */ `
                    <div class="connect-engine-card ${isActive ? 'active' : ''}" data-type="${type}">
                      <div class="connect-engine-card-top">
                        <div class="connect-engine-card-icon">
                          <span class="material-symbols-outlined">${meta.icon}</span>
                        </div>
                        <div class="connect-engine-card-radio">
                          <span class="material-symbols-outlined">${isActive ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                        </div>
                      </div>
                      <div class="connect-engine-card-content">
                        <div class="connect-engine-card-header">
                          <span class="engine-title">${meta.name}</span>
                          <span class="engine-badge">${meta.badge}</span>
                        </div>
                        <span class="engine-desc">${meta.desc}</span>
                      </div>
                    </div>
                  `;
                   })
                   .join('')}
              </div>
            </div>

            <!-- Step 2: Configuration & Parameters with Integrated Mode Tabs -->
            <div class="connect-form-section">
              <div class="connect-section-header-row">
                <div class="connect-section-header">
                  <span class="connect-step-tag">2</span>
                  <span>Configuration & Parameters</span>
                </div>

                <div class="connect-mode-segmented">
                  <button type="button" class="connect-mode-btn ${currentMode === 'existing' ? 'active' : ''}" data-mode="existing">
                    <span class="material-symbols-outlined">link</span>
                    <span>Connect Existing</span>
                  </button>
                  <button type="button" class="connect-mode-btn ${currentMode === 'create' ? 'active' : ''}" data-mode="create">
                    <span class="material-symbols-outlined">add_circle</span>
                    <span>Create New</span>
                  </button>
                </div>
              </div>

              <!-- Inline Mode Explanation Callout -->
              <div class="connect-mode-callout">
                <span class="material-symbols-outlined icon-info">info</span>
                <span class="callout-desc">${modeExplanation.desc}</span>
              </div>

              <div class="connect-form-body">
                ${renderFields(selectedType, currentMode)}

                <!-- Quick Presets -->
                ${
                   activePresets.length > 0
                      ? /* html */ `
                  <div class="connect-presets-group">
                    <span class="connect-presets-label">Presets:</span>
                    <div class="connect-presets-chips">
                      ${activePresets
                         .map((p) => {
                            const fillVal =
                               p.uri ||
                               (currentMode === 'create' ? p.val : p.path);
                            return /* html */ `
                          <button type="button" class="connect-preset-chip" data-fill="${fillVal}">
                            <code>${p.label}</code>
                          </button>
                        `;
                         })
                         .join('')}
                    </div>
                  </div>
                `
                      : ''
                }

                <!-- Save to .env Checkbox -->
                <label class="connect-checkbox-row">
                  <input type="checkbox" id="connect-save-env" checked />
                  <div class="connect-checkbox-info">
                    <span class="checkbox-title">Save connection string to <code class="env-code">.env</code> (DATABASE_URL)</span>
                    <span class="checkbox-desc">Automatically saves URL so Drixio CLI and Studio load this database on startup.</span>
                  </div>
                </label>

                <!-- Error Box -->
                <div id="connect-error-msg" class="connect-msg-box error hidden"></div>

                <!-- Submit Action Button -->
                <div class="connect-action-row">
                  <button type="button" id="connect-submit-btn" class="connect-submit-btn">
                    <span class="material-symbols-outlined">${currentMode === 'create' ? 'rocket_launch' : 'cable'}</span>
                    <span>${currentMode === 'create' ? 'Create & Connect Database' : 'Connect to Database'}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Right Column: Live Diagnostics & Preview -->
          <section class="connect-preview-pane">
            <!-- Card 1: Connection Health & Live Test -->
            <div class="connect-card-box">
                <div class="card-box-header">
                  <div class="card-box-title">
                    <span class="material-symbols-outlined icon-blue">network_check</span>
                    <span>Connection Diagnostics</span>
                  </div>
                  <button type="button" id="run-test-btn" class="connect-test-btn">
                    <span class="material-symbols-outlined">bolt</span>
                    <span>Test Connection</span>
                  </button>
                </div>
                <div class="card-box-body">
                  <div class="test-status-row">
                    <div id="test-status-badge" class="test-badge idle">
                      <span class="status-dot gray"></span>
                      <span>Not Tested</span>
                    </div>
                  </div>
                  <p id="test-status-msg" class="test-status-text">Click "Test Connection" to verify database reachability before proceeding.</p>
                </div>
              </div>

              <!-- Card 2: Pre-flight Resolved Details -->
              <div class="connect-card-box">
                <div class="card-box-header">
                  <div class="card-box-title">
                    <span class="material-symbols-outlined icon-blue">tune</span>
                    <span>Pre-flight Overview</span>
                  </div>
                  <button type="button" id="copy-preview-btn" class="connect-copy-icon-btn" title="Copy Connection URL">
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                </div>

                <div class="card-box-body">
                  <div class="overview-item">
                    <span class="overview-label">Target URL</span>
                    <pre class="overview-code-box"><code id="preview-conn-url">${getCalculatedUrl()}</code></pre>
                  </div>

                  <div class="overview-grid-2">
                    <div class="overview-item">
                      <span class="overview-label">Target Database</span>
                      <span id="preview-db-name" class="overview-val">${getTargetDbName()}</span>
                    </div>
                    <div class="overview-item">
                      <span class="overview-label">Storage / Host</span>
                      <span id="preview-location" class="overview-val">${getTargetLocation()}</span>
                    </div>
                  </div>

                  <div class="overview-item">
                    <span class="overview-label">Planned Operation</span>
                    <span class="overview-action-badge">${modeExplanation.action}</span>
                  </div>

                  <div class="overview-item">
                    <span class="overview-label">.env Integration</span>
                    <code id="preview-env-output" class="overview-env-code">DATABASE_URL="${getCalculatedUrl()}"</code>
                  </div>
                </div>
              </div>
          </section>
        </div>
      </div>
    `;

      bindEvents();
   };

   const renderFields = (type, mode) => {
      if (type === 'sqlite') {
         if (mode === 'create') {
            return /* html */ `
            <div class="connect-field">
              <label class="connect-label" for="connect-sqlite-name">Database File Name</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-sqlite-name" class="connect-input mono" placeholder="drixio.sqlite" value="drixio.sqlite" />
              </div>
              <p class="connect-hint">New database file will be created in workspace root (e.g. <code>./drixio.sqlite</code>).</p>
            </div>
          `;
         }
         return /* html */ `
          <div class="connect-field">
            <label class="connect-label" for="connect-sqlite-path">Database Path / URI</label>
            <div class="connect-input-wrap">
              <input type="text" id="connect-sqlite-path" class="connect-input mono" placeholder="./drixio.sqlite" value="./drixio.sqlite" />
            </div>
            <p class="connect-hint">Relative or absolute path (e.g. <code>./drixio.sqlite</code> or <code>file:./data.db</code>).</p>
          </div>
        `;
      }

      if (type === 'postgres' || type === 'mysql') {
         const isPostgres = type === 'postgres';
         const defaultPort = isPostgres ? '5432' : '3306';
         const defaultUser = isPostgres ? 'postgres' : 'root';
         const isCreate = mode === 'create';
         const defaultDb = isCreate
            ? 'my_project'
            : isPostgres
              ? 'postgres'
              : 'mysql';
         const exampleUri = isPostgres
            ? 'postgresql://postgres:password@localhost:5432/mydb'
            : 'mysql://root:password@localhost:3306/mydb';

         return /* html */ `
          <!-- Smart Connection String Parser Bar -->
          <div class="connect-smart-parser">
            <div class="smart-parser-header">
              <div class="smart-parser-title">
                <span class="material-symbols-outlined icon-magic">auto_awesome</span>
                <span>Quick Import from Connection String</span>
              </div>
              <span class="smart-parser-badge">Auto-detect</span>
            </div>
            <div class="smart-parser-input-row">
              <div class="smart-parser-input-wrap">
                <span class="material-symbols-outlined smart-input-icon">link</span>
                <input type="text" id="connect-smart-uri-input" class="connect-input mono" placeholder="Paste full URI or DATABASE_URL=... (e.g. ${exampleUri})" />
              </div>
              <button type="button" id="connect-smart-parse-btn" class="smart-parse-btn" title="Parse connection string and auto-fill individual fields">
                <span class="material-symbols-outlined">auto_fix_high</span>
                <span>Auto-fill</span>
              </button>
            </div>
            <p class="connect-hint">Paste a complete URI or <code>DATABASE_URL</code> to automatically decompose and populate the parameters below.</p>
          </div>

          <!-- Divider between Smart Parser and Fields -->
          <div class="connect-fields-divider">
            <span class="divider-line"></span>
            <span class="divider-text">OR CONFIGURE INDIVIDUAL PARAMETERS</span>
            <span class="divider-line"></span>
          </div>

          <!-- Host & Port Grid -->
          <div class="connect-grid-2">
            <div class="connect-field">
              <label class="connect-label" for="connect-server-host">Server Host</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-server-host" class="connect-input mono" placeholder="localhost" value="localhost" />
              </div>
              <p class="connect-hint">Database server hostname (use <code>localhost</code> for local machine).</p>
            </div>
            <div class="connect-field">
              <label class="connect-label" for="connect-server-port">Port</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-server-port" class="connect-input mono" placeholder="${defaultPort}" value="${defaultPort}" />
              </div>
              <p class="connect-hint">Default ${isPostgres ? 'PostgreSQL' : 'MySQL'} port is <code>${defaultPort}</code>.</p>
            </div>
          </div>

          <!-- Username & Password Grid -->
          <div class="connect-grid-2">
            <div class="connect-field">
              <label class="connect-label" for="connect-server-user">Username</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-server-user" class="connect-input mono" placeholder="${defaultUser}" value="${defaultUser}" />
              </div>
              <p class="connect-hint">Database user account name.</p>
            </div>
            <div class="connect-field">
              <label class="connect-label" for="connect-server-pass">Password</label>
              <div class="connect-input-wrap has-action">
                <input type="password" id="connect-server-pass" class="connect-input mono" placeholder="Leave empty if none" />
                <button type="button" class="connect-input-eye-btn" id="toggle-pass-visibility" title="Toggle password visibility">
                  <span class="material-symbols-outlined">visibility</span>
                </button>
              </div>
              <p class="connect-hint">Account password. Leave empty if none is configured.</p>
            </div>
          </div>

          <!-- Database Name -->
          <div class="connect-field">
            <label class="connect-label" for="connect-server-dbname">${isCreate ? 'New Database Name to Create' : 'Target Database Name'}</label>
            <div class="connect-input-wrap">
              <input type="text" id="connect-server-dbname" class="connect-input mono" placeholder="e.g. ${defaultDb}" value="${defaultDb}" />
            </div>
            <p class="connect-hint">${isCreate ? 'Connects to server instance to execute <code>CREATE DATABASE</code>.' : 'Name of the existing database to inspect and manage.'}</p>
          </div>
        `;
      }

      return '';
   };

   const bindEvents = () => {
      // Engine Selection cards
      container.querySelectorAll('.connect-engine-card').forEach((card) => {
         card.onclick = () => {
            selectedType = card.dataset.type;
            testStatus = {
               state: 'idle',
               message: '',
               latencyMs: null,
               error: '',
            };
            render();
         };
      });

      // Mode toggle buttons
      container.querySelectorAll('.connect-mode-btn').forEach((btn) => {
         btn.onclick = () => {
            modes[selectedType] = btn.dataset.mode;
            testStatus = {
               state: 'idle',
               message: '',
               latencyMs: null,
               error: '',
            };
            render();
         };
      });

      // Real-time input updates for Live Preview
      const inputs = container.querySelectorAll('.connect-input');
      inputs.forEach((input) => {
         input.oninput = () => {
            updatePreviewUI();
            if (testStatus.state !== 'idle') {
               testStatus = {
                  state: 'idle',
                  message: '',
                  latencyMs: null,
                  error: '',
               };
               updateTestStatusUI();
            }
         };
      });

      // Smart URI Parser button and enter/paste key
      const smartParseBtn = container.querySelector('#connect-smart-parse-btn');
      const smartUriInput = container.querySelector('#connect-smart-uri-input');
      if (smartParseBtn && smartUriInput) {
         smartParseBtn.onclick = () => {
            const val = smartUriInput.value.trim();
            if (!val) {
               if (window.showToast)
                  window.showToast(
                     'Please paste a connection URL first.',
                     'warning',
                  );
               return;
            }
            applyParsedUri(val);
         };
         smartUriInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
               e.preventDefault();
               const val = smartUriInput.value.trim();
               if (val) applyParsedUri(val);
            }
         };
         smartUriInput.onpaste = () => {
            setTimeout(() => {
               const val = smartUriInput.value.trim();
               if (val) applyParsedUri(val);
            }, 40);
         };
      }

      // Password Eye Visibility Toggle
      const togglePassBtn = container.querySelector('#toggle-pass-visibility');
      const passInput = container.querySelector('#connect-server-pass');
      if (togglePassBtn && passInput) {
         togglePassBtn.onclick = () => {
            const isPass = passInput.type === 'password';
            passInput.type = isPass ? 'text' : 'password';
            const icon = togglePassBtn.querySelector(
               '.material-symbols-outlined',
            );
            if (icon) {
               icon.textContent = isPass ? 'visibility_off' : 'visibility';
            }
         };
      }

      // Preset chips click
      container.querySelectorAll('.connect-preset-chip').forEach((chip) => {
         chip.onclick = () => {
            const fillVal = chip.dataset.fill;
            const currentMode = modes[selectedType];

            if (selectedType === 'sqlite') {
               if (currentMode === 'create') {
                  const input = container.querySelector('#connect-sqlite-name');
                  if (input) input.value = fillVal.replace('./', '');
               } else {
                  const input = container.querySelector('#connect-sqlite-path');
                  if (input) input.value = fillVal;
               }
            } else {
               applyParsedUri(fillVal);
               const smartInput = container.querySelector(
                  '#connect-smart-uri-input',
               );
               if (smartInput) smartInput.value = fillVal;
            }
            updatePreviewUI();
            if (testStatus.state !== 'idle') {
               testStatus = {
                  state: 'idle',
                  message: '',
                  latencyMs: null,
                  error: '',
               };
               updateTestStatusUI();
            }
         };
      });

      // Save to .env Checkbox toggle updates preview
      const saveEnvCheckbox = container.querySelector('#connect-save-env');
      if (saveEnvCheckbox) {
         saveEnvCheckbox.onchange = () => {
            updatePreviewUI();
         };
      }

      // Test Connection Button
      const testBtn = container.querySelector('#run-test-btn');
      if (testBtn) {
         testBtn.onclick = () => {
            runTestConnection();
         };
      }

      // Copy Preview URL Button
      const copyBtn = container.querySelector('#copy-preview-btn');
      if (copyBtn) {
         copyBtn.onclick = () => {
            const url = getCalculatedUrl();
            if (navigator.clipboard) {
               navigator.clipboard.writeText(url);
               if (window.showToast) {
                  window.showToast(
                     'Copied connection URL to clipboard!',
                     'info',
                  );
               }
            }
         };
      }

      // Submit Action
      const submitBtn = container.querySelector('#connect-submit-btn');
      const errorBox = container.querySelector('#connect-error-msg');

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
               } else {
                  url = getCalculatedUrl();
               }

               if (!url) {
                  if (errorBox) {
                     errorBox.textContent =
                        'Please enter connection parameters.';
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
