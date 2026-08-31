const sources = [
  { id: 'torob', url: 'https://torob.com/' },
  { id: 'digikala', url: 'https://www.digikala.com/' },
  { id: 'emalls', url: 'https://emalls.ir/' },
];

const timeoutMs = 10000;

async function check(source) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'ComparisSmokeTest/1.0' },
    });
    const body = await response.text();
    return {
      ...source,
      ok: response.ok,
      status: response.status,
      bytes: body.length,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ...source,
      ok: false,
      status: 0,
      bytes: 0,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(sources.map(check));
console.table(results);

const failed = results.filter((x) => !x.ok);
if (failed.length) {
  console.error(`Smoke test failed for ${failed.length}/${results.length} sources.`);
  process.exit(1);
}

console.log(`Smoke test passed for ${results.length}/${results.length} sources.`);
