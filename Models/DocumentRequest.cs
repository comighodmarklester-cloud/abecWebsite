using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("documentrequests")]
public class DocumentRequest
{
    [Key]
    [Column("request_id")]
    public int RequestId { get; set; }

    [Column("student_id")]
    public int StudentId { get; set; }

    [Required]
    [MaxLength(100)]
    [Column("document_type")]
    public string DocumentType { get; set; } = string.Empty;

    [Required]
    [Column("reason")]
    public string Reason { get; set; } = string.Empty;

    [MaxLength(500)]
    [Column("specific_reason")]
    public string? SpecificReason { get; set; }

    [Required]
    [MaxLength(40)]
    [Column("request_status")]
    public string RequestStatus { get; set; } = "Pending";

    [Column("request_date")]
    public DateTime RequestDate { get; set; }

    [Column("release_date")]
    public DateTime? ReleaseDate { get; set; }

    [MaxLength(500)]
    [Column("hold_reason")]
    public string? HoldReason { get; set; }

    [MaxLength(255)]
    [Column("release_file_name")]
    public string? ReleaseFileName { get; set; }

    [MaxLength(500)]
    [Column("release_stored_path")]
    public string? ReleaseStoredPath { get; set; }

    [MaxLength(100)]
    [Column("release_content_type")]
    public string? ReleaseContentType { get; set; }

    [Column("release_size_bytes")]
    public long? ReleaseSizeBytes { get; set; }

    [Column("release_uploaded_at")]
    public DateTime? ReleaseUploadedAt { get; set; }

    [ForeignKey(nameof(StudentId))]
    public Student? Student { get; set; }
}
