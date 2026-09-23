import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

// 静态检查配置：只启用确定性的错误规则（essential），
// 不做风格类强制，避免历史代码被格式问题卡住流水线。
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'release-staging/**', 'dev-dist/**']
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      // 本项目允许部分未使用变量（如事件回调参数），保留警告但不阻断
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }]
    }
  },
  {
    // Node 侧文件：构建脚本、配置文件
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
]
