using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("notifications")]
public class Notification
{
    [Column("batch_id")]
    public int? BatchId { get; set; }
    [Column("course_document_id")]
    public int? CourseDocumentId { get; set; }
    [Column("request_id")]
    public int? RequestId { get; set; }
    [Key]
    [Column("notification_id")]
    public int NotificationId { get; set; }

    [Column("student_id")]
    public int? StudentId { get; set; }

    [Column("applicant_id")]
    public int? ApplicantId { get; set; }

    [Required]
    [MaxLength(150)]
    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Required]
    [Column("message")]
    public string Message { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    [Column("status")]
    public string Status { get; set; } = "Unread";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [ForeignKey(nameof(StudentId))]
    public Student? Student { get; set; }

    [ForeignKey(nameof(ApplicantId))]
    public Applicant? Applicant { get; set; }
}
