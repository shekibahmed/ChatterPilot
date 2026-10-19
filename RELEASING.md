# Releasing ChatterPilot

The git repository is public. The npm package `chatterpilot` is **not** published until you do the steps below. Do not publish from a pull request, and do not put an npm token in the repository.

The package is `packages/mcp-server`. Its `version`, `server.json`'s `version`, and the MCP server's reported version are the same string (`0.1.0` for the first release). A test fails if they drift.

## Once, on npm and GitHub

1. Create an npm account you control, and an automation token (npm → Access Tokens → Granular or Classic, publish permission for `chatterpilot`).
2. In GitHub → Settings → Secrets and variables → Actions, create a secret named **`NPM_TOKEN`** with that token. The release workflow reads `${{ secrets.NPM_TOKEN }}`. Nothing else in the repo holds it.
3. Confirm `npm view chatterpilot` is still 404. The name was free on 2026-10-19. If it has been taken, stop and rename `packages/mcp-server` before tagging.

## Publish

From a clean `main` that has passed `pnpm check`:

```sh
# version is already 0.1.0 in packages/mcp-server/package.json and server.json
git checkout main
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter chatterpilot build
node packages/mcp-server/dist/chatterpilot.js --help

git tag v0.1.0
git push origin v0.1.0
```

Pushing the tag `v0.1.0` runs [`.github/workflows/release.yml`](.github/workflows/release.yml). That workflow refuses the job if the tag (without the leading `v`) is not the `version` in `packages/mcp-server/package.json` and in `server.json`, then runs `pnpm --filter chatterpilot publish`. It does not create a GitHub Release by itself.

Watch the Actions run. When it is green:

```sh
npm view chatterpilot version
npx -y chatterpilot@0.1.0 --help
```

`npx` should print the MCP usage and exit 0. It speaks the protocol on stdio if you omit `--help`.

Later releases: bump `version` in `packages/mcp-server/package.json` and `server.json` together (and `MCP_SERVER_VERSION` in `apps/local/src/mcp.ts`), commit, tag `vX.Y.Z`, push the tag.

## Registry metadata, after npm shows the package

`server.json` is the official MCP registry manifest. It lists the npm package twice: stdio, and streamable HTTP on `127.0.0.1`. It has no public `remotes` URL, because this project does not host one.

```sh
# install the publisher (macOS/Linux), from the registry's own release
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
./mcp-publisher validate
./mcp-publisher login github
./mcp-publisher publish
```

`mcpName` in `packages/mcp-server/package.json` is `io.github.shekibahmed/chatterpilot`. GitHub login only allows that `io.github.<user>/` prefix. Validate before publish. The registry checks that the npm package exists and that `mcpName` matches `server.json`'s `name`.

Directory text and the other listings are in [docs/launch/mcp-listings.md](docs/launch/mcp-listings.md). Do not say the server is listed until the listing is actually merged or approved.
