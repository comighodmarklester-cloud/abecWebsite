using ABEC_System.Models;

namespace ABEC_System.Services;

internal static class SecurityPinGenerator
{
    public static bool TryGenerate(Student student, out string pin)
    {
        pin = string.Empty;
        var applicant = student.Applicant;
        if (applicant is null
            || string.IsNullOrWhiteSpace(applicant.FirstName)
            || string.IsNullOrWhiteSpace(applicant.LastName)
            || applicant.Birthdate == default
            || applicant.ApplicationDate == default)
            return false;

        var mobileDigits = new string((applicant.ContactNumber ?? string.Empty).Where(char.IsDigit).ToArray());
        if (mobileDigits.Length < 2)
            return false;

        var firstInitial = LastLetter(applicant.FirstName);
        var lastInitial = LastLetter(applicant.LastName);
        if (firstInitial == null || lastInitial == null)
            return false;

        pin = $"ABEC{firstInitial}{lastInitial}{applicant.Birthdate.Day:00}{mobileDigits[^2..]}{applicant.ApplicationDate.Day:00}";
        return true;
    }

    private static char? LastLetter(string value)
    {
        for (var index = value.Trim().Length - 1; index >= 0; index--)
        {
            if (char.IsLetter(value[index]))
                return char.ToUpperInvariant(value[index]);
        }

        return null;
    }
}
