using ABEC_System.Interfaces;

namespace ABEC_System.Services;

// Expire unattended offers even when no administrator has the applicants page open.
public sealed class SlotOfferExpiryWorker(IServiceScopeFactory scopes, ILogger<SlotOfferExpiryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<IApplicantService>().ExpireSlotOffersAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError("Unable to expire slot offers ({ErrorType}); retrying on the next interval.", ex.GetType().Name); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
