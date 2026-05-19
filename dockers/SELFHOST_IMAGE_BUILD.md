# 自托管镜像构建说明

本文档记录 Teable 主服务镜像和独立 Sandbox Agent 镜像的构建、推送和本地验收流程。Sandbox Agent 作为独立项目维护，不放入 Teable 主仓库。

## 构建产物

- Teable 主服务镜像：`atishoo/teable-selfhost:latest`
- Sandbox Agent 镜像：`atishoo/teable-sandbox:latest`
- 支持架构：`linux/amd64`、`linux/arm64`

## 为什么首次构建慢

- 多架构构建会分别构建 `amd64` 和 `arm64` 两套镜像。
- Sandbox Agent 包含较多系统包、Python 包和文件处理能力，例如 `ffmpeg`、`poppler-utils`、`pandas`、`openpyxl`、`pdfplumber`、`markitdown[pptx]`。
- 首次构建没有远程缓存，`arm64` 依赖层经常需要完整下载和安装。
- 推送多架构 manifest 后，如果启用 provenance/SBOM，部分 Docker 环境拉取时可能遇到元数据层校验问题，所以发布镜像时固定关闭。

## 前置准备

登录 Docker Hub：

```bash
docker login -u '467237923@qq.com'
```

确认 `buildx` 可用：

```bash
docker buildx version
docker buildx ls
```

如果网络需要代理，先设置：

```bash
export https_proxy=http://127.0.0.1:7897
export http_proxy=http://127.0.0.1:7897
export all_proxy=socks5://127.0.0.1:7897
```

## 构建 Teable 主服务镜像

在 Teable 主仓库根目录执行：

```bash
export BUILD_VERSION="$(git rev-parse --short=10 HEAD)"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f dockers/teable/Dockerfile \
  -t atishoo/teable-selfhost:latest \
  --build-arg BUILD_VERSION="$BUILD_VERSION" \
  --build-arg SENTRY_ENABLED=false \
  --build-arg SENTRY_TRACING=false \
  --cache-from type=registry,ref=atishoo/teable-selfhost:buildcache \
  --cache-to type=registry,ref=atishoo/teable-selfhost:buildcache,mode=max \
  --provenance=false \
  --sbom=false \
  --push \
  .
```

## 构建 Sandbox Agent 镜像

Sandbox Agent 是独立项目，默认放在桌面目录：

```bash
export SANDBOX_PROJECT_DIR="${SANDBOX_PROJECT_DIR:-$HOME/Desktop/sandbox}"
```

该目录至少需要包含：

- `Dockerfile`
- `package.json`
- `server.js`
- `assets/CLAUDE.md`
- `assets/docs/`
- `assets/skills/`

执行构建和推送：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t atishoo/teable-sandbox:latest \
  --cache-from type=registry,ref=atishoo/teable-sandbox:buildcache \
  --cache-to type=registry,ref=atishoo/teable-sandbox:buildcache,mode=max \
  --provenance=false \
  --sbom=false \
  --push \
  "$SANDBOX_PROJECT_DIR"
```

## 只做本机快速验证

如果只是本机验证，不需要推送多架构镜像，可以只构建当前机器架构。Apple Silicon 通常使用 `linux/arm64`：

```bash
docker buildx build \
  --platform linux/arm64 \
  -f dockers/teable/Dockerfile \
  -t atishoo/teable-selfhost:local \
  --build-arg BUILD_VERSION="$(git rev-parse --short=10 HEAD)" \
  --build-arg SENTRY_ENABLED=false \
  --build-arg SENTRY_TRACING=false \
  --load \
  .
```

Sandbox Agent 本机验证：

```bash
docker buildx build \
  --platform linux/arm64 \
  -t atishoo/teable-sandbox:local \
  --load \
  "$SANDBOX_PROJECT_DIR"
```

## 验证镜像 manifest

推送完成后检查镜像是否包含两个平台，且没有额外 unknown attestation manifest：

```bash
docker buildx imagetools inspect atishoo/teable-selfhost:latest
docker buildx imagetools inspect atishoo/teable-sandbox:latest
```

期望输出包含：

- `Platform: linux/amd64`
- `Platform: linux/arm64`

## 本地 Compose 验收

可以按官方最小化部署方式启动 Teable、Postgres、Redis，并额外增加 Sandbox Agent 服务。验收配置建议放在仓库外，例如：

```bash
cd "$HOME/Desktop/teable-selfhost-test"
docker compose -p teable-selfhost-test --env-file .env pull
docker compose -p teable-selfhost-test --env-file .env up -d
```

确认服务状态：

```bash
docker compose -p teable-selfhost-test --env-file .env ps
curl -fsSI http://localhost:3000
```

验证 Sandbox Agent：

```bash
docker compose -p teable-selfhost-test --env-file .env exec -T teable-sandbox-agent \
  node -e "fetch('http://localhost:18923/health').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })"
```

验证数据库迁移：

```bash
docker compose -p teable-selfhost-test --env-file .env exec -T teable-db \
  psql -U teable -d teable -tAc "select count(*) from information_schema.tables where table_schema='public';"
```

验证 Redis：

```bash
docker compose -p teable-selfhost-test --env-file .env exec -T teable-cache \
  sh -lc 'redis-cli -a "$REDIS_PASSWORD" --raw ping'
```

## 下次构建如何更快

- 不要清理 Docker build cache，不要随手执行 `docker builder prune`、`docker system prune -a`。
- 固定使用上面的 registry cache 参数，让不同机器也能复用已推送的构建缓存。
- 只验证本机时优先使用单架构 `--load`，确认无误后再执行多架构 `--push`。
- Sandbox Agent 的系统依赖和 Python 依赖层很重，只有 `Dockerfile`、`package.json` 或依赖列表变化时才会重新安装。
- Teable 主服务的依赖层和构建层会受 `pnpm-lock.yaml`、源码和 Dockerfile 影响；只改文档或部署配置时不需要重建镜像。

## 常见问题

### 拉取镜像时报 failed size validation

多架构镜像带 provenance/SBOM 附件时，部分 Docker 环境可能在拉取 unknown manifest 层时报大小校验失败。发布镜像时使用：

```bash
--provenance=false --sbom=false
```

### Compose 健康检查不通过但服务已监听

先看日志：

```bash
docker compose -p teable-selfhost-test --env-file .env logs --tail=120 teable
docker compose -p teable-selfhost-test --env-file .env logs --tail=120 teable-sandbox-agent
```

Sandbox Agent 镜像不一定包含 `wget`，健康检查建议使用 Node 内置 `fetch`。

### 3000 端口被占用

查看占用进程：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

如果是旧的本地开发服务，先停止后再启动 Compose。不要复用已有测试环境的 DB/Redis 容器，避免数据和配置混淆。
