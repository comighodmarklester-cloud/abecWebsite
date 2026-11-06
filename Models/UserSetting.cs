using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("usersettings")]
public class UserSetting
{
    [Key]
    [Column("setting_id")]
    public int SettingId { get; set; }

    [Column("admin_id")]
    public int AdminId { get; set; }

    [Required]
    [MaxLength(50)]
    [Column("username")]
    public string Username { get; set; } = string.Empty;

    [Required]
    [MaxLength(255)]
    [Column("password")]
    public string Password { get; set; } = string.Empty;

    [Column("email_notifications")]
    public bool EmailNotifications { get; set; } = true;

    [Column("in_app_alerts")]
    public bool InAppAlerts { get; set; } = true;

    [Column("system_alerts")]
    public bool SystemAlerts { get; set; } = true;

    [Column("student_updates")]
    public bool StudentUpdates { get; set; } = true;

    [Column("document_requests")]
    public bool DocumentRequests { get; set; } = true;

    [ForeignKey(nameof(AdminId))]
    public Admin? Admin { get; set; }
}
