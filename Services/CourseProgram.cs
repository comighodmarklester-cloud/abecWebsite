namespace ABEC_System.Services;

/// <summary>
/// Official ABEC course length. Eight hours per day.
/// Bookkeeping is 37 training days plus 19 OJT days (56 days, 448 hours).
/// These defaults do not replace a batch's saved start and end dates.
/// </summary>
public static class CourseProgram
{
    public const int HoursPerDay = 8;

    public static readonly CourseProgramInfo ComputerSystems = new(8, 280, 35, 0, "35 days · 280 hours · 8 hours/day");
    public static readonly CourseProgramInfo Bookkeeping = new(8, 448, 37, 19, "37 Training Days + 19 OJT Days · 448 Total Hours");
    public static readonly CourseProgramInfo CustomerService = new(8, 240, 30, 0, "30 days · 240 hours · 8 hours/day");
    public static readonly CourseProgramInfo Electronics = new(8, 264, 33, 0, "33 days · 264 hours · 8 hours/day");

    public static CourseProgramInfo? Match(string? courseName)
    {
        var name = System.Text.RegularExpressions.Regex.Replace(courseName ?? "", @"\s*NC\s*II\b", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim().ToLowerInvariant();
        if (name == "bookkeeping") return Bookkeeping;
        if (name is "customer service" or "customer services") return CustomerService;
        if (name is "electronic products assembly and servicing" or "electronic product assembly and servicing") return Electronics;
        if (name is "computer systems servicing" or "computer system servicing") return ComputerSystems;
        return null;
    }

    public static CourseProgramInfo? FromCourse(ABEC_System.Models.Course? course)
    {
        if (course is null) return null;
        if (course.TrainingDays < 1) return Match(course.CourseName);
        return new(course.HoursPerDay, course.TotalHours, course.TrainingDays, course.OjtDays, course.Duration);
    }

    public static TrainingRequestGate RequestGate(DateTime? batchStart, CourseProgramInfo? program, DateTime today)
    {
        const string waiting = "Document requests will become available after you complete your training.";
        if (program is null || program.ProgramDays < 1 || batchStart is null || batchStart.Value.Year < 1900)
            return new TrainingRequestGate(false, null, waiting);

        var completion = batchStart.Value.Date.AddDays(program.ProgramDays - 1);
        var open = today.Date > completion;
        return new TrainingRequestGate(open, completion, open ? string.Empty : waiting);
    }
}

public sealed record CourseProgramInfo(int HoursPerDay, int TotalHours, int TrainingDays, int OjtDays, string Label)
{
    public int ProgramDays => TrainingDays + Math.Max(0, OjtDays);

    public string Summary => OjtDays > 0
        ? $"{TrainingDays} Training Days + {OjtDays} OJT Days · {TotalHours} Total Hours"
        : $"{TrainingDays} days · {TotalHours} hours · {HoursPerDay} hours/day";
}

public sealed record TrainingRequestGate(bool Open, DateTime? CompletionDate, string Message);
