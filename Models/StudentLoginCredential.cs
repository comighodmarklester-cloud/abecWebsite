using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("student_login_credentials")]
public class StudentLoginCredential
{
    [Key, Column("student_id")]
    public int StudentId { get; set; }

    [Required, MaxLength(50), Column("username")]
    public string Username { get; set; } = string.Empty;

    [Required, MaxLength(255), Column("password_hash")]
    public string PasswordHash { get; set; } = string.Empty;

    [Column("password_login_enabled")]
    public bool PasswordLoginEnabled { get; set; }
}
