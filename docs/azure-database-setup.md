# Azure MySQL migrations

Target server: `abecserver01.mysql.database.azure.com:3306`.
Target database: `abecdb01`.

## Completed verification

On November 7, 2026, `dotnet-ef 8.0.11` was installed and the initial migration
was tested against an isolated, empty local MySQL database. All 18 application
tables and the migration history were verified, and the test database was
removed afterward.

The same migration was then applied to the confirmed-empty Azure database.
Verification reported:

- Server version: `8.4.11-azure`.
- Connection: TLS 1.3, cipher `TLS_AES_256_GCM_SHA384`.
- Tables: 18 application tables plus the EF migration-history table, 19 total.
- Applied migration: `20261107031554_InitialCreate`.
- `dotnet ef migrations list` lists that migration as applied.
- The Release build has zero warnings/errors, and the model snapshot has no
  pending changes.

No local applicant/student records were copied. The password was supplied only
to the migration process through configuration, not committed to project files.

## EF tools and migration

The project uses EF Core 8.0.11. Install the matching CLI tool (the package name
is `dotnet-ef`, without a space):

```powershell
dotnet tool install --global dotnet-ef --version 8.0.11
dotnet ef --version
```

`Migrations/20261107031554_InitialCreate.cs` and the model snapshot now exist.
Do not add another `InitialCreate` migration. `Migrations/InitialCreate.sql` is
the generated SQL for review or manual application to an empty database; it is
not a script to rerun after this migration has already been applied.

`ApplicationDbContextFactory` lets EF tooling work without starting the web app,
running its startup data updates, or opening a database connection to discover
the server version. It uses the application's MySQL 8 baseline. The initial
migration's `datetime(6)` columns use matching `CURRENT_TIMESTAMP(6)` defaults.
See [MySQL's timestamp precision rules](https://dev.mysql.com/doc/refman/8.0/en/timestamp-initialization.html).

## Connection configuration

Use **two underscores** in `ConnectionStrings__DefaultConnection`. ASP.NET Core
maps those to the `ConnectionStrings:DefaultConnection` configuration key. A
single underscore does not configure this key.

The following prompts for the password and constructs a correctly escaped
connection string without putting a password in source code or EF arguments:

```powershell
$abecPassword = Read-Host 'Azure MySQL password' -AsSecureString
$abecCredential = [pscredential]::new('abecadmin01', $abecPassword)
$abecConnection = [System.Data.Common.DbConnectionStringBuilder]::new()
$abecConnection.Add('Server', 'abecserver01.mysql.database.azure.com')
$abecConnection.Add('Port', 3306)
$abecConnection.Add('User ID', $abecCredential.UserName)
$abecConnection.Add('Password', $abecCredential.GetNetworkCredential().Password)
$abecConnection.Add('Database', 'abecdb01')
$abecConnection.Add('SslMode', 'Required')
$env:ConnectionStrings__DefaultConnection = $abecConnection.get_ConnectionString()
```

This setting applies to that terminal and its child processes. Configure the
same environment variable through the production host's secret settings when
deploying the application. The local `appsettings.json` remains the local
development configuration.

The installed [EF CLI supports `--connection`](https://learn.microsoft.com/en-us/ef/core/cli/dotnet#dotnet-ef-database-update).
Using the environment variable is sufficient for this project; the factory
loads environment variables after local JSON configuration.

## Apply and inspect

An initial migration requires an empty database or an existing, correctly
baselined migration history. Do not apply it blindly over manually created
tables. MySQL DDL is not fully transactional, so review the schema first.

After setting the environment variable in the project directory:

```powershell
dotnet build 'ABEC System.csproj' --configuration Release
dotnet ef database update --project 'ABEC System.csproj' --context ApplicationDbContext --configuration Release --no-build
dotnet ef migrations list --project 'ABEC System.csproj' --context ApplicationDbContext --configuration Release --no-build
```

Release output avoids overwriting the Debug DLL held by a running local server.
The migration creates the schema and its EF history, without copying local
applicant/student data or running the web application's seed routine. The
application's startup routine creates its default courses/batch and maintains
the additional runtime integrity checks when the app starts against this DB.

In Workbench, or a MySQL 8 client in Cloud Shell, connect to the server and run:

```sql
USE abecdb01;
SHOW TABLES;
SELECT MigrationId, ProductVersion FROM __EFMigrationsHistory;
SELECT COUNT(*) AS table_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'abecdb01' AND TABLE_TYPE = 'BASE TABLE';
SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_version', 'Ssl_cipher');
```

The initial migration defines **18 application tables**, plus
`__EFMigrationsHistory`: **19 tables** in total. Its history ID is
`20261107031554_InitialCreate`.

For a MySQL 8 command-line client, this prompts for the password:

```bash
mysql --host=abecserver01.mysql.database.azure.com --port=3306 --user=abecadmin01 --password --ssl-mode=REQUIRED abecdb01
```

Azure Networking must permit the connecting client's public IP, or the client
must have the required private-network access. The initial public-port timeout
was resolved after the server's networking rules were updated.

## Deploy the website

### Correct a malformed Azure connection string

The supplied Azure log from November 7 reports
`ArgumentException: Format of the initialization string does not conform to specification starting at index 47.`
This is a connection-string syntax error before a database connection can be
attempted. It does not establish a firewall or password failure.

In **abecwebapp > Settings > Environment variables > App settings**, edit or
add the setting named exactly `ConnectionStrings__DefaultConnection`. Set its
value to this single line, replacing `YOUR_DATABASE_PASSWORD` with the actual
database password privately in Azure:

```text
Server=abecserver01.mysql.database.azure.com;Port=3306;User ID=abecadmin01;Password=YOUR_DATABASE_PASSWORD;Database=abecdb01;SslMode=Required;
```

Paste only the value: no PowerShell assignment, no `dotnet` command, and no
quotes surrounding the entire line. Every `key=value` pair must be separated
by a semicolon. If a password contains a semicolon or quotation mark, use the
connection-string builder in the configuration section to escape it correctly.
Do not paste a password into source files or the QA report.

Select **Apply** in the editor and **Apply** on the Environment variables page.
Azure restarts the app when its settings change. After it has restarted, open
`/api/health` and confirm both `ok: true` and `database: true`. Check Log stream
again if it fails; a subsequent network or authentication error would be a
separate issue. No new migration or code deployment is required for this setting
correction; the initial Azure migration is already applied.

The supplied log also shows that email is disabled and `PublicBaseUrl` uses
localhost. Before testing email delivery, configure `App__PublicBaseUrl` as
`https://abecwebapp-b7eub3hbgxdnajga.westus3-01.azurewebsites.net` and configure
SMTP separately through Azure secret settings.

References: [Azure App Service settings](https://learn.microsoft.com/en-us/azure/app-service/configure-common?tabs=portal)
and [MySqlConnector connection options](https://mysqlconnector.net/connection-options/).

After setting `ConnectionStrings__DefaultConnection` in the web app's Azure
**Environment variables > App settings**, publish the current source changes:

```powershell
git add .
git commit -m "Prepare Azure deployment and database migrations"
git push origin main
```

In Azure, open **abecwebapp > Deployment Center** and configure GitHub as the
source, repository `comighodmarklester-cloud/abecWebsite`, branch `main`. Use the
**.NET 8** runtime for this project's `net8.0` target. Azure's
[Deployment Center workflow](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions#set-up-github-actions-deployment-from-deployment-center)
can generate the GitHub Actions configuration. Wait for the deployment to succeed.

The project explicitly publishes `Views/**/*.html`, since `Program.cs` serves
those pages from the physical `Views` folder. A Release publish was checked to
ensure those HTML pages are present and local settings/private data are excluded.

Then open **Overview > Browse**, and append `/api/health` to the app's actual
Default domain URL. Confirm `ok: true` and `database: true`. If the database check
fails, inspect Log stream and the MySQL firewall: the App Service's outbound IPs
must be permitted, in addition to any developer-computer IP previously allowed.

Configure `App__PublicBaseUrl` with that public HTTPS website URL before enabling
mail delivery, so applicant links use the deployed website's address. Configure
SMTP through the host's secret settings as described in the deployment review.

The API authorization gaps documented in `deployment-secret-review.md` remain
unresolved and must be addressed before public use with real records.
