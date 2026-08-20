// 요티 — 로컬 실행용 서버
//   ANTHROPIC_API_KEY=sk-ant-... node server.mjs
//   PORT=5000 node server.mjs
//   YOTI_MOCK=1 node server.mjs      키 없이 흐름만 확인
//
// 실제 요청 처리는 lib/app.mjs 에 있어요. Vercel 배포는 api/index.mjs 가 같은 걸 씁니다.
import { createServer } from 'node:http';
import { handler, ready, info } from './lib/app.mjs';

const server = createServer(handler);

server.on('error', (err) => {
  const { port } = info();
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ${port}번 포트를 이미 쓰고 있어요.  PORT=4401 node server.mjs 로 켜보세요.\n`);
    process.exit(1);
  }
  throw err;
});

await ready;

const { port, mock, model, hasKey, lan } = info();
server.listen(port, '0.0.0.0', () => {
  console.log(`\n  요티          http://localhost:${port}`);
  console.log(`  같은 네트워크  http://${lan}:${port}`);
  console.log(mock
    ? `  AI 생성       목 모드 (YOTI_MOCK=1 — 모델을 부르지 않아요)\n`
    : hasKey
    ? `  AI 생성       켜짐 (${model})\n`
    : `  AI 생성       꺼짐 — ANTHROPIC_API_KEY가 없어요\n                design-docs/.env 파일에 ANTHROPIC_API_KEY=sk-ant-... 를 적어주세요\n`);
});
