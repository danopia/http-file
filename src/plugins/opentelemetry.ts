/**
 * Wraps the http file's steps and tests with OpenTelemetry spans.
 * Best used with Deno's native otel support to export these spans
 * to your observability tool of choice.
 *
 * You may find it helpful to have trace deeplinks included in the output.
 * To enable this, set the environment variable OTEL_TRACE_URL_TEMPLATE
 * The value will depend on your particular telemetry vendor.
 *
 * Example values, replacing <...> as appropriate:
 * - Datadog: https://<datadog-site>/apm/trace/{TraceId}?graphType=flamegraph&spanID={SpanIdDecimal}
 * - Jaeger: https://<some-jaeger-instance>/trace/{TraceId}?uiFind={SpanId}
 * - Honeycomb: https://ui.honeycomb.io/<team>/environments/<env>/trace?trace_id={TraceId}&span={SpanId}
 *
 * @module
 */

import { LogicTracer } from '@cloudydeno/opentelemetry/instrumentation/async.ts';
import type { Span } from '@cloudydeno/opentelemetry/pkg/api';

import type { PluginRegistration } from '../types.ts';
import moduleJson from '../../deno.json' with { type: 'json' };

const fileTracer = new LogicTracer({
  name: 'http.script',
  version: moduleJson.version,
});

const stepTracer = new LogicTracer({
  name: 'http.step',
  version: moduleJson.version,
  requireParent: true,
});

const testTracer = new LogicTracer({
  name: 'http.test',
  version: moduleJson.version,
  requireParent: true,
});

/** Client plugin which wraps files, steps, and tests with OpenTelemetry spans. */
export const plugin: PluginRegistration = {
  name: 'opentelemetry',
  denoFlags: ['--unstable-otel'],
  create: () => ({

    wrapFile: (name, callable) => fileTracer
      .asyncSpan(name, {}, async (span) => {
        try {
          await callable();
        } finally {
          maybePrintTraceLink(span);
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

/**
 * Print a trace viewer deeplink if configured via enviroment.
 * @param span The particular span to deeplink to
 */
function maybePrintTraceLink(span: Span | null) {
  const urlTemplate = Deno.env.get('OTEL_TRACE_URL_TEMPLATE');
  if (urlTemplate && span) {
    const ctx = span.spanContext();
    // Not a very solid heuristic
    if (ctx.traceId == '00000000000000000000000000000000') {
      console.log(`\nTracing of this script run was not recorded.\n`);
    } else {
      const fullUrl = urlTemplate
        .replaceAll('{TraceId}', ctx.traceId)
        .replaceAll('{TraceIdDecimal}', BigInt(`0x${ctx.traceId}`).toString(10))
        .replaceAll('{SpanId}', ctx.spanId)
        .replaceAll('{SpanIdDecimal}', BigInt(`0x${ctx.spanId}`).toString(10));
      // TODO: should this be sent via client.log()?
      console.log(`\nTracing of this script run will be available at ${fullUrl}\n`);
    }
  }
}
