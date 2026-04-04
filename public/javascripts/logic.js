document.addEventListener('DOMContentLoaded', () => {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    const stripLayersEl = document.getElementById('strip-layers');
    let toastTimeout;

    function showToast(msg) {
        if (!toastMsg || !toast) return;
        toastMsg.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function updateTrackedCount() {
        const activeToggles = document.querySelectorAll('.left-sidebar .toggle-box.active').length;
        const layersFormatted = activeToggles.toString().padStart(2, '0');
        if (stripLayersEl) stripLayersEl.innerText = layersFormatted; 
    }

    document.querySelectorAll('.left-sidebar .toggle-box').forEach(box => {
        box.addEventListener('click', () => {
            box.classList.toggle('active');
            updateTrackedCount();
        });
    });

    const cityBoxes = document.querySelectorAll('.city-box');
    cityBoxes.forEach(box => {
        box.addEventListener('click', function() {
            cityBoxes.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updateTrackedCount();
        });
    });

    const mapBtns = document.querySelectorAll('.map-btn');
    mapBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            mapBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    updateTrackedCount();

    function updateUTC() {
        const now = new Date();
        const iso = now.toISOString();
        const date = iso.split('T')[0];
        const time = iso.split('T')[1].split('.')[0] + 'Z';
        const utcEl = document.getElementById('utc-time');
        if (utcEl) utcEl.innerText = `${date}\n${time}`;
    }
    setInterval(updateUTC, 1000);
    updateUTC();
});

let currentMode = 'std'; 

const modePalettes = {
    std: {
        c1: ['#22d3ee', '#8b5cf6', '#ec4899'], 
        c2: ['#fbbf24', '#f43f5e', '#fb923c'],
        smooth: 0.6, width: 2.5, blur: 12
    },
    night: {
        c1: ['#39ff14', '#006400', '#32cd32'], 
        c2: ['#7fff00', '#00ff7f', '#98fb98'],
        smooth: 0.1, width: 1.5, blur: 5
    },
    uv: {
        c1: ['#4b00ff', '#00f0ff', '#ffffff'],
        c2: ['#1a0033', '#0066ff', '#00ffff'],
        smooth: 0.85, width: 3, blur: 18
    },
    flir: {
        c1: ['#4b0082', '#8b0000', '#ff4500'], 
        c2: ['#ff0000', '#ffa500', '#ffff00'],
        smooth: 0.4, width: 2, blur: 10
    },
    ctv: {
        c1: ['#ffffff', '#a0a0a0', '#505050'], 
        c2: ['#00bfff', '#1e90ff', '#00008b'],
        smooth: 0.2, width: 1, blur: 0
    }
};

function parseValue(text){
    if (!text) return 0;
    let num = parseFloat(text);
    if(text.includes('M')) return num * 1000000;
    if(text.includes('K')) return num * 1000;
    return num;
}

const monthlyEl = document.getElementById("secspeed");
const yearlyEl = document.getElementById("hourspeed");
let monthlyVal = monthlyEl ? parseValue(monthlyEl.innerText) : 1000;
let yearlyVal  = yearlyEl ? parseValue(yearlyEl.innerText) : 5000;

const val1El = document.getElementById("val1");
const val2El = document.getElementById("val2");
if (val1El && monthlyEl) val1El.innerText = monthlyEl.innerText;
if (val2El && yearlyEl) val2El.innerText = yearlyEl.innerText;

let t = 0;

function generateData(base, noiseFactor = 0.015){
    let arr = [];
    let amp = base * (currentMode === 'night' ? 0.03 : noiseFactor);
    for(let i=0;i<30;i++){
        let value = base + Math.sin((i + t)/4) * amp + Math.cos((i + t)/8) * (amp * 0.5);
        arr.push(Number(value.toFixed(2)));
    }
    return arr;
}

function series(data, color, smooth, width, blur){
    return {
        type:'line',
        smooth: smooth,
        symbol:'none',
        data:data,
        lineStyle:{
            width: width,
            color: color,
            shadowBlur: blur,
            shadowColor: color
        }
    }
}

let chart1 = echarts.init(document.getElementById('chart1'));
let chart2 = echarts.init(document.getElementById('chart2'));

function render(){
    const p = modePalettes[currentMode];

    chart1.setOption({
        grid:{left:0,right:0,top:5,bottom:0, containLabel: false},
        xAxis:{show:false,type:'category',data:Array(30).fill('')},
        yAxis:{show:false},
        series:[
            series(generateData(monthlyVal), p.c1[0], p.smooth, p.width, p.blur),
            series(generateData(monthlyVal*0.98), p.c1[1], p.smooth, p.width, p.blur),
            series(generateData(monthlyVal*1.02), p.c1[2], p.smooth, p.width, p.blur)
        ],
        animation: false
    });

    chart2.setOption({
        grid:{left:0,right:0,top:5,bottom:0, containLabel: false},
        xAxis:{show:false,type:'category',data:Array(30).fill('')},
        yAxis:{show:false},
        series:[
            series(generateData(yearlyVal), p.c2[0], p.smooth, p.width, p.blur),
            series(generateData(yearlyVal*0.97), p.c2[1], p.smooth, p.width, p.blur),
            series(generateData(yearlyVal*1.03), p.c2[2], p.smooth, p.width, p.blur)
        ],
        animation: false
    });
}

render();

setInterval(()=>{
    t += 1;
    render();
}, 300);

const modeBtns = document.querySelectorAll('.mode-btn');
const stripModeEl = document.getElementById('strip-mode');

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.getAttribute('data-mode');
        if (stripModeEl) stripModeEl.innerText = currentMode.toUpperCase();
        render();
    });
});

window.addEventListener('resize', () => {
    chart1.resize();
    chart2.resize();
});