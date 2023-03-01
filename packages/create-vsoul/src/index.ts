import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// import spawn from 'cross-spawn'
import minimist from 'minimist'
import prompts from 'prompts'
import {
  blue,
  cyan,
  // green,
  // lightGreen,
  // lightRed,
  // magenta,
  red,
  reset,
  yellow,
} from 'kolorist'

const argv = minimist<{ t?: string; template?: string }>(
  process.argv.slice(2),
  { string: ['_'] },
)

const cwd = process.cwd()

type ColorFunc = (str: string | number) => string
type Framework = {
  name: string
  display: string
  color: ColorFunc
  variants: FrameworkVariant[]
}
type FrameworkVariant = {
  name: string
  display: string
  color: ColorFunc
  customCommand?: string
}

const FRAMEWORKS: Framework[] = [
  /* {
        name: 'vanilla',
        display: 'Vanilla',
        color: yellow,
        variants: [
            {
                name: 'vanilla',
                display: 'JavaScript',
                color: yellow,
            },
            {
                name: 'vanilla-ts',
                display: 'TypeScript',
                color: blue,
            },
        ],
    },
    {
        name: 'vue',
        display: 'Vue',
        color: green,
        variants: [
            {
                name: 'vue',
                display: 'JavaScript',
                color: yellow,
            },
            {
                name: 'vue-ts',
                display: 'TypeScript',
                color: blue,
            },
            {
                name: 'custom-create-vue',
                display: 'Customize with create-vue ↗',
                color: green,
                customCommand: 'npm create vue@latest TARGET_DIR',
            },
            {
                name: 'custom-nuxt',
                display: 'Nuxt ↗',
                color: lightGreen,
                customCommand: 'npm exec nuxi init TARGET_DIR',
            },
        ],
    }, */
  {
    name: 'react',
    display: 'React',
    color: cyan,
    variants: [
      {
        name: 'react',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'react-ts',
        display: 'TypeScript',
        color: blue,
      },
      /* {
                name: 'react-swc',
                display: 'JavaScript + SWC',
                color: yellow,
            },
            {
                name: 'react-swc-ts',
                display: 'TypeScript + SWC',
                color: blue,
            }, */
    ],
  },
  /* {
        name: 'preact',
        display: 'Preact',
        color: magenta,
        variants: [
            {
                name: 'preact',
                display: 'JavaScript',
                color: yellow,
            },
            {
                name: 'preact-ts',
                display: 'TypeScript',
                color: blue,
            },
        ],
    },
    {
        name: 'lit',
        display: 'Lit',
        color: lightRed,
        variants: [
            {
                name: 'lit',
                display: 'JavaScript',
                color: yellow,
            },
            {
                name: 'lit-ts',
                display: 'TypeScript',
                color: blue,
            },
        ],
    },
    {
        name: 'svelte',
        display: 'Svelte',
        color: red,
        variants: [
            {
                name: 'svelte',
                display: 'JavaScript',
                color: yellow,
            },
            {
                name: 'svelte-ts',
                display: 'TypeScript',
                color: blue,
            },
            {
                name: 'custom-svelte-kit',
                display: 'SvelteKit ↗',
                color: red,
                customCommand: 'npm create svelte@latest TARGET_DIR',
            },
        ],
    },
    {
        name: 'others',
        display: 'Others',
        color: reset,
        variants: [
            {
                name: 'create-vite-extra',
                display: 'create-vite-extra ↗',
                color: reset,
                customCommand: 'npm create vite-extra@latest TARGET_DIR',
            },
        ],
    }, */
]

const TEMPLATES = FRAMEWORKS.map(
  (f) => (f.variants && f.variants.map((v) => v.name)) || [f.name],
).reduce((a, b) => a.concat(b), [])

const renameFiles: Record<string, string | undefined> = {
  _gitignore: '.gitignore',
}

const defaultTargetDir = 'vite-project'

async function init() {
  const argTargetDir = formatTargetDir(argv._[0])
  const argTemplate = argv.template || argv.t

  let targetDir = argTargetDir || defaultTargetDir
  // 项目名称
  const getProjectName = () =>
    targetDir === '.' ? path.basename(path.resolve()) : targetDir

  // 命令行交互，最终结果
  let result: prompts.Answers<
    'projectName' | 'overwrite' | 'packageName' | 'framework' | 'variant'
  >

  try {
    result = await prompts(
      [
        // 获取到项目名称 || 使用默认项目名称 vite-project
        {
          type: argTargetDir ? null : 'text',
          name: 'projectName',
          message: reset('Project name:'),
          initial: defaultTargetDir,
          onState: (state) => {
            // state = { value: '', aborted: false, exited: false } 其中 value 表示实时输入的值
            targetDir = formatTargetDir(state.value) || defaultTargetDir
          },
        },
        // 若项目名称的文件夹存在 || 项目名称文件夹不为空，询问是否继续？
        {
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'confirm',
          name: 'overwrite',
          message: () =>
            (targetDir === '.'
              ? 'Current directory'
              : `Target directory "${targetDir}"`) +
            ` is not empty. Remove existing files and continue?`,
        },
        // 若上一步选择覆盖已有项目文件夹，则继续，否则结束操作
        {
          type: (_, { overwrite }: { overwrite?: boolean }) => {
            if (overwrite === false) {
              throw new Error(red('✖') + ' Operation cancelled')
            }
            return null
          },
          name: 'overwriteChecker',
        },
        // 校验项目名，用于 package.json 文件中的 name 字段
        {
          type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
          name: 'packageName',
          message: reset('Package name:'),
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir) =>
            isValidPackageName(dir) || 'Invalid package.json name',
        },
        // 选择一个框架
        {
          type:
            argTemplate && TEMPLATES.includes(argTemplate) ? null : 'select',
          name: 'framework',
          message:
            typeof argTemplate === 'string' && !TEMPLATES.includes(argTemplate)
              ? reset(
                  `"${argTemplate}" isn't a valid template. Please choose from below: `,
                )
              : reset('Select a framework:'),
          initial: 0,
          choices: FRAMEWORKS.map((framework) => {
            const frameworkColor = framework.color
            return {
              title: frameworkColor(framework.display || framework.name),
              value: framework,
            }
          }),
        },
        // 上一步选择框架的变种，如：js | ts
        {
          type: (framework: Framework) =>
            framework && framework.variants ? 'select' : null,
          name: 'variant',
          message: reset('Select a variant:'),
          choices: (framework: Framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color
              return {
                title: variantColor(variant.display || variant.name),
                value: variant.name,
              }
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled')
        },
      },
    )
  } catch (cancelled: any) {
    console.log(cancelled.message)
    return
  }

  const { framework, overwrite, packageName, variant } = result

  const root = path.join(cwd, targetDir) // 新建项目的绝对路径

  // 置空新建项目的文件夹
  if (overwrite) {
    emptyDir(root)
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }

  // 项目模板
  let template: string = variant || framework?.name || argTemplate

  // TODO：其他判断。。。

  // 获取包管理工具
  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
  const pkgManager = pkgInfo ? pkgInfo.name : 'pnpm'

  const { customCommand } =
    FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ?? {}

  // 自定义命令
  if (customCommand) {
    console.log('自定义命令。。。。')
    process.exit(0)
  }

  console.log(`\nScaffolding project in ${root}...`)

  // 选定模板存放的绝对路径
  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '../..',
    `template-${template}`,
  )

  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file)
    if (content) {
      fs.writeFileSync(targetPath, content)
    } else {
      copy(path.join(templateDir, file), targetPath)
    }
  }

  // 读取选定模板文件 | 夹，写入|拷贝到新建项目文件夹中
  const files = fs.readdirSync(templateDir)
  for (const file of files.filter((f) => f !== 'package.json')) {
    write(file)
  }

  // 获取 package.json 文件内容，修改 name 字段为 【项目名】
  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8'),
  )
  pkg.name = packageName || getProjectName()
  write('package.json', JSON.stringify(pkg, null, 2) + '\n')

  // TODO：若是 ReactSwc 。。。

  const cdProjectName = path.relative(cwd, root)
  console.log(`\n Done. Now run: \n`)

  if (root !== cwd) {
    console.log(
      `  cd ${
        cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName
      }`,
    )
  }
  switch (pkgManager) {
    case 'yarn':
      console.log('  yarn')
      console.log('  yarn dev')
      break
    default:
      console.log(`  ${pkgManager} install`)
      console.log(`  ${pkgManager} run dev`)
      break
  }
  console.log()
}

/* tools - start */
function formatTargetDir(targetDir: string | undefined) {
  return targetDir?.trim().replace(/\/+$/g, '')
}

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName,
  )
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
}

// 复制文件夹 || 文件
function copy(src: string, dest: string) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    copyDir(src, dest)
  } else {
    fs.copyFileSync(src, dest)
  }
}

// 复制文件夹
function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    const destFile = path.resolve(destDir, file)

    copy(srcFile, destFile)
  }
}

// 给定一个路径，判断是否是空文件夹
function isEmpty(path: string) {
  const files = fs.readdirSync(path)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

// 置空文件夹
function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) return

  for (const file of fs.readdirSync(dir)) {
    if (file === '.git') {
      continue
    }
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true }) // force 强制执行
  }
}

//
function pkgFromUserAgent(userAgent: string | undefined) {
  if (!userAgent) return undefined
  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  }
}

// TODO
function setupReactSwc(root: string, isTs: boolean) {}

// 编辑文件
function editFile(file: string, callback: (content: string) => string) {
  const content = fs.readFileSync(file, 'utf-8')
  fs.writeFileSync(file, callback(content), 'utf-8')
}
/* tools - end */

init().catch((err) => console.error(err))
