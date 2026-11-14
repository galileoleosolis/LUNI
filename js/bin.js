// Fetch a binary file as an ArrayBuffer.
// Some hosts only serve text, so when LUNO_B64 is set the file is read from "<url>.b64.txt" (base64) instead.
export async function fetchBytes(url) {
  if (!globalThis.LUNO_B64) return (await fetch(url)).arrayBuffer();
  const b64 = await (await fetch(url + ".b64.txt")).text();
  const bin = atob(b64.trim()), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function gunzip(buffer) {
  return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}
