// Nearby: make location requests actually finish.
//
// The site calls navigator.geolocation.getCurrentPosition() with no options:
// low accuracy (network location only) and no timeout. Where the phone has
// no network location (location mode "GPS only", some phones and emulators)
// that request never answers and Nearby stays blank forever.
//
// Here, every call gets:
//   1. a quick low-accuracy attempt that accepts a fix up to 5 min old;
//   2. if that fails or times out, a GPS (high-accuracy) attempt;
//   3. if that fails too, the site's error callback, so it can say so.
// A denied permission goes straight to the error callback.
//
// Runs at document start (top level, not inside CCW.feature) so it's in
// place before the site's scripts ask.

(function () {
  var geo = navigator.geolocation;
  if (!geo || geo.__ccwPatched) return;
  var original = geo.getCurrentPosition.bind(geo);
  var PERMISSION_DENIED = 1;

  geo.getCurrentPosition = function (success, error, options) {
    var site = options || {};
    var quick = {
      enableHighAccuracy: !!site.enableHighAccuracy,
      timeout: Math.min(site.timeout || 8000, 8000),
      maximumAge: Math.max(site.maximumAge || 0, 5 * 60 * 1000),
    };
    var precise = {
      enableHighAccuracy: true,
      timeout: site.timeout || 20000,
      maximumAge: site.maximumAge || 0,
    };
    original(success, function (e) {
      if (e && e.code === PERMISSION_DENIED) {
        if (error) error(e);
        return;
      }
      CCW.log('location: quick attempt failed (' + (e && e.message) + '), trying GPS');
      original(success, function (e2) {
        if (error) error(e2);
      }, precise);
    }, quick);
  };
  geo.__ccwPatched = true;
})();
