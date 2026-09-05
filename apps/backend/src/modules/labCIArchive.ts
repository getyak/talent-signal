import { crc32, inflateRawSync } from "node:zlib";

/** A single small, named report is read in memory. Nothing is extracted to disk. */
export function readLabCIArchive(bytes: Uint8Array): unknown {
  try {
    const data = Buffer.from(bytes);
    if (data.length > 1_000_000 || data.length < 22) throw new Error();
    let end = -1;
    for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
      if (data.readUInt32LE(i) === 0x06054b50 && i + 22 + data.readUInt16LE(i + 20) === data.length) { end = i; break; }
    }
    if (end < 0 || data.readUInt32LE(end + 4) !== 0 || data.readUInt16LE(end + 8) !== 1 || data.readUInt16LE(end + 10) !== 1) throw new Error();
    const directorySize = data.readUInt32LE(end + 12), directory = data.readUInt32LE(end + 16);
    if (directory + directorySize !== end || directorySize < 46 || data.readUInt32LE(directory) !== 0x02014b50) throw new Error();
    const flags = data.readUInt16LE(directory + 8), method = data.readUInt16LE(directory + 10);
    const compressed = data.readUInt32LE(directory + 20), expanded = data.readUInt32LE(directory + 24);
    const nameSize = data.readUInt16LE(directory + 28), extraSize = data.readUInt16LE(directory + 30), commentSize = data.readUInt16LE(directory + 32);
    const local = data.readUInt32LE(directory + 42);
    if (flags & 0x41 || ![0, 8].includes(method) || expanded > 512_000 || compressed > 1_000_000
      || 46 + nameSize + extraSize + commentSize !== directorySize || data.readUInt16LE(directory + 34) !== 0) throw new Error();
    const name = data.subarray(directory + 46, directory + 46 + nameSize);
    if (name.toString("utf8") !== "lab-regression-report.json" || local + 30 > directory || data.readUInt32LE(local) !== 0x04034b50
      || data.readUInt16LE(local + 8) !== method || data.readUInt16LE(local + 6) !== flags) throw new Error();
    const localNameSize = data.readUInt16LE(local + 26), localExtraSize = data.readUInt16LE(local + 28);
    if (!name.equals(data.subarray(local + 30, local + 30 + localNameSize))) throw new Error();
    const start = local + 30 + localNameSize + localExtraSize;
    if (start + compressed > directory) throw new Error();
    const payload = data.subarray(start, start + compressed);
    const result = method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: 512_000 });
    if (result.length !== expanded || crc32(result) !== data.readUInt32LE(directory + 16)) throw new Error();
    return JSON.parse(result.toString("utf8"));
  } catch { throw new Error("LAB_CI_ARCHIVE_INVALID"); }
}
