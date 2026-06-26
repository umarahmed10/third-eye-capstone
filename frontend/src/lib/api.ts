// ─── Third-Eye API client + shared types ───────────────────────────
// Base URL follows the existing VITE_API_URL pattern (defaults to "/api"
// which the Vite dev server proxies to the FastAPI backend).

export const API = import.meta.env.VITE_API_URL || "/api";

// ─── Auth / session ───
export type User = { user_id: number; username: string; token: string };
export type Session = {
  id: number;
  title: string;
  created_at: string;
  msg_count?: number;
};
export type Message = {
  id: number;
  role: string;
  content: string;
  created_at: string;
};

// ─── Council result schema (mirrors POST /api/analyze/council) ───
export type Severity = "critical" | "high" | "medium" | "low";
export type DynamicStatus = "SUSPECTED" | "CONFIRMED-EXPLOITABLE";

export type CouncilVuln = {
  type: string;
  severity: Severity | string;
  confidence: number;
  description: string;
  evidence_quote: string;
  proposed_property: string;
  source: string;
  model: string;
  provider: string;
  dynamic_status: DynamicStatus | string;
};

export type CouncilDetail = {
  role: string;
  provider: string;
  model: string;
  found: boolean;
  confidence: number;
  severity: string;
  evidence_quote: string;
  property: string;
};

export type CouncilStats = {
  models_run: number;
  specialists_run: number;
  specialists_found: number;
  specialists_confirmed: number;
  tier: string;
  models_used: string[];
};

export type SimilarExploit = {
  category?: string;
  severity?: string;
  snippet?: string;
};

export type CouncilResult = {
  final_verdict: "GO" | "NO-GO";
  vulnerabilities: CouncilVuln[];
  summary: string;
  raven_note?: string;
  contract_name?: string;
  stats?: CouncilStats;
  council_detail?: CouncilDetail[];
  similar_exploits?: SimilarExploit[];
  mode?: string;
  // pipeline extras (optional)
  pipeline?: Record<string, unknown>;
  arbitration?: Record<string, unknown>;
  dynamic?: Record<string, unknown>;
};

// ─── Sample contracts (GET /api/samples) ───
export type SampleContract = {
  id: string;
  name: string;
  category: string;
  expected: "GO" | "NO-GO" | string;
  blurb: string;
  code: string;
};

// ─── SSE stream events ───
export type SpecialistMeta = { role: string; provider: string; model: string };

export type StreamStart = {
  event: "start";
  tier: string;
  specialists: SpecialistMeta[];
};
export type StreamSpecialistDone = {
  event: "specialist_done";
  role: string;
  model: string;
  provider: string;
  found: boolean;
  confidence: number;
  severity: string;
  evidence_quote: string;
  llm_error: boolean;
};
export type StreamFinal = { event: "final"; result: CouncilResult };
export type StreamEvent = StreamStart | StreamSpecialistDone | StreamFinal | { event: string; [k: string]: unknown };

// ─── Benchmark stats schema (GET /api/stats/benchmark) ───
export type Kpi = { label: string; value: string | number; sub?: string; delta?: number };
export type AblationConfig = {
  config: string;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
};
export type VulnDistEntry = { category: string; count: number; pct: number };
export type AblationSample = { n?: number; pos?: number; neg?: number; seed?: number };
export type Baseline = {
  tool: string;
  dataset: string;
  recall: number;
  f1: number | null;
  cost?: string;
  note?: string;
};
export type BenchmarkStats = {
  kpis?: Kpi[];
  ablation?: {
    available?: boolean;
    task?: string;
    sample?: AblationSample | number | string;
    configs?: AblationConfig[];
  };
  vuln_distribution?: {
    smartbugs_curated?: VulnDistEntry[];
    web3bugs?: VulnDistEntry[];
  };
  published_baselines?: Baseline[];
  thesis?: string;
};

// ─── Auth helpers ───
export async function authRequest(
  mode: "login" | "register",
  username: string,
  password: string
): Promise<User> {
  const r = await fetch(`${API}/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    let detail = `Error ${r.status}`;
    try {
      const d = await r.json();
      if (d.detail) detail = d.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await r.json()) as User;
}

export async function listSessions(userId: number): Promise<Session[]> {
  const r = await fetch(`${API}/sessions/${userId}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Session[];
}

export async function createSession(userId: number): Promise<Session> {
  const r = await fetch(`${API}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!r.ok) throw new Error(`Could not start session (HTTP ${r.status})`);
  return (await r.json()) as Session;
}

export async function getMessages(sessionId: number): Promise<Message[]> {
  const r = await fetch(`${API}/sessions/${sessionId}/messages`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Message[];
}

export async function getBenchmarkStats(): Promise<BenchmarkStats> {
  const r = await fetch(`${API}/stats/benchmark`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as BenchmarkStats;
}

// ─── Sample contracts for the "try it" demo flow (GET /api/samples) ───
export async function getSamples(): Promise<SampleContract[]> {
  const r = await fetch(`${API}/samples`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return (Array.isArray(d) ? d : []) as SampleContract[];
}

async function errDetail(r: Response): Promise<string> {
  try {
    const d = await r.json();
    if (d.detail) return typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
  } catch {
    /* ignore */
  }
  return `HTTP ${r.status}`;
}

// ─── SSE: stream the council (POST /api/analyze/council/stream) ───
// Consumed via fetch + ReadableStream (not EventSource since it's a POST).
export async function streamCouncil(
  code: string,
  onEvent: (ev: StreamEvent) => void,
  opts: { sessionId?: number | null; signal?: AbortSignal } = {}
): Promise<void> {
  // AnalyzeReq has session_id + user_id OPTIONAL. We send { code } always and
  // attach session_id ONLY when the user actually has one — anonymous/trial
  // scans (no login, no session) work with just { code }. We never send user_id.
  const payload: { code: string; session_id?: number } = { code };
  if (opts.sessionId != null) payload.session_id = opts.sessionId;

  const r = await fetch(`${API}/analyze/council/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
  if (!r.ok || !r.body) throw new Error(await errDetail(r));

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim());
      if (!dataLines.length) continue;
      const json = dataLines.join("\n");
      try {
        onEvent(JSON.parse(json) as StreamEvent);
      } catch {
        /* skip malformed frame */
      }
    }
  }
  // Flush any trailing frame without a terminating blank line.
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    try {
      onEvent(JSON.parse(tail.slice(5).trim()) as StreamEvent);
    } catch {
      /* ignore */
    }
  }
}
