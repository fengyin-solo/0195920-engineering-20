# 标签编辑软件 (Label Editor)

## How to Run

### 方式一：Docker Compose（推荐）

```bash
# 进入项目根目录
cd frontend-admin

# 构建并启动服务
docker-compose up -d --build

# 访问应用
# 前端应用: http://localhost:8081
```

### 方式二：本地开发

```bash
# 进入前端项目目录
cd frontend-admin

# 安装依赖（严格按 package-lock.json 安装，保证每个人环境一致）
npm ci

# 启动开发服务器
npm run dev
```

### 方式三：本地构建生产版本

```bash
cd frontend-admin

# 一条命令走完发布流水线（推荐，替代手工 npm run build）
npm run release
```

`npm run release` 会依次执行，任一步骤失败立即中止并报出「卡在第几步、原因是什么」：

| 步骤 | 内容 | 对应命令 |
|------|------|----------|
| 1/5 | 依赖安装（按 lock 文件，已一致时自动跳过） | `npm ci` |
| 2/5 | 静态检查（ESLint，js/vue） | `npm run lint` |
| 3/5 | 类型检查（vue-tsc，含 .vue 模板） | `npm run typecheck` |
| 4/5 | 样式编译检查（sass 预编译） | `npm run check:styles` |
| 5/5 | 产物打包（vite build） | `npm run build` |

也可以单独执行各检查命令在开发时提前发现问题。

流水线特性：

- **版本一致**：依赖以 `package-lock.json` 为准（`npm ci`)，不同人、不同机器装出相同的依赖；
- **失败可重试**：修复后重新 `npm run release`，npm 下载缓存、`node_modules`、vite 转换缓存都会被复用，只跑必要的工作；
- **不留半成品**：打包先写入 `release-staging/` 暂存目录，构建成功后才原子替换 `dist/`；失败时清理暂存目录，上一次成功的 `dist/` 不受影响；
- **产物与入口不变**：最终产物仍是 `frontend-admin/dist/`，发布仍然走 `docker-compose up -d --build`（Dockerfile 内部改为执行同一条流水线）。

可选参数：`npm run release -- --force-deps` 强制重装依赖。

> `npm run build`（直接 vite build）仍然保留可用，但它不包含上述检查，正式发布请使用 `npm run release` 或 Docker 构建。

## Services

| 服务名称 | 端口 | 说明 |
|---------|------|------|
| frontend-admin | 8081 | 标签编辑器前端应用 |

## 测试账号

本项目为纯前端应用，无需登录账号即可使用。

## 题目内容

创建一个html 版本的标签编辑软件，包含 指定 宽度 和 高度（单位mm） 创建 标签画布（转换为点，1mm=8dot）， 支持文本、图形、图片、条码、二维码， 支持画布中元件之间对齐，支持 左右 居中对齐元件；包含画布元件的属性设置；  可以把画布保存为bmp 图片（位深度为1 ）

### 技术栈

- Vue 3 + Vite
- Element Plus
- Scss
- Pinia（状态管理）
- Axios

## 项目结构

```
├── README.md                    # 项目说明文档
├── docker-compose.yml           # Docker Compose 配置
├── .gitignore                   # Git 忽略文件
└── frontend-admin/              # 前端项目代码
    ├── package.json             # 项目依赖配置
    ├── package-lock.json        # 依赖版本锁定文件（npm ci 以此为准）
    ├── eslint.config.js         # ESLint 静态检查配置
    ├── tsconfig.json            # vue-tsc 类型检查配置
    ├── scripts/
    │   ├── release.mjs          # 发布流水线：依赖→检查→打包
    │   └── check-styles.mjs     # 样式编译检查
    ├── Dockerfile               # Docker 构建文件（内部执行发布流水线）
    ├── nginx.conf               # Nginx 配置文件
    ├── vite.config.js           # Vite 构建配置
    ├── index.html               # 入口 HTML 文件
    ├── public/                  # 静态资源目录
    └── src/                     # 源代码目录
        ├── main.js              # 应用入口，初始化 Vue、Pinia、Element Plus
        ├── App.vue              # 根组件，整体布局
        ├── assets/              # 静态资源
        ├── stores/              # Pinia 状态管理
        └── components/          # Vue 组件
            ├── Toolbar/         # 顶部工具栏
            ├── Elements/        # 左侧元件面板
            ├── Properties/      # 右侧属性面板
            └── Canvas/          # 中间画布区域
```

## 功能说明

| 功能模块 | 说明 |
|---------|------|
| 画布设置 | 支持设置画布宽高（单位mm，1mm=8dot） |
| 元件拖放 | 从左侧元件库拖拽元件到画布 |
| 元件编辑 | 拖动、调整大小、旋转，不可超出画布边界 |
| 多选对齐 | Ctrl+点击多选元件，支持左/中/右对齐 |
| 属性设置 | 右侧面板编辑选中元件的各项属性 |
| 图层管理 | 左侧图层列表，支持显示/隐藏、删除 |
| 导出图片 | 支持导出为 PNG 或 1-bit BMP 格式 |

## 功能截图

应用启动后，您将看到一个完整的标签编辑界面，包含：
- 顶部工具栏：画布设置、缩放、导出
- 左侧元件库：可拖拽的元件列表和图层管理
- 中间画布区：可视化编辑区域
- 右侧属性面板：选中元件的属性设置和对齐功能

## License

MIT
