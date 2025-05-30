import { LogicTracer } from '@cloudydeno/opentelemetry/instrumentation/async.ts';

import { ActivePlugins } from "../plugin.ts";

const fileTracer = new LogicTracer({ name: 'http.script' });
const stepTracer = new LogicTracer({ name: 'http.step' });
const testTracer = new LogicTracer({ name: 'http.test' });

ActivePlugins.push({
  name: 'OpenTelemetry',

  wrapFile: (callable) => fileTracer
    .asyncSpan(Deno.env.get('OTEL_ROOT_SPAN_NAME') ?? 'execution', {}, callable),

  wrapStep: (name, callable) => stepTracer
    .asyncSpan(`step: ${name}`, {
      attributes: {
        'httpfile.step_name': name,
      },
    }, async () => {
      await callable();
      // We force a gap between steps so they can't overlap
      await new Promise(ok => setTimeout(ok, 50));
    }),

  wrapTest: (name, callable) => testTracer
    .asyncSpan(`test: ${name}`, {
      attributes: {
        'httpfile.test_name': name,
      },
    }, callable),

});
