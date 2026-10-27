import type { VoxModel } from "./voxel";
import type { AirstrikePose } from "./airstrike";

/* ── Procedural Articulated Insect Animation Driver ──────────
   Every joint target is resolved once per frame, then eased toward
   its goal — so limbs never stick at a stale angle when a state ends. */

const ease = (cur: number, tgt: number, k: number) => cur + (tgt - cur) * k;

interface Pose {
  torsoX: number; torsoY: number; torsoZ: number; torsoS: number;
  torsoPosY: number; torsoPosZ: number;
  headX: number; headY: number; headZ: number;
  headPosY: number; headPosZ: number;
  laX: number; laY: number; laZ: number;
  raX: number; raY: number; raZ: number;
  legsAX: number; legsBX: number; legsAY: number; legsBY: number;
  crownY: number; rootY: number;
}

export function animateInsectRig(
  m: VoxModel,
  id: string,
  t: number,
  uid: number,
  moving: boolean,
  walkPhase: number,
  lunge: number,
  cast: number,
  flash: number,
  stun: number,
  dead: boolean,
  deadT: number,
  dt: number,
  baseY = 0,
  flightPose?: AirstrikePose,
) {
  const p: Pose = {
    torsoX: 0, torsoY: 0, torsoZ: 0, torsoS: 1, torsoPosY: 0, torsoPosZ: 0,
    headX: 0, headY: 0, headZ: 0, headPosY: 0, headPosZ: 0,
    laX: 0, laY: 0, laZ: 0, raX: 0, raY: 0, raZ: 0,
    legsAX: 0, legsBX: 0, legsAY: 0, legsBY: 0,
    crownY: 0, rootY: 0,
  };

  const ap = lunge;                                  // attack 1 → 0
  const cp = cast > 0 ? Math.min(1, 1 - cast / 0.55) : 0; // skill 0 → 1

  if (dead) {
    /* ── defeat: legs curl, body convulses, then rolls onto its back ── */
    const roll = Math.min(Math.PI * 0.55, deadT * 4.4);
    const spasm = Math.max(0, 1 - deadT * 1.6);
    p.torsoZ = roll;
    p.headZ = roll * 1.15;
    p.legsAX = 0.85 * Math.min(1, deadT * 3) + Math.sin(t * 26) * 0.22 * spasm;
    p.legsBX = 0.85 * Math.min(1, deadT * 3) - Math.sin(t * 26) * 0.22 * spasm;
    p.laX = 0.7;
    p.raX = 0.7;
    p.laZ = -0.5;
    p.raZ = 0.5;
    p.headX = 0.35;
    p.rootY = -Math.min(0.1, deadT * 0.14);
    p.torsoS = 1;
  } else {
    /* ── shared life: breathing abdomen + curious head ── */
    const breath = Math.sin(t * 2.6 + uid) * 0.03;
    p.torsoS = 1 + breath;
    p.headY = Math.sin(t * 1.15 + uid * 0.7) * 0.1;
    p.headX = Math.sin(t * 1.7 + uid) * 0.04;

    if (moving) {
      /* ── alternating tripod gait: L1·R2·L3 swing against R1·L2·R3 ── */
      const sw = Math.sin(walkPhase);
      p.legsAX = sw * 0.5;
      p.legsBX = -sw * 0.5;
      p.legsAY = Math.max(0, sw) * 0.028;
      p.legsBY = Math.max(0, -sw) * 0.028;
      p.torsoZ = sw * 0.06;
      p.torsoX = 0.09;                    // forward drive lean
      p.torsoPosY = Math.abs(Math.sin(walkPhase * 2)) * 0.012;
      p.headX = -0.06;                    // counter-balance the lean
    } else {
      /* ── standing: weight settles, tarsi tap ── */
      p.legsAX = Math.sin(t * 1.4 + uid) * 0.03;
      p.legsBX = -Math.sin(t * 1.4 + uid) * 0.03;
      p.torsoX = Math.sin(t * 0.9 + uid) * 0.015;
    }

    /* ── species articulation ── */
    if (id === "stag") {
      // 300 HP of armoured brawler — every bite drives through the whole body,
      // six legs shoving the mandibles into the target.
      if (cp > 0) {
        // Pincer Lock — rear back -> clamp -> thrash the pinned prey
        const wind = Math.min(1, cp / 0.3);
        const bite = cp > 0.3 ? Math.min(1, (cp - 0.3) / 0.18) : 0;
        const shake = cp > 0.48 ? (cp - 0.48) / 0.52 : 0;
        const snap = Math.sin(bite * Math.PI * 0.5); // slams shut and HOLDS
        const rattle = Math.exp(-shake * 2.2) * Math.sin(shake * 42);

        p.torsoX = -wind * 0.22 + snap * 0.3;
        p.torsoPosZ = wind * 0.1 - snap * 0.22;
        p.torsoZ = rattle * 0.12;
        p.headX = -wind * 0.3 + snap * 0.34;
        p.headPosZ = wind * 0.08 - snap * 0.26;
        p.headY = rattle * 0.3;                      // thrashes the prey side to side
        p.laY = wind * 0.85 - snap * 1.0;            // yawn wide, then cross and lock
        p.raY = -p.laY;
        p.legsAX = -wind * 0.3 + snap * 0.5;
        p.legsBX = -wind * 0.3 + snap * 0.5;
        p.rootY = wind * 0.05 - snap * 0.03;
      } else if (ap > 0.01) {
        // Basic bite — coil -> slam -> jolt
        const prog = 1 - ap;
        const open = Math.min(1, prog / 0.28);
        const after = prog > 0.28 ? (prog - 0.28) / 0.72 : 0;
        const snap = after > 0 ? Math.exp(-after * 4.5) : 0;
        const jolt = after > 0 ? Math.exp(-after * 7) * Math.sin(after * 30) : 0;

        p.laY = open * 0.62 - snap * 0.95;           // mandibles cross past each other
        p.raY = -p.laY;
        p.torsoX = -open * 0.12 + snap * 0.26 + jolt * 0.06;
        p.torsoPosZ = open * 0.06 - snap * 0.16;     // coil back, then drive in
        p.headX = -open * 0.14 + snap * 0.26;
        p.headPosZ = open * 0.05 - snap * 0.2;
        p.legsAX = -open * 0.2 + snap * 0.36;        // all six legs shove
        p.legsBX = -open * 0.2 + snap * 0.36;
        p.rootY = -snap * 0.025;
      } else {
        // Idle — slow mandible flexing, like a beetle testing its jaws
        const flex = Math.sin(t * 1.9 + uid) * 0.09;
        p.laY = flex;
        p.raY = -flex;
        p.torsoX = 0.02 + Math.sin(t * 0.9 + uid) * 0.02;
      }
    } else if (id === "bomb") {
      // Artillery beetle. The abdomen is the gun: it cranes up over the back,
      // holds a beat, then slams down as the shell leaves the tail vents.
      // All of it now pivots from the thorax (see torsoPivot), so the body
      // rotates instead of tipping over its feet.
      if (cp > 0) {
        // Caustic Burst — charge -> brace -> fire -> damped settle
        const charge = Math.min(1, cp / 0.32);
        const fire = cp > 0.32 ? Math.min(1, (cp - 0.32) / 0.16) : 0;
        const after = cp > 0.48 ? (cp - 0.48) / 0.52 : 0;
        const kick = after > 0 ? Math.exp(-after * 7) * Math.sin(after * 18) : 0;

        p.torsoX = charge * 0.3 + Math.sin(fire * Math.PI) * 0.34 + kick * 0.1;
        p.torsoPosZ = Math.sin(fire * Math.PI) * 0.13 + kick * 0.05;
        p.torsoPosY = charge * 0.018;
        p.torsoS = 1 + charge * 0.07 - Math.sin(fire * Math.PI) * 0.05;
        p.headX = -charge * 0.12 + Math.sin(fire * Math.PI) * 0.18; // head braces forward
        p.laX = -charge * 0.22 - Math.sin(fire * Math.PI) * 0.4;
        p.raX = p.laX;
        p.laZ = charge * 0.1 + Math.sin(fire * Math.PI) * 0.16;
        p.raZ = -p.laZ;
        p.legsAX = -charge * 0.16 - Math.sin(fire * Math.PI) * 0.2;
        p.legsBX = charge * 0.16 + Math.sin(fire * Math.PI) * 0.2;
        p.rootY = -charge * 0.022 - Math.sin(fire * Math.PI) * 0.03;
      } else if (ap > 0.01) {
        // Single spray — quick aim, sharp kick, clean exponential recovery
        const t0 = 1 - ap;                       // 0 → 1 across the swing
        const aim = Math.min(1, t0 / 0.24);      // snaps to aim in the first quarter
        const shot = t0 > 0.24 ? Math.exp(-(t0 - 0.24) * 6) : 0; // recoil impulse
        const settle = shot * Math.sin((t0 - 0.24) * 26);

        p.torsoX = aim * 0.26 + shot * 0.22 + settle * 0.04;
        p.torsoPosZ = shot * 0.1;
        p.torsoS = 1 + aim * 0.04 - shot * 0.03;
        p.headX = -aim * 0.08 + shot * 0.1;
        p.laX = -aim * 0.2 - shot * 0.35;
        p.raX = p.laX;
        p.laZ = aim * 0.1;
        p.raZ = -p.laZ;
        p.legsAX = -aim * 0.12 - shot * 0.16;
        p.legsBX = aim * 0.12 + shot * 0.16;
        p.rootY = -shot * 0.02;
      } else {
        // Idle — tail rides cocked, antennae hunt out of phase, vents churn
        p.torsoX = 0.05 + Math.sin(t * 1.0 + uid) * 0.03;
        p.torsoS = 1 + Math.sin(t * 3.1 + uid) * 0.045;
        p.torsoZ = Math.sin(t * 0.8 + uid) * 0.018;
        p.laZ = 0.08 + Math.sin(t * 1.4 + uid) * 0.1;
        p.raZ = -0.08 - Math.sin(t * 1.4 + uid + 2.1) * 0.1;
        p.laX = Math.sin(t * 2.0 + uid) * 0.06;
        p.raX = Math.sin(t * 1.8 + uid + 1.4) * 0.06;
      }
    } else if (id === "mantis") {
      if (cp > 0) {
        // Raking Slash — rears tall, both scythes sweep a crossed arc
        const air = Math.sin(cp * Math.PI);
        p.headX = -air * 0.4;
        p.laX = -air * 1.45;
        p.laZ = -air * 0.55;
        p.raX = -air * 1.45;
        p.raZ = air * 0.55;
        p.rootY = air * 0.09;
        p.torsoX = -air * 0.16;
      } else if (ap > 0.01) {
        // Strike — left scythe leads, right follows a beat later
        const cutL = Math.sin(Math.min(1, ap * 1.7) * Math.PI);
        const cutR = Math.sin(Math.max(0, Math.min(1, (ap - 0.22) * 2.1)) * Math.PI);
        p.headX = -ap * 0.3;
        p.laX = -cutL * 1.25;
        p.laY = cutL * 0.4;
        p.raX = -cutR * 1.25;
        p.raY = -cutR * 0.4;
        p.rootY = ap * 0.04;
      } else {
        // Idle — held in prayer, forelegs flexing, head tracking prey
        const pray = Math.sin(t * 1.5 + uid) * 0.11;
        p.laX = pray;
        p.raX = -pray;
        p.headY += Math.sin(t * 0.8 + uid) * 0.14;
      }
    } else if (id === "dragonfly") {
      // A four-winged hover, not a ground run. The fore and hind wing pairs
      // beat slightly out of phase to give the silhouette a recognizable hum.
      const phase = t * 34 + uid * 0.41;
      const hover = Math.abs(Math.sin(phase * 0.5));
      if (flightPose) {
        // World-space flight lives on the holder. Animate the SAME specimen's
        // wings and legs inside it; never substitute a shell or a glow ball.
        const fold = flightPose.wingFold;
        const flap = Math.sin(phase * 1.35) * (1 - fold) * 0.55;
        p.rootY = 0;
        p.torsoX = 0;
        p.torsoY = 0;
        p.torsoZ = 0;
        p.headX = -0.06;
        p.headY = flightPose.phase === "approach" ? Math.sin(t * 7) * 0.18 : 0;
        p.laY = -0.12 - fold * 0.95;
        p.raY = 0.12 + fold * 0.95;
        p.laZ = -0.12 + flap;
        p.raZ = 0.12 - flap;
        p.legsAX = -0.35 - fold * 0.2;
        p.legsBX = -0.35 - fold * 0.2;
        p.legsAY = 0;
        p.legsBY = 0;
      } else if (ap > 0.01) {
        // Needle-fast interception: folded wings, forward dart, braking flare.
        const dart = Math.sin((1 - ap) * Math.PI);
        p.rootY = hover * 0.035 + dart * 0.12;
        p.torsoX = 0.22 + dart * 0.34;
        p.headX = -0.18 + dart * 0.12;
        p.torsoPosZ = -dart * 0.075;
        p.laY = -0.12 - dart * 0.75;
        p.raY = 0.12 + dart * 0.75;
        p.laZ = -0.2 + Math.sin(phase) * 0.3;
        p.raZ = 0.2 - Math.sin(phase + 0.5) * 0.3;
        p.legsAX = -dart * 0.2;
        p.legsBX = -dart * 0.2;
      } else {
        // Stationary hover: wings hum at speed; the rudder abdomen counter-steers.
        p.rootY = hover * 0.075 + 0.045;
        p.torsoX = 0.03 + Math.sin(t * 2.1 + uid) * 0.035;
        p.torsoY = Math.sin(t * 1.5 + uid) * 0.055;
        p.torsoZ = Math.sin(t * 2.3 + uid) * 0.04;
        p.headX = Math.sin(t * 1.6 + uid) * 0.055;
        p.headY = Math.sin(t * 1.1 + uid) * 0.12;
        p.laY = -0.16 + Math.sin(phase * 0.5) * 0.32;
        p.raY = 0.16 - Math.sin(phase * 0.5 + 0.4) * 0.32;
        p.laZ = -0.26 + Math.sin(phase) * 0.5;
        p.raZ = 0.26 - Math.sin(phase + 0.55) * 0.5;
        p.legsAX = Math.sin(t * 3 + uid) * 0.06;
        p.legsBX = -Math.sin(t * 3 + uid) * 0.06;
      }
    } else if (id === "matriarch") {
      // Royal levitation — the whole body rides a slow hover, crown bobbing apart
      const lev = Math.sin(t * 1.9 + uid) * 0.045;
      p.rootY = lev + 0.05;
      p.crownY = Math.sin(t * 2.7 + uid) * 0.018 + 0.02;
      p.torsoS = 1 + Math.sin(t * 2.2 + uid) * 0.045;   // brood pulse
      p.headY = Math.sin(t * 0.7 + uid) * 0.16;
      p.laZ = Math.sin(t * 1.3 + uid) * 0.07;
      p.raZ = -Math.sin(t * 1.3 + uid) * 0.07;
      if (cp > 0) {
        const hymn = Math.sin(cp * Math.PI);
        p.crownY += hymn * 0.1;
        p.torsoS += hymn * 0.07;
      }
    } else if (id === "worm") {
      // An annelid working its way out of the soil: the whole column sways,
      // the head probes, the maw opens and closes.
      const sway = Math.sin(t * 1.15 + uid);
      p.torsoY = sway * 0.13;
      p.torsoZ = Math.sin(t * 0.9 + uid * 1.3) * 0.06;
      p.torsoX = 0.03 + Math.sin(t * 1.4 + uid) * 0.035;
      p.torsoS = 1 + Math.sin(t * 1.9 + uid) * 0.05;      // body pulses as it moves
      p.rootY = Math.sin(t * 1.5 + uid) * 0.022 + 0.01;
      p.headX = Math.sin(t * 1.7 + uid) * 0.16 - 0.04;     // probing
      p.headY = Math.sin(t * 1.05 + uid) * 0.2;
      p.laZ = 0.12 + Math.sin(t * 2.2 + uid) * 0.16;
      p.raZ = -0.12 - Math.sin(t * 2.2 + uid + 1.7) * 0.16;
      // a worm has no walking legs — its flank setae only ripple, never swing
      p.legsAX = Math.sin(t * 3.1 + uid) * 0.05;
      p.legsBX = -Math.sin(t * 3.1 + uid) * 0.05;
      p.legsAY = 0;
      p.legsBY = 0;
      if (cp > 0) {
        const rear = Math.sin(cp * Math.PI);
        p.torsoX = -rear * 0.26;                            // rears back to strike
        p.headX = rear * 0.3;
        p.rootY = 0.01 + rear * 0.05;
      } else if (ap > 0.01) {
        // rear up, then slam the maw down
        const prog = 1 - ap;
        const wind = Math.min(1, prog / 0.35);
        const slam = prog > 0.35 ? Math.exp(-(prog - 0.35) * 6) : 0;
        p.torsoX = -wind * 0.3 + slam * 0.38;
        p.torsoPosZ = -wind * 0.04 + slam * 0.1;
        p.headX = wind * 0.18 + slam * 0.42;                // drives the maw down
        p.rootY = wind * 0.03 - slam * 0.02;
      }
    } else {
      // lampyris — wing covers part and flutter, lantern swells
      const flutter = cp > 0 || ap > 0.1;
      if (flutter) {
        const beat = Math.sin(t * 36) * 0.22;
        p.laY = -0.68 + beat;
        p.raY = 0.68 - beat;
        p.laZ = beat * 0.5;
        p.raZ = -beat * 0.5;
        p.rootY = 0.05 + Math.abs(Math.sin(t * 18)) * 0.02;
      } else {
        const breatheWing = Math.sin(t * 2.3 + uid) * 0.1;
        p.laY = -0.16 + breatheWing;
        p.raY = 0.16 - breatheWing;
        p.rootY = Math.sin(t * 1.7 + uid) * 0.022 + 0.02;
      }
      p.torsoS = 1 + Math.sin(t * 3.1 + uid) * 0.055;    // lantern swelling
    }

    /* ── stun overrides the head with a dizzy roll ── */
    if (stun > 0) {
      p.headY = Math.sin(t * 8.5) * 0.38;
      p.headZ = Math.cos(t * 8.5) * 0.22;
      p.laZ = Math.sin(t * 22) * 0.14;
      p.raZ = -Math.sin(t * 22) * 0.14;
      p.torsoZ = Math.sin(t * 6) * 0.06;
    }

    /* ── struck: head snaps back along the body ── */
    if (flash > 0) {
      p.headPosZ += flash * 0.16;
      p.headX -= flash * 0.3;
      p.torsoX -= flash * 0.18;
    }
  }

  /* ── resolve: ease every joint toward its target ── */
  const R = m.rest;
  const kLeg = 1 - Math.exp(-dt * 34);   // gait must stay crisp
  const kFast = 1 - Math.exp(-dt * 26);  // strikes
  const kBody = 1 - Math.exp(-dt * 15);  // weight & breath

  m.torso.rotation.x = ease(m.torso.rotation.x, p.torsoX, kBody);
  m.torso.rotation.y = ease(m.torso.rotation.y, p.torsoY, kBody);
  m.torso.rotation.z = ease(m.torso.rotation.z, p.torsoZ, kBody);
  const s = ease(m.torso.scale.z, p.torsoS, kBody);
  m.torso.scale.set(1 + (s - 1) * 0.55, 1 + (s - 1) * 0.55, s);
  m.torso.position.y = R.torso.y + ease(m.torso.position.y - R.torso.y, p.torsoPosY, kBody);
  m.torso.position.z = R.torso.z + ease(m.torso.position.z - R.torso.z, p.torsoPosZ, kFast);

  m.head.rotation.x = ease(m.head.rotation.x, p.headX, kFast);
  m.head.rotation.y = ease(m.head.rotation.y, p.headY, kBody);
  m.head.rotation.z = ease(m.head.rotation.z, p.headZ, kFast);
  m.head.position.y = R.head.y + ease(m.head.position.y - R.head.y, p.headPosY, kBody);
  m.head.position.z = R.head.z + ease(m.head.position.z - R.head.z, p.headPosZ, kFast);

  m.leftArm.rotation.x = ease(m.leftArm.rotation.x, p.laX, kFast);
  m.leftArm.rotation.y = ease(m.leftArm.rotation.y, p.laY, kFast);
  m.leftArm.rotation.z = ease(m.leftArm.rotation.z, p.laZ, kFast);
  m.rightArm.rotation.x = ease(m.rightArm.rotation.x, p.raX, kFast);
  m.rightArm.rotation.y = ease(m.rightArm.rotation.y, p.raY, kFast);
  m.rightArm.rotation.z = ease(m.rightArm.rotation.z, p.raZ, kFast);

  m.legsA.rotation.x = ease(m.legsA.rotation.x, p.legsAX, kLeg);
  m.legsB.rotation.x = ease(m.legsB.rotation.x, p.legsBX, kLeg);
  m.legsA.position.y = R.legsA.y + ease(m.legsA.position.y - R.legsA.y, p.legsAY, kLeg);
  m.legsB.position.y = R.legsB.y + ease(m.legsB.position.y - R.legsB.y, p.legsBY, kLeg);

  m.crown.position.y = R.crown.y + ease(m.crown.position.y - R.crown.y, p.crownY, kBody);
  m.group.position.y = flightPose ? baseY : ease(m.group.position.y, baseY + p.rootY, kBody);
}
