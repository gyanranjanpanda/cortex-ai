import { useState, useMemo } from "react";
import { useSelector }       from "react-redux";
import Editor                from "@monaco-editor/react";
import JSZip                 from "jszip";
import { FiCode }            from "react-icons/fi";
import { detectLanguage }    from "../utils/detectLanguage";
import {
  Code2, Eye, PanelRightClose, PanelRightOpen,
  X, Copy, Check, Download, ChevronRight, ChevronDown,
  File, Folder,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Pure helpers (no hooks) ──────────────────────────────────────────────────

const normName = (n = "") => n.replace(/[*`_]/g, "").trim().toLowerCase();

function fileColor(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  const map = {
    html:"#e34c26", css:"#264de4", js:"#f7df1e", jsx:"#61dafb",
    ts:"#3178c6",  tsx:"#61dafb", py:"#3572A5", json:"#8bc34a",
    md:"#aaa",     go:"#00acd7",  rs:"#dea584", java:"#b07219",
  };
  return map[ext] || "#9e9e9e";
}

function resolveHtmlFiles(files = []) {
  const htmlFile = files.find(f =>
    normName(f.name) === "index.html" ||
    normName(f.name).endsWith("/index.html")
  );
  const cssFile = files.find(f =>
    normName(f.name).endsWith("style.css") ||
    normName(f.name).endsWith("styles.css")
  );
  const jsFile = files.find(f =>
    normName(f.name) === "script.js" ||
    normName(f.name).endsWith("/script.js") ||
    normName(f.name).endsWith("/main.js") ||
    normName(f.name).endsWith("/app.js")
  );
  return { htmlFile, cssFile, jsFile };
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

function buildSrcDoc(htmlFile, cssFile, jsFile) {
  const boot = `<script>
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

  const isFullDoc = /<!DOCTYPE\s+html/i.test(htmlFile.content) || /<html[\s>]/i.test(htmlFile.content);

  if (isFullDoc) {
    let doc = htmlFile.content;
    if (cssFile?.content) {
      const tag = `<style>\n${cssFile.content}\n</style>`;
      doc = doc.replace(/(<\/head>)/i, `${tag}\n$1`) || doc.replace(/(<body)/i, `${tag}\n$1`) || tag + doc;
    }
    if (jsFile?.content) {
      const tag = `<script>\n${jsFile.content}\n<\/script>`;
      doc = /<\/body>/i.test(doc) ? doc.replace(/(<\/body>)/i, `${tag}\n$1`) : doc + tag;
    }
    return /<\/body>/i.test(doc) ? doc.replace(/(<\/body>)/i, `${boot}\n$1`) : doc + boot;
  }

  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>${cssFile?.content || ""}</style></head>
<body>${htmlFile.content}
<script>${jsFile?.content || ""}<\/script>${boot}</body></html>`;
}

async function downloadZip(files, title) {
  try {
    const zip = new JSZip();
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
    alert("Download failed: " + e.message);
  }
}

const TYPE_META = {
  html:      { label: "HTML/CSS/JS",  color: "#e34c26" },
  react:     { label: "React",        color: "#61dafb" },
  node:      { label: "Node.js",      color: "#8bc34a" },
  python:    { label: "Python",       color: "#3572A5" },
  fullstack: { label: "Full-Stack",   color: "#8b5cf6" },
};

const RUN_HINT = {
  python:    "Download the ZIP and run: pip install -r requirements.txt && python app.py",
  node:      "Download the ZIP and run: npm install && npm start",
  react:     "Download the ZIP and run: npm install && npm run dev",
  fullstack: "Download the ZIP and follow the README for setup instructions.",
};

// ─── Tree node component ──────────────────────────────────────────────────────

function TreeNode({ name, node, onSelect, activeIdx, depth = 0 }) {
  const [open, setOpen] = useState(true);

  if (node.__file) {
    const active = node.idx === activeIdx;
    return (
      <button
        onClick={() => onSelect(node.idx)}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        className={`w-full flex items-center gap-1.5 py-[3px] pr-2 text-[11px] text-left cursor-pointer border-none bg-transparent transition-colors duration-100 rounded-sm
          ${active ? "text-indigo-300 bg-indigo-500/10" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"}`}
      >
        <File size={10} style={{ color: fileColor(name), flexShrink: 0 }} />
        <span className="truncate">{name}</span>
      </button>
    );
  }

  const children = Object.entries(node);
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
      {open && children.map(([k, v]) => (
        <TreeNode key={k} name={k} node={v} onSelect={onSelect} activeIdx={activeIdx} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ArtifactPanel() {
  // ── ALL hooks MUST be called unconditionally before any return ────────────
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
  const srcDoc   = useMemo(
    () => resolved.htmlFile ? buildSrcDoc(resolved.htmlFile, resolved.cssFile, resolved.jsFile) : "",
    [resolved]
  );

  // ── Now it is safe to conditionally render ────────────────────────────────
  if (!artifact) return null;

  const file       = files[activeFile];
  const canPreview = Boolean(resolved.htmlFile);
  const pType      = artifact.projectType || (canPreview ? "html" : "node");
  const meta       = TYPE_META[pType] || TYPE_META.html;
  const hasTree    = files.length > 1;

  const handleCopy     = () => {
    navigator.clipboard.writeText(file?.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleDownload = () => downloadZip(files, artifact.title);

  // ── Shared panel markup ───────────────────────────────────────────────────
  const PanelInner = ({ onClose }) => (
    <div className="flex flex-col h-full bg-[#0d0f14]">

      {/* Header */}
      <div className="h-14 px-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <button
          onClick={onClose ?? (() => setCollapsed(true))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-colors bg-transparent border-none cursor-pointer shrink-0"
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
            <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg transition-colors bg-transparent border-none cursor-pointer">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button onClick={handleDownload} className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/[0.08] rounded-lg transition-colors bg-transparent border-none cursor-pointer">
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
              <Eye size={11} /> Preview
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

        {/* Code tabs (flat, shown when no tree or single file) */}
        {tab === "code" && !hasTree && (
          <div className="absolute" /> /* nothing, single file shows directly */
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Flat file tabs (only when tree is hidden) */}
          {tab === "code" && !hasTree && (
            <div className="flex border-b border-white/[0.06] overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
              {files.map((f, i) => (
                <button
                  key={f.name}
                  onClick={() => setActiveFile(i)}
                  className={`px-4 py-2.5 text-[11px] font-medium whitespace-nowrap border-r border-white/[0.05] relative cursor-pointer bg-transparent transition-colors
                    ${activeFile === i ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {f.name}
                  {activeFile === i && (
                    <motion.div layoutId="filetab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {tab === "preview" && canPreview ? (
              <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 w-full h-full">
                <iframe
                  title="preview"
                  sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-pointer-lock"
                  srcDoc={srcDoc}
                  className="w-full h-full"
                  style={{ border: "none" }}
                  tabIndex={0}
                  onLoad={e => e.target.focus()}
                />
              </motion.div>
            ) : tab === "preview" && !canPreview ? (
              <motion.div key="no-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <FiCode className="text-indigo-400" size={24} />
                </div>
                <div>
                  <p className="text-slate-200 font-medium text-sm mb-2">Live preview not available</p>
                  <p className="text-slate-500 text-xs leading-relaxed max-w-xs">
                    {RUN_HINT[pType] || "Download the ZIP to run this project locally."}
                  </p>
                </div>
                <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors border-none cursor-pointer">
                  <Download size={13} /> Download ZIP
                </button>
              </motion.div>
            ) : (
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
      {/* Mobile button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-24 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-medium shadow-lg shadow-indigo-500/20 border-none cursor-pointer"
      >
        <FiCode size={13} /> View Code
      </button>

      {/* Mobile drawer */}
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

      {/* Desktop panel */}
      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div key="open" initial={{ width: 0, opacity: 0 }} animate={{ width: "clamp(360px, 42%, 720px)", opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} className="hidden lg:flex h-full border-l border-white/[0.06] flex-col overflow-hidden shrink-0">
            <PanelInner />
          </motion.div>
        ) : (
          <motion.div key="col" initial={{ width: 0, opacity: 0 }} animate={{ width: 48, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} className="hidden lg:flex h-full border-l border-white/[0.06] bg-[#0d0f14] flex-col items-center py-4 gap-3 shrink-0">
            <button onClick={() => setCollapsed(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-colors bg-transparent border-none cursor-pointer">
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