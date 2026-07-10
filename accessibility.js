(function () {
  'use strict';

  var interactiveSelector = 'a:not([href]), .interactive-surface, .wish-action';
  var lastFocusedBeforeDialog = null;
  var dialogBackground = [];

  function restoreDialogBackground() {
    dialogBackground.forEach(function (entry) {
      if (!document.contains(entry.element)) return;
      if (entry.ariaHidden === null) entry.element.removeAttribute('aria-hidden');
      else entry.element.setAttribute('aria-hidden', entry.ariaHidden);
      entry.element.inert = entry.inert;
    });
    dialogBackground = [];
  }

  function hideDialogBackground(dialog) {
    restoreDialogBackground();
    var parent = dialog.parentElement;
    if (!parent) return;
    Array.from(parent.children).forEach(function (sibling) {
      if (sibling === dialog || sibling.contains(dialog) || sibling.tagName === 'SCRIPT') return;
      dialogBackground.push({
        element: sibling,
        ariaHidden: sibling.getAttribute('aria-hidden'),
        inert: Boolean(sibling.inert)
      });
      sibling.setAttribute('aria-hidden', 'true');
      sibling.inert = true;
    });
  }

  function enhanceInteractive(element) {
    if (!(element instanceof HTMLElement)) return;
    if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
    if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
  }

  function enhanceField(field) {
    if (!(field instanceof HTMLElement)) return;
    if (field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby')) return;
    if (field.id && document.querySelector('label[for="' + CSS.escape(field.id) + '"]')) return;
    var label = field.getAttribute('placeholder') || field.getAttribute('title');
    if (!label && field.tagName === 'SELECT') label = '선택 옵션';
    if (label) field.setAttribute('aria-label', label);
  }

  function enhanceImage(image) {
    if (!(image instanceof HTMLImageElement)) return;
    if (/^https?:\/\//i.test(image.src)) image.referrerPolicy = 'no-referrer';
    if (!image.hasAttribute('decoding')) image.decoding = 'async';
  }

  function enhance(root) {
    if (!(root instanceof Element || root instanceof Document)) return;
    if (root instanceof Element && root.matches(interactiveSelector)) enhanceInteractive(root);
    root.querySelectorAll(interactiveSelector).forEach(enhanceInteractive);
    root.querySelectorAll('input, select, textarea').forEach(enhanceField);
    root.querySelectorAll('img').forEach(enhanceImage);
    var dialogs = [];
    if (root instanceof Element && root.matches('[role="dialog"]')) dialogs.push(root);
    root.querySelectorAll('[role="dialog"]').forEach(function (dialog) { dialogs.push(dialog); });
    dialogs.forEach(function (dialog) {
      if (dialog.dataset.focusReady === 'true') return;
      dialog.dataset.focusReady = 'true';
      lastFocusedBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      hideDialogBackground(dialog);
      requestAnimationFrame(function () {
        var target = dialog.querySelector('input, select, textarea, button, a[href], [role="button"], [tabindex="0"]');
        if (target instanceof HTMLElement) target.focus();
      });
    });
  }

  function boot() {
    enhance(document);
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node instanceof Element) enhance(node);
        });
        record.removedNodes.forEach(function (node) {
          if (node instanceof Element && (node.matches('[role="dialog"]') || node.querySelector('[role="dialog"]'))) {
            restoreDialogBackground();
            if (lastFocusedBeforeDialog && document.contains(lastFocusedBeforeDialog)) lastFocusedBeforeDialog.focus();
            lastFocusedBeforeDialog = null;
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('keydown', function (event) {
    var dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(function (dialog) {
      var style = getComputedStyle(dialog);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    var dialog = dialogs.length ? dialogs[dialogs.length - 1] : null;

    if (dialog && event.key === 'Escape') {
      var closeControl = Array.from(dialog.querySelectorAll('[role="button"], button, a[href]')).find(function (element) {
        return /(닫기|×)/.test((element.textContent || '').trim());
      });
      if (closeControl instanceof HTMLElement) {
        event.preventDefault();
        closeControl.click();
      }
      return;
    }

    if (dialog && event.key === 'Tab') {
      var focusable = Array.from(dialog.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex="0"]')).filter(function (element) {
        return element instanceof HTMLElement && !element.hasAttribute('disabled') && element.offsetParent !== null;
      });
      if (focusable.length) {
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    var target = event.target instanceof Element ? event.target.closest('[role="button"]') : null;
    if (!target || target.matches('button, input, select, textarea')) return;
    event.preventDefault();
    target.click();
  });

  document.addEventListener('error', function (event) {
    var image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied === 'true') return;
    image.dataset.fallbackApplied = 'true';
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#f1eee8"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#6f6f6f" font-family="sans-serif" font-size="24">이미지를 불러오지 못했습니다</text></svg>');
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
