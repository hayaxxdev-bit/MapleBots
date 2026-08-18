(() => {
  'use strict';

  const POLL_MS = 5000;
  const HISTORY_LIMIT = 30;

  /*
   * IMPORTANT
   *
   * Frontend boleh di-host di Vercel.
   * Request /api/* kemudian diteruskan oleh Vercel
   * ke MapleBot/Pterodactyl melalui vercel.json.
   *
   * Jadi jangan gunakan localhost di browser.
   */
  const API_BASE = '';

  const state = {
    status: null,
    apis: [],
    notifications: [],
    history: {
      cpu: [],
      memory: [],
    },
  };

  const $ = (id) => document.getElementById(id);

  const endpoints = {
    status: `${API_BASE}/api/status`,
    system: `${API_BASE}/api/system`,
    bot: `${API_BASE}/api/bot`,
    metrics: `${API_BASE}/api/metrics`,
    health: `${API_BASE}/api/health`,
    apis: `${API_BASE}/api/apis`,
    notifications: `${API_BASE}/api/notifications`,
    config: `${API_BASE}/api/config`,
  };

  async function getJson(url) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null);
  }

  function formatBytes(value) {
    if (value === undefined || value === null) {
      return '—';
    }

    const bytes = Number(value);

    if (!Number.isFinite(bytes)) {
      return '—';
    }

    if (bytes < 1024) {
      return `${bytes.toFixed(0)} B`;
    }

    if (bytes < 1024 ** 2) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 ** 3) {
      return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    }

    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatDuration(seconds) {
    if (seconds === undefined || seconds === null) {
      return '—';
    }

    let value = Number(seconds);

    if (!Number.isFinite(value)) {
      return '—';
    }

    value = Math.max(0, Math.floor(value));

    const days = Math.floor(value / 86400);
    value %= 86400;

    const hours = Math.floor(value / 3600);
    value %= 3600;

    const minutes = Math.floor(value / 60);
    const secs = value % 60;

    const parts = [];

    if (days) {
      parts.push(`${days}d`);
    }

    if (hours) {
      parts.push(`${hours}h`);
    }

    if (minutes) {
      parts.push(`${minutes}m`);
    }

    if (!parts.length || secs) {
      parts.push(`${secs}s`);
    }

    return parts.join(' ');
  }

  function formatTime(value) {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleTimeString('id-ID', {
      hour12: false,
    });
  }

  function formatDetail(value) {
    if (value === undefined || value === null) {
      return '—';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function statusClass(status) {
    return String(status || 'unknown').toLowerCase();
  }

  function setConnection(online, text) {
    const pill = $('connectionPill');

    if (pill) {
      pill.classList.toggle('online', online);
      pill.classList.toggle('offline', !online);
    }

    const connectionText = $('connectionText');

    if (connectionText) {
      connectionText.textContent = text;
    }
  }

  /*
   * ============================================================
   * STATUS
   * ============================================================
   */

  function renderStatus(report) {
    if (!report) {
      return;
    }

    state.status = report;

    const bot = report.bot || {};
    const system = report.system || {};
    const health = report.health || {};
    const metrics = report.metrics || {};
    const config = report.config || {};

    const overall = health.status || 'unknown';

    const badge = $('overallBadge');

    if (badge) {
      badge.textContent = overall.toUpperCase();
      badge.className = `status-badge ${statusClass(overall)}`;
    }

    const active = bot.connected === true;

    const heroTitle = $('heroTitle');

    if (heroTitle) {
      heroTitle.textContent = active
        ? 'MapleBot is online'
        : 'MapleBot Operations';
    }

    const heroMessage = $('heroMessage');

    if (heroMessage) {
      heroMessage.textContent = active
        ? 'WhatsApp connection is active.'
        : 'WhatsApp connection is not active.';
    }

    const healthTimestamp = $('healthTimestamp');

    if (healthTimestamp) {
      healthTimestamp.textContent = report.timestamp
        ? `Updated ${formatTime(report.timestamp)}`
        : '—';
    }

    /*
     * Environment
     */

    const environment = config.environment || {};

    setText('envValue', firstDefined(
      environment.nodeEnv,
      '—'
    ));

    setText('modeValue', firstDefined(
      environment.botMode,
      '—'
    ));

    setText('botValue', firstDefined(
      environment.botName,
      bot.user?.name,
      'MapleBot'
    ));

    /*
     * System + metrics
     */

    renderSystem(system);
    renderMetrics(metrics);

    /*
     * Bot
     */

    renderBot(bot);

    /*
     * Health
     */

    renderServices(health.services || []);

    /*
     * Config
     */

    renderConfig(config);

    setConnection(
      true,
      `Telemetry connected · ${formatTime(report.timestamp)}`
    );
  }

  function renderSystem(system) {
    if (!system) {
      return;
    }

    const cpu = system.cpu || {};
    const memory = system.memory || {};
    const node = system.node || {};
    const process = system.process || {};

    const cpuUsage = firstDefined(
      cpu.usagePercent,
      cpu.usage
    );

    const memoryUsage = firstDefined(
      memory.usagePercent,
      0
    );

    const loadAverage = cpu.loadAverage || {};

    const load = [
      loadAverage.oneMinute,
      loadAverage.fiveMinutes,
      loadAverage.fifteenMinutes,
    ]
      .filter((value) => value !== undefined && value !== null)
      .map((value) => Number(value).toFixed(2))
      .join(' / ');

    setText(
      'loadValue',
      load || '—'
    );

    setText(
      'rssValue',
      formatBytes(process.memory?.rss)
    );

    setText(
      'nodeProcessValue',
      node.version || '—'
    );

    setText(
      'processUptimeValue',
      formatDuration(process.uptime)
    );

    /*
     * Runtime panel
     */

    const runtimePanel = $('runtimePanel');

    if (runtimePanel) {
      const rows = [
        ['PID', process.pid],
        ['RSS', process.memory?.rss],
        ['Heap used', process.memory?.heapUsed],
        ['Heap total', process.memory?.heapTotal],
        ['External', process.memory?.external],
        ['Process uptime', formatDuration(process.uptime)],
        ['Node.js', node.version],
        ['Platform', system.platform],
        ['Architecture', system.arch],
      ];

      runtimePanel.innerHTML = `
        <div class="panel-header">
          <div>
            <span class="eyebrow">NODE PROCESS</span>
            <h2>Runtime</h2>
          </div>
        </div>

        <div class="detail-list">
          ${rows
            .map(
              ([key, value]) => `
                <div class="detail-row">
                  <span>${escapeHtml(key)}</span>
                  <strong>${escapeHtml(
                    key === 'RSS' ||
                    key === 'Heap used' ||
                    key === 'Heap total' ||
                    key === 'External'
                      ? formatBytes(value)
                      : formatDetail(value)
                  )}</strong>
                </div>
              `
            )
            .join('')}
        </div>
      `;
    }

    /*
     * System values can be used as fallback
     * if metrics endpoint is unavailable.
     */

    renderCpu(cpuUsage);
    renderMemory(memoryUsage);
  }

  function renderBot(bot) {
    if (!bot) {
      return;
    }

    const messages = Number(
      firstDefined(
        bot.messagesProcessed,
        0
      )
    );

    const commands = Number(
      firstDefined(
        bot.commandsExecuted,
        0
      )
    );

    setText('messagesValue', messages);
    setText('commandsValue', `${commands} cmds`);

    /*
     * Optional dashboard fields.
     */

    setText(
      'botStatusValue',
      bot.connected ? 'Connected' : 'Disconnected'
    );

    setText(
      'botUptimeValue',
      formatDuration(
        bot.uptime
      )
    );

    setText(
      'botAccountValue',
      firstDefined(
        bot.user?.name,
        '—'
      )
    );
  }

  /*
   * ============================================================
   * METRICS
   * ============================================================
   */

  function renderMetrics(metrics) {
    if (!metrics) {
      return;
    }

    const cpu = Number(
      firstDefined(
        metrics.cpuUsage,
        0
      )
    );

    const memory = Number(
      firstDefined(
        metrics.memoryUsage,
        0
      )
    );

    if (Number.isFinite(cpu)) {
      renderCpu(cpu);
    }

    if (Number.isFinite(memory)) {
      renderMemory(memory);
    }

    /*
     * These values come directly from /api/metrics.
     */

    setText(
      'messagesValue',
      firstDefined(
        metrics.messagesProcessed,
        0
      )
    );

    setText(
      'commandsValue',
      `${firstDefined(
        metrics.commandsExecuted,
        0
      )} cmds`
    );
  }

  function renderCpu(value) {
    if (!Number.isFinite(Number(value))) {
      return;
    }

    const cpu = Number(value);

    setText(
      'cpuValue',
      `${cpu.toFixed(1)}%`
    );

    setWidth(
      'cpuBar',
      cpu
    );

    state.history.cpu.push(cpu);

    state.history.cpu = state.history.cpu.slice(
      -HISTORY_LIMIT
    );

    setText(
      'cpuHistoryValue',
      `${cpu.toFixed(1)}%`
    );

    drawChart(
      $('cpuChart'),
      state.history.cpu
    );
  }

  function renderMemory(value) {
    if (!Number.isFinite(Number(value))) {
      return;
    }

    const memory = Number(value);

    setText(
      'memoryValue',
      `${memory.toFixed(1)}%`
    );

    setWidth(
      'memoryBar',
      memory
    );

    state.history.memory.push(memory);

    state.history.memory = state.history.memory.slice(
      -HISTORY_LIMIT
    );

    setText(
      'memoryHistoryValue',
      `${memory.toFixed(1)}%`
    );

    drawChart(
      $('memoryChart'),
      state.history.memory
    );
  }

  /*
   * ============================================================
   * HEALTH
   * ============================================================
   */

  function renderHealth(health) {
    if (!health) {
      return;
    }

    const overall = health.status || 'unknown';

    const badge = $('overallBadge');

    if (badge) {
      badge.textContent = overall.toUpperCase();
      badge.className = `status-badge ${statusClass(overall)}`;
    }

    renderServices(
      health.services || []
    );

    const whatsapp = (health.services || []).find(
      (service) => service.name === 'WhatsApp'
    );

    if (whatsapp) {
      setText(
        'heroMessage',
        whatsapp.message || 'WhatsApp service active.'
      );
    }

    setText(
      'healthTimestamp',
      health.timestamp
        ? `Updated ${formatTime(health.timestamp)}`
        : '—'
    );
  }

  function renderServices(services) {
    if (!Array.isArray(services)) {
      services = [];
    }

    const html =
      services.length > 0
        ? services
            .map(
              (service) => `
                <article class="service-card">
                  <div class="service-top">
                    <span class="service-name">
                      ${escapeHtml(
                        service.name || 'Unknown'
                      )}
                    </span>

                    <i class="dot ${statusClass(
                      service.status
                    )}"></i>
                  </div>

                  <div class="service-message">
                    ${escapeHtml(
                      service.message ||
                        'No status message.'
                    )}
                  </div>

                  <div class="service-latency">
                    ${
                      service.latency == null
                        ? '—'
                        : `${service.latency} ms`
                    }
                  </div>
                </article>
              `
            )
            .join('')
        : `<div class="empty">No service data.</div>`;

    setHtml(
      'serviceGrid',
      html
    );

    setHtml(
      'servicesGrid',
      html
    );
  }

  /*
   * ============================================================
   * API PROVIDERS
   * ============================================================
   */

  function renderApis(data) {
    const providers = Array.isArray(data)
      ? data
      : data?.providers ||
        data?.apis ||
        [];

    state.apis = providers;

    const enabled = providers.filter(
      (provider) =>
        provider.enabled !== false
    ).length;

    setText(
      'apiSummary',
      `${providers.length} providers · ${enabled} enabled`
    );

    if (!providers.length) {
      setHtml(
        'apiGrid',
        `<div class="empty">No API provider data.</div>`
      );

      return;
    }

    setHtml(
      'apiGrid',
      providers
        .map((provider) => {
          const status =
            firstDefined(
              provider.health?.status,
              provider.status,
              'unknown'
            );

          return `
            <article class="api-card">
              <div class="api-category">
                ${escapeHtml(
                  provider.category ||
                    'provider'
                )}
              </div>

              <div class="api-name">
                ${escapeHtml(
                  provider.name ||
                    provider.id ||
                    'Unknown API'
                )}
              </div>

              <div class="api-id">
                ${escapeHtml(
                  provider.id || '—'
                )}
              </div>

              <div class="api-status">
                <i class="dot ${statusClass(
                  status
                )}"></i>

                <span>
                  ${escapeHtml(status)}
                </span>
              </div>

              ${
                provider.latency != null
                  ? `
                    <div class="api-latency">
                      ${escapeHtml(
                        `${provider.latency} ms`
                      )}
                    </div>
                  `
                  : ''
              }
            </article>
          `;
        })
        .join('')
    );
  }

  /*
   * ============================================================
   * NOTIFICATIONS
   * ============================================================
   */

  function renderNotifications(data) {
    const items = Array.isArray(data)
      ? data
      : data?.notifications ||
        data?.history ||
        [];

    state.notifications = items;

    setText(
      'notificationCount',
      `${items.length} events`
    );

    if (!items.length) {
      setHtml(
        'notificationList',
        `<div class="empty">No recent notifications.</div>`
      );

      return;
    }

    setHtml(
      'notificationList',
      items
        .slice(0, 30)
        .map((item) => {
          const type = String(
            item.type ||
              item.event ||
              'info'
          ).toLowerCase();

          const icon = type.includes('error')
            ? '✕'
            : type.includes('reconnect')
              ? '↻'
              : type.includes('login')
                ? '↪'
                : '●';

          return `
            <div class="notification-item">
              <div class="notification-time">
                ${escapeHtml(
                  formatTime(
                    item.timestamp ||
                      item.createdAt ||
                      item.time
                  )
                )}
              </div>

              <div class="notification-icon">
                ${icon}
              </div>

              <div>
                <div class="notification-title">
                  ${escapeHtml(
                    item.title ||
                      item.type ||
                      item.event ||
                      'Notification'
                  )}
                </div>

                <div class="notification-message">
                  ${escapeHtml(
                    item.message ||
                      item.description ||
                      ''
                  )}
                </div>
              </div>
            </div>
          `;
        })
        .join('')
    );
  }

  /*
   * ============================================================
   * CONFIG
   * ============================================================
   */

  function renderConfig(config) {
    const panel = $('configPanel');

    if (!panel) {
      return;
    }

    const environment =
      config.environment || {};

    const dashboard =
      config.dashboard || {};

    const bot =
      config.bot || {};

    const rows = [
      ['Environment', environment.nodeEnv],
      ['Bot', environment.botName],
      ['Mode', environment.botMode],
      ['Prefix', environment.prefix],
      ['Timezone', environment.timezone],
      ['Dashboard port', dashboard.port],
      ['Dashboard auth', dashboard.authEnabled ? 'Enabled' : 'Disabled'],
      ['Auto read', bot.autoRead ? 'Enabled' : 'Disabled'],
      ['Auto typing', bot.autoTyping ? 'Enabled' : 'Disabled'],
      ['Auto recording', bot.autoRecording ? 'Enabled' : 'Disabled'],
      ['Group messages', bot.allowGroup ? 'Allowed' : 'Disabled'],
      ['Private messages', bot.allowPrivate ? 'Allowed' : 'Disabled'],
    ];

    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <span class="eyebrow">CONFIGURATION</span>
          <h2>Public snapshot</h2>
        </div>
      </div>

      <div class="detail-list">
        ${rows
          .map(
            ([key, value]) => `
              <div class="detail-row">
                <span>${escapeHtml(key)}</span>
                <strong>${escapeHtml(
                  formatDetail(value)
                )}</strong>
              </div>
            `
          )
          .join('')}
      </div>
    `;
  }

  /*
   * ============================================================
   * CHART
   * ============================================================
   */

  function drawChart(canvas, values) {
    if (!canvas || !values.length) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    const dpr =
      window.devicePixelRatio || 1;

    const width = Math.max(
      300,
      rect.width
    );

    const height = 170;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx =
      canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    const min = 0;
    const max = 100;

    if (values.length === 1) {
      values = [
        values[0],
        values[0],
      ];
    }

    ctx.beginPath();

    values.forEach(
      (value, index) => {
        const x =
          (index /
            (values.length - 1)) *
          width;

        const normalized =
          (Number(value) - min) /
          (max - min);

        const y =
          height -
          Math.max(
            0,
            Math.min(
              1,
              normalized
            )
          ) *
            height;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    );

    ctx.stroke();
  }

  /*
   * ============================================================
   * HELPERS
   * ============================================================
   */

  function setText(id, value) {
    const element = $(id);

    if (!element) {
      return;
    }

    element.textContent =
      value === undefined ||
      value === null
        ? '—'
        : String(value);
  }

  function setHtml(id, html) {
    const element = $(id);

    if (!element) {
      return;
    }

    element.innerHTML = html;
  }

  function setWidth(id, value) {
    const element = $(id);

    if (!element) {
      return;
    }

    const width = Math.min(
      100,
      Math.max(
        0,
        Number(value)
      )
    );

    element.style.width =
      `${width}%`;
  }

  /*
   * ============================================================
   * DATA LOADING
   * ============================================================
   */

  async function loadDashboard() {
    try {
      /*
       * /api/status is the authoritative snapshot.
       */
      const status =
        await getJson(
          endpoints.status
        );

      renderStatus(status);

      /*
       * Optional endpoints.
       *
       * If one fails, dashboard remains functional.
       */

      const results =
        await Promise.allSettled([
          getJson(endpoints.apis),
          getJson(endpoints.notifications),
        ]);

      if (
        results[0].status ===
        'fulfilled'
      ) {
        renderApis(
          results[0].value
        );
      }

      if (
        results[1].status ===
        'fulfilled'
      ) {
        renderNotifications(
          results[1].value
        );
      }

      setConnection(
        true,
        `Telemetry connected · ${formatTime(
          status.timestamp
        )}`
      );
    } catch (error) {
      console.error(
        'Dashboard telemetry failed:',
        error
      );

      setConnection(
        false,
        'Telemetry disconnected'
      );
    }
  }

  /*
   * ============================================================
   * INIT
   * ============================================================
   */

  function init() {
    loadDashboard();

    window.setInterval(
      loadDashboard,
      POLL_MS
    );

    window.addEventListener(
      'resize',
      () => {
        drawChart(
          $('cpuChart'),
          state.history.cpu
        );

        drawChart(
          $('memoryChart'),
          state.history.memory
        );
      }
    );
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }
})();