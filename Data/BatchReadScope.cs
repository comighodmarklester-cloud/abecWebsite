using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Data;

public partial class ApplicationDbContext
{
    // Operational lists default to the active enrollment batch. History requires an explicit ID.
    // Zero deliberately matches nothing when no batch is active; never fall back to all records.
    internal async Task<int> ResolveReadBatchIdAsync(int? batchId, CancellationToken ct)
        => batchId ?? await Batches.AsNoTracking().Where(b => b.Status == "Active")
            .Select(b => (int?)b.BatchId).SingleOrDefaultAsync(ct) ?? 0;
}
