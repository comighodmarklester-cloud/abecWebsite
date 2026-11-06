using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("admin_activity_logs")]
public class AdminActivityLog
{
    [Key]
    [Column("activity_id")]
    public int ActivityId { get; set; }

    [Column("admin_id")]
    public int AdminId { get; set; }

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

    [MaxLength(150)]
    [Column("location")]
    public string? Location { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [ForeignKey(nameof(AdminId))]
    public Admin? Admin { get; set; }
}
