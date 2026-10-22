window.ShipLayer = (function () {
    var billboardCollection = null;
    var labelCollection     = null;
    var socket              = null;
    var vessels             = {};   
    var posHistory          = {};   
    var enabled             = false;
    var trackedMmsi         = null;
    var pathEntity          = null;
    var clickHandler        = null;
    
    var renderTimer         = null;
    var wsRetries           = 0;
    var restSourceIdx       = 0;

    const MAX_VESSELS       = 2000;
    const REFRESH_MS        = 30000; 
    const MAX_HIST          = 20;

    const POV_RANGE         = 80000;  
    const POV_PITCH         = -35;    
    const POV_HEADING       = 0;      

    const REST_SOURCES = [
        'https://meri.digitraffic.fi/api/ais/v1/locations'
    ];

    const NAV_STATUS = ['UNDERWAY', 'ANCHORED', 'NOT COMMANDED', 'RESTRICTED', 'CONSTRAINED',
                        'MOORED', 'AGROUND', 'FISHING', 'SAILING', '---', '---', 'TOWING',
                        'TOWING', 'WAITING', 'AIS-SART'];

    function updateIntel(msg) {
        const log = document.getElementById('intel-log');
        if (log) log.innerHTML = msg;
    }

    function _makeShipIcon(color, sz) {
        var c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        var ctx = c.getContext('2d');
        var mx = sz / 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(mx, sz * 0.05);
        ctx.quadraticCurveTo(mx + sz * 0.30, sz * 0.30, mx + sz * 0.22, sz * 0.70);
        ctx.lineTo(mx + sz * 0.18, sz * 0.92);
        ctx.lineTo(mx - sz * 0.18, sz * 0.92);
        ctx.lineTo(mx - sz * 0.22, sz * 0.70);
        ctx.quadraticCurveTo(mx - sz * 0.30, sz * 0.30, mx, sz * 0.05);
        ctx.closePath();
        ctx.fill();
        return c;
    }

    var _shipImg = _makeShipIcon('rgba(0,170,255,0.85)', 18);
    var _shipImgTracked = _makeShipIcon('#ffffff', 24);

    function processVessel(mmsi, lat, lon, name, sog, hdg, status) {
        vessels[mmsi] = {
            lat: lat, lon: lon,
            name: name || 'MMSI ' + mmsi,
            sog: sog, heading: hdg, status: status
        };

        if (!posHistory[mmsi]) posHistory[mmsi] = [];
        posHistory[mmsi].push({ lat, lon });
        if (posHistory[mmsi].length > MAX_HIST) posHistory[mmsi].shift();
    }

    function fetchREST(viewer) {
        if (!enabled || restSourceIdx >= REST_SOURCES.length) return;

        fetch(REST_SOURCES[restSourceIdx])
            .then(r => r.json())
            .then(data => {
                const features = data.features || [];
                features.forEach(f => {
                    const p = f.properties;
                    const c = f.geometry.coordinates;
                    processVessel(String(p.mmsi), c[1], c[0], p.name, p.sog, p.heading, p.navStat);
                });
                refreshDisplay(viewer);
            })
            .catch(err => {
                restSourceIdx++;
                fetchREST(viewer);
            });
    }

    function connectWS(apiKey, viewer) {
        if (socket) socket.close();
        socket = new WebSocket("wss://stream.aisstream.io/v0/stream");

        socket.onopen = function() {
            wsRetries = 0;
            socket.send(JSON.stringify({
                "APIKey": apiKey,
                "BoundingBoxes": [[[-90, -180], [90, 180]]],
                "FilterMessageTypes": ["PositionReport"]
            }));
            updateIntel(`<div style="font-family: monospace; line-height: 1.6;">> <span style="color:#32CD32; font-weight:bold;">[ SYSTEM READY ]</span><br> > ----------------------------<br></div>`);
        };

        socket.onmessage = async function(evt) {
            if (!enabled) return;
            const raw = (evt.data instanceof Blob) ? await evt.data.text() : evt.data;
            try {
                const msg = JSON.parse(raw);
                if (msg.MessageType !== 'PositionReport') return;
                const m = msg.MetaData;
                const p = msg.Message.PositionReport;
                processVessel(String(m.MMSI), p.Latitude, p.Longitude, m.ShipName, p.Sog, p.TrueHeading, p.NavigationalStatus);
                refreshDisplay(viewer);
            } catch(e) {}
        };

        socket.onclose = () => {
            if (enabled && wsRetries < 3) {
                wsRetries++;
                setTimeout(() => connectWS(apiKey, viewer), 5000);
            }
        };
    }

    function setupClickInteraction(viewer) {
        if (clickHandler) clickHandler.destroy();
        
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        
        clickHandler.setInputAction(function (click) {
            const picked = viewer.scene.pick(click.position);
            
            if (Cesium.defined(picked) && picked.id && picked.id._wvMmsi) {
                trackedMmsi = picked.id._wvMmsi;
                const v = vessels[trackedMmsi];
                
                if (v) {
                    const center = Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 0);
                    const sphere = new Cesium.BoundingSphere(center, 0);
                    
                    viewer.camera.flyToBoundingSphere(sphere, {
                        offset: new Cesium.HeadingPitchRange(
                            Cesium.Math.toRadians(POV_HEADING), 
                            Cesium.Math.toRadians(POV_PITCH), 
                            POV_RANGE
                        ),
                        duration: 2.0
                    });

                    updateHUD(v, trackedMmsi);
                    drawPath(viewer, posHistory[trackedMmsi]);
                }
            } else {
                trackedMmsi = null;
                if (pathEntity) viewer.entities.remove(pathEntity);
                updateIntel(`<div style="font-family: monospace; line-height: 1.6;">> <span style="color:#FFA500; font-weight:bold;">[ SYSTEM IDLE ]</span><br> > ----------------------------<br> > SELECT VESSEL FOR TRACKING</div>`);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function updateHUD(v, mmsi) {
        const speedStr = v.sog !== null ? `${v.sog.toFixed(1)} kt` : '---';
        const headingStr = v.heading !== null ? `${v.heading}°` : '---';
        const statusStr = NAV_STATUS[v.status] || 'UNKNOWN';

        updateIntel(`<div style="font-family: monospace; line-height: 1.6;">> <span style="color:#00e676; font-weight:bold;">[ TELEMETRY ACQUIRED ]</span><br> > ----------------------------<br> > <span style="color:#888;">NAME:</span> ${v.name}<br> > <span style="color:#888;">MMSI:</span> ${mmsi}<br> > <span style="color:#888;">SPEED:</span> ${speedStr}<br> > <span style="color:#888;">HEADING:</span> ${headingStr}<br> > <span style="color:#888;">STATUS:</span> ${statusStr}<br> > <span style="color:#888;">LAT/LON:</span> ${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}<br> > ----------------------------<br> > <span style="color:#00ff88;">POV LOCK ENGAGED</span></div>`);
    }

    function refreshDisplay(viewer) {
        if (!billboardCollection || !enabled) return;
        billboardCollection.removeAll();
        labelCollection.removeAll();

        const keys = Object.keys(vessels).slice(0, MAX_VESSELS);
        keys.forEach(mmsi => {
            const v = vessels[mmsi];
            const isTracked = (mmsi === trackedMmsi);
            const hdg = (v.heading && v.heading !== 511) ? v.heading : 0;
            const pos = Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 10);

            billboardCollection.add({
                position: pos,
                image: isTracked ? _shipImgTracked : _shipImg,
                rotation: -Cesium.Math.toRadians(hdg),
                id: { _wvMmsi: mmsi }
            });

            if (isTracked) {
                drawPath(viewer, posHistory[mmsi]);
                updateHUD(v, mmsi);
            }
        });

        document.getElementById("tracked-num").innerText = keys.length;
        document.getElementById("strip-objects").innerText = keys.length;
    }

    function drawPath(viewer, points) {
        if (pathEntity) viewer.entities.remove(pathEntity);
        if (!points || points.length < 2) return;

        pathEntity = viewer.entities.add({
            polyline: {
                positions: points.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 5)),
                width: 2,
                material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.CYAN })
            }
        });
    }

    function setupToggle(viewer, buttonId) {
        const btn = document.getElementById(buttonId);
        btn.addEventListener('click', () => {
            enabled = !enabled;
            if (enabled) {
                btn.classList.add('active');
                billboardCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
                labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());
                
                setupClickInteraction(viewer);

                fetchREST(viewer);
                renderTimer = setInterval(() => fetchREST(viewer), REFRESH_MS);

                fetch('/api/config').then(r => r.json()).then(config => {
                    if (config.ship) connectWS(config.ship, viewer);
                });
            } else {
                btn.classList.remove('active');
                if (socket) socket.close();
                clearInterval(renderTimer);
                if (clickHandler) clickHandler.destroy();
                viewer.scene.primitives.remove(billboardCollection);
                viewer.scene.primitives.remove(labelCollection);
                if (pathEntity) viewer.entities.remove(pathEntity);
                vessels = {}; 
                posHistory = {}; 
                trackedMmsi = null;

                const trackedNum = document.getElementById("tracked-num");
                if (trackedNum) trackedNum.innerText = "00";

                const stripObjects = document.getElementById("strip-objects");
                if (stripObjects) stripObjects.innerText = "00";
            }
        });
    }

    return { setupToggle: setupToggle };
})();