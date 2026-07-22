(function initCourseContentSecurity(global) {
  const allowedTags = new Set([
    "B",
    "BR",
    "EM",
    "I",
    "P",
    "SPAN",
    "STRONG",
    "SUB",
    "SUP",
    "U"
  ]);
  const blockedTags = new Set([
    "BASE",
    "EMBED",
    "FORM",
    "IFRAME",
    "LINK",
    "META",
    "OBJECT",
    "SCRIPT",
    "STYLE",
    "TEMPLATE"
  ]);
  const allowedStyleProperties = new Map([
    ["color", /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i],
    ["font-family", /^(?:monospace|serif|sans-serif|cursive|system-ui)$/i],
    ["font-size", /^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i],
    ["font-style", /^(?:normal|italic|oblique)$/i],
    ["font-weight", /^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
    ["line-height", /^(?:normal|\d+(?:\.\d+)?(?:px|em|rem|%)?)$/i],
    ["text-align", /^(?:left|right|center|justify|start|end)$/i],
    ["text-decoration", /^(?:none|underline|line-through)$/i],
    ["vertical-align", /^(?:baseline|sub|super|text-top|text-bottom|middle|top|bottom|-?\d+(?:\.\d+)?(?:px|em|rem|%))$/i]
  ]);

  function sanitizeStyle(value = "") {
    const declarations = [];
    String(value).split(";").forEach((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const candidate = declaration.slice(separator + 1).trim();
      const validator = allowedStyleProperties.get(property);
      if (!validator || !candidate || !validator.test(candidate)) return;
      if (/url\s*\(|expression\s*\(|javascript:|data:/i.test(candidate)) return;
      declarations.push(`${property}: ${candidate}`);
    });
    return declarations.join("; ");
  }

  function unwrap(node) {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    node.remove();
  }

  function sanitizeElement(element) {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === "style") {
        const style = sanitizeStyle(attribute.value);
        if (style) element.setAttribute("style", style);
        else element.removeAttribute(attribute.name);
        return;
      }
      if (name === "class") {
        const className = attribute.value
          .split(/\s+/)
          .filter((item) => /^[a-z0-9_-]{1,80}$/i.test(item))
          .slice(0, 12)
          .join(" ");
        if (className) element.setAttribute("class", className);
        else element.removeAttribute(attribute.name);
        return;
      }
      if (name === "aria-hidden" && /^(?:true|false)$/i.test(attribute.value)) return;
      element.removeAttribute(attribute.name);
    });
  }

  function sanitizeRichHtml(value = "") {
    const source = String(value ?? "");
    if (!source) return "";
    const documentValue = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
    const body = documentValue.body;
    const visit = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 8) {
          child.remove();
          return;
        }
        if (child.nodeType !== 1) return;
        if (blockedTags.has(child.tagName)) {
          child.remove();
          return;
        }
        if (!allowedTags.has(child.tagName)) {
          visit(child);
          unwrap(child);
          return;
        }
        sanitizeElement(child);
        visit(child);
      });
    };
    visit(body);
    return body.innerHTML;
  }

  global.CourseContentSecurity = Object.freeze({
    sanitizeRichHtml
  });
})(window);
