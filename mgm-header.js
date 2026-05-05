/* Maddy Grubb Maps — shared header bootloader.
   Fetches partials/header.html, substitutes path tokens, injects into the
   <header id="sec-cdd0"> placeholder, then rebinds all interactivity:
     - hamburger open / close / overlay-click
     - scroll state (mgm-at-top  ↔  body.mgm-header-scrolled)
     - mobile submenu tap-to-expand (capture phase, beats Nicepage close)
     - active-page highlight on the current nav item

   Usage in any page:
     <header id="sec-cdd0" data-path-root="" class="u-header u-sticky u-sticky-b4bd u-white u-header mgm-at-top"></header>
     <script src="mgm-header.js" defer></script>
   For pages one folder deep (Adventures_Posts/, Client-Types/, Map-Pages/):
     data-path-root="../"  and  src="../mgm-header.js"
*/
(function () {
  const header = document.getElementById('sec-cdd0');
  if (!header) return;

  const path = header.dataset.pathRoot || '';

  fetch(path + 'partials/header.html', { cache: 'no-cache' })
    .then(r => {
      if (!r.ok) throw new Error('header partial fetch failed: ' + r.status);
      return r.text();
    })
    .then(html => {
      header.innerHTML = html.replace(/\{\{path\}\}/g, path);
      bindAll(header, path);
    })
    .catch(err => {
      console.error('[mgm-header]', err);
    });

  function bindAll(header, path) {
    bindHamburger(header);
    bindSubmenuTapExpand(header);
    bindScrollState(header);
    markActiveNav(header, path);
  }

  /* Slide-out open/close. We bind these ourselves because Nicepage's own
     handler runs at DOMContentLoaded and won't see our injected nodes. */
  function bindHamburger(header) {
    const open = header.querySelector('.u-hamburger-link');
    const close = header.querySelector('.u-menu-close');
    const overlay = header.querySelector('.u-menu-overlay');
    if (open) {
      open.addEventListener('click', e => {
        e.preventDefault();
        document.body.classList.add('u-offcanvas-opened');
      });
    }
    if (close) {
      close.addEventListener('click', e => {
        e.preventDefault();
        document.body.classList.remove('u-offcanvas-opened');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        document.body.classList.remove('u-offcanvas-opened');
      });
    }
  }

  /* First tap on a parent with a popup expands the submenu instead of
     navigating; second tap navigates normally. Capture phase + stopImmediate
     so Nicepage's bubble-phase close-on-click can't fire first. */
  function bindSubmenuTapExpand(header) {
    const slideout = header.querySelector('.u-nav-container-collapse');
    if (!slideout) return;
    slideout.querySelectorAll('.u-nav-item > .u-nav-popup').forEach(popup => {
      const item = popup.parentElement;
      const link = item.querySelector(':scope > .u-nav-link');
      if (!link) return;
      link.addEventListener('click', e => {
        if (!item.classList.contains('mgm-submenu-open')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          item.classList.add('mgm-submenu-open');
        }
      }, true);
    });
  }

  /* mgm-at-top while near the top, body.mgm-header-scrolled once we leave
     the hero. Same threshold (60px) as the original index.html handler. */
  function bindScrollState(header) {
    function update() {
      if (window.scrollY > 60) {
        header.classList.remove('mgm-at-top');
        document.body.classList.add('mgm-header-scrolled');
      } else {
        header.classList.add('mgm-at-top');
        document.body.classList.remove('mgm-header-scrolled');
      }
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* Highlight the nav link that points at the current page so users can see
     where they are. Skips index.html ("/") since nothing in the nav points
     at the homepage. */
  function markActiveNav(header, path) {
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (here === 'index.html' || here === '') return;
    header.querySelectorAll('a.u-nav-link').forEach(a => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (!href || href === '#') return;
      if (href.endsWith('/' + here) || href === here) {
        a.classList.add('mgm-nav-active');
      }
    });
  }
})();
