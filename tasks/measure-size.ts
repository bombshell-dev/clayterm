import { gzipSync } from "node:zlib";

const dir = "build/npm/esm";
const results: Array<{ file: string; raw: number; gzip: number }> = [];

for await (const entry of Deno.readDir(dir)) {
  if (!entry.isFile) continue;
  let path = `${dir}/${entry.name}`;
  let data = await Deno.readFile(path);
  results.push({
    file: entry.name,
    raw: data.byteLength,
    gzip: gzipSync(data).byteLength,
  });
}

results.sort((a, b) => a.file.localeCompare(b.file));
console.log(JSON.stringify(results));
