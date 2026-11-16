/**
 * White-label pass for an admin's custom domain: rewrites the platform's own
 * name ("Hindenburg India", "Hindenburg") and its bare domain
 * (hindenburgindia.live / .com) to the tenant's brand + host in everything the
 * page renders — text, a few label attributes, mailto/links and the tab title —
 * and keeps doing so as React renders more (MutationObserver). One choke point
 * instead of editing the ~70 marketing / legal / app files that hard-code it.
 *
 * Runs only after hydration (from a useEffect), so React never sees a
 * server/client text mismatch. Sub-domains such as api.hindenburgindia.live
 * are left alone so API / asset links keep working.
 */

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE"]);
const ATTRS = ["alt", "title", "aria-label", "placeholder"];
const PLATFORM_DOMAIN = /(^|[^.\w-])(?:www\.)?hindenburgindia\.(?:live|com)\b/gi;
const HIT = /indenburg|INDENBURG/;

export function whiteLabelFix(s: string, brand: string, host: string): string {
  const up = brand.toUpperCase();
  return s
    .replace(PLATFORM_DOMAIN, (_m, pre: string) => `${pre}${host}`)
    .replace(/HINDENBURG INDIA/g, up)
    .replace(/Hindenburg India/g, brand)
    .replace(/HINDENBURG/g, up)
    .replace(/Hindenburg/g, brand);
}

export function startWhiteLabel(brand: string, host: string): () => void {
  const fix = (s: string) => whiteLabelFix(s, brand, host);

  const fixText = (n: Node) => {
    const v = n.nodeValue;
    if (!v || !HIT.test(v)) return;
    const p = n.parentElement;
    if (p && SKIP.has(p.tagName)) return;
    const f = fix(v);
    if (f !== v) n.nodeValue = f;
  };

  const fixEl = (el: Element) => {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && HIT.test(v)) el.setAttribute(a, fix(v));
    }
    if (el.tagName === "A") {
      const h = el.getAttribute("href");
      if (h && /hindenburgindia\./i.test(h)) {
        const f = h.replace(PLATFORM_DOMAIN, (_m, pre: string) => `${pre}${host}`);
        if (f !== h) el.setAttribute("href", f);
      }
    }
  };

  const walk = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return fixText(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (SKIP.has(el.tagName)) return;
    fixEl(el);
    el.querySelectorAll("[alt],[title],[aria-label],[placeholder],a[href]").forEach(fixEl);
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) fixText(n);
  };

  const fixTitle = () => {
    if (HIT.test(document.title)) document.title = fix(document.title);
  };

  walk(document.body);
  fixTitle();
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") fixText(r.target);
      else if (r.type === "attributes") fixEl(r.target as Element);
      else r.addedNodes.forEach(walk);
    }
    fixTitle();
  });
  mo.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS, "href"],
  });
  return () => mo.disconnect();
}
