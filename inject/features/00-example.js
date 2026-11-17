// Example feature — a template for new ones. Disabled by default.
//
// Each file in inject/features/ runs inside `function (CCW) { … }` with its own
// try/catch, after core.js and before the DOM is parsed. Register features
// with CCW.feature(); their callback runs once the DOM is ready.
//
// Toggle at runtime (e.g. from a future in-app settings screen):
//   CCW.setFeatureEnabled('example', true); location.reload();

CCW.feature(
  'example',
  function (CCW) {
    // DOM is ready here. Example: show the app version at the bottom of the page.
    CCW.invoke('app_info')
      .then(function (info) {
        var tag = document.createElement('div');
        tag.className = 'ccw-version';
        tag.textContent = info.name + ' v' + info.version;
        tag.style.cssText = 'opacity:.6;font-size:12px;text-align:center;padding:8px';
        document.body.appendChild(tag);
      })
      .catch(function (e) {
        console.warn('[CCW] app_info failed', e);
      });
  },
  { defaultEnabled: false }
);
