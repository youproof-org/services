# DNS & TLS reference

DNS for both zones is Cloudflare-authoritative and Terraform-managed. This is
the ongoing reference for the record set, the redirects, and the TLS/HTTPS
posture across both zones.

Cloudflare is authoritative for a zone once the domain's nameservers point at
the two Cloudflare nameservers assigned when the zone root is applied
(`terraform output name_servers`). That registrar delegation is a manual,
one-time step per domain; after it propagates, Cloudflare resolves the apex
**and all subdomains**.

## `youproof.hu` zone

DNS records are recreated in Cloudflare as `cloudflare_dns_record` resources in
[`worker/dns_hu.tf`](terraform-roots-and-layout.md#worker-hu), derived per
environment from that environment's variables. Production and staging create
disjoint record sets, so the two worker states never fight over a record.

| Name | Type | Content | Proxied | Created by |
| --- | --- | --- | --- | --- |
| `youproof.hu` | A | placeholder `192.0.2.1` | **Yes** (orange) | worker (production) |
| `www.youproof.hu` | A | placeholder `192.0.2.1` | **Yes** (orange) | worker (production) |
| `legacy.youproof.hu` | A | Rackhost IP (`RACKHOST_SERVER_IP`) | **No** (gray) | worker (production) |
| `staging.youproof.hu` | A | placeholder `192.0.2.1` | **Yes** (orange) | worker (staging) |
| `www.staging.youproof.hu` | A | placeholder `192.0.2.1` | **Yes** (orange) | worker (staging) |
| `legacy.staging.youproof.hu` | A | Rackhost IP | **No** (gray) | worker (staging) |

- **Proxied (orange) records** use an unroutable RFC 5737 placeholder IP
  (`192.0.2.1`): Cloudflare intercepts matching traffic at the edge (the Worker
  route, or the www redirect rule) before any origin is contacted, so the
  placeholder is never reached.
- **`legacy.*` records are gray-cloud** (not proxied) so they resolve directly
  to the legacy Rackhost host — this is the path the Worker's outbound
  `fetch()` uses. They are dropped automatically when `LEGACY_PROXY_HOST` is
  cleared (see [410 mode](migration-worker.md#post-migration-410-gone-mode)).
- **`www.<domain>` → apex 301** is a single generic dynamic-redirect rule in the
  `zone/` root ([`zone/redirects.tf`](terraform-roots-and-layout.md#zone))
  that matches any host starting with `www.` and redirects to the same host
  without the prefix, over https, preserving path & query
  (`concat("https://", substring(http.host, 4), http.request.uri.path)` — no
  regex, so it works on all plans, and no hardcoded domains). It lives in the
  zone root because a dynamic-redirect ruleset is a per-zone singleton, and is
  dormant for `www.*` hosts that have no record. The `www.<domain>` A record
  itself lives in the worker root, created per environment.
- **Intentionally dropped:** `www.legacy.*` records — nothing links to them.
- **No-mail declaration** (both environments,
  [`dns_hu.tf`](terraform-roots-and-layout.md#worker-hu)): `youproof.hu` is not
  an email domain, so rather than leaving SPF/DMARC/MX unset (which invites
  spoofing) the worker root publishes explicit records — SPF `v=spf1 -all` (no
  authorized senders), DMARC `p=reject; sp=reject` with strict alignment, and a
  **null MX** (`.`, RFC 7505) so the domain accepts no mail.

<a id="youproof-org-zone"></a>
## `youproof.org` zone

There is **no Worker** on this zone; DNS points directly at the CDN. The site
host record is **not** a hand-written `cloudflare_dns_record` — it is created
**automatically by the `cloudflare_r2_custom_domain` resource** in the
[`website/`](terraform-roots-and-layout.md#website) root: attaching the content
bucket to a custom domain provisions the proxied CNAME and the edge certificate.
Creating our own record for the same host would collide with it (see
`website/dns.tf` for the commented reference record).

| Name | Type | Managed by | Notes |
| --- | --- | --- | --- |
| `youproof.org` | CNAME | R2 custom domain (production `website/`) | proxied → content bucket |
| `staging.youproof.org` | CNAME | R2 custom domain (staging `website/`) | proxied → content bucket |
| `www.youproof.org` / `www.staging.youproof.org` | A | `website/dns.tf` (per env) | proxied placeholder (RFC 5737) so the zone www→apex rule is reachable |
| `_dmarc.staging.youproof.org` | TXT | `website/dns.tf` (staging only) | `p=reject; sp=reject` — belt-and-braces over the apex `sp=reject` |
| `youproof.org` | TXT | `website/dns.tf` (production only) | `google-site-verification=…` — Search Console / GA4 ([analytics & consent](analytics-and-consent.md)) |
| `<token>.youproof.org` | CNAME | `website/dns.tf` (production only) | → `verify.bing.com`, Bing Webmaster Tools. **Unproxied** — a proxied CNAME resolves to Cloudflare's IPs and silently breaks verification |
| `youproof.org` | MX | **manual — not Terraform-managed** | `mx03.rackhost.hu` (10), `alt2-mx.rackhostmx.com` (20) |
| `youproof.org` | TXT | **manual — not Terraform-managed** | SPF: `v=spf1 mx include:_cspf.rackhost.hu include:spf.brevo.com ~all` |
| `youproof.org` | TXT | **manual — not Terraform-managed** | `brevo-code:…` — Brevo sender-domain verification |
| Brevo DKIM | TXT | **manual — not Terraform-managed** | added via the Brevo dashboard ([Brevo setup](brevo-setup.md)) |

The manual rows are deliberate, not an oversight. Mail-critical records (MX, SPF,
DKIM) are left in the dashboard because a mistake there breaks mail delivery, which
deserves its own focused change rather than riding along with unrelated work. They
are listed here so the drift between the dashboard and Terraform is visible instead
of merely unrecorded.

**Apex TXT coexists with the proxied apex CNAME.** The constraint noted for
`staging.youproof.org` in `website/dns.tf` — Cloudflare refusing TXT/MX alongside a
proxied CNAME — applies to subdomains, not to the flattened apex. `youproof.org`
carries three TXT records today next to the R2 custom domain's proxied CNAME.

The two verification records predate Terraform and are **adopted by import**
(`website/imports.tf`) rather than created. A correct production plan shows no create
and no replace, and leaves `content` untouched — that is the attribute whose change
would break verification. An in-place update of `ttl` or `comment` is expected and
harmless: the hand-made records predate the declarations, and in provider v5 both are
managed attributes that do not affect resolution. `imports.tf` is transient — delete
it, the `*_record_id` variables, and the matching lifecycle preconditions once the
adoption has applied.

The www→apex 301 rule for the `.org` zone (in `zone/redirects.tf`, alongside the
`.hu` rule) is the same generic rule as on the `.hu` zone; it is dormant unless a
`www.*` record exists. The R2 custom domain does not create a `www.*` record — the
`www` A record above exists precisely to make the rule reachable.

See [CDN & R2](cdn-and-r2.md) for how the R2 custom domain, the
`.html`-stripping transform rule, and cache behave on this zone.

## HTTPS & HSTS (both zones)

Both zones apply the same posture in the shared `zone/` root (both zones'
settings live in `settings.tf`):

- **HTTP → HTTPS** is forced zone-wide by the **Always Use HTTPS** setting
  (`always_use_https`): any `http://` request to a proxied host gets a 301 to
  `https://` at the edge, before any Worker, transform, or cache rule runs. So
  `http://youproof.hu` → `https://youproof.hu`, `http://www.youproof.org` →
  `https://youproof.org` (upgraded then folded to apex), and the same for the
  staging hosts.
- **HSTS** (`security_header` / `Strict-Transport-Security`) is enabled with
  `max-age` 1 year, **`includeSubDomains` off**, and preload off. Apex-scoping
  is deliberate: with `includeSubDomains` on, the `www.staging.*` cert gap (see
  below) would become a hard, un-bypassable block for every subdomain. Turn on
  `includeSubDomains`/preload only once every subdomain has a valid cert.

### TLS coverage notes

- **`legacy.*` (`.hu`):** since `legacy.*` is gray-cloud, the Worker reaches it
  over the public internet by HTTPS, so the legacy origin must serve a valid TLS
  certificate for `legacy.youproof.hu` / `legacy.staging.youproof.hu`.
- **`www.staging.*` (both zones):** Cloudflare's free Universal SSL certificate
  covers the apex and `*.<apex>` (one label) — so `youproof.hu`,
  `www.youproof.hu`, `staging.youproof.hu` (and the `.org` equivalents) are
  fine, but `www.staging.youproof.hu` / `www.staging.youproof.org` are **two**
  labels deep and are **not** covered. Their HTTPS handshake fails (so the
  www→staging redirect can't run) unless **Advanced Certificate Manager / Total
  TLS** (paid) provisions a `*.staging.<apex>` cert. Options: enable ACM, drop
  the `www.staging` record, or accept that only `www.<apex>` has the redirect.
