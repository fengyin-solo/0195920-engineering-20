// 样式编译检查：在正式打包前先用 sass 预编译全部样式来源，
// 让「样式编译失败」作为独立步骤尽早暴露（而不是混在 vite build 输出里）。
//
// 检查范围：
//   1. src 下所有 .scss 文件
//   2. 所有 .vue SFC 中 <style lang="scss"> 块
//
// 仅做编译，不产出文件；编译结果直接丢弃。
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { compileStringAsync } from 'sass'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(rootDir, 'src')

// 提取 SFC 中的 <style lang="scss" ...> 块
const STYLE_BLOCK_RE = /<style\b[^>]*\blang=["']scss["'][^>]*>([\s\S]*?)<\/style>/gi

async function walk(dir) {
  const entries = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) entries.push(...(await walk(full)))
    else entries.push(full)
  }
  return entries
}

const targets = []

if (existsSync(srcDir)) {
  const allFiles = await walk(srcDir)

  // 1. 独立 scss 文件
  for (const file of allFiles.filter(f => f.endsWith('.scss'))) {
    targets.push({ file, source: await readFile(file, 'utf8'), kind: 'scss' })
  }

  // 2. SFC 内联 scss 块
  for (const file of allFiles.filter(f => f.endsWith('.vue'))) {
    const content = await readFile(file, 'utf8')
    for (const match of content.matchAll(STYLE_BLOCK_RE)) {
      targets.push({ file, source: match[1], kind: 'vue-style' })
    }
  }
}

if (targets.length === 0) {
  console.log('未发现需要检查的 scss 样式。')
  process.exit(0)
}

let failed = 0
for (const target of targets) {
  const rel = path.relative(rootDir, target.file)
  try {
    await compileStringAsync(target.source, {
      url: pathToFileURL(target.file),
      loadPaths: [srcDir, path.join(rootDir, 'node_modules')],
      quietDeps: true
    })
    console.log(`  ✓ ${rel}${target.kind === 'vue-style' ? ' (<style scss>)' : ''}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${rel}${target.kind === 'vue-style' ? ' (<style scss>)' : ''}`)
    console.error(formatSassError(err))
  }
}

if (failed > 0) {
  console.error(`\n样式编译检查失败：${failed} 个样式单元无法编译。`)
  process.exit(1)
}

console.log(`样式编译检查通过（${targets.length} 个样式单元）。`)

function formatSassError(err) {
  const lines = []
  if (err.span?.start) {
    const { line, column } = err.span.start
    lines.push(`    位置: 第 ${line} 行, 第 ${column} 列`)
  }
  if (err.sassMessage) lines.push(`    原因: ${err.sassMessage}`)
  else lines.push(`    原因: ${err.message}`)
  if (err.span?.text) lines.push(`    代码: ${err.span.text.trim()}`)
  return lines.join('\n')
}
