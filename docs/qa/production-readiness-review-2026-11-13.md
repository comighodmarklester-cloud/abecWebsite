# Production configuration recheck — November 13, 2026

This review inspected source, local configuration presence (without recording credentials), deployment workflow, and three unauthenticated public GET requests. No application code, Azure settings, production records, framework/provider versions, or deployment was changed. Local configuration and process environment are not evidence of Azure's private environment settings.

## Configuration already present

- `Program.cs` loads environment variables after local development overrides. Names such as `ConnectionStrings__DefaultConnection`, `App__PublicBaseUrl`, and `Email__Password` are supported.
- `Options/AppOptions.cs` contains the confirmed production HTTPS origin. `PublicAppUrl` applies it as the production fallback for missing/loopback values and validates public HTTPS origins. It remains preferable to set the production origin explicitly in Azure.
- Local `appsettings.json` is development configuration: local database, TLS disabled for that local connection, localhost app URL, and wildcard AllowedHosts. `smtp.local.json` contains a configured SMTP password. No secret values were copied into this review. Do not copy those development values into production.
- The inspected application-specific variables were absent from this tool process's environment. This does not establish whether Azure has them.
- The actual settings files are ignored and untracked, and the project excludes developer settings and App_Data from publish output. Production database/mail secrets must be supplied separately by the host.
- Correction to the earlier chat assessment: `EmailConfigService.SaveSettingsAsync` already rejects changes outside Development and directs administrators to deployment secrets. It does not report a successful production file save. A clearer read-only presentation in the UI would be an optional usability improvement.

## Public observations

The production origin was checked with ordinary certificate-validated requests:

| Request | Observed result |
| --- | --- |
| HTTPS `/api/health` | HTTP 200, `ok=true`, `database=true` |
| HTTPS `/` | Landing page reachable over HTTPS |
| HTTP `/` | Redirected to HTTPS; final page HTTP 200 |

The health and landing responses did not contain HSTS, X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, or Referrer-Policy. Health also lacked Cache-Control. Current `RequestSecurityMiddleware` sets those security headers and no-store for APIs. The public result therefore does not match the current source's expected behavior. This suggests an older/different deployed build, a middleware bypass, or hosting/proxy header modification; these GET checks cannot identify which. Verify the deployed commit/artifact and ingress configuration. HTTPS redirection is working for the tested default hostname; that alone does not verify every hostname or Azure setting.

Database connectivity does not prove schema readiness, effective connection TLS mode, least-privilege credentials, or SMTP configuration. No authenticated API, applicant record, bearer-token URL, or mail delivery was exercised against production.

## Remaining work

1. Verify the deployed commit/artifact against the current tested source and recheck security headers after deployment. Many current security changes remain modified/untracked in the local workspace; they cannot be assumed present in the deployed artifact.
2. Add a readiness endpoint returning HTTP 503 for unavailable database or incomplete required schema. Current `/api/health` always returns HTTP 200 and `ok=true`, with connectivity only in its separate `database` flag. Startup catches schema/seed errors and continues, so connectivity alone can miss an incomplete upgrade.
3. Add staging and a production release gate to the repository workflow. It currently deploys directly to Production on main pushes and has no job-level GitHub environment. External branch/ruleset controls were not accessible and may provide additional protection. Staging needs its own database, private storage, and controlled mail recipients because startup and the expiration worker can write data.
4. Verify writable persistent private storage and backup/restore. Applicant and course documents currently reside under ContentRootPath/App_Data; run-from-package deployments require a separate writable location. Verify persistence across restart and release before relying on this path.
5. Reconcile historical file delivery. The November 7 import report records 32 document references, 27 packaged files not yet uploaded at that time, and five missing local registration files. These are historical observations, not a fresh Azure file inventory. Confirm transfer completion and recover missing originals where possible; preserve unresolved missing-file records.
6. In Azure, verify Production environment, exact production connection-string key, verified database TLS, public app URL, AllowedHosts, enabled TLS SMTP/sender credentials, and development email copies disabled. Do not paste secrets into chat/source.
7. Verify Always On or an equivalent external scheduling arrangement for timely execution of the in-process one-minute expiration worker. Link validation must still enforce the original 48-hour deadline regardless of worker execution.
8. Verify persistent Data Protection keys, including restart, instance, and deployment-slot behavior. There is no explicit application-level key persistence configuration; Azure's hosting defaults may supply it. Absence of explicit code is not proof that keys are ephemeral. Test authentication and form tokens under the intended topology.
9. Validate production backups/restore, monitoring/alerts, rollback compatibility with startup schema operations, and actual email workflows using dedicated test identities before exposing the new release broadly.

## Access limits and references

No authenticated Azure connector/CLI was available. The Azure environment variable values, App Service plan, Always On, package mounting, storage mounts, Data Protection key location, backups, GitHub environment protections, effective database TLS mode, and live SMTP delivery remain unverified.

- [Azure App Service environment configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-common)
- [ASP.NET Core hosting on Azure, including Data Protection and slots](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/azure-apps/?view=aspnetcore-8.0)
- [Current security remediation evidence](snyk-code-security-fixes-2026-11-13.md)
- [Historical import and missing-file evidence](local-to-azure-import-review.md)

Earlier November 7 deployment/import documents describe authorization gaps that have since been addressed in the local security remediation. They are historical evidence, not proof that those gaps remain in current source or that the fixes have reached production.
