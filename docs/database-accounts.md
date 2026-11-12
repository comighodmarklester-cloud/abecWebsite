# View the Azure tables and add website logins

## Provisioned QA accounts - November 7, 2026

At the user's explicit authorization, the Azure database `abecdb01` now contains
these dedicated synthetic test accounts:

| Role | Username | Login |
|---|---|---|
| Admin | `qa_admin_fe0a17` | Admin Login page, username and password |
| Student | `qa_student_fe0a17` | Student Login page, select **Use username & password** |

Passwords are saved only in the local, gitignored file
`App_Data/qa-accounts/credentials.local.json`, with Windows file permissions
restricted to the current user and SYSTEM. They are not recorded in this guide.
The database stores BCrypt password hashes. No redeployment is required.

The Admin has full Admin privileges. The active Student is **QA TestStudent**,
linked to synthetic applicant ID 1, student ID 1, batch ID 1, and course ID 1
(Computer Systems Servicing NC II). Admin ID is 1. Its email uses
`example.invalid`, and no email was sent. The synthetic confirmed applicant
occupies one slot in the existing active batch. No existing accounts or records
were overwritten. Remove these test accounts through a reviewed cleanup after QA.

Both logins were verified against the deployed API. Student authenticated account
access, logout, denial after logout, and rejection of incorrect passwords also
passed. Browser interaction remains unverified. Results are saved locally in
`App_Data/qa-accounts/login-verification.json`.

## View the tables

In MySQL Workbench, add a Standard TCP/IP connection with:

| Setting | Value |
|---|---|
| Hostname | `abecserver01.mysql.database.azure.com` |
| Port | `3306` |
| Username | `abecadmin01` |
| Default schema | `abecdb01` |
| SSL | Require TLS/SSL |

Enter the database password privately when prompted. Test the connection and
open it. Expand **Schemas > abecdb01 > Tables**, or run:

```sql
USE abecdb01;
SHOW TABLES;
DESCRIBE admins;
DESCRIBE students;
DESCRIBE student_login_credentials;
SELECT admin_id, username, created_at FROM admins;
SELECT student_id, account_status FROM students;
SELECT student_id, username, password_login_enabled FROM student_login_credentials;
```

These queries avoid displaying password hashes and student PINs. The database
administrator login is separate from the website's Admin and Student accounts.

The same SQL works in the MySQL client in Azure Cloud Shell (Bash), if the client
is installed and the server networking allows that Cloud Shell session:

```bash
mysql --host=abecserver01.mysql.database.azure.com --port=3306 --user=abecadmin01 --password --ssl-mode=REQUIRED abecdb01
```

`--password` prompts; do not put the password on the command line. Allowing the
web app or your computer does not automatically allow Cloud Shell's network.

Reference: [Microsoft's Workbench connection guide](https://learn.microsoft.com/en-us/azure/mysql/flexible-server/connect-workbench).

## Add the first website Admin

The application does not seed a default admin or provide a public create-admin
screen. First check the existing usernames with the SELECT above.

In the IDE terminal, from the repository directory, run:

```powershell
dotnet run --project scripts/PasswordHash/PasswordHash.csproj
```

Choose a unique website password (different from the database password). Input
is hidden and confirmation is required. The helper prints a BCrypt hash only;
it does not connect to the database, store the password, or create an account.

In Workbench connected to `abecdb01`, replace `PASTE_BCRYPT_HASH_HERE` below with
the entire printed hash (beginning `$2`). Choose a distinct username such as
`qa_admin`. Run this only when you intend to create that Admin account:

```sql
INSERT INTO admins (username, password, created_at)
VALUES ('qa_admin', 'PASTE_BCRYPT_HASH_HERE', CURRENT_TIMESTAMP(6));
```

Do not insert the literal placeholder or a plain-text password. Do not overwrite
an existing admin to create a test account. This grants the full Admin role;
there is no separate restricted QA role in the current application.

Log in at `/Views/Home/AdminLoginPage.html` using the selected username and the
original password you entered into the helper, not the printed hash. No app
redeployment is needed to insert an account in the existing database.

## Add a Student login

Use the student onboarding flow rather than inserting an unrelated credential
row. A student must reference an applicant and a batch:

1. Complete the enrollment and slot-confirmation flow for an applicant. For QA,
   use synthetic details and an email inbox you control; approval can send email.
2. In Admin **Account Activation**, activate that student and obtain the
   **Activation Notice**, which contains their PIN.
3. Open `/Views/Home/LoginPage.html` and sign in with that PIN. The account must
   have `account_status = 'Active'`.
4. In the student's **Settings**, select **Add Password**, choose a username,
   enter and confirm the password, enable password login, and save.
5. Sign out and verify username/password login. When password login is enabled,
   the application requires it instead of the PIN.

Admin credentials are in `admins.password` (BCrypt despite the column name).
Student PIN/status are in `students`; optional username/password credentials
are in `student_login_credentials`. Applicants use the public enrollment form
and have no login role.

The authorization gaps in [the deployment review](deployment-secret-review.md)
still need resolution before public use with real records. Account creation
does not resolve those gaps.
