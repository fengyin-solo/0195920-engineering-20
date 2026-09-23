# 构建阶段
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --registry=https://registry.npmmirror.com

# 复制源代码（.dockerignore 已排除本地 node_modules / dist，保证构建一致）
COPY . .

# 发布流水线：静态检查 → 类型检查 → 产物打包（依赖已在上层 npm ci 安装，跳过）
RUN npm run release -- --skip-deps

# 生产阶段 - 使用跨平台 nginx 镜像
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
