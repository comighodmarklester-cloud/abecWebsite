using ABEC_System.DTOs;

namespace ABEC_System.Interfaces;

public interface IEmailService
{
    Task<EmailSendResult> SendAsync(
        string toEmail,
        string subject,
        string htmlBody,
        byte[]? pdfAttachment = null,
        string? attachmentFileName = null,
        CancellationToken cancellationToken = default);
}

public interface IEmailConfigService
{
    SmtpSettingsDto GetSettings();
    Task<ApiResponse<SmtpSettingsDto>> SaveSettingsAsync(UpdateSmtpSettingsDto dto, CancellationToken cancellationToken = default);
}

public interface IPdfService
{
    byte[] GenerateApplicationFormPdf(Models.Applicant applicant);
    byte[] GenerateActivationNoticePdf(Models.Student student);
}
