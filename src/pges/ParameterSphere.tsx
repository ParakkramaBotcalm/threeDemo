'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';

const ParameterSphere = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene ---------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0b);

    // --- Orthographic Camera -------------------------------------------------
    const aspect = window.innerWidth / window.innerHeight;
    let orthoHalfHeight = 5;
    let orthoHalfWidth = orthoHalfHeight * aspect;

    const camera = new THREE.OrthographicCamera(
      -orthoHalfWidth,
      orthoHalfWidth,
      orthoHalfHeight,
      -orthoHalfHeight,
      0.1,
      5000
    );
    camera.position.set(0, orthoHalfHeight, orthoHalfHeight * 2);
    camera.lookAt(0, 0, 0);

    // --- Renderer ------------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    // --- Ground --------------------------------------------------------------
    const planeGeo = new THREE.PlaneGeometry(40, 40);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x4d7a56,
      metalness: 0,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(planeGeo, planeMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- Lights --------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight('#8338ec', 5, 20, 2);
    pointLight.position.set(2, 3, 2);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(1024, 1024);
    scene.add(pointLight);

    // --- Helpers -------------------------------------------------------------
    const axes = new THREE.AxesHelper(2);
    const pointHelper = new THREE.PointLightHelper(pointLight, 0.25);
    const grid = new THREE.GridHelper(40, 40, 0x333333, 0x333333);
    scene.add(axes, pointHelper, grid);

    // --- GUI (lights only) ---------------------------------------------------
    const gui = new GUI();
    const lightFolder = gui.addFolder('Point Light');
    lightFolder.add(pointLight.position, 'x', -10, 10, 0.01).onChange(() => pointHelper.update());
    lightFolder.add(pointLight.position, 'y', -10, 10, 0.01).onChange(() => pointHelper.update());
    lightFolder.add(pointLight.position, 'z', -10, 10, 0.01).onChange(() => pointHelper.update());
    lightFolder.add(pointLight, 'intensity', 0, 10, 0.01);
    lightFolder.add(pointLight, 'distance', 0, 100, 0.1);
    lightFolder.add(pointLight, 'decay', 0, 3, 0.01);
    lightFolder
      .addColor({ color: '#8338ec' }, 'color')
      .name('color')
      .onChange((c: string) => {
        pointLight.color.set(c);
        pointHelper.update();
      });
    lightFolder.open();

    const ambientFolder = gui.addFolder('Ambient');
    ambientFolder.add(ambientLight, 'intensity', 0, 1, 0.01);

    // --- Utilities -----------------------------------------------------------
    function setShadows(root: THREE.Object3D, cast = true, receive = true) {
      root.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if ((m as any).isMesh) {
          m.castShadow = cast;
          m.receiveShadow = receive;
        }
      });
    }

    function centerAndDrop(root: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      root.position.sub(center);
      const box2 = new THREE.Box3().setFromObject(root);
      root.position.y += -box2.min.y;
    }

    // Focus point used for camera.lookAt
    const focus = new THREE.Vector3();
    const modelCenter = new THREE.Vector3();
    let characterHeight = 1;

    function frameOrthoToObject(object: THREE.Object3D, cam: THREE.OrthographicCamera, offset = 1.2) {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      box.getCenter(focus);
      modelCenter.copy(focus);
      characterHeight = size.y;

      const halfH = (size.y * 0.5) * offset;
      const vpAspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
      const halfWNeeded = (size.x * 0.5) * offset;
      const halfW = Math.max(halfH * vpAspect, halfWNeeded);

      cam.left = -halfW;
      cam.right = halfW;
      cam.top = halfH;
      cam.bottom = -halfH;

      const maxSize = Math.max(size.x, size.y, size.z);
      cam.position.set(focus.x, focus.y, focus.z + maxSize * 2);
      cam.near = 0.1;
      cam.far = Math.max(2000, maxSize * 10);
      cam.updateProjectionMatrix();
      cam.lookAt(focus);

      orthoHalfHeight = halfH;
    }

    function updateOrthoFrustumOnResize() {
      const a = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
      orthoHalfWidth = orthoHalfHeight * a;
      camera.left = -orthoHalfWidth;
      camera.right = orthoHalfWidth;
      camera.top = orthoHalfHeight;
      camera.bottom = -orthoHalfHeight;
      camera.updateProjectionMatrix();
    }

    // --- Animation state -----------------------------------------------------
    const clock = new THREE.Clock();
    let mixer: THREE.AnimationMixer | null = null;

    // --- Pivot to rotate the whole model ------------------------------------
    const modelPivot = new THREE.Group();
    scene.add(modelPivot);

    // Keep refs to model + (optional) head bone for focusing only
    let loadedModel: THREE.Object3D | null = null;
    let headBone: THREE.Bone | null = null;

    function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
      const candidates: THREE.Bone[] = [];
      root.traverse((o) => {
        if ((o as any).isBone && /head/i.test(o.name)) {
          candidates.push(o as THREE.Bone);
        }
      });
      return candidates.find(b => !/end/i.test(b.name)) || candidates[0] || null;
    }

    function getHeadWorldPosition(out = new THREE.Vector3()) {
      if (headBone) {
        headBone.getWorldPosition(out);
        return out;
      }
      // Fallback: approximate head near top of bounds
      if (loadedModel) {
        const box = new THREE.Box3().setFromObject(loadedModel);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        out.set(c.x, c.y + size.y * 0.35, c.z); // ~eye/forehead area
        return out;
      }
      return out.set(0, 0, 0);
    }

    // --- Load model & set up -------------------------------------------------
    const loader = new GLTFLoader();
    loader.load(
      '/demoModel.glb',
      (gltf) => {
        const model = gltf.scene;
        loadedModel = model;
        setShadows(model, true, true);
        centerAndDrop(model);

        modelPivot.add(model);
        scene.add(modelPivot);

        // Initial frame
        frameOrthoToObject(model, camera, 1.25);

        // Animation
        mixer = new THREE.AnimationMixer(model);
        const clips = gltf.animations || [];
        const preferredByName =
          THREE.AnimationClip.findByName(clips, 'Armature|mixamo.com|Layer0.001') ||
          THREE.AnimationClip.findByName(clips, 'Armature|mixamo.com|Layer0');
        const clip = preferredByName || clips.sort((a, b) => b.duration - a.duration)[0];
        if (clip) {
          const action = mixer.clipAction(clip);
          action.reset().setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.enabled = true;
          //action.play();
        }

        // We may still use the head bone for centering the camera (no rotation)
        headBone = findHeadBone(model);
      },
      undefined,
      (error) => console.error('Error loading GLB:', error)
    );

    // --- Rotate FULL BODY + zoom & center (toggle) ---------------------------
    const baseZoom = camera.zoom; // usually 1
    let isLeft = false;

    const rotateFullBodyAndCenter = () => {
      if (!loadedModel) return;

      // Rotate the whole pivot (full body)
      const targetRotY = isLeft ? 0 : -Math.PI / 2; // 0 = front, -90° = left

      // Focus either the head or model center (same as before)
      const targetFocus = new THREE.Vector3();
      if (!isLeft) {
        getHeadWorldPosition(targetFocus);
      } else {
        targetFocus.copy(modelCenter);
      }

      // Keep current camera offset relative to focus so the move feels natural
      const currentOffset = new THREE.Vector3().subVectors(camera.position, focus);
      const targetCamPos = new THREE.Vector3().addVectors(targetFocus, currentOffset);

      // True ortho zoom (unchanged behavior)
      const headHalfH = Math.max(0.1, characterHeight * 0.18); // tweak for tightness
      const targetZoom = isLeft ? baseZoom : THREE.MathUtils.clamp(orthoHalfHeight / headHalfH, 0.1, 8);

      // Optional subtle scale to punch the effect (unchanged)
      const targetScale = isLeft ? 1 : 1.15;

      gsap.killTweensOf([modelPivot.rotation, modelPivot.scale, camera, focus]);

      const tl = gsap.timeline({ defaults: { duration: 1.2, ease: 'power2.inOut' } });

      // Rotate the full body (pivot)
      tl.to(modelPivot.rotation, { y: targetRotY }, 0);

      // Camera position follows focus shift
      tl.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z }, 0);

      // Move the focus point (camera.lookAt target)
      tl.to(
        focus,
        {
          x: targetFocus.x,
          y: targetFocus.y,
          z: targetFocus.z,
          onUpdate: () => camera.lookAt(focus),
          onComplete: () => camera.lookAt(focus),
        },
        0
      );

      // True orthographic zoom
      tl.to(
        camera,
        {
          zoom: targetZoom,
          onUpdate: () => camera.updateProjectionMatrix(),
        },
        0
      );

      // Optional model scale
      tl.to(modelPivot.scale, { x: targetScale, y: targetScale, z: targetScale }, 0);

      isLeft = !isLeft;
    };

    const onBtnClick = () => rotateFullBodyAndCenter();
    btnRef.current?.addEventListener('click', onBtnClick);

    // --- Resize --------------------------------------------------------------
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      updateOrthoFrustumOnResize();
    };
    window.addEventListener('resize', onResize);

    // --- Render loop ---------------------------------------------------------
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer?.update(delta);
      renderer.render(scene, camera);
    };
    animate();

    // --- Cleanup -------------------------------------------------------------
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      btnRef.current?.removeEventListener('click', onBtnClick);

      gsap.killTweensOf([modelPivot.rotation, modelPivot.scale, camera, focus]);

      gui.destroy();
      scene.remove(axes, pointHelper, grid, ground, pointLight, ambientLight, modelPivot);
      (pointHelper as any)?.dispose?.();
      planeGeo.dispose();
      planeMat.dispose();

      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={mountRef} className="w-full min-h-screen relative">
      <div
        ref={btnRef}
        className="absolute top-4 left-4 w-[260px] h-[36px] cursor-pointer bg-amber-500 hover:bg-amber-400 active:bg-amber-600 transition-colors text-black font-medium rounded flex items-center justify-center shadow"
      >
        Rotate FULL Body + Zoom (toggle)
      </div>
    </div>
  );
};

export default ParameterSphere;
