// 发布流水线：依赖安装 → 静态检查 → 类型检查 → 样式编译检查 → 产物打包
//
// 用法：
//   npm run release                 # 全流程（依赖已与 lock 文件一致时自动跳过安装）
//   npm run release -- --force-deps # 强制重新安装依赖
//
// 特性：
//   - 任一步骤失败立即中止，明确报出卡在第几步、步骤名、退出码和原因
//   - 重试时复用 npm 下载缓存 / node_modules / vite 缓存
//   - 打包先写入暂存目录，成功后原子替换 dist；失败或中断时清理暂存目录，
//     不会残留半成品，也不会污染上一次成功的 dist
import { spawn } from 'node:child_process'
import { rm, readFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const forceDeps = process.argv.slice(2).includes('--force-deps')

const STAGING_DIR = path.join(rootDir, 'release-staging')
const DIST_DIR = path.join(rootDir, 'dist')
const DIST_BACKUP = path.join(rootDir, 'dist.bak')
const NODE_MODULES = path.join(rootDir, 'node_modules')
const INSTALLED_LOCK = path.join(NODE_MODULES, '.package-lock.json')

const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'

// 当前正在运行的子进程，供 SIGINT/SIGTERM 中断时终止
let activeChild = null

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
}

const startedAt = Date.now()

console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗${c.reset}`)
console.log(`${c.bold}${c.cyan}║        标签编辑器 · 发布流水线                     ║${c.reset}`)
console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════╝${c.reset}`)

// 清理上一次失败可能残留的中间产物
await safeRm(STAGING_DIR)
await safeRm(DIST_BACKUP)

// ---------------------------------------------------------------------------
// 步骤定义
// ---------------------------------------------------------------------------

const steps = [
  {
    name: '依赖安装',
    desc: '按 package-lock.json 安装依赖（npm ci，锁定版本）',
    // 与普通命令不同：依赖已与 lock 文件一致时跳过，直接复用现有 node_modules
    custom: installDependencies
  },
  {
    name: '静态检查',
    desc: 'ESLint 检查 src 下的 js/vue 代码',
    cmd: npmCmd,
    args: ['run', 'lint', '--silent']
  },
  {
    name: '类型检查',
    desc: 'vue-tsc 校验 .js / .vue 中的类型问题',
    cmd: npmCmd,
    args: ['run', 'typecheck', '--silent']
  },
  {
    name: '样式编译检查',
    desc: 'sass 预编译全部 .scss 与 SFC 内联样式',
    cmd: process.execPath,
    args: [path.join('scripts', 'check-styles.mjs')]
  },
  {
    name: '产物打包',
    desc: 'vite 构建到暂存目录，成功后原子替换 dist',
    custom: buildArtifact
  }
]

// ---------------------------------------------------------------------------
// 逐步执行
// ---------------------------------------------------------------------------

for (let i = 0; i < steps.length; i++) {
  const step = steps[i]
  const index = i + 1
  printStepHeader(index, steps.length, step)

  let result
  try {
    result = step.custom
      ? await step.custom()
      : await runCommand(step.cmd, step.args)
  } catch (err) {
    result = { code: err.code ?? 1, signal: err.signal, reason: err.message }
  }

  if (result.skipped) {
    console.log(`${c.gray}  → 跳过：${result.reason}${c.reset}`)
    continue
  }

  if (result.code !== 0) {
    printFailure(index, step, result)
    process.exit(1)
  }

  console.log(`${c.green}  ✓ 通过${c.reset}`)
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
console.log('')
console.log(`${c.green}${c.bold}✔ 发布流水线全部通过（耗时 ${elapsed}s）${c.reset}`)
console.log(`${c.green}  产物目录：${path.relative(rootDir, DIST_DIR)}/${c.reset}`)

// ---------------------------------------------------------------------------
// 各步骤实现
// ---------------------------------------------------------------------------

async function installDependencies() {
  if (!forceDeps && (await dependenciesInSync())) {
    return { skipped: true, reason: 'node_modules 与 package-lock.json 一致，复用现有依赖（--force-deps 可强制重装）' }
  }
  console.log(`${c.gray}  → 执行 npm ci（优先使用本地 npm 缓存，锁定 package-lock.json 中的版本）${c.reset}`)
  return runCommand(npmCmd, ['ci', '--prefer-offline', '--no-audit', '--no-fund'])
}

// 判断 node_modules 是否由当前 package-lock.json 安装而来。
//
// 不能直接比对 lock 文件内容：npm 安装后写入 node_modules/.package-lock.json
// 的是裁剪版（只含当前平台的可选原生包，如 esbuild/rollup 的平台二进制），
// 与根 lock 天然不同。这里做语义比对：
//   1. 已安装的每个包，在根 lock 中都能找到且 version/integrity 一致
//   2. 根 lock 中所有跨平台包（无 os/cpu 限定）都已安装
//   3. package.json 声明的依赖范围与根 lock 根节点一致（不一致时 npm ci 本来就会失败）
async function dependenciesInSync() {
  if (!existsSync(INSTALLED_LOCK)) return false
  try {
    const [rootLockRaw, installedLockRaw, pkgRaw] = await Promise.all([
      readFile(path.join(rootDir, 'package-lock.json'), 'utf8'),
      readFile(INSTALLED_LOCK, 'utf8'),
      readFile(path.join(rootDir, 'package.json'), 'utf8')
    ])
    const rootLock = JSON.parse(rootLockRaw)
    const installedLock = JSON.parse(installedLockRaw)
    const pkg = JSON.parse(pkgRaw)

    const rootPkgs = rootLock.packages || {}
    const installedPkgs = installedLock.packages || {}

    // 1. 已安装包必须与根 lock 完全吻合
    for (const [name, info] of Object.entries(installedPkgs)) {
      const expected = rootPkgs[name]
      if (!expected) return false
      if ((expected.version || null) !== (info.version || null)) return false
      if ((expected.integrity || null) !== (info.integrity || null)) return false
    }

    // 2. 跨平台包不能缺装（带 os/cpu 的是平台相关可选包，允许缺失）
    for (const [name, info] of Object.entries(rootPkgs)) {
      if (name === '') continue
      if (info.os || info.cpu) continue
      if (!installedPkgs[name]) return false
    }

    // 3. package.json 与 lock 根节点的依赖声明必须一致
    const rootDecl = rootPkgs[''] || {}
    for (const group of ['dependencies', 'devDependencies']) {
      const declared = pkg[group] || {}
      const locked = rootDecl[group] || {}
      if (Object.keys(declared).length !== Object.keys(locked).length) return false
      for (const [name, range] of Object.entries(declared)) {
        if (locked[name] !== range) return false
      }
    }

    return true
  } catch {
    return false
  }
}

async function buildArtifact() {
  console.log(`${c.gray}  → 构建到暂存目录 ${path.basename(STAGING_DIR)}/，构建成功后才替换 dist/${c.reset}`)

  // 直接用 node 调用本地 vite，避免 npm exec 在依赖缺失时尝试联网安装
  const build = await runCommand(process.execPath, [
    path.join('node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--outDir',
    path.basename(STAGING_DIR)
  ])

  if (build.code !== 0) {
    // 构建失败：清理半成品暂存目录，dist 保持上一次成功构建的状态
    await safeRm(STAGING_DIR)
    return build
  }

  if (!existsSync(path.join(STAGING_DIR, 'index.html'))) {
    await safeRm(STAGING_DIR)
    return { code: 1, reason: '暂存目录中缺少 index.html，判定为不完整构建产物' }
  }

  try {
    // 原子替换：dist → dist.bak → staging → dist，成功后删除备份
    if (existsSync(DIST_DIR)) {
      await rename(DIST_DIR, DIST_BACKUP)
    }
    await rename(STAGING_DIR, DIST_DIR)
    await safeRm(DIST_BACKUP)
  } catch (err) {
    // 替换过程中出错：尽量回滚，保证现场可判断、不残留两份产物
    if (existsSync(DIST_BACKUP) && !existsSync(DIST_DIR)) {
      await rename(DIST_BACKUP, DIST_DIR)
    }
    return { code: 1, reason: `产物替换失败：${err.message}` }
  }

  return { code: 0 }
}

// ---------------------------------------------------------------------------
// 进程与输出工具
// ---------------------------------------------------------------------------

function runCommand(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: rootDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
      shell: isWindows
    })
    activeChild = child
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (activeChild === child) activeChild = null
      resolve({ code: code ?? 1, signal })
    })
  })
}

// Ctrl-C / kill 中断：终止当前子进程并清理暂存目录，避免残留半成品
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`\n${c.yellow}收到中断信号，正在清理暂存目录……${c.reset}`)
    if (activeChild) activeChild.kill('SIGTERM')
    await safeRm(STAGING_DIR)
    process.exit(130)
  })
}

function printStepHeader(index, total, step) {
  console.log('')
  console.log(`${c.bold}${c.cyan}步骤 ${index}/${total}：${step.name}${c.reset} ${c.gray}— ${step.desc}${c.reset}`)
}

function printFailure(index, step, result) {
  console.log('')
  console.log(`${c.red}${c.bold}✘ 流水线中止：卡在步骤 ${index}/${steps.length}「${step.name}」${c.reset}`)
  if (result.signal) {
    console.log(`${c.red}  原因：进程被信号 ${result.signal} 终止${c.reset}`)
  } else if (result.reason) {
    console.log(`${c.red}  原因：${result.reason}${c.reset}`)
  } else {
    console.log(`${c.red}  原因：命令以退出码 ${result.code} 结束，请根据上方日志定位具体错误${c.reset}`)
  }
  if (step.name === '依赖安装') {
    console.log(`${c.yellow}  提示：检查 package-lock.json 是否与 package.json 匹配、网络与 registry 是否可用；${c.reset}`)
    console.log(`${c.yellow}        修复后重新执行 npm run release，npm 缓存会被复用。${c.reset}`)
  } else {
    console.log(`${c.yellow}  提示：修复后重新执行 npm run release，已通过步骤的缓存会被复用。${c.reset}`)
  }
}

async function safeRm(target) {
  if (!existsSync(target)) return
  await rm(target, { recursive: true, force: true })
}
