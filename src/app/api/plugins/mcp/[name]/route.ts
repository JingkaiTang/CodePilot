import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MCPServerConfig, ErrorResponse, SuccessResponse } from "@/types";
import { getClaudeSettingsPath } from "@/lib/cli-config";

function getSettingsPath(): string {
  return getClaudeSettingsPath();
}

function readSettings(): Record<string, unknown> {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  const settingsPath = getSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { name } = await params;
    const serverName = decodeURIComponent(name);

    const settings = readSettings();
    const mcpServers = (settings.mcpServers || {}) as Record<
      string,
      MCPServerConfig
    >;

    if (!mcpServers[serverName]) {
      return NextResponse.json(
        { error: `MCP server "${serverName}" not found` },
        { status: 404 },
      );
    }

    delete mcpServers[serverName];
    settings.mcpServers = mcpServers;
    writeSettings(settings);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete MCP server",
      },
      { status: 500 },
    );
  }
}
