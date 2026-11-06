/**
 * Builder de modelos glTF 2.0 binarios (.glb) de un plato a escala real.
 * Genera un cilindro bajo (plato) cuya cara superior lleva la foto del plato
 * como textura. Unidades en metros (glTF), por lo que AR (Scene Viewer / Quick Look / WebXR)
 * lo proyecta con su tamaño físico real.
 */
const SEGMENTS = 64;
const PLATE_HEIGHT_M = 0.018;

function align4(n) {
  return (n + 3) & ~3;
}

class BufferWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
    this.views = [];
  }
  add(typedArrayOrBuffer, target) {
    const bytes = Buffer.from(typedArrayOrBuffer.buffer ?? typedArrayOrBuffer, typedArrayOrBuffer.byteOffset ?? 0, typedArrayOrBuffer.byteLength);
    const offset = this.length;
    this.chunks.push(bytes);
    const padded = align4(bytes.length);
    if (padded > bytes.length) this.chunks.push(Buffer.alloc(padded - bytes.length));
    this.length += padded;
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    if (target) view.target = target;
    this.views.push(view);
    return this.views.length - 1;
  }
  toBuffer() {
    return Buffer.concat(this.chunks, this.length);
  }
}

function topCap(r, h) {
  const pos = [0, h, 0];
  const nor = [0, 1, 0];
  const uv = [0.5, 0.5];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pos.push(r * c, h, r * s);
    nor.push(0, 1, 0);
    uv.push(0.5 + 0.5 * c, 0.5 + 0.5 * s);
  }
  const idx = [];
  for (let i = 1; i <= SEGMENTS; i++) idx.push(0, i + 1, i);
  return { pos, nor, uv, idx };
}

function sideAndBottom(r, h) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pos.push(r * c, h, r * s, r * c, 0, r * s);
    nor.push(c, 0, s, c, 0, s);
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const top = i * 2;
    const bot = top + 1;
    const nTop = top + 2;
    const nBot = top + 3;
    idx.push(bot, top, nBot, top, nTop, nBot);
  }
  const base = pos.length / 3;
  pos.push(0, 0, 0);
  nor.push(0, -1, 0);
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    pos.push(r * Math.cos(t), 0, r * Math.sin(t));
    nor.push(0, -1, 0);
  }
  for (let i = 1; i <= SEGMENTS; i++) idx.push(base, base + i, base + i + 1);
  return { pos, nor, idx };
}

function bounds(pos) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }
  return { min, max };
}

/**
 * @param {{ diameterCm: number, textureJpeg: Buffer, name?: string }} options
 * @returns {Buffer} archivo .glb
 */
export function buildPlateGlb({ diameterCm, textureJpeg, name = 'Plato' }) {
  const r = diameterCm / 200;
  const top = topCap(r, PLATE_HEIGHT_M);
  const side = sideAndBottom(r, PLATE_HEIGHT_M);
  const w = new BufferWriter();
  const ARRAY = 34962;
  const ELEMENT = 34963;

  const v = {
    tPos: w.add(new Float32Array(top.pos), ARRAY),
    tNor: w.add(new Float32Array(top.nor), ARRAY),
    tUv: w.add(new Float32Array(top.uv), ARRAY),
    tIdx: w.add(new Uint16Array(top.idx), ELEMENT),
    sPos: w.add(new Float32Array(side.pos), ARRAY),
    sNor: w.add(new Float32Array(side.nor), ARRAY),
    sIdx: w.add(new Uint16Array(side.idx), ELEMENT),
    img: w.add(textureJpeg),
  };

  const tb = bounds(top.pos);
  const sb = bounds(side.pos);
  const gltf = {
    asset: { version: '2.0', generator: 'MesaAR plate builder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        name,
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
          { attributes: { POSITION: 4, NORMAL: 5 }, indices: 6, material: 1 },
        ],
      },
    ],
    accessors: [
      { bufferView: v.tPos, componentType: 5126, count: top.pos.length / 3, type: 'VEC3', ...tb },
      { bufferView: v.tNor, componentType: 5126, count: top.nor.length / 3, type: 'VEC3' },
      { bufferView: v.tUv, componentType: 5126, count: top.uv.length / 2, type: 'VEC2' },
      { bufferView: v.tIdx, componentType: 5123, count: top.idx.length, type: 'SCALAR' },
      { bufferView: v.sPos, componentType: 5126, count: side.pos.length / 3, type: 'VEC3', ...sb },
      { bufferView: v.sNor, componentType: 5126, count: side.nor.length / 3, type: 'VEC3' },
      { bufferView: v.sIdx, componentType: 5123, count: side.idx.length, type: 'SCALAR' },
    ],
    materials: [
      { name: 'Foto', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.85 } },
      { name: 'Ceramica', pbrMetallicRoughness: { baseColorFactor: [0.96, 0.94, 0.9, 1], metallicFactor: 0, roughnessFactor: 0.35 } },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: v.img, mimeType: 'image/jpeg' }],
    bufferViews: w.views,
    buffers: [{ byteLength: w.length }],
  };

  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPadded = align4(json.length);
  json = Buffer.concat([json, Buffer.alloc(jsonPadded - json.length, 0x20)]);
  const bin = w.toBuffer();

  const header = Buffer.alloc(12);
  const total = 12 + 8 + json.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"
  return Buffer.concat([header, jsonHeader, json, binHeader, bin]);
}
