import { LogicTracer } from '@cloudydeno/opentelemetry/instrumentation/async.ts';
import type { PluginRegistration } from "../types.ts";

const fileTracer = new LogicTracer({ name: 'http.script' });
const stepTracer = new LogicTracer({ name: 'http.step' });
const testTracer = new LogicTracer({ name: 'http.test' });

/**
 * Wraps the http file's steps and tests with OpenTelemetry spans.
 * Best used with Deno's native otel support to export these spans
 * to your observability tool of choice.
 */
export const plugin: PluginRegistration = {
  name: 'opentelemetry',
  denoFlags: ['--unstable-otel'],
  create: () => ({

    wrapFile: (name, callable) => fileTracer
      .asyncSpan(name, {}, async (span) => {
        await callable();

        // Enable printing a trace viewer deeplink if configured
        const urlTemplate = Deno.env.get('OTEL_TRACE_URL_TEMPLATE');
        if (urlTemplate && span) {
          const ctx = span.spanContext();
          if (ctx.traceId == '00000000000000000000000000000000') {
            console.log(`\nTracing of this script run was not recorded.\n`);
          } else {
            const fullUrl = urlTemplate
              .replaceAll('{TraceId}', ctx.traceId)
              .replaceAll('{SpanId}', ctx.spanId);
            // TODO: should this be sent via client.log()?
            console.log(`\nTracing of this script run will be available at ${fullUrl}\n`);
          }
        }
      }),

    wrapStep: async (name, callable) => {
      await stepTracer
        .asyncSpan(`step: ${name}`, {
          attributes: {
            'httpfile.step_name': name,
          },
        }, callable);
      // We add a brief gap between steps so their spans won't be at risk of overlapping
      await new Promise(ok => setTimeout(ok, 10));
    },

    wrapTest: (name, callable) => testTracer
      .asyncSpan(`test: ${name}`, {
        attributes: {
          'httpfile.test_name': name,
        },
      }, callable),

  }),
};
