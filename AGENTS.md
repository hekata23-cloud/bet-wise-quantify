<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Odds analysis lives in pure `src/lib/radar-analitika.ts`; it may only tighten manual rule verdicts, never loosen them — keeps user rules authoritative.
- API odds parsing lives in `src/lib/kvote-servis.server.ts`; exact scores come from one bookmaker, two-sided markets only when both sides exist at one bookmaker — avoids mixed/invalid signals.
- No service worker: public/sw.js is a self-unregistering kill-switch — an old cached SW served the pre-merge app on the published site.
- Zlatni tip is a prebuilt bundle served from public/zlatni-tip/ and shown in an iframe on /zlatni-tip — its global CSS would otherwise break the main app.

- Zlatni tip is a native React page (src/routes/zlatni-tip.tsx + src/lib/zlatni-engine.ts); all API-Football calls go through src/lib/zlatni-guard.ts — why: the old prebuilt iframe could not be fixed and unguarded calls risk account suspension.
- Basketball (/kosarka) uses API-Basketball via src/lib/kosarka.functions.ts and its own guard src/lib/kosarka-guard.ts — separate daily quota from API-Football.
