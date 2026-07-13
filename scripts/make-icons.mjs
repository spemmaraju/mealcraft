// One-off PWA icon generator (Phase 6). Hand-rolls PNG chunks via node:zlib —
// no image library dependency. Draws a flat accent-green tile with a simple
// bowl glyph (two concentric circles), sized so the glyph stays comfortably
// inside a maskable icon's 80% safe zone. Run with:
//   node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const BG = [0x2f, 0x6b, 0x4f] // --accent
const RIM = [0xff, 0xff, 0xff]
const FOOD = [0xfa, 0xf8, 0xf5] // --bg

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function encodePNG(size, pixelAt) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type: RGBA
  const ihdr = pngChunk('IHDR', ihdrData)

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y)
      const o = rowStart + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const idat = pngChunk('IDAT', deflateSync(raw))
  const iend = pngChunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, ihdr, idat, iend])
}

function bowlPixel(size) {
  const cx = size / 2
  const cy = size / 2
  const rOuter = size * 0.34
  const rInner = size * 0.22
  return (x, y) => {
    const dx = x + 0.5 - cx
    const dy = y + 0.5 - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const [r, g, b] = dist <= rInner ? FOOD : dist <= rOuter ? RIM : BG
    return [r, g, b, 255]
  }
}

const targets = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/icon-maskable-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]

for (const [path, size] of targets) {
  writeFileSync(path, encodePNG(size, bowlPixel(size)))
  console.log(`wrote ${path} (${size}x${size})`)
}
