using System.Security.Cryptography;
using ABEC_System.Data;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;

namespace ABEC_System.Services;

internal static class SecurityPinGenerator
{
    private static string Prefix(string firstName, string surname)
    {
        var first = firstName.Trim();
        var last = surname.Trim();
        if (first.Length == 0 || last.Length == 0 || !char.IsLetter(first[0]) || !char.IsLetter(last[0]))
            throw new BatchIntegrityException("A registered first name and surname beginning with a letter are required to issue a PIN.");
        return "ABEC" + char.ToUpperInvariant(first[0]) + char.ToUpperInvariant(last[0]);
    }

    // A name pair has a finite namespace. Select uniformly from its unused values
    // rather than guessing indefinitely when the namespace is nearly exhausted.
    public static async Task AssignAndSaveAsync(ApplicationDbContext db, Student student, Applicant applicant, CancellationToken ct)
    {
        using var credentialDiagnostics = CredentialDiagnostics.BeginWrite();
        var previousPin = student.SecurityPin;
        var prefix = Prefix(applicant.FirstName, applicant.LastName);
        await using var lease = await SlotWorkflowLock.AcquireAsync(db, "pin:" + prefix, ct);
        var assigned = await db.Students.AsNoTracking()
            .Where(s => s.SecurityPin.StartsWith(prefix) || s.SecurityPin.StartsWith("ABEC-" + prefix.Substring(4)))
            .Select(s => s.SecurityPin).ToListAsync(ct);
        // Also reserve aliases on old printed notices. Archived and inactive accounts
        // remain in this query and continue to own their assigned credentials.
        var occupied = assigned.Select(pin => pin.Replace("ABEC-", "ABEC", StringComparison.OrdinalIgnoreCase))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var available = Enumerable.Range(0, 10000).Select(value => prefix + value.ToString("D4"))
            .Where(pin => !occupied.Contains(pin)).ToList();
        try
        {
            while (available.Count > 0)
            {
                ct.ThrowIfCancellationRequested();
                var index = RandomNumberGenerator.GetInt32(available.Count);
                student.SecurityPin = available[index];
                available.RemoveAt(index);
                try
                {
                    await db.SaveChangesAsync(ct);
                    return;
                }
                catch (DbUpdateException ex) when (ex.InnerException is MySqlException { Number: 1062 })
                {
                    // The unique DB index is authoritative, including writers which do
                    // not use our advisory lock. EF rolls a failed save back to its savepoint.
                    if (!await db.Students.AsNoTracking().AnyAsync(s => s.SecurityPin == student.SecurityPin, ct)) throw;
                }
            }
            throw new BatchIntegrityException("No unused security PIN remains for these initials. Contact the registrar; no credential has been issued.");
        }
        catch
        {
            // A failed/cancelled save must not leave an unissued candidate in the
            // tracked account, where a later SaveChanges could persist it accidentally.
            student.SecurityPin = previousPin;
            throw;
        }
    }
}
