import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export function controllerBasename(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(value) || value === "." || value === "..") throw new Error("OPTIMIZATION_CONTROLLER_BASENAME_REQUIRED");
  return value;
}
export function controllerDirectory(path: string): string {
  const directory = resolve(path);
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("OPTIMIZATION_CONTROLLER_DIRECTORY_INVALID");
  return directory;
}
/** Bounded, no-follow reads. A candidate or command cannot redirect controller inputs. */
export function readControllerJson(directory: string, name: string): unknown {
  const fd = openSync(join(controllerDirectory(directory), controllerBasename(name)), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 5_000_000) throw new Error("OPTIMIZATION_CONTROLLER_FILE_INVALID");
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally { closeSync(fd); }
}
export function makeControllerDirectory(directory: string, name: string): string {
  const path = join(controllerDirectory(directory), controllerBasename(name));
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return controllerDirectory(path);
}
export function writeControllerArtifact(directory: string, name: string, value: unknown): void {
  const parent = controllerDirectory(directory), basename = controllerBasename(name);
  const temporary = join(parent, `${basename}.${randomUUID()}.tmp`);
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    try { fchmodSync(fd, 0o600); writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fsyncSync(fd); }
    finally { closeSync(fd); }
    renameSync(temporary, join(parent, basename));
    const directoryFd = openSync(parent, constants.O_RDONLY);
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } finally {
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
