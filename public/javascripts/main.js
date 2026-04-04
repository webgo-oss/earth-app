 import * as THREE from 'three';
    import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
    import { MeshoptDecoder } from 'meshoptimizer';

    const canvas = document.querySelector('#webgl-canvas');
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-3, 8, 18); 
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; 

    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    earthGroup.position.set(12, -18, -5); 

    let customEarth;

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    
    loader.load('./models/earth-v1.glb', function (gltf) {
        customEarth = gltf.scene;
        
        const box = new THREE.Box3().setFromObject(customEarth);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        
       
        const targetSize = 130; 
        const scaleFactor = targetSize / maxDim;
        customEarth.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        const center = new THREE.Vector3();
        box.getCenter(center);
        customEarth.position.sub(center);
        
        customEarth.position.x += 15; 
        customEarth.position.y -= 45; 
        customEarth.position.z -= 10; 
        
        earthGroup.add(customEarth);
        
        console.log("Massive scale applied:", scaleFactor);
        
    }, undefined, function (error) {
        console.error('An error happened while loading the model:', error);
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); 
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    sunLight.position.set(-30, 20, 10);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0xffaa66, 1.5);
    rimLight.position.set(20, -10, -15);
    scene.add(rimLight);

    const clock = new THREE.Clock();

    const animate = () => {
        const elapsedTime = clock.getElapsedTime();
        if (customEarth) {
            customEarth.rotation.y = elapsedTime * 0.02;
        }
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
