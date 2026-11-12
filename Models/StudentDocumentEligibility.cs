using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

// Registrar attestations, independent of batch closure and general profile edits.
[Table("student_document_eligibility")]
public sealed class StudentDocumentEligibility
{
    [Key, Column("student_id")]
    public int StudentId { get; set; }
    [Column("fees_paid_at")]
    public DateTime? FeesPaidAt { get; set; }
    [Column("training_completed_at")]
    public DateTime? TrainingCompletedAt { get; set; }
    [Column("assessment_completed_at")]
    public DateTime? AssessmentCompletedAt { get; set; }
    [Column("verified_by_admin_id")]
    public int? VerifiedByAdminId { get; set; }
    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
