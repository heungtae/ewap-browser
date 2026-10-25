import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export function privateDirectory(path: string) {
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    realpathSync(dirname(path)) !== dirname(path)
  )
    throw new Error("INSTALL_PATH");
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  const info = lstatSync(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  )
    throw new Error("INSTALL_PERMISSIONS");
}
export function protectedFile(path: string): string | undefined {
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077 ||
    info.size > 1024 * 1024
  )
    throw new Error("INSTALL_PERMISSIONS");
  return readFileSync(path, "utf8");
}
export function atomicPrivate(path: string, content: string, mode = 0o600) {
  protectedFile(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", mode);
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temporary, path);
    const dir = openSync(dirname(path), "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
export function acquireInstallLock(directory: string): () => void {
  const path = `${directory}/install.lock`;
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch {
    throw new Error("INSTALL_LOCKED");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(fd);
    unlinkSync(path);
  };
}
export function withInstallLock<T>(directory: string, action: () => T): T {
  const release = acquireInstallLock(directory);
  try {
    return action();
  } finally {
    release();
  }
}
export function assertStopped(directory: string) {
  for (const name of ["agent.sock", "migration-daemon.lock"]) {
    try {
      lstatSync(`${directory}/${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    throw new Error("INSTALL_BACKEND_ACTIVE");
  }
}

export function durableRemove(path: string) {
  unlinkSync(path);
  const fd = openSync(dirname(path), "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
