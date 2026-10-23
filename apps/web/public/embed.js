/*
 * Food Ordering Agent embed. Add to any website:
 *   <script src="https://your-host/embed.js" data-restaurant="demo"></script>
 * It adds an "Order online" button that opens the ordering page in a panel.
 */
(function () {
  "use strict";
  var script = document.currentScript || document.querySelector("script[data-restaurant][src*='embed.js']");
  if (!script || window.__foaEmbed) return;
  window.__foaEmbed = true;

  var slug = script.getAttribute("data-restaurant") || "demo";
  var label = script.getAttribute("data-label") || "Order online";
  var origin = new URL(script.src, location.href).origin;
  var src = origin + "/order/" + encodeURIComponent(slug) + "?embed=1";

  var css =
    ".foa-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;" +
    "min-height:52px;padding:0 22px;border:0;border-radius:999px;background:#2f5d3a;color:#fff;" +
    "font:700 16px/1 system-ui,sans-serif;box-shadow:0 8px 24px rgba(43,33,28,.28);cursor:pointer}" +
    ".foa-btn:hover{background:#234a2c}.foa-btn:focus-visible,.foa-close:focus-visible{outline:3px solid #e3a35a;outline-offset:2px}" +
    ".foa-panel{position:fixed;right:20px;bottom:84px;z-index:2147483001;width:400px;height:640px;" +
    "max-height:calc(100vh - 104px);border-radius:20px;overflow:hidden;background:#f7f3ee;" +
    "box-shadow:0 16px 48px rgba(43,33,28,.35);display:none}" +
    ".foa-panel.foa-open{display:block}.foa-panel iframe{width:100%;height:100%;border:0;display:block}" +
    ".foa-close{position:absolute;top:8px;right:8px;width:40px;height:40px;border:0;border-radius:999px;" +
    "background:#fff;color:#2b211c;font:700 20px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.15)}" +
    "@media (max-width:480px){.foa-panel{inset:0;width:100%;height:100%;max-height:none;border-radius:0}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var button = document.createElement("button");
  button.type = "button";
  button.className = "foa-btn";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.textContent = label;

  var panel = document.createElement("div");
  panel.className = "foa-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", label);

  var close = document.createElement("button");
  close.type = "button";
  close.className = "foa-close";
  close.setAttribute("aria-label", "Close ordering");
  close.textContent = "×";

  var frame = null;

  function open() {
    // Load on first open so the host page isn't slowed down.
    if (!frame) {
      frame = document.createElement("iframe");
      frame.src = src;
      frame.title = label;
      frame.allow = "microphone";
      panel.insertBefore(frame, close);
    }
    panel.classList.add("foa-open");
    button.setAttribute("aria-expanded", "true");
    close.focus();
  }

  function hide() {
    panel.classList.remove("foa-open");
    button.setAttribute("aria-expanded", "false");
    button.focus();
  }

  button.addEventListener("click", function () {
    panel.classList.contains("foa-open") ? hide() : open();
  });
  close.addEventListener("click", hide);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.classList.contains("foa-open")) hide();
  });

  panel.appendChild(close);
  document.body.appendChild(panel);
  document.body.appendChild(button);
})();
