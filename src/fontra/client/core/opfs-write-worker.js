"use strict";

// This Web Worker script is needed to write files to the Origin Private File System
// (OPFS) in Safari. Safari (as of august 2023) does not support the createWritable()
// API, but does support the synchronous createSyncAccessHandle() API, but it is only
// available from Web Workers. So we use a Web Worker.

onmessage = async (event) => {
  const result = {};
  try {
    result.returnValue = await writeFileToOPFS(event.data.path, event.data.file);
  } catch (error) {
    console.error(error);
    result.error = error.toString();
  }
  postMessage(result);
};

async function writeFileToOPFS(path, file) {
  const fileName = path.at(-1);
  if (!fileName) {
    throw new Error("invalid path");
  }
  const root = await navigator.storage.getDirectory();
  let dir = root;
  for (const dirName of path.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(dirName, { create: true });
  }

  const buffer = await bufferFromFile(file);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createSyncAccessHandle();
  try {
    writable.write(buffer, { at: 0 });
  } finally {
    writable.close();
  }
}

async function bufferFromFile(file) {
  const reader = new FileReader();
  const arrayBuffer = await new Promise((resolve) => {
    reader.onload = (event) => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
  return new DataView(arrayBuffer, 0);
}
