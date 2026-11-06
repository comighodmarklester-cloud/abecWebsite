using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ABEC_System.Constants;

namespace ABEC_System.Models;

[Table("courses")]
public class Course
{
    [Key]
    [Column("course_id")]
    public int CourseId { get; set; }

    [Required]
    [MaxLength(150)]
    [Column("course_name")]
    public string CourseName { get; set; } = string.Empty;

    [Column("course_description")]
    public string? CourseDescription { get; set; }

    [Required]
    [MaxLength(80)]
    [Column("duration")]
    public string Duration { get; set; } = string.Empty;

    [Column("hours_per_day")]
    public int HoursPerDay { get; set; } = 8;

    [Column("total_hours")]
    public int TotalHours { get; set; }

    [Column("training_days")]
    public int TrainingDays { get; set; }

    [Column("ojt_days")]
    public int OjtDays { get; set; }

    [Required]
    [MaxLength(20)]
    [Column("status")]
    public string Status { get; set; } = "Available";

    [Column("slot_capacity")]
    public int SlotCapacity { get; set; } = SystemConstants.DefaultCourseCapacity;

    public ICollection<Applicant> Applicants { get; set; } = new List<Applicant>();
    public ICollection<CourseSchedule> CourseSchedules { get; set; } = new List<CourseSchedule>();
}
