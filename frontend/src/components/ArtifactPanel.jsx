import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import Editor from "@monaco-editor/react";
import JSZip from "jszip";
import { FiCode } from "react-icons/fi";
import { detectLanguage } from "../utils/detectLanguage";
import {
  Code2, Eye, PanelRightClose, PanelRightOpen,
  X, Copy, Check, Download, ChevronRight, ChevronDown,
  File, Folder, Play, Square, RefreshCw, Terminal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_GATEWAY_URL || "";

const TYPE_META = {
  html:      { label: "HTML/CSS/JS", color: "#e34c26" },
  react:     { label: "React",       color: "#61dafb" },
  vue:       { label: "Vue",         color: "#42b883" },
  svelte:    { label: "Svelte",      color: "#ff3e00" },
  node:      { label: "Node.js",     color: "#8bc34a" },
  python:    { label: "Python",      color: "#3572A5" },
  go:        { label: "Go",          color: "#00acd7" },
  rust:      { label: "Rust",        color: "#dea584" },
  java:      { label: "Java",        color: "#b07219" },
  fullstack: { label: "Full-Stack",  color: "#8b5cf6" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normName = (n = "") => n.replace(/[*`_]/g, "").trim().toLowerCase();

function fileColor(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  return ({
    html:"#e34c26", css:"#264de4", js:"#f7df1e", jsx:"#61dafb",
    ts:"#3178c6", tsx:"#61dafb", py:"#3572A5", json:"#8bc34a",
    go:"#00acd7", rs:"#dea584", java:"#b07219", md:"#aaa",
    vue:"#42b883", svelte:"#ff3e00",
  })[ext] || "#9e9e9e";
}

function resolveHtmlFiles(files = []) {
  return {
    htmlFile: files.find(f =>
      normName(f.name) === "index.html" || normName(f.name).endsWith("/index.html")
    ),
    cssFile: files.find(f =>
      normName(f.name).endsWith("style.css") || normName(f.name).endsWith("styles.css") || normName(f.name).endsWith("index.css")
    ),
    jsFile: files.find(f =>
      ["script.js","main.js","app.js"].some(s => normName(f.name) === s || normName(f.name).endsWith("/"+s))
    ),
  };
}

function buildTree(files = []) {
  const root = {};
  files.forEach((f, idx) => {
    const parts = f.name.split("/");
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = { __file: true, idx, name: f.name };
      } else {
        if (!node[part] || node[part].__file) node[part] = {};
        node = node[part];
      }
    });
  });
  return root;
}

// ─── Browser-native preview builders ─────────────────────────────────────────

const GAME_BOOT = `<script>
(function(){
  var starters=['startGame','start','init','begin','play','initGame','runGame'];
  var flags=['gameStarted','started','running','isRunning','playing','isPlaying'];
  var KEYS=[{key:'ArrowRight',keyCode:39},{key:'ArrowLeft',keyCode:37},
            {key:'ArrowUp',keyCode:38},{key:'ArrowDown',keyCode:40},
            {key:' ',keyCode:32},{key:'Enter',keyCode:13}];
  function go(){
    try{document.body.focus();}catch(e){}
    var c=document.querySelector('canvas');
    if(c){c.setAttribute('tabindex','0');c.focus();}
    KEYS.forEach(function(k){
      var d=new KeyboardEvent('keydown',{key:k.key,keyCode:k.keyCode,bubbles:true});
      document.dispatchEvent(d); if(c) c.dispatchEvent(d);
    });
    flags.forEach(function(n){try{if(window[n]===false)window[n]=true;}catch(e){}});
    starters.forEach(function(fn){try{if(typeof window[fn]==='function')window[fn]();}catch(e){}});
  }
  [300,800,1500,2500].forEach(function(ms){
    document.readyState==='complete'?setTimeout(go,ms):window.addEventListener('load',function(){setTimeout(go,ms);});
  });
})();
<\/script>`;

function buildHtmlSrcdoc(htmlFile, cssFile, jsFile) {
  const isFullDoc = /<!DOCTYPE\s+html/i.test(htmlFile.content) || /<html[\s>]/i.test(htmlFile.content);
  if (isFullDoc) {
    let doc = htmlFile.content;
    if (cssFile?.content) {
      const tag = `<style>\n${cssFile.content}\n</style>`;
      doc = /<\/head>/i.test(doc) ? doc.replace(/(<\/head>)/i, `${tag}\n$1`) : tag + doc;
    }
    if (jsFile?.content) {
      const tag = `<script>\n${jsFile.content}\n<\/script>`;
      doc = /<\/body>/i.test(doc) ? doc.replace(/(<\/body>)/i, `${tag}\n$1`) : doc + tag;
    }
    return /<\/body>/i.test(doc) ? doc.replace(/(<\/body>)/i, `${GAME_BOOT}\n$1`) : doc + GAME_BOOT;
  }
  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>${cssFile?.content || ""}</style></head>
<body>${htmlFile.content}
<script>${jsFile?.content || ""}<\/script>${GAME_BOOT}</body></html>`;
}

function buildReactSrcdoc(files = []) {
  // Babel + React CDN — transpiles JSX in the browser
  const appFile   = files.find(f => normName(f.name).endsWith("app.jsx") || normName(f.name).endsWith("app.tsx") || normName(f.name) === "app.js");
  const cssFile   = files.find(f => normName(f.name).endsWith(".css"));
  const mainFile  = files.find(f => normName(f.name).includes("main") || normName(f.name).includes("index"));
  const codeFile  = appFile || mainFile || files.find(f => f.name.match(/\.(jsx|tsx|js|ts)$/));

  const allJsx = files
    .filter(f => f.name.match(/\.(jsx|tsx)$/) && f !== codeFile)
    .map(f => f.content)
    .join("\n\n");

  const code = [allJsx, codeFile?.content || ""].filter(Boolean).join("\n\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>React Preview</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<script src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.min.js"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; }
  body { background: #090d16; color: #e2e8f0; font-family: 'Inter', system-ui, sans-serif; }
  ${cssFile?.content || ""}
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
${code}

// Auto-mount: try to find App, default export, or any component
try {
  const RootComponent = typeof App !== 'undefined' ? App
    : typeof exports !== 'undefined' && exports.default ? exports.default
    : null;
  if (RootComponent) {
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(RootComponent));
  }
} catch(e) {
  document.getElementById('root').innerHTML =
    '<div style="color:#ff6b6b;padding:20px;font-family:monospace">Error: ' + e.message + '</div>';
}
<\/script>
</body>
</html>`;
}

function buildVueSrcdoc(files = []) {
  const vueFile = files.find(f => f.name.endsWith(".vue"));
  const cssFile = files.find(f => f.name.endsWith(".css"));

  // Extract script + template from .vue SFC
  const scriptMatch   = vueFile?.content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const templateMatch = vueFile?.content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const styleMatch    = vueFile?.content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<script src="https://unpkg.com/vue@3/dist/vue.global.js"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; }
  body { background: #090d16; color: #e2e8f0; font-family: system-ui, sans-serif; }
  ${styleMatch?.[1] || cssFile?.content || ""}
</style>
</head>
<body>
<div id="app">${templateMatch?.[1] || "<div>{{ message }}</div>"}</div>
<script>
const { createApp } = Vue;
try {
  ${scriptMatch?.[1]?.replace(/export default/, "const __component =") || "const __component = { data() { return { message: 'Vue Preview' }; } }"}
  createApp(__component).mount('#app');
} catch(e) {
  document.getElementById('app').innerHTML = '<div style="color:#ff6b6b;padding:20px;font-family:monospace">Error: ' + e.message + '</div>';
}
<\/script>
</body>
</html>`;
}

async function downloadZip(files, title) {
  try {
    const zip  = new JSZip();
    files.forEach(f => zip.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: "blob" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url,
      download: `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.zip`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("ZIP failed:", e);
  }
}

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({ name, node, onSelect, activeIdx, depth = 0 }) {
  const [open, setOpen] = useState(true);
  if (node.__file) {
    const active = node.idx === activeIdx;
    return (
      <button
        onClick={() => onSelect(node.idx)}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        className={`w-full flex items-center gap-1.5 py-[3px] pr-2 text-[11px] text-left cursor-pointer border-none bg-transparent rounded-sm transition-colors
          ${active ? "text-indigo-300 bg-indigo-500/10" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"}`}
      >
        <File size={10} style={{ color: fileColor(name), flexShrink: 0 }} />
        <span className="truncate">{name}</span>
      </button>
    );
  }
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        className="w-full flex items-center gap-1.5 py-[3px] pr-2 text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer border-none bg-transparent"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <Folder size={10} className="text-amber-400/70" />
        <span>{name}</span>
      </button>
      {open && Object.entries(node).map(([k, v]) => (
        <TreeNode key={k} name={k} node={v} onSelect={onSelect} activeIdx={activeIdx} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── Container preview launcher ───────────────────────────────────────────────

function ContainerPreview({ artifact, pType, onDownload }) {
  const [status,  setStatus]  = useState("idle");   // idle | building | running | error | stopped
  const [logs,    setLogs]    = useState("");
  const [session, setSession] = useState(null);
  const eventSourceRef = useRef(null);
  const logsRef = useRef(null);

  const meta = TYPE_META[pType] || TYPE_META.node;

  const RUN_HINT = {
    python:    "pip install -r requirements.txt && python app.py",
    node:      "npm install && npm start",
    react:     "npm install && npm run dev",
    go:        "go run .",
    rust:      "cargo run",
    java:      "mvn spring-boot:run",
    fullstack: "See README.md",
  };

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  const startPreview = useCallback(async () => {
    setStatus("building");
    setLogs("⚡ Starting preview container...\n");
    setSession(null);

    try {
      const res = await fetch(`${API_BASE}/api/preview/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ artifact }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to start preview");

      const newSession = data.session;
      setSession(newSession);
      setLogs(prev => prev + `📦 Container ${newSession.stack} starting...\n`);

      // Subscribe to SSE log stream
      const es = new EventSource(`${API_BASE}/api/preview/${newSession.id}/events`, { withCredentials: true });
      eventSourceRef.current = es;

      es.addEventListener("status", e => {
        const payload = JSON.parse(e.data);
        setStatus(payload.status === "running" ? "running" : payload.status === "error" ? "error" : "building");
        setSession(payload);
      });

      es.addEventListener("logs", e => {
        const { chunk } = JSON.parse(e.data);
        setLogs(prev => prev + chunk);
      });

      es.addEventListener("done", e => {
        const payload = JSON.parse(e.data);
        setStatus(payload.status === "running" ? "running" : "error");
        setSession(payload);
        es.close();
      });

      es.onerror = () => {
        setLogs(prev => prev + "\n⚠️  Connection to build stream lost.\n");
        es.close();
      };
    } catch (err) {
      setStatus("error");
      setLogs(prev => prev + `\n❌ ${err.message}\n`);
    }
  }, [artifact]);

  const stopPreview = useCallback(async () => {
    eventSourceRef.current?.close();
    if (session?.id) {
      await fetch(`${API_BASE}/api/preview/${session.id}`, { method: "DELETE", credentials: "include" });
    }
    setStatus("stopped");
    setSession(null);
    setLogs("");
  }, [session]);

  const isRunning = status === "running";
  const isLoading = status === "building";

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            isRunning ? "bg-green-400 animate-pulse" :
            isLoading ? "bg-amber-400 animate-pulse" :
            status === "error" ? "bg-red-400" : "bg-slate-600"
          }`} />
          <span className="text-[11px] text-slate-400 capitalize">{status === "idle" ? "Ready to launch" : status}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "idle" || status === "stopped" || status === "error" ? (
            <button onClick={startPreview} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-[11px] font-medium rounded-lg border-none cursor-pointer transition-colors">
              <Play size={11} /> Launch Preview
            </button>
          ) : (
            <button onClick={stopPreview} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-[11px] font-medium rounded-lg border-none cursor-pointer transition-colors">
              <Square size={11} /> Stop
            </button>
          )}
          {status === "error" && (
            <button onClick={startPreview} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-[11px] rounded-lg border-none cursor-pointer transition-colors">
              <RefreshCw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Running iframe */}
      {isRunning && session?.previewPath && (
        <div className="flex-1 overflow-hidden">
          <iframe
            src={`${API_BASE}${session.previewPath}`}
            className="w-full h-full"
            style={{ border: "none" }}
            title="container-preview"
          />
        </div>
      )}

      {/* Not running: info + logs */}
      {!isRunning && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Idle state */}
          {status === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center border"
                   style={{ background: `${meta.color}10`, borderColor: `${meta.color}25` }}>
                <FiCode style={{ color: meta.color }} size={22} />
              </div>
              <div>
                <p className="text-slate-200 font-medium text-sm mb-1">{meta.label} Project</p>
                <p className="text-slate-500 text-xs leading-relaxed max-w-[260px]">
                  Launch a live container preview, or download the ZIP to run locally:
                </p>
                <code className="block mt-2 text-[10px] text-emerald-400/80 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2 text-left">
                  {RUN_HINT[pType] || "See README.md"}
                </code>
              </div>
              <div className="flex gap-2">
                <button onClick={startPreview} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium border-none cursor-pointer transition-colors">
                  <Play size={13} /> Launch Preview
                </button>
                <button onClick={onDownload} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs font-medium border-none cursor-pointer transition-colors">
                  <Download size={13} /> Download ZIP
                </button>
              </div>
            </div>
          )}

          {/* Build logs */}
          {(isLoading || status === "error" || status === "stopped") && logs && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] shrink-0">
                <Terminal size={12} className="text-slate-500" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Build Logs</span>
              </div>
              <pre
                ref={logsRef}
                className="flex-1 overflow-y-auto p-4 text-[11px] text-slate-300 font-mono leading-relaxed"
                style={{ scrollbarWidth: "thin" }}
              >
                {logs}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Logs below iframe when running */}
      {isRunning && logs && (
        <div className="h-32 border-t border-white/[0.06] overflow-hidden">
          <pre
            ref={logsRef}
            className="h-full overflow-y-auto p-3 text-[10px] text-slate-400 font-mono leading-relaxed"
            style={{ scrollbarWidth: "thin" }}
          >
            {logs}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ArtifactPanel() {
  // ALL hooks unconditionally at top
  const [tab,        setTab]        = useState("code");
  const [activeFile, setActiveFile] = useState(0);
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied,     setCopied]     = useState(false);

  const { artifacts } = useSelector(s => s.message);
  const artifact = artifacts?.[0];

  const files    = useMemo(() => artifact?.files || [],   [artifact]);
  const tree     = useMemo(() => buildTree(files),        [files]);
  const resolved = useMemo(() => resolveHtmlFiles(files), [files]);

  // Determine which browser-native preview to use
  const pType       = artifact?.projectType || "html";
  const meta        = TYPE_META[pType] || TYPE_META.html;
  const hasHtml     = Boolean(resolved.htmlFile);
  const hasReactJsx = pType === "react" || files.some(f => f.name.match(/\.jsx$|\.tsx$/));
  const hasVue      = pType === "vue"   || files.some(f => f.name.endsWith(".vue"));

  const browserPreviewable = hasHtml || hasReactJsx || hasVue;
  const containerStacks    = ["python","node","go","rust","java","fullstack"];
  const needsContainer     = containerStacks.includes(pType) && !hasHtml;

  const srcdoc = useMemo(() => {
    if (!browserPreviewable) return "";
    if (hasHtml)     return buildHtmlSrcdoc(resolved.htmlFile, resolved.cssFile, resolved.jsFile);
    if (hasReactJsx) return buildReactSrcdoc(files);
    if (hasVue)      return buildVueSrcdoc(files);
    return "";
  }, [browserPreviewable, hasHtml, hasReactJsx, hasVue, resolved, files]);

  // Safe early return — all hooks already called
  if (!artifact) return null;

  const file    = files[activeFile];
  const hasTree = files.length > 1;

  const handleCopy = () => {
    navigator.clipboard.writeText(file?.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleDownload = () => downloadZip(files, artifact.title);

  // ── Shared panel markup ──────────────────────────────────────────────────
  const PanelInner = ({ onClose }) => (
    <div className="flex flex-col h-full bg-[#0d0f14]">

      {/* Header */}
      <div className="h-14 px-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <button
          onClick={onClose ?? (() => setCollapsed(true))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] bg-transparent border-none cursor-pointer shrink-0 transition-colors"
        >
          {onClose ? <X size={15} /> : <PanelRightClose size={15} />}
        </button>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <FiCode className="text-indigo-400" size={12} />
          </div>
          <h2 className="text-[13px] font-medium text-slate-200 truncate">{artifact.title}</h2>
          <span
            className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: meta.color, background: `${meta.color}15`, border: `1px solid ${meta.color}28` }}
          >
            {meta.label}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {tab === "code" && (
            <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg bg-transparent border-none cursor-pointer transition-colors">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button onClick={handleDownload} className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/[0.08] rounded-lg bg-transparent border-none cursor-pointer transition-colors">
            <Download size={12} /> ZIP
          </button>
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.06] p-1 rounded-lg">
            <button
              onClick={() => setTab("code")}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors
                ${tab === "code" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"}`}
            >
              <Code2 size={11} /> Code
            </button>
            <button
              onClick={() => setTab("preview")}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors
                ${tab === "preview" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"}`}
            >
              {needsContainer ? <Play size={11} /> : <Eye size={11} />}
              {needsContainer ? "Run" : "Preview"}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* File tree */}
        {tab === "code" && hasTree && (
          <div className="w-40 border-r border-white/[0.06] overflow-y-auto overflow-x-hidden shrink-0 py-2" style={{ scrollbarWidth: "none" }}>
            <p className="px-3 pb-1 text-[9px] font-semibold text-slate-600 uppercase tracking-widest">Files</p>
            {Object.entries(tree).map(([k, v]) => (
              <TreeNode key={k} name={k} node={v} onSelect={setActiveFile} activeIdx={activeFile} />
            ))}
          </div>
        )}

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">

            {/* Browser-native preview */}
            {tab === "preview" && browserPreviewable && (
              <motion.div key="browser-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 w-full h-full">
                <iframe
                  title="preview"
                  sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-pointer-lock"
                  srcDoc={srcdoc}
                  className="w-full h-full"
                  style={{ border: "none" }}
                  tabIndex={0}
                  onLoad={e => e.target.focus()}
                />
              </motion.div>
            )}

            {/* Container preview (Python / Go / Rust / Java / Node) */}
            {tab === "preview" && needsContainer && (
              <motion.div key="container-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 w-full h-full overflow-hidden">
                <ContainerPreview artifact={artifact} pType={pType} onDownload={handleDownload} />
              </motion.div>
            )}

            {/* Code editor */}
            {tab === "code" && (
              <motion.div key={`code-${activeFile}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 w-full h-full overflow-hidden">
                <Editor
                  theme="vs-dark"
                  language={detectLanguage(file?.name || "")}
                  value={file?.content || ""}
                  options={{
                    readOnly: true, minimap: { enabled: false }, fontSize: 13,
                    wordWrap: "on", automaticLayout: true, scrollBeyondLastLine: false,
                    padding: { top: 16 }, lineNumbers: "on", renderLineHighlight: "none",
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-24 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-medium shadow-lg shadow-indigo-500/20 border-none cursor-pointer"
      >
        <FiCode size={13} /> View Code
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <motion.div key="dr" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.25, ease: "easeInOut" }} className="lg:hidden fixed inset-y-0 right-0 z-50 w-[88vw] max-w-[420px] border-l border-white/[0.06] overflow-hidden">
              <PanelInner onClose={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div key="open" initial={{ width: 0, opacity: 0 }} animate={{ width: "clamp(380px, 44%, 760px)", opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} className="hidden lg:flex h-full border-l border-white/[0.06] flex-col overflow-hidden shrink-0">
            <PanelInner />
          </motion.div>
        ) : (
          <motion.div key="col" initial={{ width: 0, opacity: 0 }} animate={{ width: 48, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} className="hidden lg:flex h-full border-l border-white/[0.06] bg-[#0d0f14] flex-col items-center py-4 gap-3 shrink-0">
            <button onClick={() => setCollapsed(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] bg-transparent border-none cursor-pointer transition-colors">
              <PanelRightOpen size={15} />
            </button>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[10px] font-medium text-slate-600 tracking-widest uppercase whitespace-nowrap" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                {artifact.title}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}