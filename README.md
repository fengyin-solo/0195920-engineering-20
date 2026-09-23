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

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 发布流水线（打包上线）

```bash
cd frontend-admin

# 一条命令完成：依赖安装 → 静态检查 → 类型检查 → 产物打包
npm run release
```

流水线按固定顺序执行四个步骤，任何一步不通过都会中断，并指明**卡在哪一步、原因是什么**，退出码非 0：

| 步骤 | 内容 | 不通过的常见原因 |
|------|------|------------------|
| [1/4] 依赖安装 | `npm ci`，严格按 `package-lock.json` 安装 | `package.json` 与 lockfile 版本对不上、仓库不可用 |
| [2/4] 静态检查 | ESLint | 代码规范问题（部分可用 `npm run lint:fix` 自动修复） |
| [3/4] 类型检查 | `vue-tsc --noEmit` | 类型报错 |
| [4/4] 产物打包 | `vite build` | 样式编译失败、语法错误等 |

- **修好后重试**：直接重新运行 `npm run release`。依赖未变化时跳过安装，ESLint / vue-tsc 使用增量缓存（缓存在 `node_modules/.cache/`），只检查变动的部分。
- **不残留中间产物**：打包先在临时目录进行，全部通过后才替换 `dist/`；中途失败不会污染上一次成功的产物，也不会留下半成品。
- **产物一致**：流水线产物与 `npm run build` 完全一致（同一套 Vite 配置），`dist/` 目录结构不变。
- 单独运行某一项检查：`npm run lint`（静态检查）、`npm run typecheck`（类型检查）。

Docker 发布入口不变（`docker-compose up -d --build`），镜像构建内部会执行同一条流水线；`.dockerignore` 保证构建不依赖各人本地的 `node_modules` / `dist`，任何人构建出的镜像一致。

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
    ├── package-lock.json        # 锁定依赖版本（npm ci 的依据）
    ├── Dockerfile               # Docker 构建文件
    ├── .dockerignore            # Docker 构建排除本地产物
    ├── nginx.conf               # Nginx 配置文件
    ├── vite.config.js           # Vite 构建配置
    ├── eslint.config.js         # ESLint 静态检查配置
    ├── tsconfig.json            # 类型检查配置（vue-tsc）
    ├── scripts/
    │   └── pipeline.mjs         # 发布流水线（npm run release）
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
