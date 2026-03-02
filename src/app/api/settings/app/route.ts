import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * CodePilot app-level settings (stored in SQLite, separate from ~/.claude/settings.json).
 * Used for API configuration (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, etc.)
 */

const ALLOWED_KEYS = [
  "anthropic_auth_token",
  "anthropic_base_url",
  "dangerously_skip_permissions",
  "locale",
  "claude_cli_path",
  "claude_config_dir",
];

/** Expand leading `~` to the user's home directory. */
function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export async function GET() {
  try {
    const result: Record<string, string> = {};
    for (const key of ALLOWED_KEYS) {
      const value = getSetting(key);
      if (value !== undefined) {
        // Mask token for security (only return last 8 chars)
        if (key === "anthropic_auth_token" && value.length > 8) {
          result[key] = "***" + value.slice(-8);
        } else {
          result[key] = value;
        }
      }
    }
    return NextResponse.json({ settings: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read app settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "Invalid settings data" },
        { status: 400 },
      );
    }

    // Collect validation results for path-type settings
    const validation: Record<string, { valid: boolean; resolved?: string }> =
      {};

    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      const strValue = String(value ?? "").trim();
      if (strValue) {
        // Don't overwrite token if user sent the masked version back
        if (key === "anthropic_auth_token" && strValue.startsWith("***")) {
          continue;
        }
        setSetting(key, strValue);

        // Validate path-type settings after saving
        if (key === "claude_cli_path") {
          const resolved = expandTilde(strValue);
          let valid = false;
          try {
            const stat = fs.statSync(resolved);
            valid = stat.isFile();
          } catch {
            // file doesn't exist
          }
          validation[key] = { valid, resolved };
        } else if (key === "claude_config_dir") {
          const resolved = expandTilde(strValue);
          let valid = false;
          try {
            const stat = fs.statSync(resolved);
            valid = stat.isDirectory();
          } catch {
            // directory doesn't exist
          }
          validation[key] = { valid, resolved };
        }
      } else {
        // Empty value = remove the setting
        setSetting(key, "");
        // Clearing a path is always valid
        if (key === "claude_cli_path" || key === "claude_config_dir") {
          validation[key] = { valid: true };
        }
      }
    }

    return NextResponse.json({ success: true, validation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save app settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
