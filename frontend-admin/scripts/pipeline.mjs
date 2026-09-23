#!/usr/bin/env node
/**
 * 发布流水线：依赖安装 → 静态检查 → 类型检查 → 产物打包
 *
 * - 任何一步失败都会指出卡在哪一步、原因是什么，退出码非 0
 * - 修复后直接重跑即可：依赖、ESLint、vue-tsc 的缓存都会复用
 * - 打包先在临时目录进行，成功后才替换 dist/，失败不会留下中间产物
 *
 * 用法：
 *   npm run release                完整流水线
 *   npm run release -- --skip-deps 跳过依赖安装（Docker 构建中依赖已由 npm ci 层安装）
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nodeModules = path.join(root, 'node_modules')
const cacheDir = path.join(nodeModules, '.cache')
const tmpRoot = path.join(cacheDir, 'pipeline')
const tmpDist = path.join(tmpRoot, 'dist')
const finalDist = path.join(root, 'dist')
const installStamp = path.join(nodeModules, '.install-stamp')
const skipDeps = process.argv.includes('--skip-deps')

const isTTY = process.stdout.isTTY
const color = (code) => (text) => (isTTY ? `\x1b[${code}m${text}\x1b[0m` : String(text))
const bold = color(1)
const red = color(31)
const green = color(32)
const cyan = color(36)
const gray = color(90)

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const nodeBin = (p) => path.join(nodeModules, p)

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status
}

function cleanupTmp() {
  // 清掉本次或上次失败留下的临时产物，保证 dist/ 要么是上次成功的产物，要么不存在
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}

function depsHash() {
  // package.json 或 lockfile 任一变动都要重新安装，
  // 由 npm ci 校验两者是否同步（版本对不上会直接报错）
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(path.join(root, 'package.json')))
  hash.update(fs.readFileSync(path.join(root, 'package-lock.json')))
  return hash.digest('hex')
}

function depsStep() {
  if (skipDeps) {
    console.log(gray('  已指定 --skip-deps，跳过（依赖由外层 npm ci 保证）'))
    return
  }
  const hash = depsHash()
  const stamp = fs.existsSync(installStamp) ? fs.readFileSync(installStamp, 'utf8').trim() : ''
  if (stamp === hash && fs.existsSync(path.join(nodeModules, 'vite'))) {
    console.log(gray('  依赖与 package-lock.json 一致，复用现有 node_modules'))
    return
  }
  // npm ci 严格按 lockfile 安装，装不上（版本对不上）会直接报错
  if (run(npmCmd, ['ci']) !== 0) {
    throw new Error('npm ci 失败：package.json 与 package-lock.json 不一致，或 npm 仓库不可用（详见上方输出）')
  }
  fs.writeFileSync(installStamp, hash)
}

function lintStep() {
  const status = run(process.execPath, [
    nodeBin('eslint/bin/eslint.js'), '.',
    '--cache', '--cache-location', path.join(cacheDir, '.eslintcache')
  ])
  if (status !== 0) {
    throw new Error('ESLint 检查未通过（见上方报告）；部分问题可运行 npm run lint:fix 自动修复')
  }
}

function typecheckStep() {
  // 增量信息写在 node_modules/.cache/vue-tsc/，重跑只检查变动的文件
  if (run(process.execPath, [nodeBin('vue-tsc/bin/vue-tsc.js'), '--noEmit']) !== 0) {
    throw new Error('vue-tsc 发现类型错误（见上方报告）')
  }
}

function buildStep() {
  cleanupTmp()
  if (run(process.execPath, [nodeBin('vite/bin/vite.js'), 'build', '--outDir', tmpDist, '--emptyOutDir']) !== 0) {
    throw new Error('Vite 构建失败（常见原因：样式编译失败、语法错误，详见上方日志）')
  }
  // 构建成功后才替换正式产物，失败的构建不会污染 dist/
  fs.rmSync(finalDist, { recursive: true, force: true })
  fs.renameSync(tmpDist, finalDist)
}

const steps = [
  { name: '依赖安装', detail: 'npm ci，严格按 package-lock.json 安装', run: depsStep },
  { name: '静态检查', detail: 'ESLint', run: lintStep },
  { name: '类型检查', detail: 'vue-tsc --noEmit', run: typecheckStep },
  { name: '产物打包', detail: 'vite build', run: buildStep }
]

function main() {
  console.log(bold('发布流水线：依赖安装 → 静态检查 → 类型检查 → 产物打包\n'))
  cleanupTmp()
  const start = Date.now()

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    console.log(bold(cyan(`[${i + 1}/${steps.length}] ${step.name}`)) + gray(`（${step.detail}）`))
    const stepStart = Date.now()
    try {
      step.run()
    } catch (err) {
      cleanupTmp()
      console.error('')
      console.error(bold(red('✖ 流水线中断')))
      console.error(`  失败步骤: [${i + 1}/${steps.length}] ${step.name}`)
      console.error(`  失败原因: ${err.message}`)
      console.error(`  下一步:   修复后重新运行 ${bold('npm run release')}（已产生的缓存会自动复用）`)
      process.exit(1)
    }
    console.log(`${green('  ✔ 完成')}${gray(`（${((Date.now() - stepStart) / 1000).toFixed(1)}s）`)}\n`)
  }

  console.log(bold(green('✔ 流水线全部通过')) + gray(`（共 ${((Date.now() - start) / 1000).toFixed(1)}s）`))
  console.log(`  产物目录: ${path.relative(root, finalDist)}/`)
}

main()
