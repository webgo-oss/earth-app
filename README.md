# 🌍 Earth View – GeoTracker

**Earth View – GeoTracker** is an interactive 3D globe application that brings the real-time world to your screen. Explore satellites, flights, marine vessels, weather, street traffic, and more with detailed telemetry in a fully interactive globe.

---

## Background & Features

Earth View – GeoTracker is designed to provide an immersive and detailed perspective of global activity. It combines multiple data layers to give users real-time insights:

- **3D Globe Exploration**: Navigate freely around a high-fidelity 3D Earth with smooth rotation, zoom, and day/night visualization.  
- **Orbital & Satellite Tracking**: Track thousands of satellites in real-time, view their orbital speed, trajectory, altitude, and telemetry data.  
- **Flight Tracking**: Monitor commercial and military flights with live speed, altitude, and direction.  
- **Marine Vessel Tracking**: Track ships and maritime traffic globally, showing vessel type, heading, and speed.  
- **Weather & Environmental Data**: Visualize live cloud movement, precipitation, storms, and global heatmaps.  
- **Street Traffic Updates**: Monitor urban traffic, congestion, and historical patterns for streets worldwide.  
- **Telemetry Mode**: Access detailed telemetry for satellites, flights, and vessels, including velocity, position, altitude, and path.


## API Keys Required

The following APIs are used and require keys:  

| Feature | API / Service | Notes |
|---------|---------------|-------|
| 3D Globe & Earth Data | **Cesium** | Required for rendering the 3D Earth and globe layers |
| Commercial & Military Flights | **OpenSky Network** | Real-time flight tracking; requires API key |
| Street Traffic | **TomTom** | For live traffic and road information; API key required |
| Marine Vessels | **AISStream** | For maritime vessel tracking; API key required |
| Other Features | Public / Open Data | Weather, satellites, and telemetry layers do not require keys |


## Installation & Setup

### Prerequisites
- Node.js >= 18.x  
- npm >= 9.x  
- API keys for Cesium, OpenSky, TomTom, and AISStream  

### Installation
```bash
npm install

git clone https://github.com/webgo-oss/earth-app.git
cd earth-app
```
after this make an **' .env '** file and add keys in the below variables 

- CESIUM_ION_TOKEN
- PORT
- OPENSKY_USER
- OPENSKY_PASS
- TOMTOM
- AISSTREAM_KEY