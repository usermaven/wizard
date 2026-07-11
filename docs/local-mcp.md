# Local MCP development playbook

The Usermaven Wizard MCP server runs as a local child process over stdio. It has
no listening port and makes no remote Usermaven calls. Version `0.4.0` exposes:

- `inspect_project`: normalized framework and analytics evidence
- `propose_tracking_plan`: a deterministic, review-required baseline plan

Both tools are read-only, non-destructive, idempotent, and confined to one root
selected when the process starts.

## Build and run from this repository

```sh
npm install
npm run build
node /absolute/path/to/wizard/packages/cli/dist/mcp.js \
  --root /absolute/path/to/project
```

The process waits for MCP JSON-RPC on stdin. Do not type ordinary commands into
it and do not redirect diagnostic text to stdout.

## Generic client configuration

Most desktop and editor clients accept a configuration shaped like this:

```json
{
  "mcpServers": {
    "usermaven-wizard": {
      "command": "node",
      "args": [
        "/absolute/path/to/wizard/packages/cli/dist/mcp.js",
        "--root",
        "/absolute/path/to/project"
      ]
    }
  }
}
```

Restart or reload the client after changing its MCP configuration. The client
should discover exactly `inspect_project` and `propose_tracking_plan`.

After the npm package is published, the equivalent command will be:

```sh
npx -y -p @usermaven/wizard@0.4.0 usermaven-wizard-mcp \
  --root /absolute/path/to/project
```

Pin an exact version in automated or team configuration. Do not use an unpinned
`latest` package for repository-accessing tooling.

## Development verification

```sh
npm test
npm run check
npm run test:mcp-stdio
node packages/cli/dist/mcp.js --help
```

The protocol tests use the official SDK's in-memory client/transport and cover
tool discovery, structured results, privacy, traversal rejection, and symlink
escape rejection.

## Filesystem and privacy behavior

- `--root` is canonicalized once at startup.
- Tool `project_path` values must be relative descendants of that root.
- Absolute paths, parent traversal, missing directories, and symlink escapes are
  rejected without returning host paths.
- Source and repository text are treated as untrusted data.
- Results contain normalized tokens and locations, never snippets, environment
  values, raw analytics payloads, or secrets.
- No tool currently installs packages, edits files, opens a browser, or contacts
  the remote Usermaven MCP.

## Troubleshooting

- No tools appear: build the repository and verify the configured `node` and
  `dist/mcp.js` paths are absolute.
- Server exits immediately: run the same command with `--help`, then verify the
  configured root exists and is a directory.
- Project path rejected: pass `.` or a relative child directory. The root itself
  must be changed in the client process arguments.
- Protocol parsing fails: ensure nothing writes logs or shell banners to stdout.
  Client-visible diagnostics belong on stderr or MCP logging notifications.
