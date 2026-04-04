window.TrafficLayer = (function() {
    let enabled = false;
    let clickHandler = null;
    let apiKey = null;

    function createTrafficLightCanvas(activeColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 140; 
        canvas.height = 240;
        const ctx = canvas.getContext('2d');

        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;

    
        const poleGrad = ctx.createLinearGradient(64, 120, 76, 120);
        poleGrad.addColorStop(0, '#434a51');
        poleGrad.addColorStop(0.3, '#cbd3da');
        poleGrad.addColorStop(0.7, '#7e8a96');
        poleGrad.addColorStop(1, '#32383e');
        ctx.fillStyle = poleGrad;
        ctx.fillRect(64, 120, 12, 100);

        ctx.fillStyle = '#1e252b';
        ctx.fillRect(63, 140, 14, 3);
        ctx.fillRect(63, 170, 14, 3);
        ctx.fillRect(63, 200, 14, 3);

        const baseGrad = ctx.createLinearGradient(55, 215, 85, 215);
        baseGrad.addColorStop(0, '#32383e');
        baseGrad.addColorStop(0.5, '#cbd3da');
        baseGrad.addColorStop(1, '#1e252b');
        
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.roundRect(56, 215, 28, 12, 3);
        ctx.fill();

        ctx.fillStyle = '#0d1013';
        ctx.fillRect(58, 221, 3, 3);
        ctx.fillRect(79, 221, 3, 3);

        const boxGrad = ctx.createLinearGradient(40, 10, 100, 140);
        boxGrad.addColorStop(0, '#2c3e50');
        boxGrad.addColorStop(0.5, '#1e2b37');
        boxGrad.addColorStop(1, '#0f171e');
        
        ctx.fillStyle = boxGrad;
        ctx.beginPath();
        ctx.roundRect(40, 10, 60, 130, 10);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        function drawLightAndVisor(y, color, centerColor, edgeColor, glowColor, isOn) {
            ctx.fillStyle = '#11171d';
            ctx.beginPath(); ctx.moveTo(40, y - 5); ctx.lineTo(25, y); ctx.lineTo(40, y + 10); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(100, y - 5); ctx.lineTo(115, y); ctx.lineTo(100, y + 10); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.arc(70, y, 17, Math.PI, 0, false); ctx.lineTo(87, y - 5); ctx.lineTo(53, y - 5); ctx.closePath(); ctx.fill();

            ctx.beginPath(); ctx.arc(70, y, 15, 0, Math.PI * 2); ctx.fillStyle = '#0a0f14'; ctx.fill();
            ctx.strokeStyle = '#243342'; ctx.lineWidth = 1; ctx.stroke();

            if (isOn) {
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = 15;
                ctx.beginPath(); ctx.arc(70, y, 13, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
                ctx.shadowColor = 'transparent';

                const bulbGrad = ctx.createRadialGradient(70, y, 2, 70, y, 13);
                bulbGrad.addColorStop(0, centerColor); 
                bulbGrad.addColorStop(0.4, color);     
                bulbGrad.addColorStop(1, edgeColor);   
                ctx.fillStyle = bulbGrad; ctx.fill();
            } else {
                const offGrad = ctx.createRadialGradient(66, y - 4, 2, 70, y, 13);
                offGrad.addColorStop(0, '#444');
                offGrad.addColorStop(1, '#111');
                ctx.beginPath(); ctx.arc(70, y, 13, 0, Math.PI * 2); ctx.fillStyle = offGrad; ctx.fill();
            }

            ctx.beginPath(); ctx.ellipse(66, y - 6, 6, 3, Math.PI / -4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.fill();
        }

        drawLightAndVisor(35, '#ff3333', '#ffffff', '#7a0000', '#ff3333', activeColor === 'red');
        drawLightAndVisor(75, '#ffcc00', '#ffffff', '#8a6d00', '#ffaa00', activeColor === 'yellow');
        drawLightAndVisor(115, '#00e676', '#ffffff', '#005225', '#00e676', activeColor === 'green');

        return canvas;
    }

    const _incidentImg = createTrafficLightCanvas('red');

    function updateIntelLog(content) {
        const logEl = document.getElementById("intel-log");
        if (logEl) {
            logEl.innerHTML = content;
        }
    }

    async function getTraffic(viewer, lat, lon) {
        if (!apiKey) return;
        
        updateIntelLog(`
            <div style="font-family: monospace; line-height: 1.6;">
                > <span style="color:#FFA500; font-weight:bold;">[ ATTEMPTING INTERCEPT ]</span><br>
                > ----------------------------<br>
                > PROBING LOCAL TRAFFIC NODES...
            </div>
        `);

        try {
            const res = await fetch(
                `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${apiKey}&point=${lat},${lon}`
            );

            if (!res.ok) {
                updateIntelLog(`
                    <div style="font-family: monospace; line-height: 1.6;">
                        > <span style="color:#ff4d4d; font-weight:bold;">[ INTERCEPT FAILURE ]</span><br>
                        > ----------------------------<br>
                        > NO ROAD DATA AT COORDINATES.
                    </div>
                `);
                return;
            }

            const data = await res.json();
            if (!data.flowSegmentData) {
                updateIntelLog(`
                    <div style="font-family: monospace; line-height: 1.6;">
                        > <span style="color:#ff4d4d; font-weight:bold;">[ INTERCEPT FAILURE ]</span><br>
                        > ----------------------------<br>
                        > NO TRAFFIC INFO AVAILABLE.
                    </div>
                `);
                return;
            }

            const speed = data.flowSegmentData.currentSpeed;
            const free = data.flowSegmentData.freeFlowSpeed;

            let status = "";
            let colorCode = "#00FF00";
            let trafficLightState = "green"; 

            if (speed < free * 0.5) {
                status = "HEAVY TRAFFIC";
                colorCode = "#FF0000";
                trafficLightState = "red";
            } else if (speed < free * 0.8) {
                status = "MODERATE TRAFFIC";
                colorCode = "#FFA500";
                trafficLightState = "yellow";
            } else {
                status = "SMOOTH TRAFFIC";
            }

            const address = await getAddress(lat, lon);
            
            const targetEntity = viewer.entities.values.find(e => e.name === "traffic-target");
            if (targetEntity) {
                targetEntity.billboard.image = createTrafficLightCanvas(trafficLightState);
            }

            updateIntelLog(`
                <div style="font-family: monospace; line-height: 1.6;">
                    > <span style="color:#32CD32; font-weight:bold;">[ SCAN SUCCESSFUL ]</span><br>
                    > ----------------------------<br>
                    > <span style="color:#888;">ADDR :</span> ${address}<br>
                    > <span style="color:#888;">SPD  :</span> ${speed} km/h<br>
                    > <span style="color:#888;">NORM :</span> ${free} km/h<br>
                    > <span style="color:#888;">STAT :</span> <span style="color:${colorCode}; font-weight:bold;">${status}</span><br>
                    > ----------------------------<br>
                    > <span style="color:#00ff88;">GRID FEED ESTABLISHED</span>
                </div>
            `);

        } catch (err) {
            console.error(err);
            updateIntelLog(`
                <div style="font-family: monospace; line-height: 1.6;">
                    > <span style="color:#ff4d4d; font-weight:bold;">[ FATAL EXCEPTION ]</span><br>
                    > ----------------------------<br>
                    > TRAFFIC FETCH FAILED.
                </div>
            `);
        }
    }

    async function getIncidents(viewer, lat, lon) {
        if (!apiKey) return;
        try {
            const res = await fetch(
                `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${apiKey}&bbox=${lon-0.05},${lat-0.05},${lon+0.05},${lat+0.05}`
            );

            const data = await res.json();

            viewer.entities.values
                .filter(e => e.name === "incident")
                .forEach(e => viewer.entities.remove(e));

            if (!data.incidents) return;

            data.incidents.forEach(inc => {
                const coords = inc.geometry.coordinates;

                viewer.entities.add({
                    name: "incident",
                    position: Cesium.Cartesian3.fromDegrees(coords[0][0], coords[0][1]),
                    billboard: {
                        image: _incidentImg, 
                        scale: 0.35, 
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    description: inc.properties.events[0].description
                });
            });

        } catch (err) {
            console.error("Traffic Incidents Error:", err);
        }
    }

    async function getAddress(lat, lon) {
        if (!apiKey) return "Unknown location";
        try {
            const res = await fetch(
                `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${apiKey}`
            );
            const data = await res.json();
            return data.addresses?.[0]?.address?.freeformAddress || "Unknown location";
        } catch (err) {
            console.error(err);
            return "Unknown location";
        }
    }

    async function showTrafficHeatmap(viewer, lat, lon) {
        if (!apiKey) return;
        
        viewer.entities.values
            .filter(e => e.name === "heat")
            .forEach(e => viewer.entities.remove(e));

        const step = 0.005; 
        const range = 0.02; 

        updateIntelLog(`
            <div style="font-family: monospace; line-height: 1.6;">
                > <span style="color:#FFA500; font-weight:bold;">[ GENERATING GRID ]</span><br>
                > ----------------------------<br>
                > CALIBRATING HEATMAP RANGE...<br>
                > PLOTTING REGIONAL RADIUS...
            </div>
        `);

        for (let i = -range; i <= range; i += step) {
            for (let j = -range; j <= range; j += step) {
                const lat2 = lat + i;
                const lon2 = lon + j;

                try {
                    const res = await fetch(
                        `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${apiKey}&point=${lat2},${lon2}`
                    );

                    if (!res.ok) continue;

                    const data = await res.json();
                    if (!data.flowSegmentData) continue;

                    const speed = data.flowSegmentData.currentSpeed;
                    const free = data.flowSegmentData.freeFlowSpeed;

                    let color;
                    if (speed < free * 0.5) {
                        color = Cesium.Color.RED.withAlpha(0.4);
                    } else if (speed < free * 0.8) {
                        color = Cesium.Color.ORANGE.withAlpha(0.4);
                    } else {
                        color = Cesium.Color.GREEN.withAlpha(0.4);
                    }

                    viewer.entities.add({
                        name: "heat",
                        position: Cesium.Cartesian3.fromDegrees(lon2, lat2),
                        ellipse: {
                            semiMajorAxis: 220, 
                            semiMinorAxis: 220,
                            material: color,
                            height: 0 
                        }
                    });

                } catch (err) {
                }
            }
        }
        
        getTraffic(viewer, lat, lon);
    }

    function setupClickHandler(viewer) {
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        
        clickHandler.setInputAction(async function (movement) {
            const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
            if (cartesian) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                const longitude = Cesium.Math.toDegrees(cartographic.longitude);
                const latitude = Cesium.Math.toDegrees(cartographic.latitude);

                viewer.entities.values
                    .filter(e => e.name === "traffic-target")
                    .forEach(e => viewer.entities.remove(e));

                viewer.entities.add({
                    name: "traffic-target",
                    position: cartesian,
                    billboard: {
                        image: createTrafficLightCanvas('none'), 
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        scale: 0.5, 
                        disableDepthTestDistance: Number.POSITIVE_INFINITY 
                    }
                });

                viewer.camera.flyToBoundingSphere(
                    new Cesium.BoundingSphere(cartesian, 0),
                    {
                        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 1500), 
                        duration: 1.5 
                    }
                );

                getIncidents(viewer, latitude, longitude);
                showTrafficHeatmap(viewer, latitude, longitude);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function setupToggle(viewer, buttonId) {
        const trafficBtn = document.getElementById(buttonId);
        if (!trafficBtn) return;

        trafficBtn.addEventListener('click', async () => {
            enabled = !enabled;

            if (enabled) {
                updateIntelLog(`
                    <div style="font-family: monospace; line-height: 1.6;">
                        > <span style="color:#FFA500; font-weight:bold;">[ INITIALIZING ]</span><br>
                        > ----------------------------<br>
                    </div>
                `);

                try {
                    const configRes = await fetch('/api/config');
                    const configData = await configRes.json();
                    apiKey = configData.tomtom; 
                } catch (e) {
                    console.warn("Could not fetch key from backend, utilizing fallback.");
                }

                setupClickHandler(viewer);
                
                updateIntelLog(`
                    <div style="font-family: monospace; line-height: 1.6;">
                        > <span style="color:#32CD32; font-weight:bold;">[ SYSTEM READY ]</span><br>
                        > ----------------------------<br>
                        > TRAFFIC GRID ARMED.<br>
                        > Click on any road network to scan.
                    </div>
                `);

            } else {
                if (clickHandler) {
                    clickHandler.destroy();
                    clickHandler = null;
                }

                viewer.entities.values
                    .filter(e => e.name === "heat" || e.name === "incident" || e.name === "traffic-target")
                    .forEach(e => viewer.entities.remove(e));
                
                updateIntelLog(``);
            }
        });
    }

    return { setupToggle };
})();