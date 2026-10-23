// Crew code (QR) links. Pure functions, CommonJS so test/joinLink.test.js
// can run them in plain Node.
//
// A crew code link is {appUrl}/j/{token} (what the QR holds) or
// {scheme}://j/{token} (the "Open in the app" button on the /j page).
// The token is a secret: never log it, never put it in Sentry.

// Same rule as joinCompanySchema.token in the functions package.
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

// joinLinks = extra.joinLinks from app.config.js ({ appUrl, scheme }),
// null on builds that don't take crew codes. Returns the token or null.
function parseJoinUrl(url, joinLinks) {
  if (typeof url !== "string" || !joinLinks) return null;
  if (typeof joinLinks.appUrl !== "string" || typeof joinLinks.scheme !== "string" || !joinLinks.scheme) return null;
  const raw = url.trim();
  if (raw.length > 512) return null;

  let path = null;
  const httpsPrefix = joinLinks.appUrl.replace(/\/+$/, "") + "/j/";
  const schemePrefix = joinLinks.scheme + "://j/";
  if (raw.startsWith(httpsPrefix)) path = raw.slice(httpsPrefix.length);
  else if (raw.startsWith(schemePrefix)) path = raw.slice(schemePrefix.length);
  if (path === null) return null;

  // Drop a trailing slash, query or fragment; the token itself is the
  // only thing we keep.
  const token = path.split(/[?#]/)[0].replace(/\/+$/, "");
  return TOKEN_RE.test(token) ? token : null;
}

// Blanks any crew code token in a string (Sentry breadcrumbs/events).
function redactJoinTokens(text) {
  if (typeof text !== "string") return text;
  return text.replace(/(\/j\/)[A-Za-z0-9_-]{16,}/g, "$1[redacted]");
}

module.exports = { TOKEN_RE, parseJoinUrl, redactJoinTokens };
