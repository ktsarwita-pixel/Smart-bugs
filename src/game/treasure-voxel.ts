import * as THREE from 'three';

/** A closed voxel volume: only faces against empty cells are emitted. Adjacent
 * materials share one surface, so the chest has no coplanar competing faces. */
export function createChestGeometry(part: 'body' | 'lid', detailed = false): THREE.BufferGeometry {
  const unit = 0.04;
  const cells = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const put = (x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,color:number) => {
    for (let x=x0;x<=x1;x++) for (let y=y0;y<=y1;y++) for (let z=z0;z<=z1;z++) cells.set(key(x,y,z),color);
  };
  const dark=0x302016, wood=0x75401f, plank=0x9d5c2a, gold=0xb57a2b, shine=0xe0aa46, inner=0x50301b;
  if (part === 'body') {
    put(0,21,0,1,0,14,dark);
    put(1,20,2,2,1,13,inner);
    put(0,21,2,10,0,1,wood); put(0,21,2,10,13,14,wood);
    put(0,1,2,10,2,12,wood); put(20,21,2,10,2,12,wood);
    for (const y of [3,6,9]) { put(2,19,y,y,14,14,plank); put(2,19,y,y,0,0,plank); }
    put(0,21,1,2,0,0,gold); put(0,21,1,2,14,14,gold);
    put(0,0,1,2,1,13,gold); put(21,21,1,2,1,13,gold);
    for (const x of [1,19]) { put(x,x+1,2,10,0,1,gold); put(x,x+1,2,10,13,14,gold); }
    // Extruded clasp and rivets, never overlay coplanar faces.
    put(9,12,7,10,15,15,dark); put(10,11,8,9,16,16,shine); put(10,11,8,8,17,17,dark);
    for (const x of [1,20]) for (const y of [3,9]) put(x,x,y,y,15,15,shine);
    put(5,7,3,3,6,8,shine); put(13,16,3,4,4,6,gold);
    put(9,10,3,4,9,10,0xa44536); put(11,12,3,4,5,6,0x589a9f);
  } else {
    // Lid is authored in hinge-local coordinates: back edge z=0.
    put(0,21,0,1,0,14,dark); put(1,20,2,4,1,13,wood);
    put(1,20,5,5,3,11,plank); put(2,19,6,6,5,9,wood);
    for (const x of [2,18]) { put(x,x+1,2,4,1,13,gold); put(x,x+1,5,5,3,11,shine); put(x,x+1,6,6,5,9,gold); }
    put(9,12,1,2,14,15,shine);
  }
  // The opt-in chest keeps the same solid voxel construction, but adds
  // readable planks, edge bands and rivets on *all* visible sides.  These
  // replace cells rather than laying coplanar decals over the wood.
  if (detailed && part === 'body') {
    const walnut=0x81451f, light=0xb66c2e, grain=0x633117, brass=0xc48a32, glint=0xffd578;
    for (const z of [0, 14]) {
      put(2,19,3,9,z,z,walnut);
      for (const y of [4,7]) put(2,19,y,y,z,z,grain);
      for (const y of [3,6,9]) put(3,18,y,y,z,z,light);
      for (const x of [2,18]) {
        put(x,x+1,2,10,z,z,brass);
        for (const y of [3,9]) put(x,x,y,y,z,z,glint);
      }
      // Pixel-grain highlights and short dark nicks on the front and back
      // planks, painted into the same surface as the wood.
      for (const [x0,x1,y] of [[5,7,3],[14,16,3],[6,8,6],[13,15,6],[5,8,9],[13,16,9]]) put(x0,x1,y,y,z,z,0xd2873d);
      for (const [x0,x1,y] of [[5,6,5],[15,16,5],[7,8,8],[13,14,8]]) put(x0,x1,y,y,z,z,grain);
      for (const x of [0,21]) { put(x,x,2,3,z,z,brass); put(x,x,9,10,z,z,brass); }
      // The same small maker's mark appears on the result chest and VS icon.
      put(9,12,3,3,z,z,grain); put(10,11,3,3,z,z,0xf1bf5b);
    }
    for (const x of [0,21]) {
      for (const y of [3,6,9]) put(x,x,y,y,2,12,light);
      for (const z of [2,11]) put(x,x,2,10,z,z,brass);
      put(x,x,2,2,2,12,brass);
    }
    // Top and bottom rim reinforce depth when the chest is viewed obliquely.
    put(0,21,10,10,0,1,brass); put(0,21,10,10,13,14,brass);
    put(0,1,10,10,2,12,brass); put(20,21,10,10,2,12,brass);
    put(0,21,1,1,0,0,glint); put(0,21,1,1,14,14,glint);
    put(0,0,1,1,1,13,glint); put(21,21,1,1,1,13,glint);
    // A protruding lock with a recessed dark keyhole, not a flat sticker.
    put(9,12,6,10,15,15,0x402311); put(9,12,7,10,16,16,0xd59a37);
    put(10,11,8,9,17,17,glint); put(10,11,7,8,18,18,0x4a2915);
  } else if (detailed) {
    const woodTop=0xa85c27, woodLight=0xc97e35, shadow=0x653719, brass=0xd49a3a, glint=0xffd578;
    // Stepped dome: the slope continues over both ends and down the sides.
    put(1,20,2,4,1,13,woodTop); put(1,20,5,5,3,11,woodLight);
    put(2,19,6,6,5,9,woodTop);
    // Short, symmetric voxel strokes keep the domed lid readable at game size.
    for (const z of [5,9]) { put(6,8,6,6,z,z,woodLight); put(13,15,6,6,z,z,woodLight); }
    for (const z of [1,13]) {
      put(1,20,2,2,z,z,shadow);
      for (const x of [5,14]) put(x,x+2,4,4,z,z,woodLight);
    }
    for (const x of [2,18]) {
      put(x,x+1,0,4,0,14,brass);
      put(x,x+1,5,5,3,11,glint); put(x,x+1,6,6,5,9,brass);
    }
    put(0,21,0,0,0,14,0x9a6126);
    put(9,12,1,2,14,15,brass); put(10,11,2,2,16,16,glint);
    // The inside of the lid is visible when raised: framed boards rather
    // than the underside of a featureless solid block.
    put(1,20,0,0,1,13,brass);
    put(2,19,0,0,2,12,shadow);
    put(3,18,0,0,3,11,woodTop);
    for (const z of [5,8,11]) put(3,18,0,0,z,z,woodLight);
  }
  const positions:number[]=[]; const colors:number[]=[]; const color=new THREE.Color();
  // Corner orders face outwards (two triangles per visible face).
  const sides: [number,number,number,number[][]][] = [
    [1,0,0,[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[-1,0,0,[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]],
    [0,1,0,[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]],[0,-1,0,[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
    [0,0,1,[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]],[0,0,-1,[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]],
  ];
  for (const [k,hex] of cells) {
    const [x,y,z]=k.split(',').map(Number); color.setHex(hex);
    for (const [dx,dy,dz,corners] of sides) {
      if (cells.has(key(x+dx,y+dy,z+dz))) continue;
      for (const i of [0,1,2,0,2,3]) {
        const c=corners[i]; positions.push((x+c[0]-11)*unit,(y+c[1])*unit,(z+c[2]-(part==='body'?7.5:0))*unit);
        colors.push(color.r,color.g,color.b);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}
