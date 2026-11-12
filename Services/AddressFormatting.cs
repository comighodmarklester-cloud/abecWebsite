using System.Text.RegularExpressions;
using ABEC_System.Models;

namespace ABEC_System.Services;

public static class AddressFormatting
{
    public static string BarangayName(string? value) => Regex.Replace(value?.Trim() ?? "",
        @"^(?:(?:barangay|brgy|bgy)(?:\.\s*|\s+|$))+", "", RegexOptions.IgnoreCase).Trim();

    public static string Barangay(string? value)
    {
        var name = BarangayName(value);
        return name.Length == 0 ? "" : "Brgy. " + name;
    }

    // Format old records on read as well as newly registered addresses.
    public static string FullAddress(Applicant? applicant)
    {
        if (applicant is null) return "";
        if (string.IsNullOrWhiteSpace(applicant.Barangay)) return applicant.Address;
        var name = BarangayName(applicant.Barangay);
        if (name.Length == 0) return applicant.Address;
        if (string.IsNullOrWhiteSpace(applicant.StreetDetails) && !string.IsNullOrWhiteSpace(applicant.Address))
        {
            // Some imported records have only a full address. Preserve their street details.
            var parts = applicant.Address.Split(',').Select(p => p.Trim()).ToArray();
            var index = Array.FindIndex(parts, p => BarangayName(p).Equals(name, StringComparison.OrdinalIgnoreCase));
            if (index < 0) return applicant.Address;
            parts[index] = Barangay(name);
            return string.Join(", ", parts);
        }
        return string.Join(", ", new[] { applicant.StreetDetails, Barangay(applicant.Barangay),
            applicant.AddressDistrict, applicant.CityMunicipality, applicant.Province,
            applicant.AddressRegion, applicant.ZipCode }.Where(p => !string.IsNullOrWhiteSpace(p)));
    }
}
