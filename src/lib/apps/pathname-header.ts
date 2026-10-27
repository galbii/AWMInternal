// The header src/middleware.ts stamps the request path onto, and requireApp()
// reads it back from. Its own module so the (authed) layouts never import the
// middleware file itself: pulled into a page bundle, the middleware's
// `export const config` is read as a deprecated PAGE config and Next warns on
// every compile.
export const PATHNAME_HEADER = 'x-awm-pathname'
