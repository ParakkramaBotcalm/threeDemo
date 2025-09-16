import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

const CubeScene = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    const target = new THREE.Vector3(0, 1, 0);
    camera.lookAt(target)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );
    mountRef.current!.appendChild(renderer.domElement);

    // Cube
    const geometry = new THREE.BoxGeometry(1,1,1,5,5,5);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 ,wireframe:true});
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);


    const controll = new OrbitControls(camera, renderer.domElement)

    //controll.target.set(0,2,1);//set spesific target rotation
    controll.enableDamping = true;//smooth rotation
    controll.dampingFactor = 0.3;
    controll.autoRotate = true;
    controll.autoRotateSpeed = 15;

    // controll.minPolarAngle=Math.PI/3;
    // controll.maxPolarAngle=Math.PI/2;

    controll.minDistance=2;
    controll.maxDistance=10;

    controll.minAzimuthAngle= -Math.PI/4;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      // cube.rotation.x += 0.01;
      // cube.rotation.y += 0.01;

      cube.position.y=Math.sin(Date.now()*0.001)*2;
      renderer.render(scene, camera);
      controll.update()
    };
    animate();

    // Cleanup on unmount
    return () => {
      mountRef.current!.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="h-screen w-full"
    />
  );
};

export default CubeScene;
