// Keep the public product title short: Study.
(function () {
  const TITLE = "Study";
  function fixTitle() {
    document.title = TITLE;
    document.querySelectorAll('.brand').forEach((el) => {
      if (el.textContent.includes('STUDY')) el.textContent = '🎓 ' + TITLE;
    });
  }
  fixTitle();
  new MutationObserver(fixTitle).observe(document.documentElement, { childList: true, subtree: true });
})();
