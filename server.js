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
        const response = await axios.get(
            'https://opensky-network.org/api/states/all?lamin=5&lomin=65&lamax=40&lomax=100',
            { timeout: 10000 }
        );

        console.log("Flights count:", response.data.states?.length);

        res.json(response.data);

    } catch (error) {
        console.error("OpenSky Error:", error.message);

        res.json({ states: [] }); // fallback
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

app.get("/", async (req, res) => {
  res.render("main");
});
app.get("/index", async (req, res) => {
  const orbitalData = await getOrbitalData();
  res.render("index", { orbitalData });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));