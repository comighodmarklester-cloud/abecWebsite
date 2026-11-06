using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("course_management_history")]
public class CourseManagementHistory
{
    [Key]
    [Column("history_id")]
    public int HistoryId { get; set; }

    [Column("course_id")]
    public int CourseId { get; set; }

    [Required]
    [MaxLength(150)]
    [Column("course_name")]
    public string CourseName { get; set; } = string.Empty;

    [Required]
    [MaxLength(120)]
    [Column("action")]
    public string Action { get; set; } = string.Empty;

    [MaxLength(500)]
    [Column("previous_value")]
    public string? PreviousValue { get; set; }

    [MaxLength(500)]
    [Column("new_value")]
    public string? NewValue { get; set; }

    [Column("admin_id")]
    public int? AdminId { get; set; }

    [MaxLength(150)]
    [Column("modified_by")]
    public string? ModifiedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
