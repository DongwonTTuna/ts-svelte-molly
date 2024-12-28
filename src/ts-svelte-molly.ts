import * as fs from 'fs'
import * as process from 'node:process'
import * as path from 'path'

// ------ [定数] ----------------------------------------------------------------

// 検索対象の拡張子
let TARGET_EXTENSIONS = ['.svelte', '.png', '.jpg', '.jpeg']

// 無視するPath
let IGNORE_PATHS = ['__tests__']

// 無視する.svelteのファイル名
let IGNORE_SVELTE_START_WITH = ['+']
let IGNORE_SVELTE_CONTAINS = ['.story.', '.test.']

let aliases: { [key: string]: string } = {}

// TSのpathsが設定されている場合は、pathsを取得
if (fs.existsSync(path.resolve('tsconfig.json'))) {
  const tsConfigPath = path.resolve('tsconfig.json')
  const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf-8'))

  const aliases: Record<string, string> = {}
  const paths: [string, string[]] = tsConfig?.compilerOptions?.paths

  if (paths) {
    for (const [key, value] of Object.entries(paths)) {
      const alias = key.replace('/*', '')
      aliases[alias] = path.resolve(value[0]!.replace('/*', ''))
    }
  }
}

// ------ [Util関数] ----------------------------------------------------------------
// 色付けたテキストをCLIに出力するための関数
// Before
const printRed = (text: string) => process.stdout.write('\x1b[31m\x1b[1m' + text + '\x1b[0m')
const printGreen = (text: string) => process.stdout.write('\x1b[32m' + text + '\x1b[0m')
const printLine = (text: string) => process.stdout.write(text + '\n')

// ------ [メイン処理] ----------------------------------------------------------------
// 検索対象のファイルを取得する関数
function findTargetFiles(dir: string) {
  let results: string[] = []
  const list = fs.readdirSync(dir)

  list.forEach((fileOrDir) => {
    fileOrDir = path.join(dir, fileOrDir)
    const stat = fs.statSync(fileOrDir)

    const extName = path.extname(fileOrDir)
    if (stat && stat.isDirectory()) {
      // 無視するPathが含まれている場合、処理をスキップ
      if (IGNORE_PATHS.some((str) => fileOrDir.includes(str))) {
        return
      }
      // サブディレクトリが存在する場合、再帰的に検索
      results = results.concat(findTargetFiles(fileOrDir))
    } else if (TARGET_EXTENSIONS.includes(extName)) {
      // 検索対象の拡張子の場合、結果対象に追加
      results.push(fileOrDir)
    }
  })

  return results
}

// 検索対象のファイルが使用されているかどうかを確認する関数
function searchFile(filename: string, dir: string) {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filepath = path.join(dir, file)
    const stat = fs.statSync(filepath)

    // ディレクトリの場合、再帰的に検索
    if (stat && stat.isDirectory()) {
      const found = searchFile(filename, filepath)
      if (found) return true
    } else if (filepath.endsWith('.ts') || filepath.endsWith('.svelte')) {
      let content = fs.readFileSync(filepath, 'utf-8')

      // aliasが設定されている場合は、aliasを置換
      for (const alias in aliases) {
        const replacement = aliases[alias]
        content = content.split(alias).join(replacement)
      }

      // ファイル内に検索対象のファイル名が含まれている場合、trueを返す
      if (content.includes(filename) || content.includes(`/${filename}`)) {
        return true
      }
    }
  }

  return false
}

// 使用されていないファイルを格納する配列
let unusedFiles: string[] = []

// 全ての検索対象ファイルを取得し、ループ処理
const files = findTargetFiles('src')

for (const targetFile of files) {
  // ファイル名とファイルの拡張子を取得
  let fileName = path.basename(targetFile)
  let extName = path.extname(targetFile)

  // ファイルの拡張子が.svelteの場合
  if (extName === '.svelte') {
    const isIgnoreStartWith = IGNORE_SVELTE_START_WITH.some((str) => fileName.startsWith(str))
    const isIgnoreContains = IGNORE_SVELTE_CONTAINS.some((str) => fileName.includes(str))
    if (isIgnoreStartWith || isIgnoreContains) {
      printGreen('•')
      continue
    }
  }

  const found = searchFile(fileName, 'src')

  // ファイルが使用されていない場合、unusedFilesに追加
  if (!found) {
    printRed('x')
    unusedFiles.push(targetFile)
  } else {
    printGreen('•')
  }
}

// 使用されていないファイルがない場合、処理を終了
if (unusedFiles.length > 0) {
  printLine('使用されていないファイルが見つかりました。')
  for (const unusedFile of unusedFiles) {
    printLine(unusedFile)
  }
  process.exit(1)
}
