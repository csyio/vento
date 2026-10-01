"use strict";

// Safe mini markdown renderer. Model output is NEVER interpreted as HTML (no innerHTML):
// only the nodes listed here are built with the DOM API, everything else is plain text.
// Supported: headings, **bold**, *italic*, `code`, ``` code block ```, - / 1. lists, [text](http(s) URL).

Vento.markdown = (() => {
  const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

  function inline(text, parent) {
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      if (m.index > last) {
        parent.append(text.slice(last, m.index));
      }
      const tok = m[0];
      let el;
      if (m[1]) {
        el = document.createElement("code");
        el.textContent = tok.slice(1, -1);
      } else if (m[2]) {
        el = document.createElement("strong");
        el.textContent = tok.slice(2, -2);
      } else if (m[3]) {
        el = document.createElement("em");
        el.textContent = tok.slice(1, -1);
      } else {
        const close = tok.indexOf("](");
        el = document.createElement("a");
        el.textContent = tok.slice(1, close);
        el.dataset.href = tok.slice(close + 2, -1);
        el.className = "md-link";
      }
      parent.append(el);
      last = m.index + tok.length;
    }
    if (last < text.length) {
      parent.append(text.slice(last));
    }
  }

  /** Renders text into a container element (replacing the previous content). */
  function render(text, container) {
    const frag = document.createDocumentFragment();
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (/^```/.test(line)) {
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          code.push(lines[i++]);
        }
        i++; // closing fence (may be missing while streaming)
        const pre = document.createElement("pre");
        const c = document.createElement("code");
        c.textContent = code.join("\n");
        pre.append(c);
        frag.append(pre);
        continue;
      }

      const list = /^\s*([-*•]|\d+[.)])\s+/.exec(line);
      if (list) {
        const ordered = /\d/.test(list[1]);
        const ul = document.createElement(ordered ? "ol" : "ul");
        while (i < lines.length) {
          const m = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          if (!m) {
            break;
          }
          const li = document.createElement("li");
          inline(m[2], li);
          ul.append(li);
          i++;
        }
        frag.append(ul);
        continue;
      }

      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        const p = document.createElement("p");
        p.className = "md-h";
        inline(h[2], p);
        frag.append(p);
        i++;
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      // Paragraph: up to a blank line
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i])) {
        para.push(lines[i++]);
      }
      const p = document.createElement("p");
      para.forEach((l, k) => {
        if (k) {
          p.append(document.createElement("br"));
        }
        inline(l, p);
      });
      frag.append(p);
    }
    container.replaceChildren(frag);
  }

  return { render };
})();
