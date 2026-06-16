FROM node:22-bookworm-slim AS build

ENV APP_BASE_PATH=/8puzzle/
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM python:3.13-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8020

WORKDIR /app
RUN addgroup --system eightpuzzle && adduser --system --ingroup eightpuzzle eightpuzzle
COPY --chown=eightpuzzle:eightpuzzle src/ src/
COPY --from=build --chown=eightpuzzle:eightpuzzle /app/src/frontend/dist/ src/frontend/dist/
USER eightpuzzle
EXPOSE 8020

CMD ["python3", "-m", "src.server.app"]
