import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BUGS, SPECIMEN_IDS, type BugId, type CmdId } from "../game/data";
import { COLS, ROWS, boardXY, type BattleState, type BUnit, type Zone, type PrepUnit } from "../game/engine";
import { buildVoxelModel, dotTexture, warmVoxelCache, V, type VoxModel } from "../game/voxel";
import { animateInsectRig } from "../game/animate";
import { useSettings } from "../i18n";
import {
  AIRSTRIKE_RADIUS, AIRSTRIKE_SECONDS, createAirstrikePose, sampleAirstrikeDive,
  type AirstrikeDive, type FlightPhase,
} from "../game/airstrike";

export type SceneMode = "prep" | "battle" | "showcase";

interface Props {
  mode: SceneMode;
  prep?: PrepUnit[];
  battle?: BattleState | null;
  /** Live mutable battle ref for 60/120fps rendering without React re-renders */
  battleRef?: React.RefObject<BattleState | null>;
  battleSpeed?: number;
  selectedUid?: number | null;
  canDeployMore?: boolean;
  interactive?: boolean;
  cmdA?: CmdId;
  cmdB?: CmdId;
  /** Focused specimen ID in showcase mode */
  focusId?: string;
  onFocusChange?: (id: string) => void;
  onCell?: (slot: number) => void;
  onUnit?: (uid: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

interface UnitObj {
  uid: number;
  id: string;
  star: number;
  side: "ally" | "foe";
  model: VoxModel;
  holder: THREE.Group;
  inner: THREE.Group;
  ring: THREE.Mesh | null;
  /** soft contact shadow — the cue that the unit is genuinely airborne */
  shadow: THREE.Mesh;
  /** spinning translucent disc standing in for a ~30Hz wing beat */
  blurDisc: THREE.Mesh;
  prevPhase: FlightPhase | "grounded";
  streakClock: number;
  rotY: number;
  bob: number;
  lunge: number;
  deadT: number;
  prevCast: number;
  prevCd: number;
  /** 0→1 deploy pop when the voxel sculpt first mounts (instant if reduced motion) */
  spawnT: number;
  activeDiveId: number | null;
  scale: number;
  el: HTMLElement;
  hpEl: HTMLElement;
  manaEl: HTMLElement;
  pipsEl: HTMLElement;
  nameEl: HTMLElement;
  // cached DOM state to eliminate redundant layout/style writes
  lx: number;
  ly: number;
  lhp: number;
  lmana: number;
  lvis: number;
  lsel: boolean;
  lfoe: boolean;
  lbattle: boolean;
  lname: string;
  lpips: string;
  lvuln: boolean;
}

const ALLY_ROW_MIN = 3;
/** Units hover just above the tiles — coplanar feet caused depth fighting. */
const UNIT_GROUND = 0.02;
const SHOWCASE_ORDER = SPECIMEN_IDS;


/** Indonesian labels for the imperative 3D overlay (nameplates & combat pops).
 *  The animation loop runs outside React, so it reads the live document lang
 *  that SettingsProvider keeps on <html lang>. */
const OV_ID: Record<string, string> = {
  CLIMB: "NAIK", "LOCK ON": "MENGUNCI", DIVE: "MENUKIK", LANDED: "Mendarat",
  AIRSTRIKE: "SERBUAN UDARA", PINCER: "CAPITAN", RAKE: "TEBASAN", BURST: "LEDAKAN",
  GLOW: "CAHAYA", HOLE: "LUBANG", "TRAP!": "Jebakan!", TOUCHDOWN: "Mendarat",
};
const ovWord = (w: string): string =>
  typeof document !== "undefined" && document.documentElement.lang === "id" ? OV_ID[w] ?? w : w;

export function Scene3D({
  mode,
  prep = [],
  battle = null,
  battleRef,
  battleSpeed = 1,
  selectedUid = null,
  canDeployMore = true,
  interactive = false,
  cmdA = "matriarch",
  cmdB = "lampyris",
  focusId = "stag",
  onFocusChange,
  onCell,
  onUnit,
  className = "",
  style,
}: Props) {
  const { t } = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const ovRef = useRef<HTMLDivElement>(null);
  const [noGL, setNoGL] = useState(false);

  const P = useRef({
    mode,
    prep,
    battle,
    battleRef,
    battleSpeed,
    selectedUid,
    canDeployMore,
    interactive,
    cmdA,
    cmdB,
    focusId,
    onFocusChange,
    onCell,
    onUnit,
  });
  P.current = {
    mode,
    prep,
    battle,
    battleRef,
    battleSpeed,
    selectedUid,
    canDeployMore,
    interactive,
    cmdA,
    cmdB,
    focusId,
    onFocusChange,
    onCell,
    onUnit,
  };

  useEffect(() => {
    warmVoxelCache();
    const host = hostRef.current;
    const ov = ovRef.current;
    if (!host || !ov) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setNoGL(true);
      return;
    }
    if (!renderer.getContext()) {
      setNoGL(true);
      return;
    }

    // Shadows refresh at half rate (toggled in tick): the extra depth pass is
    // one of the two most expensive parts of the frame, and 30Hz shadow
    // updates are imperceptible for units that glide a few px per frame.
    renderer.shadowMap.autoUpdate = false;

    let alive = true;
    const hostEl: HTMLDivElement = host;
    const ovEl: HTMLDivElement = ov;
    const showcase = P.current.mode === "showcase";
    const isCompact = window.innerWidth < 640;

    const dpr = Math.min(window.devicePixelRatio || 1, isCompact ? 1.65 : 2);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    hostEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0806, showcase ? 0.032 : 0.022);
    const camera = new THREE.PerspectiveCamera(showcase ? 34 : 35, 1, 0.1, 80);
    const target = new THREE.Vector3(showcase ? 0 : 3.5, showcase ? 0.24 : 0.08, showcase ? 0.15 : 3.05);

    let W = hostEl.clientWidth || 360;
    let H = hostEl.clientHeight || 320;

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o);

    /* ── Lighting Rig ── */
    const hemi = new THREE.HemisphereLight(0x4a6b60, 0x16100b, 0.92);
    scene.add(hemi);

    const lamp = new THREE.DirectionalLight(0xffebc4, 2.05);
    lamp.position.set(showcase ? 2.2 : 5.4, 8.6, showcase ? 4.8 : 6.4);
    lamp.castShadow = true;
    const shadowRes = isCompact ? 512 : 1024;
    lamp.shadow.mapSize.set(shadowRes, shadowRes);
    lamp.shadow.camera.near = 2;
    lamp.shadow.camera.far = 20;
    const sBound = showcase ? 3.2 : 4.7;
    lamp.shadow.camera.left = -sBound;
    lamp.shadow.camera.right = sBound;
    lamp.shadow.camera.top = sBound;
    lamp.shadow.camera.bottom = -sBound;
    lamp.shadow.bias = -0.0012;
    lamp.shadow.normalBias = 0.018;
    lamp.target.position.set(showcase ? 0 : 3.5, 0, showcase ? 0 : 3);
    scene.add(lamp, lamp.target);

    const rim = new THREE.DirectionalLight(0x52dfa8, 0.95);
    rim.position.set(-4.5, 3.8, -5.2);
    scene.add(rim);

    const warm = new THREE.PointLight(0xf0a93b, showcase ? 7 : 11, 13, 1.9);
    warm.position.set(showcase ? 0 : 3.5, 2.5, showcase ? 1.8 : 3.8);
    scene.add(warm);

    /* ── Board / Showcase Architecture ── */
    let tilesMesh: THREE.InstancedMesh | null = null;
    let tileRimsMesh: THREE.InstancedMesh | null = null;
    const tileHeights = new Float32Array(COLS * ROWS);
    let hoverSlot = -1;
    const hoverMeshRef: { mesh: THREE.Mesh | null; mat: THREE.MeshBasicMaterial | null } = {
      mesh: null,
      mat: null,
    };
    // living board fixtures, driven from the frame loop
    const ambientRef: {
      pips: THREE.InstancedMesh | null;
      pipMat: THREE.MeshBasicMaterial | null;
      lanternMat: THREE.MeshBasicMaterial | null;
    } = { pips: null, pipMat: null, lanternMat: null };

    const totemState: {
      allyId: string;
      foeId: string;
      allyModel: VoxModel | null;
      foeModel: VoxModel | null;
      allyHolder: THREE.Group | null;
      foeHolder: THREE.Group | null;
    } = {
      allyId: "",
      foeId: "",
      allyModel: null,
      foeModel: null,
      allyHolder: null,
      foeHolder: null,
    };

    let turntable: THREE.Group | null = null;
    const showcaseItems: { id: string; model: VoxModel; holder: THREE.Group; baseAngle: number }[] = [];
    let spinAngle = 0;
    let userSpinOffset = 0;

    const m4 = new THREE.Matrix4();
    const q0 = new THREE.Quaternion();
    const vPos = new THREE.Vector3();
    const vScale = new THREE.Vector3(1, 1, 1);
    const cTmp = new THREE.Color();

    if (!showcase) {
      // 1. Recessed Cabinet Bed
      const caseBase = new THREE.Mesh(
        track(new THREE.BoxGeometry(COLS + 0.84, 0.42, ROWS + 0.84)),
        track(new THREE.MeshStandardMaterial({ color: 0x1a120d, roughness: 0.86, metalness: 0.08 }))
      );
      caseBase.position.set(3.5, -0.25, 3);
      caseBase.receiveShadow = true;
      scene.add(caseBase);

      const groutBed = new THREE.Mesh(
        track(new THREE.PlaneGeometry(COLS + 0.14, ROWS + 0.14)),
        track(new THREE.MeshStandardMaterial({ color: 0x0d0907, roughness: 0.95, metalness: 0.02 }))
      );
      groutBed.rotation.x = -Math.PI / 2;
      groutBed.position.set(3.5, -0.036, 3);
      groutBed.receiveShadow = true;
      scene.add(groutBed);

      // 2. 42 Physical 3D Chamfered Tactical Tiles
      const rawTileGeo = new THREE.CylinderGeometry(0.615, 0.662, 0.08, 4, 1);
      rawTileGeo.rotateY(Math.PI / 4);
      const tileGeo = track(rawTileGeo.toNonIndexed());
      rawTileGeo.dispose();
      tileGeo.computeVertexNormals();

      const tileMat = track(
        new THREE.MeshStandardMaterial({
          roughness: 0.62,
          metalness: 0.14,
        })
      );
      tilesMesh = new THREE.InstancedMesh(tileGeo, tileMat, COLS * ROWS);
      tilesMesh.receiveShadow = true;
      tilesMesh.castShadow = false;

      const rimGeo = track(new THREE.RingGeometry(0.555, 0.605, 4));
      rimGeo.rotateZ(Math.PI / 4);
      rimGeo.rotateX(-Math.PI / 2);
      const rimMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        })
      );
      tileRimsMesh = new THREE.InstancedMesh(rimGeo, rimMat, 21);
      tileRimsMesh.renderOrder = 1;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r * COLS + c;
          const checker = (r + c) % 2 === 0;
          const ally = r >= ALLY_ROW_MIN;
          vPos.set(c + 0.5, -0.036, r + 0.5);
          m4.compose(vPos, q0, vScale);
          tilesMesh.setMatrixAt(idx, m4);

          if (ally) {
            cTmp.setHex(checker ? 0x1e382e : 0x162922);
          } else {
            cTmp.setHex(checker ? 0x2c1b18 : 0x211513);
          }
          tilesMesh.setColorAt(idx, cTmp);

          if (ally) {
            const aIdx = idx - ALLY_ROW_MIN * COLS;
            vPos.set(c + 0.5, 0.010, r + 0.5);
            m4.compose(vPos, q0, vScale);
            tileRimsMesh.setMatrixAt(aIdx, m4);
            tileRimsMesh.setColorAt(aIdx, cTmp.setHex(0x4fd3a0));
          }
        }
      }
      tilesMesh.instanceMatrix.needsUpdate = true;
      if (tilesMesh.instanceColor) tilesMesh.instanceColor.needsUpdate = true;
      tileRimsMesh.instanceMatrix.needsUpdate = true;
      if (tileRimsMesh.instanceColor) tileRimsMesh.instanceColor.needsUpdate = true;
      scene.add(tilesMesh, tileRimsMesh);

      // 3. Mahogany Frame Walls & Brass Trim
      const woodMat = track(
        new THREE.MeshStandardMaterial({ color: 0x2e2017, roughness: 0.68, metalness: 0.1 })
      );
      const trimMat = track(
        new THREE.MeshStandardMaterial({ color: 0x463123, roughness: 0.55, metalness: 0.14 })
      );
      const brassMat = track(
        new THREE.MeshStandardMaterial({ color: 0xe6a53c, roughness: 0.3, metalness: 0.82 })
      );

      const wallSpecs: [number, number, number, number, number][] = [
        [3.5, 0.11, -0.21, COLS + 0.84, 0.3],
        [3.5, 0.11, ROWS + 0.21, COLS + 0.84, 0.3],
        [-0.21, 0.11, 3, 0.3, ROWS + 0.24],
        [COLS + 0.21, 0.11, 3, 0.3, ROWS + 0.24],
      ];
      for (const [x, y, z, w, d] of wallSpecs) {
        const rail = new THREE.Mesh(track(new THREE.BoxGeometry(w, 0.28, d)), woodMat);
        rail.position.set(x, y, z);
        rail.castShadow = true;
        rail.receiveShadow = true;
        scene.add(rail);

        const cap = new THREE.Mesh(track(new THREE.BoxGeometry(w * 0.99, 0.04, d * 0.82)), trimMat);
        cap.position.set(x, y + 0.15, z);
        scene.add(cap);
      }

      // Handle & Escutcheon
      const plate = new THREE.Mesh(track(new THREE.BoxGeometry(1.7, 0.14, 0.06)), brassMat);
      plate.position.set(3.5, 0.06, ROWS + 0.37);
      scene.add(plate);
      const pullBar = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.05, 0.08)), brassMat);
      pullBar.position.set(3.5, 0.06, ROWS + 0.46);
      scene.add(pullBar);
      for (const px of [3.0, 4.0]) {
        const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.08, 0.1)), brassMat);
        post.position.set(px, 0.06, ROWS + 0.41);
        scene.add(post);
      }

      // 4 Corner Posts & Commander Plinths
      const cornerCoords: [number, number][] = [
        [-0.21, -0.21],
        [COLS + 0.21, -0.21],
        [-0.21, ROWS + 0.21],
        [COLS + 0.21, ROWS + 0.21],
      ];
      for (const [cx, cz] of cornerCoords) {
        const corner = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.34, 0.36)), brassMat);
        corner.position.set(cx, 0.13, cz);
        corner.castShadow = true;
        scene.add(corner);
      }

      const pedGeo = track(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 8));
      const allyPed = new THREE.Mesh(pedGeo, brassMat);
      allyPed.position.set(-0.21, 0.34, ROWS + 0.21);
      scene.add(allyPed);
      const foePed = new THREE.Mesh(pedGeo, brassMat);
      foePed.position.set(COLS + 0.21, 0.34, -0.21);
      scene.add(foePed);

      totemState.allyHolder = new THREE.Group();
      totemState.allyHolder.position.set(-0.21, 0.4, ROWS + 0.21);
      totemState.allyHolder.rotation.y = 0.55;
      scene.add(totemState.allyHolder);

      totemState.foeHolder = new THREE.Group();
      totemState.foeHolder.position.set(COLS + 0.21, 0.4, -0.21);
      totemState.foeHolder.rotation.y = Math.PI + 0.55;
      scene.add(totemState.foeHolder);

      // Frontline Conduit & Sconces
      const conduit = new THREE.Mesh(
        track(new THREE.BoxGeometry(COLS + 0.08, 0.025, 0.07)),
        track(new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.5, metalness: 0.6 }))
      );
      conduit.position.set(3.5, 0.008, 3);
      scene.add(conduit);

      const pipGeo = track(new THREE.BoxGeometry(0.42, 0.022, 0.036));
      const pipMat = track(
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
      );
      const pips = new THREE.InstancedMesh(pipGeo, pipMat, COLS);
      for (let i = 0; i < COLS; i++) {
        vPos.set(i + 0.5, 0.018, 3);
        m4.compose(vPos, q0, vScale);
        pips.setMatrixAt(i, m4);
        pips.setColorAt(i, cTmp.setHex(0xf0a93b));
      }
      pips.instanceMatrix.needsUpdate = true;
      if (pips.instanceColor) pips.instanceColor.needsUpdate = true;
      scene.add(pips);

      const lanternGlowMat = track(
        new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false })
      );
      ambientRef.pips = pips;
      ambientRef.pipMat = pipMat;
      ambientRef.lanternMat = lanternGlowMat;
      for (const lx of [-0.21, COLS + 0.21]) {
        const sconce = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.13, 0.18, 6)), brassMat);
        sconce.position.set(lx, 0.36, 3);
        scene.add(sconce);
        const core = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.13, 0.11)), lanternGlowMat);
        core.position.set(lx, 0.46, 3);
        scene.add(core);
      }

      // Engraved coordinate studs
      const studGeo = track(new THREE.BoxGeometry(0.055, 0.025, 0.055));
      const studCount = COLS * 2 + ROWS * 2;
      const studs = new THREE.InstancedMesh(studGeo, brassMat, studCount);
      let si = 0;
      for (let c = 0; c < COLS; c++) {
        vPos.set(c + 0.5, 0.28, -0.21);
        m4.compose(vPos, q0, vScale);
        studs.setMatrixAt(si++, m4);
        vPos.set(c + 0.5, 0.28, ROWS + 0.21);
        m4.compose(vPos, q0, vScale);
        studs.setMatrixAt(si++, m4);
      }
      for (let r = 0; r < ROWS; r++) {
        vPos.set(-0.21, 0.28, r + 0.5);
        m4.compose(vPos, q0, vScale);
        studs.setMatrixAt(si++, m4);
        vPos.set(COLS + 0.21, 0.28, r + 0.5);
        m4.compose(vPos, q0, vScale);
        studs.setMatrixAt(si++, m4);
      }
      studs.instanceMatrix.needsUpdate = true;
      scene.add(studs);

      // Hover tile highlight
      const hoverMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xf0a93b,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const hover = new THREE.Mesh(track(new THREE.PlaneGeometry(0.9, 0.9)), hoverMat);
      hover.rotation.x = -Math.PI / 2;
      hover.renderOrder = 5;
      hover.visible = false;
      scene.add(hover);
      hoverMeshRef.mesh = hover;
      hoverMeshRef.mat = hoverMat;
    } else {
      /* ── 3D Specimen Turntable (Main Menu) ── */
      const brass = track(
        new THREE.MeshStandardMaterial({ color: 0xe6a53c, roughness: 0.3, metalness: 0.84 })
      );
      const slate = track(
        new THREE.MeshStandardMaterial({ color: 0x192b24, roughness: 0.68, metalness: 0.15 })
      );
      const darkWood = track(
        new THREE.MeshStandardMaterial({ color: 0x241811, roughness: 0.78, metalness: 0.08 })
      );

      const base = new THREE.Mesh(track(new THREE.CylinderGeometry(2.85, 3.05, 0.26, 8)), darkWood);
      base.position.set(0, -0.22, 0);
      base.receiveShadow = true;
      scene.add(base);

      const brassTrim = new THREE.Mesh(track(new THREE.CylinderGeometry(2.68, 2.74, 0.08, 8)), brass);
      brassTrim.position.set(0, -0.07, 0);
      scene.add(brassTrim);

      const stage = new THREE.Mesh(track(new THREE.CylinderGeometry(2.52, 2.58, 0.08, 16)), slate);
      stage.position.set(0, -0.02, 0);
      stage.receiveShadow = true;
      scene.add(stage);

      const innerRing = new THREE.Mesh(track(new THREE.RingGeometry(1.45, 1.52, 32)), brass);
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.y = 0.024;
      scene.add(innerRing);

      turntable = new THREE.Group();
      scene.add(turntable);

      const radius = 1.52;
      SHOWCASE_ORDER.forEach((id, i) => {
        const baseAngle = (i / SHOWCASE_ORDER.length) * Math.PI * 2;
        const holder = new THREE.Group();
        const pod = new THREE.Mesh(track(new THREE.CylinderGeometry(0.48, 0.54, 0.06, 8)), brass);
        pod.position.y = 0.03;
        pod.receiveShadow = true;
        holder.add(pod);

        const pad = new THREE.Mesh(track(new THREE.CylinderGeometry(0.43, 0.43, 0.07, 8)), darkWood);
        pad.position.y = 0.035;
        pad.receiveShadow = true;
        holder.add(pad);

        const model = buildVoxelModel(id, 1);
        model.group.position.y = 0.07;
        holder.add(model.group);

        holder.position.set(Math.sin(baseAngle) * radius, 0, Math.cos(baseAngle) * radius);
        turntable!.add(holder);
        showcaseItems.push({ id, model, holder, baseAngle });
      });
    }

    // Selection ring on board
    const selRingMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xf0a93b,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    const selRing = new THREE.Mesh(track(new THREE.RingGeometry(0.35, 0.45, 24)), selRingMat);
    selRing.rotation.x = -Math.PI / 2;
    selRing.position.y = 0.024;
    selRing.visible = false;
    scene.add(selRing);

    /* ── Fireflies ── */
    const dot = dotTexture();
    const FN = isCompact ? 22 : 34;
    const fpos = new Float32Array(FN * 3);
    const fbase: [number, number, number][] = [];
    for (let i = 0; i < FN; i++) {
      const bx = showcase ? (Math.random() - 0.5) * 5.2 : Math.random() * 7.6 - 0.3;
      const by = 0.22 + Math.random() * 2.1;
      const bz = showcase ? (Math.random() - 0.5) * 4.2 : Math.random() * 6.8 - 0.4;
      fbase.push([bx, by, bz]);
      fpos[i * 3] = bx;
      fpos[i * 3 + 1] = by;
      fpos[i * 3 + 2] = bz;
    }
    const fgeo = track(new THREE.BufferGeometry());
    fgeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
    const fmat = track(
      new THREE.PointsMaterial({
        size: 0.11,
        map: dot,
        color: 0xffe9a8,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    const flies = new THREE.Points(fgeo, fmat);
    flies.frustumCulled = false;
    scene.add(flies);

    /* ── Impact sparks: one pooled InstancedMesh of glowing chitin chips ── */
    const SPARK_N = isCompact ? 56 : 96;
    const sparkGeo = track(new THREE.BoxGeometry(V * 1.5, V * 1.5, V * 1.5));
    const sparkMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_N);
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sparks.frustumCulled = false;
    const spPos = new Float32Array(SPARK_N * 3);
    const spVel = new Float32Array(SPARK_N * 3);
    const spLife = new Float32Array(SPARK_N);
    const spMax = new Float32Array(SPARK_N);
    let spCursor = 0;
    for (let i = 0; i < SPARK_N; i++) {
      m4.compose(vPos.set(0, -50, 0), q0, vScale.set(0.0001, 0.0001, 0.0001));
      sparks.setMatrixAt(i, m4);
      sparks.setColorAt(i, cTmp.setHex(0xffffff));
    }
    vScale.set(1, 1, 1);
    sparks.instanceMatrix.needsUpdate = true;
    if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    scene.add(sparks);

    function spawnBurst(x: number, y: number, z: number, hex: number, count: number, power: number) {
      for (let n = 0; n < count; n++) {
        const i = spCursor;
        spCursor = (spCursor + 1) % SPARK_N;
        const a = Math.random() * Math.PI * 2;
        const up = 0.55 + Math.random() * 0.9;
        spPos[i * 3] = x;
        spPos[i * 3 + 1] = y;
        spPos[i * 3 + 2] = z;
        spVel[i * 3] = Math.cos(a) * power * (0.4 + Math.random() * 0.8);
        spVel[i * 3 + 1] = up * power;
        spVel[i * 3 + 2] = Math.sin(a) * power * (0.4 + Math.random() * 0.8);
        spMax[i] = 0.34 + Math.random() * 0.3;
        spLife[i] = spMax[i];
        sparks.setColorAt(i, cTmp.setHex(hex));
      }
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }

    function updateSparks(dt: number) {
      let anyAlive = false;
      for (let i = 0; i < SPARK_N; i++) {
        if (spLife[i] <= 0) continue;
        anyAlive = true;
        spLife[i] -= dt;
        if (spLife[i] <= 0) {
          m4.compose(vPos.set(0, -50, 0), q0, vScale.set(0.0001, 0.0001, 0.0001));
          sparks.setMatrixAt(i, m4);
          continue;
        }
        spVel[i * 3 + 1] -= 7.6 * dt;
        spPos[i * 3] += spVel[i * 3] * dt;
        spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt;
        spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
        // chip off the soil once, then die out
        if (spPos[i * 3 + 1] < 0.03 && spVel[i * 3 + 1] < 0) {
          spPos[i * 3 + 1] = 0.03;
          spVel[i * 3 + 1] *= -0.34;
          spVel[i * 3] *= 0.6;
          spVel[i * 3 + 2] *= 0.6;
        }
        const k = spLife[i] / spMax[i];
        const sc = 0.35 + k * 0.9;
        vScale.set(sc, sc, sc);
        vPos.set(spPos[i * 3], spPos[i * 3 + 1], spPos[i * 3 + 2]);
        m4.compose(vPos, q0, vScale);
        sparks.setMatrixAt(i, m4);
      }
      vScale.set(1, 1, 1);
      if (anyAlive) sparks.instanceMatrix.needsUpdate = true;
    }

    /* ── Dig Hole burrows: a scooped pit + an arming ring ── */
    const holePool: {
      root: THREE.Group;
      ring: THREE.Mesh;
      ringMat: THREE.MeshBasicMaterial;
      pitMat: THREE.MeshStandardMaterial;
    }[] = [];
    if (!showcase) {
      // A disc sitting just above the soil reads as a pit from this camera
      // angle; a real cylinder would be buried inside the tile mesh.
      const pitGeo = track(new THREE.CircleGeometry(0.36, 20));
      pitGeo.rotateX(-Math.PI / 2);
      const innerGeo = track(new THREE.CircleGeometry(0.22, 16));
      innerGeo.rotateX(-Math.PI / 2);
      const lipGeo = track(new THREE.RingGeometry(0.33, 0.44, 18));
      lipGeo.rotateX(-Math.PI / 2);
      const rimGeo2 = track(new THREE.TorusGeometry(0.38, 0.035, 5, 20));
      rimGeo2.rotateX(Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const root = new THREE.Group();
        const pitMat = new THREE.MeshStandardMaterial({
          color: 0x140d0a,
          roughness: 1,
          metalness: 0,
          side: THREE.FrontSide,
        });
        const pit = new THREE.Mesh(pitGeo, pitMat);
        pit.position.y = UNIT_GROUND + 0.002;
        root.add(pit);

        const inner = new THREE.Mesh(
          innerGeo,
          new THREE.MeshBasicMaterial({ color: 0x050303, depthWrite: false })
        );
        inner.position.y = UNIT_GROUND + 0.007;
        root.add(inner);

        const lipMat = new THREE.MeshBasicMaterial({
          color: 0x3a241c,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        const lip = new THREE.Mesh(lipGeo, lipMat);
        lip.position.y = UNIT_GROUND + 0.012;
        lip.renderOrder = 2;
        root.add(lip);

        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xe8a0a8,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        const ring = new THREE.Mesh(rimGeo2, ringMat);
        ring.position.y = UNIT_GROUND + 0.018;
        ring.renderOrder = 3;
        root.add(ring);

        root.visible = false;
        scene.add(root);
        holePool.push({ root, ring, ringMat, pitMat });
      }
    }

    /* ── Projectiles: layered shells with stretched trails, halos, impacts ── */
    const PROJ_N = 90;
    const TRAIL = 5; // head bead + 4 trailing beads per shell
    const ACID_TRAIL = [0xbaff7a, 0x6ee05a, 0x3fa34d, 0x2a6e35];
    const BURST_TRAIL = [0xffb347, 0xff8a3d, 0xe05a2a, 0x8a2a16];
    const projGeo = track(new THREE.IcosahedronGeometry(V * 2.1, 0));
    const projMat = track(
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    const projMesh = new THREE.InstancedMesh(projGeo, projMat, PROJ_N);
    projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    projMesh.frustumCulled = false;
    projMesh.count = 0;
    const projCol = new THREE.Color();
    if (!showcase) scene.add(projMesh);

    const HALO_N = 18;
    const haloGeo = track(new THREE.IcosahedronGeometry(V * 4.8, 1));
    const haloMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, HALO_N);
    haloMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    haloMesh.frustumCulled = false;
    haloMesh.count = 0;
    haloMesh.renderOrder = 6;
    if (!showcase) scene.add(haloMesh);

    const projTmp = new THREE.Vector3();
    const projScale = new THREE.Vector3();
    const projQuat = new THREE.Quaternion();
    const projDir = new THREE.Vector3();
    const Z_AXIS = new THREE.Vector3(0, 0, 1);
    const shotProg = new Map<number, number>(); // shot id -> last rendered progress

    function updateProjectiles(b: BattleState | null, time: number) {
      if (showcase) return;
      if (!b || !b.shots.length) {
        if (projMesh.count !== 0) projMesh.count = 0;
        if (haloMesh.count !== 0) haloMesh.count = 0;
        if (shotProg.size) shotProg.clear();
        return;
      }
      let n = 0;
      let hn = 0;
      for (const sh of b.shots) {
        const p = Math.min(1, Math.max(0, (b.t - sh.t0) / sh.dur));
        const burst = sh.kind === "burst";
        // detonation the instant a shell completes its flight
        const prev = shotProg.get(sh.id) ?? 0;
        if (p >= 1 && prev < 1) {
          spawnRing(sh.x1, sh.y1, burst ? 0xff8a3d : 0xbaff7a);
          if (burst) {
            spawnBurst(sh.x1, 0.3, sh.y1, 0xff8a3d, 10, 2.2);
            spawnBurst(sh.x1, 0.44, sh.y1, 0xffe08a, 6, 1.6);
          } else {
            spawnBurst(sh.x1, 0.28, sh.y1, 0xbaff7a, 7, 1.7);
            spawnBurst(sh.x1, 0.38, sh.y1, 0x6ee05a, 4, 1.1);
          }
        }
        shotProg.set(sh.id, p);

        const arcH = burst ? 0.92 : 0.72;
        const sizeMul = sh.size || 1;
        const dx = sh.x1 - sh.x0;
        const dz = sh.y1 - sh.y0;
        // velocity direction (xz travel + arc slope) stretches the trail beads
        projDir.set(dx, Math.cos(p * Math.PI) * Math.PI * arcH, dz);
        if (projDir.lengthSq() < 1e-6) projDir.set(0, 1, 0);
        else projDir.normalize();
        projQuat.setFromUnitVectors(Z_AXIS, projDir);

        const pulse = 1 + Math.sin(time * 26 + sh.id * 2.1) * 0.09;
        const trailCols = burst ? BURST_TRAIL : ACID_TRAIL;
        for (let k = TRAIL - 1; k >= 0; k--) {
          if (n >= PROJ_N) break;
          const pk = Math.max(0, p - k * 0.042);
          const x = sh.x0 + dx * pk;
          const z = sh.y0 + dz * pk;
          const y = UNIT_GROUND + 0.26 + Math.sin(pk * Math.PI) * arcH;
          const head = k === 0;
          const s =
            (head ? (burst ? 1.6 : 1.1) : 0.9 - k * 0.15) *
            sizeMul *
            (head ? pulse : 1) *
            (1 - pk * 0.1);
          projTmp.set(x, y, z);
          if (head) projScale.setScalar(Math.max(0.05, s));
          else projScale.set(s * 0.75, s * 0.75, Math.max(0.05, s * 1.9));
          m4.compose(projTmp, head ? q0 : projQuat, projScale);
          projMesh.setMatrixAt(n, m4);
          projCol.setHex(head ? (burst ? 0xffe08a : 0xd8ff7a) : trailCols[k - 1]);
          projMesh.setColorAt(n, projCol);
          n++;
        }
        // additive halo breathing around the shell head
        if (hn < HALO_N) {
          const x = sh.x0 + dx * p;
          const z = sh.y0 + dz * p;
          const y = UNIT_GROUND + 0.26 + Math.sin(p * Math.PI) * arcH;
          projTmp.set(x, y, z);
          projScale.setScalar(
            (burst ? 1.5 : 1.05) * sizeMul * (1 + Math.sin(time * 18 + sh.id) * 0.12)
          );
          m4.compose(projTmp, q0, projScale);
          haloMesh.setMatrixAt(hn, m4);
          haloMesh.setColorAt(hn, projCol.setHex(burst ? 0xff9a3d : 0x8ae05a));
          hn++;
        }
      }
      for (const id of Array.from(shotProg.keys())) {
        if (!b.shots.some((sh) => sh.id === id)) shotProg.delete(id);
      }
      projMesh.count = n;
      projMesh.instanceMatrix.needsUpdate = true;
      if (projMesh.instanceColor) projMesh.instanceColor.needsUpdate = true;
      haloMesh.count = hn;
      haloMesh.instanceMatrix.needsUpdate = true;
      if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
    }

    /**
     * Procedural caustic texture for the Airstrike field. Canvas-generated,
     * so the build stays image-free: a soft radial falloff plus two octaves
     * of speckle that reads as disturbed soil under an energy field.
     */
    function makeFieldTexture() {
      const size = 128;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, "rgba(255,255,255,0.95)");
      grd.addColorStop(0.55, "rgba(255,255,255,0.45)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 340; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.6) * (size / 2);
        const x = size / 2 + Math.cos(a) * r;
        const y = size / 2 + Math.sin(a) * r;
        const rr = 1 + Math.random() * 3.2;
        g.beginPath();
        g.arc(x, y, rr, 0, Math.PI * 2);
        g.fillStyle = `rgba(0,0,0,${0.16 + Math.random() * 0.4})`;
        g.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    const fieldTex = showcase ? null : makeFieldTexture();
    if (fieldTex) disposables.push(fieldTex);

    // Airstrike has no flying effect object: only the real Dragonfly flies.
    // These meshes are ground-only wake decals left after it touches down.
    const ZONE_POOL = 12;
    const ARC_SEGMENTS = 64;
    const ZONE_RIPPLES = 3;
    const ZONE_MOTES = 14;
    const zonePool: {
      root: THREE.Group;
      disc: THREE.Mesh;
      discMat: THREE.MeshBasicMaterial;
      /** expanding shock ripples that loop for the field's whole life */
      ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[];
      /** motes rising off the energised soil */
      motes: THREE.Points;
      moteGeo: THREE.BufferGeometry;
      moteBase: Float32Array;
      ring: THREE.Mesh;
      ringMat: THREE.MeshBasicMaterial;
      arc: THREE.Mesh;
      arcMat: THREE.MeshBasicMaterial;
      ticks: THREE.Mesh[];
      tickMat: THREE.MeshBasicMaterial;
      /** scratch space so the motes never allocate per frame */
      moteScratch: Float32Array;
    }[] = [];
    if (!showcase) {
      const discGeo = track(new THREE.CircleGeometry(1, 32));
      discGeo.rotateX(-Math.PI / 2);
      const rippleGeo = track(new THREE.RingGeometry(0.62, 0.7, 30));
      rippleGeo.rotateX(-Math.PI / 2);
      const ringGeo = track(new THREE.RingGeometry(0.92, 1, 32));
      ringGeo.rotateX(-Math.PI / 2);
      const arcGeo = track(new THREE.RingGeometry(0.78, 0.88, ARC_SEGMENTS));
      arcGeo.rotateX(-Math.PI / 2);
      const tickGeo = track(new THREE.BoxGeometry(0.16, 0.012, 0.05));
      for (let i = 0; i < ZONE_POOL; i++) {
        const root = new THREE.Group();
        root.name = "airstrike-ground-wake";
        const discMat = track(new THREE.MeshBasicMaterial({
          color: 0x2ec9e0, transparent: true, opacity: 0.22,
          map: fieldTex ?? undefined, depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.y = UNIT_GROUND + 0.004;
        root.add(disc);
        // Expanding ripples radiate outward from the impact point for the
        // field's whole life — the soil is visibly still charged.
        const ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
        for (let r = 0; r < ZONE_RIPPLES; r++) {
          const mat = track(new THREE.MeshBasicMaterial({
            color: 0xbdf8ff, transparent: true, opacity: 0,
            depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          }));
          const mesh = new THREE.Mesh(rippleGeo, mat);
          mesh.position.y = UNIT_GROUND + 0.012 + r * 0.0035;
          mesh.visible = false;
          root.add(mesh);
          ripples.push({ mesh, mat });
        }
        // Motes drift up off the field, like dust lifted by the charge.
        const moteBase = new Float32Array(ZONE_MOTES * 3);
        const motePos = new Float32Array(ZONE_MOTES * 3);
        for (let m = 0; m < ZONE_MOTES; m++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * 0.8;
          moteBase[m * 3] = Math.cos(a) * rr;
          moteBase[m * 3 + 1] = Math.random();
          moteBase[m * 3 + 2] = Math.sin(a) * rr;
        }
        const moteGeo = new THREE.BufferGeometry();
        moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
        const moteMat = track(new THREE.PointsMaterial({
          color: 0xd6faff, size: 0.055, transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending,
          map: dot, sizeAttenuation: true,
        }));
        const motes = new THREE.Points(moteGeo, moteMat);
        motes.frustumCulled = false;
        motes.visible = false;
        root.add(motes);
        const ringMat = track(new THREE.MeshBasicMaterial({
          color: 0xbdf8ff, transparent: true, opacity: 0.9,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = UNIT_GROUND + 0.010;
        root.add(ring);
        const arcMat = track(new THREE.MeshBasicMaterial({
          color: 0x75d9e8, transparent: true, opacity: 0.85,
          depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }));
        // Each arc owns a draw range; never rebuild/dispose geometry per frame.
        const arc = new THREE.Mesh(track(arcGeo.clone()), arcMat);
        arc.position.y = UNIT_GROUND + 0.014;
        root.add(arc);
        const tickMat = track(new THREE.MeshBasicMaterial({ color: 0xe6ffff, transparent: true, opacity: 0.9 }));
        const ticks: THREE.Mesh[] = [];
        for (let k = 0; k < 4; k++) {
          const tick = new THREE.Mesh(tickGeo, tickMat);
          const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
          tick.position.set(Math.cos(ang) * 0.82, UNIT_GROUND + 0.018, Math.sin(ang) * 0.82);
          tick.rotation.y = -ang;
          root.add(tick);
          ticks.push(tick);
        }
        root.visible = false;
        root.renderOrder = 4;
        scene.add(root);
        zonePool.push({
          root, disc, discMat, ripples, motes, moteGeo, moteBase,
          ring, ringMat, arc, arcMat, ticks, tickMat,
          moteScratch: new Float32Array(ZONE_MOTES * 3),
        });
      }
    }
    const moteScratchShared = new Float32Array(3);
    const visibleFields: Zone[] = [];
    const approachingFlyers: BUnit[] = [];
    const landedZoneIds = new Set<number>();
    let zoneBattle: BattleState | null = null;

    function updateZones(b: BattleState | null, time: number, visualTime: number) {
      if (showcase || !zonePool.length) return;
      if (zoneBattle !== b) {
        zoneBattle = b;
        landedZoneIds.clear();
      }
      visibleFields.length = 0;
      approachingFlyers.length = 0;
      if (b) {
        for (const z of b.zones) if (z.createdAt <= visualTime && z.expiresAt > visualTime) visibleFields.push(z);
        for (const unit of b.units) {
          if (unit.dive && !unit.dead && visualTime < unit.dive.startAt + unit.dive.duration) approachingFlyers.push(unit);
        }
      }
      for (let i = 0; i < zonePool.length; i++) {
        const g = zonePool[i];
        const z = visibleFields[i];
        const flyer = i >= visibleFields.length ? approachingFlyers[i - visibleFields.length] : undefined;
        const dive = flyer?.dive;
        if (!z && !dive) {
          g.root.visible = false;
          g.motes.visible = false;
          continue;
        }
        g.root.visible = true;
        const enemy = (z?.owner ?? flyer?.side) === "foe";
        const radius = z?.radius ?? AIRSTRIKE_RADIUS;
        g.root.position.set(z?.x ?? dive!.toX, 0, z?.y ?? dive!.toY);
        g.root.scale.set(radius, 1, radius);
        const accentC = enemy ? 0xff5a3c : 0x2ec9e0;
        const brightC = enemy ? 0xffb0a0 : 0xbdf8ff;
        g.ringMat.color.setHex(brightC);
        g.discMat.color.setHex(accentC);
        g.arcMat.color.setHex(enemy ? 0xff7a5a : 0x75d9e8);
        if (z) {
          if (!landedZoneIds.has(z.id)) {
            landedZoneIds.add(z.id);
            spawnRing(z.x, z.y, enemy ? 0xff7a5a : 0x75d9e8);
            spawnBurst(z.x, 0.08, z.y, enemy ? 0xff7a5a : 0xbdf8ff, 9, 1.25);
          }
          const age = visualTime - z.createdAt;
          const remaining = Math.max(0, z.expiresAt - visualTime);
          const fraction = remaining / AIRSTRIKE_SECONDS;
          const slam = Math.max(0, 1 - age * 5);
          const beat = Math.max(0, 1 - (age % 1) * 5);
          g.disc.scale.setScalar(1);
          g.ring.scale.setScalar(1 + slam * 0.12);
          g.arc.scale.setScalar(1);
          g.discMat.opacity = 0.13 + slam * 0.13 + beat * 0.1;
          g.ringMat.opacity = 0.55 + beat * 0.3;
          g.arc.geometry.setDrawRange(0, Math.ceil(ARC_SEGMENTS * fraction) * 6);
          g.arcMat.opacity = 0.7;
          g.tickMat.opacity = 0.4 + beat * 0.6;
          (g.motes.material as THREE.PointsMaterial).color.setHex(brightC);
          (g.motes.material as THREE.PointsMaterial).opacity =
            0.25 + beat * 0.4 + (z.ticks > 0 ? 0.15 : 0);
          g.motes.visible = true;
          // Motes rise, drift outward, respawn at the soil — cheap sine motion
          // against a cached base, so nothing allocates per frame.
          const pos = g.moteGeo.attributes.position.array as Float32Array;
          for (let m = 0; m < ZONE_MOTES; m++) {
            const bx = g.moteBase[m * 3];
            const bz = g.moteBase[m * 3 + 2];
            const seed = g.moteBase[m * 3 + 1];
            const rise = ((seed + time * (0.22 + seed * 0.3)) % 1);
            moteScratchShared[0] = bx * (1 + rise * 0.5) + Math.sin(time * 1.6 + seed * 12) * 0.05;
            moteScratchShared[1] = rise * 0.5;
            moteScratchShared[2] = bz * (1 + rise * 0.5) + Math.cos(time * 1.4 + seed * 9) * 0.05;
            pos[m * 3] = moteScratchShared[0];
            pos[m * 3 + 1] = moteScratchShared[1];
            pos[m * 3 + 2] = moteScratchShared[2];
          }
          g.moteGeo.attributes.position.needsUpdate = true;
          // Ripples: three rings expanding on a staggered loop, fading to
          // nothing at the field boundary.
          for (let r = 0; r < ZONE_RIPPLES; r++) {
            const rp = g.ripples[r];
            const cycle = ((time * 0.55 + r / ZONE_RIPPLES) % 1);
            rp.mesh.scale.setScalar(0.35 + cycle * 0.66);
            rp.mat.opacity = (1 - cycle) * 0.4;
            rp.mesh.visible = true;
          }
        } else {
          const progress = Math.max(0, Math.min(1, (visualTime - dive!.startAt) / dive!.duration));
          const scale = 1.18 - progress * 0.18;
          g.disc.scale.setScalar(scale);
          g.ring.scale.setScalar(scale);
          g.arc.scale.setScalar(scale);
          g.arc.geometry.setDrawRange(0, ARC_SEGMENTS * 6);
          g.discMat.opacity = 0.025;
          g.ringMat.opacity = 0.25 + progress * 0.35;
          g.arcMat.opacity = 0.2;
          g.tickMat.opacity = 0.4 + Math.sin(time * 8) * 0.2;
          g.motes.visible = false;
          for (const rp of g.ripples) rp.mesh.visible = false;
        }
      }
    }

    const seenHoles = new Set<number>();
    function updateHoles(b: BattleState | null) {
      if (showcase) return;
      const holes = b?.holes ?? [];
      if (!b) {
        // battle over — hole ids restart at 1 next battle, so forget them
        if (seenHoles.size) seenHoles.clear();
      } else {
        for (const id of Array.from(seenHoles)) {
          if (!holes.some((h) => h.id === id)) seenHoles.delete(id);
        }
      }
      for (let i = 0; i < holePool.length; i++) {
        const hp = holePool[i];
        const h = holes[i];
        if (!h) {
          if (hp.root.visible) hp.root.visible = false;
          continue;
        }
        if (!seenHoles.has(h.id)) {
          seenHoles.add(h.id);
          // the soil erupts as the worm breaks through
          spawnBurst(h.x, 0.1, h.y, 0x4a3324, 10, 1.8);
          spawnBurst(h.x, 0.16, h.y, 0x8a6a4a, 6, 1.2);
          spawnRing(h.x, h.y, 0xe8a0a8);
        }
        hp.root.visible = true;
        hp.root.position.set(h.x, 0, h.y);
        const charge = h.armed ? 1 : Math.max(0, Math.min(1, 1 - h.arm / 0.9));
        hp.root.rotation.y += 0.012;
        hp.root.scale.setScalar(0.55 + charge * 0.45);
        hp.ringMat.opacity = h.armed
          ? 0.55 + Math.sin(t * 5.5) * 0.3
          : 0.2 + charge * 0.45;
        hp.ringMat.color.setHex(h.armed ? 0xe8a0a8 : 0x8a5560);
        hp.pitMat.color.setHex(h.armed ? 0x0d0908 : 0x1a100c);
      }
    }

    /* ── Camera Framing ── */
    const fitW = showcase ? 4.8 : 7.85;
    const fitH = showcase ? 2.55 : 7.35;
    const elev = showcase ? 0.36 : 0.84;
    let camDist = 11;
    // Fit distance for the current viewport. Entering a battle swaps the dock
    // and resizes the stage mid-session; tick() eases the real distance toward
    // this target so the reframing glides instead of jolting the camera.
    let camDistTarget = 11;
    // ── Adaptive resolution ──
    // Sustained slow frames (EMA of frame time) step the render scale down;
    // sustained headroom steps it back up. Keeps the scene smooth on weak
    // GPUs instead of dropping to a slideshow.
    const baseDpr = renderer.getPixelRatio();
    let pxScale = 1;
    let ftEma = 16.7;
    let ftWarmup = 0;
    let qualityClock = 0;
    let shadowFlip = 0;
    // Flips once init completes. After that, frame() repaints immediately
    // after every canvas resize — resizing a WebGL buffer clears it, and
    // without this repaint the cleared frame shows as a dark flash exactly
    // when the prep dock hands over to the battle dock.
    let sceneReady = false;

    function frame() {
      W = hostEl.clientWidth || 360;
      H = hostEl.clientHeight || 280;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      const vFov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      camDistTarget = Math.max(fitH / 2 / Math.tan(vFov / 2), fitW / 2 / Math.tan(hFov / 2));
      camera.updateProjectionMatrix();
      if (sceneReady) renderer.render(scene, camera);
    }
    frame();

    const ro = new ResizeObserver(() => frame());
    ro.observe(hostEl);

    /* ── Commander Totems ── */
    function syncTotems(cmdAId: string, cmdBId: string) {
      if (showcase) return;
      if (totemState.allyId !== cmdAId && totemState.allyHolder) {
        totemState.allyModel?.dispose();
        totemState.allyHolder.clear();
        const m = buildVoxelModel(cmdAId, 1);
        m.group.scale.setScalar(0.56);
        totemState.allyHolder.add(m.group);
        totemState.allyModel = m;
        totemState.allyId = cmdAId;
      }
      if (totemState.foeId !== cmdBId && totemState.foeHolder) {
        totemState.foeModel?.dispose();
        totemState.foeHolder.clear();
        const m = buildVoxelModel(cmdBId, 1);
        m.group.scale.setScalar(0.56);
        totemState.foeHolder.add(m.group);
        totemState.foeModel = m;
        totemState.foeId = cmdBId;
      }
    }

    /* ── Units & Rings ── */
    const units = new Map<number, UnitObj>();
    const popEls = new Map<number, HTMLElement>();
    const ringPool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
    const flashPool: {
      sprite: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      life: number;
      max: number;
      scale: number;
    }[] = [];
    const sharedRingGeo = track(new THREE.RingGeometry(0.2, 0.3, 22));

    /** A single bright bloom that swells and dies — the flash of an impact. */
    function spawnFlash(x: number, y: number, z: number, color: number, scale = 1.6) {
      const mat = new THREE.SpriteMaterial({
        map: dot, color, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(scale * 0.4);
      scene.add(sprite);
      flashPool.push({ sprite, mat, life: 0.26, max: 0.26, scale });
    }

    /* ── Realistic landing kit ────────────────────────────────
       A real strike throws a *volume* of soil, not a outline. Three pooled
       layers, all allocated once:
         • dust   — soft camera-facing puffs that billow, drag and settle
         • wall   — a short cylindrical shock front that expands and drops
         • scar   — a procedural scorch + crack decal that lingers on the soil
       Every pool is fixed-size and reused, so a landing never allocates. */
    const DUST_N = isCompact ? 22 : 34;
    const dustTexture = dotTexture("rgba(246,232,208,1)", "rgba(246,232,208,0)");
    disposables.push(dustTexture);
    type Puff = {
      sprite: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      life: number;
      max: number;
      vx: number;
      vy: number;
      vz: number;
      size: number;
      grow: number;
    };
    const dustPool: Puff[] = [];
    for (let i = 0; i < DUST_N; i++) {
      const mat = new THREE.SpriteMaterial({
        map: dustTexture, color: 0xcbb596, transparent: true, opacity: 0,
        depthWrite: false, depthTest: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 7;
      scene.add(sprite);
      dustPool.push({ sprite, mat, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.2, grow: 0.6 });
    }
    let dustCursor = 0;

    function spawnDust(x: number, z: number, count: number, tint: number, power = 1) {
      for (let i = 0; i < count; i++) {
        const p = dustPool[dustCursor];
        dustCursor = (dustCursor + 1) % DUST_N;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.28;
        p.sprite.position.set(x + Math.cos(a) * r, 0.05 + Math.random() * 0.12, z + Math.sin(a) * r);
        p.vx = Math.cos(a) * (0.35 + Math.random() * 1.15) * power;
        p.vz = Math.sin(a) * (0.35 + Math.random() * 1.15) * power;
        p.vy = (0.28 + Math.random() * 0.5) * power;
        p.max = 0.9 + Math.random() * 0.9;
        p.life = p.max;
        p.size = 0.22 + Math.random() * 0.2;
        p.grow = 0.9 + Math.random() * 0.85;
        p.vy = (0.2 + Math.random() * 0.42) * power;
        p.mat.color.setHex(tint);
        p.sprite.visible = true;
      }
    }

    function updateDust(dt: number) {
      for (const p of dustPool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.sprite.visible = false;
          p.mat.opacity = 0;
          continue;
        }
        const age = 1 - p.life / p.max;
        const drag = Math.exp(-dt * 2.6);
        p.vx *= drag;
        p.vz *= drag;
        p.vy = p.vy * drag - dt * 0.18; // settle, don't accelerate away
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y = Math.max(0.04, p.sprite.position.y + p.vy * dt);
        p.sprite.position.z += p.vz * dt;
        // Billowing: fast early growth, easing out, so it reads as air not rock.
        const ease = 1 - Math.pow(1 - age, 2.2);
        p.sprite.scale.setScalar(p.size + p.grow * ease);
        p.mat.opacity = Math.pow(1 - age, 1.25) * 0.66;
      }
    }

    /* Shock front: an open cylinder — a wall of pressure, not a line. */
    const WALL_N = 4;
    const wallGeo = track(new THREE.CylinderGeometry(1, 1, 1, 30, 1, true));
    const walls: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
    for (let i = 0; i < WALL_N; i++) {
      const mat = track(new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const mesh = new THREE.Mesh(wallGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      walls.push({ mesh, mat, life: 0 });
    }
    let wallCursor = 0;

    function spawnWall(x: number, z: number, tint: number) {
      const w = walls[wallCursor];
      wallCursor = (wallCursor + 1) % WALL_N;
      w.mesh.position.set(x, 0.2, z);
      w.mesh.scale.set(0.3, 0.4, 0.3);
      w.mat.color.setHex(tint);
      w.life = 0.6;
      w.mesh.visible = true;
    }

    function updateWalls(dt: number) {
      for (const w of walls) {
        if (w.life <= 0) continue;
        w.life -= dt;
        const t = 1 - Math.max(0, w.life) / 0.6;
        const ease = 1 - Math.pow(1 - t, 3);
        const radius = 0.3 + ease * 1.65;
        w.mesh.scale.set(radius, 0.42 * (1 - ease * 0.92), radius);
        w.mesh.position.y = 0.21 * (1 - ease * 0.92);
        w.mat.opacity = (1 - ease) * 0.55;
        if (w.life <= 0) w.mesh.visible = false;
      }
    }

    /* Scorch scar with radial cracks — procedural, so no texture files. */
    function makeScarTexture() {
      const size = 256;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d")!;
      const cx = size / 2;
      const cy = size / 2;
      const soot = g.createRadialGradient(cx, cy, 6, cx, cy, size / 2);
      soot.addColorStop(0, "rgba(12,8,6,0.92)");
      soot.addColorStop(0.45, "rgba(26,17,12,0.72)");
      soot.addColorStop(1, "rgba(26,17,12,0)");
      g.fillStyle = soot;
      g.fillRect(0, 0, size, size);
      // radial cracks: jagged, uneven length, thin bright rim on one side
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + Math.random() * 0.35;
        let r = 8 + Math.random() * 10;
        let x = cx + Math.cos(a) * r;
        let y = cy + Math.sin(a) * r;
        g.beginPath();
        g.moveTo(x, y);
        const segments = 3 + Math.floor(Math.random() * 3);
        for (let sIdx = 0; sIdx < segments; sIdx++) {
          const wobble = (Math.random() - 0.5) * 0.55;
          r += 12 + Math.random() * 22;
          x = cx + Math.cos(a + wobble) * r;
          y = cy + Math.sin(a + wobble) * r;
          g.lineTo(x, y);
        }
        g.strokeStyle = "rgba(8,5,4,0.9)";
        g.lineWidth = 2.4 + Math.random() * 2.4;
        g.stroke();
        g.strokeStyle = "rgba(200,170,130,0.22)";
        g.lineWidth = 0.9;
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    const scarTex = showcase ? null : makeScarTexture();
    if (scarTex) disposables.push(scarTex);
    const SCAR_N = 3;
    const scars: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
    for (let i = 0; i < SCAR_N; i++) {
      const mat = track(new THREE.MeshBasicMaterial({
        map: scarTex ?? undefined, transparent: true, opacity: 0,
        depthWrite: false,
      }));
      const geo = track(new THREE.PlaneGeometry(2.9, 2.9));
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = UNIT_GROUND + 0.0045;
      mesh.renderOrder = 2;
      mesh.visible = false;
      scene.add(mesh);
      scars.push({ mesh, mat, life: 0 });
    }
    let scarCursor = 0;

    function spawnScar(x: number, z: number) {
      const sc = scars[scarCursor];
      scarCursor = (scarCursor + 1) % SCAR_N;
      sc.mesh.position.set(x, UNIT_GROUND + 0.0045, z);
      sc.mesh.rotation.y = Math.random() * Math.PI;
      sc.life = 2.6;
      sc.mesh.visible = true;
    }

    function updateScars(dt: number) {
      for (const sc of scars) {
        if (sc.life <= 0) continue;
        sc.life -= dt;
        const t = Math.max(0, sc.life / 2.6);
        // Snap in on impact, then fade slowly back into the soil.
        sc.mat.opacity = Math.min(1, (1 - t) * 8) * Math.min(1, t * 2.2) * 0.95;
        if (sc.life <= 0) sc.mesh.visible = false;
      }
    }

    function spawnRing(x: number, z: number, color: number) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(sharedRingGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.032, z);
      scene.add(mesh);
      ringPool.push({ mesh, mat, life: 0.58 });
    }

    function makeTag() {
      const el = document.createElement("div");
      el.className = "ov-unit";
      el.innerHTML =
        '<div class="ov-bars"><div class="ov-hp"><i></i></div><div class="ov-mana"><i></i></div></div>' +
        '<div class="ov-pips"></div><div class="ov-name"></div>';
      ovEl.appendChild(el);
      return {
        el,
        hpEl: el.querySelector(".ov-hp i") as HTMLElement,
        manaEl: el.querySelector(".ov-mana i") as HTMLElement,
        pipsEl: el.querySelector(".ov-pips") as HTMLElement,
        nameEl: el.querySelector(".ov-name") as HTMLElement,
      };
    }

    function ensureUnit(uid: number, id: string, star: number, side: "ally" | "foe", x: number, y: number, cd: number): UnitObj {
      let u = units.get(uid);
      if (u && u.id === id && u.star === star) {
        u.side = side;
        return u;
      }
      const hadPrev = !u;
      if (u) killUnit(uid);

      const model = buildVoxelModel(id, star);
      const holder = new THREE.Group();
      const inner = new THREE.Group();
      const sc = star === 3 ? 0.96 : star === 2 ? 0.84 : 0.74;
      model.group.scale.setScalar(sc);
      inner.add(model.group);
      holder.add(inner);
      holder.position.set(x, UNIT_GROUND, y);
      holder.rotation.y = side === "ally" ? 0 : Math.PI;
      holder.name = `unit:${id}:${uid}`;
      inner.name = "unit-flight-transform";
      scene.add(holder);

      // Ground shadow: a soft dark blob tracking the unit's x/z, fading with
      // altitude. Strongest single cue that something is genuinely airborne
      // rather than sliding across the tiles.
      const shadowGeo = new THREE.CircleGeometry(0.46, 20);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadow = new THREE.Mesh(
        shadowGeo,
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }),
      );
      shadow.position.y = UNIT_GROUND + 0.0035;
      shadow.renderOrder = 2;
      scene.add(shadow);

      // Wing-blur disc: a real dragonfly beats ~30x/s, so the eye reads a
      // translucent shimmer where the wings are rather than four blades.
      const blurGeo = new THREE.RingGeometry(0.1, 0.42, 24, 1);
      blurGeo.rotateX(-Math.PI / 2);
      const blurDisc = new THREE.Mesh(
        blurGeo,
        new THREE.MeshBasicMaterial({
          color: 0xd6faff, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }),
      );
      blurDisc.position.y = 7 * V; // wing plane height from the voxel sculpt
      blurDisc.visible = false;
      inner.add(blurDisc);

      if (hadPrev && star > 1) {
        spawnRing(x, y, 0xf0a93b);
      }

      let ring: THREE.Mesh | null = null;
      if (star > 1) {
        const rm = new THREE.MeshBasicMaterial({
          color: star === 3 ? 0xfff0c0 : 0xf0a93b,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        ring = new THREE.Mesh(sharedRingGeo, rm);
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(sc * 1.45);
        ring.position.y = 0.018;
        holder.add(ring);
      }

      const tag = makeTag();
      tag.el.dataset.species = id;
      tag.el.dataset.unitId = String(uid);
      tag.el.dataset.side = side;
      tag.el.dataset.flightPhase = "grounded";
      u = {
        uid,
        id,
        star,
        side,
        model,
        holder,
        inner,
        ring,
        rotY: side === "ally" ? 0 : Math.PI,
        bob: (uid * 1.7) % 6,
        lunge: 0,
        deadT: 0,
        prevCast: 0,
        prevCd: cd,
        shadow,
        blurDisc,
        prevPhase: "grounded" as FlightPhase | "grounded",
        streakClock: 0,
        spawnT: document.documentElement.dataset.motion === "reduced" ? 1 : 0,
        activeDiveId: null,
        scale: sc,
        ...tag,
        lx: -999,
        ly: -999,
        lhp: -1,
        lmana: -1,
        lvis: -1,
        lsel: false,
        lfoe: false,
        lbattle: false,
        lname: "",
        lpips: "",
        lvuln: false,
      };
      units.set(uid, u);
      return u;
    }

    function killUnit(uid: number) {
      const u = units.get(uid);
      if (!u) return;
      scene.remove(u.holder);
      scene.remove(u.shadow);
      u.shadow.geometry.dispose();
      (u.shadow.material as THREE.Material).dispose();
      u.blurDisc.geometry.dispose();
      (u.blurDisc.material as THREE.Material).dispose();
      void u.prevPhase;
      (u.ring?.material as THREE.Material | undefined)?.dispose();
      u.model.dispose();
      u.el.remove();
      units.delete(uid);
    }

    /* ── Input ── */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const parallax = new THREE.Vector2(0, 0);
    const parallaxTarget = new THREE.Vector2(0, 0);

    let dragStartX = 0;
    let dragStartY = 0;
    let isDragging = false;
    let dragMoved = false;
    let dragBaseSpin = 0;
    // Hover raycasts are throttled to ~30Hz — gaming mice fire 1000Hz
    // pointermove storms and each raycast traverses every unit sculpt.
    let lastHoverCast = 0;

    function setNdc(clientX: number, clientY: number) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }

    function pickUnit(): number | null {
      const groups = Array.from(units.values()).map((u) => u.model.group);
      if (!groups.length) return null;
      const hits = ray.intersectObjects(groups, true);
      if (!hits.length) return null;
      let found: number | null = null;
      let hitObj: THREE.Object3D | null = hits[0].object;
      while (hitObj && hitObj.parent) {
        for (const [uid, u] of units) {
          if (u.model.group === hitObj) {
            found = uid;
            break;
          }
        }
        if (found != null) break;
        hitObj = hitObj.parent;
      }
      return found;
    }

    function cellFromRay(): { col: number; row: number } | null {
      if (!ray.ray.intersectPlane(groundPlane, hitPoint)) return null;
      const col = Math.floor(hitPoint.x);
      const row = Math.floor(hitPoint.z);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
      return { col, row };
    }

    const onDown = (e: PointerEvent) => {
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      isDragging = true;
      dragMoved = false;
      dragBaseSpin = userSpinOffset;

      if (showcase) return;
      setNdc(e.clientX, e.clientY);
      const p = P.current;
      const uid = pickUnit();
      if (uid != null) {
        p.onUnit?.(uid);
        return;
      }
      if (p.mode !== "prep" || !p.interactive) return;
      const c = cellFromRay();
      if (!c || c.row < ALLY_ROW_MIN) return;
      p.onCell?.(c.row * COLS + c.col - ALLY_ROW_MIN * COLS);
    };

    const onMove = (e: PointerEvent) => {
      if (showcase) {
        if (isDragging) {
          const dx = e.clientX - dragStartX;
          if (Math.abs(dx) > 4) dragMoved = true;
          userSpinOffset = dragBaseSpin + dx * 0.011;
        }
        if (e.pointerType === "mouse") {
          const r = renderer.domElement.getBoundingClientRect();
          parallaxTarget.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        }
        return;
      }

      if (e.pointerType === "mouse") {
        const r = renderer.domElement.getBoundingClientRect();
        parallaxTarget.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const nowMs = performance.now();
        if (nowMs - lastHoverCast < 34) return;
        lastHoverCast = nowMs;
        const p = P.current;
        setNdc(e.clientX, e.clientY);
        if (p.mode === "prep" && p.interactive) {
          const c = cellFromRay();
          if (c && c.row >= ALLY_ROW_MIN) {
            hoverSlot = c.row * COLS + c.col - ALLY_ROW_MIN * COLS;
            if (hoverMeshRef.mesh) {
              hoverMeshRef.mesh.visible = true;
              hoverMeshRef.mesh.position.set(c.col + 0.5, 0.025, c.row + 0.5);
            }
            renderer.domElement.style.cursor = "pointer";
            return;
          }
        }
        hoverSlot = -1;
        if (hoverMeshRef.mesh) hoverMeshRef.mesh.visible = false;
        renderer.domElement.style.cursor = pickUnit() != null ? "pointer" : "default";
      }
    };

    const onUp = (e: PointerEvent) => {
      if (showcase && isDragging && !dragMoved) {
        setNdc(e.clientX, e.clientY);
        const groups = showcaseItems.map((it) => it.model.group);
        const hits = ray.intersectObjects(groups, true);
        if (hits.length > 0) {
          let hitObj: THREE.Object3D | null = hits[0].object;
          let matchedItem: (typeof showcaseItems)[0] | null = null;
          while (hitObj && hitObj.parent) {
            matchedItem = showcaseItems.find((it) => it.model.group === hitObj) || null;
            if (matchedItem) break;
            hitObj = hitObj.parent;
          }
          if (matchedItem) {
            userSpinOffset = 0;
            P.current.onFocusChange?.(matchedItem.id);
          }
        }
      }
      if (showcase && isDragging && dragMoved) {
        let bestId = P.current.focusId || "stag";
        let bestZ = -999;
        for (const it of showcaseItems) {
          const worldA = it.baseAngle + spinAngle;
          const z = Math.cos(worldA);
          if (z > bestZ) {
            bestZ = z;
            bestId = it.id;
          }
        }
        userSpinOffset = 0;
        P.current.onFocusChange?.(bestId);
      }
      isDragging = false;
      if (Math.abs(e.clientY - dragStartY) > 0) dragStartY = 0;
    };

    const onLeave = () => {
      isDragging = false;
      hoverSlot = -1;
      parallaxTarget.set(0, 0);
      if (hoverMeshRef.mesh) hoverMeshRef.mesh.visible = false;
    };

    const el = renderer.domElement;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    /* ── Render Loop ── */
    const proj = new THREE.Vector3();
    const tmpTarget = new THREE.Vector3();
    const muzzle = new THREE.Vector3();
    const sampledFlight = createAirstrikePose();
    const seen = new Set<number>();
    const alivePops = new Set<number>();
    let raf = 0;
    let impactShake = 0;
    let paused = document.hidden;
    let last = performance.now();
    let t = 0;
    let visualBattleTime = 0;
    let clockBattle: BattleState | null = null;

    function updateUnitFrame(
      uid: number,
      id: string,
      star: number,
      side: "ally" | "foe",
      rx: number,
      ry: number,
      hp: number,
      maxHp: number,
      mana: number,
      dead: boolean,
      fade: number,
      cast: number,
      flash: number,
      stun: number,
      vuln: number,
      cd: number,
      battleOn: boolean,
      wantRot: number,
      dt: number,
      dive: AirstrikeDive | null = null,
      battleTime = 0,
    ) {
      seen.add(uid);
      const u = ensureUnit(uid, id, star, side, rx, ry, cd);
      if (u.spawnT < 1) {
        const was = u.spawnT;
        u.spawnT = Math.min(1, u.spawnT + dt * 3.4);
        if (was === 0) {
          // First frame after the sculpt mounted: a small soil puff, plus a
          // brighter welcome when a unit materialises straight into battle.
          if (battleOn) {
            spawnRing(rx, ry, side === "ally" ? 0x4fd3a0 : 0xe0522f);
            spawnDust(rx, ry, isCompact ? 6 : 9, 0xcbb596, 0.8);
          } else {
            spawnDust(rx, ry, 4, 0xbda98a, 0.5);
          }
        }
        // easeOutBack pop: grows in with a tiny overshoot, then rests exactly
        // at the unit's natural scale.
        const k = u.spawnT;
        const back = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
        u.model.group.scale.setScalar(u.scale * (0.18 + 0.82 * back));
      }
      const flight = id === "dragonfly" && dive && !dead
        ? sampleAirstrikeDive(dive, battleTime, sampledFlight)
        : undefined;
      const phaseChanged = (flight?.phase ?? "grounded") !== u.prevPhase;
      if (flight && dive) wantRot = Math.atan2(-(dive.toX - dive.fromX), -(dive.toY - dive.fromY));

      let dRot = wantRot - u.rotY;
      while (dRot > Math.PI) dRot -= Math.PI * 2;
      while (dRot < -Math.PI) dRot += Math.PI * 2;
      u.rotY += dRot * (1 - Math.exp(-dt * 10));

      const px = u.holder.position.x;
      const pz = u.holder.position.z;
      if (flight) {
        // This is the original unit holder. Move the entire articulated
        // Dragonfly through the flight path, rather than drawing a shell.
        u.holder.position.set(flight.x, UNIT_GROUND + flight.height, flight.y);
      } else {
        tmpTarget.set(rx, UNIT_GROUND, ry);
        u.holder.position.lerp(tmpTarget, 1 - Math.exp(-dt * 16));
      }
      const dx = u.holder.position.x - px;
      const dz = u.holder.position.z - pz;
      const moving = dx * dx + dz * dz > 0.0000002 && !dead && !flight;
      u.holder.rotation.y = u.rotY;

      if (moving) u.bob += dt * 14;
      else if (!dead) u.bob += dt * 2.2;

      if (cd > u.prevCd + 0.2) {
        u.lunge = 1;
        // Bombardier discharges from the tail nozzles — flash where the
        // cannons actually are, not at the body centre.
        if (id === "bomb") {
          u.model.torso.updateWorldMatrix(true, false);
          muzzle.set(0, 2.0 * V, 7.4 * V);
          u.model.torso.localToWorld(muzzle);
          spawnBurst(muzzle.x, muzzle.y, muzzle.z, 0xffb347, 7, 1.9);
          spawnBurst(muzzle.x, muzzle.y, muzzle.z, 0xfff0c0, 3, 1.1);
        }
      }
      u.prevCd = cd;
      u.lunge = Math.max(0, u.lunge - dt * 4.5);

      if (cast > 0 && u.prevCast <= 0 && id !== "dragonfly") spawnRing(rx, ry, side === "ally" ? 0x4fd3a0 : 0xe0522f);
      u.prevCast = cast;

      /* ── Dragonfly flight realism ─────────────────────────────
         Every cue below is derived from the same sampler the simulation
         uses, so the effects can never disagree with where the unit is. */
      if (u.shadow) {
        if (flight) {
          // Shadow follows the body across the board, tightens as it nears
          // the soil, and fades out entirely at the top of the climb.
          u.shadow.position.set(u.holder.position.x, UNIT_GROUND + 0.0035, u.holder.position.z);
          const tighten = 1 - flight.height * 0.22;
          u.shadow.scale.setScalar(Math.max(0.35, tighten) * u.scale);
          (u.shadow.material as THREE.MeshBasicMaterial).opacity = flight.shadow * 0.42;
          u.shadow.visible = true;
        } else {
          u.shadow.visible = false;
        }
      }

      if (flight) {
        const blurMat = u.blurDisc.material as THREE.MeshBasicMaterial;
        if (flight.blur > 0.06) {
          // A ~30Hz beat is faster than the eye can resolve, so show a
          // translucent shimmering disc where the wings sweep.
          u.blurDisc.visible = true;
          blurMat.opacity = flight.blur * 0.3;
          u.blurDisc.rotation.y += dt * 46;
          u.blurDisc.scale.setScalar(1 - flight.wingFold * 0.3);
        } else {
          u.blurDisc.visible = false;
        }

        // Takeoff: soil kicked up by the downwash as the wings bite.
        if (phaseChanged && flight.phase === "climb") {
          spawnDust(u.holder.position.x, u.holder.position.z, 7, 0xbda98a, 0.75);
          spawnBurst(u.holder.position.x, UNIT_GROUND + 0.04, u.holder.position.z, 0x8a6a4a, 7, 1.0);
        }

        // Dive: air tearing past the body leaves a condensation streak, and
        // the wings throw off a fine spray as they fold back.
        if (flight.phase === "dive") {
          u.streakClock -= dt;
          if (u.streakClock <= 0) {
            u.streakClock = 0.035;
            const hx = u.holder.position.x;
            const hy = u.holder.position.y;
            const hz = u.holder.position.z;
            spawnBurst(hx, hy + 7 * V, hz, 0xd6faff, 2, 0.55 + flight.streak * 0.85);
            if (flight.streak > 0.75) {
              spawnBurst(hx, hy + 0.05, hz, 0xffffff, 1, 0.4);
            }
          }
        }

        // Touchdown: the actual moment the specimen hits the soil. A
        // shockwave ring, a bloom, a dust plume and chitin debris — all from
        // the unit's real landing coordinates.
        if (phaseChanged && flight.phase === "landing") {
          const lx = u.holder.position.x;
          const lz = u.holder.position.z;
          const tint = side === "ally" ? 0x75d9e8 : 0xff7a5a;
          // 1 — light: bloom + two soft ground glows
          spawnFlash(lx, UNIT_GROUND + 0.26, lz, tint, 2.7);
          // no thin ground ring here: the impact reads as a volume
          // 2 — pressure: a real expanding wall, not an outline
          spawnWall(lx, lz, tint);
          // 3 — matter: billowing soil thrown outward and up
          spawnDust(lx, lz, isCompact ? 14 : 22, 0xcbb596, 1.35);
          spawnDust(lx, lz, 6, 0x8f7a5e, 0.8);
          // a second, slower wave trails the first so the plume keeps breathing
          window.setTimeout(() => {
            if (alive) spawnDust(lx, lz, isCompact ? 6 : 10, 0xb9a488, 0.7);
          }, 130);
          window.setTimeout(() => {
            if (alive) spawnDust(lx, lz, isCompact ? 3 : 6, 0x9c8a70, 0.45);
          }, 300);
          spawnBurst(lx, UNIT_GROUND + 0.05, lz, 0x8a6a4a, 16, 2.1);
          spawnBurst(lx, UNIT_GROUND + 0.2, lz, 0xd6faff, 9, 1.8);
          // 4 — record: scorched soil and radial cracks that outlive the flash
          spawnScar(lx, lz);
          // Physical weight: a short camera impulse, strongest for a 3-star
          // slam. The board rocks once and settles — no continuous wobble.
          impactShake = side === "ally" ? 0.5 : 0.42;
        }
      } else if (u.blurDisc.visible) {
        u.blurDisc.visible = false;
      }
      if (flight) u.prevPhase = flight.phase;
      else if (u.prevPhase !== "grounded") u.prevPhase = "grounded";
      const hop = cast > 0 && id !== "dragonfly" ? Math.sin((1 - cast / 0.55) * Math.PI) * 0.18 : 0;

      const bobY = dead ? 0 : moving ? Math.abs(Math.sin(u.bob)) * 0.048 : Math.sin(u.bob) * 0.012;
      u.inner.position.y = flight ? 0 : bobY + hop;
      u.inner.rotation.x = flight ? flight.pitch : u.inner.rotation.x * Math.exp(-dt * 16);
      u.inner.rotation.z = flight ? flight.bank : u.inner.rotation.z * Math.exp(-dt * 16);

      if (dead) {
        u.deadT += dt;
        const o = Math.min(1, Math.max(0, fade * 2));
        u.model.bodyMat.transparent = true;
        u.model.bodyMat.opacity = o;
        if (u.model.glowMat) {
          u.model.glowMat.transparent = true;
          u.model.glowMat.opacity = o;
        }
        if (u.ring) (u.ring.material as THREE.MeshBasicMaterial).opacity = o * 0.5;
      } else {
        if (u.model.bodyMat.transparent) {
          u.model.bodyMat.transparent = false;
          u.model.bodyMat.opacity = 1;
        }
        if (flash > 0) {
          u.model.bodyMat.emissive.setRGB(flash * 2.1, flash * 1.5, flash * 1.0);
        } else if (u.model.bodyMat.emissive.r !== 0) {
          u.model.bodyMat.emissive.setRGB(0, 0, 0);
        }
        if (u.model.glowMat) {
          const pulse = 0.72 + Math.sin(t * 3.5 + uid) * 0.28;
          u.model.glowMat.color.setRGB(pulse, pulse * 0.95, pulse * 0.85);
        }
      }

      // Drive the articulated rig — gait, strikes, flinch, stun and defeat
      animateInsectRig(
        u.model,
        id,
        t,
        uid,
        moving,
        u.bob,
        u.lunge,
        cast,
        flash,
        stun,
        dead,
        u.deadT,
        dt,
        0,
        flight,
      );

      if (flight && dive) {
        u.activeDiveId = dive.id;
        u.el.dataset.flightPhase = flight.phase;
        // Coordinates come from the actual rendered holder, allowing a browser
        // regression to verify that the original unit really leaves its tile.
        u.el.dataset.flightId = String(dive.id);
        u.el.dataset.flightX = u.holder.position.x.toFixed(4);
        u.el.dataset.flightY = u.holder.position.z.toFixed(4);
        u.el.dataset.flightHeight = (u.holder.position.y - UNIT_GROUND).toFixed(4);
        u.el.dataset.flightPitch = u.inner.rotation.x.toFixed(4);
        u.el.dataset.flightTargetX = dive.toX.toFixed(4);
        u.el.dataset.flightTargetY = dive.toY.toFixed(4);
      } else if (u.activeDiveId !== null) {
        u.activeDiveId = null;
        u.el.dataset.flightPhase = "grounded";
        u.el.dataset.flightHeight = "0";
      }

      const isSel = P.current.selectedUid === uid;
      if (isSel && !dead) {
        selRing.visible = true;
        selRing.position.set(u.holder.position.x, 0.026, u.holder.position.z);
        selRing.scale.setScalar(u.scale * (1 + Math.sin(t * 5) * 0.05));
        selRing.rotation.z += dt * 1.4;
      }

      // Project & dirty-write DOM HUD tag
      const hWorld = u.model.height * u.scale;
      proj.set(u.holder.position.x, u.holder.position.y + hWorld + 0.22 + u.inner.position.y, u.holder.position.z).project(camera);
      const sx = (proj.x * 0.5 + 0.5) * W;
      const sy = (-proj.y * 0.5 + 0.5) * H;
      const vis = proj.z < 1 && !(dead && fade <= 0.02) ? 1 : 0;

      if (Math.abs(sx - u.lx) > 0.25 || Math.abs(sy - u.ly) > 0.25) {
        u.lx = sx;
        u.ly = sy;
        u.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%)`;
      }
      if (vis !== u.lvis) {
        u.lvis = vis;
        u.el.style.opacity = vis ? "1" : "0";
      }
      const isFoe = side === "foe";
      if (isFoe !== u.lfoe) {
        u.lfoe = isFoe;
        u.el.classList.toggle("ov-foe", isFoe);
      }
      if (isSel !== u.lsel) {
        u.lsel = isSel;
        u.el.classList.toggle("ov-sel", isSel);
      }
      if (battleOn !== u.lbattle) {
        u.lbattle = battleOn;
        u.el.classList.toggle("ov-battle", battleOn);
      }
      if (battleOn) {
        const hpPct = Math.round(Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100)));
        if (hpPct !== u.lhp) {
          u.lhp = hpPct;
          u.hpEl.style.width = hpPct + "%";
        }
        const mPct = Math.round(Math.max(0, Math.min(100, mana)));
        if (mPct !== u.lmana) {
          u.lmana = mPct;
          u.manaEl.style.width = mPct + "%";
          u.manaEl.classList.toggle("full", mPct >= 99);
        }
        const nm = flight
          ? flight.phase === "climb" ? "CLIMB" : flight.phase === "approach" ? "LOCK ON" : flight.phase === "dive" ? "DIVE" : "LANDED"
          : stun > 0 ? "STUN" : vuln > 0 ? "VULN ×1.5" : "";
        const nmD = ovWord(nm);
        if (nmD !== u.lname) {
          u.lname = nmD;
          u.nameEl.textContent = nmD;
        }
        const isVuln = stun <= 0 && vuln > 0;
        if (isVuln !== u.lvuln) {
          u.lvuln = isVuln;
          u.el.classList.toggle("ov-vuln", isVuln);
        }
      } else {
        const nm = isSel ? (BUGS[id as BugId]?.short ?? "") : "";
        if (nm !== u.lname) {
          u.lname = nm;
          u.nameEl.textContent = nm;
        }
        if (u.lvuln) {
          u.lvuln = false;
          u.el.classList.remove("ov-vuln");
        }
      }
      const starStr = String(star);
      if (starStr !== u.lpips) {
        u.lpips = starStr;
        const starSvg = '<svg viewBox="0 0 12 12" width="9" height="9" class="inline-block mx-[0.5px]" style="filter:drop-shadow(0 1px 2px #000);"><polygon points="6,1 7.5,4.5 11,6 7.5,7.5 6,11 4.5,7.5 1,6 4.5,4.5" fill="#F0A93B" stroke="#4A2E10" stroke-width="0.8"/><polygon points="6,3 7,5 9,6 7,7 6,9 5,7 3,6 5,5" fill="#FFF8E0" opacity="0.85"/></svg>';
        u.pipsEl.innerHTML = Array(star).fill(starSvg).join("");
      }
    }

    function tick(now: number) {
      if (paused) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const p = P.current;

      // Half-rate shadow refresh (see shadowMap.autoUpdate above).
      shadowFlip ^= 1;
      if (shadowFlip) renderer.shadowMap.needsUpdate = true;

      // Adaptive resolution governor. The first ~30 frames are ignored so
      // one-off shader-compile spikes never trigger a downgrade.
      if (ftWarmup < 30) {
        ftWarmup++;
      } else {
        ftEma += (dt * 1000 - ftEma) * 0.06;
      }
      qualityClock += dt;
      if (qualityClock >= 1.5) {
        qualityClock = 0;
        if (ftEma > 22 && pxScale > 0.6) {
          pxScale = Math.max(0.6, pxScale - 0.15);
          renderer.setPixelRatio(baseDpr * pxScale);
          renderer.setSize(W, H, false);
        } else if (ftEma < 14.5 && pxScale < 1) {
          pxScale = Math.min(1, pxScale + 0.1);
          renderer.setPixelRatio(baseDpr * pxScale);
          renderer.setSize(W, H, false);
        }
      }

      warm.intensity = (showcase ? 7 : 11) * (0.93 + Math.sin(t * 2.3) * 0.07);

      // Fireflies
      const arr = fgeo.attributes.position.array as Float32Array;
      for (let i = 0; i < FN; i++) {
        const b = fbase[i];
        arr[i * 3] = b[0] + Math.sin(t * 0.55 + i) * 0.3;
        arr[i * 3 + 1] = b[1] + Math.sin(t * 0.85 + i * 1.7) * 0.18;
        arr[i * 3 + 2] = b[2] + Math.cos(t * 0.45 + i * 0.9) * 0.3;
      }
      fgeo.attributes.position.needsUpdate = true;
      fmat.opacity = 0.55 + Math.sin(t * 2.2) * 0.2;

      // Camera
      parallax.lerp(parallaxTarget, 1 - Math.exp(-dt * 4));
      const drift = Math.sin(t * 0.22) * 0.03;
      const az = drift + parallax.x * 0.12;
      const el2 = elev - parallax.y * 0.07;
      impactShake = Math.max(0, impactShake - dt * 5.5);
      const shake = impactShake * impactShake;
      camDist += (camDistTarget - camDist) * (1 - Math.exp(-dt * 4.5));
      camera.position.set(
        target.x + Math.sin(az) * Math.cos(el2) * camDist + Math.sin(t * 91) * shake * 0.075,
        target.y + Math.sin(el2) * camDist + Math.cos(t * 113) * shake * 0.05,
        target.z + Math.cos(az) * Math.cos(el2) * camDist + Math.sin(t * 77) * shake * 0.05
      );
      camera.lookAt(target);

      // Impact blooms
      for (let i = flashPool.length - 1; i >= 0; i--) {
        const f = flashPool[i];
        f.life -= dt;
        const k = Math.max(0, f.life / f.max);
        f.sprite.scale.setScalar(f.scale * (0.45 + (1 - k) * 1.15));
        f.mat.opacity = k * 0.95;
        if (f.life <= 0) {
          scene.remove(f.sprite);
          f.mat.dispose();
          flashPool.splice(i, 1);
        }
      }

      // Ring pulses
      for (let i = ringPool.length - 1; i >= 0; i--) {
        const r = ringPool[i];
        r.life -= dt;
        const k = Math.max(0, r.life / 0.58);
        r.mesh.scale.setScalar(1 + (1 - k) * 2.5);
        r.mat.opacity = k * 0.85;
        if (r.life <= 0) {
          scene.remove(r.mesh);
          r.mat.dispose();
          ringPool.splice(i, 1);
        }
      }

      updateSparks(dt);
      updateDust(dt);
      updateWalls(dt);
      updateScars(dt);

      const activeBattle = p.mode === "prep" ? null : p.battleRef?.current ?? p.battle;
      if (activeBattle !== clockBattle) {
        clockBattle = activeBattle;
        visualBattleTime = activeBattle?.t ?? 0;
      } else if (activeBattle) {
        // Interpolate behind the fixed 100ms sim ticks. Never show touchdown
        // ahead of the simulation, and respect the player's speed setting.
        visualBattleTime = Math.min(activeBattle.t, Math.max(
          activeBattle.t - 0.15,
          visualBattleTime + dt * p.battleSpeed,
        ));
      }
      updateProjectiles(activeBattle, t);
      updateHoles(activeBattle);
      updateZones(activeBattle, t, visualBattleTime);

      // the frontline conduit carries a slow travelling pulse; sconces breathe
      if (ambientRef.pips) {
        const pipsMesh = ambientRef.pips;
        for (let i = 0; i < COLS; i++) {
          const w = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2.1 - i * 0.62));
          cTmp.setRGB(w, w * 0.68, w * 0.24);
          pipsMesh.setColorAt(i, cTmp);
        }
        if (pipsMesh.instanceColor) pipsMesh.instanceColor.needsUpdate = true;
      }
      if (ambientRef.lanternMat) {
        const flick = 0.72 + Math.sin(t * 7.7) * 0.1 + Math.sin(t * 2.3) * 0.14;
        ambientRef.lanternMat.color.setRGB(flick, flick * 0.93, flick * 0.72);
      }

      /* ── Showcase Turntable Render ── */
      if (showcase) {
        const idx = Math.max(0, SHOWCASE_ORDER.findIndex((id) => id === (p.focusId || "stag")));
        const targetSpin = -(idx / SHOWCASE_ORDER.length) * Math.PI * 2 + userSpinOffset;
        let diff = targetSpin - spinAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        spinAngle += diff * (1 - Math.exp(-dt * 8));
        if (turntable) turntable.rotation.y = spinAngle;

        for (let i = 0; i < showcaseItems.length; i++) {
          const it = showcaseItems[i];
          const isFocus = it.id === (p.focusId || "stag");
          const wantSc = isFocus ? 1.28 : 0.86;
          const curSc = it.model.group.scale.x;
          it.model.group.scale.setScalar(curSc + (wantSc - curSc) * (1 - Math.exp(-dt * 9)));
          it.model.group.rotation.y = isFocus ? Math.sin(t * 0.85) * 0.55 + Math.PI * 0.12 : 0;

          // Every specimen stays alive on the turntable — breathing, flexing, scanning
          const pedestal = 0.07 + (isFocus ? Math.abs(Math.sin(t * 2.2)) * 0.03 : 0);
          animateInsectRig(
            it.model,
            it.id,
            t + i * 0.6,
            i * 2.3,
            false,
            0,
            0,
            0,
            0,
            0,
            false,
            0,
            dt,
            pedestal
          );
        }
        renderer.render(scene, camera);
        return;
      }

      /* ── Board Tile Highlights & Totems ── */
      const liveBattle = p.battleRef?.current ?? p.battle;
      const battleOn = !!liveBattle && p.mode !== "prep";

      syncTotems(p.cmdA, p.cmdB);
      if (totemState.allyModel && totemState.allyHolder) {
        animateInsectRig(totemState.allyModel, p.cmdA, t, 1001, false, 0, 0, 0, 0, 0, false, 0, dt, 0);
        totemState.allyHolder.position.y = 0.4 + Math.sin(t * 2.1) * 0.018;
        totemState.allyHolder.rotation.y = 0.55 + Math.sin(t * 0.7) * 0.14;
      }
      if (totemState.foeModel && totemState.foeHolder) {
        animateInsectRig(totemState.foeModel, p.cmdB, t + 1.2, 1002, false, 0, 0, 0, 0, 0, false, 0, dt, 0);
        totemState.foeHolder.position.y = 0.4 + Math.sin(t * 2.1 + 1.5) * 0.018;
        totemState.foeHolder.rotation.y = Math.PI + 0.55 + Math.sin(t * 0.7 + 1.5) * 0.14;
      }

      if (tilesMesh && tileRimsMesh) {
        const hasSel = p.mode === "prep" && p.selectedUid != null;
        let selSlot = -1;
        if (hasSel) {
          const su = p.prep.find((u) => u.uid === p.selectedUid);
          if (su && su.zone === "board") selSlot = su.slot;
        }

        let matrixDirty = false;
        for (let aIdx = 0; aIdx < 21; aIdx++) {
          const idx = ALLY_ROW_MIN * COLS + aIdx;
          const r = Math.floor(idx / COLS);
          const c = idx % COLS;
          const occupied = !battleOn && p.prep.some((u) => u.zone === "board" && u.slot === aIdx);
          const isHover = !battleOn && hoverSlot === aIdx;
          const isSelTile = aIdx === selSlot;

          const wantLift = isHover || isSelTile ? 0.036 : hasSel && (occupied || p.canDeployMore) ? 0.012 : 0;
          const curLift = tileHeights[idx];
          if (Math.abs(wantLift - curLift) > 0.0006) {
            const nl = curLift + (wantLift - curLift) * (1 - Math.exp(-dt * 14));
            tileHeights[idx] = nl;
            vPos.set(c + 0.5, -0.036 + nl, r + 0.5);
            m4.compose(vPos, q0, vScale);
            tilesMesh.setMatrixAt(idx, m4);
            vPos.set(c + 0.5, 0.010 + nl, r + 0.5);
            m4.compose(vPos, q0, vScale);
            tileRimsMesh.setMatrixAt(aIdx, m4);
            matrixDirty = true;
          }

          if (isHover || isSelTile) {
            cTmp.setHex(0xf0a93b);
          } else if (hasSel) {
            cTmp.setHex(occupied ? 0xf0a93b : p.canDeployMore ? 0x68e8b7 : 0x2a3d35);
          } else {
            cTmp.setHex(occupied ? 0x4fd3a0 : 0x2b4d3f);
          }
          tileRimsMesh.setColorAt(aIdx, cTmp);
        }
        if (matrixDirty) {
          tilesMesh.instanceMatrix.needsUpdate = true;
          tileRimsMesh.instanceMatrix.needsUpdate = true;
        }
        if (tileRimsMesh.instanceColor) tileRimsMesh.instanceColor.needsUpdate = true;
        (tileRimsMesh.material as THREE.MeshBasicMaterial).opacity = battleOn
          ? 0.14
          : hasSel
            ? 0.55 + Math.sin(t * 6) * 0.15
            : 0.28;
      }

      /* ── Units Update ── */
      seen.clear();
      if (battleOn && liveBattle) {
        const bUnits = liveBattle.units;
        for (let i = 0; i < bUnits.length; i++) {
          const r = bUnits[i];
          let wantRot = r.side === "ally" ? 0 : Math.PI;
          let bd = Infinity;
          let bx = 0;
          let bz = 0;
          let found = false;
          for (let j = 0; j < bUnits.length; j++) {
            const o = bUnits[j];
            if (o.side === r.side || o.dead) continue;
            const d = (o.x - r.x) * (o.x - r.x) + (o.y - r.y) * (o.y - r.y);
            if (d < bd) {
              bd = d;
              bx = o.x - r.x;
              bz = o.y - r.y;
              found = true;
            }
          }
          if (found) wantRot = Math.atan2(-bx, -bz);
          updateUnitFrame(
            r.uid,
            r.bugId,
            r.star,
            r.side,
            r.x,
            r.y,
            r.hp,
            r.maxHp,
            r.mana,
            r.dead,
            r.fade,
            r.cast,
            r.flash,
            r.stun,
            r.vuln,
            r.cd,
            true,
            wantRot,
            dt,
            r.dive,
            visualBattleTime,
          );
        }
      } else {
        for (let i = 0; i < p.prep.length; i++) {
          const u = p.prep[i];
          if (u.zone !== "board") continue;
          const q = boardXY(u.slot);
          updateUnitFrame(u.uid, u.bugId, u.star, "ally", q.x, q.y, 1, 1, 0, false, 1, 0, 0, 0, 0, 0, false, 0, dt);
        }
      }

      units.forEach((_, uid) => {
        if (!seen.has(uid)) killUnit(uid);
      });
      if (p.selectedUid == null || !units.has(p.selectedUid)) selRing.visible = false;

      /* ── Floating Combat Popups ── */
      if (battleOn && liveBattle) {
        alivePops.clear();
        for (let i = 0; i < liveBattle.pops.length; i++) {
          const pop = liveBattle.pops[i];
          alivePops.add(pop.id);
          let elp = popEls.get(pop.id);
          if (!elp) {
            elp = document.createElement("div");
            elp.className = `ov-pop ov-${pop.kind}`;
            elp.textContent = ovWord(pop.text);
            ovEl.appendChild(elp);
            popEls.set(pop.id, elp);
            // chitin chips fly off every impact
            if (pop.kind === "skill") {
              // Airstrike's effect comes from the Dragonfly touching down,
              // not an extra explosion travelling alongside the specimen.
              if (pop.text !== "AIRSTRIKE" && pop.text !== "TOUCHDOWN") {
                spawnRing(pop.x, pop.y + 0.25, pop.text === "GLOW" ? 0x56dca8 : 0xf0a93b);
                spawnBurst(
                  pop.x,
                  0.34,
                  pop.y + 0.25,
                  pop.text === "GLOW" ? 0x56dca8 : 0xffc252,
                  9,
                  1.5
                );
              }
            } else if (pop.kind === "ko") {
              spawnRing(pop.x, pop.y + 0.25, 0xf05a36);
              spawnBurst(pop.x, 0.3, pop.y + 0.25, 0xf05a36, 14, 2.3);
              spawnBurst(pop.x, 0.4, pop.y + 0.25, 0xffe7a3, 6, 1.7);
            } else if (pop.kind === "heal") {
              spawnBurst(pop.x, 0.26, pop.y + 0.25, 0x56dca8, 6, 0.9);
            } else {
              spawnBurst(pop.x, 0.36, pop.y + 0.25, 0xffe0a0, 4, 1.15);
            }
          }
          proj.set(pop.x, 0.56 + (0.9 - pop.life) * 0.56, pop.y).project(camera);
          const sx = (proj.x * 0.5 + 0.5) * W;
          const sy = (-proj.y * 0.5 + 0.5) * H;
          elp.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-50%)`;
          elp.style.opacity = String(Math.max(0, Math.min(1, pop.life * 2.4)));
        }
        popEls.forEach((elp, id) => {
          if (!alivePops.has(id)) {
            elp.remove();
            popEls.delete(id);
          }
        });
      } else if (popEls.size > 0) {
        popEls.forEach((elp) => elp.remove());
        popEls.clear();
      }

      renderer.render(scene, camera);
    }

    const onVis = () => {
      paused = document.hidden;
      if (!paused) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    sceneReady = true;
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      units.forEach((_, uid) => killUnit(uid));
      popEls.forEach((elp) => elp.remove());
      for (const r of ringPool) {
        scene.remove(r.mesh);
        r.mat.dispose();
      }
      for (const f of flashPool) {
        scene.remove(f.sprite);
        f.mat.dispose();
      }
      showcaseItems.forEach((it) => it.model.dispose());
      projMesh.dispose();
      haloMesh.dispose();
      holePool.forEach((hp) => scene.remove(hp.root));
      zonePool.forEach((zp) => scene.remove(zp.root));
      totemState.allyModel?.dispose();
      totemState.foeModel?.dispose();
      sparks.dispose();
      for (const d of disposables) d.dispose();
      dot.dispose();
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* context already released */
      }
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (noGL) {
    return (
      <div className={`grid place-items-center border border-bark bg-panel/60 text-center ${className}`} style={style}>
        <p className="label px-6 py-10 text-[9px] text-bone">
          {t("WEBGL UNAVAILABLE")} —{" "}
          <span className="latin block pt-2 normal-case tracking-normal text-bark2">{t("the drawer stays closed")}</span>
        </p>
      </div>
    );
  }

  return (
    <div className={`scene-host relative ${className}`} style={style}>
      <div ref={hostRef} className="absolute inset-0" />
      <div ref={ovRef} className="ov-layer pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="scene-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
