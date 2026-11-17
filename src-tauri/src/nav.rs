//! Navigation policy: which URLs stay inside the app and which are handed to
//! the system.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;
use url::Url;

/// Third-party hosts the site embeds in iframes (taken from its CSP
/// `frame-src`). On Android the navigation callback also fires for subframes
/// without saying which frame it is, so these must be allowed or the embeds
/// break and spawn the browser. Top-frame links to them are still sent to the
/// browser by the click interception in inject/core.js.
const EMBED_HOSTS: &[&str] = &["google.com", "google.de", "gstatic.com", "rcdb.com", "paypal.com"];

/// Minimum gap between two external launches, so a misbehaving script on the
/// site can't spam the system browser / dialer.
const EXTERNAL_OPEN_COOLDOWN: Duration = Duration::from_millis(1000);
static LAST_EXTERNAL_OPEN: Mutex<Option<Instant>> = Mutex::new(None);

/// The site's domain. Language subdomains (de., fr., …) and the CDN count as
/// internal too. The start URL itself lives in `src/index.html`.
const SITE_DOMAIN: &str = "coaster-count.com";

fn host_in(url: &Url, domain: &str) -> bool {
    url.host_str().is_some_and(|h| {
        let h = h.to_ascii_lowercase();
        h == domain || h.ends_with(&format!(".{domain}"))
    })
}

/// True for coaster-count.com and any of its subdomains.
pub fn is_site(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http") && host_in(url, SITE_DOMAIN)
}

fn is_embed(url: &Url) -> bool {
    url.scheme() == "https" && EMBED_HOSTS.iter().any(|d| host_in(url, d))
}

/// URLs the webview should load itself: the site, the bundled offline page
/// (tauri://localhost on desktop, http(s)://tauri.localhost on Android/Windows)
/// and inert in-page schemes.
pub fn stays_in_app(url: &Url) -> bool {
    if is_site(url) || is_embed(url) {
        return true;
    }
    match url.scheme() {
        "about" | "data" | "blob" | "javascript" | "tauri" | "asset" => true,
        "http" | "https" => url.host_str() == Some("tauri.localhost"),
        _ => false,
    }
}

/// Schemes we're willing to hand to the OS.
pub fn is_openable_externally(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto" | "tel" | "geo" | "sms")
}

pub fn open_external<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    {
        let mut last = LAST_EXTERNAL_OPEN.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        if last.is_some_and(|t| now.duration_since(t) < EXTERNAL_OPEN_COOLDOWN) {
            log::warn!("throttled external open of {url}");
            return;
        }
        *last = Some(now);
    }
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        log::warn!("failed to open {url} externally: {e}");
    }
}

/// Navigation guard used by the main webview. Returns `true` to allow the
/// webview to load `url`.
pub fn on_navigation<R: Runtime>(app: &AppHandle<R>, url: &Url) -> bool {
    if stays_in_app(url) {
        return true;
    }
    if is_openable_externally(url) {
        open_external(app, url);
    } else {
        log::info!("blocked navigation to {url}");
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn site_hosts() {
        assert!(is_site(&u("https://coaster-count.com/")));
        assert!(is_site(&u("https://de.coaster-count.com/catalogue")));
        assert!(is_site(&u("https://cdn.coaster-count.com/x.css")));
        assert!(!is_site(&u("https://evilcoaster-count.com/")));
        assert!(!is_site(&u("https://coaster-count.com.evil.io/")));
        assert!(!is_site(&u("ftp://coaster-count.com/")));
    }

    #[test]
    fn routing() {
        assert!(stays_in_app(&u("https://en.coaster-count.com/")));
        assert!(stays_in_app(&u("http://tauri.localhost/index.html")));
        assert!(stays_in_app(&u("about:blank")));
        assert!(stays_in_app(&u("https://www.google.com/maps/embed?pb=1")));
        assert!(stays_in_app(&u("https://rcdb.com/123.htm")));
        assert!(!stays_in_app(&u("http://rcdb.com/123.htm")));
        assert!(!stays_in_app(&u("https://notrcdb.com/")));
        assert!(!stays_in_app(&u("https://www.instagram.com/coaster_count/")));
        assert!(!stays_in_app(&u("intent://foo#Intent;end")));
        assert!(is_openable_externally(&u("https://www.paypal.com/")));
        assert!(is_openable_externally(&u("mailto:a@b.c")));
        assert!(!is_openable_externally(&u("intent://foo#Intent;end")));
        assert!(!is_openable_externally(&u("file:///etc/passwd")));
    }
}
