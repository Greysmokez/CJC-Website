(function () {
  'use strict';

  const LEGAL_YEAR = '2026';
  const MUTED_GRAY = '#8b8f97';
  const CANONICAL_TERMS_URL = 'https://greysmokez.github.io/CJC-Website/terms-of-use/';
  const TRADEMARK_PATTERNS = [
    { term: 'Continuous Jubilee Calendar', regex: /Continuous Jubilee Calendar(?!\s*™)/ },
    { term: 'CJC', regex: /\bCJC\b(?!\s*™)/ }
  ];
  const LEGAL_CONFIG = window.CJCLegalConfig && typeof window.CJCLegalConfig === 'object'
    ? window.CJCLegalConfig
    : {};

  const DEFAULT_WATERMARK = Object.freeze({
    text: '© 2026 Chip Welsh · Continuous Jubilee Calendar™ · CJC™',
    opacity: 0.08,
    color: MUTED_GRAY,
    marginPx: 24,
    align: 'right',
    placement: 'margin-only'
  });

  const SCRIPT_URL = (function () {
    const current = document.currentScript;
    if (current && current.src) {
      return new URL(current.src, window.location.href);
    }

    const fallback = Array.from(document.scripts || []).find(function (script) {
      return script && script.src && /\/assets\/legal\.js(?:\?|$)/.test(script.src);
    });

    return fallback && fallback.src
      ? new URL(fallback.src, window.location.href)
      : null;
  })();

  function clampOpacity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_WATERMARK.opacity;
    return Math.max(0, Math.min(0.1, numeric));
  }

  function normalizeWatermarkOptions(options) {
    const input = options && typeof options === 'object' ? options : {};
    const marginPx = Number(input.marginPx);
    const align = input.align === 'left' ? 'left' : input.align === 'center' ? 'center' : 'right';

    return {
      text: typeof input.text === 'string' && input.text.trim()
        ? input.text.trim()
        : DEFAULT_WATERMARK.text,
      opacity: clampOpacity(input.opacity),
      color: typeof input.color === 'string' && input.color.trim()
        ? input.color.trim()
        : DEFAULT_WATERMARK.color,
      marginPx: Number.isFinite(marginPx) ? Math.max(16, marginPx) : DEFAULT_WATERMARK.marginPx,
      align,
      placement: 'margin-only'
    };
  }

  function appendTrademark(text, pattern) {
    const match = text.match(pattern.regex);
    if (!match || typeof match.index !== 'number') return null;
    const start = match.index;
    const matchedText = match[0];
    return text.slice(0, start) + matchedText + '™' + text.slice(start + matchedText.length);
  }

  function shouldSkipTextNode(parent) {
    if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return true;
    if (parent.closest('[data-cjc-trademark="manual"], script, style, noscript, textarea, input, select, option, code, pre, svg, table, thead, tbody, tfoot, tr, td, th')) {
      return true;
    }
    return false;
  }

  function applyFirstInstanceTrademark(root) {
    const state = {
      'Continuous Jubilee Calendar': false,
      CJC: false
    };

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (shouldSkipTextNode(node.parentElement)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      const node = walker.currentNode;
      let currentText = node.nodeValue;
      let changed = false;

      for (const pattern of TRADEMARK_PATTERNS) {
        if (state[pattern.term]) continue;
        const updatedText = appendTrademark(currentText, pattern);
        if (updatedText && updatedText !== currentText) {
          currentText = updatedText;
          state[pattern.term] = true;
          changed = true;
        }
      }

      if (changed) {
        node.nodeValue = currentText;
      }

      if (Object.values(state).every(Boolean)) {
        break;
      }
    }
  }

  function injectLegalFooter() {
    if (!document.body || document.querySelector('[data-cjc-legal-footer]')) return null;

    const footer = document.createElement('footer');
    footer.setAttribute('data-cjc-legal-footer', 'true');
    footer.style.margin = '32px auto 24px';
    footer.style.padding = '16px 20px 0';
    footer.style.maxWidth = '960px';
    footer.style.borderTop = '1px solid rgba(139, 143, 151, 0.35)';
    footer.style.color = '#5b4f3e';
    footer.style.fontSize = '0.92rem';
    footer.style.lineHeight = '1.6';

    const termsHref = SCRIPT_URL
      ? new URL('../terms-of-use/', SCRIPT_URL).href
      : CANONICAL_TERMS_URL;

    footer.append(document.createTextNode(
      '© ' + LEGAL_YEAR + ' Chip Welsh. Continuous Jubilee Calendar™ and CJC™ are proprietary marks. Personal, non-commercial study use only unless otherwise licensed. '
    ));

    const link = document.createElement('a');
    link.href = termsHref;
    link.textContent = 'Terms of Use';
    link.style.color = 'inherit';
    link.style.textDecoration = 'underline';
    footer.append(link, document.createTextNode('.'));

    document.body.appendChild(footer);
    return footer;
  }

  function applyWatermarkHook(target, options) {
    const host = target && target.nodeType === Node.ELEMENT_NODE ? target : document.body;
    if (!host) return null;

    const existing = Array.from(host.children).find(function (child) {
      return child && child.hasAttribute('data-cjc-watermark');
    });
    if (existing) return existing;

    const config = normalizeWatermarkOptions(options);
    const watermark = document.createElement('div');
    watermark.setAttribute('data-cjc-watermark', 'true');
    watermark.setAttribute('aria-hidden', 'true');
    watermark.textContent = config.text;
    watermark.style.display = 'block';
    watermark.style.margin = config.marginPx + 'px';
    watermark.style.opacity = String(config.opacity);
    watermark.style.color = config.color;
    watermark.style.font = '600 12px/1.35 "Source Sans 3", Arial, sans-serif';
    watermark.style.letterSpacing = '0.08em';
    watermark.style.textTransform = 'uppercase';
    watermark.style.textAlign = config.align;
    watermark.style.pointerEvents = 'none';
    watermark.style.userSelect = 'none';

    host.appendChild(watermark);
    return watermark;
  }

  window.CJCLegal = {
    DEFAULT_WATERMARK,
    normalizeWatermarkOptions,
    applyFirstInstanceTrademark,
    injectLegalFooter,
    applyWatermarkHook
  };

  function initializeLegalEnhancements() {
    if (!document.body) return;
    if (!LEGAL_CONFIG.disableTrademarkPass) {
      applyFirstInstanceTrademark(document.body);
    }
    injectLegalFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLegalEnhancements, { once: true });
  } else {
    initializeLegalEnhancements();
  }
})();
