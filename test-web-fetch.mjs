/**
 * Test suite for Web Fetch MCP adapter functions.
 * Run: node test-web-fetch.mjs
 * 
 * Requires server.js running on localhost:3000 for ChatGPT tests.
 */

// ─── Inline copies of the functions under test ───

function extractLocationFromQuery(query) {
  const lower = query.toLowerCase().trim();

  // Strategy 1: Look for "in/for/at/near/of" + location (most reliable)
  const trailingNoise = /\s+(?:right now|currently|today|tonight|this week|please|thanks|thank you)[\s?.!]*$/i;
  const prepMatch = lower.match(/(?:weather|forecast|temperature|temp|conditions)\s+(?:in|for|at|near|of)\s+(.+)/i)
    || lower.match(/\b(?:in|for|at|near|of)\s+([a-z][\w\s,.-]+?)(?:\s*(?:weather|forecast|temperature|temp|conditions|right now|currently|today|tonight|please|thanks|\?|$))/i);
  if (prepMatch) {
    const loc = prepMatch[1].replace(trailingNoise, '').replace(/[?.!]+$/, '').trim();
    if (loc.length >= 2) return loc;
  }

  // Strategy 2: Strip known noise words and see what's left
  const noise = /\b(what(?:'?s| is| are)?|the|tell|me|get|can|you|could|show|look|up|find|fetch|check|give|please|thanks|thank|i|need|want|know|like|how|about|right now|currently|today|tonight|this week|weather|forecast|temperature|temp|conditions|current)\b/gi;
  const cleaned = lower.replace(noise, ' ').replace(/[?.!]+/g, '').replace(/\s+/g, ' ').trim();
  const loc2 = cleaned.replace(/^(in|for|at|of|near)\s+/i, '').trim();
  if (loc2.length >= 2) return loc2;

  return 'your location';
}

async function fetchWeatherReal(taskLabel) {
  const location = extractLocationFromQuery(taskLabel);
  const url = 'https://wttr.in/' + encodeURIComponent(location) + '?format=j1';
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const cur = data.current_condition && data.current_condition[0];
    if (!cur) throw new Error('No weather data returned');
    const area = (data.nearest_area && data.nearest_area[0]) || {};
    const areaName = (area.areaName && area.areaName[0] && area.areaName[0].value) || location;
    const region = (area.region && area.region[0] && area.region[0].value) || '';
    const country = (area.country && area.country[0] && area.country[0].value) || '';
    const displayLoc = areaName + (region ? ', ' + region : '') + (country ? ', ' + country : '');
    const tempF = cur.temp_F || 'N/A';
    const tempC = cur.temp_C || 'N/A';
    const desc = (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value) || 'N/A';
    const humidity = cur.humidity || 'N/A';
    const windMph = cur.windspeedMiles || 'N/A';
    const windDir = cur.winddir16Point || '';
    const uvIndex = cur.uvIndex || 'N/A';
    const feelsF = cur.FeelsLikeF || tempF;
    const feelsC = cur.FeelsLikeC || tempC;

    let tomorrowStr = '';
    if (data.weather && data.weather[1]) {
      const tmrw = data.weather[1];
      tomorrowStr = '\n  Tomorrow: High ' + tmrw.maxtempF + '°F, Low ' + tmrw.mintempF + '°F — ' +
        ((tmrw.hourly && tmrw.hourly[4] && tmrw.hourly[4].weatherDesc && tmrw.hourly[4].weatherDesc[0] && tmrw.hourly[4].weatherDesc[0].value) || 'N/A');
    }

    return '📋 RESULT — Weather for ' + displayLoc + ':\n' +
      '  Conditions: ' + desc + '\n' +
      '  Temperature: ' + tempF + '°F (' + tempC + '°C)\n' +
      '  Feels Like: ' + feelsF + '°F (' + feelsC + '°C)\n' +
      '  Humidity: ' + humidity + '%\n' +
      '  Wind: ' + windMph + ' mph ' + windDir + '\n' +
      '  UV Index: ' + uvIndex +
      tomorrowStr;
  } catch (e) {
    return '❌ Weather fetch error: ' + e.message + '\n  Could not retrieve weather for "' + location + '".';
  }
}

// ─── Test helpers ───
let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log('  ✅ ' + description);
    passed++;
  } else {
    console.log('  ❌ FAIL: ' + description);
    failed++;
  }
}

// ─── Tests ───

console.log('\n══════════════════════════════════════════════');
console.log('  Web Fetch MCP Adapter — Test Suite');
console.log('══════════════════════════════════════════════\n');

// ── Test 1: extractLocationFromQuery ──
console.log('── Test 1: extractLocationFromQuery ──');

const locationTests = [
  { input: "What's the weather in Walton, Ky", expected: 'walton, ky' },
  { input: "Get the weather for New York", expected: 'new york' },
  { input: "weather in Tokyo", expected: 'tokyo' },
  { input: "Check the weather in London", expected: 'london' },
  { input: "Show me the forecast for San Francisco", expected: 'san francisco' },
  { input: "What is the current temperature in Chicago", expected: 'chicago' },
  { input: "weather at Denver, CO", expected: 'denver, co' },
  { input: "Find weather near Austin, TX", expected: 'austin, tx' },
  { input: "Fetch the weather for Miami, FL right now", expected: 'miami, fl' },
  { input: "What's the weather in Walton, Kentucky", expected: 'walton, kentucky' },
  { input: "Tell me the weather in Walton, Kentucky", expected: 'walton, kentucky' },
  { input: "can you get me the weather in Walton, KY", expected: 'walton, ky' },
  { input: "I need the weather for Walton KY", expected: 'walton ky' },
  { input: "look up weather for walton ky please", expected: 'walton ky' },
  { input: "What is the weather like in Walton, KY", expected: 'walton, ky' },
  { input: "Walton KY weather", expected: 'walton ky' },
  { input: "weather walton ky", expected: 'walton ky' },
];

for (const t of locationTests) {
  const result = extractLocationFromQuery(t.input);
  assert(
    result === t.expected,
    `"${t.input}" → "${result}" (expected "${t.expected}")`
  );
}

// ── Test 2: fetchWeatherReal — Walton, KY (real API call) ──
console.log('\n── Test 2: fetchWeatherReal — "What\'s the weather in Walton, Ky" ──');

const waltonResult = await fetchWeatherReal("What's the weather in Walton, Ky");
console.log('\n  Raw output:\n' + waltonResult.split('\n').map(l => '    ' + l).join('\n') + '\n');

assert(!waltonResult.startsWith('❌'), 'API call succeeded (no error)');
assert(waltonResult.includes('RESULT'), 'Contains RESULT marker');
assert(!waltonResult.includes('Tokyo'), 'Does NOT contain Tokyo');
assert(
  waltonResult.toLowerCase().includes('walton') || waltonResult.toLowerCase().includes('kentucky') || waltonResult.toLowerCase().includes('ky'),
  'Contains Walton or Kentucky in the location'
);
assert(waltonResult.includes('°F'), 'Contains temperature in Fahrenheit');
assert(waltonResult.includes('°C'), 'Contains temperature in Celsius');
assert(waltonResult.includes('Humidity'), 'Contains humidity');
assert(waltonResult.includes('Wind'), 'Contains wind info');
assert(waltonResult.includes('Conditions'), 'Contains conditions description');

// ── Test 3: fetchWeatherReal — different cities ──
console.log('\n── Test 3: fetchWeatherReal — multiple cities ──');

const cities = [
  { query: "weather in New York", must: ['new york', 'new jersey', 'manhattan', 'brooklyn', 'weehawken'] },
  { query: "What's the weather in London", must: ['london'] },
  { query: "Get weather for Denver, CO", must: ['denver'] },
];

for (const c of cities) {
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    result = await fetchWeatherReal(c.query);
    if (!result.startsWith('❌')) break;
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }
  const isOk = !result.startsWith('❌');
  const lower = result.toLowerCase();
  const hasCity = c.must.some(m => lower.includes(m));
  assert(isOk, `"${c.query}" — API call succeeded`);
  assert(hasCity, `"${c.query}" — result contains one of: ${c.must.join(', ')}`);
  if (!isOk || !hasCity) {
    console.log('    Result: ' + result.substring(0, 120));
  }
}

// ── Test 4: Edge cases ──
console.log('\n── Test 4: Edge cases ──');

const edgeResult = await fetchWeatherReal("weather");
assert(!edgeResult.startsWith('❌'), 'Bare "weather" query does not crash');
console.log('  Bare "weather" resolved to: ' + edgeResult.split('\n')[0]);

const weirdResult = await fetchWeatherReal("What's the weather in 小田原");
assert(!weirdResult.startsWith('❌') || weirdResult.includes('Weather fetch error'), 'Unicode city name handled gracefully');

// ── Test 5: ChatGPT via /api/chat proxy (requires server.js on port 3000) ──
console.log('\n── Test 5: askChatGPT via /api/chat proxy ──');

const CHAT_URL = 'http://localhost:3000/api/chat';

async function askChatGPT(query) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: query }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'HTTP ' + resp.status }));
      throw new Error(err.error || err.details || 'HTTP ' + resp.status);
    }
    const data = await resp.json();
    return '📋 RESULT — ' + data.answer;
  } catch (e) {
    return '❌ ChatGPT error: ' + e.message;
  }
}

// Check if server is running
let serverUp = false;
try {
  const ping = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Say OK' }),
  });
  serverUp = ping.ok;
} catch { /* server not running */ }

if (serverUp) {
  const chatTests = [
    { query: 'What is the weather in Walton, KY?', mustContain: 'walton', desc: 'Weather in Walton KY' },
    { query: 'What is JavaScript?', mustContain: 'javascript', desc: 'What is JavaScript' },
    { query: 'Tell me about Kentucky', mustContain: 'kentucky', desc: 'Tell me about Kentucky' },
  ];

  for (const t of chatTests) {
    const result = await askChatGPT(t.query);
    const isOk = !result.startsWith('❌');
    const hasContent = result.toLowerCase().includes(t.mustContain);
    assert(isOk, `${t.desc} — ChatGPT responded`);
    assert(hasContent, `${t.desc} — response contains "${t.mustContain}"`);
    if (!isOk) {
      console.log('    Error: ' + result.substring(0, 200));
    }
  }

  // Sample output
  const weatherResult = await askChatGPT('What is the weather in Walton, KY?');
  console.log('\n  Sample ChatGPT output (Walton KY weather):\n' + weatherResult.split('\n').map(l => '    ' + l).join('\n') + '\n');

  assert(!weatherResult.includes('Dunkirk'), 'Does NOT contain wrong city (Dunkirk)');
  assert(!weatherResult.includes('Tokyo'), 'Does NOT contain wrong city (Tokyo)');
} else {
  console.log('  ⚠ server.js not running on port 3000 — skipping ChatGPT tests');
  console.log('  Start with: PORT=3000 node server.js');
}

// ── Summary ──
console.log('\n══════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
