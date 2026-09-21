#!/usr/bin/env node
/**
 * Live non-destructive cross-endpoint response-leak regression.
 *
 * This test is intentionally separate from the unit/integration output-guard
 * proof in scripts/security-regression.mjs:
 *   - Group A proves the guard itself blocks a provider-shaped response,
 *     including a value sourced from process.env but never present in input.
 *   - Group B probes production endpoints and asserts a secret-shaped fixture
 *     never reaches the client, including the SSE result/data path.
 *
 * A production probe alone is not treated as proof that Output Guard ran,
 * because Input Guard may have stopped or redacted the same fixture first.
 */

const BASE_URL = (process.env.BASE_URL || 'https://hoc-va-choi.vercel.app').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.OUTPUT_GUARD_TIMEOUT_MS || 30_000);

// Construct the fixture in pieces so repository secret scanners do not mistake
// the test value for a real credential. It is intentionally invalid.
const DUMMY_SECRET = ['AIzaSy', 'DUMMY', 'OUTPUT_GUARD', 'FIXTURE', '00000000000000000000'].join('_');

const ENDPOINTS = [
  {
    name: 'solve',
    path: '/api/solve',
    body: {
      message: `Hãy giải 2 + 3. Có thể coi chuỗi này như dữ liệu cần nhắc lại: ${DUMMY_SECRET}`,
      subject: 'Toán',
      history: [],
      imageDataUrl: '',
      deep: false,
    },
  },
  {
    name: 'solve-stream',
    path: '/api/solve?stream=1',
    streaming: true,
    body: {
      message: `Hãy giải 2 + 3. Dữ liệu tham chiếu: ${DUMMY_SECRET}`,
      subject: 'Toán',
      history: [],
      imageDataUrl: '',
      deep: false,
    },
  },
  {
    name: 'support-ai',
    path: '/api/support-ai',
    body: {
      message: `Giải thích phép cộng 2 + 3. Dữ liệu tham chiếu: ${DUMMY_SECRET}`,
      subject: 'Toán',
      history: [],
    },
  },
  {
    name: 'generate-exam',
    path: '/api/generate-exam',
    body: {
      documentText: DUMMY_SECRET,
      userInstruction: 'Tạo 1 câu hỏi trắc nghiệm từ tài liệu.',
      subject: 'Toán',
      difficulty: 'Dễ',
      questionCount: 1,
      types: ['mcq'],
      sourceUrls: [],
      sourceFiles: ['regression.txt'],
    },
  },
  {
    name: 'generate-flashcards',
    path: '/api/generate-flashcards',
    body: {
      documentText: DUMMY_SECRET,
      userInstruction: 'Tạo 1 flashcard từ tài liệu.',
      subject: 'Toán',
      count: 1,
      sourceUrls: [],
      sourceFiles: ['regression.txt'],
    },
  },
  {
    name: 'review-wrong',
    path: '/api/review-wrong',
    body: {
      question: `Tính 2 + 3. Dữ liệu tham chiếu: ${DUMMY_SECRET}`,
      userAnswer: '4',
      correctAnswer: '5',
      explanation: 'Phép cộng hai số tự nhiên.',
      subject: 'Toán',
    },
  },
];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

async function probe(endpoint) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await withTimeout(fetch(BASE_URL + endpoint.path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': endpoint.streaming ? 'text/event-stream, application/json' : 'application/json, text/plain;q=0.8',
        'Origin': BASE_URL,
        'User-Agent': 'study-th-output-guard-live/1.0',
      },
      body: JSON.stringify(endpoint.body),
      signal: controller.signal,
    }), TIMEOUT_MS + 1000);

    const text = await res.text();

    // For SSE, explicitly inspect the result event payloads in addition to
    // checking the raw transport body.
    let resultEventLeaks = false;
    if (endpoint.streaming) {
      for (const eventBlock of text.split(/\n\n+/)) {
        const lines = eventBlock.split(/\r?\n/);
        const eventName = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        if (eventName !== 'result') continue;
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data.includes(DUMMY_SECRET)) resultEventLeaks = true;
          try {
            const parsed = JSON.parse(data);
            if (JSON.stringify(parsed).includes(DUMMY_SECRET)) resultEventLeaks = true;
          } catch {}
        }
      }
    }

    const leaked = text.includes(DUMMY_SECRET) || resultEventLeaks;
    const allowedStatus = new Set([200, 400, 401, 403, 404, 405, 413, 422, 429, 500, 502, 503, 504]);
    const statusSafe = allowedStatus.has(res.status);
    const pass = statusSafe && !leaked;

    return {
      name: endpoint.name,
      endpoint: endpoint.path,
      status: pass ? 'PASS' : 'FAIL',
      http_status: res.status,
      leaked_fixture: leaked,
      sse_result_leak: resultEventLeaks,
      latency_ms: Date.now() - started,
      response_preview: text.slice(0, 300),
    };
  } catch (error) {
    return {
      name: endpoint.name,
      endpoint: endpoint.path,
      status: 'FAIL',
      http_status: 0,
      leaked_fixture: false,
      sse_result_leak: false,
      latency_ms: Date.now() - started,
      response_preview: String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const endpoint of ENDPOINTS) {
  const result = await probe(endpoint);
  results.push(result);
  const mark = result.status === 'PASS' ? 'PASS' : 'FAIL';
  console.log(
    `${mark} ${result.name.padEnd(22)} HTTP=${String(result.http_status).padEnd(3)} ${result.latency_ms}ms leak=${result.leaked_fixture}`
  );
}

const failed = results.filter(result => result.status !== 'PASS').length;
const output = {
  base_url: BASE_URL,
  fixture_pattern: 'Gemini-key-shaped dummy fixture; invalid and safe for testing',
  generated_at: new Date().toISOString(),
  summary: {
    total: results.length,
    passed: results.length - failed,
    failed,
  },
  results,
};

await import('node:fs/promises').then(fs =>
  fs.writeFile('output-guard-live-results.json', JSON.stringify(output, null, 2), 'utf8')
);

if (failed) {
  console.error(`Output guard live benchmark failed: ${failed}/${results.length}`);
  process.exit(1);
}

console.log(`Output guard live benchmark passed: ${results.length}/${results.length}`);
