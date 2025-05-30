#!/usr/bin/env -S deno run --allow-read=. --allow-write=.
import { parseHttpFile } from "./parser.ts";
import type { HttpBlock } from "./types.ts";

if (import.meta.main) {
  if (Deno.args.length < 1) throw `Args: <input.http> [plugins...]`;
  await compileHttpFile({
    inputPath: Deno.args[0],
    outputPath: `${Deno.args[0]}.ts`,
    plugins: Deno.args.length > 1 ? Deno.args.slice(1) : null,
  });
}

export async function compileHttpFile(opts: {
  inputPath: string;
  importPath?: string;
  outputPath: string;
  plugins?: string[] | null;
}) {
  const blockStream = parseHttpFile(opts.inputPath);
  // const fileDepth = path.split('/').length - 1;
  // const rootPath = new Array(fileDepth).fill('..').join('/');
  const importPath = opts.importPath ?? import.meta.url
    .replace(/^https:\/\/jsr.io\/([^/]+\/[^/]+)\/([^/]+)\/src/, (_, pkg, ver) => `jsr:${pkg}@${ver}`)
    .replace(/\/[^/]+$/, '');
  const scriptStream = renderHttpScript(blockStream, importPath, opts.plugins ?? ['console-log']);
  const outputStream = ReadableStream
    .from(scriptStream)
    .pipeThrough(new TextEncoderStream());
  await Deno.writeFile(opts.outputPath, outputStream, {mode: 0o755});
  console.error(`Wrote ${opts.outputPath}`);
}

async function* renderHttpScript(
  blocks: AsyncGenerator<HttpBlock>,
  importPath: string,
  plugins: string[],
): AsyncGenerator<string> {
  yield [
    `#!/usr/bin/env -S deno run --allow-env --allow-read=. --allow-net`,
    `// deno-lint-ignore-file no-unused-vars`,
    `import { HttpClient, wait } from '${importPath}/runtime.ts';`,
    ...plugins.map(x => `import '${x.includes('/') ? x : `${importPath}/plugins/${x}.ts`}'`),
    `await HttpClient.run(async (client: HttpClient) => {`,
  ].join('\n')+'\n\n';

  for await (const block of blocks) {
    yield `await client.performStep({\n`;
    yield `  name: ${JSON.stringify(block.name)},\n`;
    yield `  method: ${JSON.stringify(block.method)},\n`;
    yield `  url: ${JSON.stringify(block.url)},\n`;
    yield `  headers: [\n`;
    for (const header of block.headers) {
      yield `    ${JSON.stringify(header)},\n`;
    }
    yield `  ],\n`;
    if (block.body) {
      yield `  body: ${JSON.stringify(block.body)},\n`;
    }
    if (block.preScript) {
      const transformed = transformScript(block.preScript);
      yield `  ${transformed.includes('await ') ? 'async ' : ''}preScript(request) {\n`;
      yield transformed+'\n';
      yield `  },\n`;
    }
    if (block.postScript) {
      const transformed = transformScript(block.postScript);
      yield `  ${transformed.includes('await ') ? 'async ' : ''}postScript(request, response) {\n`;
      yield transformed+'\n';
      yield `  },\n`;
    }
    yield `});\n\n`;
  }

  yield `});\n`;
}

function transformScript(text: string) {

  // The http file community has a 'wait' workaround for the lack of a delay function
  // We try to replace several versions of that with a proper async sleep
  text = text.replace(/const wait = seconds => \{[^}]+\};\n/, '');
  text = text.replace(/import {wait} from "[^"]+"\n/, '');
  text = text.replace(/^( +)(wait\()/m, (_,a,b) => `${a}await ${b}`);

  return text;
}
