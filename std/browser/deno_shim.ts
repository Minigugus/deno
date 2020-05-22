// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.

type DenoNamespace = typeof Deno;
type DenoEnv = DenoNamespace["env"];

let denoShim: DenoNamespace | undefined;
let purge: () => void | undefined;

/** De-reference any virtual files that are closed, so that their contents
 * can be garbage collected.  The contents of the virtual files will be lost,
 * if there are no other resources that have the file open. */
export function purgeResources(): void {
  purge && purge();
}

import type { SeekMode } from "./_ops_shim.ts";

export async function getDenoShim(): Promise<DenoNamespace> {
  if (denoShim) {
    return denoShim;
  }

  const {
    Buffer,
    readAll,
    readAllSync,
    writeAll,
    writeAllSync,
  } = await import("../../cli/js/buffer.ts");
  const { DiagnosticCategory } = await import("../../cli/js/diagnostics.ts");
  const { errors } = await import("../../cli/js/errors.ts");
  const { copy, iter, iterSync } = await import("../../cli/js/io.ts");
  const {
    close,
    copyFile: opCopyFile,
    getResources: resources,
    open: opOpen,
    purgeResources,
    read,
    readSync,
    seek,
    SeekMode,
    seekSync,
    truncate: opTruncate,
    write,
    writeSync,
  } = await import("./_ops_shim.ts");

  purge = purgeResources;

  function readOnly(value: unknown): PropertyDescriptor {
    return {
      value,
      writable: false,
      enumerable: true,
      configurable: false,
    };
  }

  function exit(): void {
    window && window.close();
  }

  class Env implements DenoEnv {
    #env: Record<string, string> = {};

    get(key: string): string | undefined {
      return this.#env[key];
    }
    set(key: string, value: string): void {
      this.#env[key] = value;
    }
    toObject(): Record<string, string> {
      return { ...this.#env };
    }
  }

  const env: DenoNamespace["env"] = new Env();

  function cwd(): string {
    if (window && (window as any).location) {
      const loc: URL = (window as any).location;
      return `${loc.origin}${loc.pathname}`;
    }
    return "";
  }

  class File implements Deno.File {
    constructor(readonly rid: number) {}

    write(p: Uint8Array): Promise<number> {
      return write(this.rid, p);
    }

    writeSync(p: Uint8Array): number {
      return writeSync(this.rid, p);
    }

    read(p: Uint8Array): Promise<number | null> {
      return read(this.rid, p);
    }

    readSync(p: Uint8Array): number | null {
      return readSync(this.rid, p);
    }

    seek(offset: number, whence: SeekMode): Promise<number> {
      return seek(this.rid, offset, whence);
    }

    seekSync(offset: number, whence: SeekMode): number {
      return seekSync(this.rid, offset, whence);
    }

    close(): void {
      close(this.rid);
    }
  }

  function checkOpenOptions(options: Deno.OpenOptions): void {
    if (Object.values(options).some((val) => val === true)) {
      throw new Error("OpenOptions requires at least one option to be true");
    }

    if (options.truncate && !options.write) {
      throw new Error("'truncate' option requires 'write' option");
    }

    const createOrCreateNewWithoutWriteOrAppend =
      (options.create || options.createNew) &&
      !(options.write || options.append);

    if (createOrCreateNewWithoutWriteOrAppend) {
      throw new Error(
        "'create' or 'createNew' options require 'write' or 'append' option",
      );
    }
  }

  function open(
    path: string,
    options: Deno.OpenOptions = { read: true },
  ): Promise<File> {
    try {
      checkOpenOptions(options);
      const rid = opOpen(path, options);
      return Promise.resolve(new File(rid));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function openSync(
    path: string,
    options: Deno.OpenOptions = { read: true },
  ): File {
    checkOpenOptions(options);
    const rid = opOpen(path, options);
    return new File(rid);
  }

  function create(path: string): Promise<File> {
    return open(path, {
      read: true,
      write: true,
      truncate: true,
      create: true,
    });
  }

  function createSync(path: string): File {
    return openSync(path, {
      read: true,
      write: true,
      truncate: true,
      create: true,
    });
  }

  class Stdin implements Deno.Reader, Deno.ReaderSync, Deno.Closer {
    readonly rid: number;
    constructor() {
      this.rid = opOpen("/dev/stdin", { read: true });
    }

    read(p: Uint8Array): Promise<number | null> {
      return read(this.rid, p);
    }

    readSync(p: Uint8Array): number | null {
      return readSync(this.rid, p);
    }

    close(): void {
      close(this.rid);
    }
  }

  class Stdout implements Deno.Writer, Deno.WriterSync, Deno.Closer {
    readonly rid: number;
    constructor() {
      this.rid = opOpen("/dev/stdout", { write: true });
    }

    write(p: Uint8Array): Promise<number> {
      return write(this.rid, p);
    }

    writeSync(p: Uint8Array): number {
      return writeSync(this.rid, p);
    }

    close(): void {
      close(this.rid);
    }
  }

  class Stderr implements Deno.Writer, Deno.WriterSync, Deno.Closer {
    readonly rid: number;
    constructor() {
      this.rid = opOpen("/dev/stderr", { write: true });
    }

    write(p: Uint8Array): Promise<number> {
      return write(this.rid, p);
    }

    writeSync(p: Uint8Array): number {
      return writeSync(this.rid, p);
    }

    close(): void {
      close(this.rid);
    }
  }

  const stdin = new Stdin();
  const stdout = new Stdout();
  const stderr = new Stderr();

  function isatty(): boolean {
    return false;
  }

  function makeTempDirSync(
    { dir = "/tmp", prefix = "", suffix = "" }: Deno.MakeTempOptions = {},
  ): string {
    const str = Math.random().toString(36).substring(7);
    return `${dir}${dir.match(/\/$/) ? "" : "/"}${prefix}${str}${suffix}`;
  }

  function makeTempDir(options?: Deno.MakeTempOptions): Promise<string> {
    return Promise.resolve(makeTempDirSync(options));
  }

  function makeTempFileSync(options?: Deno.MakeTempOptions): string {
    const str = makeTempDirSync(options);
    opOpen(str, { read: true });
    return str;
  }

  function makeTempFile(options?: Deno.MakeTempOptions): Promise<string> {
    return Promise.resolve(makeTempFileSync(options));
  }

  const decoder = new TextDecoder();

  function readTextFileSync(path: string): string {
    const file = openSync(path);
    const content = readAllSync(file);
    file.close();
    return decoder.decode(content);
  }

  function readTextFile(path: string): Promise<string> {
    return Promise.resolve(readTextFileSync(path));
  }

  function readFileSync(path: string): Uint8Array {
    const file = openSync(path);
    const content = readAllSync(file);
    file.close();
    return content;
  }

  function readFile(path: string): Promise<Uint8Array> {
    return Promise.resolve(readFileSync(path));
  }

  function realPathSync(path: string): string {
    return path;
  }

  function realPath(path: string): Promise<string> {
    return Promise.resolve(realPathSync(path));
  }

  function copyFileSync(fromPath: string, toPath: string): void {
    opCopyFile(fromPath, toPath);
  }

  // eslint-disable-next-line require-await
  async function copyFile(fromPath: string, toPath: string): Promise<void> {
    copyFileSync(fromPath, toPath);
  }

  function writeFileSync(
    path: string,
    data: Uint8Array,
    options: Deno.WriteFileOptions,
  ): void {
    const openOptions = !!options.append
      ? { write: true, create: true, append: true }
      : { write: true, create: true, truncate: true };
    const file = openSync(path, openOptions);

    writeAllSync(file, data);
    file.close();
  }

  // eslint-disable-next-line require-await
  async function writeFile(
    path: string,
    data: Uint8Array,
    options: Deno.WriteFileOptions,
  ): Promise<void> {
    writeFileSync(path, data, options);
  }

  const encoder = new TextEncoder();

  function writeTextFileSync(path: string, data: string): void {
    const file = openSync(path, { write: true, create: true, truncate: true });
    const contents = encoder.encode(data);
    writeAllSync(file, contents);
    file.close();
  }

  // eslint-disable-next-line require-await
  async function writeTextFile(path: string, data: string): Promise<void> {
    writeTextFileSync(path, data);
  }

  function truncateSync(path: string, len?: number): void {
    opTruncate(path, len);
  }

  // eslint-disable-next-line require-await
  async function truncate(path: string, len?: number): Promise<void> {
    opTruncate(path, len);
  }

  function metrics(): Deno.Metrics {
    return {
      opsDispatched: 0,
      opsDispatchedSync: 0,
      opsDispatchedAsync: 0,
      opsDispatchedAsyncUnref: 0,
      opsCompleted: 0,
      opsCompletedSync: 0,
      opsCompletedAsync: 0,
      opsCompletedAsyncUnref: 0,
      bytesSentControl: 0,
      bytesSentData: 0,
      bytesReceived: 0,
    };
  }

  const build = {
    target: "browser",
    arch: "x86_64",
    os: "browser",
    vendor: "browser",
  };

  Object.freeze(build);

  const version: Deno.Version = {
    deno: "0.0.0",
    typescript: "0.0.0",
    v8: "0.0.0",
  };

  Object.freeze(build);

  const customInspect = Symbol.for("custom inspect");

  function noop(): void {}
  async function asyncNoop(): Promise<void> {}
  function* genNoop(): Iterable<void> {}
  async function* asyncGenNoop(): AsyncIterable<void> {}
  function notImplemented(): never {
    throw new Error("This feature is not implemented in browsers.");
  }

  const shim: DenoNamespace = Object.create(null);

  Object.defineProperties(shim, {
    "errors": readOnly(errors),
    "pid": readOnly(0),
    "noColor": readOnly(true),
    // TODO figure out what to do about the test interface
    "test": readOnly(noop),
    "exit": readOnly(exit),
    "env": readOnly(env),
    "execPath": readOnly(() => "/usr/bin/deno"),
    "chdir": readOnly(noop),
    "cwd": readOnly(cwd),
    "SeekMode": readOnly(SeekMode),
    "copy": readOnly(copy),
    "iter": readOnly(iter),
    "iterSync": readOnly(iterSync),
    "open": readOnly(open),
    "openSync": readOnly(openSync),
    "create": readOnly(create),
    "createSync": readOnly(createSync),
    "read": readOnly(read),
    "readSync": readOnly(readSync),
    "write": readOnly(write),
    "writeSync": readOnly(writeSync),
    "seek": readOnly(seek),
    "seekSync": readOnly(seekSync),
    "close": readOnly(close),
    "File": readOnly(File),
    "stdin": readOnly(stdin),
    "stdout": readOnly(stdout),
    "stderr": readOnly(stderr),
    "isatty": readOnly(isatty),
    "Buffer": readOnly(Buffer),
    "readAll": readOnly(readAll),
    "readAllSync": readOnly(readAllSync),
    "writeAll": readOnly(writeAll),
    "writeAllSync": readOnly(writeAllSync),
    "mkdirSync": readOnly(noop),
    "mkdir": readOnly(asyncNoop),
    "makeTempDirSync": readOnly(makeTempDirSync),
    "makeTempDir": readOnly(makeTempDir),
    "makeTempFileSync": readOnly(makeTempFileSync),
    "makeTempFile": readOnly(makeTempFile),
    "chmodSync": readOnly(noop),
    "chmod": readOnly(asyncNoop),
    "chownSync": readOnly(noop),
    "chown": readOnly(asyncNoop),
    // TODO consider implementing
    "removeSync": readOnly(noop),
    // TODO consider implementing
    "remove": readOnly(asyncNoop),
    // TODO consider implementing
    "renameSync": readOnly(noop),
    // TODO consider implementing
    "rename": readOnly(asyncNoop),
    "readTextFileSync": readOnly(readTextFileSync),
    "readTextFile": readOnly(readTextFile),
    "readFileSync": readOnly(readFileSync),
    "readFile": readOnly(readFile),
    "realPathSync": readOnly(realPathSync),
    "realPath": readOnly(realPath),
    // TODO consider implementing
    "readDirSync": readOnly(genNoop),
    // TODO consider implementing
    "readDir": readOnly(asyncGenNoop),
    "copyFileSync": readOnly(copyFileSync),
    "copyFile": readOnly(copyFile),
    "readLinkSync": readOnly(notImplemented),
    "readLink": readOnly(notImplemented),
    "lstat": readOnly(notImplemented),
    "lstatSync": readOnly(notImplemented),
    "stat": readOnly(notImplemented),
    "statSync": readOnly(notImplemented),
    "writeFileSync": readOnly(writeFileSync),
    "writeFile": readOnly(writeFile),
    "writeTextFileSync": readOnly(writeTextFileSync),
    "writeTextFile": readOnly(writeTextFile),
    "truncateSync": readOnly(truncateSync),
    "truncate": readOnly(truncate),
    "listen": readOnly(notImplemented),
    "listenTls": readOnly(notImplemented),
    "connect": readOnly(notImplemented),
    "connectTls": readOnly(notImplemented),
    "metrics": readOnly(metrics),
    "resources": readOnly(resources),
    "watchFs": readOnly(asyncGenNoop),
    "Process": readOnly(notImplemented),
    "run": readOnly(notImplemented),
    // TODO consider implementing
    "inspect": readOnly(notImplemented),
    "build": readOnly(build),
    "version": readOnly(version),
    "args": readOnly([]),
    "customInspect": readOnly(customInspect),
    // Intentionally not in Deno namespace
    "internal": readOnly(Symbol.for("Deno internal")),
    "core": readOnly({}),
    // TODO see: https://github.com/denoland/deno/issues/5744
    "DiagnosticCategory": readOnly(DiagnosticCategory),
    // TODO see: https://github.com/denoland/deno/issues/5745
    "dir": readOnly(notImplemented),
  });

  Object.freeze(shim);
  return shim;
}

if (!("Deno" in window)) {
  Object.defineProperty(
    window,
    "Deno",
    { value: await getDenoShim(), enumerable: true },
  );
}
