/**
 * Claude plan usage limits (5-hour / weekly), matching Claude Code's /usage.
 *
 * The ACP protocol only reports per-session context usage, so plan-level
 * limits are fetched directly from Anthropic's OAuth usage endpoint using
 * the credentials Claude Code CLI stores locally (~/.claude/.credentials.json).
 * The token is read locally and sent ONLY to api.anthropic.com.
 *
 * Fails soft: returns null when credentials are missing (e.g. API-key users)
 * or the endpoint is unavailable — callers simply hide the section.
 */

import { requestUrl } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface PlanLimit {
	kind: string;
	/** Display label, e.g. "5-hour limit", "Weekly · Fable" */
	label: string;
	/** Utilization percentage (0-100+) */
	percent: number;
	/** "normal" | "warning" | "critical" (from API) */
	severity: string;
	/** When this limit window resets */
	resetsAt: Date | null;
}

export interface PlanUsage {
	limits: PlanLimit[];
	fetchedAt: number;
}

interface RawLimit {
	kind?: unknown;
	percent?: unknown;
	severity?: unknown;
	resets_at?: unknown;
	scope?: {
		model?: { display_name?: unknown } | null;
	} | null;
}

const CACHE_MS = 60_000;
let cache: { value: PlanUsage | null; at: number } | null = null;

function limitLabel(raw: RawLimit): string {
	switch (raw.kind) {
		case "session":
			return "5-hour limit";
		case "weekly_all":
			return "Weekly · all models";
		case "weekly_scoped": {
			const model = raw.scope?.model?.display_name;
			return typeof model === "string" && model.length > 0
				? `Weekly · ${model}`
				: "Weekly · scoped";
		}
		default:
			return String(raw.kind ?? "Limit");
	}
}

function remember(value: PlanUsage | null): PlanUsage | null {
	cache = { value, at: Date.now() };
	return value;
}

/**
 * Fetch current plan usage limits. Cached for 60s.
 * Returns null when unavailable (no local Claude Code login, network error).
 */
export async function fetchPlanUsage(): Promise<PlanUsage | null> {
	if (cache && Date.now() - cache.at < CACHE_MS) {
		return cache.value;
	}

	try {
		const credPath = path.join(
			os.homedir(),
			".claude",
			".credentials.json",
		);
		if (!fs.existsSync(credPath)) return remember(null);

		const cred = JSON.parse(fs.readFileSync(credPath, "utf8")) as {
			claudeAiOauth?: { accessToken?: string };
		};
		const token = cred.claudeAiOauth?.accessToken;
		if (!token) return remember(null);

		const res = await requestUrl({
			url: "https://api.anthropic.com/api/oauth/usage",
			headers: {
				Authorization: `Bearer ${token}`,
				"anthropic-beta": "oauth-2025-04-20",
			},
		});

		const rawLimits = (res.json as { limits?: RawLimit[] }).limits;
		if (!Array.isArray(rawLimits)) return remember(null);

		const limits: PlanLimit[] = rawLimits.map((raw) => ({
			kind: String(raw.kind ?? ""),
			label: limitLabel(raw),
			percent: typeof raw.percent === "number" ? raw.percent : 0,
			severity:
				typeof raw.severity === "string" ? raw.severity : "normal",
			resetsAt:
				typeof raw.resets_at === "string"
					? new Date(raw.resets_at)
					: null,
		}));

		return remember({ limits, fetchedAt: Date.now() });
	} catch {
		return remember(null);
	}
}
