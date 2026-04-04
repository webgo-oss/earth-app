window.FlightLayer = (function() {
    let pointCollection = null;
    let labelCollection = null;
    let pathEntity = null; 
    let updateTimer = null;
    let flightsEnabled = false;
    let clickHandler = null;

    let activeBillboards = {}; 
    let activeLabels = {};

    const REFRESH_MS = 20000; 
    
    const BASE_URL = '/api'; 

    const FOLLOW_ALT = 150000; 

    function _makePlane(color, sz) {
        const c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        const ctx = c.getContext('2d');
        const mx = sz / 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(mx, sz * 0.05);
        ctx.lineTo(mx + sz * 0.12, sz * 0.38);
        ctx.lineTo(sz * 0.92, sz * 0.50);
        ctx.lineTo(mx + sz * 0.12, sz * 0.62);
        ctx.lineTo(mx + sz * 0.18, sz * 0.92);
        ctx.lineTo(mx, sz * 0.78);
        ctx.lineTo(mx - sz * 0.18, sz * 0.92);
        ctx.lineTo(mx - sz * 0.12, sz * 0.62);
        ctx.lineTo(sz * 0.08, sz * 0.50);
        ctx.lineTo(mx - sz * 0.12, sz * 0.38);
        ctx.closePath();
        ctx.fill();
        return c;
    }

    const _planeImg = _makePlane('rgba(255,255,255,0.85)', 16);

    async function fetchTrack(icao24) {
        try {
            const r = await fetch(`${BASE_URL}/tracks?icao24=${icao24}`);
            if (!r.ok) return null;
            const data = await r.json();
            
            if (!data || !data.path || data.path.length < 2) return null;

            return data.path
                .filter(wp => wp[1] && wp[2])
                .map(wp => ({ lat: wp[1], lon: wp[2], alt: wp[3] || 0 }));
        } catch (err) {
            console.error("Path fetch error:", err);
            return null;
        }
    }

    function drawPath(viewer, points) {
        if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
        if (!points || points.length < 2) return;

        pathEntity = viewer.entities.add({
            polyline: {
                positions: points.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt || 0) + 200)),
                width: 2,
                material: new Cesium.PolylineDashMaterialProperty({
                    color: Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.80),
                    dashLength: 16,
                    gapColor: Cesium.Color.TRANSPARENT,
                }),
            },
        });
        viewer.scene.requestRender();
    }

    async function fetchAndRender(viewer) {
        try {
            const response = await fetch(`${BASE_URL}/flights`);

            if (!response.ok) throw new Error(`Fetch failed status: ${response.status}`);
            
            const data = await response.json();
            const states = (data.states || []).filter(s => 
                s[5] !== null && s[6] !== null && s[7] !== null && !s[8]
            );

            if (!pointCollection) pointCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
            if (!labelCollection) labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

            const freshIcaos = new Set();

            states.forEach(s => {
                const icao = s[0];
                const callsign = s[1]?.trim() || icao;
                const pos = Cesium.Cartesian3.fromDegrees(s[5], s[6], (s[7] || 0) + 100);
                const rotation = s[10] !== null ? -Cesium.Math.toRadians(s[10]) : 0;
                
                freshIcaos.add(icao);

                const flightData = {
                    _type: 'flight',
                    callsign: callsign,
                    icao: icao,
                    origin: s[2] || 'Unknown',
                    alt: Math.round(s[7] || 0) + ' m',
                    speed: s[9] ? Math.round(s[9]) + ' m/s' : '---',
                    heading: s[10] ? Math.round(s[10]) + '°' : '---',
                    rawLon: s[5],
                    rawLat: s[6],
                    rawAlt: s[7] || 0
                };

                if (activeBillboards[icao]) {
                    const b = activeBillboards[icao];
                    b.position = pos;
                    b.rotation = rotation;
                    b.id = flightData;
                } else {
                    activeBillboards[icao] = pointCollection.add({
                        position: pos,
                        image: _planeImg,
                        rotation: rotation,
                        scale: 1.0,
                        id: flightData
                    });
                }

                if (activeLabels[icao]) {
                    const l = activeLabels[icao];
                    l.position = pos;
                    l.text = callsign;
                } else {
                    activeLabels[icao] = labelCollection.add({
                        position: pos,
                        text: callsign,
                        font: '9px "Courier New"',
                        fillColor: Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.92),
                        outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        pixelOffset: new Cesium.Cartesian2(10, -6),
                        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        scaleByDistance: new Cesium.NearFarScalar(150000, 1.0, 3000000, 0.0),
                    });
                }
            });

            Object.keys(activeBillboards).forEach(icao => {
                if (!freshIcaos.has(icao)) {
                    pointCollection.remove(activeBillboards[icao]);
                    labelCollection.remove(activeLabels[icao]);
                    delete activeBillboards[icao];
                    delete activeLabels[icao];
                }
            });

            const trackedNumEl = document.getElementById("tracked-num");
            const stripObjectsEl = document.getElementById("strip-objects");
            
            if (trackedNumEl) trackedNumEl.innerText = states.length;
            if (stripObjectsEl) stripObjectsEl.innerText = states.length;

            viewer.scene.requestRender(); 

        } catch (error) {
            console.error("Error updating flight layer:", error);
        }
    }

    function setupClickHandler(viewer) {
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction(async function (movement) {
            const pickedObject = viewer.scene.pick(movement.position);
            
            if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id._type === 'flight') {
                const data = pickedObject.id;
                
                const logEl = document.getElementById("intel-log");
                if (logEl) {
                   logEl.innerHTML = `
                        <div style="font-family: monospace; line-height: 1.6;">
                            > <span style="color:#00f0ff; font-weight:bold;">[ ACQUISITION ACTIVE ]</span><br>
                            > ----------------------------<br>
                            > <span style="color:#888;">TARGET ID :</span> ${data.callsign}<br>
                            > <span style="color:#888;">ICAO24    :</span> ${data.icao}<br>
                            > <span style="color:#888;">ORIGIN    :</span> ${data.origin}<br>
                            > <span style="color:#888;">ALTITUDE  :</span> ${data.alt}<br>
                            > <span style="color:#888;">AIRSPEED  :</span> ${data.speed}<br>
                            > <span style="color:#888;">HEADING   :</span> ${data.heading}<br>
                            > ----------------------------<br>
                            > <span style="color:#00ff88;">UPLINK STATUS: STABLE</span>
                        </div>
                    `;
                }

                const planeTarget = Cesium.Cartesian3.fromDegrees(data.rawLon, data.rawLat, data.rawAlt);
                viewer.camera.flyToBoundingSphere(
                    new Cesium.BoundingSphere(planeTarget, 0),
                    {
                        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), FOLLOW_ALT), 
                        duration: 2.0 
                    }
                );

                const trackPoints = await fetchTrack(data.icao);
                if (trackPoints) {
                    drawPath(viewer, trackPoints);
                }
            } else {
                if (pathEntity) {
                    viewer.entities.remove(pathEntity);
                    pathEntity = null;
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function setupToggle(viewer, buttonId) {
        const flightBtn = document.getElementById(buttonId);
        if (!flightBtn) return;

        flightBtn.addEventListener('click', async () => {
            flightsEnabled = !flightsEnabled;

            if (flightsEnabled) {
                setupClickHandler(viewer);
                
                fetchAndRender(viewer);
                updateTimer = setInterval(() => {
                    if (flightsEnabled) fetchAndRender(viewer);
                }, REFRESH_MS);
            } else {
                if (updateTimer) clearInterval(updateTimer);
                if (clickHandler) clickHandler.destroy();
                
                if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
                if (labelCollection) { viewer.scene.primitives.remove(labelCollection); labelCollection = null; }
                if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; } 
                activeBillboards = {};
                activeLabels = {};
                
                const logEl = document.getElementById("intel-log");
                if (logEl) logEl.innerHTML = ``;
                
                const trackedNumEl = document.getElementById("tracked-num");
                const stripObjectsEl = document.getElementById("strip-objects");
                
                if (trackedNumEl) trackedNumEl.innerText = "00";
                if (stripObjectsEl) stripObjectsEl.innerText = "00";
            }
        });
    }

    return { setupToggle };
})();