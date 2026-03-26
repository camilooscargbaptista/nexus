/**
 * Nexus Dashboard — Live Preview
 *
 * Self-contained React app that renders the Nexus Dashboard
 * with realistic mock data. Uses Recharts for visualization.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import React, { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// MOCK DATA GENERATORS
// ═══════════════════════════════════════════════════════════════

function generateTrends(days = 30) {
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const prog = (days - i) / days;
    data.push({
      date: d.toISOString().split("T")[0],
      archScore: Math.min(100, Math.round(70 + prog * 20 + Math.random() * 5)),
      secScore: Math.min(100, Math.round(75 + prog * 15 + Math.random() * 5)),
      findings: Math.max(2, Math.floor(20 - prog * 15 + Math.random() * 5)),
      runs: Math.floor(3 + Math.random() * 4),
    });
  }
  return data;
}

function generateRuns(count = 15) {
  const statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "RUNNING", "FAILED", "COMPLETED", "COMPLETED"];
  const branches = ["main", "develop", "feature/auth", "feature/dashboard", "hotfix/security", "feature/cli"];
  const gates = ["PASSED", "PASSED", "WARNING", "FAILED", "PASSED"];
  return Array.from({ length: count }, (_, i) => {
    const status = statuses[i % statuses.length];
    const startedAt = new Date(Date.now() - Math.random() * 7 * 86400000);
    return {
      id: `run-${i + 1}`,
      status,
      branch: branches[i % branches.length],
      commitSha: Math.random().toString(16).slice(2, 10),
      archScore: status === "COMPLETED" ? Math.round(72 + Math.random() * 25) : null,
      secScore: status === "COMPLETED" ? Math.round(78 + Math.random() * 20) : null,
      gate: status === "COMPLETED" ? gates[i % gates.length] : null,
      findings: Math.floor(Math.random() * 15),
      critical: Math.floor(Math.random() * 3),
      duration: status === "COMPLETED" ? Math.round(30 + Math.random() * 60) : null,
      startedAt: startedAt.toISOString(),
      triggeredBy: ["Camilo", "CI Bot", "Schedule"][i % 3],
    };
  });
}

function generateFindings() {
  return [
    { id: "F-001", severity: "CRITICAL", layer: "Security", title: "Hardcoded API key in config.ts", file: "src/config.ts", line: 42, status: "OPEN" },
    { id: "F-002", severity: "HIGH", layer: "Architecture", title: "God Class: ProjectScanner exceeds 500 lines", file: "src/scanner.ts", line: 1, status: "OPEN" },
    { id: "F-003", severity: "HIGH", layer: "Architecture", title: "Circular dependency between analyzer and scorer", file: "src/analyzer.ts", line: 15, status: "IN_PROGRESS" },
    { id: "F-004", severity: "MEDIUM", layer: "Quality", title: "Test coverage below 70% threshold", file: "src/refactor-engine.ts", line: 0, status: "OPEN" },
    { id: "F-005", severity: "MEDIUM", layer: "Security", title: "Missing input validation on API endpoint", file: "src/routes.ts", line: 88, status: "OPEN" },
    { id: "F-006", severity: "LOW", layer: "Performance", title: "Synchronous file read in hot path", file: "src/scanner.ts", line: 156, status: "RESOLVED" },
    { id: "F-007", severity: "HIGH", layer: "Architecture", title: "Hub file: index.ts has 15+ connections", file: "src/index.ts", line: 1, status: "OPEN" },
    { id: "F-008", severity: "MEDIUM", layer: "Quality", title: "Missing error handling in async function", file: "src/diagram.ts", line: 34, status: "IN_PROGRESS" },
    { id: "F-009", severity: "LOW", layer: "Architecture", title: "Leaky abstraction: internal types exported", file: "src/types.ts", line: 22, status: "OPEN" },
    { id: "F-010", severity: "CRITICAL", layer: "Security", title: "SQL injection vector in query builder", file: "src/db.ts", line: 67, status: "OPEN" },
  ];
}

function generateFindingsByCategory() {
  return [
    { category: "Architecture", critical: 0, high: 3, medium: 1, low: 1 },
    { category: "Security", critical: 2, high: 0, medium: 1, low: 0 },
    { category: "Quality", critical: 0, high: 0, medium: 2, low: 0 },
    { category: "Performance", critical: 0, high: 0, medium: 0, low: 1 },
  ];
}

const teamMembers = [
  { name: "Camilo Girardelli", role: "CTO", runs: 45, avgScore: 88, avatar: "CG" },
  { name: "Ana Silva", role: "Tech Lead", runs: 32, avgScore: 91, avatar: "AS" },
  { name: "Pedro Santos", role: "Senior Dev", runs: 28, avgScore: 85, avatar: "PS" },
  { name: "Maria Costa", role: "DevOps", runs: 22, avgScore: 92, avatar: "MC" },
  { name: "Lucas Ferreira", role: "Security", runs: 18, avgScore: 94, avatar: "LF" },
];

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

const colors = {
  amber: "#f59e0b",
  amberLight: "#fbbf24",
  amberDark: "#d97706",
  green: "#10b981",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  slate: "#64748b",
  bg: "#0f172a",
  card: "#1e293b",
  cardHover: "#334155",
  border: "#334155",
  text: "#f8fafc",
  textMuted: "#94a3b8",
  textDim: "#64748b",
};

const Badge = ({ label, variant = "neutral", size = "md" }) => {
  const variants = {
    success: { bg: "rgba(16,185,129,0.15)", color: "#10b981", border: "rgba(16,185,129,0.3)" },
    danger: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", border: "rgba(239,68,68,0.3)" },
    warning: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "rgba(245,158,11,0.3)" },
    info: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "rgba(59,130,246,0.3)" },
    neutral: { bg: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "rgba(100,116,139,0.3)" },
  };
  const v = variants[variant] || variants.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: size === "sm" ? "2px 8px" : "4px 12px",
      borderRadius: "9999px", fontSize: size === "sm" ? "11px" : "12px", fontWeight: 600,
      background: v.bg, color: v.color, border: `1px solid ${v.border}`,
    }}>{label}</span>
  );
};

const StatCard = ({ title, value, subtitle, icon, trend, color: c }) => (
  <div style={{
    background: colors.card, borderRadius: "12px", padding: "20px",
    border: `1px solid ${colors.border}`, flex: 1, minWidth: "200px",
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: "13px", color: colors.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
        <div style={{ fontSize: "28px", fontWeight: 700, color: c || colors.text }}>{value}</div>
        {subtitle && <div style={{ fontSize: "12px", color: colors.textDim, marginTop: "4px" }}>{subtitle}</div>}
      </div>
      <div style={{ fontSize: "28px", opacity: 0.3 }}>{icon}</div>
    </div>
    {trend !== undefined && (
      <div style={{ marginTop: "8px", fontSize: "12px", color: trend >= 0 ? colors.green : colors.red }}>
        {trend >= 0 ? "+" : ""}{trend.toFixed(1)}% vs last period
      </div>
    )}
  </div>
);

const ScoreGauge = ({ score, label, size = 120 }) => {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.amber : colors.red;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.border} strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={scoreColor} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round" />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fill={colors.text} fontSize="24" fontWeight="700">{score}</text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill={colors.textMuted} fontSize="10">/100</text>
      </svg>
      <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "4px" }}>{label}</div>
    </div>
  );
};

// Simple bar chart
const SimpleBarChart = ({ data, title }) => {
  const maxVal = Math.max(...data.map(d => d.critical + d.high + d.medium + d.low));
  return (
    <div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: colors.text, marginBottom: "12px" }}>{title}</div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: colors.textMuted, marginBottom: "4px" }}>
            <span>{d.category}</span>
            <span>{d.critical + d.high + d.medium + d.low}</span>
          </div>
          <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", background: colors.border }}>
            {d.critical > 0 && <div style={{ width: `${(d.critical / maxVal) * 100}%`, background: colors.red }} />}
            {d.high > 0 && <div style={{ width: `${(d.high / maxVal) * 100}%`, background: "#f97316" }} />}
            {d.medium > 0 && <div style={{ width: `${(d.medium / maxVal) * 100}%`, background: colors.amber }} />}
            {d.low > 0 && <div style={{ width: `${(d.low / maxVal) * 100}%`, background: colors.blue }} />}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "10px" }}>
        <span style={{ color: colors.red }}>Critical</span>
        <span style={{ color: "#f97316" }}>High</span>
        <span style={{ color: colors.amber }}>Medium</span>
        <span style={{ color: colors.blue }}>Low</span>
      </div>
    </div>
  );
};

// Sparkline
const Sparkline = ({ data, color: c, width = 120, height = 32 }) => {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`
  ).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={c || colors.amber} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════
// PAGE COMPONENTS
// ═══════════════════════════════════════════════════════════════

const DashboardView = ({ trends, findingsByCategory, runs }) => {
  const latestScore = trends[trends.length - 1]?.archScore || 0;
  const latestSec = trends[trends.length - 1]?.secScore || 0;
  const totalFindings = findingsByCategory.reduce((s, c) => s + c.critical + c.high + c.medium + c.low, 0);
  const totalRuns = trends.reduce((s, t) => s + t.runs, 0);
  const passRate = runs.filter(r => r.gate === "PASSED").length / Math.max(1, runs.filter(r => r.status === "COMPLETED").length) * 100;

  return (
    <div>
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
        <StatCard title="Architecture Score" value={`${latestScore}%`} icon="&#9889;" color={colors.amber} trend={3.2} subtitle="Latest run" />
        <StatCard title="Security Score" value={`${latestSec}%`} icon="&#128737;" color={colors.green} trend={1.8} subtitle="Latest run" />
        <StatCard title="Total Findings" value={totalFindings} icon="&#128270;" color={colors.red} trend={-12.5} subtitle="Active findings" />
        <StatCard title="Pipeline Runs" value={totalRuns} icon="&#9881;" color={colors.blue} trend={8.0} subtitle="Last 30 days" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: colors.card, borderRadius: "12px", padding: "20px", border: `1px solid ${colors.border}`, display: "flex", justifyContent: "center", gap: "32px" }}>
          <ScoreGauge score={latestScore} label="Architecture" />
          <ScoreGauge score={latestSec} label="Security" />
          <ScoreGauge score={Math.round(passRate)} label="Pass Rate" />
        </div>
        <div style={{ background: colors.card, borderRadius: "12px", padding: "20px", border: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: colors.text, marginBottom: "12px" }}>Score Trend (30d)</div>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "11px", color: colors.amber, marginBottom: "4px" }}>Architecture</div>
              <Sparkline data={trends.map(t => t.archScore)} color={colors.amber} width={140} height={40} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: colors.green, marginBottom: "4px" }}>Security</div>
              <Sparkline data={trends.map(t => t.secScore)} color={colors.green} width={140} height={40} />
            </div>
          </div>
        </div>
        <div style={{ background: colors.card, borderRadius: "12px", padding: "20px", border: `1px solid ${colors.border}` }}>
          <SimpleBarChart data={findingsByCategory} title="Findings by Category" />
        </div>
      </div>

      <div style={{ background: colors.card, borderRadius: "12px", padding: "20px", border: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>Recent Pipeline Runs</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              {["Status", "Branch", "Arch", "Security", "Gate", "Findings", "Duration", "Triggered By"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 500, fontSize: "11px", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 8).map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${colors.border}22` }}>
                <td style={{ padding: "10px 12px" }}>
                  <Badge label={r.status} variant={r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "danger" : r.status === "RUNNING" ? "warning" : "neutral"} size="sm" />
                </td>
                <td style={{ padding: "10px 12px", color: colors.text, fontFamily: "monospace", fontSize: "12px" }}>{r.branch}</td>
                <td style={{ padding: "10px 12px", color: r.archScore ? (r.archScore >= 80 ? colors.green : colors.amber) : colors.textDim }}>{r.archScore ? `${r.archScore}%` : "-"}</td>
                <td style={{ padding: "10px 12px", color: r.secScore ? (r.secScore >= 80 ? colors.green : colors.amber) : colors.textDim }}>{r.secScore ? `${r.secScore}%` : "-"}</td>
                <td style={{ padding: "10px 12px" }}>{r.gate ? <Badge label={r.gate} variant={r.gate === "PASSED" ? "success" : r.gate === "FAILED" ? "danger" : "warning"} size="sm" /> : "-"}</td>
                <td style={{ padding: "10px 12px", color: r.critical > 0 ? colors.red : colors.textMuted }}>{r.findings}{r.critical > 0 ? ` (${r.critical} crit)` : ""}</td>
                <td style={{ padding: "10px 12px", color: colors.textMuted }}>{r.duration ? `${r.duration}s` : "-"}</td>
                <td style={{ padding: "10px 12px", color: colors.textMuted }}>{r.triggeredBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const FindingsView = ({ findings }) => {
  const [filter, setFilter] = useState("ALL");
  const filtered = filter === "ALL" ? findings : findings.filter(f => f.severity === filter);
  const severityBadge = (sev) => {
    const map = { CRITICAL: "danger", HIGH: "warning", MEDIUM: "info", LOW: "neutral" };
    return <Badge label={sev} variant={map[sev] || "neutral"} size="sm" />;
  };
  const statusBadge = (s) => {
    const map = { OPEN: "danger", IN_PROGRESS: "warning", RESOLVED: "success" };
    return <Badge label={s.replace("_", " ")} variant={map[s] || "neutral"} size="sm" />;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 600,
            background: filter === f ? colors.amber : colors.card, color: filter === f ? colors.bg : colors.textMuted,
          }}>{f} {f === "ALL" ? `(${findings.length})` : `(${findings.filter(ff => ff.severity === f).length})`}</button>
        ))}
      </div>
      <div style={{ background: colors.card, borderRadius: "12px", border: `1px solid ${colors.border}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              {["ID", "Severity", "Layer", "Title", "File", "Status"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: colors.textMuted, fontWeight: 500, fontSize: "11px", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((f, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${colors.border}22` }}>
                <td style={{ padding: "10px 12px", fontFamily: "monospace", color: colors.textDim, fontSize: "12px" }}>{f.id}</td>
                <td style={{ padding: "10px 12px" }}>{severityBadge(f.severity)}</td>
                <td style={{ padding: "10px 12px", color: colors.textMuted }}>{f.layer}</td>
                <td style={{ padding: "10px 12px", color: colors.text }}>{f.title}</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace", color: colors.blue, fontSize: "12px" }}>{f.file}:{f.line}</td>
                <td style={{ padding: "10px 12px" }}>{statusBadge(f.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PipelineView = ({ runs }) => (
  <div>
    <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
      <StatCard title="Total Runs" value={runs.length} icon="&#128736;" color={colors.blue} />
      <StatCard title="Pass Rate" value={`${Math.round(runs.filter(r => r.gate === "PASSED").length / Math.max(1, runs.filter(r => r.status === "COMPLETED").length) * 100)}%`} icon="&#9989;" color={colors.green} />
      <StatCard title="Avg Duration" value={`${Math.round(runs.filter(r => r.duration).reduce((s, r) => s + r.duration, 0) / Math.max(1, runs.filter(r => r.duration).length))}s`} icon="&#9201;" color={colors.amber} />
      <StatCard title="Failed" value={runs.filter(r => r.status === "FAILED").length} icon="&#10060;" color={colors.red} />
    </div>
    <div style={{ display: "grid", gap: "12px" }}>
      {runs.map((r, i) => (
        <div key={i} style={{
          background: colors.card, borderRadius: "12px", padding: "16px 20px",
          border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: "16px",
        }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.status === "COMPLETED" ? colors.green : r.status === "FAILED" ? colors.red : r.status === "RUNNING" ? colors.amber : colors.slate }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: colors.text, fontWeight: 600, fontSize: "14px" }}>{r.branch}</span>
              <Badge label={r.status} variant={r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "danger" : "warning"} size="sm" />
              {r.gate && <Badge label={r.gate} variant={r.gate === "PASSED" ? "success" : r.gate === "FAILED" ? "danger" : "warning"} size="sm" />}
            </div>
            <div style={{ fontSize: "12px", color: colors.textDim, marginTop: "4px" }}>
              {r.commitSha.slice(0, 7)} &middot; {r.triggeredBy} &middot; {new Date(r.startedAt).toLocaleString()}
            </div>
          </div>
          {r.archScore && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: r.archScore >= 80 ? colors.green : colors.amber }}>{r.archScore}%</div>
              <div style={{ fontSize: "10px", color: colors.textDim }}>Arch</div>
            </div>
          )}
          {r.secScore && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: r.secScore >= 80 ? colors.green : colors.amber }}>{r.secScore}%</div>
              <div style={{ fontSize: "10px", color: colors.textDim }}>Security</div>
            </div>
          )}
          {r.duration && <div style={{ fontSize: "13px", color: colors.textMuted, minWidth: "50px", textAlign: "right" }}>{r.duration}s</div>}
        </div>
      ))}
    </div>
  </div>
);

const TeamView = ({ members }) => (
  <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
      {members.map((m, i) => (
        <div key={i} style={{
          background: colors.card, borderRadius: "12px", padding: "20px",
          border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: "16px",
        }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(135deg, ${colors.amber}, ${colors.amberDark})`, color: colors.bg, fontWeight: 700, fontSize: "16px",
          }}>{m.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: colors.text, fontWeight: 600, fontSize: "15px" }}>{m.name}</div>
            <div style={{ color: colors.textDim, fontSize: "12px" }}>{m.role}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: m.avgScore >= 90 ? colors.green : colors.amber }}>{m.avgScore}%</div>
            <div style={{ fontSize: "11px", color: colors.textDim }}>{m.runs} runs</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

export default function NexusDashboard() {
  const [page, setPage] = useState("dashboard");
  const trends = useMemo(() => generateTrends(30), []);
  const runs = useMemo(() => generateRuns(15), []);
  const findings = useMemo(() => generateFindings(), []);
  const findingsByCategory = useMemo(() => generateFindingsByCategory(), []);

  const pages = {
    dashboard: { label: "Dashboard", icon: "&#9889;", component: <DashboardView trends={trends} findingsByCategory={findingsByCategory} runs={runs} /> },
    findings: { label: "Findings", icon: "&#128270;", component: <FindingsView findings={findings} /> },
    pipeline: { label: "Pipeline", icon: "&#128736;", component: <PipelineView runs={runs} /> },
    team: { label: "Team", icon: "&#128101;", component: <TeamView members={teamMembers} /> },
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: colors.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: "240px", background: "#0c1322", borderRight: `1px solid ${colors.border}`, padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px", marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `linear-gradient(135deg, ${colors.amber}, ${colors.amberDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>&#9889;</div>
            <div>
              <div style={{ color: colors.text, fontWeight: 700, fontSize: "18px" }}>NEXUS</div>
              <div style={{ color: colors.textDim, fontSize: "10px", letterSpacing: "0.1em" }}>ENGINEERING INTELLIGENCE</div>
            </div>
          </div>
        </div>
        <nav>
          {Object.entries(pages).map(([key, p]) => (
            <button key={key} onClick={() => setPage(key)} style={{
              display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "10px 20px",
              border: "none", cursor: "pointer", fontSize: "14px", textAlign: "left",
              background: page === key ? "rgba(245,158,11,0.1)" : "transparent",
              color: page === key ? colors.amber : colors.textMuted,
              borderLeft: page === key ? `3px solid ${colors.amber}` : "3px solid transparent",
            }}>
              <span dangerouslySetInnerHTML={{ __html: p.icon }} />
              {p.label}
            </button>
          ))}
        </nav>
        <div style={{ position: "absolute", bottom: "20px", left: "0", width: "240px", padding: "0 20px" }}>
          <div style={{ fontSize: "11px", color: colors.textDim, borderTop: `1px solid ${colors.border}`, paddingTop: "12px" }}>
            Girardelli Tecnologia<br />
            v0.2.0 &middot; 909 tests passing
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Header */}
        <div style={{ padding: "16px 32px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: colors.text }}>{pages[page].label}</h1>
            <div style={{ fontSize: "12px", color: colors.textDim, marginTop: "2px" }}>Project: architect &middot; Last scan: {new Date().toLocaleString()}</div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={{ padding: "8px 16px", borderRadius: "8px", border: `1px solid ${colors.border}`, background: colors.card, color: colors.textMuted, cursor: "pointer", fontSize: "13px" }}>Export</button>
            <button style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: `linear-gradient(135deg, ${colors.amber}, ${colors.amberDark})`, color: colors.bg, cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Run Analysis</button>
          </div>
        </div>

        {/* Page Content */}
        <div style={{ padding: "24px 32px" }}>
          {pages[page].component}
        </div>
      </div>
    </div>
  );
}
