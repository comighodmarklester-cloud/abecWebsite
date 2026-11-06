using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("trainingrooms")]
public class TrainingRoom
{
    [Key]
    [Column("room_id")]
    public int RoomId { get; set; }

    [Required]
    [MaxLength(100)]
    [Column("room_name")]
    public string RoomName { get; set; } = string.Empty;

    [MaxLength(255)]
    [Column("description")]
    public string? Description { get; set; }

    [Column("course_id")]
    public int? CourseId { get; set; }

    [ForeignKey(nameof(CourseId))]
    public Course? Course { get; set; }
}
