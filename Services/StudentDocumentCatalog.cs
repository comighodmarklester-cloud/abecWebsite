using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public sealed class StudentDocumentCatalog(ApplicationDbContext db)
{
    public async Task<IReadOnlyList<StudentDocumentCatalogItemDto>> GetAsync(int studentId, CancellationToken ct)
    {
        var verified = await db.StudentDocumentEligibilities.AsNoTracking().SingleOrDefaultAsync(e => e.StudentId == studentId, ct);
        var requests = await db.DocumentRequests.AsNoTracking().Where(r => r.StudentId == studentId).OrderByDescending(r => r.RequestDate).ThenByDescending(r => r.RequestId).ToListAsync(ct);
        var documents = await db.StudentCourseDocuments.AsNoTracking().Where(d => d.StudentId == studentId).ToListAsync(ct);
        return SystemConstants.DocumentStatuses.PostCourseCredentials.Select(type =>
        {
            var related = requests.Where(r => SystemConstants.DocumentStatuses.SameCourseDocument(r.DocumentType, type)).ToList();
            var latest = related.FirstOrDefault();
            var releasedRequest = related.FirstOrDefault(r => r.RequestStatus == "Released");
            var releasedDocument = documents.FirstOrDefault(d => SystemConstants.DocumentStatuses.SameCourseDocument(d.DocumentType, type) && d.PreparationStatus == "Released");
            var open = related.Any(r => r.RequestStatus is not ("Released" or "Rejected"));
            var blocked = releasedRequest is not null || releasedDocument is not null ? "This document has already been released."
                : open ? "You already have an open request for this document."
                : type == "Payment Receipt" && verified?.FeesPaidAt is null ? "The registrar must verify that all required fees have been paid."
                : type == "Certificate of Completion" && (verified?.TrainingCompletedAt is null || verified.AssessmentCompletedAt is null)
                    ? "The registrar must verify your individual training and assessment completion." : null;
            return new StudentDocumentCatalogItemDto
            {
                DocumentType = type, Description = type, CanRequest = blocked is null, RequestBlockedMessage = blocked,
                RequestId = latest?.RequestId, Status = releasedRequest is not null || releasedDocument is not null ? "Released" : latest?.RequestStatus ?? "Not Requested",
                Reason = latest?.Reason, SpecificReason = latest?.SpecificReason, HoldReason = latest?.HoldReason,
                RequestDate = latest?.RequestDate, ReleaseDate = releasedDocument?.ReleasedAt ?? releasedRequest?.ReleaseDate,
                DownloadUrl = releasedDocument?.StoredPath is not null ? $"/api/course-documents/{releasedDocument.CourseDocumentId}/file"
                    : releasedRequest?.ReleaseStoredPath is not null ? $"/api/document-requests/{releasedRequest.RequestId}/file" : null
            };
        }).ToList();
    }

    public async Task<StudentDocumentEligibility?> GetVerificationAsync(int studentId, CancellationToken ct)
        => await db.StudentDocumentEligibilities.AsNoTracking().SingleOrDefaultAsync(e => e.StudentId == studentId, ct);

    public async Task<ApiResponse<StudentDocumentEligibility>> VerifyAsync(int studentId, int adminId, UpdateDocumentEligibilityDto dto, CancellationToken ct)
    {
        if (!await db.Admins.AnyAsync(a => a.AdminId == adminId, ct)) return ApiResponse<StudentDocumentEligibility>.Fail("Administrator permission is required.");
        if (!await db.Students.AnyAsync(s => s.StudentId == studentId, ct)) return ApiResponse<StudentDocumentEligibility>.Fail("Student not found.");
        var row = await db.StudentDocumentEligibilities.SingleOrDefaultAsync(e => e.StudentId == studentId, ct);
        if (row is null) { row = new() { StudentId = studentId }; db.StudentDocumentEligibilities.Add(row); }
        var now = DateTime.UtcNow;
        row.FeesPaidAt = dto.FeesPaid ? row.FeesPaidAt ?? now : null;
        row.TrainingCompletedAt = dto.TrainingCompleted ? row.TrainingCompletedAt ?? now : null;
        row.AssessmentCompletedAt = dto.AssessmentCompleted ? row.AssessmentCompletedAt ?? now : null;
        row.VerifiedByAdminId = adminId; row.UpdatedAt = now;
        db.AdminActivityLogs.Add(new() { AdminId = adminId, Action = $"Eligibility student {studentId}: fees={dto.FeesPaid}, training={dto.TrainingCompleted}, assessment={dto.AssessmentCompleted}", CreatedAt = now });
        await db.SaveChangesAsync(ct);
        return ApiResponse<StudentDocumentEligibility>.Ok(row, "Individual document eligibility saved.");
    }
}
