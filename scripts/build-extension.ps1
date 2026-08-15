$ErrorActionPreference = 'Stop'
npx --yes pnpm@9.15.4 build
npx --yes pnpm@9.15.4 validate:package
