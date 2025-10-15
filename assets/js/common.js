/* Common layout + i18n loader */
(function () {
  const headerEl = document.getElementById('app-header');
  const footerEl = document.getElementById('app-footer');
  const currentPath = location.pathname.split('/').pop() || 'index.html';

  // Fetch and inject partials, then init i18n and nav state
  Promise.all([
    fetch('./partials/header.html').then(r => r.text()),
    fetch('./partials/footer.html').then(r => r.text())
  ]).then(([headerHtml, footerHtml]) => {
    if (headerEl) headerEl.innerHTML = headerHtml;
    if (footerEl) footerEl.innerHTML = footerHtml;
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();

    highlightActiveNav();
    bindLanguageSwitch();
    applySavedLanguage();
    enableSpaNavigation();
    ensureOverlay();

    // initial fade-in for first render
    const main = document.querySelector('main');
    if (main) {
      // force reflow then fade-in
      void main.offsetHeight;
      main.classList.add('fade-in');
    }

    // dynamic header transparency on scroll
    const nav = document.querySelector('.glass-nav');
    const onScroll = () => {
      if (!nav) return;
      if (window.scrollY > 40) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }).catch(console.error);

  function highlightActiveNav() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (currentPath.endsWith(href)) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  // i18n
  const I18N = {
    lang: 'zh',
    dict: {},
  };

  function bindLanguageSwitch() {
    document.body.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.classList && target.classList.contains('lang-switch')) {
        const lang = target.getAttribute('data-lang') || 'zh';
        setLanguage(lang);
        // close dropdown and collapsed navbar on mobile
        const dropdown = target.closest('.dropdown');
        if (dropdown) {
          const toggle = dropdown.querySelector('[data-bs-toggle="dropdown"]');
          if (toggle && window.bootstrap) {
            window.bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
          }
        }
        closeNavbar();
      }
    }, true);
  }

  function applySavedLanguage() {
    const saved = localStorage.getItem('westvis_lang') || 'zh';
    setLanguage(saved);
  }

  async function setLanguage(lang) {
    const overlay = ensureOverlay();
    document.body.classList.add('overlay-active');
    // animate in overlay
    requestAnimationFrame(() => overlay.classList.add('show'));
    await new Promise(r => setTimeout(r, 180));
    if (I18N.lang === lang && Object.keys(I18N.dict).length) {
      translatePage();
      overlay.classList.remove('show');
      document.body.classList.remove('overlay-active');
      return;
    }
    try {
      const res = await fetch(`./assets/i18n/${lang}.json`);
      I18N.dict = await res.json();
      I18N.lang = lang;
      localStorage.setItem('westvis_lang', lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ug' ? 'rtl' : 'ltr';
      translatePage();
      // animate out overlay
      overlay.classList.remove('show');
      document.body.classList.remove('overlay-active');
    } catch (err) {
      console.error('i18n load error', err);
      overlay.classList.remove('show');
      document.body.classList.remove('overlay-active');
    }
  }

  function translatePage() {
    const nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(node => {
      const key = node.getAttribute('data-i18n');
      const text = getByPath(I18N.dict, key) || node.textContent;
      node.textContent = text;
    });
    const htmlNodes = document.querySelectorAll('[data-i18n-html]');
    htmlNodes.forEach(node => {
      const key = node.getAttribute('data-i18n-html');
      const html = getByPath(I18N.dict, key);
      if (html) node.innerHTML = html;
    });
    // title
    if (I18N.dict.meta && I18N.dict.meta.title) {
      // Don't clobber specific page subtitles, append brand
      document.title = currentPath.startsWith('team') ? `${I18N.dict.team.pageTitle} · WestVis` : `${I18N.dict.meta.title}`;
    }

    // Bind expand/collapse for member bios (delegated)
    document.querySelectorAll('.expand-bio-btn').forEach((btn) => {
      btn.removeEventListener('click', toggleBio);
      btn.addEventListener('click', toggleBio);
    });
  }

  function toggleBio(e) {
    const card = e.currentTarget.closest('.member-card');
    const bio = card && card.querySelector('.bio');
    if (!bio) return;
    const expanded = bio.classList.toggle('expanded');
    const icon = e.currentTarget.querySelector('i');
    if (icon) {
      icon.className = expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line';
    }
    e.currentTarget.setAttribute('data-expanded', expanded ? 'true' : 'false');
  }

  function getByPath(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj);
  }

  // Simple SPA navigation for internal links
  function enableSpaNavigation() {
    // Smooth scroll buttons
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-scroll-target]');
      if (!btn) return;
      const selector = btn.getAttribute('data-scroll-target');
      if (!selector) return;
      const el = document.querySelector(selector);
      if (el) {
        e.preventDefault();
        closeNavbar();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, true);

    document.body.addEventListener('click', async (e) => {
      const target = e.target.closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (!href) return;
      if (target.dataset.noSpa === 'true') return;
      if (href.startsWith('http') || href.startsWith('mailto:') || target.getAttribute('target')) return;
      // same-page anchor or same-path with hash -> let browser handle without SPA
      if (href.startsWith('#')) return;
      // also ignore if target has role="anchor" workaround
      if (target.getAttribute('role') === 'anchor') return;
      try {
        const url = new URL(href, location.href);
        const current = new URL(location.href);
        // If navigating to exactly the same route (no hash/search difference), block default to避免闪烁
        if (url.pathname === current.pathname && url.search === current.search && (url.hash === '' || url.hash === current.hash)) {
          e.preventDefault();
          closeNavbar();
          return;
        }
        if (url.pathname === current.pathname && (url.hash || current.hash)) return;
      } catch (_) {}
      // Internal link → fetch and swap body content
      e.preventDefault();
      closeNavbar();
      navigateTo(href, true);
    }, true);

    // Handle back/forward
    window.addEventListener('popstate', () => {
      navigateTo(location.href, false);
    });
  }

  function closeNavbar() {
    const nav = document.getElementById('navbarMain');
    if (!nav) return;
    if (nav.classList.contains('show') && window.bootstrap) {
      window.bootstrap.Collapse.getOrCreateInstance(nav, { toggle: false }).hide();
    }
  }

  function ensureOverlay() {
    let overlay = document.getElementById('page-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'page-overlay';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  async function navigateTo(url, push) {
    try {
      const main = document.querySelector('main');
      if (main) {
        main.classList.remove('fade-in');
        main.classList.add('fade-out');
      }
      await new Promise(r => setTimeout(r, 120));
      const res = await fetch(url, { headers: { 'X-Requested-With': 'fetch' } });
      const html = await res.text();
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const newMain = dom.querySelector('main');
      if (!newMain || !main) { location.href = url; return; }
      newMain.classList.add('fade-out');
      main.replaceWith(newMain);
      // force reflow then fade-in
      void newMain.offsetHeight;
      newMain.classList.remove('fade-out');
      newMain.classList.add('fade-in');
      if (push) window.history.pushState({}, '', url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      translatePage();
      highlightActiveNav();
    } catch (err) {
      console.error('navigate error', err);
      location.href = url;
    }
  }
})();


