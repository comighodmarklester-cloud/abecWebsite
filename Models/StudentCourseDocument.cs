using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("student_course_documents")]
public class StudentCourseDocument
{
    [Key]
    [Column("course_document_id")]
    public int CourseDocumentId { get; set; }

    [Column("student_id")]
    public int StudentId { get; set; }

    [Column("course_id")]
    public int CourseId { get; set; }

    [Column("batch_id")]
    public int? BatchId { get; set; }

    [Required]
    [MaxLength(80)]
    [Column("document_type")]
    public string DocumentType { get; set; } = string.Empty;

    [Required]
    [MaxLength(40)]
    [Column("preparation_status")]
    public string PreparationStatus { get; set; } = "Not Prepared";

    [MaxLength(255)]
    [Column("file_name")]
    public string? FileName { get; set; }

    [MaxLength(500)]
    [Column("stored_path")]
    public string? StoredPath { get; set; }

    [MaxLength(100)]
    [Column("content_type")]
    public string? ContentType { get; set; }

    [Column("size_bytes")]
    public long? SizeBytes { get; set; }

    [Column("uploaded_at")]
    public DateTime? UploadedAt { get; set; }

    [Column("released_at")]
    public DateTime? ReleasedAt { get; set; }

    [Column("released_by_user_id")]
    public int? ReleasedByUserId { get; set; }

    [ForeignKey(nameof(StudentId))]
    public Student? Student { get; set; }
}
