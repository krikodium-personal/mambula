import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const kind = process.argv[2] ?? 'patch'
if (kind !== 'patch' && kind !== 'minor' && kind !== 'major') {
  console.error('Usage: node scripts/bump-version.mjs [patch|minor|major]')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)

if ([major, minor, patch].some((n) => Number.isNaN(n))) {
  console.error(`Invalid version in package.json: ${pkg.version}`)
  process.exit(1)
}

let nextMajor = major
let nextMinor = minor
let nextPatch = patch

if (kind === 'major') {
  nextMajor += 1
  nextMinor = 0
  nextPatch = 0
} else if (kind === 'minor') {
  nextMinor += 1
  nextPatch = 0
} else {
  nextPatch += 1
}

pkg.version = `${nextMajor}.${nextMinor}.${nextPatch}`
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(pkg.version)
