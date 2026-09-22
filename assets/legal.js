(function (root, factory) {
  const api = factory(root);
  root.CJCLegal = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const LEGAL = {
    copyright: '© 2026 Chip Welsh. All Rights Reserved.',
    trademarks: 'Continuous Jubilee Calendar™ and CJC™ are trademarks of Chip Welsh.',
    footerLinkText: 'Terms of Use',
    effectiveDate: 'September 22, 2026',
    legalNote: 'This notice is provided for disclosure purposes only and does not constitute legal advice or guarantee enforceability.'
  };

  let configuredBasePath = null;

  function normalizeBasePath(value) {
    if (!value || typeof value !== 'string') return '/';
    const trimmed = value.trim();
    if (!trimmed) return '/';
    const withoutOrigin = trimmed.replace(/^[a-z]+:\/\/[^/]+/i, '');
    const ensuredLeadingSlash = withoutOrigin.startsWith('/') ? withoutOrigin : '/' + withoutOrigin;
    return ensuredLeadingSlash.replace(/\/+$/, '') + '/';
  }

  function setBasePath(value) {
    configuredBasePath = normalizeBasePath(value);
    return configuredBasePath;
  }

  function getScriptElement(doc) {
    return doc && (doc.currentScript || doc.querySelector('script[src$="assets/legal.js"]'));
  }

  function getProjectBasePath(overrideBasePath) {
    if (overrideBasePath) return normalizeBasePath(overrideBasePath);
    if (configuredBasePath) return configuredBasePath;
    if (typeof window === 'undefined' || !window.location) return '/';
    const doc = typeof document !== 'undefined' ? document : null;
    const scriptEl = getScriptElement(doc);
    if (scriptEl) {
      if (scriptEl.dataset && scriptEl.dataset.basePath) {
        return normalizeBasePath(scriptEl.dataset.basePath);
      }
      try {
        const scriptPath = new URL(scriptEl.src, window.location.href).pathname;
        if (scriptPath.endsWith('/assets/legal.js')) {
          return normalizeBasePath(scriptPath.slice(0, -'assets/legal.js'.length));
        }
      } catch (error) {
        // Fall through to location-based detection.
      }
    }

    const canonicalHref = doc && doc.querySelector('link[rel="canonical"]');
    if (canonicalHref) {
      try {
        const canonicalPath = new URL(canonicalHref.href, window.location.href).pathname;
        if (/\/[^/]+\.html$/i.test(canonicalPath)) {
          return normalizeBasePath(canonicalPath.replace(/[^/]+$/u, ''));
        }
        if (/\/terms-of-use\/?$/i.test(canonicalPath)) {
          return normalizeBasePath(canonicalPath.replace(/terms-of-use\/?$/iu, ''));
        }
      } catch (error) {
        // Fall through to location-based detection.
      }
    }

    const currentPath = window.location.pathname;
    if (/\/[^/]+\.html$/i.test(currentPath)) {
      return normalizeBasePath(currentPath.replace(/[^/]+$/u, ''));
    }
    return normalizeBasePath(currentPath.replace(/[^/]*$/u, ''));
  }

  function getTermsUrl(overrideBasePath) {
    return getProjectBasePath(overrideBasePath) + 'terms-of-use/';
  }

  function ensureStyles(doc) {
    if (!doc || doc.getElementById('cjc-legal-styles')) return;
    const style = doc.createElement('style');
    style.id = 'cjc-legal-styles';
    style.textContent = [
      '.cjc-legal-shell{margin-top:28px;}',
      '.cjc-legal-footer{margin-top:20px;text-align:center;font-size:12px;line-height:1.5;color:rgba(43,35,24,.58);opacity:.88;}',
      '.cjc-legal-footer a{color:inherit;text-decoration:underline;text-underline-offset:2px;}',
      '.cjc-legal-footer a:hover{opacity:1;}',
      '.cjc-legal-watermark{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);max-width:calc(100% - 32px);font-size:12px;line-height:1.4;text-align:center;color:rgba(43,35,24,.56);opacity:.3;pointer-events:none;white-space:normal;}'
    ].join('');
    doc.head.appendChild(style);
  }

  function createFooterMarkup(basePathOverride) {
    return [
      LEGAL.copyright,
      ' ',
      LEGAL.trademarks,
      ' | ',
      '<a href="',
      getTermsUrl(basePathOverride),
      '">',
      LEGAL.footerLinkText,
      '</a>'
    ].join('');
  }

  function attachFooter(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc || !targetDoc.body) return null;
    if (targetDoc.querySelector('[data-cjc-legal-footer="true"]')) {
      return targetDoc.querySelector('[data-cjc-legal-footer="true"]');
    }

    ensureStyles(targetDoc);

    const host = targetDoc.querySelector('.wrap') || targetDoc.body;
    let footerHost = host.querySelector('footer');
    const legalFooter = targetDoc.createElement('div');
    legalFooter.className = 'cjc-legal-footer';
    legalFooter.dataset.cjcLegalFooter = 'true';
    legalFooter.dataset.legalIgnore = 'true';
    legalFooter.innerHTML = createFooterMarkup();

    if (footerHost) {
      footerHost.appendChild(legalFooter);
      return legalFooter;
    }

    footerHost = targetDoc.createElement('footer');
    footerHost.className = 'cjc-legal-shell';
    footerHost.appendChild(legalFooter);
    host.appendChild(footerHost);
    return legalFooter;
  }

  function shouldSkipTextNode(textNode) {
    const parent = textNode && textNode.parentElement;
    if (!parent) return true;
    if (parent.closest('[data-legal-ignore], script, style, noscript, textarea, iframe')) return true;
    if (parent.closest('[aria-hidden="true"]')) return true;
    return false;
  }

  function getTrademarkRoot(doc) {
    if (!doc || !doc.body) return null;
    return doc.querySelector('[data-cjc-legal-root]') || doc.querySelector('main') || doc.querySelector('article') || doc.querySelector('.wrap') || doc.body;
  }

  function replaceFirstMatch(doc, rootNode, regex, replacement) {
    if (!doc || !rootNode || typeof doc.createTreeWalker !== 'function') return false;
    const walker = doc.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();

    while (current) {
      if (!shouldSkipTextNode(current)) {
        regex.lastIndex = 0;
        if (regex.test(current.nodeValue)) {
          current.nodeValue = current.nodeValue.replace(regex, replacement);
          return true;
        }
      }
      current = walker.nextNode();
    }

    return false;
  }

  function applyTrademarkMarks(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc || !targetDoc.body || targetDoc.body.dataset.cjcTrademarkApplied === 'true') return;
    const rootNode = getTrademarkRoot(targetDoc);
    replaceFirstMatch(targetDoc, rootNode, /Continuous Jubilee Calendar(?!™)/, 'Continuous Jubilee Calendar™');
    replaceFirstMatch(targetDoc, rootNode, /\bCJC\b(?!™)/, 'CJC™');
    targetDoc.body.dataset.cjcTrademarkApplied = 'true';
  }

  function createWatermarkSpec(options) {
    const opts = options || {};
    return {
      text: opts.text || [LEGAL.copyright, LEGAL.trademarks].join(' '),
      opacity: typeof opts.opacity === 'number' ? opts.opacity : 0.3,
      fontSize: opts.fontSize || 12,
      marginBottom: opts.marginBottom || 24,
      color: opts.color || 'rgba(43,35,24,0.56)',
      className: opts.className || 'cjc-legal-watermark'
    };
  }

  function applyWatermarkHook(target, options) {
    const spec = createWatermarkSpec(options);
    if (!target || !target.ownerDocument) return spec;

    const doc = target.ownerDocument;
    ensureStyles(doc);

    let watermark = target.querySelector('[data-cjc-legal-watermark="true"]');
    if (!watermark) {
      watermark = doc.createElement('div');
      watermark.dataset.cjcLegalWatermark = 'true';
      watermark.dataset.legalIgnore = 'true';
      target.appendChild(watermark);
    }

    watermark.className = spec.className;
    watermark.textContent = spec.text;
    watermark.style.opacity = String(spec.opacity);
    watermark.style.fontSize = spec.fontSize + 'px';
    watermark.style.bottom = spec.marginBottom + 'px';
    watermark.style.color = spec.color;

    if (root.getComputedStyle && root.getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }

    target.appendChild(watermark);
    return watermark;
  }

  function createAboutSheet(options) {
    const opts = options || {};
    const rows = [
      ['Terms of Use & Intellectual Property Notice'],
      ['Effective Date: ' + LEGAL.effectiveDate],
      [''],
      [LEGAL.copyright],
      [LEGAL.trademarks],
      ['Personal, private research, and non-commercial educational use only unless separate written permission is granted.'],
      ['Attribution must identify Chip Welsh and link back to the official CJC website domain when referencing the framework publicly.'],
      ['Data tables, charts, calculations, and derivative monetized products require explicit written permission or a formal license.'],
      ['See ' + getTermsUrl(opts.basePath) + ' for the full Terms of Use & Intellectual Property Notice.'],
      [''],
      [LEGAL.legalNote]
    ];

    return {
      name: opts.name || 'About',
      index: 0,
      locked: opts.locked !== false,
      rows,
      metadata: {
        textWrap: true,
        columnWidths: opts.columnWidths || [120],
        source: 'CJCLegal.createAboutSheet'
      }
    };
  }

  function prependAboutSheet(workbook, options) {
    const aboutSheet = createAboutSheet(options);

    if (!workbook || typeof workbook !== 'object') {
      return aboutSheet;
    }

    ['sheets', 'worksheets'].forEach(function (key) {
      if (Array.isArray(workbook[key])) {
        workbook[key] = [aboutSheet].concat(
          workbook[key].filter(function (sheet) {
            return !sheet || sheet.name !== aboutSheet.name;
          })
        );
      }
    });

    if (Array.isArray(workbook.SheetNames) && workbook.Sheets && typeof workbook.Sheets === 'object') {
      const sheetName = aboutSheet.name;
      workbook.SheetNames = [sheetName].concat(
        workbook.SheetNames.filter(function (name) {
          return name !== sheetName;
        })
      );
      workbook.Sheets[sheetName] = {
        __cjcAboutSheet: true,
        __rows: aboutSheet.rows,
        '!protect': {
          selectLockedCells: true,
          selectUnlockedCells: true
        }
      };
    }

    return workbook;
  }

  function init(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc) return;
    attachFooter(targetDoc);
    applyTrademarkMarks(targetDoc);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        init(document);
      }, { once: true });
    } else {
      init(document);
    }
  }

  return {
    LEGAL,
    attachFooter,
    applyTrademarkMarks,
    createWatermarkSpec,
    applyWatermarkHook,
    createAboutSheet,
    prependAboutSheet,
    getTermsUrl,
    getProjectBasePath,
    setBasePath,
    init
  };
});
