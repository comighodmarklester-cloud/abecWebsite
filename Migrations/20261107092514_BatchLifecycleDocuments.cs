using ABEC_System.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace ABEC_System.Migrations;

public partial class BatchLifecycleDocuments : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        foreach (var sql in BatchLifecycleUpgrade.Statements) migrationBuilder.Sql(sql, suppressTransaction: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => throw new InvalidOperationException("This data-preserving migration has no destructive automatic downgrade. Restore a verified backup or use a reviewed forward migration.");
}
