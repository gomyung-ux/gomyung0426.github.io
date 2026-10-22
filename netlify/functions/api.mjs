// 생일 선물 펀딩 서버 함수
// 저장소: Netlify Blobs (별도 가입이나 설정 없이 Netlify 사이트에 기본 포함)
// 관리자 비밀번호: Netlify 환경변수 ADMIN_PASSWORD
import { getStore } from '@netlify/blobs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export const config = { path: '/api/*' };

const DEFAULT_GOAL = 170000;
const MAX_BODY = 12000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const len = (s) => Array.from(s).length;

function resp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
const fail = (error, status = 400) => resp({ error }, status);

function headerAdminPassword(req) {
  const raw = req.headers.get('x-admin-password') || '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}
function adminGiven(req) { return !!headerAdminPassword(req); }
function adminOk(req) {
  const pw = process.env.ADMIN_PASSWORD || '';
  const given = headerAdminPassword(req);
  if (!pw || !given) return false;
  return timingSafeEqual(Buffer.from(sha(pw)), Buffer.from(sha(given)));
}
function clientHash(req) {
  const id = (req.headers.get('x-client-id') || '').trim();
  return /^[A-Za-z0-9_-]{16,64}$/.test(id) ? sha('client:' + id) : '';
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('too_large'), { status: 413 });
  try { return JSON.parse(text || '{}'); }
  catch { throw Object.assign(new Error('bad_request'), { status: 400 }); }
}

async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const items = await Promise.all(
    blobs.map((b) => store.get(b.key, { type: 'json' }).catch(() => null))
  );
  return items.filter(Boolean);
}
async function readConfig(store) {
  const cfg = await store.get('config', { type: 'json' }).catch(() => null);
  return cfg || {};
}

async function buildState(store, me, admin) {
  const [cfg, donations, messages] = await Promise.all([
    readConfig(store),
    listJSON(store, 'donations/'),
    listJSON(store, 'messages/'),
  ]);
  const goal = Number(cfg.goal) > 0 ? Number(cfg.goal) : DEFAULT_GOAL;
  const total = donations.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const percent = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const lastTs = donations.reduce((m, d) => Math.max(m, d.ts || 0), 0);

  const msgs = messages
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 200)
    .map((m) => {
      const mineMsg = !!me && m.owner === me;
      const reveal = !m.secret || mineMsg || admin;
      return {
        id: m.id,
        nickname: m.nickname,
        secret: !!m.secret,
        text: reveal ? m.text : null,
        ts: m.ts,
        mine: mineMsg,
      };
    });

  const mine = me
    ? donations
        .filter((d) => d.owner === me)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .map((d) => ({ id: d.id, nickname: d.nickname, amount: d.amount, ts: d.ts }))
    : [];

  const state = {
    percent,
    done: goal > 0 && total >= goal,
    lastTs,
    kakaoLink: cfg.kakaoLink || '',
    messages: msgs,
    mine,
    isAdmin: !!admin,
  };
  if (admin) {
    state.admin = {
      goal,
      total,
      donations: donations
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .map((d) => ({ id: d.id, nickname: d.nickname, amount: d.amount, contact: d.contact || '', ts: d.ts })),
    };
  }
  return state;
}

export function createHandler(getStoreFn) {
  return async function handler(req) {
    const store = getStoreFn();
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const method = req.method;
    const me = clientHash(req);
    const admin = adminOk(req);

    try {
      if (method === 'GET' && parts[0] === 'state' && parts.length === 1) {
        if (adminGiven(req) && !admin) await new Promise((r) => setTimeout(r, 500)); // 비밀번호 대입 공격 방지
        return resp(await buildState(store, me, admin));
      }

      if (method === 'POST' && parts[0] === 'donations' && parts.length === 1) {
        if (!me) return fail('no_client');
        const b = await readJson(req);
        const nickname = String(b.nickname || '').trim();
        const contact = String(b.contact || '').trim();
        const amount = Number(b.amount);
        if (!nickname || len(nickname) > 12) return fail('bad_nickname');
        if (!Number.isInteger(amount) || amount < 1 || amount > 10000000) return fail('bad_amount');
        if (len(contact) > 80) return fail('bad_contact');
        const id = randomUUID();
        await store.setJSON('donations/' + id, { id, nickname, amount, contact, ts: Date.now(), owner: me });
        return resp({ ok: true, id });
      }

      if (method === 'DELETE' && parts[0] === 'donations' && parts.length === 2) {
        const id = parts[1];
        if (!UUID_RE.test(id)) return fail('bad_id');
        const d = await store.get('donations/' + id, { type: 'json' }).catch(() => null);
        if (!d) return resp({ ok: true });
        if (!admin && !(me && d.owner === me)) return fail('forbidden', 403);
        await store.delete('donations/' + id);
        return resp({ ok: true });
      }

      if (method === 'POST' && parts[0] === 'messages' && parts.length === 1) {
        if (!me) return fail('no_client');
        const b = await readJson(req);
        const nickname = String(b.nickname || '').trim();
        const text = String(b.text || '').trim();
        const secret = b.secret === true;
        if (!nickname || len(nickname) > 12) return fail('bad_nickname');
        if (!text || len(text) > 2000) return fail('bad_text');
        const id = randomUUID();
        await store.setJSON('messages/' + id, { id, nickname, text, secret, ts: Date.now(), owner: me });
        return resp({ ok: true, id });
      }

      if (method === 'DELETE' && parts[0] === 'messages' && parts.length === 2) {
        const id = parts[1];
        if (!UUID_RE.test(id)) return fail('bad_id');
        const m = await store.get('messages/' + id, { type: 'json' }).catch(() => null);
        if (!m) return resp({ ok: true });
        if (!admin && !(me && m.owner === me)) return fail('forbidden', 403);
        await store.delete('messages/' + id);
        return resp({ ok: true });
      }

      if (method === 'POST' && parts[0] === 'admin' && parts[1] === 'config' && parts.length === 2) {
        if (!admin) return fail('forbidden', 403);
        const b = await readJson(req);
        const goal = Number(b.goal);
        const kakaoLink = String(b.kakaoLink || '').trim();
        if (!Number.isInteger(goal) || goal < 1 || goal > 100000000) return fail('bad_goal');
        if (kakaoLink && (!/^https:\/\//i.test(kakaoLink) || kakaoLink.length > 300)) return fail('bad_link');
        await store.setJSON('config', { goal, kakaoLink });
        return resp({ ok: true });
      }
    } catch (e) {
      if (e && e.status) return fail(e.message, e.status);
      console.error('api error', e);
      return fail('server', 500);
    }
    return fail('not_found', 404);
  };
}

export default createHandler(() => getStore({ name: 'birthday-fund', consistency: 'strong' }));
