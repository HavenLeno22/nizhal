// A 3D "dollhouse" of the home: outer surfaces coloured by simulated temperature,
// the south wall see-through so the inside surfaces show too, and the real sun
// for the place and hour. Loaded lazily (three.js is big).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { floorOnGround, roofExposed, SIDES, type Home, type Side } from '../engine/home';
import type { SimResult } from '../engine/simulate';
import { sunPosition } from '../engine/solar';
import { tempRgb } from './heatScale';

const scratch = new THREE.Color();
function tempColor(t: number): THREE.Color {
  const [r, g, b] = tempRgb(t);
  return scratch.setRGB(r, g, b, THREE.SRGBColorSpace);
}

interface Props {
  home: Home;
  result: SimResult;
  /** Hour index into the result. */
  k: number;
  dark: boolean;
}

interface Surfaces {
  roofOuter: THREE.MeshStandardMaterial | null;
  ceiling: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  wallOuter: Partial<Record<Side, THREE.MeshStandardMaterial>>;
  wallInner: Record<Side, THREE.MeshStandardMaterial>;
}

function mat(color: THREE.ColorRepresentation, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

/** Builds the house; returns the group, the materials that carry temperatures, and where to look. */
function buildHouse(home: Home): { group: THREE.Group; surfaces: Surfaces; focusY: number; size: number } {
  const g = new THREE.Group();
  const L = Math.sqrt(home.floorArea);
  const H = home.height;
  const t = 0.23;
  const isFlat = home.homeType === 'topFlat' || home.homeType === 'middleFlat' || home.homeType === 'groundFlat';
  // A flat sits on floors below it (and under floors above it), drawn as pale ghosts.
  const base = home.homeType === 'topFlat' || home.homeType === 'middleFlat' ? H * 2 : 0;
  const neighbour = mat('#e4e9e3', { roughness: 1, transparent: true, opacity: 0.38, depthWrite: false });

  if (isFlat) {
    const below = base > 0 ? new THREE.Mesh(new THREE.BoxGeometry(L + t * 2, base, L + t * 2), neighbour) : null;
    if (below) {
      below.position.y = base / 2;
      g.add(below);
    }
    if (home.homeType !== 'topFlat') {
      const above = new THREE.Mesh(new THREE.BoxGeometry(L + t * 2, H, L + t * 2), neighbour);
      above.position.y = base + H + 0.12 + H / 2;
      g.add(above);
    }
  }

  const surfaces: Surfaces = {
    roofOuter: null,
    ceiling: mat('#ffffff', { side: THREE.DoubleSide }),
    floor: mat('#ffffff'),
    wallOuter: {},
    wallInner: { N: mat('#ffffff'), E: mat('#ffffff'), S: mat('#ffffff'), W: mat('#ffffff') },
  };

  // Floor (inside).
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, L), surfaces.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = base + 0.02;
  floor.receiveShadow = true;
  g.add(floor);

  // Walls: an outer skin coloured by outer-surface temperature and an inner skin
  // coloured by inner-surface temperature. The south outer skin is see-through.
  const wallSpec: Record<Side, { pos: [number, number]; rotY: number }> = {
    N: { pos: [0, -L / 2], rotY: Math.PI },
    S: { pos: [0, L / 2], rotY: 0 },
    E: { pos: [L / 2, 0], rotY: Math.PI / 2 },
    W: { pos: [-L / 2, 0], rotY: -Math.PI / 2 },
  };
  for (const s of SIDES) {
    const spec = wallSpec[s];
    const outward = new THREE.Vector3(Math.sin(spec.rotY), 0, Math.cos(spec.rotY));
    const exposed = home.exposed[s];
    const outerMat = exposed ? mat('#ffffff') : mat('#cdd5ce', { roughness: 1 });
    if (exposed) surfaces.wallOuter[s] = outerMat;
    if (s === 'S') {
      outerMat.transparent = true;
      outerMat.opacity = 0.22;
      outerMat.depthWrite = false;
    }
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(L + t * 2, H), outerMat);
    outer.position.set(spec.pos[0] + outward.x * t, base + H / 2, spec.pos[1] + outward.z * t);
    outer.rotation.y = spec.rotY;
    outer.castShadow = s !== 'S';
    outer.receiveShadow = true;
    g.add(outer);

    const inner = new THREE.Mesh(new THREE.PlaneGeometry(L, H), surfaces.wallInner[s]);
    inner.position.set(spec.pos[0], base + H / 2, spec.pos[1]);
    inner.rotation.y = spec.rotY + Math.PI; // faces into the room
    inner.receiveShadow = true;
    g.add(inner);

    // Window and sunshade.
    const area = exposed ? home.windows[s] : 0;
    if (area > 0.05) {
      const w = Math.min(L * 0.7, Math.sqrt(area * 1.3));
      const h = Math.min(H * 0.7, area / w);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ color: '#26405e', roughness: 0.15, metalness: 0.3, transparent: s === 'S', opacity: s === 'S' ? 0.35 : 1 }),
      );
      glass.position.set(spec.pos[0] + outward.x * (t + 0.01), base + 1.5, spec.pos[1] + outward.z * (t + 0.01));
      glass.rotation.y = spec.rotY;
      g.add(glass);
      if (home.sunshades) {
        const shade = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.06, 0.6), mat('#d9ded8'));
        shade.position.set(spec.pos[0] + outward.x * (t + 0.3), base + 1.5 + h / 2 + 0.12, spec.pos[1] + outward.z * (t + 0.3));
        shade.rotation.y = spec.rotY;
        shade.castShadow = true;
        g.add(shade);
      }
    }
  }

  // Ceiling (inside), coloured by the inner roof surface.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(L, L), surfaces.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = base + H - 0.02;
  g.add(ceiling);

  // Roof.
  if (roofExposed(home)) {
    const roofMat = mat('#ffffff', { roughness: home.roof === 'tin' ? 0.5 : 0.85, metalness: home.roof === 'tin' ? 0.25 : 0 });
    surfaces.roofOuter = roofMat;
    const span = L + t * 2 + 0.4;
    if (home.roof === 'rcc' || home.roof === 'rccWeathering' || isFlat) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(span, 0.18, span), roofMat);
      slab.position.y = base + H + 0.09;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
      const parapetMat = roofMat;
      for (const [x, z, w, d] of [
        [0, -span / 2, span, 0.12],
        [0, span / 2, span, 0.12],
        [-span / 2, 0, 0.12, span],
        [span / 2, 0, 0.12, span],
      ] as const) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), parapetMat);
        p.position.set(x, base + H + 0.43, z);
        p.castShadow = true;
        g.add(p);
      }
    } else if (home.roof === 'tin' || home.roof === 'asbestos') {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(span, 0.05, span * 1.04), roofMat);
      sheet.position.y = base + H + 0.35;
      sheet.rotation.x = 0.22; // a shallow mono-pitch, high side to the north
      sheet.castShadow = sheet.receiveShadow = true;
      g.add(sheet);
    } else {
      // Pitched gable (clay tiles or thatch): two slopes meeting at a ridge running east–west.
      const rise = home.roof === 'thatch' ? span * 0.45 : span * 0.32;
      const slopeLen = Math.hypot(span / 2, rise);
      const angle = Math.atan2(rise, span / 2);
      for (const sgn of [-1, 1]) {
        const plane = new THREE.Mesh(new THREE.BoxGeometry(span, 0.08, slopeLen), roofMat);
        plane.position.set(0, base + H + rise / 2, (sgn * span) / 4);
        plane.rotation.x = sgn * angle;
        plane.castShadow = plane.receiveShadow = true;
        g.add(plane);
      }
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-span / 2, 0);
      gableShape.lineTo(span / 2, 0);
      gableShape.lineTo(0, rise);
      gableShape.closePath();
      for (const sgn of [-1, 1]) {
        const gable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), mat('#cfd6cf', { side: THREE.DoubleSide }));
        gable.rotation.y = Math.PI / 2;
        gable.position.set((sgn * span) / 2, base + H, 0);
        g.add(gable);
      }
    }

    if (home.roofShade > 0.3) {
      const netY = base + H + (home.roof === 'clayTile' || home.roof === 'thatch' ? span * 0.5 : 1.3);
      const net = new THREE.Mesh(
        new THREE.PlaneGeometry(span + 0.6, span + 0.6),
        new THREE.MeshStandardMaterial({ color: '#2f6b3f', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }),
      );
      net.rotation.x = -Math.PI / 2;
      net.position.y = netY;
      net.castShadow = true;
      g.add(net);
      const poleMat = mat('#6b6f6a');
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, netY - base - H), poleMat);
        pole.position.set((x * (span + 0.6)) / 2, base + H + (netY - base - H) / 2, (z * (span + 0.6)) / 2);
        g.add(pole);
      }
    }
  }

  // Trees on the west side, if the home has shade from trees.
  if (home.wallShade > 0.2 && floorOnGround(home)) {
    const trunkMat = mat('#6d5a43');
    const leafMat = mat('#3f7a4a', { roughness: 1 });
    for (const z of [-L * 0.25, L * 0.3]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6), trunkMat);
      trunk.position.set(-L / 2 - 2.2, 1.3, z);
      trunk.castShadow = true;
      g.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 14), leafMat);
      crown.position.set(-L / 2 - 2.2, 3.6, z);
      crown.castShadow = true;
      g.add(crown);
    }
  }

  return { group: g, surfaces, focusY: base + H * 0.55, size: Math.max(1, L / 6.3) };
}

export default function House3D({ home, result, k, dark }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sun: THREE.DirectionalLight;
    sunBall: THREE.Mesh;
    hemi: THREE.HemisphereLight;
    ground: THREE.Mesh;
    house: THREE.Group | null;
    surfaces: Surfaces | null;
    frame: number;
  } | null>(null);

  // Set up the scene once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    camera.position.set(9.5, 6.5, 11.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // No wheel zoom: on a long page the wheel must scroll the page, not trap it.
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 1.6, 0);

    const hemi = new THREE.HemisphereLight('#dfe9f2', '#7b7464', 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4dc', 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 80;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(sun.target);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 16), new THREE.MeshBasicMaterial({ color: '#ffd166' }));
    scene.add(sunBall);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(22, 64), mat('#d8ddd4', { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // North arrow on the ground.
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.1, 3),
      new THREE.MeshBasicMaterial({ color: '#3550a0' }),
    );
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.05, -11);
    scene.add(arrow);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const state = { renderer, scene, camera, controls, sun, sunBall, hemi, ground, house: null, surfaces: null, frame: 0 };
    ctx.current = state;
    const loop = () => {
      state.frame = requestAnimationFrame(loop);
      if (document.hidden) return;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(state.frame);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  // Rebuild the house when the home's shape changes.
  const shapeKey = JSON.stringify([
    home.floorArea,
    home.height,
    home.roof,
    home.homeType,
    home.exposed,
    home.windows,
    home.sunshades,
    home.roofShade > 0.3,
    home.wallShade > 0.2,
  ]);
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    if (c.house) {
      c.scene.remove(c.house);
      c.house.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    const { group, surfaces, focusY, size } = buildHouse(home);
    c.scene.add(group);
    c.house = group;
    c.surfaces = surfaces;
    // Frame the home itself (a flat may sit two storeys up).
    c.controls.target.set(0, focusY, 0);
    c.camera.position.set(9.5 * size, focusY + 4.9 * size, 11.5 * size);
    c.controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey]);

  // Colour surfaces and place the sun for the chosen hour.
  useEffect(() => {
    const c = ctx.current;
    const s = c?.surfaces;
    if (!c || !s) return;
    const kk = Math.max(0, Math.min(result.hours - 1, k));
    if (s.roofOuter && result.roofOuter) s.roofOuter.color.copy(tempColor(result.roofOuter[kk]));
    s.ceiling.color.copy(tempColor(result.roofInner[kk]));
    s.floor.color.copy(tempColor(result.floorInner[kk]));
    for (const side of SIDES) {
      const outer = s.wallOuter[side];
      const arr = result.wallOuter[side];
      if (outer && arr) outer.color.copy(tempColor(arr[kk]));
      s.wallInner[side].color.copy(tempColor(result.wallInner[side][kk]));
    }
    const pos = sunPosition(result.startUtc + kk * 3_600_000, home.place.lat, home.place.lon);
    const el = ((90 - pos.zenith) * Math.PI) / 180;
    const az = (pos.azimuth * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const up = el > 0;
    c.sun.position.copy(dir.clone().multiplyScalar(30));
    c.sun.intensity = up ? 0.6 + 2.2 * Math.sin(el) : 0;
    c.sunBall.visible = up;
    c.sunBall.position.copy(dir.clone().multiplyScalar(18));
    c.hemi.intensity = up ? 0.8 : 0.35;
    c.hemi.color.set(up ? '#dfe9f2' : '#5d6f94');
    (c.ground.material as THREE.MeshStandardMaterial).color.set(dark ? '#25332c' : up ? '#d8ddd4' : '#9aa59c');
  }, [result, k, home.place.lat, home.place.lon, dark, shapeKey]);

  return <div className="house3d" ref={host} />;
}
