#!/usr/bin/env -S deno run --allow-env --allow-read=. --allow-net
// deno-lint-ignore-file no-unused-vars
import { HttpScript, type Client, wait } from '../src/runtime.ts';

const script = new HttpScript("./examples/minimal.http");
script.addPlugin(await import("../src/plugins/console-log.ts"));

script.addStep({
  name: "Request #1",
  method: "GET",
  url: "https://da.gd/ip",
  headers: [
  ],
});

export default script;
if (import.meta.main) {
  await script.runNow();
}
