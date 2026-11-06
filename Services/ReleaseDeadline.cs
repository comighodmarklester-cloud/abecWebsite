namespace ABEC_System.Services;

/// <summary>
/// Expected release is the day after training ends.
/// A start of June 1 and a duration of 37 days completes on July 7 and is due for release on July 8.
/// </summary>
public static class ReleaseDeadline
{
    public static int? ParseDurationDays(string? duration)
    {
        if (string.IsNullOrWhiteSpace(duration)) return null;
        var lower = duration.ToLowerInvariant();
        if (lower.Contains("hour") || lower.Contains("month") || lower.Contains("week") || lower.Contains("year"))
            return null;
        if (!lower.Contains("day") && duration.Any(char.IsLetter))
            return null;

        var digits = new string(duration.Where(char.IsDigit).ToArray());
        if (!int.TryParse(digits, out var days) || days < 1 || days > 3660)
            return null;
        return days;
    }

    public static ReleaseWindow Compute(DateTime? start, DateTime? end, string? durationText)
    {
        if (start is null || start.Value.Year < 1900)
            return ReleaseWindow.Incomplete("The training schedule is incomplete, so a release deadline cannot be calculated.");

        var startDate = start.Value.Date;
        var days = ParseDurationDays(durationText);
        if (days is null && end is not null && end.Value.Year > 1900 && end.Value.Date >= startDate)
            days = (end.Value.Date - startDate).Days + 1;
        if (days is null || days < 1)
            return ReleaseWindow.Incomplete("The training duration is missing, so a release deadline cannot be calculated.");

        return new ReleaseWindow(
            days.Value,
            startDate.AddDays(days.Value - 1),
            startDate.AddDays(days.Value),
            null);
    }
}

public sealed record ReleaseWindow(int? DurationDays, DateTime? CompletionDate, DateTime? ReleaseDeadline, string? Message)
{
    public bool IsComplete => ReleaseDeadline is not null && string.IsNullOrWhiteSpace(Message);

    public static ReleaseWindow Incomplete(string message) => new(null, null, null, message);
}
