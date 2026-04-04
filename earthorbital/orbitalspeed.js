const fetch = require("node-fetch");

async function getOrbitalData() {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; 
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const stopDateStr = tomorrow.toISOString().split("T")[0];

    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='399'&MAKE_EPHEM='YES'&EPHEM_TYPE='VECTORS'&VEC_TABLE='2'&CENTER='500@10'&START_TIME='${dateStr}'&STOP_TIME='${stopDateStr}'&STEP_SIZE='1 d'`;

    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split("\n");

   
    const startIndex = lines.findIndex(line => line.includes("$$SOE"));
    const endIndex = lines.findIndex(line => line.includes("$$EOE"));

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      console.error("Could not find vector ephemeris in Horizons response. Response may contain an error message.");
      return null;
    }

    const blockLines = lines.slice(startIndex + 1, endIndex);
    const blockText = blockLines.join(" ");

    const posMatch = blockText.match(/X\s*=\s*([-\d.E+]+)\s*Y\s*=\s*([-\d.E+]+)\s*Z\s*=\s*([-\d.E+]+)/i);

    const velMatch = blockText.match(/VX\s*=\s*([-\d.E+]+)\s*VY\s*=\s*([-\d.E+]+)\s*VZ\s*=\s*([-\d.E+]+)/i);

    if (!posMatch || !velMatch) {
      console.error("Could not parse vector data from Horizons ephemeris block");
      return null;
    }

    const dx = parseFloat(posMatch[1]);
    const dy = parseFloat(posMatch[2]);
    const dz = parseFloat(posMatch[3]);
    const vx = parseFloat(velMatch[1]);
    const vy = parseFloat(velMatch[2]);
    const vz = parseFloat(velMatch[3]);

    const speed_kms = Math.sqrt(vx*vx + vy*vy + vz*vz);   
    const speed_kmh = speed_kms * 3600;                   
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);    
    const radialVelocity = (vx*dx + vy*dy + vz*dz) / distance;
    const lightTime = distance / 299792.458;             

    return {
      date: dateStr,
      speed_kms: speed_kms.toFixed(2),
      speed_kmh: speed_kmh.toFixed(2),
      distance_km: distance.toFixed(2),
      radialVelocity: radialVelocity.toFixed(2),
      lightTime: lightTime.toFixed(2)
    };

  } catch (err) {
    console.error("Error in getOrbitalData:", err);
    return null;
  }
}

module.exports = { getOrbitalData };