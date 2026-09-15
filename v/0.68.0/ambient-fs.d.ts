// Types for the `fs` module as the immediately.run SANDBOX exposes it to apps: an
// ASYNC-ONLY filesystem (`fs.promises.*` + callback style), rooted at the
// project root. In the sandbox it is backed by ZenFS over a MessagePort; during
// local `vite dev` the @immediately-run/dev-fs bridge backs it with your real
// disk.
//
// MOVED HERE from `@immediately-run/dev-fs/fs` (R3-276b): the package that owns a
// surface should be the one that declares it. The dev-fs package — a Vite plugin
// that exists to *emulate* this surface on real disk during local dev — now
// re-references this declaration (`/// <reference types="@immediately-run/dev-fs/fs" />`
// keeps working as a deprecation-window alias), so there is exactly ONE copy and
// it lives with the platform.
//
// Activate via `/// <reference types="@immediately-run/sdk/ambient" />` (see
// ambient.d.ts). This lets app code import `fs` and type-check without pulling
// all of @types/node into the browser project. It intentionally only describes
// the supported async surface — there are no `*Sync` methods, and a
// re-declaration is where that constraint would quietly regress
// (check-ambient-types.mjs asserts both).
declare module 'fs' {
  type Encoding =
    | 'utf8'
    | 'utf-8'
    | 'ascii'
    | 'base64'
    | 'base64url'
    | 'hex'
    | 'latin1'
    | 'binary'
    | 'ucs2'
    | 'ucs-2'
    | 'utf16le';

  type PathLike = string;
  type WriteData = string | Uint8Array | ArrayBuffer | number[];
  type WriteOptions = Encoding | { encoding?: Encoding; mode?: number; flag?: string };

  export interface Stats {
    size: number;
    mode: number;
    uid: number;
    gid: number;
    dev: number;
    ino: number;
    nlink: number;
    rdev: number;
    blksize: number;
    blocks: number;
    atimeMs: number;
    mtimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
    atime: Date;
    mtime: Date;
    ctime: Date;
    birthtime: Date;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
  }

  export interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
  }

  export interface WatchEvent {
    eventType: 'rename' | 'change';
    filename: string | null;
  }

  export interface WatchOptions {
    recursive?: boolean;
    signal?: AbortSignal;
  }

  export interface FsPromises {
    readFile(path: PathLike, options: Encoding | { encoding: Encoding }): Promise<string>;
    readFile(path: PathLike, options?: { encoding?: null }): Promise<Uint8Array>;
    writeFile(path: PathLike, data: WriteData, options?: WriteOptions): Promise<void>;
    appendFile(path: PathLike, data: WriteData, options?: WriteOptions): Promise<void>;
    readdir(path: PathLike, options: { withFileTypes: true }): Promise<Dirent[]>;
    readdir(path: PathLike, options?: { withFileTypes?: false } | Encoding): Promise<string[]>;
    mkdir(path: PathLike, options?: { recursive?: boolean; mode?: number }): Promise<string | undefined>;
    rm(path: PathLike, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
    rmdir(path: PathLike, options?: { recursive?: boolean }): Promise<void>;
    unlink(path: PathLike): Promise<void>;
    stat(path: PathLike): Promise<Stats>;
    lstat(path: PathLike): Promise<Stats>;
    access(path: PathLike, mode?: number): Promise<void>;
    rename(oldPath: PathLike, newPath: PathLike): Promise<void>;
    copyFile(src: PathLike, dest: PathLike, mode?: number): Promise<void>;
    realpath(path: PathLike): Promise<string>;
    watch(path: PathLike, options?: WatchOptions): AsyncIterable<WatchEvent>;
  }

  export const promises: FsPromises;
  export const constants: {
    F_OK: number;
    X_OK: number;
    W_OK: number;
    R_OK: number;
    COPYFILE_EXCL: number;
  };

  interface DevFs {
    promises: FsPromises;
    constants: typeof constants;
  }

  const fs: DevFs;
  export default fs;
}

declare module 'node:fs' {
  import devFs from 'fs';
  export * from 'fs';
  export default devFs;
}
