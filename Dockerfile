# 요티 — Fly.io 배포용
FROM node:22-slim

WORKDIR /app

# 의존성 먼저 복사해야 코드만 바뀔 때 캐시가 살아요
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# UT와 참여 기록은 볼륨에 저장해요. 컨테이너를 새로 띄워도 남습니다.
ENV YOTI_DATA=/data
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
