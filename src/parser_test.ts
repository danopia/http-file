import { parseHttpSyntax } from "./parser.ts";
import { assertEquals } from "@std/assert/equals";
import { assertObjectMatch } from "@std/assert/object-match";

async function parseFromLines(lines: string[]) {
  const textStream = ReadableStream.from(lines.map(x => `${x}\n`));
  return await Array.fromAsync(parseHttpSyntax(textStream));
}

Deno.test('parses most minimal file', async () => {
  const blocks = await parseFromLines([
    'https://da.gd',
  ]);
  assertEquals(blocks.length, 1);
  assertObjectMatch(blocks[0], {
    method: 'GET',
    url: 'https://da.gd',
    headers: [],
  });
});

Deno.test('parses very minimal file', async () => {
  const blocks = await parseFromLines([
    'HEAD https://da.gd',
  ]);
  assertEquals(blocks.length, 1);
  assertObjectMatch(blocks[0], {
    method: 'HEAD',
    url: 'https://da.gd',
    headers: [],
  });
});

Deno.test('parses http message', async () => {
  const blocks = await parseFromLines([
    'POST https://da.gd',
    'content-type: text/plain',
    '',
    'a body',
    '',
  ]);
  assertEquals(blocks.length, 1);
  assertObjectMatch(blocks[0], {
    method: 'POST',
    url: 'https://da.gd',
    headers: [
      ['content-type', 'text/plain'],
    ],
    body: 'a body\n',
  });
});

Deno.test('parses both requests', async () => {
  const blocks = await parseFromLines([
    '### first',
    'POST https://da.gd/1',
    'content-type: text/plain',
    '',
    'a body',
    '',
    '### second',
    'POST https://da.gd/2',
    'content-type: text/plain',
    '',
    'a body',
    '',
  ]);
  assertEquals(blocks.length, 2);
  assertObjectMatch(blocks[0], {
    method: 'POST',
    url: 'https://da.gd/1',
    headers: [
      ['content-type', 'text/plain'],
    ],
    body: 'a body\n',
  });
  assertObjectMatch(blocks[1], {
    method: 'POST',
    url: 'https://da.gd/2',
    headers: [
      ['content-type', 'text/plain'],
    ],
    body: 'a body\n',
  });
});

Deno.test('rejoins a url spanning lines', async () => {
  const blocks = await parseFromLines([
    '### Query an API',
    'GET https://api/query?accountId={{customerID}}&limit=25&orderBy=code&',
    '    orderByDesc=true&skip=0',
    'Accept: application/json',
    '',
  ]);
  assertEquals(blocks.length, 1);
  assertObjectMatch(blocks[0], {
    name: 'Query an API',
    method: 'GET',
    headers: [
      ['Accept', 'application/json'],
    ],
    body: '',
  });
  assertEquals(blocks[0].url, 'https://api/query?accountId={{customerID}}&limit=25&orderBy=code&orderByDesc=true&skip=0');
});
