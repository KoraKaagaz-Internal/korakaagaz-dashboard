type Router = { push: (href: string) => void; replace: (href: string) => void };

/**
 * Client-side navigation after a server action, with a safety net: Next.js occasionally drops a
 * router.push that follows an action which revalidated the page. If we're not there after a few
 * seconds, load the page normally.
 */
export function navigate(router: Router, href: string, opts: { replace?: boolean; wait?: number } = {}) {
  const target = new URL(href, window.location.href);
  if (opts.replace) router.replace(href);
  else router.push(href);
  window.setTimeout(() => {
    if (window.location.pathname + window.location.search !== target.pathname + target.search) window.location.assign(target.href);
  }, opts.wait ?? 4000);
}
