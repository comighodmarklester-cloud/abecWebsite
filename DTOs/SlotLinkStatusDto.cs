namespace ABEC_System.DTOs;

public class SlotLinkStatusDto
{
    public string State { get; set; } = "invalid";
    public string FullName { get; set; } = string.Empty;
    public string CourseName { get; set; } = string.Empty;
    public string TrainingDateTime { get; set; } = string.Empty;
    public DateTimeOffset? ResponseDeadline { get; set; }
    public string Message { get; set; } = string.Empty;
}
