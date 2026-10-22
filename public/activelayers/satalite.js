window.SatelliteLayer = (function () {
    var billboardCollection = null;
    var labelCollection     = null;
    var satrecs             = [];
    var updateTimer         = null;
    var MAX_SATS            = 2000;
    var enabled             = false;
    
    var trackedIdx          = null;
    var pathEntity          = null;
    var clickHandler        = null;

    const FOLLOW_ALT = 2500000; 

    // Fetched through our own server (/api/tle) so it works on Render with no CORS issues.
    // If the server can't reach any TLE host, try straight from the visitor's browser (their IP isn't blocked).
    var TLE_SOURCES = [
        { url: '/api/tle' },
        { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle' },
        { url: 'https://db.satnogs.org/api/tle/?format=json&page_size=2000' }
    ];

    function updateIntel(msg) {
        const log = document.getElementById('intel-log');
        if (log) log.innerHTML = msg;
    }

    function parseTLE(text) {
        var lines = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        var result = [];
        for (var i = 0; i + 2 < lines.length; i += 3) {
            var l1 = lines[i + 1];
            var l2 = lines[i + 2];
            if (!l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
            try {
                var satrec = satellite.twoline2satrec(l1, l2);
                result.push({ name: lines[i].replace(/^0 /, ''), satrec: satrec });
            } catch (e) { }
        }
        return result;
    }

    function parseSatNogsJson(data) {
        var arr = data.results || data;
        if (!Array.isArray(arr) || arr.length === 0) return [];
        var lines = [];
        arr.forEach(function (s) {
            if (s.tle1 && s.tle2) {
                lines.push((s.tle0 || s.name || 'UNKNOWN'), s.tle1, s.tle2);
            }
        });
        return parseTLE(lines.join('\n'));
    }

    function tryNext(sources, idx) {
        if (idx >= sources.length) return Promise.reject(new Error('all sources failed'));
        var src = sources[idx];
        return fetch(src.url)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                var ct = (r.headers.get('content-type') || '').toLowerCase();
                return ct.indexOf('json') !== -1
                    ? r.json().then(function (d) { return { json: true, d: d }; })
                    : r.text().then(function (d) { return { json: false, d: d }; });
            })
            .then(function (res) {
                var parsed = res.json ? parseSatNogsJson(res.d) : parseTLE(res.d);
                if (parsed.length === 0) throw new Error('no satellites parsed');
                return parsed;
            })
            .catch(function (err) {
                console.warn('Source ' + idx + ' failed:', err.message, '- trying next...');
                return tryNext(sources, idx + 1);
            });
    }

    function _makeSatIcon(color, sz) {
        var c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        var ctx = c.getContext('2d');
        
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, sz, sz); 
        
        return c;
    }

    var _satImg        = _makeSatIcon('rgba(220, 220, 220, 0.85)', 10); 
    var _satImgTracked = _makeSatIcon('#00f0ff', 16);                 

    function getPos(satrec, date) {
        try {
            var pv = satellite.propagate(satrec, date);
            var gmst = satellite.gstime(date);
            var gd = satellite.eciToGeodetic(pv.position, gmst);
            return {
                lon: satellite.degreesLong(gd.longitude),
                lat: satellite.degreesLat(gd.latitude),
                alt: gd.height * 1000
            };
        } catch (e) { return null; }
    }

    function drawOrbit(viewer, satrec) {
        if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
        var now = new Date();
        var points = [];
        for (var t = 0; t <= 95; t++) {
            var d = new Date(now.getTime() + t * 60000);
            var pos = getPos(satrec, d);
            if (pos) {
                points.push(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt));
            }
        }
        if (points.length < 2) return;

        pathEntity = viewer.entities.add({
            polyline: {
                positions: points,
                width: 2.0,
                arcType: Cesium.ArcType.NONE,
                material: new Cesium.PolylineDashMaterialProperty({
                    color: Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.7),
                    dashLength: 16,
                    gapColor: Cesium.Color.TRANSPARENT,
                }),
            },
        });
    }

    function refreshPositions(viewer) {
        if (!billboardCollection) return;
        var now = new Date();
        
        for (var i = 0; i < satrecs.length; i++) {
            var bb = billboardCollection.get(i);
            var lbl = labelCollection.get(i);
            var pos = getPos(satrecs[i].satrec, now);
            
            if (pos) {
                var cart = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
                bb.position = cart; lbl.position = cart;
                bb.show = lbl.show = true;
                
                if (trackedIdx === i) {
                    updateIntel(
                        `<div style="font-family: monospace; line-height: 1.6;">` +
                        `> <span style="color:#00f0ff; font-weight:bold;">[ ACQUISITION ACTIVE ]</span><br>` +
                        `> ----------------------------<br>` +
                        `> <span style="color:#888;">TARGET ID :</span> ${satrecs[i].name}<br>` +
                        `> <span style="color:#888;">LATITUDE  :</span> ${pos.lat.toFixed(4)}°<br>` +
                        `> <span style="color:#888;">LONGITUDE :</span> ${pos.lon.toFixed(4)}°<br>` +
                        `> <span style="color:#888;">ALTITUDE  :</span> ${(pos.alt / 1000).toFixed(2)} km<br>` +
                        `> ----------------------------<br>` +
                        `> <span style="color:#00ff88;">UPLINK STATUS: STABLE</span>` +
                        `</div>`
                    );
                }
            } else {
                bb.show = lbl.show = false;
            }
        }
        viewer.scene.requestRender();
    }

    function setupInteraction(viewer) {
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction(function (movement) {
            var pickedObject = viewer.scene.pick(movement.position);
            
            if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id._wvIdx !== undefined) {
                var idx = pickedObject.id._wvIdx;
                var s = satrecs[idx];
                
                if (trackedIdx !== null) {
                    billboardCollection.get(trackedIdx).image = _satImg;
                }
                
                trackedIdx = idx;
                pickedObject.primitive.image = _satImgTracked; 
                
                drawOrbit(viewer, s.satrec);
                
                var pos = getPos(s.satrec, new Date());
                if (pos) {
                    const satTarget = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
                    viewer.camera.flyToBoundingSphere(
                        new Cesium.BoundingSphere(satTarget, 0),
                        {
                            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), FOLLOW_ALT), 
                            duration: 2.0 
                        }
                    );
                }
            } else {
                if (trackedIdx !== null) {
                    billboardCollection.get(trackedIdx).image = _satImg;
                }
                trackedIdx = null;
                if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
                
                updateIntel(
                    `<div style="font-family: monospace; line-height: 1.6;">` +
                    `> <span style="color:#00ff88; font-weight:bold;">[ SYSTEM NOMINAL ]</span><br>` +
                    `> ----------------------------<br>` +
                    `> <span style="color:#888;">SCAN MODE :</span> ACTIVE<br>` +
                    `> <span style="color:#888;">CAPACITY  :</span> ${satrecs.length} TARGETS<br>` +
                    `> <span style="color:#888;">RECEIVER  :</span> DUAL-BAND<br>` +
                    `> ----------------------------<br>` +
                    `> WAITING FOR TARGET SELECTION...` +
                    `</div>`
                );
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function setupToggle(viewer, buttonId) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;

        btn.addEventListener('click', function() {
            enabled = !enabled;
            
            const trackedNumEl = document.getElementById("tracked-num");
            const stripObjectsEl = document.getElementById("strip-objects");

            if (enabled) {
                btn.classList.add('active');
                
                updateIntel(
                    `<div style="font-family: monospace; line-height: 1.6;">` +
                    `> <span style="color:#ffaa00; font-weight:bold;">[ ESTABLISHING UPLINK ]</span><br>` +
                    `> ----------------------------<br>`+
                    `</div>`
                );
                
                tryNext(TLE_SOURCES, 0)
                    .then(function(parsedData) {
                        satrecs = parsedData.slice(0, MAX_SATS);

                        if (trackedNumEl) trackedNumEl.innerText = satrecs.length;
                        if (stripObjectsEl) stripObjectsEl.innerText = satrecs.length;

                        billboardCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
                        labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

                        var now = new Date();
                        satrecs.forEach(function(s, i) {
                            var pos = getPos(s.satrec, now);
                            var cart = pos ? Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt) : Cesium.Cartesian3.ZERO;

                            billboardCollection.add({ 
                                position: cart, 
                                image: _satImg, 
                                show: !!pos,
                                id: { _wvIdx: i } 
                            });

                            labelCollection.add({
                                position: cart,
                                text: s.name.substring(0, 12),
                                font: '10px monospace',
                                fillColor: Cesium.Color.fromCssColorString('#00ff88'),
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 2,
                                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                                pixelOffset: new Cesium.Cartesian2(12, 0),
                                show: !!pos,
                                scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 6e6, 0.0)
                            });
                        });

                        setupInteraction(viewer);
                        updateTimer = setInterval(() => refreshPositions(viewer), 5000);
                        
                        updateIntel(
                            `<div style="font-family: monospace; line-height: 1.6;">` +
                            `> <span style="color:#00ff88; font-weight:bold;">[ SYSTEM NOMINAL ]</span><br>` +
                            `> ----------------------------<br>` +
                            `> <span style="color:#888;">SCAN MODE :</span> ACTIVE<br>` +
                            `> <span style="color:#888;">CAPACITY  :</span> ${satrecs.length} TARGETS<br>` +
                            `> <span style="color:#888;">RECEIVER  :</span> DUAL-BAND<br>` +
                            `> ----------------------------<br>` +
                            `> WAITING FOR TARGET SELECTION...` +
                            `</div>`
                        );
                    })
                    .catch(function(err) {
                        updateIntel(
                            `<div style="font-family: monospace; line-height: 1.6;">` +
                            `> <span style="color:#ff4444; font-weight:bold;">[ FATAL ERROR ]</span><br>` +
                            `> ----------------------------<br>` +
                            `> UPLINK FAILED<br>` +
                            `> ALL PROXIES BLOCKED<br>` +
                            `> ----------------------------` +
                            `</div>`
                        );
                        console.error(err);
                    });
            } else {
                btn.classList.remove('active');
                if (updateTimer) clearInterval(updateTimer);
                if (clickHandler) { clickHandler.destroy(); clickHandler = null; }
                if (billboardCollection) viewer.scene.primitives.remove(billboardCollection);
                if (labelCollection) viewer.scene.primitives.remove(labelCollection);
                if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
                billboardCollection = labelCollection = null;
                satrecs = [];
                trackedIdx = null;
                
                if (trackedNumEl) trackedNumEl.innerText = "00";
                if (stripObjectsEl) stripObjectsEl.innerText = "00";
                
                updateIntel("");
            }
        });
    }

    return { setupToggle: setupToggle };
})();