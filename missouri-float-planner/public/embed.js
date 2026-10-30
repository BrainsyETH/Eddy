/*! Eddy embed loader — https://eddy.guide/embed
 *
 * Drop one script tag on the page, then place widgets with data attributes:
 *
 *   <script async src="https://eddy.guide/embed.js"></script>
 *   <div data-eddy-river="current" data-size="card" data-theme="auto"></div>
 *   <div data-eddy-dam="swl-bull-shoals-dam" data-size="strip"></div>
 *
 * Attributes: data-size (badge|strip|card|full), data-theme (light|dark|auto),
 * data-bg ("transparent"), data-accent (#rrggbb), data-days (7|14|30),
 * data-partner (text credit), data-embed (emb_… co-branding id),
 * data-rivers (comma list → the multi-river overview, with data-eddy-rivers).
 *
 * The loader builds the iframe, keeps it sized to its content (the widget
 * posts its height), and never touches anything else on the page. No cookies,
 * no tracking beyond the widget's own impression beacon. Idempotent: calling
 * it twice, or alongside the older inline resize snippet, is harmless.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var ORIGIN = (function () {
    try {
      var s = document.currentScript;
      if (s && s.src) return new URL(s.src).origin;
    } catch (e) { /* fall through */ }
    return 'https://eddy.guide';
  })();

  var SIZES = { badge: 1, strip: 1, card: 1, full: 1 };
  var THEMES = { light: 1, dark: 1, auto: 1 };

  function query(el, allowSize) {
    var p = [];
    var size = el.getAttribute('data-size');
    if (allowSize && size && SIZES[size]) p.push('size=' + size);
    var theme = el.getAttribute('data-theme');
    if (theme && THEMES[theme]) p.push('theme=' + theme);
    if (el.getAttribute('data-bg') === 'transparent') p.push('bg=transparent');
    var accent = el.getAttribute('data-accent');
    if (accent && /^#?[0-9a-fA-F]{6}$/.test(accent)) p.push('accent=' + encodeURIComponent(accent.charAt(0) === '#' ? accent : '#' + accent));
    var days = el.getAttribute('data-days');
    if (days === '7' || days === '14' || days === '30') p.push('days=' + days);
    var partner = el.getAttribute('data-partner');
    if (partner) p.push('partner=' + encodeURIComponent(partner.slice(0, 60)));
    var embed = el.getAttribute('data-embed');
    if (embed && /^emb_[0-9a-f]{8}$/.test(embed)) p.push('e=' + embed);
    var rivers = el.getAttribute('data-rivers');
    if (rivers) p.push('rivers=' + encodeURIComponent(rivers.replace(/\s+/g, '')));
    return p.length ? '?' + p.join('&') : '';
  }

  function srcFor(el) {
    var slug = /^[a-z0-9-]{1,60}$/;
    var river = el.getAttribute('data-eddy-river');
    if (river && slug.test(river)) return ORIGIN + '/embed/river/' + river + query(el, true);
    var dam = el.getAttribute('data-eddy-dam');
    if (dam && slug.test(dam)) return ORIGIN + '/embed/dam/' + dam + query(el, true);
    if (el.hasAttribute('data-eddy-rivers')) {
      if (!el.getAttribute('data-rivers')) el.setAttribute('data-rivers', el.getAttribute('data-eddy-rivers') || '');
      return ORIGIN + '/embed/rivers' + query(el, false);
    }
    return null;
  }

  function mount(el) {
    if (el.getAttribute('data-eddy-mounted')) return;
    var src = srcFor(el);
    if (!src) return;
    el.setAttribute('data-eddy-mounted', '1');
    var size = el.getAttribute('data-size') || 'card';
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.setAttribute('data-eddy-embed', '');
    iframe.setAttribute('title', el.getAttribute('data-title') || 'Live river conditions from Eddy');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('scrolling', 'no');
    iframe.style.border = '0';
    iframe.style.display = size === 'badge' ? 'inline-block' : 'block';
    iframe.style.verticalAlign = 'middle';
    iframe.style.maxWidth = '100%';
    iframe.style.width = size === 'badge' ? '280px' : '100%';
    iframe.style.height = size === 'badge' ? '40px' : size === 'strip' ? '64px' : '320px';
    iframe.style.borderRadius = size === 'badge' ? '0' : '12px';
    el.appendChild(iframe);
  }

  function installResizer() {
    if (window.__eddyEmbedResizer) return;
    window.__eddyEmbedResizer = 1;
    window.addEventListener('message', function (e) {
      var d = e && e.data;
      if (!d || d.type !== 'eddy-embed:resize' || typeof d.height !== 'number') return;
      var frames = document.querySelectorAll('iframe[data-eddy-embed]');
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow === e.source) {
          frames[i].style.height = d.height + 'px';
          if (typeof d.width === 'number') frames[i].style.width = d.width + 'px';
          break;
        }
      }
    });
  }

  function scan(root) {
    var nodes = (root || document).querySelectorAll('[data-eddy-river],[data-eddy-dam],[data-eddy-rivers]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  installResizer();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(); });
  } else {
    scan();
  }
  // Pages that render widgets later (SPAs, lazy sections) can call this.
  window.EddyEmbed = { scan: scan, mount: mount, origin: ORIGIN };
})();
