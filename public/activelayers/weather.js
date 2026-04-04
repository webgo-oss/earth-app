window.WeatherLayer = (function() {
    let pointCollection = null;
    let weatherEnabled = false;
    let clickHandler = null;

    function getWeatherIconUrl(code) {
        const baseUrl = "https://basmilius.github.io/weather-icons/production/fill/all/";
        
        if (code === 0) return baseUrl + "clear-day.svg";
        if (code === 1 || code === 2) return baseUrl + "partly-cloudy-day.svg";
        if (code === 3) return baseUrl + "overcast.svg";
        if (code === 45 || code === 48) return baseUrl + "fog.svg";
        if (code >= 51 && code <= 55) return baseUrl + "drizzle.svg";
        if (code >= 61 && code <= 65) return baseUrl + "rain.svg";
        if (code >= 71 && code <= 77) return baseUrl + "snow.svg";
        if (code >= 80 && code <= 82) return baseUrl + "extreme-rain.svg";
        if (code >= 95) return baseUrl + "thunderstorms-extreme.svg";
        
        return baseUrl + "not-available.svg"; 
    }

    function decodeWeatherCode(code) {
        const codes = {
            0: "Clear Sky", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
            45: "Dense Fog", 48: "Depositing Rime Fog",
            51: "Light Drizzle", 53: "Mod. Drizzle", 55: "Dense Drizzle",
            61: "Slight Rain", 63: "Moderate Rain", 65: "Heavy Rain",
            71: "Slight Snow", 73: "Moderate Snow", 75: "Heavy Snow",
            80: "Slight Rain Showers", 81: "Moderate Rain Showers",
            95: "Active Thunderstorm"
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
                    const iconUrl = getWeatherIconUrl(cur.weather_code);

                    pointCollection.add({
                        position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 1000),
                        image: iconUrl,
                        width: 48,
                        height: 48
                    });

                    if (logEl) {
                        logEl.innerHTML = `
                            <div style="display: flex; align-items: center; justify-content: space-between; font-family: monospace; line-height: 1.6;">
                                <div>
                                    > <span style="color:#00e676; font-weight:bold;">[ TELEMETRY ACQUIRED ]</span><br>
                                    > ----------------------------<br>
                                    > <span style="color:#888;">LOC:</span> ${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°<br>
                                    > <span style="color:#888;">SKY:</span> ${decodeWeatherCode(cur.weather_code)}<br>
                                    > <span style="color:#888;">TEMP:</span> ${cur.temperature_2m}°C (Feels: ${cur.apparent_temperature}°C)<br>
                                    > <span style="color:#888;">HUMI:</span> ${cur.relative_humidity_2m}%<br>
                                    > <span style="color:#888;">WIND:</span> ${cur.wind_speed_10m} km/h at ${cur.wind_direction_10m}°<br>
                                    > <span style="color:#888;">PRES:</span> ${cur.surface_pressure} hPa<br>
                                    > ----------------------------<br>
                                    > <span style="color:#00ff88;">GEOSPATIAL CLIMATE LOCK</span>
                                </div>
                                <img src="${iconUrl}" style="width: 70px; height: 70px; background: rgba(0,0,0,0.25); border-radius: 50%; padding: 5px; margin-left: 10px;" />
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
                 logEl.innerHTML = ` `;
            }
            viewer.scene.requestRender();
        });
    }

    return { setupToggle };
})();