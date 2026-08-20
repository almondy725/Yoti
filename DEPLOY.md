# 요티 배포 (Vercel)

## 처음 한 번만

```bash
# 1. Vercel CLI
npm i -g vercel
vercel login

# 2. 프로젝트 연결 (design-docs 폴더에서)
vercel link

# 3. Blob 저장소 만들기
#    대시보드 → Storage → Create → Blob → 프로젝트에 연결
#    연결하면 BLOB_READ_WRITE_TOKEN 이 자동으로 들어가요.
#    이 토큰이 있으면 저장소가 자동으로 Blob 모드로 바뀝니다.

# 4. 나머지 환경변수
vercel env add ANTHROPIC_API_KEY production
vercel env add YOTI_ADMIN_PASSWORD production
vercel env add YOTI_SESSION_SECRET production   # openssl rand -hex 32 결과를 넣으세요

# 5. 배포
vercel --prod
```

## 그 다음부터

```bash
vercel --prod
```

## 환경변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | ✅ | Blob 저장소를 연결하면 자동으로 들어와요. **이게 있어야 데이터가 저장됩니다** |
| `ANTHROPIC_API_KEY` | ✅ | AI 프로토타입 생성용 |
| `YOTI_ADMIN_PASSWORD` | ✅ | **비워두면 로그인 없이 누구나 관리 화면에 들어와요** |
| `YOTI_SESSION_SECRET` | ✅ | 고정하지 않으면 배포할 때마다 전원 로그아웃 |
| `YOTI_STORAGE` | | `file` \| `blob` — 안 넣으면 토큰 유무로 자동 판단 |
| `YOTI_MODEL` | | 기본 `claude-opus-5` |

## 무료 한도 안에서 쓰기

Vercel Hobby는 **개인·비상업 용도** 기준이에요.

측정해 본 실제 사용량입니다.

| 하는 일 | Blob 쓰기(월 1만) | Blob 읽기(월 10만) |
|---|---|---|
| 홈 화면 한 번 보기 | 0 | 3 |
| UT 상세 열기 | 0 | 1 + 참여 건수 |
| UT 만들기 | 2 | 1 |
| 참여 1건 기록 | 2 | 1 |

목록·집계는 `index.json` 하나만 읽어서 처리해요. 파일을 낱개로 훑지 않습니다.

환산하면 **월 참여 5,000건**, **홈 조회 33,000회**까지 무료 안에 들어와요. 저장 용량은 5GB 무료인데 참여 기록 하나가 화면 녹화 때문에 150KB~1.6MB라 **참여 3,000건쯤**이 한계입니다.

한도를 넘으면 요금이 붙는 게 아니라 **30일 동안 Blob을 못 씁니다.** 넘길 것 같으면 오래된 참여 기록을 지워주세요.

## 알아둘 것

**AI 생성 시간** — Vercel 함수는 300초가 상한이에요. 5화면짜리 프로토타입을 만들어 보니 **188초** 걸렸습니다. 이미지를 많이 넣거나 화면이 복잡하면 300초를 넘겨 생성이 끊길 수 있어요. 그럴 땐 화면 수를 줄이거나 이미지를 나눠서 만들어주세요.

**참여자 링크는 로그인 없이 열려요.** `/t/<id>` 와 참여 기록 저장만 열어뒀고, UT 목록·생성·삭제·참여자 탭은 모두 로그인이 필요합니다.

**로컬은 그대로 파일 저장이에요.** `BLOB_READ_WRITE_TOKEN` 이 없으면 자동으로 `data/` 폴더를 씁니다.

## 로컬에서 확인

```bash
npm start                                    # 파일 저장
YOTI_ADMIN_PASSWORD=test npm start           # 로그인 걸어보기
```

## Fly.io로 옮기고 싶다면

`Dockerfile` 과 `fly.toml` 도 같이 들어 있어요. 월 $4~6 들지만 실행 시간 제한이 없고 상업적 사용도 됩니다. 그때는 `YOTI_STORAGE=file` 로 두고 볼륨을 붙이면 돼요.
