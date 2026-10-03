/**
 * Lightweight GeoViz result card for ChatGPT (MCP Apps UI resource).
 *
 * Static inline HTML/CSS/JS — no external scripts, styles, fonts, or network
 * calls (CSP allowlists stay empty). Receives the tool result over the MCP
 * Apps postMessage bridge and renders it with `textContent` only: the result
 * is treated as untrusted input. Colors mirror the tokens in
 * tailwind.config.ts (ink-950 surface, accent #ff7a18, severity tones).
 */
export const CARD_URI = "ui://geoviz/visibility-card-v1.html";
export const CARD_MIME_TYPE = "text/html;profile=mcp-app";

export const CARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#05070d;--panel:#0a0d16;--line:#232a3d;--text:#e8ebf2;--muted:#8b93a7;--accent:#ff7a18;--ok:#6ce39a;--warn:#ff9a3c;--bad:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.card{padding:16px 18px}.top{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.name{font-size:16px;font-weight:600;margin-top:2px}.site{color:var(--muted);font-size:12px;word-break:break-all}
.score{font:600 34px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent)}.score small{font-size:14px;color:var(--muted)}
.label{font-size:11px;color:var(--muted);text-align:right}
h3{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:16px 0 6px;font-weight:600}
ul{list-style:none;margin:0;padding:0}.row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--line)}
.st{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.strong{color:var(--ok)}.needs_improvement{color:var(--warn)}.missing{color:var(--bad)}.not_applicable{color:var(--muted)}
ol{margin:0;padding-left:18px}ol li{padding:3px 0}
.note{margin-top:14px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;color:var(--muted);font-size:12px}
.foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--muted)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
#empty{padding:16px 18px;color:var(--muted)}
</style></head>
<body>
<div id="empty">Checking website AI-readiness…</div>
<div class="card" id="card" hidden>
  <div class="top">
    <div><div class="eyebrow">GeoViz · Website AI-readiness check</div><div class="name" id="name"></div><div class="site" id="site"></div></div>
    <div><div class="score"><span id="score"></span><small>/100</small></div><div class="label" id="scoreLabel"></div></div>
  </div>
  <h3>Findings</h3><ul id="findings"></ul>
  <h3>Top improvements</h3><ol id="fixes"></ol>
  <div class="note" id="disclaimer"></div>
  <div class="foot"><span id="checked"></span><a id="link" href="#" target="_blank" rel="noopener noreferrer">Run the full GeoViz audit</a></div>
</div>
<script>
(function(){
  var STATUS={strong:"Strong",needs_improvement:"Needs work",missing:"Missing",not_applicable:"Not applicable"};
  var nextId=1, pending={};
  function el(id){return document.getElementById(id)}
  function text(id,v){el(id).textContent=v==null?"":String(v)}
  function safeHttps(u){try{var x=new URL(String(u));return x.protocol==="https:"?x.toString():null}catch(e){return null}}
  function render(d){
    if(!d||d.checkType!=="website_ai_readiness")return;
    text("name",d.business&&d.business.name);text("site",d.websiteChecked);
    text("score",d.score);text("scoreLabel",d.scoreLabel);text("disclaimer",d.disclaimer);
    text("checked","Checked "+String(d.checkedAt||"").slice(0,10));
    var f=el("findings");f.textContent="";(d.findings||[]).forEach(function(x){
      var li=document.createElement("li");li.className="row";var a=document.createElement("span");a.textContent=x.label;
      var b=document.createElement("span");b.className="st "+(STATUS[x.status]?x.status:"");b.textContent=STATUS[x.status]||"";
      li.appendChild(a);li.appendChild(b);f.appendChild(li)});
    var o=el("fixes");o.textContent="";(d.priorityImprovements||[]).slice(0,3).forEach(function(x){var li=document.createElement("li");li.textContent=x;o.appendChild(li)});
    var link=safeHttps(d.links&&d.links.fullAudit);var a=el("link");
    if(link){a.href=link;a.onclick=function(e){e.preventDefault();request("ui/open-link",{url:link}).catch(function(){window.open(link,"_blank","noopener")})}}else{a.hidden=true}
    el("empty").hidden=true;el("card").hidden=false;
  }
  function request(method,params){var id=nextId++;window.parent.postMessage({jsonrpc:"2.0",id:id,method:method,params:params},"*");
    return new Promise(function(res,rej){pending[id]={res:res,rej:rej};setTimeout(function(){if(pending[id]){delete pending[id];rej(new Error("timeout"))}},5000)})}
  window.addEventListener("message",function(ev){
    if(ev.source!==window.parent)return;var m=ev.data;if(!m||m.jsonrpc!=="2.0")return;
    if(m.id!=null&&pending[m.id]){var p=pending[m.id];delete pending[m.id];m.error?p.rej(m.error):p.res(m.result);return}
    if(m.method==="ui/notifications/tool-result"){render(m.params&&m.params.structuredContent)}
  },{passive:true});
  request("ui/initialize",{appInfo:{name:"geoviz-visibility-card",version:"1.0.0"},appCapabilities:{},protocolVersion:"2026-01-26"})
    .then(function(){window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*")}).catch(function(){});
  if(window.openai&&window.openai.toolOutput)render(window.openai.toolOutput);
})();
</script>
</body></html>`;
