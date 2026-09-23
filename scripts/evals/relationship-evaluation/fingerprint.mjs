import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export async function treeHash(root) {
  const parts=[];
  async function visit(relative='') {
    for(const item of (await readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const next=path.join(relative,item.name);
      if(item.isDirectory())await visit(next);
      else if(item.isFile()&&!item.name.endsWith('.map'))parts.push([next,hash(await readFile(path.join(root,next)))]);
    }
  }
  await visit();return hash(parts);
}
export function reusable(report,identity) {
  return Boolean(report?.runFingerprint && report.runFingerprint===hash(identity) && report.finishedAt && report.verdict);
}
