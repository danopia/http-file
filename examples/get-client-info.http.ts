#!/usr/bin/env -S deno run --allow-env --allow-read=. --allow-net
// deno-lint-ignore-file no-unused-vars
import { HttpScript, type Client, wait } from '../src/runtime.ts';

const script = new HttpScript("./examples/get-client-info.http");
script.addPlugin(await import("../src/plugins/console-log.ts"));

script.addStep({
  name: "Get my IP Address",
  method: "GET",
  url: "https://da.gd/ip",
  headers: [
    ["Accept","text/plain"],
  ],
  postScript(client: Client, request, response) {
    client.test("Request executed successfully", function() {
        client.assert(response.status === 200, "Response status is not 200");
    });

    client.global.set("ipAddress", response.body);
  },
});

script.addStep({
  name: "Format IP Address with cowsay",
  method: "GET",
  url: "https://da.gd/cow?say=My+IP+address+is+{{ipAddress}}",
  headers: [
    ["Accept","text/plain"],
  ],
  postScript(client: Client, request, response) {
    client.test("Request executed successfully", function() {
        client.assert(response.status === 200, "Response status is not 200");
    });

    client.log(response.body);
  },
});

script.addStep({
  name: "Get my request headers",
  method: "GET",
  url: "https://da.gd/headers",
  headers: [
    ["Accept","text/plain"],
  ],
  postScript(client: Client, request, response) {
    client.test("Request executed successfully", function() {
        client.assert(response.status === 200, "Response status is not 200");
    });
    client.test("Server received our specified headers", function() {
        client.assert(typeof response.body == 'string', "Response body is not a string");
        client.assert(response.body.includes('text/plain'), "Server didn't receive Accept header");
    });

    client.log(`Received request headers:\n${response.body}`);
  },
});

export default script;
if (import.meta.main) {
  await script.runNow();
}
