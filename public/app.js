(() => {
  'use strict';

  const POLL_MS = 5000;
  const state = {
    status: null,
    metrics: null,
    apis: [],
    notifications: [],
    previousOverall: null,
    history: { cpu: [], memory: [] },
  };

  const $ = (id) => document.getElementById(id);

  const endpoints = {
    status: '/api/status',
    metrics: '/api/metrics',
    apis: '/api/apis',
    notifications: '/api/notifications',
  };

  async function getJson(url) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  function firstDefined(...values) {
    return values.find((v) => v !== undefined && v !== null);
  }

  function formatBytes(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    const bytes = Number(value);
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatDuration(seconds) {
    if (seconds == null) return '—';
    let s = Math.max(0, Math.floor(Number(seconds)));
    const d = Math.floor(s / 86400);
    s %= 86400;
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (!parts.length || s) parts.push(`${s}s`);
    return parts.join(' ');
  }

  function formatTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('id-ID', { hour12: false });
  }

  function statusClass(status) {
    return String(status || 'unknown').toLowerCase();
  }

  function setConnection(online, text) {
    const pill = $('connectionPill');
    pill.classList.toggle('online', online);
    pill.classList.toggle('offline', !online);
    $('connectionText').textContent = text;
  }

  function renderOverview(report) {
    state.status = report;
    const overall = report?.status || 'unknown';
    const badge = $('overallBadge');
    badge.textContent = overall.toUpperCase();
    badge.className = `status-badge ${statusClass(overall)}`;

    const whatsapp = (report.services || []).find((s) => s.name === 'WhatsApp');
    const active = whatsapp?.status === 'healthy';

    $('heroTitle').textContent = active ? 'MapleBot is online' : 'MapleBot Operations';
    $('heroMessage').textContent = whatsapp?.message || 'Application telemetry is available.';
    $('healthTimestamp').textContent = report.timestamp
      ? `Updated ${formatTime(report.timestamp)}`
      : '—';

    const config = report.configuration || report.config || {};
    $('envValue').textContent = firstDefined(
      config.environment,
      config.nodeEnv,
      report.environment,
      '—'
    );
    $('modeValue').textContent = firstDefined(config.mode, '—');
    $('botValue').textContent = firstDefined(config.bot, config.botName, 'MapleBot');

    renderServices(report.services || []);
  }

  function renderServices(services) {
    const html =
      services
        .map(
          (service) => `
      <article class="service-card">
        <div class="service-top">
          <span class="service-name">${escapeHtml(service.name || 'Unknown')}</span>
          <i class="dot ${statusClass(service.status)}"></i>
        </div>
        <div class="service-message">${escapeHtml(service.message || 'No status message.')}</div>
        <div class="service-latency">${service.latency == null ? '—' : `${service.latency} ms`}</div>
      </article>
    `
        )
        .join('') || `<div class="empty">No service data.</div>`;

    $('serviceGrid').innerHTML = html;
    $('servicesGrid').innerHTML = html;
  }

  function renderMetrics(data) {
    if (!data) return;
    state.metrics = data;

    const cpu = Number(firstDefined(data.cpuUsage, data.cpu, data.process?.cpu, data.runtime?.cpu));
    const memory = Number(
      firstDefined(data.memoryUsage, data.memory, data.system?.memoryUsage, data.runtime?.memory)
    );

    if (Number.isFinite(cpu)) {
      $('cpuValue').textContent = `${cpu.toFixed(1)}%`;
      $('cpuBar').style.width = `${Math.min(100, Math.max(0, cpu))}%`;
      state.history.cpu.push(cpu);
      state.history.cpu = state.history.cpu.slice(-30);
      $('cpuHistoryValue').textContent = `${cpu.toFixed(1)}%`;
      drawChart($('cpuChart'), state.history.cpu);
    }

    if (Number.isFinite(memory)) {
      $('memoryValue').textContent = `${memory.toFixed(1)}%`;
      $('memoryBar').style.width = `${Math.min(100, Math.max(0, memory))}%`;
      state.history.memory.push(memory);
      state.history.memory = state.history.memory.slice(-30);
      $('memoryHistoryValue').textContent = `${memory.toFixed(1)}%`;
      drawChart($('memoryChart'), state.history.memory);
    }

    const load = firstDefined(data.systemLoad, data.load, data.system?.load);
    $('loadValue').textContent = Array.isArray(load)
      ? load.map((v) => Number(v).toFixed(2)).join(' / ')
      : (load ?? '—');

    const rss = firstDefined(data.rss, data.process?.rss, data.memory?.rss);
    $('rssValue').textContent = typeof rss === 'number' ? formatBytes(rss) : rss || '—';

    $('messagesValue').textContent = firstDefined(
      data.messagesProcessed,
      data.messages,
      data.runtime?.messages,
      0
    );
    $('commandsValue').textContent =
      `${firstDefined(data.commandsExecuted, data.commands, data.runtime?.commands, 0)} cmds`;

    renderRuntime(data);
  }

  function renderRuntime(data) {
    const rows = [
      ['PID', firstDefined(data.pid, data.process?.pid)],
      ['RSS', firstDefined(data.rss, data.process?.rss)],
      ['Heap used', firstDefined(data.heapUsed, data.process?.heapUsed)],
      ['Heap total', firstDefined(data.heapTotal, data.process?.heapTotal)],
      ['External', firstDefined(data.external, data.process?.external)],
      ['Process uptime', formatDuration(firstDefined(data.processUptime, data.process?.uptime))],
      ['Node.js', firstDefined(data.nodeVersion, data.node, data.version)],
    ];
    $('runtimePanel').innerHTML =
      `<div class="panel-header"><div><span class="eyebrow">NODE PROCESS</span><h2>Runtime</h2></div></div>
      <div class="detail-list">${rows.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(formatDetail(v))}</strong></div>`).join('')}</div>`;

    const cfg = firstDefined(data.configuration, data.config, {});
    const configRows = Object.entries(cfg).slice(0, 12);
    $('configPanel').innerHTML =
      `<div class="panel-header"><div><span class="eyebrow">CONFIGURATION</span><h2>Public snapshot</h2></div></div>
      <div class="detail-list">${configRows.length ? configRows.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(formatDetail(v))}</strong></div>`).join('') : `<div class="empty">Configuration snapshot is not exposed by this endpoint.</div>`}</div>`;
  }

  function renderApis(list) {
    const providers = Array.isArray(list) ? list : list?.providers || list?.apis || [];
    state.apis = providers;

    const enabled = providers.filter((p) => p.enabled !== false).length;
    $('apiSummary').textContent = `${providers.length} providers · ${enabled} enabled`;

    $('apiGrid').innerHTML = providers.length
      ? providers
          .map((p) => {
            const health = p.health || {};
            const status = firstDefined(health.status, p.status, 'unknown');
            return `<article class="api-card">
        <div class="api-category">${escapeHtml(p.category || 'provider')}</div>
        <div class="api-name">${escapeHtml(p.name || p.id || 'Unknown API')}</div>
        <div class="api-id">${escapeHtml(p.id || '—')}</div>
        <div class="api-status"><i class="dot ${statusClass(status)}"></i><span>${escapeHtml(status)}</span></div>
      </article>`;
          })
          .join('')
      : `<div class="empty">No API provider data.</div>`;
  }

  function renderNotifications(list) {
    const items = Array.isArray(list) ? list : list?.notifications || list?.history || [];
    state.notifications = items;
    $('notificationCount').textContent = `${items.length} events`;

    if (!items.length) {
      $('notificationList').innerHTML = `<div class="empty">No recent notifications.</div>`;
      return;
    }

    $('notificationList').innerHTML = items
      .slice(0, 30)
      .map((item) => {
        const type = String(item.type || item.event || 'info').toLowerCase();
        const icon = type.includes('error')
          ? '✕'
          : type.includes('reconnect')
            ? '↻'
            : type.includes('login')
              ? '↪'
              : '●';
        return `<div class="notification-item">
        <div class="notification-time">${escapeHtml(formatTime(item.timestamp || item.createdAt || item.time))}</div>
        <div class="notification-icon">${icon}</div>
        <div>
          <div class="notification-title">${escapeHtml(item.title || item.type || item.event || 'Notification')}</div>
          <div class="notification-message">${escapeHtml(item.message || item.description || '')}</div>
        </div>
      </div>`;
      })
      .join('');
  }

  function drawChart(canvas, values) {
    if (!canvas || values.length < 1) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(300, rect.width);
    const height = 170;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = 8;
    const max = Math.max(100, ...values);
    const min = 0;
    const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= 4; y++) {
      const yy = pad + ((height - pad * 2) * y) / 4;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(width, yy);
      ctx.stroke();
    }

    const points = values.map((v, i) => ({
      x: pad + step * i,
      y: height - pad - ((v - min) / (max - min)) * (height - pad * 2),
    }));

    if (points.length > 1) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(217,255,114,.22)');
      gradient.addColorStop(1, 'rgba(217,255,114,0)');
      ctx.beginPath();
      ctx.moveTo(points[0].x, height - pad);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points.at(-1).x, height - pad);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = '#d9ff72';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function formatDetail(value) {
    if (value == null) return '—';
    if (typeof value === 'number' && value > 1024 * 1024) return formatBytes(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        })[c]
    );
  }

  async function refresh() {
    const started = performance.now();
    try {
      const status = await getJson(endpoints.status);
      renderOverview(status);
      setConnection(true, 'Telemetry connected');

      const [metrics, apis, notifications] = await Promise.allSettled([
        getJson(endpoints.metrics),
        getJson(endpoints.apis),
        getJson(endpoints.notifications),
      ]);

      if (metrics.status === 'fulfilled') renderMetrics(metrics.value);
      if (apis.status === 'fulfilled') renderApis(apis.value);
      if (notifications.status === 'fulfilled') renderNotifications(notifications.value);

      $('lastUpdate').textContent =
        `Updated ${formatTime(new Date())} · ${Math.round(performance.now() - started)}ms`;

      if (state.previousOverall && state.previousOverall !== status.status) {
        toast(`Health changed: ${state.previousOverall} → ${status.status}`);
      }
      state.previousOverall = status.status;
    } catch (error) {
      setConnection(false, 'Telemetry offline');
      $('lastUpdate').textContent = 'Telemetry endpoint unavailable';
      $('heroMessage').textContent =
        'Cannot reach the dashboard API. The UI will retry automatically.';
      toast('Dashboard API unavailable', true);
    }
  }

  function toast(message, error = false) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderColor = error ? 'rgba(255,107,122,.35)' : 'rgba(217,255,114,.25)';
    el.textContent = message;
    $('toastStack').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
      item.classList.add('active');
      $('sidebar').classList.remove('open');
    });
  });

  $('refreshButton').addEventListener('click', refresh);
  $('menuButton').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('pollInterval').textContent = `${POLL_MS / 1000}s`;

  window.addEventListener('resize', () => {
    drawChart($('cpuChart'), state.history.cpu);
    drawChart($('memoryChart'), state.history.memory);
  });

  refresh();
  setInterval(refresh, POLL_MS);
})();
