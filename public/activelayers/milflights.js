window.MilFlightLayer = (function() {
    let pointCollection = null;
    let labelCollection = null;
    let pathEntity = null; 
    let updateTimer = null;
    let enabled = false;
    let clickHandler = null;

    let activeBillboards = {}; 
    let activeLabels = {};
    let posHistory = {};

    const REFRESH_MS = 30000; 
    const MAX_HIST = 20;
    const FOLLOW_ALT = 250000;
    const API_URL = 'https://api.adsb.lol/v2/mil';
    
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

    const _planeImg = _makePlane('rgba(0, 100, 0, 0.90)', 16);
    const _planeImgTracked = _makePlane('rgba(50, 205, 50, 0.95)', 22);

    function drawPath(viewer, points) {
        if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
        if (!points || points.length < 2) return;

        pathEntity = viewer.entities.add({
            polyline: {
                positions: points.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt || 0) + 200)),
                width: 2,
                material: new Cesium.PolylineDashMaterialProperty({
                    color: Cesium.Color.fromCssColorString('#006400').withAlpha(0.80),
                    dashLength: 16,
                    gapColor: Cesium.Color.TRANSPARENT,
                }),
            },
        });
        viewer.scene.requestRender();
    }

    async function fetchAndRender(viewer) {
        try {
            const directUrl = API_URL;
            const proxy1 = 'https://corsproxy.io/?' + encodeURIComponent(directUrl);
            const proxy2 = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(directUrl);
            
            let response;
            try {
                response = await fetch(directUrl);
                if (!response.ok) throw new Error();
            } catch {
                try {
                    response = await fetch(proxy1);
                } catch {
                    response = await fetch(proxy2);
                }
            }

            if (!response.ok) throw new Error(`All fetch attempts failed`);
            
            const data = await response.json();
            const aircraft = (data.ac || []).filter(a => a.lat !== undefined && a.lon !== undefined);

            if (!pointCollection) pointCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
            if (!labelCollection) labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

            const freshHexes = new Set();

            aircraft.forEach(a => {
                const hex = a.hex;
                const callsign = (a.flight || a.hex || '---').trim();
                const alt = a.alt_baro && a.alt_baro !== 'ground' ? parseFloat(a.alt_baro) * 0.3048 : 5000;
                const pos = Cesium.Cartesian3.fromDegrees(a.lon, a.lat, alt);
                const rotation = a.track ? -Cesium.Math.toRadians(a.track) : 0;
                
                freshHexes.add(hex);

                if (!posHistory[hex]) posHistory[hex] = [];
                posHistory[hex].push({ lon: a.lon, lat: a.lat, alt: alt });
                if (posHistory[hex].length > MAX_HIST) posHistory[hex].shift();

                const milData = {
                    _type: 'milflight',
                    callsign: callsign,
                    hex: hex,
                    reg: a.r || '---',
                    type: a.t || 'MILITARY',
                    alt: Math.round(alt) + ' m',
                    speed: a.gs ? Math.round(a.gs) + ' kt' : '---',
                    heading: a.track ? Math.round(a.track) + '°' : '---',
                    rawLon: a.lon, rawLat: a.lat, rawAlt: alt
                };

                if (activeBillboards[hex]) {
                    const b = activeBillboards[hex];
                    b.position = pos;
                    b.rotation = rotation;
                    b.id = milData;
                } else {
                    activeBillboards[hex] = pointCollection.add({
                        position: pos,
                        image: _planeImg, 
                        rotation: rotation,
                        scale: 1.0,
                        id: milData
                    });
                }

                if (activeLabels[hex]) {
                    const l = activeLabels[hex];
                    l.position = pos;
                    l.text = callsign;
                } else {
                    activeLabels[hex] = labelCollection.add({
                        position: pos,
                        text: callsign,
                        font: '9px "Courier New"',
                        fillColor: Cesium.Color.fromCssColorString('#006400').withAlpha(0.92),
                        outlineColor: Cesium.Color.BLACK,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        pixelOffset: new Cesium.Cartesian2(10, -6),
                        scaleByDistance: new Cesium.NearFarScalar(150000, 1.0, 3000000, 0.0),
                    });
                }
            });

            Object.keys(activeBillboards).forEach(hex => {
                if (!freshHexes.has(hex)) {
                    pointCollection.remove(activeBillboards[hex]);
                    labelCollection.remove(activeLabels[hex]);
                    delete activeBillboards[hex];
                    delete activeLabels[hex];
                    delete posHistory[hex];
                }
            });

            const trackedNumEl = document.getElementById("tracked-num");
             const stripObjectsEl = document.getElementById("strip-objects");
              if (stripObjectsEl) stripObjectsEl.innerText = aircraft.length;

            if (trackedNumEl) trackedNumEl.innerText = aircraft.length;

            viewer.scene.requestRender(); 
        } catch (error) {
            console.error("MIL Layer Error:", error);
        }
    }

    function setupClickHandler(viewer) {
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction(async function (movement) {
            const pickedObject = viewer.scene.pick(movement.position);
            
            if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id._type === 'milflight') {
                const data = pickedObject.id;
                
                const logEl = document.getElementById("intel-log");
                if (logEl) {
                    logEl.innerHTML = `
                        <div style="font-family: monospace; line-height: 1.6;">
                            > <span style="color:#32CD32; font-weight:bold;">[ ACQUISITION ACTIVE ]</span><br>
                            > ----------------------------<br>
                            > <span style="color:#888;">TARGET ID :</span> ${data.callsign}<br>
                            > <span style="color:#888;">HEX       :</span> ${data.hex}<br>
                            > <span style="color:#888;">REG       :</span> ${data.reg}<br>
                            > <span style="color:#888;">TYPE      :</span> ${data.type}<br>
                            > <span style="color:#888;">ALTITUDE  :</span> ${data.alt}<br>
                            > <span style="color:#888;">AIRSPEED  :</span> ${data.speed}<br>
                            > ----------------------------<br>
                            > <span style="color:#00ff88;">UPLINK STATUS: STABLE</span>
                        </div>
                    `;
                }

                const b = activeBillboards[data.hex];
                if (b) b.image = _planeImgTracked;

                const planeTarget = Cesium.Cartesian3.fromDegrees(data.rawLon, data.rawLat, data.rawAlt);
                viewer.camera.flyToBoundingSphere(
                    new Cesium.BoundingSphere(planeTarget, 0),
                    {
                        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), FOLLOW_ALT), 
                        duration: 2.0 
                    }
                );

                if (posHistory[data.hex]) {
                    drawPath(viewer, posHistory[data.hex]);
                }
            } else {
                if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
                Object.keys(activeBillboards).forEach(hex => {
                    activeBillboards[hex].image = _planeImg;
                });

                const logEl = document.getElementById("intel-log");
                const trackedNumEl = document.getElementById("tracked-num");
                const currentCount = trackedNumEl ? trackedNumEl.innerText : "0";

                if (logEl) {
                    logEl.innerHTML = `
                        <div style="font-family: monospace; line-height: 1.6;">
                            > <span style="color:#00ff88; font-weight:bold;">[ SYSTEM NOMINAL ]</span><br>
                            > ----------------------------<br>
                            > <span style="color:#888;">SCAN MODE :</span> ACTIVE<br>
                            > <span style="color:#888;">CAPACITY  :</span> ${currentCount} TARGETS<br>
                            > <span style="color:#888;">RECEIVER  :</span> DUAL-BAND<br>
                            > ----------------------------<br>
                            > WAITING FOR TARGET SELECTION...
                        </div>
                    `;
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function setupToggle(viewer, buttonId) {
        const milBtn = document.getElementById(buttonId);
        if (!milBtn) return;

        milBtn.addEventListener('click', async () => {
            enabled = !enabled;

            if (enabled) {
                setupClickHandler(viewer);
                
                const logEl = document.getElementById("intel-log");
                if (logEl) {
                    logEl.innerHTML = `
                        <div style="font-family: monospace; line-height: 1.6;">
                            > <span style="color:#ffaa00; font-weight:bold;">[ ESTABLISHING UPLINK ]</span><br>
                            > ----------------------------<br>
                        </div>
                    `;
                }

                fetchAndRender(viewer); 
                updateTimer = setInterval(() => {
                    if (enabled) fetchAndRender(viewer);
                }, REFRESH_MS);

            } else {
                if (updateTimer) clearInterval(updateTimer);
                if (clickHandler) clickHandler.destroy();
                
                if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
                if (labelCollection) { viewer.scene.primitives.remove(labelCollection); labelCollection = null; }
                if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; } 
                activeBillboards = {};
                activeLabels = {};
                posHistory = {};
                
                const logEl = document.getElementById("intel-log");
                if (logEl) logEl.innerHTML = ``;
                
                const trackedNumEl = document.getElementById("tracked-num");
                   const stripObjectsEl = document.getElementById("strip-objects");
                    if (stripObjectsEl) stripObjectsEl.innerText = "00";
                if (trackedNumEl) trackedNumEl.innerText = "00";

            }
        });
    }

    return { setupToggle };
})();