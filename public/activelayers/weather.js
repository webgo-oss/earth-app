window.WeatherLayer = (function() {
    let pointCollection = null;
    let weatherEnabled = false;
    let clickHandler = null;
    function getFileName(code) {
        switch (code) {
            case 0: return "clear-day.svg";
            case 1: case 2: return "partly-cloudy-day.svg";
            case 3: return "overcast.svg";
            case 45: case 48: return "fog.svg";
            case 51: case 53: case 55: return "drizzle.svg";
            case 61: case 63: case 65: return "rain.svg";
            case 71: case 73: case 75: case 77: return "snow.svg";
            case 80: case 81: case 82: return "extreme-rain.svg";
            case 95: case 96: case 99: return "thunderstorms-extreme.svg";
            default: return "not-available.svg";
        }
    }
    function getWeatherIconUrl(code) {
        return `https://cdn.jsdelivr.net/gh/basmilius/weather-icons@2.0.0/production/fill/all/${getFileName(code)}`;
    }

    function decodeWeatherCode(code) {
        const codes = {
            0: "Sunny", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
            45: "Fog", 48: "Rime Fog",
            51: "Drizzle", 53: "Mod. Drizzle", 55: "Dense Drizzle",
            61: "Slight Rain", 63: "Moderate Rain", 65: "Heavy Rain",
            71: "Slight Snow", 73: "Moderate Snow", 75: "Heavy Snow",
            80: "Slight Rain Showers", 81: "Moderate Rain Showers",
            95: "Thunderstorm"
        };
        return codes[code] || "Atmospheric Flux";
    }

    async function fetchWeather(lat, lon) {
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure`;
            const r = await fetch(url);
            if (!r.ok) return null;
            return await r.json();
        } catch (err) {
            console.error("Open-Meteo fetch error:", err);
            return null;
        }
    }

    function setupClickHandler(viewer) {
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        
        clickHandler.setInputAction(async function (movement) {
            const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
            
            if (Cesium.defined(cartesian)) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                const longitude = Cesium.Math.toDegrees(cartographic.longitude);
                const latitude = Cesium.Math.toDegrees(cartographic.latitude);

                const logEl = document.getElementById("intel-log");
                if (logEl) {
                    logEl.innerHTML = `
                        <div style="font-family: monospace; line-height: 1.6;">
                            > <span style="color:#FFA500; font-weight:bold;">[ SYSTEM SCANNING ]</span><br>
                            > ----------------------------<br>
                            > INTERCEPTING ATMOSPHERIC STREAM<br>
                            > [COORDS]: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°
                        </div>
                    `;
                }

                if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
                pointCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());

                viewer.camera.flyToBoundingSphere(
                    new Cesium.BoundingSphere(cartesian, 0),
                    {
                        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 180000), 
                        duration: 2.0 
                    }
                );

                const weatherData = await fetchWeather(latitude, longitude);
                
                if (weatherData && weatherData.current) {
                    const cur = weatherData.current;
                    const staticIconUrl = getWeatherIconUrl(cur.weather_code);

                    pointCollection.add({
                        position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 1000),
                        image: staticIconUrl,
                        width: 48,
                        height: 48,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM
                    });

                    if (logEl) {
                        const now = new Date();
                        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const simulatedAQI = (cur.surface_pressure * 0.05 + Math.random() * 20).toFixed(0); 
                        const aqiColor = simulatedAQI > 50 ? "#FFD600" : simulatedAQI > 100 ? "#F44336" : "#00ff88";
                        logEl.innerHTML = `
                            <div style="
                                display: flex; 
                                flex-direction: column;
                                font-family: monospace; 
                                color: rgba(255,255,255,0.8);
                                font-size: 13px;
                                text-align: center;
                                padding: 10px;
                            ">
                                <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 15px;">
                                    <span style="font-weight:bold;">Loc Lock</span>
                                    <span>${timeString}</span>
                                </div>

                                <div style="margin-bottom: 25px; flex-grow: 1;">
                                    <img src="${staticIconUrl}" style="width: 90px; height: 90px; display: block; margin: 0 auto 5px;" />
                                    <span style="font-size: 14px; font-weight:bold; color:#00ff88;">${decodeWeatherCode(cur.weather_code)}</span>
                                </div>

                                <div style="
                                    display: grid; 
                                    grid-template-columns: repeat(2, 1fr); 
                                    gap: 8px 12px;
                                    text-align: left;
                                    line-height: 1.4;
                                ">
                                    <div>LOC: ${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°</div>
                                    <div>AQI: <span style="color:${aqiColor}; font-weight:bold;">${simulatedAQI} (MODERATE)</span></div>
                                    
                                    <div>TEMP: <span style="font-weight:bold; color:white;">${cur.temperature_2m.toFixed(1)}°C</span></div>
                                    <div>PRES: ${cur.surface_pressure.toFixed(0)} hPa</div>

                                    <div>FEELS: ${cur.apparent_temperature.toFixed(1)}°C</div>
                                    <div>HUMI: ${cur.relative_humidity_2m}%</div>

                                    <div style="grid-column: span 2; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 5px;">
                                        WIND: ${cur.wind_speed_10m} km/h at ${cur.wind_direction_10m}°
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function setupToggle(viewer) {
        const weatherBtn = document.getElementById('weather');
        if (!weatherBtn) return;

        weatherBtn.addEventListener('click', async () => {
            weatherEnabled = !weatherEnabled;
            if (weatherEnabled) {
                setupClickHandler(viewer);
            } else {
                if (clickHandler) clickHandler.destroy();
                if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
                const logEl = document.getElementById("intel-log");
                if (logEl) logEl.innerHTML = ` `;
            }
            viewer.scene.requestRender();
        });
    }

    return { setupToggle };
})();