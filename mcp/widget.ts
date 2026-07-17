import { WIDGET_BUNDLE } from "@/mcp/widget-bundle";

export const WIDGET_URI = "ui://needly/recruitment-brief.html";

export function recruitmentWidgetHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{color-scheme:light dark;--bg:var(--color-background-primary,#fffefa);--card:var(--color-background-secondary,#f4f3ee);--text:var(--color-text-primary,#17221d);--muted:var(--color-text-secondary,#68726c);--line:var(--color-border-secondary,#dddcd4);--accent:#0e5c49;--lime:#c7f36b}
    *{box-sizing:border-box}body{margin:0;padding:18px;background:var(--bg);color:var(--text);font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif)}main{max-width:760px;margin:auto;border:1px solid var(--line);border-radius:16px;padding:22px;background:var(--bg);box-shadow:0 18px 50px rgba(20,35,28,.08)}
    .hero-line{display:flex;align-items:center;justify-content:space-between}.badge{display:inline-flex;padding:5px 7px;border-radius:5px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-size:9px;font-weight:850;letter-spacing:.08em}.badge.warning{background:#fff1db;color:#995b17}.score{font:500 28px Georgia,serif}
    h1{margin:14px 0 6px;font:500 clamp(26px,5vw,40px)/1.05 Georgia,serif;letter-spacing:-.03em}h2{margin:8px 0;font:500 22px/1.25 Georgia,serif}.sub,.next p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}.meter{height:7px;margin:16px 0;border-radius:9px;background:var(--line);overflow:hidden}.meter i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,var(--accent),var(--lime))}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.grid article,.list article{min-width:0;border:1px solid var(--line);border-radius:9px;padding:11px;background:var(--card)}article span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.06em}article strong{display:block;margin:5px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}article small{display:block;color:var(--muted);font-size:8px}
    .next{margin-top:14px;border-left:3px solid var(--lime);padding:13px 15px;background:var(--card);border-radius:0 9px 9px 0}.next>span{color:var(--accent);font-size:8px;font-weight:850;letter-spacing:.08em}.list{display:grid;gap:8px;margin-top:16px}.reach{display:flex;align-items:baseline;margin-top:14px}.reach strong{font:500 52px Georgia,serif}.reach span{color:var(--muted);font-size:13px}pre{max-height:260px;overflow:auto;white-space:pre-wrap;color:var(--muted);font:10px/1.6 ui-monospace,monospace}
    .knowledge-section{margin-top:18px}.knowledge-section h2{font-size:18px}.corpus-grid,.salary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.corpus-grid article,.salary-grid article{min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--card)}.suggestion-list{margin-top:10px}.suggestion-list article strong{white-space:normal;line-height:1.35}.suggestion-list article p{margin:8px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.salary-card{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.salary-card .score{font-size:15px}.salary-grid article{background:var(--bg)}.salary-grid article strong{font-size:13px}.caution{margin:10px 0;color:#995b17;font-size:10px;line-height:1.45}.warning-panel p+p{margin-top:6px}
    @media(max-width:520px){body{padding:8px}main{padding:16px}.grid,.corpus-grid{grid-template-columns:1fr}.salary-grid{grid-template-columns:repeat(3,1fr)}}
  </style>
</head>
<body>
  <main id="root"><span class="badge">NEEDLY · MCP APP</span><h1>Recruitment intelligence is ready.</h1><p class="sub">Run a Needly tool to see evidence-backed facts, ESCO matches, or a transparent scenario.</p></main>
  <script>${WIDGET_BUNDLE}</script>
</body>
</html>`;
}
