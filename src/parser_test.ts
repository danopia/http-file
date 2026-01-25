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

// https://www.jetbrains.com/help/idea/exploring-http-syntax.html#http_request_names
Deno.test('request naming styles', async () => {
  const blocks = await parseFromLines([
    '### Request',
    'GET https://dummy.restapiexample.com/api/v1/employee/1',
    '',
    '###',
    '# @name AnotherRequest',
    'GET https://dummy.restapiexample.com/api/v1/employee/2',
    '',
    '###',
    '# @name=One More Request',
    'GET https://dummy.restapiexample.com/api/v1/employee/3',
  ]);
  assertEquals(blocks.length, 3);
  assertEquals(blocks[0].name, 'Request');
  assertEquals(blocks[1].name, 'AnotherRequest');
  assertEquals(blocks[2].name, 'One More Request');
});

// https://www.jetbrains.com/help/idea/exploring-http-syntax.html#break-long-requests-into-several-lines
Deno.test('request url line breaking', async () => {
  const blocks = await parseFromLines([
    'GET https://example.com:8080/api/get/html?',
    '    firstname=John&',
    '    lastname=Doe&',
    '    planet=Tatooine&',
    '    town=Freetown',
  ]);
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].url, 'https://example.com:8080/api/get/html?firstname=John&lastname=Doe&planet=Tatooine&town=Freetown');
});

// https://www.jetbrains.com/help/idea/exploring-http-syntax.html#specify-request-timeouts
Deno.test('timeout tag parsing', async () => {
  const blocks = await parseFromLines([
    '# @timeout 600',
    '// @connection-timeout 2 m',
    'GET example.com/api',
  ]);
  assertEquals(blocks.length, 1);
  assertObjectMatch(blocks[0], {
    method: 'GET',
    url: 'example.com/api',
    tags: {
      'timeout': { value: 600, unit: null },
      'connection-timeout': { value: 2, unit: 'm' },
    },
    headers: [],
    body: '',
  });
});

// TODO: who is supposed to reconcile this whitespace?
// Deno.test('request urlencoded body line breaking', async () => {
//   const blocks = await parseFromLines([
//     'POST https://ijhttp-examples.jetbrains.com/post',
//     'Content-Type: application/x-www-form-urlencoded',
//     '',
//     'key1 = value1 &',
//     'key2 = value2 &',
//     'key3 = value3 &',
//     'key4 = value4 &',
//     'key5 = value5',
//     '',
//   ]);
//   assertEquals(blocks.length, 1);
//   assertEquals(blocks[0].body, 'key1=value1&key2=value2&key3=value3&key4=value4&key5=value5');
// });
