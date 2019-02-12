// Copyright 2018-2019 the Deno authors. All rights reserved. MIT license.
import { testPerm, assert, assertEqual } from "./test_util.ts";

function readFileString(filename: string): string {
  const dataRead = Deno.readFileSync(filename);
  const dec = new TextDecoder("utf-8");
  return dec.decode(dataRead);
}

function writeFileString(filename: string, s: string) {
  const enc = new TextEncoder();
  const data = enc.encode(s);
  Deno.writeFileSync(filename, data, { perm: 0o666 });
}

function assertSameContent(filename1: string, filename2: string) {
  const data1 = Deno.readFileSync(filename1);
  const data2 = Deno.readFileSync(filename2);
  assertEqual(data1, data2);
}

testPerm({ read: true, write: true }, function copyFileSyncSuccess() {
  const tempDir = Deno.makeTempDirSync();
  const fromFilename = tempDir + "/from.txt";
  const toFilename = tempDir + "/to.txt";
  writeFileString(fromFilename, "Hello world!");
  Deno.copyFileSync(fromFilename, toFilename);
  // No change to original file
  assertEqual(readFileString(fromFilename), "Hello world!");
  // Original == Dest
  assertSameContent(fromFilename, toFilename);
});

testPerm({ write: true, read: true }, function copyFileSyncFailure() {
  const tempDir = Deno.makeTempDirSync();
  const fromFilename = tempDir + "/from.txt";
  const toFilename = tempDir + "/to.txt";
  // We skip initial writing here, from.txt does not exist
  let err;
  try {
    Deno.copyFileSync(fromFilename, toFilename);
  } catch (e) {
    err = e;
  }
  assert(!!err);
  assertEqual(err.kind, Deno.ErrorKind.NotFound);
  assertEqual(err.name, "NotFound");
});

testPerm({ write: true, read: false }, function copyFileSyncPerm1() {
  let caughtError = false;
  try {
    Deno.copyFileSync("/from.txt", "/to.txt");
  } catch (e) {
    caughtError = true;
    assertEqual(e.kind, Deno.ErrorKind.PermissionDenied);
    assertEqual(e.name, "PermissionDenied");
  }
  assert(caughtError);
});

testPerm({ write: false, read: true }, function copyFileSyncPerm2() {
  let caughtError = false;
  try {
    Deno.copyFileSync("/from.txt", "/to.txt");
  } catch (e) {
    caughtError = true;
    assertEqual(e.kind, Deno.ErrorKind.PermissionDenied);
    assertEqual(e.name, "PermissionDenied");
  }
  assert(caughtError);
});

testPerm({ read: true, write: true }, function copyFileSyncOverwrite() {
  const tempDir = Deno.makeTempDirSync();
  const fromFilename = tempDir + "/from.txt";
  const toFilename = tempDir + "/to.txt";
  writeFileString(fromFilename, "Hello world!");
  // Make Dest exist and have different content
  writeFileString(toFilename, "Goodbye!");
  Deno.copyFileSync(fromFilename, toFilename);
  // No change to original file
  assertEqual(readFileString(fromFilename), "Hello world!");
  // Original == Dest
  assertSameContent(fromFilename, toFilename);
});

testPerm({ read: true, write: true }, async function copyFileSuccess() {
  const tempDir = Deno.makeTempDirSync();
  const fromFilename = tempDir + "/from.txt";
  const toFilename = tempDir + "/to.txt";
  writeFileString(fromFilename, "Hello world!");
  await Deno.copyFile(fromFilename, toFilename);
  // No change to original file
  assertEqual(readFileString(fromFilename), "Hello world!");
  // Original == Dest
  assertSameContent(fromFilename, toFilename);
});

testPerm({ read: true, write: true }, async function copyFileFailure() {
  const tempDir = Deno.makeTempDirSync();
  const fromFilename = tempDir + "/from.txt";
  const toFilename = tempDir + "/to.txt";
  // We skip initial writing here, from.txt does not exist
  let err;
  try {
    await Deno.copyFile(fromFilename, toFilename);
  } catch (e) {
    err = e;
  }
  assert(!!err);
  assertEqual(err.kind, Deno.ErrorKind.NotFound);
  assertEqual(err.name, "NotFound");
});

testPerm({ read: true, write: true }, async function copyFileOverwrite() {
  const tempDir = Deno.makeTempDirSync();
  const fromFilename = tempDir + "/from.txt";
  const toFilename = tempDir + "/to.txt";
  writeFileString(fromFilename, "Hello world!");
  // Make Dest exist and have different content
  writeFileString(toFilename, "Goodbye!");
  await Deno.copyFile(fromFilename, toFilename);
  // No change to original file
  assertEqual(readFileString(fromFilename), "Hello world!");
  // Original == Dest
  assertSameContent(fromFilename, toFilename);
});

testPerm({ read: false, write: true }, async function copyFilePerm1() {
  let caughtError = false;
  try {
    await Deno.copyFile("/from.txt", "/to.txt");
  } catch (e) {
    caughtError = true;
    assertEqual(e.kind, Deno.ErrorKind.PermissionDenied);
    assertEqual(e.name, "PermissionDenied");
  }
  assert(caughtError);
});

testPerm({ read: true, write: false }, async function copyFilePerm2() {
  let caughtError = false;
  try {
    await Deno.copyFile("/from.txt", "/to.txt");
  } catch (e) {
    caughtError = true;
    assertEqual(e.kind, Deno.ErrorKind.PermissionDenied);
    assertEqual(e.name, "PermissionDenied");
  }
  assert(caughtError);
});
