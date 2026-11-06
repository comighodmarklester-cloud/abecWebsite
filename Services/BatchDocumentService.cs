using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

/// <summary>The document records belonging to exactly one batch.</summary>
public sealed record BatchDocumentSnapshot(BatchDto Batch, bool ReadOnly,
    IReadOnlyList<ApplicantDto> Applicants, IReadOnlyList<StudentDto> Students,
    IReadOnlyList<ApplicantRegistrationDocumentDto> RegistrationDocuments,
    IReadOnlyList<DocumentRequestDto> Requests, IReadOnlyList<ArchiveDto> Archives);

public interface IBatchDocumentService
{
    Task<ApiResponse<BatchDocumentSnapshot>> GetAsync(int batchId, CancellationToken ct);
}

public sealed class BatchDocumentService(IBatchService batches,
    IApplicantService applicants, IActivationService students, IDocumentRequestService requests,
    IArchiveService archives) : IBatchDocumentService
{
    public async Task<ApiResponse<BatchDocumentSnapshot>> GetAsync(int batchId, CancellationToken ct)
    {
        var batch = (await batches.GetAllAsync(ct)).Data?.FirstOrDefault(b => b.BatchId == batchId);
        if (batch is null) return ApiResponse<BatchDocumentSnapshot>.Fail("Batch not found.");
        var a = (await applicants.GetApplicantsAsync(cancellationToken: ct, batchId: batchId)).Data?.Where(a => a.BatchId == batchId).ToList() ?? [];
        var s = (await students.GetAccountsAsync(cancellationToken: ct, batchId: batchId)).Data?.Where(s => s.BatchId == batchId).ToList() ?? [];
        var applicantIds = a.Select(a => a.ApplicantId).ToHashSet();
        var studentIds = s.Select(s => s.StudentId).ToHashSet();
        var documents = (await applicants.GetAllRegistrationDocumentsAsync(ct, batchId)).Data?.Where(d => applicantIds.Contains(d.ApplicantId)).ToList() ?? [];
        var r = (await requests.GetAllAsync(cancellationToken: ct, batchId: batchId)).Data?.Where(r => studentIds.Contains(r.StudentId)).ToList() ?? [];
        var ar = (await archives.GetAllAsync(cancellationToken: ct, batchId: batchId)).Data?.Where(a => studentIds.Contains(a.StudentId)).ToList() ?? [];
        return ApiResponse<BatchDocumentSnapshot>.Ok(new(batch, batch.Status != "Active", a, s, documents, r, ar));
    }
}
