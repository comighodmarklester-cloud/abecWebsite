using System.Globalization;

namespace ABEC_System.Services;

public static class SlotOfferPolicy
{
    public const int ResponseHours = 48;
    public static DateTimeOffset AsOffset(DateTime value) => value.Kind == DateTimeKind.Utc
        ? new DateTimeOffset(value) : new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Local));
    public static string DisplayTime(DateTimeOffset value) => value.ToOffset(TimeSpan.FromHours(8))
        .ToString("MMMM d, yyyy 'at' h:mm tt", CultureInfo.InvariantCulture) + " (Philippine time)";
}
