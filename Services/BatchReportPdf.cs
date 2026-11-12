using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ABEC_System.Services;

/// <summary>A filtered summary and complete record tables, independent of screen pagination.</summary>
public static class BatchReportPdf
{
    private const string Navy = "0B2747";

    public static byte[] Create(ReportExportData report)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        var generated = TimeZoneInfo.ConvertTimeBySystemTimeZoneId(report.ExportedAt, "Asia/Manila");
        var totals = string.Join(" | ", report.Sections.Select(s => $"{s.Title}: {s.Total}"));
        return Document.Create(document =>
        {
            void Page(string title, Action<ColumnDescriptor> content)
            {
                document.Page(page =>
                {
                    page.Size(PageSizes.A4.Landscape());
                    page.Margin(30);
                    page.DefaultTextStyle(x => x.FontSize(9).FontColor(Navy)
                        .DisableFontFeature("liga").DisableFontFeature("clig").DisableFontFeature("dlig"));
                    page.Header().PaddingBottom(12).Column(col =>
                    {
                        col.Spacing(4);
                        col.Item().Text("ABEC | Reports").FontSize(19).Bold();
                        col.Item().Text($"Export date: {generated:MMM dd, yyyy HH:mm} PHT").FontSize(8).FontColor("64748B");
                        col.Item().Text("Active filters - " + report.Scope.Description).FontSize(9);
                        col.Item().Text(totals).FontSize(9).SemiBold();
                        col.Item().PaddingTop(6).Text(title).FontSize(14).Bold();
                    });
                    page.Content().Column(col => { col.Spacing(10); content(col); });
                    page.Footer().PaddingTop(12).AlignRight().Text(text =>
                    {
                        text.Span("ABEC | Page ").FontSize(8);
                        text.CurrentPageNumber().FontSize(8);
                        text.Span(" of ").FontSize(8);
                        text.TotalPages().FontSize(8);
                    });
                });
            }

            Page("Summary", col =>
            {
                col.Item().Table(table =>
                {
                    table.ColumnsDefinition(c => { c.RelativeColumn(3); c.RelativeColumn(); });
                    table.Header(header => { Header(header.Cell(), "Section"); Header(header.Cell(), "Records exported"); });
                    foreach (var section in report.Sections)
                    {
                        Cell(table.Cell(), section.Title);
                        Cell(table.Cell(), section.Total.ToString(CultureInfo.InvariantCulture));
                    }
                });
                col.Item().Text("All matching records are included, across every on-screen page. Each section total is the number of rows in its detailed table.");
                col.Item().Text("Applicants includes every application status, including applications that later enrolled or were archived. Section totals count records and must not be added together as a count of distinct people.").FontColor("64748B");
                col.Item().Text("Archived Records uses the latest saved archive entry per student and includes rejected applications and declined offers without a student account, matching the Archives chart. Their archive date is shown as Not recorded when no archive or decline date was saved.").FontColor("64748B");
            });
            foreach (var section in report.Sections)
            {
                Page($"{section.Title} - {section.Total} records", col =>
                {
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(2.2f); c.RelativeColumn(1.1f); c.RelativeColumn(2);
                            c.RelativeColumn(1.4f); c.RelativeColumn(1.2f); c.RelativeColumn(2.4f);
                        });
                        // QuestPDF repeats this header on every continuation page.
                        table.Header(header => { foreach (var heading in section.Columns) Header(header.Cell(), heading); });
                        if (section.Total == 0)
                            table.Cell().ColumnSpan(6).Padding(10).Text("No matching records").FontColor("64748B");
                        foreach (var row in section.Rows)
                        {
                            string[] values = [row.FullName, row.RecordId, row.Course, row.Batch,
                                row.Date?.ToString("MMM dd, yyyy", CultureInfo.InvariantCulture) ?? "Not recorded", row.StatusOrReason];
                            foreach (var value in values) Cell(table.Cell().ShowEntire(), value);
                        }
                    });
                });
            }
        }).GeneratePdf();
    }

    private static void Header(IContainer container, string value)
        => container.Background("EDF3FB").Padding(6).Text(value).SemiBold();

    private static void Cell(IContainer container, string value)
        => container.BorderBottom(0.5f).BorderColor("E2E8F0").Padding(6).Text(value);
}
