/**
 * Entry point bundled into the published `chatterpilot` package.
 * `npx chatterpilot` starts the MCP server (stdio, lite profile) and does not open the review app.
 */
import { runMcpCommand } from "./mcp-cli.ts";

process.exitCode = await runMcpCommand(process.argv.slice(2));
