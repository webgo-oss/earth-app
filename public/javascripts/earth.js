const configResponse = await fetch('/api/config');
const config = await configResponse.json();

Cesium.Ion.defaultAccessToken = config.globeearth;

const viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    contextOptions: {
        webgl: {
            preserveDrawingBuffer: true
        }
    },
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    msaaSamples: 1,
});

viewer.scene.globe.maximumScreenSpaceError = 2;
viewer.scene.postProcessStages.fxaa.enabled = false;
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.baseColor = Cesium.Color.BLACK;
viewer._cesiumWidget._creditContainer.style.display = "none";

viewer.resolutionScale = window.devicePixelRatio || 1.0;

(async () => {
    const provider = await Cesium.IonImageryProvider.fromAssetId(3);
    const layer = new Cesium.ImageryLayer(provider);
    viewer.imageryLayers.add(layer);
})();

viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
    orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0
    }
});

function setMapView(mode) {
    if (mode === "3d") {
        viewer.scene.morphTo3D(1.0);
    } else if (mode === "2d") {
        viewer.scene.morphTo2D(1.0);
        setTimeout(() => {
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            viewer.camera.setView({
                destination: Cesium.Rectangle.fromDegrees(-180, -85, 180, 85)
            });
        }, 1100);
    }
}

const mapButtons = document.querySelectorAll(".map-btn");
mapButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        mapButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        setMapView(btn.getAttribute("data-view"));
    });
});

const cityLocations = {
    "Global": { lon: 0, lat: 20, height: 20000000, pitch: -90 },
    "New York": { lon: -74.0060, lat: 40.7128, height: 12000, pitch: -45 }, 
    "Toronto": { lon: -79.3832, lat: 43.6532, height: 10000, pitch: -45 },
    "Mexico City": { lon: -99.1332, lat: 19.4326, height: 15000, pitch: -45 }, 
    "Sao Paulo": { lon: -46.6333, lat: -23.5505, height: 15000, pitch: -45 },
    "London": { lon: -0.1276, lat: 51.5074, height: 8000, pitch: -45 },
    "Paris": { lon: 2.3522, lat: 48.8566, height: 8000, pitch: -45 },
    "Berlin": { lon: 13.4050, lat: 52.5200, height: 10000, pitch: -45 },
    "Rome": { lon: 12.4964, lat: 41.9028, height: 8000, pitch: -45 },
    "Moscow": { lon: 37.6173, lat: 55.7558, height: 10000, pitch: -45 },
    "Dubai": { lon: 55.2744, lat: 25.1972, height: 5000, pitch: -35 },
    "Cairo": { lon: 31.2357, lat: 30.0444, height: 12000, pitch: -45 },
    "Cape Town": { lon: 18.4241, lat: -33.9249, height: 10000, pitch: -45 },
    "Mumbai": { lon: 72.8347, lat: 18.9220, height: 10000, pitch: -45 },
    "Singapore": { lon: 103.8519, lat: 1.2902, height: 6000, pitch: -45 },
    "Tokyo": { lon: 139.6917, lat: 35.6895, height: 12000, pitch: -45 },
    "Seoul": { lon: 126.9780, lat: 37.5665, height: 10000, pitch: -45 },
    "Sydney": { lon: 151.2093, lat: -33.8688, height: 8000, pitch: -45 }
};

document.querySelectorAll(".city-box").forEach(box => {
    box.addEventListener("click", () => {
        const location = cityLocations[box.getAttribute("data-city")];
        if (!location) return;
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(location.lon, location.lat, location.height),
            orientation: {
                heading: 0,
                pitch: Cesium.Math.toRadians(location.pitch),
                roll: 0
            },
            duration: 2
        });
    });
});

const latEl = document.getElementById("lat-val");
const lonEl = document.getElementById("lon-val");
const altEl = document.getElementById("alt-val");

viewer.camera.changed.addEventListener(() => {
    const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
    let lat = Cesium.Math.toDegrees(cartographic.latitude);
    let lon = Cesium.Math.toDegrees(cartographic.longitude);
    let alt = cartographic.height / 1000;

    latEl.textContent = `${Math.abs(lat).toFixed(4)} ${lat >= 0 ? "N" : "S"}`;
    lonEl.textContent = `${Math.abs(lon).toFixed(4)} ${lon >= 0 ? "E" : "W"}`;
    altEl.textContent = `${alt.toFixed(1)} KM`;
});

const searchInput = document.getElementById("searchBox");
const geocoder = new Cesium.IonGeocoderService();

searchInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
        const query = searchInput.value.trim();
        if (!query) return;
        try {
            const results = await geocoder.geocode(query);
            if (results.length > 0) {
                const cartographic = Cesium.Rectangle.center(results[0].destination);
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(
                        Cesium.Math.toDegrees(cartographic.longitude),
                        Cesium.Math.toDegrees(cartographic.latitude),
                        700000
                    ),
                    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
                    duration: 2
                });
                searchInput.value = "";
            } else { alert("Location not found"); }
        } catch (err) { alert("Search error"); }
    }
});

if (window.FlightLayer) {
    window.FlightLayer.setupToggle(viewer, 'toggle-flights');
}
if(window.MilFlightLayer){
    MilFlightLayer.setupToggle(viewer, 'toggle-milflights');
}
if(window.TrafficLayer){
    TrafficLayer.setupToggle(viewer, 'see-traffic');
}
if(window.SatelliteLayer){
    SatelliteLayer.setupToggle(viewer, 'satalite');
}
if(window.ShipLayer){
    ShipLayer.setupToggle(viewer, 'ships');
}
if(window.WeatherLayer){
    WeatherLayer.setupToggle(viewer);
}