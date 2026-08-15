$ErrorActionPreference = 'Stop'
node --version
npx --yes pnpm@9.15.4 install --frozen-lockfile
npx --yes pnpm@9.15.4 validate:package
