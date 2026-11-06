using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("archives")]
public class Archive
{
    [Key]
    [Column("archive_id")]
    public int ArchiveId { get; set; }

    [Column("student_id")]
    public int StudentId { get; set; }

    [Required]
    [Column("archive_reason")]
    public string ArchiveReason { get; set; } = string.Empty;

    [MaxLength(500)]
    [Column("specific_reason")]
    public string? SpecificReason { get; set; }

    [Column("archive_date")]
    public DateTime ArchiveDate { get; set; }

    [ForeignKey(nameof(StudentId))]
    public Student? Student { get; set; }
}
