const express = require("express");
const path = require("path");
const axios = require("axios");
const { getOrbitalData } = require("./earthorbital/orbitalspeed");
const env = require('./config/env');
const app = express();
const PORT = process.env.PORT || env.PORT || 3000;
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.get('/api/config', (req, res) => {
  res.json({
    globeearth: env.CESIUM_ION_TOKEN,
    tomtom: process.env.TOMTOM,
    ship: process.env.AISSTREAM_KEY
  });
});

// ---------- OpenSky (OAuth2 - basic auth was removed by OpenSky on 18 Mar 2026) ----------
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
let openskyToken = { value: null, exp: 0 };

async function getOpenSkyHeaders() {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return {}; // anonymous (lower limits)
  if (!openskyToken.value || Date.now() > openskyToken.exp - 30000) {
    const r = await axios.post(OPENSKY_TOKEN_URL,
      new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
    openskyToken = { value: r.data.access_token, exp: Date.now() + (r.data.expires_in || 300) * 1000 };
  }
  return { Authorization: 'Bearer ' + openskyToken.value };
}

let flightCache = { data: null, ts: 0 };
let flightInflight = null;
let openskyDownUntil = 0;   // circuit breaker: skip OpenSky for a while after it fails
let flightErrors = [];
const FLIGHT_TTL = 20000;

// Fallback: no-key ADS-B feed (adsb.lol), queried around busy regions and converted to OpenSky's "states" shape.
const FALLBACK_POINTS = [
  [40, -74], [34, -118], [41, -88], [33, -97], [28, -81], [49, -123], [45, -75],   // North America
  [51, 0], [49, 9], [41, 12], [40, -4], [55, 25],                                  // Europe
  [25, 55], [28, 77], [19, 73], [13, 100], [1, 104],                               // Middle East / Asia
  [35, 139], [31, 121], [37, 127], [23, 113],                                      // East Asia
  [-34, 151], [-23, -46], [-26, 28], [-1, 37]                                      // AUS / S.America / Africa
];

async function fetchFallbackStates() {
  const results = await Promise.allSettled(FALLBACK_POINTS.map(([lat, lon]) =>
    axios.get(`https://api.adsb.lol/v2/point/${lat}/${lon}/250`, { timeout: 12000 })));
  const seen = new Map();
  let okCount = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    okCount++;
    for (const a of (r.value.data.ac || [])) {
      if (a.lat === undefined || a.lon === undefined || !a.hex || seen.has(a.hex)) continue;
      const onGround = a.alt_baro === 'ground';
      const altM = onGround ? 0 : (typeof a.alt_baro === 'number' ? a.alt_baro * 0.3048 : (a.alt_geom || 0) * 0.3048);
      seen.set(a.hex, [
        a.hex, (a.flight || '').trim(), a.r || 'Unknown', null, null,
        a.lon, a.lat, altM, onGround,
        a.gs ? a.gs * 0.514444 : null, a.track ?? null
      ]);
    }
  }
  if (!okCount) throw new Error('fallback feed unreachable');
  return { time: Math.floor(Date.now() / 1000), states: Array.from(seen.values()) };
}

async function refreshFlights() {
  flightErrors = [];
  if (Date.now() > openskyDownUntil) {
    try {
      const headers = await getOpenSkyHeaders();
      const r = await axios.get('https://opensky-network.org/api/states/all', { headers, timeout: 20000 });
      flightCache = { data: r.data, ts: Date.now(), source: 'opensky' };
      return;
    } catch (e) {
      const code = e.response?.status || e.message;
      flightErrors.push({ source: 'opensky', error: String(code) });
      console.error('OpenSky States Error:', code,
        code === 401 || code === 403 ? '(check OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET env vars)' : '');
      openskyDownUntil = Date.now() + 5 * 60 * 1000; // don't retry for 5 min
    }
  }
  try {
    const data = await fetchFallbackStates();
    flightCache = { data, ts: Date.now(), source: 'adsb.lol' };
    console.log('Flights from adsb.lol fallback:', data.states.length);
  } catch (e) {
    flightErrors.push({ source: 'adsb.lol', error: String(e.message) });
    throw e;
  }
}

app.get('/api/flights', async (req, res) => {
  try {
    if (!flightCache.data || Date.now() - flightCache.ts > FLIGHT_TTL) {
      flightInflight = flightInflight || refreshFlights().finally(() => { flightInflight = null; });
      try { await flightInflight; }
      catch (e) { if (!flightCache.data) throw e; }
    }
    res.json(flightCache.data);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch flight states', sources: flightErrors });
  }
});

app.get('/api/tracks', async (req, res) => {
  try {
    const icao24 = String(req.query.icao24 || '').toLowerCase().replace(/[^0-9a-f]/g, '');
    const headers = await getOpenSkyHeaders();
    const response = await axios.get('https://opensky-network.org/api/tracks/all', { params: { icao24, time: 0 }, headers, timeout: 20000 });
    res.json(response.data);
  } catch (error) {
    console.error('OpenSky Track Error:', error.response?.status || error.message);
    res.status(502).json({ error: 'Failed to fetch track' });
  }
});

// ---------- Server-side TLE proxy (avoids browser CORS / blocked public proxies) ----------
const TLE_SOURCES = [
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', type: 'text' },
  { url: 'https://celestrak.org/pub/TLE/active.txt', type: 'text' },
  { url: 'https://db.satnogs.org/api/tle/?format=json&page_size=2000', type: 'json' },
  { url: 'https://www.amsat.org/tle/current/nasabare.txt', type: 'text', min: 200 },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle', type: 'text', min: 200 }
];
let tleErrors = [];
const TLE_TTL = 2 * 60 * 60 * 1000; // 2h - CelesTrak data only updates every few hours and blocks over-polling
let tleCache = { data: null, type: null, ts: 0 };
let tleInflight = null;

async function refreshTLE() {
  tleErrors = [];
  for (const src of TLE_SOURCES) {
    try {
      const r = await axios.get(src.url, {
        timeout: 20000,
        responseType: src.type === 'json' ? 'json' : 'text',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; earth-app/1.0)', 'Accept': '*/*' }
      });
      const ok = src.type === 'json' ? Array.isArray(r.data?.results || r.data) && (r.data.results || r.data).length > 0
                                     : typeof r.data === 'string' && r.data.length > (src.min || 1000);
      if (!ok) throw new Error('empty/invalid payload');
      tleCache = { data: r.data, type: src.type, ts: Date.now() };
      console.log('TLE refreshed from', src.url);
      return;
    } catch (e) {
      console.warn('TLE source failed:', src.url, e.response?.status || e.message);
      tleErrors.push({ url: src.url, error: String(e.response?.status || e.message) });
    }
  }
  throw new Error('all TLE sources failed');
}

app.get('/api/tle', async (req, res) => {
  try {
    const fresh = tleCache.data && (Date.now() - tleCache.ts) < TLE_TTL;
    if (!fresh) {
      try {
        tleInflight = tleInflight || refreshTLE().finally(() => { tleInflight = null; });
        await tleInflight;
      } catch (e) {
        if (!tleCache.data) throw e; // no stale copy to fall back on
        console.warn('Serving stale TLE cache');
      }
    }
    res.set('Cache-Control', 'public, max-age=600');
    if (tleCache.type === 'json') res.json(tleCache.data);
    else res.type('text/plain').send(tleCache.data);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch TLE data', sources: tleErrors });
  }
});

// ---------- Server-side proxy for military flights ----------
let milCache = { data: null, ts: 0 };
app.get('/api/mil', async (req, res) => {
  try {
    if (!milCache.data || Date.now() - milCache.ts > 5000) {
      const r = await axios.get('https://api.adsb.lol/v2/mil', { timeout: 15000 });
      milCache = { data: r.data, ts: Date.now() };
    }
    res.json(milCache.data);
  } catch (e) {
    if (milCache.data) return res.json(milCache.data);
    res.status(502).json({ error: 'Failed to fetch military flights' });
  }
});

app.get("/", async (req, res) => {
  res.render("main");
});
app.get("/index", async (req, res) => {
  const orbitalData = await getOrbitalData();
  res.render("index", { orbitalData });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));