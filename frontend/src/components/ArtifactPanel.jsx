import { useState, useMemo } from "react";
import { useSelector }       from "react-redux";
import Editor                from "@monaco-editor/react";
import { FiCode }            from "react-icons/fi";
import { detectLanguage }    from "../utils/detectLanguage";
import {
  Code2, Eye, PanelRightClose, PanelRightOpen,
  X, Copy, Check, Download, ChevronRight, ChevronDown,
  FileCode, FileText, FolderOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normName = (n = "") => n.replace(/[*`_]/g, "").trim().toLowerCase();

/** Determine if the project has a previewable HTML entry point */
function resolvePreview(files) {
  const htmlFile = files.find(f => normName(f.name) === "index.html" || normName(f.name).endsWith("/index.html"));
  const cssFile  = files.find(f => normName(f.name).endsWith("style.css") || normName(f.name).endsWith("styles.css"));
  const jsFile   = files.find(f => normName(f.name) === "script.js" || normName(f.name).endsWith("/script.js")
                               || normName(f.name).endsWith("/main.js") || normName(f.name).endsWith("/app.js"));
  return { htmlFile, cssFile, jsFile };
}

/** Build a tree structure from flat file list */
function buildTree(files) {
  const root = {};
  files.forEach((f, idx) => {
    const parts = f.name.split("/");
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = { __file: true, idx, name: f.name };
      } else {
        node[part] = node[part] || {};
      }
      node = node[part];
    });
  });
  return root;
}

/** Get a file icon color based on extension */
function fileColor(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  const map = {
    html: "#e34c26", css: "#264de4", js: "#f7df1e", jsx: "#61dafb",
    ts: "#3178c6", tsx: "#61dafb", py: "#3572A5", json: "#8bc34a",
    md: "#9e9e9e", env: "#e91e63", sh: "#4caf50", go: "#00acd7",
    rs: "#dea584", java: "#b07219", kt: "#7f52ff", rb: "#cc342d",
  };
  return map[ext] || "#9e9e9e";
}

/** Build the srcdoc for the iframe preview */
function buildPreviewDoc(htmlFile, cssFile, jsFile) {
  const gameBootstrap = `<script>
(function() {
  var stateNames = ['gameStarted','started','isStarted','running','isRunning','gameRunning','playing','isPlaying','active','gameActive','paused'];
  var startFns   = ['startGame','start','init','begin','play','initGame','runGame','gameStart'];
  var ALL_KEYS   = [
    { key:'ArrowRight',code:'ArrowRight',keyCode:39 },{ key:'ArrowLeft',code:'ArrowLeft',keyCode:37 },
    { key:'ArrowUp',code:'ArrowUp',keyCode:38 },{ key:'ArrowDown',code:'ArrowDown',keyCode:40 },
    { key:' ',code:'Space',keyCode:32 },{ key:'Enter',code:'Enter',keyCode:13 },
  ];
  function fireEvents() {
    try { document.body.focus(); } catch(e) {}
    var canvas = document.querySelector('canvas');
    if (canvas) { canvas.setAttribute('tabindex','0'); canvas.focus(); canvas.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
    ALL_KEYS.forEach(function(k) {
      var opts = { key:k.key,code:k.code,keyCode:k.keyCode,which:k.keyCode,bubbles:true,cancelable:true };
      var down = new KeyboardEvent('keydown',opts); var up = new KeyboardEvent('keyup',opts);
      document.dispatchEvent(down); document.dispatchEvent(up);
      if (canvas) { canvas.dispatchEvent(down); canvas.dispatchEvent(up); }
    });
    stateNames.forEach(function(n) { try { if (window[n]===false) window[n]=true; } catch(e) {} });
    startFns.forEach(function(fn) { try { if (typeof window[fn]==='function') window[fn](); } catch(e) {} });
  }
  [300,700,1200,2000].forEach(function(ms) {
    document.readyState==='complete' ? setTimeout(fireEvents,ms) : window.addEventListener('load',function(){setTimeout(fireEvents,ms);});
  });
})();
<\/script>`;

  const isFullDoc = /<!DOCTYPE\s+html/i.test(htmlFile.content) || /<html[\s>]/i.test(htmlFile.content);

  if (isFullDoc) {
    let doc = htmlFile.content;
    if (cssFile?.content) {
      const tag = `<style>\n${cssFile.content}\n</style>`;
      doc = /(<\/head>)/i.test(doc) ? doc.replace(/(<\/head>)/i, `${tag}\n$1`) : doc.replace(/(<body)/i, `${tag}\n$1`);
    }
    if (jsFile?.content) {
      const tag = `<script>\n${jsFile.content}\n<\/script>`;
      doc = /(<\/body>)/i.test(doc) ? doc.replace(/(<\/body>)/i, `${tag}\n$1`) : doc + tag;
    }
    return /(<\/body>)/i.test(doc) ? doc.replace(/(<\/body>)/i, `${gameBootstrap}\n$1`) : doc + gameBootstrap;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>${cssFile?.content || ""}</style>
</head>
<body>
${htmlFile.content}
<script>${jsFile?.content || ""}<\/script>
${gameBootstrap}
</body>
</html>`;
}

/** Client-side ZIP download using JSZip (loaded dynamically) */
async function downloadZip(files, title) {
  try {
    // Dynamically load JSZip from CDN if not already available
    if (!window.JSZip) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const zip  = new window.JSZip();
    files.forEach(f => zip.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: "blob" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("ZIP download failed:", err);
  }
}

// ─── File Tree Node ────────────────────────────────────────────────────────

function TreeNode({ name, node, onSelect, activeIdx, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const isFile = Boolean(node.__file);

  if (isFile) {
    const active = node.idx === activeIdx;
    return (
      <button
        onClick={() => onSelect(node.idx)}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        className={`w-full flex items-center gap-1.5 py-[3px] pr-3 text-[11px] text-left cursor-pointer border-none bg-transparent transition-colors duration-100 rounded-sm
          ${active ? "text-indigo-300 bg-indigo-500/10" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"}`}
      >
        <span style={{ color: fileColor(name), flexShrink: 0 }}>
          <FileCode size={11} />
        </span>
        <span className="truncate">{name}</span>
      </button>
    );
  }

  const children = Object.entries(node).filter(([k]) => k !== "__file");

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        className="w-full flex items-center gap-1.5 py-[3px] pr-3 text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer border-none bg-transparent transition-colors duration-100"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <FolderOpen size={11} className="text-amber-400/70" />
        <span>{name}</span>
      </button>
      {open && children.map(([k, v]) => (
        <TreeNode key={k} name={k} node={v} onSelect={onSelect} activeIdx={activeIdx} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── Project Type Badge ───────────────────────────────────────────────────────

const TYPE_LABELS = {
  html:      { label: "HTML/CSS/JS",  color: "#e34c26" },
  react:     { label: "React",        color: "#61dafb" },
  node:      { label: "Node.js",      color: "#8bc34a" },
  python:    { label: "Python",       color: "#3572A5" },
  fullstack: { label: "Full-Stack",   color: "#8b5cf6" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ArtifactPanel() {
  const [tab,        setTab]        = useState("code");
  const [activeFile, setActiveFile] = useState(0);
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [showTree,   setShowTree]   = useState(true);

  const { artifacts } = useSelector(state => state.message);
  const artifact = artifacts?.[0];

  if (!artifact) return null;

  const files      = artifact.files || [];
  const file       = files[activeFile];
  const tree       = useMemo(() => buildTree(files), [files]);
  const { htmlFile, cssFile, jsFile } = useMemo(() => resolvePreview(files), [files]);
  const canPreview = Boolean(htmlFile);
  const projectType = artifact.projectType || (canPreview ? "html" : "node");
  const typeInfo   = TYPE_LABELS[projectType] || TYPE_LABELS.html;

  // Build preview document (memoised to avoid rebuilding on every render)
  const previewDoc = useMemo(
    () => canPreview ? buildPreviewDoc(htmlFile, cssFile, jsFile) : "",
    [htmlFile, cssFile, jsFile, canPreview]
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(file?.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => downloadZip(files, artifact.title);

  // ── Panel content ──────────────────────────────────────────────────────────
  const PanelContent = ({ onClose }) => (
    <div className="flex flex-col h-full bg-[#0d0f14]">

      {/* Header */}
      <div className="h-14 px-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <button
          onClick={onClose ?? (() => setCollapsed(true))}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-colors duration-150 bg-transparent border-none cursor-pointer shrink-0"
        >
          {onClose ? <X size={15} /> : <PanelRightClose size={15} />}
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 shrink-0">
            <FiCode className="text-indigo-400" size={12} />
          </div>
          <h2 className="text-[13px] font-medium text-slate-200 truncate">{artifact.title}</h2>
          {/* Project type badge */}
          <span
            className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: typeInfo.color, background: `${typeInfo.color}18`, border: `1px solid ${typeInfo.color}30` }}
          >
            {typeInfo.label}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Copy */}
          {tab === "code" && (
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg transition-colors duration-150 bg-transparent border-none cursor-pointer">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}

          {/* Download ZIP */}
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/[0.08] rounded-lg transition-colors duration-150 bg-transparent border-none cursor-pointer" title="Download as ZIP">
            <Download size={12} />
            ZIP
          </button>

          {/* Code / Preview toggle */}
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] p-1 rounded-lg">
            <button
              onClick={() => setTab("code")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors duration-150
                ${tab === "code" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"}`}
            >
              <Code2 size={11} /> Code
            </button>
            {canPreview && (
              <button
                onClick={() => setTab("preview")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors duration-150
                  ${tab === "preview" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"}`}
              >
                <Eye size={11} /> Preview
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body: file tree + editor */}
      <div className="flex flex-1 overflow-hidden">

        {/* File tree sidebar */}
        <AnimatePresence initial={false}>
          {tab === "code" && showTree && files.length > 1 && (
            <motion.div
              key="tree"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 160, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="border-r border-white/[0.06] overflow-y-auto overflow-x-hidden shrink-0 py-2"
              style={{ scrollbarWidth: "none" }}
            >
              <p className="px-3 pb-1 text-[9px] font-semibold text-slate-600 uppercase tracking-widest">Files</p>
              {Object.entries(tree).map(([k, v]) => (
                <TreeNode key={k} name={k} node={v} onSelect={setActiveFile} activeIdx={activeFile} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Editor / Preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {tab === "preview" && canPreview ? (
              <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="w-full h-full">
                <iframe
                  title="preview"
                  sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-pointer-lock"
                  srcDoc={previewDoc}
                  className="w-full h-full"
                  style={{ background: "transparent", border: "none" }}
                  tabIndex={0}
                  onLoad={e => e.target.focus()}
                />
              </motion.div>
            ) : tab === "preview" && !canPreview ? (
              <motion.div key="no-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <FileCode size={24} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-slate-200 font-medium text-sm mb-1">Live preview not available</p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    {projectType === "python" && "Python projects need a local server to run. Download the ZIP and run locally."}
                    {projectType === "node"   && "Node.js projects need a runtime. Download the ZIP and run with `npm install && npm start`."}
                    {projectType === "react"  && "React projects need to be built. Download the ZIP and run with `npm install && npm run dev`."}
                    {projectType === "fullstack" && "Full-stack projects need a server. Download the ZIP and follow the README."}
                    {!["python","node","react","fullstack"].includes(projectType) && "Download the ZIP to run this project locally."}
                  </p>
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors duration-150 border-none cursor-pointer"
                >
                  <Download size={13} /> Download ZIP
                </button>
              </motion.div>
            ) : (
              <motion.div key={`code-${activeFile}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="w-full h-full">
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
      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-24 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-medium shadow-lg shadow-indigo-500/20 border-none cursor-pointer transition-colors duration-150"
      >
        <FiCode size={13} /> View Code
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div key="mob-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setMobileOpen(false)} className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <motion.div key="mob-drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.25, ease: "easeInOut" }} className="lg:hidden fixed inset-y-0 right-0 z-50 w-[88vw] max-w-[420px] border-l border-white/[0.06] overflow-hidden">
              <PanelContent onClose={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop panel */}
      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div key="open" initial={{ width: 0, opacity: 0 }} animate={{ width: "clamp(360px, 42%, 720px)", opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} className="hidden lg:flex h-full border-l border-white/[0.06] flex-col overflow-hidden shrink-0">
            <PanelContent />
          </motion.div>
        ) : (
          <motion.div key="collapsed" initial={{ width: 0, opacity: 0 }} animate={{ width: 48, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} className="hidden lg:flex h-full border-l border-white/[0.06] bg-[#0d0f14] flex-col items-center py-4 gap-3 shrink-0">
            <button onClick={() => setCollapsed(false)} className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-colors duration-150 bg-transparent border-none cursor-pointer">
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