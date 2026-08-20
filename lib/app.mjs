// 요티 — 요청 처리 본체.
// 로컬은 server.mjs 가, Vercel은 api/index.mjs 가 이 핸들러를 가져다 씁니다.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { join, extname, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import Anthropic from '@anthropic-ai/sdk';
import { createStore, lightUt } from './storage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.YOTI_DATA || join(ROOT, 'data');   // 배포 때 볼륨 경로로 바꿔 쓸 수 있어요
const store = createStore(DATA);
const PORT = Number(process.env.PORT || 4400);

// 모델 설정 — 필요하면 환경변수로 바꿔요.
const MODEL = process.env.YOTI_MODEL || 'claude-opus-5';
// 화면 이름 정리는 가벼운 작업이라 빠른 모델로 따로 씁니다
const NAME_MODEL = process.env.YOTI_NAME_MODEL || 'claude-haiku-4-5';
// 요령이 챗봇 — 앱이 정리해 보낸 요약만 보고 답해요
const INSIGHT_MODEL = process.env.YOTI_INSIGHT_MODEL || MODEL;
const MAX_TOKENS = Number(process.env.YOTI_MAX_TOKENS || 128000);   // claude-opus-5 출력 한계

// ---------- 관리자 로그인 ----------
// 계정은 하나예요. 비밀번호를 환경변수로 넣으면 그때부터 잠깁니다.
const ADMIN_PASSWORD = process.env.YOTI_ADMIN_PASSWORD || '';
const AUTH_ON = Boolean(ADMIN_PASSWORD);
// 서버를 다시 켜도 로그인이 유지되게 하려면 YOTI_SESSION_SECRET을 고정해 주세요
const SESSION_SECRET = process.env.YOTI_SESSION_SECRET || randomBytes(32).toString('hex');
const SESSION_DAYS = 30;
const COOKIE_NAME = 'yoti_admin';

const signToken = (expiresAt) => {
  const body = String(expiresAt);
  const mac = createHmac('sha256', SESSION_SECRET).update(body).digest('hex');
  return `${body}.${mac}`;
};

const verifyToken = (token) => {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return false;
  const expected = createHmac('sha256', SESSION_SECRET).update(body).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(body) > Date.now();
};

const readCookie = (req, name) => {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
};

const isAuthed = (req) => !AUTH_ON || verifyToken(readCookie(req, COOKIE_NAME));

// 같은 길이로 비교해야 비밀번호 글자 수가 새어나가지 않아요
const passwordMatches = (given) => {
  const a = createHmac('sha256', SESSION_SECRET).update(String(given || '')).digest();
  const b = createHmac('sha256', SESSION_SECRET).update(ADMIN_PASSWORD).digest();
  return timingSafeEqual(a, b);
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const MOCK = process.env.YOTI_MOCK === '1';   // 키 없이 흐름만 확인할 때
// 터미널에 키를 치면 따옴표·공백 때문에 자주 어긋나요. .env 파일도 읽습니다.
if (!process.env.ANTHROPIC_API_KEY && existsSync(join(ROOT, '.env'))) {
  try {
    for (const line of (await readFile(join(ROOT, '.env'), 'utf8')).split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '').trim();
      if (value && !process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch (error) {
    console.warn('.env를 읽지 못했어요:', error.message);
  }
}

const client = MOCK ? null : new Anthropic();  // ANTHROPIC_API_KEY를 환경이나 .env에서 읽어요
const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
let SYSTEM_PROMPT = '';                   // 부팅 때 읽고, 생성할 때마다 파일을 다시 봅니다
const PROMPT_PATH_HINT = 'prompts/prototype-system.md';

const INSIGHT_PROMPT = [
  "너는 '요령이'야. 사용자 테스트 도구 '요티' 안에서, 방금 쌓인 테스트 데이터를 같이 읽어주는 동료야.",
  '',
  '말투',
  '- 편한 존댓말. "~해요", "~하면 좋아요"를 섞어 써. 상담원 말투·번역체 금지.',
  '- 결론부터. 인사말, "좋은 질문이에요", "요청하신 대로" 같은 말은 절대 쓰지 마.',
  '- 기본 3~5문장. 목록을 쓰더라도 5줄을 넘기지 마.',
  '- 마크다운 제목이나 표는 쓰지 마. **굵게** 와 - 목록까지만.',
  '',
  '숫자 규칙 (가장 중요)',
  '- 주어진 [UT 데이터 요약] 안의 숫자만 써. 없는 숫자는 지어내지 말고 "그건 지금 데이터에 없어요"라고 해.',
  '- 참여자가 5명보다 적으면 퍼센트로 말하지 말고 "3명 중 2명"처럼 세어서 말해.',
  '- 참여자가 적으면 단정하지 마. 어디까지가 확실하고 어디부터가 추측인지 선을 그어.',
  '- 추측할 땐 "추측인데", "가능성이 있어요"라고 티를 내. 사실과 섞지 마.',
  '- 데이터로 답이 안 나오면 솔직히 말하고, 뭘 더 모으면 알 수 있는지 한 줄로 알려줘.',
].join('\n');

const lanAddress = () => {
  for (const list of Object.values(networkInterfaces()))
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) return ni.address;
  return 'localhost';
};

const readBody = (req) => new Promise((ok, no) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > 32 * 1024 * 1024) { no(new Error('요청이 너무 커요')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
  req.on('error', no);
});

// ---------- 과업을 사람이 읽는 브리프로 ----------
function buildBrief(b, imageCount = 0) {
  const task = String(b.task || '').trim();
  const lines = [];

  lines.push(imageCount
    ? `## 만드는 방식\n**첨부한 화면 이미지 ${imageCount}장을 그대로 옮기세요.**`
      + ` 이미지에 보이는 레이아웃, 문구, 색, 간격을 최대한 그대로 재현하고,`
      + ` 화면 사이를 눌러서 오갈 수 있게 연결하세요. 새 디자인을 지어내지 마세요.`
    : `## 만드는 방식\n참고 이미지가 없습니다. 과업에 맞는 화면 흐름을 직접 설계해서 만드세요.`);

  lines.push(`## 참여자가 수행할 과업\n${task}`);

  const mode = b.successMode;
  if (mode === 'page-reach' && b.pageTarget) {
    lines.push(`## 성공 조건\n참여자가 **"${b.pageTarget}"** 화면에 도달하면 성공입니다.`
      + `\n\n이 화면을 반드시 만들고, 도달했을 때 \`document.title\`을 정확히 "${b.pageTarget}"이 포함되도록 바꾸세요.`);
  } else if (mode === 'element-click' && b.elementTarget) {
    lines.push(`## 성공 조건\n참여자가 **"${b.elementTarget}"** 요소를 클릭하면 성공입니다.`
      + `\n\n이 문구를 글자 그대로 가진 버튼이나 링크를 흐름 안에 반드시 넣으세요.`);
  } else if (mode === 'quiz' && b.quizQuestion) {
    lines.push(`## 성공 조건\n테스트가 끝난 뒤 참여자에게 "${b.quizQuestion}"라고 묻고,`
      + ` 정답은 "${b.expectedAnswer || ''}"입니다.`
      + `\n\n참여자가 프로토타입만 써보고 이 질문에 답할 수 있도록, 해당 정보를 화면 어딘가에서 찾을 수 있게 만드세요.`);
  } else {
    lines.push(`## 성공 조건\n따로 없습니다. 과업을 끝까지 수행할 수 있는 흐름이면 됩니다.`);
  }

  const frame = b.device === 'desktop' ? '데스크톱 1280x800' : '모바일 390x844';
  lines.push(`## 기기\n${frame} 화면으로 만드세요.`
    + `\n\n화면 틀은 **항상 이 크기**입니다. 내용이 길어도 틀을 늘리지 말고, 화면 안에서 세로로 스크롤되게 하세요.`
    + ` 긴 세로 이미지를 옮길 때도 이미지 한 장이 화면 하나이고, 틀은 그대로 둔 채 넘치는 부분을 스크롤로 봅니다.`
    + ` 기기 목업(폰 테두리·노치·상태바)은 그리지 마세요.`);

  return lines.join('\n\n');
}

// ---------- 첨부 이미지 정리 ----------
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function normalizeImages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((img) => img && typeof img.data === 'string' && img.data.length > 64 && IMAGE_TYPES.has(img.mediaType))
    .slice(0, 30)
    .map((img, index) => ({
      mediaType: img.mediaType,
      data: img.data,
      name: String(img.name || `화면 ${index + 1}`).slice(0, 80),
    }));
}

// 이미지와 브리프를 한 메시지로 묶습니다. 순서가 곧 화면 순서예요.
function buildContent(brief, images) {
  const content = [];
  if (images.length) {
    content.push({
      type: 'text',
      text: `아래는 프로토타입으로 옮길 화면 이미지 ${images.length}장입니다. 올린 순서가 참여자가 지나가는 순서입니다.`,
    });
    images.forEach((img, index) => {
      content.push({ type: 'text', text: `--- 화면 ${index + 1}: ${img.name} ---` });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      });
    });
  }
  content.push({ type: 'text', text: buildBrief(brief, images.length) });
  return content;
}

// ---------- 응답에서 HTML만 꺼내기 ----------
function extractHtml(raw) {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.search(/<!doctype html/i);
  if (start > 0) text = text.slice(start);
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (end !== -1) text = text.slice(0, end + 7);
  return text.trim();
}

const json = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

// ---------- SSE ----------
// 프롬프트 파일을 고치면 다음 생성부터 바로 반영돼요 (서버 재시작 불필요)
const currentSystemPrompt = async () => {
  try {
    return await readFile(join(ROOT, 'prompts', 'prototype-system.md'), 'utf8');
  } catch (error) {
    return SYSTEM_PROMPT;
  }
};

const sse = (res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

// ---------- 생성 ----------
async function handleGenerate(req, res) {
  const send = sse(res);
  let closed = false;
  // req의 close는 본문을 다 읽은 시점에도 발생해요. 연결이 끊긴 건 res로 봐야 합니다.
  res.on('close', () => { if (!res.writableEnded) closed = true; });

  try {
    const brief = JSON.parse(await readBody(req) || '{}');
    if (!String(brief.task || '').trim()) {
      send('error', { message: '어떤 과업을 테스트할지 먼저 적어주세요.' });
      return res.end();
    }

    const images = normalizeImages(brief.images);
    send('status', {
      step: 0,
      message: images.length
        ? `올린 화면 ${images.length}장을 살펴보는 중...`
        : '어떤 화면이 필요한지 정하는 중...',
    });

    if (MOCK) return mockGenerate(send, res, brief);

    // 시스템 프롬프트는 매번 같으니 캐시해서 재사용해요
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: await currentSystemPrompt(), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildContent(brief, images) }],
    });

    // 화면이 하나씩 완성될 때마다 진행 상황을 흘려보냅니다
    let acc = '';
    let screens = 0;
    let announcedBuild = false;

    for await (const event of stream) {
      if (closed) break;
      if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
      acc += event.delta.text;

      if (!announcedBuild && /<!doctype html/i.test(acc)) {
        announcedBuild = true;
        send('status', {
          step: 1,
          message: images.length ? '이미지 속 화면을 옮기는 중...' : 'YODI 컴포넌트로 화면을 그리는 중...',
        });
      }
      const found = (acc.match(/data-screen=/g) || []).length;
      if (found > screens) {
        screens = found;
        const title = acc.match(/data-title="([^"]{1,40})"/g)?.slice(-1)[0]?.match(/"([^"]+)"/)?.[1];
        send('status', {
          step: screens >= 2 ? 2 : 1,
          screens,
          message: title ? `화면 ${screens} · ${title} 만드는 중...` : `화면 ${screens}개째 그리는 중...`,
        });
      }
    }
    if (closed) return res.end();

    const final = await stream.finalMessage();
    const usage = final.usage;

    // 안전 분류기가 거절하면 200으로 오니 stop_reason을 먼저 봐요
    if (final.stop_reason === 'refusal') {
      send('error', { message: '이 내용으로는 프로토타입을 만들 수 없어요. 과업 설명을 조금 바꿔서 다시 시도해주세요.' });
      return res.end();
    }

    // 그래도 길이에 걸리면 이어서 쓰게 합니다 (최대 2번)
    let stopReason = final.stop_reason;
    for (let round = 0; round < 2 && stopReason === 'max_tokens' && !/<\/html>/i.test(acc); round += 1) {
      if (closed) return res.end();
      send('status', { step: 2, screens, message: '길어져서 이어서 만드는 중...' });
      const prefix = acc.replace(/\s+$/, '');            // 프리필은 공백으로 끝나면 안 돼요
      const more = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: await currentSystemPrompt(), cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: buildContent(brief, images) },
          { role: 'assistant', content: prefix },
        ],
      });
      acc = prefix;
      for await (const event of more) {
        if (closed) break;
        if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
        acc += event.delta.text;
        const found = (acc.match(/data-screen=/g) || []).length;
        if (found > screens) {
          screens = found;
          const title = acc.match(/data-title="([^"]{1,40})"/g)?.slice(-1)[0]?.match(/"([^"]+)"/)?.[1];
          send('status', { step: 2, screens, message: title ? `화면 ${screens} · ${title} 만드는 중...` : `화면 ${screens}개째 그리는 중...` });
        }
      }
      if (closed) return res.end();
      stopReason = (await more.finalMessage()).stop_reason;
    }

    const html = extractHtml(acc);

    if (stopReason === 'max_tokens' && !/<\/html>/i.test(html)) {
      send('error', { message: `프로토타입이 너무 길어서 다 만들지 못했어요. 화면 수(지금 ${screens}개)를 줄이거나 이미지를 나눠서 다시 시도해주세요.` });
      return res.end();
    }

    if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
      send('error', { message: '프로토타입이 완성되지 못했어요. 한 번 더 시도해주세요.' });
      return res.end();
    }

    // 화면 id와 이름을 짝지어 보냅니다. 목표 화면 고르기에서 #id로 미리보기를 띄워요.
    const screenList = [...html.matchAll(/data-screen="([a-z0-9_-]+)"[^>]*data-title="([^"]+)"/gi)]
      .map((m) => ({ id: m[1], title: m[2] }));
    if (!screenList.length) {
      [...html.matchAll(/data-title="([^"]+)"[^>]*data-screen="([a-z0-9_-]+)"/gi)]
        .forEach((m) => screenList.push({ id: m[2], title: m[1] }));
    }
    const titles = screenList.map((sc) => sc.title);
    send('done', {
      html,
      screens: screenList.length || 1,
      screenList,
      screenTitles: titles,
      model: MODEL,
      usage: {
        input: usage?.input_tokens ?? 0,
        output: usage?.output_tokens ?? 0,
        cacheRead: usage?.cache_read_input_tokens ?? 0,
      },
    });
    res.end();
  } catch (err) {
    console.error('[generate]', err?.message || err);
    const raw = String(err?.message || '');
    const code = err?.code || err?.error?.code || '';
    const message =
      code === 'insufficient_quota' || /credit|quota|billing/i.test(raw)
        ? 'Anthropic 크레딧이 부족해요. console.anthropic.com → Billing에서 결제 수단이나 잔액을 확인해주세요.'
      : err?.status === 401 ? 'API 키가 올바르지 않아요. ANTHROPIC_API_KEY를 확인해주세요.'
      : err?.status === 403 ? '이 키로는 이 모델에 접근할 수 없어요. 키 권한을 확인해주세요.'
      : err?.status === 404 ? `${MODEL} 모델에 접근할 수 없어요. YOTI_MODEL로 다른 모델을 지정해보세요.`
      : err?.status === 429 ? '요청이 몰렸어요. 잠시 뒤 다시 시도해주세요.'
      : err?.status >= 500 ? 'Anthropic 쪽이 잠시 불안정해요. 다시 시도해주세요.'
      : (raw || '프로토타입 생성에 실패했어요.');
    try { send('error', { message }); } catch {}
    res.end();
  }
}

// ---------- 목 생성 (YOTI_MOCK=1) ----------
async function mockGenerate(send, res, brief) {
  const html = await readFile(join(ROOT, 'prompts', 'mock-prototype.html'), 'utf8');
  const titles = [...html.matchAll(/data-title="([^"]+)"/g)].map((m) => m[1]);
  const scale = Number(process.env.YOTI_MOCK_DELAY ?? 1);   // 0이면 지연 없이 즉시
  const wait = (ms) => (scale > 0 ? new Promise((r) => setTimeout(r, ms * scale)) : Promise.resolve());
  await wait(500);
  send('status', { step: 1, message: 'YODI 컴포넌트로 화면을 그리는 중...' });
  for (let i = 0; i < titles.length; i += 1) {
    await wait(450);
    send('status', { step: i >= 1 ? 2 : 1, screens: i + 1, message: `화면 ${i + 1} · ${titles[i]} 만드는 중...` });
  }
  await wait(400);
  const screenList = [...html.matchAll(/data-screen="([a-z0-9_-]+)"[^>]*data-title="([^"]+)"/gi)]
    .map((m) => ({ id: m[1], title: m[2] }));
  send('done', {
    html, screens: titles.length, screenTitles: titles, screenList,
    model: 'mock', usage: { input: 0, output: 0, cacheRead: 0 },
  });
  res.end();
}

// ---------- UT 저장소 ----------
const newId = () => randomBytes(9).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10) || 'ut';

// 예전에는 A/B가 성공 조건 중 하나였어요. 읽을 때 지금 구조로 맞춰줍니다.
function migrateUt(ut) {
  if (!ut) return ut;
  if (!ut.mode) ut.mode = ut.utType === 'ab' ? 'ab' : 'single';
  if (ut.utType === 'ab') ut.utType = 'none';
  return ut;
}

async function readUt(id) {
  return migrateUt(await store.readUt(id));
}

async function listUts() {
  const uts = (await store.allUts()).map(migrateUt);
  const sessions = await store.allSessions();
  return uts.map((ut) => ({
    ...lightUt(ut),
    sessionCount: sessions.filter((s) => (s.utId || s.projectId) === ut.id).length,
    successCount: sessions.filter((s) => (s.utId || s.projectId) === ut.id && s.outcome === 'success').length,
  })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function listSessions(utId) {
  const sessions = await store.sessionsOf(utId);
  return sessions.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
}

// ---------- 정적 파일 ----------
const inside = (base, target) => {
  const r = resolve(target);
  return r === resolve(base) || r.startsWith(resolve(base) + sep);
};

async function serveStatic(res, path) {
  const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const file = join(ROOT, rel);
  if (!inside(ROOT, file)) {
    res.writeHead(403).end('접근할 수 없어요');
    return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('찾을 수 없어요');
  }
}

// ---------- 라우팅 ----------
export const handler = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ---- 로그인 ----
  if (url.pathname === '/api/session' && req.method === 'GET') {
    return json(res, 200, { authRequired: AUTH_ON, authed: isAuthed(req) });
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    if (!AUTH_ON) return json(res, 200, { authed: true });
    const body = JSON.parse(await readBody(req) || '{}');
    if (!passwordMatches(body.password)) {
      return json(res, 401, { error: '비밀번호가 맞지 않아요.' });
    }
    const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
    res.setHeader('set-cookie',
      `${COOKIE_NAME}=${encodeURIComponent(signToken(expiresAt))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`);
    return json(res, 200, { authed: true });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return json(res, 200, { authed: false });
  }

  // 참여자 링크로 들어온 사람은 로그인 없이 통과해야 해요.
  // 그래서 UT 한 건 읽기·세션 목록·참여 기록 저장만 열어둡니다.
  const participantOpen =
    (req.method === 'GET' && /^\/api\/uts\/[\w-]+$/.test(url.pathname))
    || (req.method === 'GET' && /^\/api\/uts\/[\w-]+\/sessions$/.test(url.pathname))
    || (req.method === 'POST' && url.pathname === '/api/sessions')
    || url.pathname === '/api/config'
    || url.pathname === '/api/health';

  if (url.pathname.startsWith('/api/') && !participantOpen && !isAuthed(req)) {
    return json(res, 401, { error: '로그인이 필요해요.' });
  }

  if (url.pathname === '/api/health') {
    const hasKey = MOCK || hasApiKey();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, ai: hasKey, model: MOCK ? 'mock' : MODEL }));
  }

  // ---- UT 만들기 ----
  if (url.pathname === '/api/uts' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    // Figma는 html 대신 embed 주소를 들고 와요
    if (!body.goal || !(body.html || body.figmaEmbed)) {
      return json(res, 400, { error: '과업과 프로토타입이 필요해요.' });
    }
    const ut = {
      ...body,
      id: newId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.writeUt(ut);
    return json(res, 201, { ...lightUt(ut), sessionCount: 0 });
  }

  // ---- UT 목록 ----
  if (url.pathname === '/api/uts' && req.method === 'GET') {
    return json(res, 200, await listUts());
  }

  // ---- UT 단건 / 삭제 ----
  const mUt = /^\/api\/uts\/([\w-]+)$/.exec(url.pathname);
  if (mUt) {
    const id = mUt[1];
    if (req.method === 'GET') {
      const ut = await readUt(id);
      if (!ut) return json(res, 404, { error: '없는 UT예요.' });
      const sessions = await listSessions(id);
      return json(res, 200, { ...ut, sessionCount: sessions.length });
    }
    if (req.method === 'DELETE') {
      await store.removeUt(id);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PATCH') {
      const ut = await readUt(id);
      if (!ut) return json(res, 404, { error: '없는 UT예요.' });
      const body = JSON.parse(await readBody(req) || '{}');
      const next = { ...ut, ...body, id: ut.id, createdAt: ut.createdAt, updatedAt: Date.now() };
      await store.writeUt(next);
      return json(res, 200, lightUt(next));
    }
  }

  // 올린 HTML에서 뽑은 화면 이름을 사람이 알아보기 쉽게 다듬어요
  if (url.pathname === '/api/screen-names' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const screens = Array.isArray(body.screens) ? body.screens.slice(0, 24) : [];
    if (!screens.length) return json(res, 200, { names: {} });

    if (MOCK || !hasApiKey()) {
      // 키가 없으면 원래 이름을 그대로 씁니다
      return json(res, 200, { names: {} });
    }

    const list = screens.map((screen, index) => {
      const sample = String(screen.sample || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      return `${index + 1}. id="${screen.id}" | 지금 이름: ${screen.title || '(없음)'} | 화면 내용: ${sample || '(비어 있음)'}`;
    }).join('\n');

    try {
      const result = await client.messages.create({
        model: NAME_MODEL,
        max_tokens: 800,
        system: [
          '너는 UT 도구에서 화면 목록에 붙일 이름을 짓는 역할이야.',
          '각 화면 내용을 읽고, 사람이 목록에서 바로 알아볼 수 있는 짧은 한글 이름을 지어줘.',
          '규칙:',
          '- 12자 이내 명사형. 예: "요금제 선택", "결제 완료", "홈"',
          '- 문장이나 물음표로 끝내지 마. "어떤 동네를 찾고 계세요?" → "동네 검색"',
          '- id를 그대로 쓰지 마 (s1, screen-2 같은 건 내용으로 유추해)',
          '- 화면 흐름 순서를 참고해 서로 구분되게 지어',
          '- 출력은 JSON 하나만. {"id": "이름", ...} 형태. 다른 말 금지.',
        ].join('\n'),
        messages: [{ role: 'user', content: list }],
      });
      const text = result.content.find((block) => block.type === 'text')?.text || '{}';
      const match = text.match(/\{[\s\S]*\}/);
      const names = match ? JSON.parse(match[0]) : {};
      const clean = {};
      screens.forEach((screen) => {
        const name = String(names[screen.id] || '').replace(/\s+/g, ' ').trim().slice(0, 20);
        if (name) clean[screen.id] = name;
      });
      return json(res, 200, { names: clean });
    } catch (error) {
      console.warn('화면 이름 정리 실패:', error?.message || error);
      return json(res, 200, { names: {} });
    }
  }

  // Figma Embed Kit 2.0은 client-id가 있어야 이벤트를 보내줘요
  if (url.pathname === '/api/config' && req.method === 'GET') {
    return json(res, 200, {
      figmaClientId: process.env.YOTI_FIGMA_CLIENT_ID || '',
      // 목 모드나 키 없음을 앱에서도 알 수 있게 알려줘요
      aiMode: MOCK ? 'mock' : (hasApiKey() ? 'live' : 'nokey'),
      model: MOCK ? '목 데이터' : MODEL
    });
  }

  // ---- 홈 대시보드 요약 ----
  if (url.pathname === '/api/summary' && req.method === 'GET') {
    const uts = await store.allUts();
    const sessions = await store.allSessions();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let judged = 0;      // 성공/실패를 가릴 수 있는 참여
    let succeeded = 0;
    let finishedMs = 0;
    let finishedCount = 0;
    let dropped = 0;
    let thisWeek = 0;

    for (const session of sessions) {
      const at = session.endedAt || session.startedAt || 0;
      if (at >= weekAgo) thisWeek += 1;
      const outcome = session.outcome || 'stopped';
      if (outcome === 'success' || outcome === 'failed') {
        judged += 1;
        if (outcome === 'success') succeeded += 1;
      }
      if (outcome === 'success' || outcome === 'completed' || outcome === 'failed') {
        finishedCount += 1;
        finishedMs += session.duration || 0;
      } else dropped += 1;
    }

    return json(res, 200, {
      utCount: uts.length,
      sessions: sessions.length,
      thisWeek,
      // 성공 조건이 있는 UT가 하나도 없으면 성공률 대신 완료율을 씁니다
      judged,
      successRate: judged ? Math.round((succeeded / judged) * 100) : null,
      completionRate: sessions.length ? Math.round((finishedCount / sessions.length) * 100) : null,
      averageMs: finishedCount ? Math.round(finishedMs / finishedCount) : 0,
      dropped,
    });
  }

  // ---- 참여자 ----
  // 이메일을 남긴 참여를 사람 기준으로 묶어줘요
  if (url.pathname === '/api/participants' && req.method === 'GET') {
    const utNames = new Map((await store.allUts()).map((ut) => [ut.id, ut.title || '이름 없는 UT']));
    const people = new Map();

    for (const session of await store.allSessions()) {
      const email = String(session.participantEmail || '').trim().toLowerCase();
      if (!email) continue;
      if (!people.has(email)) {
        people.set(email, { email, name: session.participantName || '', count: 0, lastAt: 0, runs: [] });
      }
      const person = people.get(email);
      if (session.participantName) person.name = session.participantName;
      person.count += 1;
      const at = session.endedAt || session.startedAt || 0;
      person.lastAt = Math.max(person.lastAt, at);
      const utId = session.utId || session.projectId;
      person.runs.push({
        utId, utTitle: utNames.get(utId) || '삭제된 UT',
        sessionId: session.id, outcome: session.outcome || 'stopped',
        duration: session.duration || 0, at,
      });
    }

    const list = [...people.values()].map((person) => ({
      ...person, runs: person.runs.sort((a, b) => b.at - a.at),
    })).sort((a, b) => b.lastAt - a.lastAt);
    return json(res, 200, list);
  }

  // ---- 세션 ----
  const mSessions = /^\/api\/uts\/([\w-]+)\/sessions$/.exec(url.pathname);
  if (mSessions && req.method === 'GET') {
    return json(res, 200, await listSessions(mSessions[1]));
  }
  if (url.pathname === '/api/sessions' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const ut = await readUt(body.utId);
    if (!ut) return json(res, 400, { error: '없는 UT예요.' });
    const id = `s-${Date.now().toString(36)}-${newId().slice(0, 4)}`;
    const session = { ...body, id, utId: ut.id, savedAt: Date.now() };
    await store.writeSession(session);
    return json(res, 201, { id });
  }

  // 요령이 챗봇 — 원본 이벤트가 아니라 앱이 추린 요약만 받습니다
  if (url.pathname === '/api/insight' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const question = String(body.question || '').trim().slice(0, 500);
    if (!question) return json(res, 400, { error: '질문이 비어 있어요.' });
    if (MOCK || !hasApiKey()) {
      return json(res, 200, {
        answer: '지금은 AI 답변이 꺼져 있어요. 숫자로 답할 수 있는 질문(도달, 성공률, 소요 시간, 응답)은 그대로 물어보시면 돼요.',
        source: 'nokey',
      });
    }
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
      .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
      .map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }));
    // 첫 메시지는 user여야 해요. assistant로 시작하면 그 앞부분을 버립니다.
    while (history.length && history[0].role !== 'user') history.shift();
    const digest = JSON.stringify(body.digest ?? {}, null, 1).slice(0, 14000);
    try {
      const result = await client.messages.create({
        model: INSIGHT_MODEL,
        max_tokens: 1200,
        system: [
          { type: 'text', text: INSIGHT_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `[UT 데이터 요약]\n${digest}` },
        ],
        messages: [...history, { role: 'user', content: question }],
      });
      const answer = (result.content.find((block) => block.type === 'text')?.text || '').trim();
      return json(res, 200, { answer: answer || '이 질문은 지금 데이터로 답하기 어려워요.', source: 'model' });
    } catch (error) {
      console.warn('인사이트 답변 실패:', error?.message || error);
      return json(res, 500, { error: '답을 만들지 못했어요. 잠시 뒤 다시 물어봐주세요.' });
    }
  }

  if (url.pathname === '/api/generate') {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    if (!MOCK && !hasApiKey()) {
      const send = sse(res);
      send('error', { message: 'API 키가 없어요. 터미널에서 ANTHROPIC_API_KEY를 설정한 뒤 서버를 다시 켜주세요.' });
      return res.end();
    }
    return handleGenerate(req, res);
  }

  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  // 참여자 링크는 앱을 그대로 띄우고, 앱이 경로를 보고 참여자 모드로 들어갑니다
  if (/^\/t\/[\w-]+$/.test(url.pathname)) return serveStatic(res, '/index.html');
  return serveStatic(res, decodeURIComponent(url.pathname));
};

// 부팅 준비 — 저장소 준비 + 시스템 프롬프트 미리 읽기
export const ready = (async () => {
  await store.init();
  try {
    SYSTEM_PROMPT = await readFile(join(ROOT, 'prompts', 'prototype-system.md'), 'utf8');
  } catch (error) {
    console.warn('시스템 프롬프트를 읽지 못했어요:', error.message);
  }
})();

export const info = () => ({ port: PORT, mock: MOCK, model: MODEL, hasKey: hasApiKey(), lan: lanAddress() });
