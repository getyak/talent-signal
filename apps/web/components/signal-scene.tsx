"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const nodePositions: Array<[number, number, number]> = [
  [-2.5, 1.15, -0.3],
  [-1.9, -1.4, 0.2],
  [2.35, 1.2, 0.1],
  [2.5, -1.15, -0.4],
  [0.1, 2.05, -0.7],
];

export function SignalScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 7);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x171715, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    const signalGroup = new THREE.Group();
    scene.add(signalGroup);

    const linePoints = nodePositions.flatMap((position) => [
      new THREE.Vector3(...position),
      new THREE.Vector3(0, 0, 0),
    ]);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x8f8c86,
      opacity: 0.42,
      transparent: true,
    });
    signalGroup.add(new THREE.LineSegments(lineGeometry, lineMaterial));

    const nodeGeometry = new THREE.SphereGeometry(0.1, 24, 24);
    const activeNodeGeometry = new THREE.SphereGeometry(0.15, 24, 24);
    const orbitGeometry = new THREE.TorusGeometry(0.26, 0.012, 12, 48);

    nodePositions.forEach((position, index) => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(...position);

      const active = index === 2;
      const nodeMaterial = new THREE.MeshStandardMaterial({
        color: active ? 0xd84a35 : 0xe5e2dc,
        metalness: 0.08,
        roughness: 0.58,
      });
      const node = new THREE.Mesh(
        active ? activeNodeGeometry : nodeGeometry,
        nodeMaterial,
      );
      nodeGroup.add(node);

      const orbitMaterial = new THREE.MeshBasicMaterial({
        color: active ? 0xd84a35 : 0x9d9992,
        opacity: active ? 0.8 : 0.36,
        transparent: true,
      });
      const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
      orbit.rotation.x = Math.PI / 2;
      nodeGroup.add(orbit);
      signalGroup.add(nodeGroup);
    });

    const core = new THREE.Group();
    const coreGeometry = new THREE.DodecahedronGeometry(0.64, 0);
    core.add(
      new THREE.Mesh(
        coreGeometry,
        new THREE.MeshBasicMaterial({ color: 0xd84a35 }),
      ),
    );
    const coreWire = new THREE.Mesh(
      coreGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x7d261b,
        opacity: 0.34,
        transparent: true,
        wireframe: true,
      }),
    );
    coreWire.scale.setScalar(1.003);
    core.add(coreWire);
    signalGroup.add(core);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({
        color: 0xd84a35,
        opacity: 0.55,
        transparent: true,
      }),
    );
    innerRing.rotation.x = Math.PI / 2;
    signalGroup.add(innerRing);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.009, 12, 96),
      new THREE.MeshBasicMaterial({
        color: 0x8f8c86,
        opacity: 0.3,
        transparent: true,
      }),
    );
    outerRing.rotation.set(Math.PI / 2.55, 0.18, 0);
    signalGroup.add(outerRing);

    scene.add(new THREE.AmbientLight(0xffffff, 1.45));
    const primaryLight = new THREE.DirectionalLight(0xffffff, 1.5);
    primaryLight.position.set(4, 5, 6);
    scene.add(primaryLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
    fillLight.position.set(-4, -2, 3);
    scene.add(fillLight);

    const pointer = new THREE.Vector2();
    const clock = new THREE.Timer();
    clock.connect(document);

    function resize() {
      const width = container?.clientWidth ?? 1;
      const height = container?.clientHeight ?? 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = container?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    function renderFrame() {
      clock.update();
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsed();
      signalGroup.rotation.y = THREE.MathUtils.damp(
        signalGroup.rotation.y,
        pointer.x * 0.16,
        3,
        delta,
      );
      signalGroup.rotation.x = THREE.MathUtils.damp(
        signalGroup.rotation.x,
        pointer.y * -0.1,
        3,
        delta,
      );
      const pulse = 1 + Math.sin(elapsed * 1.4) * 0.035;
      core.scale.setScalar(pulse);
      renderer.render(scene, camera);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    container.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    renderer.setAnimationLoop(renderFrame);

    return () => {
      renderer.setAnimationLoop(null);
      container.removeEventListener("pointermove", handlePointerMove);
      resizeObserver.disconnect();
      clock.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="signal-scene"
      role="img"
      aria-label="A spatial map showing five evidence fragments converging into one recommended action."
    />
  );
}
