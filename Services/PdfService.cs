using ABEC_System.Constants;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.AspNetCore.Hosting;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ABEC_System.Services;

public class PdfService : IPdfService
{
    private static readonly string SectionBlueHex = "1A4B7A";
    private readonly IWebHostEnvironment _env;

    public PdfService(IWebHostEnvironment env)
    {
        _env = env;
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] GenerateApplicationFormPdf(Applicant applicant)
    {
        var last = applicant.LastName ?? "";
        var first = applicant.FirstName ?? "";
        var middle = string.IsNullOrWhiteSpace(applicant.MiddleName) ? "" : applicant.MiddleName;
        var course = applicant.Course?.CourseName ?? "N/A";
        var address = AddressFormatting.FullAddress(applicant);
        var gender = string.IsNullOrWhiteSpace(applicant.Gender) ? "N/A" : applicant.Gender;
        var contact = applicant.ContactNumber ?? "N/A";
        var email = applicant.Email ?? "N/A";
        var birthdate = applicant.Birthdate == default ? "N/A" : applicant.Birthdate.ToString("MMMM dd, yyyy");
        var studentId = $"ABEC-{applicant.ApplicationDate:yyyy}-{applicant.ApplicantId:D4}";
        var termYear = applicant.ApplicationDate.Year;

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginHorizontal(36);
                page.MarginVertical(28);
                page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.Black).LineHeight(1.2f));

                page.Content().Column(col =>
                {
                    // Header
                    col.Item().AlignCenter().Text("ABEC INSTITUTE OF BUSINESS AND TECHNOLOGY, INC.")
                        .Bold().FontSize(11);
                    col.Item().AlignCenter().Text("Online Enrollment and Document Release Tracking System")
                        .FontSize(8).FontColor(Colors.Grey.Darken2);
                    col.Item().PaddingTop(2).AlignCenter().Text("APPLICATION / ENROLLMENT FORM")
                        .Bold().FontSize(12);
                    col.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Black);

                    // Identification
                    col.Item().PaddingTop(8).Text($"Student ID No.: {studentId}").FontSize(9);
                    col.Item().PaddingTop(4).Text($"Name: {last}, {first} {middle}".Trim())
                        .FontSize(9);
                    col.Item().PaddingTop(2).Text("(Last Name / First Name / Middle Name)")
                        .FontSize(7).FontColor(Colors.Grey.Darken1);
                    col.Item().PaddingTop(4).Text($"Course/Program: {course}").FontSize(9);

                    col.Item().PaddingTop(4).Row(row =>
                    {
                        row.RelativeItem().Text("Student Status:  [ ] Old Student   [x] New Student   [ ] Transferee").FontSize(8.5f);
                        row.RelativeItem().AlignRight().Text($"Term: {termYear} – {termYear + 1}").FontSize(8.5f);
                    });

                    // Credentials
                    col.Item().PaddingTop(8).Text("Credentials Submitted").Bold().FontSize(9.5f);
                    col.Item().PaddingTop(3).Text(
                        "[ ] Form 138     [ ] Honorable Dismissal     [ ] Transcript of Records     [ ] Certificate of Good Moral Character")
                        .FontSize(8);

                    // Personal data
                    col.Item().PaddingTop(8).Text("Personal Data").Bold().FontSize(9.5f);
                    FormLine(col, "Home Address", address);
                    col.Item().PaddingTop(3).Row(r =>
                    {
                        r.RelativeItem().Text($"Date of Birth: {birthdate}").FontSize(8.5f);
                        r.RelativeItem().Text($"Gender: {gender}").FontSize(8.5f);
                        r.RelativeItem().Text("Civil Status: ____________").FontSize(8.5f);
                    });
                    col.Item().PaddingTop(3).Row(r =>
                    {
                        r.RelativeItem().Text($"Contact Number: {contact}").FontSize(8.5f);
                        r.RelativeItem().Text("Place of Birth: ____________________").FontSize(8.5f);
                    });
                    col.Item().PaddingTop(3).Row(r =>
                    {
                        r.RelativeItem().Text("Occupation (if any): ____________________").FontSize(8.5f);
                        r.RelativeItem().Text($"Email: {email}").FontSize(8.5f);
                    });
                    FormLine(col, "If employed, Name & Address of Firm", "____________________");
                    FormLine(col, "Parent/Guardian", "____________________");
                    FormLine(col, "Parent/Guardian Address", "____________________");
                    FormLine(col, "Parent/Guardian Contact Number", "____________________");
                    col.Item().PaddingTop(3).Row(r =>
                    {
                        r.RelativeItem().Text("School Last Attended: ____________________").FontSize(8.5f);
                        r.RelativeItem().Text("Course & Year: ____________________").FontSize(8.5f);
                    });

                    // Schedule table (blank for office use)
                    col.Item().PaddingTop(8).Text("Schedule").Bold().FontSize(9.5f);
                    col.Item().PaddingTop(3).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(3.2f);
                            c.RelativeColumn(0.8f);
                            c.RelativeColumn(1.2f);
                            c.RelativeColumn(1f);
                            c.RelativeColumn(1.2f);
                        });

                        ScheduleHeader(table, "Subjects");
                        ScheduleHeader(table, "Units");
                        ScheduleHeader(table, "Time");
                        ScheduleHeader(table, "Days");
                        ScheduleHeader(table, "Room");

                        for (var i = 0; i < 6; i++)
                        {
                            EmptyCell(table);
                            EmptyCell(table);
                            EmptyCell(table);
                            EmptyCell(table);
                            EmptyCell(table);
                        }

                        table.Cell().ColumnSpan(1).Border(0.6f).BorderColor(Colors.Black)
                            .Padding(3).Text("Total Units").SemiBold().FontSize(8);
                        EmptyCell(table);
                        EmptyCell(table);
                        EmptyCell(table);
                        EmptyCell(table);
                    });

                    // Training fees (blank for office)
                    col.Item().PaddingTop(8).Text("Training Fees").Bold().FontSize(9.5f);
                    col.Item().PaddingTop(3).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(1.6f);
                            c.RelativeColumn(1.1f);
                            c.RelativeColumn(1.2f);
                            c.RelativeColumn(1f);
                            c.RelativeColumn(1f);
                            c.RelativeColumn(0.9f);
                            c.RelativeColumn(0.9f);
                        });

                        ScheduleHeader(table, "Training Fees");
                        ScheduleHeader(table, "Amount");
                        ScheduleHeader(table, "Terms");
                        ScheduleHeader(table, "Amount");
                        ScheduleHeader(table, "OR No.");
                        ScheduleHeader(table, "Date");
                        ScheduleHeader(table, "Initial");

                        FeePairRow(table, "Tuition Fee", "Initial Payment");
                        FeePairRow(table, "Miscellaneous Fees", "Pre-lims");
                        FeePairRow(table, "Other Fees", "Mid-Term");
                        FeePairRow(table, "TOTAL", "Pre-finals");
                        FeePairRow(table, "", "Finals");
                    });

                    // Signatures
                    col.Item().PaddingTop(12).Row(r =>
                    {
                        r.RelativeItem().Text("Assessed by: ______________").FontSize(8);
                        r.RelativeItem().AlignCenter().Text("Student's Signature / Date: ______________").FontSize(8);
                        r.RelativeItem().AlignRight().Text("Approved by: ______________").FontSize(8);
                    });
                    col.Item().PaddingTop(14).Row(r =>
                    {
                        r.RelativeItem().AlignCenter().Text("________________\nDepartment Head").FontSize(7.5f).AlignCenter();
                        r.RelativeItem().AlignCenter().Text("________________\nFinance Officer").FontSize(7.5f).AlignCenter();
                        r.RelativeItem().AlignCenter().Text("________________\nRegistrar").FontSize(7.5f).AlignCenter();
                    });

                    if (!string.IsNullOrWhiteSpace(applicant.ApplicationReference))
                        col.Item().PaddingTop(6).Text($"Reference: {applicant.ApplicationReference}").FontSize(8);
                    FormLine(col, "Qualification", applicant.QualificationType ?? "N/A");
                    if (!string.IsNullOrWhiteSpace(applicant.CocSpecification))
                        FormLine(col, "COC specification", applicant.CocSpecification);
                    FormLine(col, "Applicant classification", applicant.ApplicantClassification ?? "N/A");
                    FormLine(col, "Civil status", applicant.CivilStatus ?? "N/A");
                    FormLine(col, "Birth place", applicant.BirthPlace ?? "N/A");
                    FormLine(col, "Region", applicant.AddressRegion ?? "N/A");
                    FormLine(col, "ZIP code", applicant.ZipCode ?? "N/A");
                    col.Item().PaddingTop(4).Text("Submit the printed form to: " + SystemConstants.AbecOffice.Address)
                        .FontSize(8);
                    col.Item().PaddingTop(8).Text(
                        "This form was generated from the applicant's online registration record in the ABEC System. Please verify all details and complete any blank fields as required by the registrar.")
                        .FontSize(7.5f).Italic().FontColor(Colors.Grey.Darken2);
                });
            });
        }).GeneratePdf();
    }

    private static void FormLine(ColumnDescriptor col, string label, string value)
    {
        col.Item().PaddingTop(3).Text($"{label}: {value}").FontSize(8.5f);
    }

    private static void ScheduleHeader(TableDescriptor table, string text)
    {
        table.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.Grey.Lighten3)
            .Padding(3).AlignCenter().Text(text).Bold().FontSize(7.5f);
    }

    private static void EmptyCell(TableDescriptor table)
    {
        table.Cell().Border(0.6f).BorderColor(Colors.Black).Padding(8).Text(" ").FontSize(7);
    }

    private static void FeePairRow(TableDescriptor table, string feeLabel, string termLabel)
    {
        table.Cell().Border(0.6f).BorderColor(Colors.Black).Padding(3)
            .Text(string.IsNullOrEmpty(feeLabel) ? " " : feeLabel).FontSize(7.5f);
        EmptyCell(table);
        table.Cell().Border(0.6f).BorderColor(Colors.Black).Padding(3)
            .Text(termLabel).FontSize(7.5f);
        EmptyCell(table);
        EmptyCell(table);
        EmptyCell(table);
        EmptyCell(table);
    }

    public byte[] GenerateActivationNoticePdf(Student student)
    {
        var name = student.Applicant?.FullName?.Trim() ?? "Student";
        var email = student.Applicant?.Email ?? "N/A";
        var course = student.Applicant?.Course?.CourseName ?? "N/A";
        var intake = student.Batch?.BatchName ?? "N/A";
        var pin = FormatPin(student.SecurityPin);
        var studentId = $"ABEC-{student.CreatedAt:yyyy}-{student.StudentId:D4}";
        var isActive = string.Equals(student.AccountStatus, SystemConstants.AccountStatuses.Active, StringComparison.OrdinalIgnoreCase);
        var accountStatus = isActive ? "Activated" : "Pending Activation";
        var pinGenerated = student.CreatedAt.ToString("MMMM dd, yyyy");
        var issuedDate = DateTime.Now.ToString("MMMM dd, yyyy");
        var logoBytes = TryLoadLogo();

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginHorizontal(36);
                page.MarginTop(28);
                page.MarginBottom(24);
                page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.Black).LineHeight(1.2f));

                page.Header().Column(header =>
                {
                    header.Item().AlignCenter().Element(e =>
                    {
                        if (logoBytes is { Length: > 0 })
                            e.Height(44).Width(44).Image(logoBytes).FitArea();
                        else
                            e.Height(44).Width(44).Border(1).BorderColor(Colors.Grey.Medium)
                                .AlignCenter().AlignMiddle()
                                .Text("ABEC").Bold().FontSize(10).FontColor(Color.FromHex(SectionBlueHex));
                    });

                    header.Item().PaddingTop(4).AlignCenter()
                        .Text("ABEC INSTITUTE OF BUSINESS AND TECHNOLOGY, INC.")
                        .Bold().FontSize(10).FontColor(Colors.Black);

                    header.Item().PaddingTop(2).AlignCenter()
                        .Text("STUDENT ACCOUNT ACTIVATION NOTICE")
                        .Bold().FontSize(11).FontColor(Colors.Black);

                    header.Item().PaddingTop(1).AlignCenter()
                        .Text("Online Enrollment and Document Release Tracking System")
                        .FontSize(8).FontColor(Colors.Grey.Darken2);

                    header.Item().PaddingTop(8).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(110);
                            c.RelativeColumn();
                        });

                        CompactMetaRow(table, "Document Type", "Account Activation Credential Notice");
                        CompactMetaRow(table, "Issued By", "ABEC Administration Office");
                    });
                });

                page.Content().PaddingTop(10).Column(col =>
                {
                    col.Item().Text($"Dear {name},").FontSize(9);

                    col.Item().PaddingTop(4).Text(
                        "Your enrollment application has been approved. This official notice contains your Security PIN for signing in after the ABEC registrar activates your student account.")
                        .FontSize(8.5f).LineHeight(1.25f);

                    CompactSectionTitle(col, "Student Information");
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(120);
                            c.RelativeColumn();
                        });

                        CompactTableHeader(table, "Field", "Details");
                        CompactInfoRow(table, "Student Name", name);
                        CompactInfoRow(table, "Student ID", studentId);
                        CompactInfoRow(table, "Registered Email", email);
                        CompactInfoRow(table, "Program/Course", course);
                        CompactInfoRow(table, "Training Intake", intake);
                        CompactInfoRow(table, "Account Status", accountStatus);
                    });

                    CompactSectionTitle(col, "Security PIN Credential");
                    col.Item().PaddingVertical(4).AlignCenter()
                        .Text(pin).Bold().FontSize(16).FontColor(Colors.Black);
                    col.Item().Text(
                        "This Security PIN is confidential. Use it to sign in to the student portal after the registrar activates your account.")
                        .FontSize(8).FontColor(Colors.Grey.Darken2).LineHeight(1.2f);

                    CompactSectionTitle(col, "Account Activation Procedure");
                    CompactNumbered(col, 1, "Go to the ABEC Student Login page.");
                    CompactNumbered(col, 2, "Select Activate Account (or the account activation option).");
                    CompactNumbered(col, 3, "Enter your registered email address and the Security PIN shown above.");
                    CompactNumbered(col, 4, "Create your permanent password when prompted.");
                    CompactNumbered(col, 5, "Sign in to access your student dashboard.");

                    CompactSectionTitle(col, "Important Security Reminders");
                    CompactBullet(col, "Keep this Security PIN confidential at all times.");
                    CompactBullet(col, "Do not share your PIN or login credentials with anyone.");
                    CompactBullet(col, "This PIN remains valid for sign-in until the registrar replaces it or you enable username and password login.");
                    CompactBullet(col, "If you suspect unauthorized use, contact the ABEC Administration Office immediately.");

                    CompactSectionTitle(col, "Activation Record");
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(140);
                            c.RelativeColumn();
                        });

                        CompactTableHeader(table, "Information", "Details");
                        CompactInfoRow(table, "Security PIN Generated", pinGenerated);
                        CompactInfoRow(table, "Activation Status", accountStatus);
                        CompactInfoRow(table, "Generated By", "ABEC Administrator");
                    });

                    col.Item().PaddingTop(6).Text(
                        "This document serves as an official account activation notice issued by ABEC Institute of Business and Technology, Inc.")
                        .FontSize(8).Italic().FontColor(Colors.Grey.Darken2);

                    col.Item().PaddingTop(14).Row(sig =>
                    {
                        sig.RelativeItem().Text("Administrator Signature: ____________________").FontSize(8);
                        sig.RelativeItem().AlignRight().Text($"Date Issued: {issuedDate}").FontSize(8);
                    });
                });

                page.Footer().Column(footer =>
                {
                    footer.Item().LineHorizontal(0.6f).LineColor(Colors.Grey.Medium);
                    footer.Item().PaddingTop(4).AlignCenter()
                        .Text("ABEC Institute of Business and Technology, Inc. | Student Account Activation Notice")
                        .FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                });
            });
        }).GeneratePdf();
    }

    private byte[]? TryLoadLogo()
    {
        var candidates = new[]
        {
            Path.Combine(_env.WebRootPath, "images", "Photo5ABECOfficialSeal.png"),
            Path.Combine(_env.WebRootPath, "images", "Photo2ABECLogo.png")
        };

        foreach (var path in candidates)
        {
            try
            {
                if (File.Exists(path))
                    return File.ReadAllBytes(path);
            }
            catch
            {
                // Fall through to next candidate / text placeholder.
            }
        }

        return null;
    }

    private static string FormatPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return "N/A";
        var raw = pin.Trim().ToUpperInvariant();
        return raw;
    }

    private static void CompactSectionTitle(ColumnDescriptor col, string title)
    {
        col.Item().PaddingTop(8).PaddingBottom(3)
            .Text(title).Bold().FontSize(9.5f).FontColor(Color.FromHex(SectionBlueHex));
    }

    private static void CompactNumbered(ColumnDescriptor col, int n, string text)
    {
        col.Item().PaddingBottom(1.5f).Text($"{n}. {text}").FontSize(8.5f).LineHeight(1.15f);
    }

    private static void CompactBullet(ColumnDescriptor col, string text)
    {
        col.Item().PaddingBottom(1.5f).Text($"•  {text}").FontSize(8.5f).LineHeight(1.15f);
    }

    private static void CompactMetaRow(TableDescriptor table, string label, string value)
    {
        table.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(3).PaddingHorizontal(5)
            .Text(label).SemiBold().FontSize(8);
        table.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(3).PaddingHorizontal(5)
            .Text(value).FontSize(8);
    }

    private static void CompactTableHeader(TableDescriptor table, string left, string right)
    {
        table.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.Grey.Lighten3)
            .PaddingVertical(3).PaddingHorizontal(5)
            .Text(left).Bold().FontSize(8);
        table.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.Grey.Lighten3)
            .PaddingVertical(3).PaddingHorizontal(5)
            .Text(right).Bold().FontSize(8);
    }

    private static void CompactInfoRow(TableDescriptor table, string label, string value)
    {
        table.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(3).PaddingHorizontal(5)
            .Text(label).SemiBold().FontSize(8);
        table.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(3).PaddingHorizontal(5)
            .Text(value).FontSize(8);
    }
}
