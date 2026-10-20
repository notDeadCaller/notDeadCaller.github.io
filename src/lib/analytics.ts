// Site analytics through PostHog, cookieless: no cookies or stored IDs, so no consent banner.
// PostHog counts unique visitors from a daily-rotating server-side hash. The SDK loads only after
// the page is idle, never pulls scripts from PostHog's CDN (the CSP would block them), and skips
// visitors with Do Not Track or Global Privacy Control on. Session replay, surveys and feature flags stay off.
import type { PostHog } from 'posthog-js/dist/module.slim.no-external';

/**
 * The project key is public by design: every visitor's browser sends it. An empty key turns
 * analytics off. `host` is the ingestion host for the project's region (us or eu).
 */
export const ANALYTICS = { key: 'phc_xEjHDYtRyhZZnnpPUtHiFmqzVofhhibAPnGZXVM4AEYo', host: 'https://us.i.posthog.com' };

let client: Promise<PostHog | undefined> | undefined;

export function startAnalytics() {
	if (!ANALYTICS.key || client) return;
	// the owner's own visits: open any page with ?notrack once to stop counting this browser,
	// ?track to start again
	try {
		const params = new URLSearchParams(location.search);
		if (params.has('notrack')) localStorage.setItem('analytics:off', '1');
		if (params.has('track')) localStorage.removeItem('analytics:off');
		if (localStorage.getItem('analytics:off')) return;
	} catch {}
	// Global Privacy Control counts as an opt-out too
	if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
	client = new Promise((resolve) => {
		const load = async () => {
			try {
				// the slim core only: PostHog's autocapture and router extensions come as one 160KB file,
				// so page changes and clicks are recorded by the few lines below instead
				const { default: posthog } = await import('posthog-js/dist/module.slim.no-external');
				posthog.init(ANALYTICS.key, {
					api_host: ANALYTICS.host,
					defaults: '2026-08-30',
					cookieless_mode: 'always',
					person_profiles: 'never',
					respect_dnt: true,
					capture_pageview: true,
					capture_pageleave: true,
					disable_session_recording: true,
					disable_surveys: true,
					advanced_disable_flags: true,
					disable_external_dependency_loading: true,
					capture_performance: false,
					capture_dead_clicks: false,
				});
				// the SDK already drops browsers that declare automation (navigator.webdriver) and known bots
				posthog.register({
					// cookieless mode drops the IP before PostHog's country lookup, so the browser's own
					// timezone and language stand in for a rough region
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					language: navigator.language,
				});
				// the client router swaps pages in place; the first page was counted by init
				document.addEventListener('astro:page-load', () => posthog.capture('$pageview'));
				document.addEventListener('click', (event) => {
					const el = event.target instanceof Element ? event.target.closest('a, button, summary') : null;
					if (!el) return;
					const href = el instanceof HTMLAnchorElement ? el.href : undefined;
					posthog.capture('click', {
						kind: el.tagName.toLowerCase(),
						text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
						href,
						external: href ? new URL(href).host !== location.host : undefined,
					});
				});
				resolve(posthog);
			} catch {
				resolve(undefined);
			}
		};
		if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 4000 });
		else setTimeout(load, 2000);
	});
}

/** A custom event; does nothing when analytics is off. */
export function track(event: string, properties?: Record<string, unknown>) {
	client?.then((posthog) => posthog?.capture(event, properties));
}
