using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("student_activity_logs")]
public class StudentActivityLog
{
    [Key]
    [Column("activity_id")]
    public int ActivityId { get; set; }

    [Column("student_id")]
    public int StudentId { get; set; }

    [Required]
    [MaxLength(100)]
    [Column("action")]
    public string Action { get; set; } = string.Empty;

    [MaxLength(255)]
    [Column("device_info")]
    public string? DeviceInfo { get; set; }

    [MaxLength(64)]
    [Column("ip_address")]
    public string? IpAddress { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [ForeignKey(nameof(StudentId))]
    public Student? Student { get; set; }
}
