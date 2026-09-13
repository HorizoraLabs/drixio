import {
   saveConnection,
   getSavedConnections,
   removeConnection,
   switchDatabase,
} from '../../lib/connections.js';

export function loadConnectView(container) {
   let selectedType = 'sqlite'; // 'sqlite' | 'postgres' | 'mysql'
   const modes = {
      sqlite: 'create', // 'create' | 'existing'
      postgres: 'existing', // 'existing' | 'create'
      mysql: 'existing', // 'existing' | 'create'
   };

   // Input method for server-based databases: 'uri' | 'fields'
   const inputMethods = {
      postgres: 'uri',
      mysql: 'uri',
   };

   // Preserved form parameters across tab switches
   const serverParams = {
      postgres: {
         uri: 'postgresql://postgres:postgres@localhost:5432/postgres',
         host: 'localhost',
         port: '5432',
         user: 'postgres',
         password: '',
         dbname: 'postgres',
      },
      mysql: {
         uri: 'mysql://root:password@localhost:3306/mysql',
         host: 'localhost',
         port: '3306',
         user: 'root',
         password: '',
         dbname: 'mysql',
      },
   };

   const sqliteParams = {
      createName: 'drixio.sqlite',
      existingPath: './drixio.sqlite',
   };

   let saveToEnv = true;

   let testStatus = {
      state: 'idle', // 'idle' | 'testing' | 'success' | 'error'
      message:
         'Click "Test Connection" to verify connectivity before proceeding.',
      latencyMs: null,
      error: '',
   };

   const engineMeta = {
      sqlite: {
         name: 'SQLite',
         badge: 'Local File',
         icon: 'description',
         desc: 'Zero-config embedded file database.',
      },
      postgres: {
         name: 'PostgreSQL',
         badge: 'Server Instance',
         icon: 'database',
         desc: 'Enterprise relational database server.',
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
            desc: 'Initializes a fresh, zero-configuration SQLite database file directly in your project root. No server setup or credentials required.',
            action:
               'Will initialize a new SQLite database file and prepare schema.',
         },
         existing: {
            title: 'About Connect Existing (SQLite)',
            desc: 'Connects to an existing SQLite database file (.sqlite, .db, .sqlite3) in your workspace to inspect schemas and browse data.',
            action: 'Will verify existing file on disk and inspect tables.',
         },
      },
      postgres: {
         create: {
            title: 'About Create New (PostgreSQL)',
            desc: 'Connects to your PostgreSQL server instance using administrative credentials and executes "CREATE DATABASE" to set up your project database.',
            action:
               'Will connect to PostgreSQL server and run CREATE DATABASE.',
         },
         existing: {
            title: 'About Connect Existing (PostgreSQL)',
            desc: 'Connects to an existing PostgreSQL database instance via connection URI or host parameters. Introspects schemas, tables, and relations.',
            action: 'Will establish client connection and map schema tables.',
         },
      },
      mysql: {
         create: {
            title: 'About Create New (MySQL)',
            desc: 'Connects to your MySQL / MariaDB server instance using administrative credentials and executes "CREATE DATABASE" to initialize your database.',
            action: 'Will connect to MySQL server and run CREATE DATABASE.',
         },
         existing: {
            title: 'About Connect Existing (MySQL)',
            desc: 'Connects to an existing MySQL / MariaDB database service via connection URI or host parameters. Maps tables and indexes.',
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
            label: 'Local Default',
            uri: 'postgresql://postgres:postgres@localhost:5432/postgres',
         },
         {
            label: 'Supabase Format',
            uri: 'postgresql://postgres.xxx:secret@aws-0-region.pooler.supabase.com:6543/postgres',
         },
      ],
      mysql: [
         {
            label: 'Local Default',
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

   const getCalculatedUrl = () => {
      const currentMode = modes[selectedType];
      if (selectedType === 'sqlite') {
         if (currentMode === 'create') {
            let name = sqliteParams.createName.trim() || 'drixio.sqlite';
            if (
               !name.endsWith('.sqlite') &&
               !name.endsWith('.db') &&
               !name.endsWith('.sqlite3')
            ) {
               name += '.sqlite';
            }
            return `./${name}`;
         }
         return sqliteParams.existingPath.trim() || './drixio.sqlite';
      }

      if (selectedType === 'postgres' || selectedType === 'mysql') {
         const currentMethod = inputMethods[selectedType];
         if (currentMethod === 'uri') {
            const raw = serverParams[selectedType].uri.trim();
            if (raw) return raw;
         }

         const p = serverParams[selectedType];
         const host = p.host.trim() || 'localhost';
         const defaultPort = selectedType === 'postgres' ? '5432' : '3306';
         const port = p.port.trim() || defaultPort;
         const defaultUser = selectedType === 'postgres' ? 'postgres' : 'root';
         const user = p.user.trim() || defaultUser;
         const password = p.password || '';
         const defaultDb =
            currentMode === 'create'
               ? 'new_db'
               : selectedType === 'postgres'
                 ? 'postgres'
                 : 'mysql';
         const dbName = p.dbname.trim() || defaultDb;

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
            return sqliteParams.createName.trim() || 'drixio.sqlite';
         }
         const pathVal = sqliteParams.existingPath.trim() || 'drixio.sqlite';
         return pathVal.split(/[/\\]/).pop() || 'drixio.sqlite';
      }

      const currentMethod = inputMethods[selectedType];
      if (currentMethod === 'uri') {
         const parsed = parseConnectionUri(serverParams[selectedType].uri);
         if (parsed?.dbName) return parsed.dbName;
      }

      const defaultDb =
         currentMode === 'create'
            ? 'new_db'
            : selectedType === 'postgres'
              ? 'postgres'
              : 'mysql';
      return serverParams[selectedType].dbname.trim() || defaultDb;
   };

   const getTargetLocation = () => {
      if (selectedType === 'sqlite') {
         return `<workspace root>/${getTargetDbName()}`;
      }
      const currentMethod = inputMethods[selectedType];
      if (currentMethod === 'uri') {
         const parsed = parseConnectionUri(serverParams[selectedType].uri);
         if (parsed?.host) {
            return `${parsed.host}:${parsed.port || (selectedType === 'postgres' ? '5432' : '3306')}`;
         }
      }
      const host = serverParams[selectedType].host.trim() || 'localhost';
      const defaultPort = selectedType === 'postgres' ? '5432' : '3306';
      const port = serverParams[selectedType].port.trim() || defaultPort;
      return `${host}:${port}`;
   };

   const updatePreviewUI = () => {
      const urlBox = container.querySelector('#preview-conn-url');
      const dbNameBox = container.querySelector('#preview-db-name');
      const locationBox = container.querySelector('#preview-location');
      const envBox = container.querySelector('#preview-env-output');

      const url = getCalculatedUrl();
      if (urlBox) urlBox.textContent = url;
      if (dbNameBox) dbNameBox.textContent = getTargetDbName();
      if (locationBox) locationBox.textContent = getTargetLocation();
      if (envBox) {
         if (saveToEnv) {
            envBox.textContent = `DATABASE_URL="${url}"`;
            envBox.classList.remove('disabled');
         } else {
            envBox.textContent = '(Will not write to .env)';
            envBox.classList.add('disabled');
         }
      }

      // Update live parsed URI chips if in URI mode
      if (selectedType !== 'sqlite' && inputMethods[selectedType] === 'uri') {
         updateParsedChipsUI();
      }
   };

   const updateParsedChipsUI = () => {
      const chipsContainer = container.querySelector('#uri-parsed-chips');
      if (!chipsContainer) return;

      const rawUri = serverParams[selectedType].uri;
      const parsed = parseConnectionUri(rawUri);

      if (!parsed) {
         chipsContainer.innerHTML = /* html */ `
            <span class="parsed-chip error">
               <span class="material-symbols-outlined chip-icon">error</span>
               <span>Invalid or incomplete URI</span>
            </span>
         `;
         return;
      }

      chipsContainer.innerHTML = /* html */ `
         <span class="parsed-chip">
            <span class="chip-label">Host:</span>
            <code class="chip-val">${parsed.host}:${parsed.port}</code>
         </span>
         <span class="parsed-chip">
            <span class="chip-label">User:</span>
            <code class="chip-val">${parsed.user || 'none'}</code>
         </span>
         <span class="parsed-chip">
            <span class="chip-label">Database:</span>
            <code class="chip-val">${parsed.dbName}</code>
         </span>
         <span class="parsed-chip success">
            <span class="material-symbols-outlined chip-icon">check_circle</span>
            <span>Parsed</span>
         </span>
      `;
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
         const p = serverParams[selectedType];
         payload = {
            mode: 'create',
            dbType: selectedType,
            host: p.host.trim() || 'localhost',
            port: p.port.trim() || (selectedType === 'mysql' ? '3306' : '5432'),
            user:
               p.user.trim() ||
               (selectedType === 'mysql' ? 'root' : 'postgres'),
            password: p.password || '',
            dbName: p.dbname.trim() || 'new_db',
         };
      } else if (selectedType === 'sqlite' && currentMode === 'create') {
         let name = sqliteParams.createName.trim() || 'drixio.sqlite';
         if (
            !name.endsWith('.sqlite') &&
            !name.endsWith('.db') &&
            !name.endsWith('.sqlite3')
         ) {
            name += '.sqlite';
         }
         payload = { mode: 'create', dbType: 'sqlite', url: `./${name}` };
      } else {
         let url = '';
         if (selectedType === 'sqlite') {
            url = sqliteParams.existingPath.trim() || './drixio.sqlite';
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
      const modeExplanation = modeDescriptions[selectedType]?.[currentMode] || {
         title: '',
         desc: '',
         action: '',
      };
      const activePresets = presets[selectedType] || [];
      const savedConnections = getSavedConnections();

      container.innerHTML = /* html */ `
      <div class="connect-fullpage">
        <!-- 2-Column Workbench: Left = Configuration, Right = Live Diagnostics, Overview & Recent Connections -->
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
                        <div class="connect-engine-card-status">
                          ${
                             isActive
                                ? `<span class="engine-active-pill"><span class="material-symbols-outlined">check</span>Active</span>`
                                : `<span class="engine-select-pill">Select</span>`
                          }
                        </div>
                      </div>
                      <div class="connect-engine-card-content">
                        <div class="connect-engine-card-header">
                          <span class="engine-title">${meta.name}</span>
                          <span class="engine-badge ${type === 'sqlite' ? 'badge-local' : 'badge-server'}">${meta.badge}</span>
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
                  <span>Connection Details</span>
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
                    <span class="connect-presets-label">Quick Presets:</span>
                    <div class="connect-presets-chips">
                      ${activePresets
                         .map((p) => {
                            const fillVal =
                               p.uri ||
                               (currentMode === 'create' ? p.val : p.path);
                            return /* html */ `
                          <button type="button" class="connect-preset-chip" data-fill="${fillVal}">
                            <span class="material-symbols-outlined chip-bolt-icon">bolt</span>
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
                  <input type="checkbox" id="connect-save-env" ${saveToEnv ? 'checked' : ''} />
                  <div class="connect-checkbox-info">
                    <span class="checkbox-title">Persist connection URL to <code class="env-code">.env</code> (DATABASE_URL)</span>
                    <span class="checkbox-desc">Enables automatic connection restoration when Drixio Studio or CLI boots up.</span>
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

          <!-- Right Column: Live Diagnostics, Preview & Recent Connections -->
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

            <!-- Card 3: Recent Connections -->
            <div class="connect-card-box">
              <div class="card-box-header">
                <div class="card-box-title">
                  <span class="material-symbols-outlined icon-blue">history</span>
                  <span>Recent Connections</span>
                </div>
                <span class="saved-conn-count-badge">${savedConnections.length} saved</span>
              </div>
              <div class="card-box-body saved-conns-body">
                ${
                   savedConnections.length > 0
                      ? /* html */ `
                  <div class="saved-conn-list">
                    ${savedConnections
                       .map((conn) => {
                          const icon =
                             conn.dialect === 'postgres'
                                ? 'database'
                                : conn.dialect === 'mysql'
                                  ? 'storage'
                                  : 'description';
                          return /* html */ `
                        <div class="saved-conn-item" data-id="${conn.id}">
                          <div class="saved-conn-main">
                            <div class="saved-conn-icon">
                              <span class="material-symbols-outlined">${icon}</span>
                            </div>
                            <div class="saved-conn-info">
                              <div class="saved-conn-name-row">
                                <span class="saved-conn-name" title="${conn.name}">${conn.name}</span>
                                <span class="saved-conn-badge ${conn.isRemote ? 'remote' : 'local'}">${conn.badgeLabel || (conn.isRemote ? 'REMOTE' : 'LOCAL')}</span>
                              </div>
                              <span class="saved-conn-url" title="${conn.url}">${conn.url}</span>
                            </div>
                          </div>
                          <div class="saved-conn-actions">
                            <button type="button" class="btn-use-conn" data-id="${conn.id}" title="Load parameters into editor">
                              <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button type="button" class="btn-direct-connect" data-id="${conn.id}" title="Connect immediately">
                              <span class="material-symbols-outlined">login</span>
                              <span>Connect</span>
                            </button>
                            <button type="button" class="btn-del-conn" data-id="${conn.id}" title="Remove from saved">
                              <span class="material-symbols-outlined">close</span>
                            </button>
                          </div>
                        </div>
                      `;
                       })
                       .join('')}
                  </div>
                `
                      : /* html */ `
                  <div class="saved-conn-empty">
                    <span class="material-symbols-outlined empty-icon">cloud_off</span>
                    <span class="empty-title">No saved connections yet</span>
                    <p class="empty-desc">Successfully connected databases will be remembered here for 1-click switching.</p>
                  </div>
                `
                }
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
                <input type="text" id="connect-sqlite-name" class="connect-input mono" placeholder="drixio.sqlite" value="${sqliteParams.createName}" />
              </div>
              <p class="connect-hint">New database file will be initialized in your project root (e.g. <code>./drixio.sqlite</code>).</p>
            </div>
          `;
         }
         return /* html */ `
          <div class="connect-field">
            <label class="connect-label" for="connect-sqlite-path">Database File Path / URI</label>
            <div class="connect-input-wrap">
              <input type="text" id="connect-sqlite-path" class="connect-input mono" placeholder="./drixio.sqlite" value="${sqliteParams.existingPath}" />
            </div>
            <p class="connect-hint">Relative or absolute path (e.g. <code>./drixio.sqlite</code>, <code>./data.db</code>, or <code>file:./test.db</code>).</p>
          </div>
        `;
      }

      // PostgreSQL & MySQL
      const isPostgres = type === 'postgres';
      const currentMethod = inputMethods[type];
      const p = serverParams[type];
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
      <!-- Segmented Input Method Selector -->
      <div class="connect-input-method-row">
        <div class="connect-method-segmented">
          <button type="button" class="connect-method-btn ${currentMethod === 'uri' ? 'active' : ''}" data-method="uri">
            <span class="material-symbols-outlined">link</span>
            <span>Connection URI</span>
          </button>
          <button type="button" class="connect-method-btn ${currentMethod === 'fields' ? 'active' : ''}" data-method="fields">
            <span class="material-symbols-outlined">tune</span>
            <span>Host & Parameters</span>
          </button>
        </div>
        <span class="connect-method-hint">${
           currentMethod === 'uri'
              ? 'Paste URI from Supabase, Neon, or Docker'
              : 'Configure host, port, user and credentials manually'
        }</span>
      </div>

      ${
         currentMethod === 'uri'
            ? /* html */ `
          <!-- Option A: Clean, Single Connection URI Box -->
          <div class="connect-uri-card">
            <div class="connect-field">
              <div class="connect-label-row">
                <label class="connect-label" for="connect-server-uri">Connection String (URI)</label>
                <button type="button" class="connect-text-btn" id="btn-paste-uri">
                  <span class="material-symbols-outlined">content_paste</span>
                  <span>Paste</span>
                </button>
              </div>
              <div class="connect-input-wrap has-action">
                <input type="text" id="connect-server-uri" class="connect-input mono" placeholder="${exampleUri}" value="${p.uri}" />
                <button type="button" class="connect-input-clear-btn" id="btn-clear-uri" title="Clear input">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <p class="connect-hint">Supports standard connection strings with query options (e.g. <code>sslmode=require</code>).</p>
            </div>

            <!-- Live Parsed Breakdown Chips -->
            <div class="uri-parsed-bar" id="uri-parsed-chips">
              <!-- Filled dynamically by updateParsedChipsUI() -->
            </div>
          </div>
        `
            : /* html */ `
          <!-- Option B: Clean Form Fields Grid -->
          <div class="connect-fields-group">
            <!-- Host & Port Grid -->
            <div class="connect-grid-2">
              <div class="connect-field">
                <label class="connect-label" for="connect-server-host">Server Host</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-host" class="connect-input mono" placeholder="localhost" value="${p.host}" />
                </div>
                <p class="connect-hint">Hostname or IP address (e.g. <code>localhost</code>, <code>127.0.0.1</code>).</p>
              </div>
              <div class="connect-field">
                <label class="connect-label" for="connect-server-port">Port</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-port" class="connect-input mono" placeholder="${defaultPort}" value="${p.port}" />
                </div>
                <p class="connect-hint">Default is <code>${defaultPort}</code>.</p>
              </div>
            </div>

            <!-- Username & Password Grid -->
            <div class="connect-grid-2">
              <div class="connect-field">
                <label class="connect-label" for="connect-server-user">Username</label>
                <div class="connect-input-wrap">
                  <input type="text" id="connect-server-user" class="connect-input mono" placeholder="${defaultUser}" value="${p.user}" />
                </div>
                <p class="connect-hint">Database user account name.</p>
              </div>
              <div class="connect-field">
                <label class="connect-label" for="connect-server-pass">Password</label>
                <div class="connect-input-wrap has-action">
                  <input type="password" id="connect-server-pass" class="connect-input mono" placeholder="Leave empty if none" value="${p.password}" />
                  <button type="button" class="connect-input-eye-btn" id="toggle-pass-visibility" title="Toggle password visibility">
                    <span class="material-symbols-outlined">visibility</span>
                  </button>
                </div>
                <p class="connect-hint">Account password (optional if none).</p>
              </div>
            </div>

            <!-- Database Name -->
            <div class="connect-field">
              <label class="connect-label" for="connect-server-dbname">${isCreate ? 'New Database Name to Create' : 'Target Database Name'}</label>
              <div class="connect-input-wrap">
                <input type="text" id="connect-server-dbname" class="connect-input mono" placeholder="e.g. ${defaultDb}" value="${p.dbname}" />
              </div>
              <p class="connect-hint">${isCreate ? 'Connects to server instance to execute <code>CREATE DATABASE</code>.' : 'Target database to inspect and manage.'}</p>
            </div>
          </div>
        `
      }
    `;
   };

   const resetTestStatus = () => {
      if (testStatus.state !== 'idle') {
         testStatus = {
            state: 'idle',
            message:
               'Click "Test Connection" to verify connectivity before proceeding.',
            latencyMs: null,
            error: '',
         };
         updateTestStatusUI();
      }
   };

   const bindEvents = () => {
      // Step 1: Engine Selection cards
      container.querySelectorAll('.connect-engine-card').forEach((card) => {
         card.onclick = () => {
            const newType = card.dataset.type;
            if (newType === selectedType) return;
            selectedType = newType;
            resetTestStatus();
            render();
         };
      });

      // Step 2: Mode toggle buttons
      container.querySelectorAll('.connect-mode-btn').forEach((btn) => {
         btn.onclick = () => {
            const newMode = btn.dataset.mode;
            if (modes[selectedType] === newMode) return;
            modes[selectedType] = newMode;
            resetTestStatus();
            render();
         };
      });

      // Input Method toggle buttons (URI vs Fields)
      container.querySelectorAll('.connect-method-btn').forEach((btn) => {
         btn.onclick = () => {
            const newMethod = btn.dataset.method;
            if (inputMethods[selectedType] === newMethod) return;
            inputMethods[selectedType] = newMethod;
            resetTestStatus();
            render();
         };
      });

      // SQLite Inputs
      const sqliteNameInput = container.querySelector('#connect-sqlite-name');
      if (sqliteNameInput) {
         sqliteNameInput.oninput = () => {
            sqliteParams.createName = sqliteNameInput.value;
            resetTestStatus();
            updatePreviewUI();
         };
      }

      const sqlitePathInput = container.querySelector('#connect-sqlite-path');
      if (sqlitePathInput) {
         sqlitePathInput.oninput = () => {
            sqliteParams.existingPath = sqlitePathInput.value;
            resetTestStatus();
            updatePreviewUI();
         };
      }

      // Server URI Input
      const serverUriInput = container.querySelector('#connect-server-uri');
      if (serverUriInput) {
         serverUriInput.oninput = () => {
            const val = serverUriInput.value;
            serverParams[selectedType].uri = val;
            const parsed = parseConnectionUri(val);
            if (parsed) {
               serverParams[selectedType].host = parsed.host;
               serverParams[selectedType].port = parsed.port;
               serverParams[selectedType].user = parsed.user;
               serverParams[selectedType].password = parsed.password;
               serverParams[selectedType].dbname = parsed.dbName;
            }
            resetTestStatus();
            updatePreviewUI();
         };

         // Paste button
         const pasteBtn = container.querySelector('#btn-paste-uri');
         if (pasteBtn) {
            pasteBtn.onclick = async () => {
               try {
                  if (navigator.clipboard?.readText) {
                     const text = await navigator.clipboard.readText();
                     if (text) {
                        serverUriInput.value = text.trim();
                        serverUriInput.dispatchEvent(new Event('input'));
                        if (window.showToast) {
                           window.showToast('Pasted from clipboard!', 'info');
                        }
                     }
                  } else {
                     serverUriInput.focus();
                  }
               } catch {
                  serverUriInput.focus();
               }
            };
         }

         // Clear button
         const clearBtn = container.querySelector('#btn-clear-uri');
         if (clearBtn) {
            clearBtn.onclick = () => {
               serverUriInput.value = '';
               serverUriInput.dispatchEvent(new Event('input'));
               serverUriInput.focus();
            };
         }
      }

      // Server Fields Inputs
      const hostInput = container.querySelector('#connect-server-host');
      const portInput = container.querySelector('#connect-server-port');
      const userInput = container.querySelector('#connect-server-user');
      const passInput = container.querySelector('#connect-server-pass');
      const dbnameInput = container.querySelector('#connect-server-dbname');

      const syncFieldsToUri = () => {
         if (hostInput) serverParams[selectedType].host = hostInput.value;
         if (portInput) serverParams[selectedType].port = portInput.value;
         if (userInput) serverParams[selectedType].user = userInput.value;
         if (passInput) serverParams[selectedType].password = passInput.value;
         if (dbnameInput) serverParams[selectedType].dbname = dbnameInput.value;

         // Rebuild URI
         const p = serverParams[selectedType];
         const auth = p.password
            ? `${encodeURIComponent(p.user)}:${encodeURIComponent(p.password)}@`
            : p.user
              ? `${encodeURIComponent(p.user)}@`
              : '';
         serverParams[selectedType].uri =
            `${selectedType}://${auth}${p.host}:${p.port}/${p.dbname}`;

         resetTestStatus();
         updatePreviewUI();
      };

      [hostInput, portInput, userInput, passInput, dbnameInput].forEach(
         (el) => {
            if (el) el.oninput = syncFieldsToUri;
         },
      );

      // Password Eye Visibility Toggle
      const togglePassBtn = container.querySelector('#toggle-pass-visibility');
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

      // Presets chips click
      container.querySelectorAll('.connect-preset-chip').forEach((chip) => {
         chip.onclick = () => {
            const fillVal = chip.dataset.fill;
            const currentMode = modes[selectedType];

            if (selectedType === 'sqlite') {
               if (currentMode === 'create') {
                  sqliteParams.createName = fillVal.replace('./', '');
                  if (sqliteNameInput)
                     sqliteNameInput.value = sqliteParams.createName;
               } else {
                  sqliteParams.existingPath = fillVal;
                  if (sqlitePathInput)
                     sqlitePathInput.value = sqliteParams.existingPath;
               }
            } else {
               serverParams[selectedType].uri = fillVal;
               const parsed = parseConnectionUri(fillVal);
               if (parsed) {
                  serverParams[selectedType].host = parsed.host;
                  serverParams[selectedType].port = parsed.port;
                  serverParams[selectedType].user = parsed.user;
                  serverParams[selectedType].password = parsed.password;
                  serverParams[selectedType].dbname = parsed.dbName;
               }
               if (serverUriInput) serverUriInput.value = fillVal;
               if (hostInput && parsed) hostInput.value = parsed.host;
               if (portInput && parsed) portInput.value = parsed.port;
               if (userInput && parsed) userInput.value = parsed.user;
               if (passInput && parsed) passInput.value = parsed.password;
               if (dbnameInput && parsed) dbnameInput.value = parsed.dbName;
            }

            resetTestStatus();
            updatePreviewUI();
            if (window.showToast) {
               window.showToast(`Preset loaded!`, 'info');
            }
         };
      });

      // Save to .env Checkbox
      const saveEnvCheckbox = container.querySelector('#connect-save-env');
      if (saveEnvCheckbox) {
         saveEnvCheckbox.onchange = () => {
            saveToEnv = saveEnvCheckbox.checked;
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

      // Saved Connections Actions
      container.querySelectorAll('.btn-use-conn').forEach((btn) => {
         btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const conn = getSavedConnections().find((c) => c.id === id);
            if (!conn) return;

            selectedType = conn.dialect || 'sqlite';
            modes[selectedType] = 'existing';

            if (selectedType === 'sqlite') {
               sqliteParams.existingPath = conn.url;
            } else {
               serverParams[selectedType].uri = conn.url;
               const parsed = parseConnectionUri(conn.url);
               if (parsed) {
                  serverParams[selectedType].host = parsed.host;
                  serverParams[selectedType].port = parsed.port;
                  serverParams[selectedType].user = parsed.user;
                  serverParams[selectedType].password = parsed.password;
                  serverParams[selectedType].dbname = parsed.dbName;
               }
            }

            resetTestStatus();
            render();
            if (window.showToast) {
               window.showToast(`Loaded parameters for "${conn.name}"`, 'info');
            }
         };
      });

      container.querySelectorAll('.btn-direct-connect').forEach((btn) => {
         btn.onclick = async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const conn = getSavedConnections().find((c) => c.id === id);
            if (!conn) return;
            btn.disabled = true;
            await switchDatabase(conn);
            btn.disabled = false;
         };
      });

      container.querySelectorAll('.btn-del-conn').forEach((btn) => {
         btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            removeConnection(id);
            render();
            if (window.showToast) {
               window.showToast('Removed from saved connections.', 'info');
            }
         };
      });

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
               const p = serverParams[selectedType];
               const dbName = p.dbname.trim();

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
                  host: p.host.trim() || 'localhost',
                  port:
                     p.port.trim() ||
                     (selectedType === 'mysql' ? '3306' : '5432'),
                  user:
                     p.user.trim() ||
                     (selectedType === 'mysql' ? 'root' : 'postgres'),
                  password: p.password || '',
                  dbName,
                  saveToEnv,
               };
            } else if (selectedType === 'sqlite' && currentMode === 'create') {
               let name = sqliteParams.createName.trim() || 'drixio.sqlite';
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
                  saveToEnv,
               };
            } else {
               // Existing connection mode (SQLite / Postgres / MySQL)
               let url = '';
               if (selectedType === 'sqlite') {
                  url = sqliteParams.existingPath.trim() || '';
               } else {
                  url = getCalculatedUrl();
               }

               if (!url) {
                  if (errorBox) {
                     errorBox.textContent =
                        'Please enter valid connection parameters.';
                     errorBox.classList.remove('hidden');
                  }
                  return;
               }

               payload = {
                  url,
                  createIfNotExist: false,
                  saveToEnv,
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

               const isRemote = selectedType !== 'sqlite';
               const badgeLabel = isRemote ? 'REMOTE' : 'LOCAL';
               const connectedName = data.data?.dbName || getTargetDbName();
               const connectedUrl = data.data?.targetUrl || payload.url;

               // Persist to saved connections list
               saveConnection({
                  name: connectedName,
                  dialect: data.data?.dbType || selectedType,
                  url: connectedUrl,
                  isRemote,
                  badgeLabel,
               });

               // Update Header Breadcrumbs
               const dbNameEl = document.getElementById('db-name');
               if (dbNameEl) {
                  dbNameEl.textContent = connectedName;
               }
               const envBadge = document.getElementById('env-badge');
               if (envBadge) {
                  envBadge.textContent = badgeLabel;
                  envBadge.className = `env-badge ${isRemote ? 'remote' : 'local'}`;
                  envBadge.classList.remove('hidden');
               }

               if (window.showToast) {
                  window.showToast(
                     'Database connected successfully!',
                     'success',
                  );
               }

               // Refresh Sidebar table list first so tables are in DOM
               if (typeof window.initSidebar === 'function') {
                  await window.initSidebar(true);
               }

               // Switch UI to connected mode
               if (typeof window.setStudioConnectionMode === 'function') {
                  window.setStudioConnectionMode(true);
               }

               // Switch tab to data view
               if (typeof window.handleSwitchTab === 'function') {
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

      // Initialize UI parts
      updatePreviewUI();
      updateTestStatusUI();
   };

   render();
}
