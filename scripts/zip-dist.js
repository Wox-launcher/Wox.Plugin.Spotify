'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function collectFiles(dir, prefix = '') {
  const entries = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      entries.push(...collectFiles(full, rel));
    } else {
      entries.push({ rel, full });
    }
  }
  return entries;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear() - 1980, 0);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(n) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n);
  return buf;
}

function u32(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n >>> 0);
  return buf;
}

function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const data = fs.readFileSync(file.full);
    const compressed = zlib.deflateRawSync(data);
    const name = Buffer.from(file.rel.replace(/\\/g, '/'), 'utf8');
    const crc = zlib.crc32(data);
    const { dosTime, dosDate } = dosDateTime(fs.statSync(file.full).mtime);

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    ]);

    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locals, centralDir, eocd]);
}

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'Wox.Plugin.Spotify.wox');
const files = collectFiles(dist).sort((a, b) => a.rel.localeCompare(b.rel));

if (files.length === 0) {
  throw new Error(`No files found in ${dist}`);
}

fs.writeFileSync(out, createZip(files));
console.log(`Wrote ${path.basename(out)} (${files.length} files, PKZIP)`);
