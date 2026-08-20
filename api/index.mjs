// Vercel 진입점 — 모든 요청이 vercel.json rewrite 를 타고 여기로 옵니다.
// 요청 처리 자체는 로컬과 똑같은 lib/app.mjs 를 씁니다.
import { handler, ready } from '../lib/app.mjs';

export const config = {
  // AI 프로토타입 생성이 3분 안팎 걸려요. Hobby 상한이 300초입니다.
  maxDuration: 300,
};

export default async function (req, res) {
  await ready;
  return handler(req, res);
}
