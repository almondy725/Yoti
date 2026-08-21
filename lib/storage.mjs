// 저장소 — 로컬은 파일, Vercel은 Blob
//
// Vercel Blob은 쓰기 계열(put/list)이 무료 월 1만 회라 파일을 낱개로 훑으면 금방 동나요.
// 그래서 목록·요약에 필요한 값만 모은 index.json 하나를 따로 두고,
// 목록 조회는 그 파일만 읽습니다. list()는 아예 쓰지 않아요.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Blob 인증은 두 가지예요.
//   - BLOB_READ_WRITE_TOKEN (예전 방식)
//   - VERCEL_OIDC_TOKEN + BLOB_STORE_ID (지금 Vercel이 자동으로 넣어주는 방식)
// Vercel 위에서는 파일 쓰기가 아예 안 되니, 둘 중 하나라도 있으면 Blob으로 갑니다.
const hasBlobAuth = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const MODE = process.env.YOTI_STORAGE || (hasBlobAuth ? 'blob' : 'file');
export const isBlob = MODE === 'blob';

// ---------- 공통: 인덱스에 담을 가벼운 형태 ----------
// html·events·replay 처럼 무거운 건 빼고, 목록과 집계에 필요한 것만 남겨요.
export const lightUt = (ut) => {
  if (!ut) return null;
  const { html, htmlB, ...light } = ut;
  return light;
};

export const lightSession = (session) => ({
  id: session.id,
  utId: session.utId || session.projectId,
  participantName: session.participantName || '',
  participantEmail: session.participantEmail || '',
  outcome: session.outcome || 'stopped',
  duration: session.duration || 0,
  startedAt: session.startedAt || 0,
  endedAt: session.endedAt || 0,
  variant: session.variant || 'A',
});

// ---------- 파일 저장소 ----------
const fileStore = (root) => {
  const UTS = join(root, 'uts');
  const SESSIONS = join(root, 'sessions');

  return {
    async init() {
      await mkdir(UTS, { recursive: true });
      await mkdir(SESSIONS, { recursive: true });
    },
    async readUt(id) {
      try { return JSON.parse(await readFile(join(UTS, `${id}.json`), 'utf8')); } catch { return null; }
    },
    async writeUt(ut) {
      await mkdir(UTS, { recursive: true });
      await writeFile(join(UTS, `${ut.id}.json`), JSON.stringify(ut));
    },
    async removeUt(id) {
      await rm(join(UTS, `${id}.json`), { force: true });
      await rm(join(SESSIONS, id), { recursive: true, force: true });
    },
    async allUts() {
      if (!existsSync(UTS)) return [];
      const out = [];
      for (const f of (await readdir(UTS)).filter((n) => n.endsWith('.json'))) {
        try { out.push(JSON.parse(await readFile(join(UTS, f), 'utf8'))); } catch { /* 깨진 파일은 건너뛰어요 */ }
      }
      return out;
    },
    async writeSession(session) {
      const dir = join(SESSIONS, session.utId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${session.id}.json`), JSON.stringify(session));
    },
    async sessionsOf(utId) {
      const dir = join(SESSIONS, utId);
      if (!existsSync(dir)) return [];
      const out = [];
      for (const f of (await readdir(dir)).filter((n) => n.endsWith('.json'))) {
        try { out.push(JSON.parse(await readFile(join(dir, f), 'utf8'))); } catch { /* 건너뛰어요 */ }
      }
      return out;
    },
    async allSessions() {
      if (!existsSync(SESSIONS)) return [];
      const out = [];
      for (const utId of await readdir(SESSIONS)) {
        out.push(...await this.sessionsOf(utId));
      }
      return out;
    },
    async readFolders() {
      try { return JSON.parse(await readFile(join(root, 'folders.json'), 'utf8')); } catch { return []; }
    },
    async writeFolders(folders) {
      await mkdir(root, { recursive: true });
      await writeFile(join(root, 'folders.json'), JSON.stringify(folders));
    },
  };
};

// ---------- Vercel Blob 저장소 ----------
const blobStore = () => {
  let sdk = null;
  // YOTI_BLOB_SDK 는 테스트에서 가짜 SDK를 끼워 넣을 때만 씁니다
  const load = async () => (sdk ||= await import(process.env.YOTI_BLOB_SDK || '@vercel/blob'));

  // private 스토어는 URL로 바로 못 읽어요. SDK의 get()이 인증까지 처리해 줍니다.
  // useCache:false 라야 방금 쓴 내용이 바로 보여요.
  const ACCESS = process.env.YOTI_BLOB_ACCESS || 'private';

  const readJson = async (pathname) => {
    const { get } = await load();
    try {
      const found = await get(pathname, { access: ACCESS, useCache: false });
      if (!found?.stream) return null;
      const text = await new Response(found.stream).text();
      return JSON.parse(text);
    } catch (error) {
      return null;   // 아직 없는 파일이면 그냥 비어 있는 셈이에요
    }
  };

  // 참여자 이메일과 화면 녹화가 담기니 private 스토어에 저장해요.
  // YOTI_BLOB_ACCESS=public 으로 두면 공개 스토어에도 쓸 수 있습니다.
  const writeJson = async (pathname, value) => {
    const { put } = await load();
    await put(pathname, JSON.stringify(value), {
      access: ACCESS,
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
  };

  const INDEX = 'index.json';
  const emptyIndex = { uts: [], sessions: [], folders: [] };

  const readIndex = async () => {
    const index = await readJson(INDEX);
    if (!index) return { ...emptyIndex };
    // 예전 인덱스에는 folders 가 없어요
    return { uts: [], sessions: [], folders: [], ...index };
  };

  return {
    async init() { /* Blob은 미리 만들 게 없어요 */ },

    async readUt(id) { return readJson(`uts/${id}.json`); },

    async writeUt(ut) {
      await writeJson(`uts/${ut.id}.json`, ut);
      const index = await readIndex();
      index.uts = index.uts.filter((item) => item.id !== ut.id);
      index.uts.push(lightUt(ut));
      await writeJson(INDEX, index);
    },

    async removeUt(id) {
      const { del } = await load();
      const index = await readIndex();
      const gone = index.sessions.filter((s) => s.utId === id);
      index.uts = index.uts.filter((item) => item.id !== id);
      index.sessions = index.sessions.filter((s) => s.utId !== id);
      await writeJson(INDEX, index);
      // del은 요금이 안 붙어요
      await del([`uts/${id}.json`, ...gone.map((s) => `sessions/${id}/${s.id}.json`)]).catch(() => {});
    },

    // 목록은 인덱스 한 번 읽는 걸로 끝나요
    async allUts() { return (await readIndex()).uts; },

    async writeSession(session) {
      await writeJson(`sessions/${session.utId}/${session.id}.json`, session);
      // 인덱스를 다시 읽어서 합쳐야 동시에 들어온 참여가 덮이지 않아요
      const index = await readIndex();
      index.sessions = index.sessions.filter((s) => s.id !== session.id);
      index.sessions.push(lightSession(session));
      await writeJson(INDEX, index);
    },

    async sessionsOf(utId) {
      const index = await readIndex();
      const mine = index.sessions.filter((s) => s.utId === utId);
      const out = [];
      for (const meta of mine) {
        const full = await readJson(`sessions/${utId}/${meta.id}.json`);
        if (full) out.push(full);
      }
      return out;
    },

    // 집계용 — 무거운 본문 없이 요약만 씁니다
    async allSessions() { return (await readIndex()).sessions; },

    async readFolders() { return (await readIndex()).folders; },

    async writeFolders(folders) {
      const index = await readIndex();
      index.folders = folders;
      await writeJson(INDEX, index);
    },
  };
};

export const createStore = (root) => (isBlob ? blobStore() : fileStore(root));
