# Deployment file and secret review

Reviewed on November 7, 2026. This review covers repository files, Git exclusions,
and publish inputs. It is not a complete application security audit.

## Findings and changes

| Finding | Protection added |
| --- | --- |
| `appsettings.json` contains a nonempty database password. | Ignore actual `appsettings` files; provide `appsettings.json.example` without credentials; exclude local settings from publish output. |
| `smtp.local.json` contains an SMTP password. | Keep the file ignored and exclude it from publish output. |
| `App_Data` contains applicant uploads, email copies, recovery XML, logs, and copied binaries/configuration. | Ignore the entire directory and exclude it from default project items, including publish inputs. |
| Build output contains copies of local configuration. | Ignore build/publish output and exclude nested build directories from project inputs. |
| IDE settings and user project files are present. | Ignore machine-specific state and user settings. |

The ignore rules also cover common secret stores, private keys, certificates with
private keys, deployment profiles, database backups, local databases, and logs.
Source code, shared `web.config`, `Properties/launchSettings.json`, sample HTTP
requests, static assets, and plain SQL migration scripts remain eligible for Git.
Example files must be reviewed before committing; their names do not ensure they
are secret-free.

The existing local configuration and private data were preserved. No password
values are recorded in this report.

## Configuration for a fresh checkout

If `appsettings.json` does not already exist, copy `appsettings.json.example` to
`appsettings.json`. Configure the database using development user secrets or your
local ignored configuration. Configure SMTP through development user secrets,
environment variables, or the ignored `smtp.local.json` file. The project already
has a `UserSecretsId` and loads user secrets in Development.

Do not overwrite an existing local configuration with the example.

## Production configuration

Publish output deliberately excludes the developer's `appsettings.json`,
`appsettings.*.json`, `smtp.local.json`, and existing `App_Data`. Supply production
settings using your hosting platform's environment/secret configuration, or
provision a production settings file separately on the server. User secrets are
loaded only in Development and are not the production configuration mechanism.

Set these environment variables through the host:

| Variable | Required value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__DefaultConnection` | Production database connection string, using a dedicated application account and the host's verified TLS settings. |
| `App__PublicBaseUrl` | The public HTTPS URL used in applicant email links. |
| `AllowedHosts` | Your production hostname(s). |
| `Email__Enabled` | `true` if production mail should be sent. |
| `Email__Host`, `Email__Port`, `Email__UseSsl` | Your SMTP settings. |
| `Email__Username`, `Email__Password` | Production SMTP credentials supplied by the secret store. |
| `Email__FromAddress`, `Email__FromName` | Your sender identity. |

Provision and protect the writable `App_Data` directory on the server separately.
Back it up securely; it contains private documents and email troubleshooting
copies. Deploy into a fresh release directory: publishing does not remove secrets
or private data left in an older deployment folder. Deploy the publish output,
not the entire source directory.

## Required follow-up before deployment

- Rotate the database and SMTP passwords if they have been committed, shared,
  or included in an accessible artifact. Check old build and deployment copies.
- Check the actual Git repository with `git ls-files` and `git check-ignore -v`.
  The initial review preceded Git initialization. A later check found no tracked
  files matching the current ignore rules. Commit history and other copies still
  need review. Ignore rules do not untrack files or erase history; if secrets
  entered history, rotate them and arrange appropriate history cleanup.
- Fix server-side authorization before exposing the application publicly.
  `Controllers/ApplicantController.cs` exposes applicant lists/details without an
  authorization attribute. `Controllers/StudentApiController.cs` exposes profile
  reads and updates using a supplied student ID without an authorization
  attribute. `Program.cs` has no fallback authorization policy. The existing
  `StudentAccountController` authorization does not protect these other routes.
  These are application defects that `.gitignore` cannot fix; see the existing
  `docs/system-audit/08-findings-and-risk-register.md` for further audit context.
- Review duplicate contact numbers within a batch in the existing database.
  During the development-server restart, the schema upgrade stopped at its
  duplicate-contact integrity check. The server starts and can connect to MySQL,
  but the remaining schema upgrade cannot complete until those data conflicts
  are resolved. No duplicate records were merged, deleted, or reassigned.

## Initial file-exclusion verification

- Git's actual ignore matcher passed checks for 53 sensitive/generated paths and
  24 source/example paths, using temporary Git metadata without initializing or
  changing this workspace's repository state.
- Both configuration example files parse as JSON.
- `dotnet publish "ABEC System.csproj" --no-restore --configuration Release
  --output obj/deployment-check/publish --nologo` succeeded.
- Inspected all 287 published files: no local `appsettings` JSON,
  `smtp.local.json`, `App_Data`, or nested build/IDE directories were present.
- Searched every published file, including binaries, for the existing database
  and SMTP password values; neither value was present.
- This initial build reported nullable-reference, interpolated-SQL, and MailKit
  warnings, which were addressed in the follow-up below.

## Build diagnostic fixes

The follow-up fixes on November 7, 2026 address the reproduced build diagnostics:

- `ScheduleService` supplies non-null room, trainer, and status values to conflict
  checks, and its active-status guard explicitly accepts absent status values.
- The schema add/drop helpers use the database provider to delimit and escape
  table/column names. Schema definitions remain trusted, code-defined SQL;
  identifiers cannot be represented by SQL value parameters.
- MailKit was updated from 4.9.0 to 4.16.0, the patched version identified in the
  [maintainer's STARTTLS advisory](https://github.com/jstedfast/MailKit/security/advisories/GHSA-9j88-vvj5-vhgr).
- Auditing transitive dependencies identified further package warnings.
  MySqlConnector is now pinned to 2.6.1, the version listed in the
  [maintainer's TLS advisory](https://github.com/mysql-net/MySqlConnector/security/advisories/GHSA-473q-m89c-ghf8).
  `System.Security.Cryptography.Pkcs` is pinned to 8.0.2, addressing Microsoft's
  [CVE-2026-70162](https://github.com/dotnet/announcements/issues/454) and
  [CVE-2026-84008](https://github.com/dotnet/announcements/issues/468) advisories.
  `NuGetAuditMode=all` keeps transitive dependency auditing enabled.

Follow-up verification:

- Dependency restore with transitive auditing completed without warnings.
- The Debug build passed with `--warnaserror`: zero errors and zero warnings.
- The Release publish passed with `--warnaserror`, to `obj/build-fix-publish`.
  All 287 artifact files were checked; local settings, `App_Data`, and the
  existing database/SMTP password values were absent.
- The existing BatchVerification integration checks all passed using an isolated
  temporary database cloned from schema only. The test database and its files
  were removed afterward; existing records were preserved.
- The local development server was restarted at `http://localhost:5188`.
  `/api/health` reports `ok=true` and `database=true`. The duplicate-contact
  startup warning described above remains actionable.

The initial Debug build also failed because a running development server held
`bin/Debug/net8.0/ABEC System.dll` open. Stopping that project's process released
the lock and allowed the build to finish. Stop the running app before rebuilding
the same Debug output directory; restart it after the build.

Git exclusions prevent accidental additions of matching untracked files. They
do not prevent forced Git additions, server access to files, or arbitrary manual
copies into deployment artifacts. Review the final artifact and hosting access
controls before release.
