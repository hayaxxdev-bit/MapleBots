# MapleBot Web Dashboard

Modern, dependency-free operations dashboard for MapleBot.

## Files

```text
public/
├── index.html
├── styles.css
└── app.js
```

## Features

- Responsive dark operations console
- Realtime polling every 5 seconds
- WhatsApp connection status
- Overall application health
- CPU / memory telemetry
- CPU / memory history charts
- Runtime / Node.js information
- API provider registry
- Notification history
- Mobile sidebar
- Graceful fallback when optional API endpoints are unavailable
- No frontend framework or CDN dependency

## Expected backend endpoints

The frontend will consume:

```text
GET /api/status
GET /api/metrics
GET /api/apis
GET /api/notifications
```

`/api/status` is the primary endpoint. The other endpoints are optional; the dashboard continues to work when they are not available.

The frontend intentionally does not expose secrets, owner numbers, session credentials, API keys, or WhatsApp authentication data.

## Local usage

Serve the `public` directory from the MapleBot backend and open:

```text
http://localhost:3000/
```

The frontend uses relative URLs, so no localhost URL is hardcoded.

## Vercel

This frontend is static and can be deployed as a Vercel project. If the MapleBot backend remains on another server, configure the backend URL through a reverse proxy or API routing layer rather than hardcoding it in `app.js`.
