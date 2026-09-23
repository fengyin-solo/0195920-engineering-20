# 构建阶段
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖描述并按 lock 文件安装依赖：
# 只要 package*.json 不变，这一层就会被 Docker 构建缓存直接复用，
# 避免每次构建都重新下载依赖；--mount=type=cache 让 npm 下载缓存
# 在依赖确实变化、层缓存失效时也能跨次构建复用。
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund

# 复制源代码
COPY . .

# 走统一发布流水线：静态检查 → 类型检查 → 样式编译检查 → 产物打包。
# 依赖已在上一层装完且与 lock 一致，流水线会自动跳过安装步骤复用这一层；
# 任一步骤失败都会让镜像构建中止，并指明卡在第几步、原因是什么。
# 打包在容器内的暂存目录完成，成功后原子替换为 dist，不会残留中间产物。
RUN npm run release

# 生产阶段 - 使用跨平台 nginx 镜像
FROM nginx:alpine

# 复制构建产物（流水线输出目录仍是 dist，与之前保持一致）
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
