using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("admins")]
public class Admin
{
    [Key]
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

    [MaxLength(150)]
    [Column("email")]
    public string? Email { get; set; }

    [MaxLength(30)]
    [Column("contact_number")]
    public string? ContactNumber { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    public UserSetting? UserSetting { get; set; }

    public ICollection<AdminActivityLog> ActivityLogs { get; set; } = new List<AdminActivityLog>();
}
