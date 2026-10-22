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

app.get('/api/flights', async (req, res) => {
    try {
        const user = process.env.OPENSKY_USER;
        const pass = process.env.OPENSKY_PASS;
        
        const response = await axios.get('https://opensky-network.org/api/states/all', {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("OpenSky States Error:", error.message);
        res.status(500).json({ error: "Failed to fetch flight states" });
    }
});

app.get('/api/tracks', async (req, res) => {
    try {
        const { icao24 } = req.query;
        const response = await axios.get(`https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=0`);
        res.json(response.data);
    } catch (error) {
        console.error("OpenSky Track Error:", error.message);
        res.status(500).json({ error: "Failed to fetch track" });
    }
});


// ---------- Server-side TLE proxy (avoids browser CORS / blocked public proxies) ----------
const TLE_SOURCES = [
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', type: 'text' },
  { url: 'https://celestrak.org/pub/TLE/active.txt', type: 'text' },
  { url: 'https://db.satnogs.org/api/tle/?format=json&page_size=2000', type: 'json' }
];
const TLE_TTL = 2 * 60 * 60 * 1000; // 2h - CelesTrak data only updates every few hours and blocks over-polling
let tleCache = { data: null, type: null, ts: 0 };
let tleInflight = null;

async function refreshTLE() {
  for (const src of TLE_SOURCES) {
    try {
      const r = await axios.get(src.url, {
        timeout: 20000,
        responseType: src.type === 'json' ? 'json' : 'text',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; earth-app/1.0)', 'Accept': '*/*' }
      });
      const ok = src.type === 'json' ? Array.isArray(r.data?.results || r.data) && (r.data.results || r.data).length > 0
                                     : typeof r.data === 'string' && r.data.length > 1000;
      if (!ok) throw new Error('empty/invalid payload');
      tleCache = { data: r.data, type: src.type, ts: Date.now() };
      console.log('TLE refreshed from', src.url);
      return;
    } catch (e) {
      console.warn('TLE source failed:', src.url, e.response?.status || e.message);
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
    res.status(502).json({ error: 'Failed to fetch TLE data' });
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