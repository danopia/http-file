import { ActivePlugins } from "../plugin.ts";

// Simple plugin to print results to the console
ActivePlugins.push({
  name: 'Console Log',

  emitLog(text) {
    console.log(text.split('\n').map(x => `    ${x}`).join('\n'));
  },

  async wrapStep(name, callable) {
    console.log(`\n### ${name}`);
    await callable();
    console.log('');
  },

  async wrapTest(name, callable) {
    try {
      await callable();
      console.log(`PASS: ${name}`);
    } catch (err) {
      console.log(`FAIL: ${name}`);
      throw err;
    }
  },

  async wrapFetch(callable, request) {
    console.log(`-->`, request.method, request.url);
    const resp = await callable(request);
    console.log(`<-- HTTP`, resp.status, resp.statusText);
    console.log('');
    return resp;
  },
});
