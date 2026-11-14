using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("applicant_registration_documents")]
public class ApplicantRegistrationDocument
{
    [Key]
    [Column("document_id")]
    public int DocumentId { get; set; }

    [Column("applicant_id")]
    public int ApplicantId { get; set; }

    [Required]
    [MaxLength(20)]
    [Column("category")]
    public string Category { get; set; } = string.Empty;

    [MaxLength(80)]
    [Column("document_label")]
    public string? DocumentLabel { get; set; }

    [Required]
    [MaxLength(255)]
    [Column("original_file_name")]
    public string OriginalFileName { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    [Column("stored_relative_path")]
    public string StoredRelativePath { get; set; } = string.Empty;

    [MaxLength(100)]
    [Column("content_type")]
    public string ContentType { get; set; } = string.Empty;

    [Column("size_bytes")]
    public long SizeBytes { get; set; }

    [Column("uploaded_at")]
    public DateTime UploadedAt { get; set; }

    // Pending rows have no file. Existing uploaded records default to false.
    [Column("is_follow_up")]
    public bool IsFollowUp { get; set; }

    [ForeignKey(nameof(ApplicantId))]
    public Applicant? Applicant { get; set; }
}
