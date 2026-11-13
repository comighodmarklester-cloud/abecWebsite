using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using ABEC_System.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Net;
using System.Security.Cryptography;

namespace ABEC_System.Services;

public class ApplicantService : IApplicantService
{
    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IEmailService _email;
    private readonly IPdfService _pdf;
    private readonly IOptionsMonitor<AppSettings> _app;
    private readonly ApplicantRegistrationStorageService _registrationStorage;
    private readonly bool _development;

    public ApplicantService(
        ApplicationDbContext db,
        INotificationService notifications,
        IEmailService email,
        IPdfService pdf,
        IOptionsMonitor<AppSettings> app,
        IHttpContextAccessor httpContextAccessor,
        ApplicantRegistrationStorageService registrationStorage,
        IWebHostEnvironment? environment = null)
    {
        _db = db;
        _notifications = notifications;
        _email = email;
        _pdf = pdf;
        _app = app;
        _registrationStorage = registrationStorage;
        _development = environment?.IsDevelopment() == true;
    }

    public async Task<ApiResponse<DashboardStatsDto>> GetDashboardStatsAsync(CancellationToken cancellationToken = default, int? batchId = null)
    {
        batchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        var applicants = _db.Applicants.Where(a => a.BatchId == batchId);
        var students = _db.Students.Where(s => s.BatchId == batchId);
        var documents = _db.DocumentRequests.Where(r => r.Student!.BatchId == batchId);
        var schedules = _db.CourseSchedules.Where(s => s.BatchId == batchId);
        var stats = new DashboardStatsDto
        {
            TotalApplicants = await applicants.CountAsync(cancellationToken),
            Pending = await applicants.CountAsync(a => a.ApplicationStatus == SystemConstants.ApplicationStatuses.Pending, cancellationToken),
            Waitlisted = await applicants.CountAsync(a => a.ApplicationStatus == SystemConstants.ApplicationStatuses.Waitlisted, cancellationToken),
            Approved = await applicants.CountAsync(a =>
                a.ApplicationStatus == SystemConstants.ApplicationStatuses.Approved ||
                a.ApplicationStatus == SystemConstants.ApplicationStatuses.Confirmed ||
                a.ApplicationStatus == SystemConstants.ApplicationStatuses.ConfirmedLegacy, cancellationToken),
            Rejected = await applicants.CountAsync(a =>
                a.ApplicationStatus == SystemConstants.ApplicationStatuses.Rejected
                || a.ApplicationStatus == SystemConstants.ApplicationStatuses.Declined, cancellationToken),
            ActiveStudents = await students.CountAsync(s => s.AccountStatus == SystemConstants.AccountStatuses.Active, cancellationToken),
            EnrolledStudents = await students.CountAsync(cancellationToken),
            AwaitingActivation = await students.CountAsync(s => s.AccountStatus != SystemConstants.AccountStatuses.Active, cancellationToken),
            AvailableCourses = await _db.Courses.CountAsync(c => c.Status == SystemConstants.CourseStatuses.Available, cancellationToken),
            PendingDocuments = await documents.CountAsync(r =>
                r.RequestStatus == SystemConstants.DocumentStatuses.Pending
                || r.RequestStatus == SystemConstants.DocumentStatuses.Processing
                || r.RequestStatus == SystemConstants.DocumentStatuses.OnHold
                || r.RequestStatus == SystemConstants.DocumentStatuses.ReadyForRelease, cancellationToken),
            ReleasedDocuments = await documents.CountAsync(r =>
                r.RequestStatus == SystemConstants.DocumentStatuses.Released, cancellationToken),
            ReadyToReleaseDocuments = await documents.CountAsync(r => r.RequestStatus == SystemConstants.DocumentStatuses.ReadyForRelease, cancellationToken),
            UpcomingSchedules = await schedules.CountAsync(s =>
                s.Status == SystemConstants.ScheduleStatuses.Active && s.ScheduleDate >= DateTime.Today, cancellationToken)
        };
        return ApiResponse<DashboardStatsDto>.Ok(stats);
    }

    public async Task<ApiResponse<IReadOnlyList<ApplicantDto>>> GetApplicantsAsync(
        string? status = null, int? courseId = null, string? search = null, int? take = null, CancellationToken cancellationToken = default, int? batchId = null)
    {
        var query = _db.Applicants.AsNoTracking()
            .Include(a => a.Course)
            .Include(a => a.Batch)
            .Include(a => a.Student)
            .Include(a => a.RegistrationDocuments)
            .AsQueryable();

        var selectedBatchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        query = query.Where(a => a.BatchId == selectedBatchId);
        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(status, "approved", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.ApplicationStatus == SystemConstants.ApplicationStatuses.Approved
                    || a.ApplicationStatus == SystemConstants.ApplicationStatuses.Confirmed
                    || a.ApplicationStatus == SystemConstants.ApplicationStatuses.ConfirmedLegacy
                    || a.ApplicationStatus == SystemConstants.ApplicationStatuses.Expired);
            else if (string.Equals(status, "rejected", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.ApplicationStatus == SystemConstants.ApplicationStatuses.Rejected
                    || a.ApplicationStatus == SystemConstants.ApplicationStatuses.Declined);
            else
                query = query.Where(a => a.ApplicationStatus == NormalizeStatus(status) || a.ApplicationStatus == status);
        }

        if (courseId.HasValue)
            query = query.Where(a => a.CourseId == courseId.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            var idMatch = int.TryParse(term, out var applicantId);
            query = query.Where(a =>
                a.FirstName.ToLower().Contains(term) ||
                a.LastName.ToLower().Contains(term) ||
                (a.FirstName + " " + a.LastName).ToLower().Contains(term) ||
                (a.FirstName + " " + (a.MiddleName ?? "") + " " + a.LastName).ToLower().Contains(term) ||
                a.Email.ToLower().Contains(term) ||
                (a.ApplicationReference != null && a.ApplicationReference.ToLower().Contains(term)) ||
                (idMatch && a.ApplicantId == applicantId));
        }

        query = query.OrderByDescending(a => a.ApplicationDate);
        if (take.HasValue) query = query.Take(take.Value);

        var list = await query.ToListAsync(cancellationToken);
        foreach (var item in list)
        {
            // Detached list — expire via tracked reload when needed for display accuracy.
            if (item.ApplicationStatus == SystemConstants.ApplicationStatuses.Approved
                && item.ResponseDeadline.HasValue
                && DateTime.Now > item.ResponseDeadline.Value
                && !item.ConfirmedAt.HasValue
                && !item.DeclinedAt.HasValue)
            {
                var tracked = await _db.Applicants.Include(a => a.Course)
                    .FirstOrDefaultAsync(a => a.ApplicantId == item.ApplicantId, cancellationToken);
                if (tracked is not null)
                {
                    await EnsureExpiredIfNeededAsync(tracked, cancellationToken);
                    item.ApplicationStatus = tracked.ApplicationStatus;
                    item.SlotResponse = tracked.SlotResponse;
                }
            }
        }

        return ApiResponse<IReadOnlyList<ApplicantDto>>.Ok(list.Select(Map).ToList());
    }

    public async Task<ApiResponse<ApplicantDto>> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var applicant = await _db.Applicants.AsNoTracking()
            .Include(a => a.Course)
            .Include(a => a.Batch)
            .Include(a => a.Student)
            .Include(a => a.RegistrationDocuments)
            .FirstOrDefaultAsync(a => a.ApplicantId == id, cancellationToken);

        return applicant is null
            ? ApiResponse<ApplicantDto>.Fail("Applicant not found.")
            : ApiResponse<ApplicantDto>.Ok(Map(applicant));
    }

    public async Task<ApiResponse<ApplicantDto>> UpdateRegistrationAsync(int id, UpdateApplicantRegistrationDto dto, CancellationToken cancellationToken = default)
    {
        var applicant = await _db.Applicants
            .Include(a => a.Course)
            .Include(a => a.Batch)
            .Include(a => a.Student)
            .Include(a => a.RegistrationDocuments)
            .FirstOrDefaultAsync(a => a.ApplicantId == id, cancellationToken);
        if (applicant is null)
            return ApiResponse<ApplicantDto>.Fail("Applicant not found.");

        if (!IsValidNamePart(dto.FirstName) || !IsValidNamePart(dto.LastName) ||
            (!string.IsNullOrWhiteSpace(dto.MiddleName) && !IsValidNamePart(dto.MiddleName)) ||
            (!string.IsNullOrWhiteSpace(dto.Suffix) && !IsValidNamePart(dto.Suffix)))
            return ApiResponse<ApplicantDto>.Fail("Numbers and invalid special characters are not allowed. Use letters, spaces, and normal name punctuation.");

        var genders = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Male", "Female", "Prefer not to say", "Prefer Not to Say" };
        if (string.IsNullOrWhiteSpace(dto.Gender) || !genders.Contains(dto.Gender.Trim()))
            return ApiResponse<ApplicantDto>.Fail("Please select a valid sex.");

        var birthdate = dto.Birthdate.Date;
        if (birthdate > DateTime.Today)
            return ApiResponse<ApplicantDto>.Fail("Birthdate cannot be in the future.");
        var age = CalculateAge(birthdate, DateTime.Today);
        if (age < 18 || age > 100)
            return ApiResponse<ApplicantDto>.Fail("Please enter a birthdate for a person who is at least 18 years old.");

        var email = dto.Email.Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"))
            return ApiResponse<ApplicantDto>.Fail("Please enter a valid email address.");
        var emailTaken = await _db.Applicants.AnyAsync(a => a.ApplicantId != id && a.BatchId == applicant.BatchId && a.Email.ToLower() == email.ToLower(), cancellationToken);
        if (emailTaken)
            return ApiResponse<ApplicantDto>.Fail("Another record in this batch already uses this email address.");

        var contact = dto.ContactNumber.Trim();
        if (System.Text.RegularExpressions.Regex.IsMatch(contact, @"^09\d{9}$"))
            contact = "+63" + contact[1..];
        if (!System.Text.RegularExpressions.Regex.IsMatch(contact, @"^\+639\d{9}$"))
            return ApiResponse<ApplicantDto>.Fail("Contact number must be an 11-digit mobile number starting with 09 (example: 09171234567).");

        var street = dto.StreetDetails.Trim();
        var barangay = AddressFormatting.Barangay(dto.Barangay);
        var city = dto.CityMunicipality.Trim();
        var province = dto.Province.Trim();
        if (street.Length == 0 || barangay.Length == 0 || city.Length == 0 || province.Length == 0)
            return ApiResponse<ApplicantDto>.Fail("Please complete the street, barangay, municipality or city, and province.");
        if (province.Length > 100 || city.Length > 100 || barangay.Length > 150 || street.Length > 255)
            return ApiResponse<ApplicantDto>.Fail("Please check the address fields and try again.");

        string? ChoiceOrKeep(string? value, string? current, string[] allowed, string label)
        {
            var trimmed = TrimOrNull(value);
            if (trimmed is null || trimmed.Equals("N/A", StringComparison.OrdinalIgnoreCase)) return null;
            if (allowed.Contains(trimmed, StringComparer.OrdinalIgnoreCase))
                return allowed.First(item => item.Equals(trimmed, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(current) && current.Trim().Equals(trimmed, StringComparison.OrdinalIgnoreCase))
                return current.Trim();
            throw new InvalidOperationException(label);
        }

        string? civil;
        string? education;
        string? employment;
        string? qualification;
        string? classification;
        string? identity;
        try
        {
            civil = ChoiceOrKeep(dto.CivilStatus, applicant.CivilStatus, SystemConstants.RegistrationChoices.CivilStatuses, "civil status");
            education = ChoiceOrKeep(dto.EducationLevel, applicant.EducationLevel, SystemConstants.RegistrationChoices.EducationLevels, "educational attainment");
            employment = ChoiceOrKeep(dto.EmploymentStatus, applicant.EmploymentStatus, SystemConstants.RegistrationChoices.EmploymentStatuses, "employment status");
            qualification = ChoiceOrKeep(dto.QualificationType, applicant.QualificationType, SystemConstants.RegistrationChoices.QualificationTypes, "training type");
            classification = ChoiceOrKeep(dto.ApplicantClassification, applicant.ApplicantClassification, SystemConstants.RegistrationChoices.Classifications, "applicant classification");
            identity = ChoiceOrKeep(dto.IdentityIdType, applicant.IdentityIdType, SystemConstants.IdentityIdTypes.All, "identity document");
        }
        catch (InvalidOperationException ex)
        {
            return ApiResponse<ApplicantDto>.Fail("Please select a valid " + ex.Message + ".");
        }

        if (education is not null && education.Equals("Others", StringComparison.OrdinalIgnoreCase) && !IsMeaningful(dto.EducationSpecification))
            return ApiResponse<ApplicantDto>.Fail("Please specify the educational attainment.");
        if (qualification is not null && qualification.Equals("COC", StringComparison.OrdinalIgnoreCase) && !IsMeaningful(dto.CocSpecification))
            return ApiResponse<ApplicantDto>.Fail("Please specify the COC qualification.");

        var district = TrimOrNull(dto.AddressDistrict);
        if (district is not null && district.Equals("N/A", StringComparison.OrdinalIgnoreCase)) district = null;
        string? region = null;
        if (!string.IsNullOrWhiteSpace(dto.AddressRegion))
        {
            var match = SystemConstants.RegistrationChoices.Regions.FirstOrDefault(r =>
                r.Name.Equals(dto.AddressRegion.Trim(), StringComparison.OrdinalIgnoreCase)
                || r.Code.Equals(dto.AddressRegion.Trim(), StringComparison.OrdinalIgnoreCase));
            if (match.Name is null)
                return ApiResponse<ApplicantDto>.Fail("Please select a valid region.");
            region = match.Name;
        }
        var zip = TrimOrNull(dto.ZipCode);
        if (zip is not null && !System.Text.RegularExpressions.Regex.IsMatch(zip, @"^\d{4}$"))
            return ApiResponse<ApplicantDto>.Fail("ZIP code must be 4 digits.");

        string? OptionalContact(string? value)
        {
            var trimmed = TrimOrNull(value);
            if (trimmed is null || trimmed.Equals("N/A", StringComparison.OrdinalIgnoreCase)) return null;
            return trimmed;
        }

        var addressParts = new List<string> { street, barangay };
        if (!string.IsNullOrWhiteSpace(district)) addressParts.Add(district);
        addressParts.Add(city);
        addressParts.Add(province);
        if (!string.IsNullOrWhiteSpace(region)) addressParts.Add(region);
        if (!string.IsNullOrWhiteSpace(zip)) addressParts.Add(zip);

        applicant.FirstName = NormalizeNamePart(dto.FirstName);
        applicant.MiddleName = string.IsNullOrWhiteSpace(dto.MiddleName) ? null : NormalizeNamePart(dto.MiddleName);
        applicant.LastName = NormalizeNamePart(dto.LastName);
        applicant.Suffix = string.IsNullOrWhiteSpace(dto.Suffix) ? null : NormalizeNamePart(dto.Suffix);
        applicant.Gender = dto.Gender.Trim().Equals("Prefer not to say", StringComparison.OrdinalIgnoreCase) ? "Prefer Not to Say" : dto.Gender.Trim();
        applicant.Birthdate = birthdate;
        applicant.Age = age;
        applicant.CivilStatus = civil;
        applicant.BirthPlace = TrimOrNull(dto.BirthPlace);
        applicant.Email = email;
        applicant.ContactNumber = contact;
        applicant.Telephone = OptionalContact(dto.Telephone);
        applicant.Fax = OptionalContact(dto.Fax);
        applicant.OtherContact = OptionalContact(dto.OtherContact);
        applicant.StreetDetails = street;
        applicant.Barangay = barangay;
        applicant.CityMunicipality = city;
        applicant.Province = province;
        applicant.AddressDistrict = district;
        applicant.AddressRegion = region;
        applicant.ZipCode = zip;
        applicant.Address = string.Join(", ", addressParts);
        applicant.EducationLevel = education;
        applicant.EducationSpecification = education is not null && education.Equals("Others", StringComparison.OrdinalIgnoreCase)
            ? TrimOrNull(dto.EducationSpecification)
            : null;
        applicant.SchoolName = TrimOrNull(dto.SchoolName);
        applicant.SchoolAddress = TrimOrNull(dto.SchoolAddress);
        applicant.QualificationType = qualification;
        applicant.CocSpecification = qualification is not null && qualification.Equals("COC", StringComparison.OrdinalIgnoreCase)
            ? TrimOrNull(dto.CocSpecification)
            : null;
        applicant.ApplicantClassification = classification;
        applicant.EmploymentStatus = employment;
        applicant.IdentityIdType = identity;

        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse<ApplicantDto>.Ok(Map(applicant), "Registration information saved.");
    }

    public async Task<ApiResponse<ApplicantDto>> EnrollAsync(EnrollApplicantDto dto, CancellationToken cancellationToken = default)
    {
        await using var registrationTransaction = _db.Database.CurrentTransaction is null
            ? await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken) : null;
        var course = await ResolveCourseAsync(dto.CourseId, dto.CourseName, cancellationToken);
        if (course is null)
            return ApiResponse<ApplicantDto>.Fail("Selected course was not found. Please choose a valid course.");

        if (!dto.PrivacyNoticeAcknowledged)
            return ApiResponse<ApplicantDto>.Fail("Please acknowledge that you have read and understood the Data Privacy Notice before submitting.");

        if (string.IsNullOrWhiteSpace(dto.FirstName) || string.IsNullOrWhiteSpace(dto.LastName) ||
            string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.ContactNumber) ||
            string.IsNullOrWhiteSpace(dto.Province) || string.IsNullOrWhiteSpace(dto.CityMunicipality) ||
            string.IsNullOrWhiteSpace(dto.Barangay) || string.IsNullOrWhiteSpace(dto.StreetDetails) ||
            string.IsNullOrWhiteSpace(dto.Gender) || !dto.Birthdate.HasValue || !dto.Age.HasValue)
            return ApiResponse<ApplicantDto>.Fail("Please complete all required registration fields.");

        var allowedGenders = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Male", "Female", "Prefer not to say", "Prefer Not to Say"
        };
        if (!allowedGenders.Contains(dto.Gender.Trim()))
            return ApiResponse<ApplicantDto>.Fail("Please select a valid gender.");

        var birthdate = dto.Birthdate.Value.Date;
        var today = DateTime.Today;
        if (birthdate > today)
            return ApiResponse<ApplicantDto>.Fail("Birthdate cannot be in the future.");
        var expectedAge = CalculateAge(birthdate, today);
        if (expectedAge > 100)
            return ApiResponse<ApplicantDto>.Fail("Please enter a valid birthdate.");
        if (!dto.Age.HasValue)
            return ApiResponse<ApplicantDto>.Fail("Please enter your age.");
        var enteredAge = dto.Age.Value;
        if (enteredAge < 18)
            return ApiResponse<ApplicantDto>.Fail("You must be at least 18 years old to register.");
        if (enteredAge != expectedAge)
            return ApiResponse<ApplicantDto>.Fail("The age you entered does not match your date of birth.");
        if (expectedAge < 18)
            return ApiResponse<ApplicantDto>.Fail("You must be at least 18 years old to register.");

        var age = expectedAge;

        if (!IsValidNamePart(dto.FirstName) || !IsValidNamePart(dto.LastName) ||
            (!string.IsNullOrWhiteSpace(dto.MiddleName) && !IsValidNamePart(dto.MiddleName)) ||
            (!string.IsNullOrWhiteSpace(dto.Suffix) && !IsValidNamePart(dto.Suffix)))
            return ApiResponse<ApplicantDto>.Fail("Numbers and invalid special characters are not allowed. Use letters, spaces, and normal name punctuation.");

        if (!dto.Email.Contains('@') || !System.Text.RegularExpressions.Regex.IsMatch(dto.Email.Trim(), @"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"))
            return ApiResponse<ApplicantDto>.Fail("Please enter a valid email address.");

        var contact = dto.ContactNumber.Trim();
        if (System.Text.RegularExpressions.Regex.IsMatch(contact, @"^09\d{9}$"))
            contact = "+63" + contact[1..];
        if (!System.Text.RegularExpressions.Regex.IsMatch(contact, @"^\+639\d{9}$"))
            return ApiResponse<ApplicantDto>.Fail("Contact number must be an 11-digit mobile number starting with 09 (example: 09171234567).");

        var activeBatch = await _db.Batches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.Status == SystemConstants.BatchStatuses.Active, cancellationToken);
        if (activeBatch is null) return ApiResponse<ApplicantDto>.Fail("No active batch is available for registration.");
        var email = dto.Email.Trim().ToLowerInvariant();
        await _db.ValidateContactAsync(new Applicant { BatchId = activeBatch.BatchId, Email = email, ContactNumber = contact }, cancellationToken);

        var province = dto.Province.Trim();
        var city = dto.CityMunicipality.Trim();
        var barangay = AddressFormatting.Barangay(dto.Barangay);
        var street = dto.StreetDetails.Trim();
        if (province.Length > 100 || city.Length > 100 || barangay.Length > 150 || street.Length > 255)
            return ApiResponse<ApplicantDto>.Fail("Please check the address fields and try again.");

        var profileError = ValidateRegistrationProfile(dto, street, barangay, city, province);
        if (profileError is not null)
            return ApiResponse<ApplicantDto>.Fail(profileError);

        var district = TrimOrNull(dto.AddressDistrict);
        var officialRegion = SystemConstants.RegistrationChoices.Regions.First(r =>
            r.Name.Equals(dto.AddressRegion?.Trim(), StringComparison.OrdinalIgnoreCase)
            || r.Code.Equals(dto.AddressRegionCode?.Trim(), StringComparison.OrdinalIgnoreCase));
        var region = officialRegion.Name;
        var regionCode = officialRegion.Code;
        var zip = TrimOrNull(dto.ZipCode);
        var addressParts = new List<string> { street, barangay };
        if (!string.IsNullOrWhiteSpace(district)) addressParts.Add(district);
        addressParts.Add(city);
        addressParts.Add(province);
        if (!string.IsNullOrWhiteSpace(region)) addressParts.Add(region);
        if (!string.IsNullOrWhiteSpace(zip)) addressParts.Add(zip);
        var fullAddress = string.Join(", ", addressParts);



        var applicant = new Applicant
        {
            FirstName = NormalizeNamePart(dto.FirstName),
            MiddleName = string.IsNullOrWhiteSpace(dto.MiddleName) ? null : NormalizeNamePart(dto.MiddleName),
            LastName = NormalizeNamePart(dto.LastName),
            Suffix = string.IsNullOrWhiteSpace(dto.Suffix) ? null : NormalizeNamePart(dto.Suffix),
            Gender = dto.Gender.Trim().Equals("Prefer not to say", StringComparison.OrdinalIgnoreCase)
                ? "Prefer Not to Say"
                : dto.Gender.Trim(),
            Birthdate = birthdate,
            Age = age,
            ContactNumber = contact,
            Email = dto.Email.Trim(),
            Address = fullAddress,
            Province = province,
            CityMunicipality = city,
            Barangay = barangay,
            StreetDetails = street,
            CourseId = course.CourseId,
            BatchId = activeBatch.BatchId,
            ApplicationStatus = SystemConstants.ApplicationStatuses.Pending,
            ApplicationDate = DateTime.Now,
            TesdaScreeningStatus = NormalizeScreeningStatus(dto.TesdaScreeningStatus),
            TesdaScreeningSummary = dto.TesdaScreeningSummary,
            TesdaPreviouslyEnrolled = dto.TesdaPreviouslyEnrolled,
            TesdaPreviousCourse = dto.TesdaPreviousCourse,
            TesdaPreviousInstitution = dto.TesdaPreviousInstitution,
            TesdaPreviousStatus = dto.TesdaPreviousStatus,
            TesdaPreviousYear = dto.TesdaPreviousYear,
            TesdaCurrentlyEnrolled = dto.TesdaCurrentlyEnrolled,
            TesdaCompletedQualification = dto.TesdaCompletedQualification,
            TesdaCompletedQualificationName = dto.TesdaCompletedQualificationName,
            IdentityIdType = dto.IdentityIdType,
            IdentityIdNumber = null,
            SchoolName = TrimOrNull(dto.SchoolName),
            SchoolAddress = TrimOrNull(dto.SchoolAddress),
            QualificationType = TrimOrNull(dto.QualificationType),
            CocSpecification = string.Equals(TrimOrNull(dto.QualificationType), "COC", StringComparison.OrdinalIgnoreCase)
                ? TrimOrNull(dto.CocSpecification)
                : null,
            ApplicantClassification = TrimOrNull(dto.ApplicantClassification),
            CivilStatus = TrimOrNull(dto.CivilStatus),
            BirthPlace = TrimOrNull(dto.BirthPlace),
            Telephone = TrimOrNull(dto.Telephone),
            Fax = TrimOrNull(dto.Fax),
            OtherContact = TrimOrNull(dto.OtherContact),
            EducationLevel = TrimOrNull(dto.EducationLevel),
            EducationSpecification = string.Equals(TrimOrNull(dto.EducationLevel), "Others", StringComparison.OrdinalIgnoreCase)
                ? TrimOrNull(dto.EducationSpecification)
                : null,
            EmploymentStatus = TrimOrNull(dto.EmploymentStatus),
            AddressDistrict = district,
            AddressRegion = region,
            AddressRegionCode = regionCode,
            ZipCode = zip,
            EmailNotificationStatus = "Pending"
        };

        _db.Applicants.Add(applicant);
        await _db.SaveChangesAsync(cancellationToken);
        applicant.ApplicationReference = $"ABEC-{applicant.ApplicationDate:yyyy}-{applicant.ApplicantId:D4}";
        await _db.SaveChangesAsync(cancellationToken);

        await _notifications.CreateAsync(
            "Application Received",
            "Your enrollment application has been submitted and is pending review.",
            applicantId: applicant.ApplicantId,
            cancellationToken: cancellationToken);

        var adminMessage = $"{applicant.FullName} submitted an enrollment application for {course.CourseName}.";
        if (!string.IsNullOrWhiteSpace(applicant.TesdaScreeningStatus)
            && !string.Equals(applicant.TesdaScreeningStatus, SystemConstants.TesdaScreeningStatuses.NoPotentialConflict, StringComparison.OrdinalIgnoreCase))
        {
            adminMessage += $" TESDA screening flag: {applicant.TesdaScreeningStatus}.";
            if (!string.IsNullOrWhiteSpace(applicant.TesdaScreeningSummary))
                adminMessage += " " + applicant.TesdaScreeningSummary;
        }

        await _notifications.CreateAdminAsync(
            "New Applicant Registration",
            adminMessage,
            applicant.ApplicantId,
            cancellationToken);

        await _db.Entry(applicant).Reference(a => a.Course).LoadAsync(cancellationToken);
        if (registrationTransaction is not null) await registrationTransaction.CommitAsync(cancellationToken);
        return ApiResponse<ApplicantDto>.Ok(Map(applicant), "Your application has been submitted successfully and is pending ABEC review.");
    }

    public async Task<ApiResponse<ApplicantDto>> EnrollWithDocumentsAsync(
        EnrollApplicantDto dto,
        IReadOnlyList<IFormFile> credentialFiles,
        IFormFile? identityFile,
        CancellationToken cancellationToken = default)
    {
        var enroll = await EnrollAsync(dto, cancellationToken);
        if (!enroll.Success || enroll.Data is null)
            return enroll;

        var store = await _registrationStorage.SaveEnrollmentDocumentsAsync(
            enroll.Data.ApplicantId,
            credentialFiles,
            identityFile,
            dto.CredentialDocumentTypes,
            cancellationToken);

        if (!store.Success)
        {
            var refreshedOnFail = await GetByIdAsync(enroll.Data.ApplicantId, cancellationToken);
            var fileMessage = enroll.Message + " However, some uploaded files could not be saved: " + store.Message;
            return refreshedOnFail.Success && refreshedOnFail.Data is not null
                ? ApiResponse<ApplicantDto>.Ok(refreshedOnFail.Data, fileMessage)
                : ApiResponse<ApplicantDto>.Fail(store.Message);
        }

        var emailNote = await TrySendRegistrationConfirmationAsync(enroll.Data.ApplicantId, cancellationToken);
        var refreshed = await GetByIdAsync(enroll.Data.ApplicantId, cancellationToken);
        var message = enroll.Message;
        if (!string.IsNullOrWhiteSpace(refreshed.Data?.ApplicationReference))
            message += " Reference: " + refreshed.Data.ApplicationReference + ".";
        if (!string.IsNullOrWhiteSpace(emailNote))
            message += " " + emailNote;
        return refreshed.Success && refreshed.Data is not null
            ? ApiResponse<ApplicantDto>.Ok(refreshed.Data, message)
            : enroll;
    }

    private async Task<string> TrySendRegistrationConfirmationAsync(int applicantId, CancellationToken cancellationToken)
    {
        var applicant = await _db.Applicants.Include(a => a.Course)
            .FirstOrDefaultAsync(a => a.ApplicantId == applicantId, cancellationToken);
        if (applicant is null)
            return "The confirmation email could not be prepared. Your application is already saved.";

        try
        {
            var pdf = _pdf.GenerateApplicationFormPdf(applicant);
            var fileName = $"{applicant.ApplicationReference ?? "ABEC-Application"}.pdf";
            var office = SystemConstants.AbecOffice.Address;
            var body = $"""
                <p>Hello {WebUtility.HtmlEncode(applicant.FirstName)},</p>
                <p>ABEC has received your enrollment application. Your reference number is <strong>{WebUtility.HtmlEncode(applicant.ApplicationReference)}</strong>. Your current status is <strong>{WebUtility.HtmlEncode(applicant.ApplicationStatus)}</strong>.</p>
                <p>Your application form is attached when this message includes the PDF. Please print the application form and submit it to the ABEC office:</p>
                <p>{WebUtility.HtmlEncode(office)}<br>122 Peñaranda Street, Legazpi, Bicol</p>
                <p>If all available slots are already filled, ABEC will notify you through email. Please wait for the official confirmation of your application status.</p>
                """;
            var sent = await _email.SendAsync(
                applicant.Email,
                "ABEC enrollment application received",
                body,
                pdf,
                fileName,
                cancellationToken);
            applicant.EmailNotificationStatus = sent.Sent ? "Sent" : "Failed";
            await _db.SaveChangesAsync(cancellationToken);
            return sent.Sent
                ? "A confirmation email with your application form was sent."
                : "Your application was saved. The confirmation email could not be delivered; ABEC will follow up. Please do not submit again.";
        }
        catch (Exception ex)
        {
            applicant.EmailNotificationStatus = "Failed";
            await _db.SaveChangesAsync(cancellationToken);
            _ = ex;
            return "Your application was saved. The confirmation email could not be delivered; ABEC will follow up. Please do not submit again.";
        }
    }

    public Task<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>> GetRegistrationDocumentsAsync(
        int applicantId,
        CancellationToken cancellationToken = default)
        => _registrationStorage.ListForApplicantAsync(applicantId, cancellationToken);

    public Task<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>> GetAllRegistrationDocumentsAsync(CancellationToken cancellationToken = default, int? batchId = null)
        => _registrationStorage.ListAllAsync(cancellationToken, batchId);

    public async Task<(byte[]? Pdf, string? FileName, string? Error)> GetApplicationFormPdfAsync(int applicantId, CancellationToken cancellationToken = default)
    {
        var applicant = await _db.Applicants.AsNoTracking()
            .Include(a => a.Course)
            .FirstOrDefaultAsync(a => a.ApplicantId == applicantId, cancellationToken);
        if (applicant is null)
            return (null, null, "Applicant not found.");

        var pdf = _pdf.GenerateApplicationFormPdf(applicant);
        var fileName = $"ABEC-Application-Form-{applicant.ApplicantId}.pdf";
        return (pdf, fileName, null);
    }

    public async Task<ApiResponse<ApplicantDto>> UpdateStatusAsync(int id, string status, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeStatus(status);
        if (normalized is null)
            return ApiResponse<ApplicantDto>.Fail("Invalid application status.");

        await using var workflowLock = await SlotWorkflowLock.AcquireAsync(_db, "applicant:" + id, cancellationToken);
        var applicant = await _db.Applicants.Include(a => a.Course).Include(a => a.Student)
            .FirstOrDefaultAsync(a => a.ApplicantId == id, cancellationToken);
        if (applicant is null)
            return ApiResponse<ApplicantDto>.Fail("Applicant not found.");

        await _db.Entry(applicant).ReloadAsync(cancellationToken);
        await _db.RequireActiveBatchAsync(applicant.BatchId, cancellationToken);
        await EnsureExpiredIfNeededAsync(applicant, cancellationToken);

        var previousStatus = applicant.ApplicationStatus;
        EmailSendResult? emailResult = null;
        string message;

        if (normalized == SystemConstants.ApplicationStatuses.Approved)
        {
            var fromPending = string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Pending, StringComparison.OrdinalIgnoreCase);
            var fromWaitlisted = string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Waitlisted, StringComparison.OrdinalIgnoreCase);
            var canReoffer = string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Expired, StringComparison.OrdinalIgnoreCase)
                || string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Declined, StringComparison.OrdinalIgnoreCase)
                || (string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Rejected, StringComparison.OrdinalIgnoreCase)
                    && applicant.DeclinedAt.HasValue);

            if (SystemConstants.ApplicationStatuses.IsConfirmedSlot(previousStatus))
                return ApiResponse<ApplicantDto>.Ok(Map(applicant), "Applicant already confirmed their slot.");

            var canRetryFailedEmail = string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Approved, StringComparison.OrdinalIgnoreCase)
                && !applicant.ApprovalEmailSentAt.HasValue
                && !applicant.ConfirmedAt.HasValue
                && !applicant.DeclinedAt.HasValue;

            var alreadyApprovedAwaiting = string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Approved, StringComparison.OrdinalIgnoreCase)
                && applicant.ApprovalEmailSentAt.HasValue
                && !applicant.ConfirmedAt.HasValue
                && !applicant.DeclinedAt.HasValue
                && (!applicant.ResponseDeadline.HasValue || DateTime.Now < applicant.ResponseDeadline.Value);

            if (!fromPending && !fromWaitlisted && !canReoffer && !canRetryFailedEmail && alreadyApprovedAwaiting)
            {
                return ApiResponse<ApplicantDto>.Ok(Map(applicant), "Applicant is already approved and awaiting a slot response.");
            }

            var emailKind = fromWaitlisted
                || string.Equals(applicant.SlotResponse, SystemConstants.SlotResponses.AwaitingFromWaitlist, StringComparison.OrdinalIgnoreCase)
                ? ApprovalEmailKind.WaitlistedToApproved
                : ApprovalEmailKind.PendingToApproved;

            if (!canRetryFailedEmail || string.IsNullOrEmpty(applicant.ConfirmationToken))
            {
                applicant.ApplicationStatus = SystemConstants.ApplicationStatuses.Approved;
                applicant.ConfirmationToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                applicant.ConfirmedAt = null;
                applicant.DeclinedAt = null;
                applicant.SlotResponse = emailKind == ApprovalEmailKind.WaitlistedToApproved
                    ? SystemConstants.SlotResponses.AwaitingFromWaitlist
                    : SystemConstants.SlotResponses.AwaitingResponse;
                applicant.ApprovalEmailSentAt = null;
                applicant.ResponseDeadline = DateTime.Now.AddHours(SlotOfferPolicy.ResponseHours);
                applicant.AssignedTrainingDateTime = await ResolveTrainingDateTimeAsync(applicant.CourseId, applicant.BatchId, cancellationToken);
            }
            applicant.ResponseDeadline ??= DateTime.Now.AddHours(SlotOfferPolicy.ResponseHours);
            applicant.EmailNotificationStatus = "ApprovalSending";

            await _db.SaveChangesAsync(cancellationToken);

            emailResult = await SendApprovalDecisionEmailAsync(applicant, emailKind, CancellationToken.None);
            applicant.EmailNotificationStatus = emailResult.Sent ? "ApprovalSent" : "ApprovalFailed";
            if (emailResult.Sent)
            {
                applicant.ApprovalEmailSentAt = DateTime.Now;
            }
            // Persist delivery feedback even if the admin navigated away during SMTP.
            await _db.SaveChangesAsync(CancellationToken.None);

            message = BuildApproveMessage(applicant.Email, emailResult, sentEmail: true);
        }
        else if (normalized == SystemConstants.ApplicationStatuses.Waitlisted)
        {
            applicant.ApplicationStatus = SystemConstants.ApplicationStatuses.Waitlisted;
            ClearSlotOffer(applicant);
            await _db.SaveChangesAsync(cancellationToken);

            emailResult = string.Equals(previousStatus, SystemConstants.ApplicationStatuses.Pending, StringComparison.OrdinalIgnoreCase)
                ? await SendWaitlistedEmailAsync(applicant, CancellationToken.None)
                : await SendStatusEmailAsync(applicant, normalized, CancellationToken.None);

            message = emailResult.Sent
                ? $"Applicant waitlisted. Notification email sent to {applicant.Email}."
                : $"Applicant waitlisted, but the email notification failed. {emailResult.Message}";
        }
        else
        {
            applicant.ApplicationStatus = normalized;
            if (normalized is SystemConstants.ApplicationStatuses.Rejected
                or SystemConstants.ApplicationStatuses.Pending)
            {
                ClearSlotOffer(applicant);
            }

            await _db.SaveChangesAsync(cancellationToken);
            emailResult = await SendStatusEmailAsync(applicant, normalized, CancellationToken.None);
            message = $"Applicant status updated to {normalized}.";
        }

        if (!string.Equals(previousStatus, applicant.ApplicationStatus, StringComparison.OrdinalIgnoreCase))
            await _notifications.CreateAsync(
                "Application Status Updated",
                $"Your application status is now: {applicant.ApplicationStatus}.",
                applicantId: applicant.ApplicantId,
                cancellationToken: normalized == SystemConstants.ApplicationStatuses.Approved ? CancellationToken.None : cancellationToken);

        return ApiResponse<ApplicantDto>.Ok(Map(applicant), message);
    }

    public async Task<ApiResponse<object>> BulkUpdateStatusAsync(BulkStatusDto dto, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeStatus(dto.Status);
        if (normalized is null)
            return ApiResponse<object>.Fail("Invalid application status.");

        var notes = new List<string>();
        foreach (var id in dto.Ids.Distinct())
        {
            var result = await UpdateStatusAsync(id, normalized, cancellationToken);
            notes.Add($"#{id}: {result.Message}");
        }

        return ApiResponse<object>.Ok(new { updated = dto.Ids.Count }, string.Join(" | ", notes));
    }

    public Task<ApiResponse<ApplicantDto>> ConfirmSlotAsync(string token, CancellationToken cancellationToken = default)
        => RespondToSlotAsync(token, true, cancellationToken);

    public Task<ApiResponse<ApplicantDto>> DeclineSlotAsync(string token, CancellationToken cancellationToken = default)
        => RespondToSlotAsync(token, false, cancellationToken);

    private async Task<ApiResponse<ApplicantDto>> RespondToSlotAsync(string token, bool confirm, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 64)
            return ApiResponse<ApplicantDto>.Fail("This slot link is invalid.");
        var id = await _db.Applicants.AsNoTracking().Where(a => a.ConfirmationToken == token)
            .Select(a => (int?)a.ApplicantId).SingleOrDefaultAsync(ct);
        if (!id.HasValue) return ApiResponse<ApplicantDto>.Fail("This slot link is invalid or has been replaced by a newer offer.");

        await using var workflowLock = await SlotWorkflowLock.AcquireAsync(_db, "applicant:" + id.Value, ct);
        var applicant = await _db.Applicants.Include(a => a.Course).Include(a => a.Student).SingleAsync(a => a.ApplicantId == id, ct);
        await _db.Entry(applicant).ReloadAsync(ct);
        await _db.Entry(applicant).Reference(a => a.Student).LoadAsync(ct);
        if (!string.Equals(applicant.ConfirmationToken, token, StringComparison.Ordinal))
            return ApiResponse<ApplicantDto>.Fail("This slot link has been replaced by a newer offer.");
        // The saved result wins even when the opposite button is submitted later.
        var alreadyConfirmed = SystemConstants.ApplicationStatuses.IsConfirmedSlot(applicant.ApplicationStatus)
            || applicant.SlotResponse == SystemConstants.SlotResponses.Confirmed || applicant.ConfirmedAt.HasValue;
        if (alreadyConfirmed && applicant.Student is not null)
            return ApiResponse<ApplicantDto>.Ok(Map(applicant), "Your slot is already confirmed and awaiting account activation.");
        if (!alreadyConfirmed && (applicant.SlotResponse == SystemConstants.SlotResponses.Declined || applicant.DeclinedAt.HasValue))
            return ApiResponse<ApplicantDto>.Ok(Map(applicant), "Your slot rejection has already been recorded.");
        if (!alreadyConfirmed && (applicant.ApplicationStatus == SystemConstants.ApplicationStatuses.Expired
            || applicant.SlotResponse == SystemConstants.SlotResponses.Expired
            || !applicant.ResponseDeadline.HasValue || DateTime.Now >= applicant.ResponseDeadline.Value))
            return ApiResponse<ApplicantDto>.Fail("This slot offer has expired. Please contact ABEC for a new offer.");
        if ((!alreadyConfirmed && applicant.ApplicationStatus != SystemConstants.ApplicationStatuses.Approved) || applicant.Student is not null)
            return ApiResponse<ApplicantDto>.Fail("This slot offer is no longer available.");

        // Finish older saved confirmations that have no pending account yet.
        // The recorded decision still wins if the reject link is submitted later.
        confirm = confirm || alreadyConfirmed;

        // Serialize capacity checks for different applicants responding to the same course.
        await using var courseLock = await SlotWorkflowLock.AcquireAsync(_db, "course:" + applicant.BatchId + ":" + applicant.CourseId, ct);
        await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        await _db.RequireActiveBatchAsync(applicant.BatchId, ct);
        if (!alreadyConfirmed && DateTime.Now >= applicant.ResponseDeadline!.Value)
            return ApiResponse<ApplicantDto>.Fail("This slot offer has expired. Please contact ABEC for a new offer.");
        if (confirm)
        {
            var enrolled = await EnrollConfirmedApplicantAsync(applicant, ct);
            if (!enrolled.Success)
                return ApiResponse<ApplicantDto>.Fail(enrolled.Message); // disposal rolls back the entire attempt
            applicant.ApplicationStatus = SystemConstants.ApplicationStatuses.Confirmed;
            applicant.SlotResponse = SystemConstants.SlotResponses.Confirmed;
            applicant.ConfirmedAt ??= DateTime.Now;
            await _db.SaveChangesAsync(ct);
            await _notifications.CreateAdminAsync("Applicant Confirmed Slot",
                $"{applicant.FullName} confirmed their training slot and was added to Pending Activation.", applicant.ApplicantId, ct);
            await _notifications.CreateAsync("Slot Confirmation Received",
                "Your training slot is confirmed and your account is pending activation by ABEC.",
                applicant.Student!.StudentId, applicant.ApplicantId, ct);
        }
        else
        {
            applicant.ApplicationStatus = SystemConstants.ApplicationStatuses.Rejected;
            applicant.SlotResponse = SystemConstants.SlotResponses.Declined;
            applicant.DeclinedAt = DateTime.Now;
            // Preserve token, course and batch. The saved applicant is counted under Rejected Slots.
            await _db.SaveChangesAsync(ct);
            await _notifications.CreateAdminAsync("Applicant Declined Slot",
                $"{applicant.FullName} rejected their training slot. The application is under Rejected Slots in Archives.", applicant.ApplicantId, ct);
        }
        await transaction.CommitAsync(ct);
        await transaction.DisposeAsync();
        await courseLock.DisposeAsync();
        await workflowLock.DisposeAsync();
        if (confirm) await NotifyAdminsOfSlotConfirmationAsync(applicant, CancellationToken.None);
        return ApiResponse<ApplicantDto>.Ok(Map(applicant), confirm
            ? "Slot confirmed. Your account is pending activation by ABEC."
            : "Slot rejected. Your decision has been recorded.");
    }

    public async Task<SlotLinkStatusDto> DescribeSlotLinkAsync(string? token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return new SlotLinkStatusDto
            {
                State = "missing",
                Message = "This link is incomplete. Open the Confirm Slot or Reject Slot button in your ABEC email."
            };
        }

        if (token.Length > 64) return new SlotLinkStatusDto { State = "invalid", Message = "This slot link is invalid. Open the original link from your ABEC email." };

        var applicant = await _db.Applicants.AsNoTracking()
            .Include(a => a.Course)
            .Include(a => a.Student)
            .FirstOrDefaultAsync(a => a.ConfirmationToken == token, cancellationToken);

        if (applicant is null || !string.Equals(applicant.ConfirmationToken, token, StringComparison.Ordinal))
        {
            return new SlotLinkStatusDto
            {
                State = "invalid",
                Message = "This link is invalid or has already been used."
            };
        }

        var status = new SlotLinkStatusDto
        {
            FullName = applicant.FullName,
            CourseName = applicant.Course?.CourseName ?? string.Empty,
            TrainingDateTime = applicant.AssignedTrainingDateTime ?? "To be announced by ABEC Institute",
            ResponseDeadline = applicant.ResponseDeadline.HasValue ? SlotOfferPolicy.AsOffset(applicant.ResponseDeadline.Value) : null
        };

        if (SystemConstants.ApplicationStatuses.IsConfirmedSlot(applicant.ApplicationStatus)
            || string.Equals(applicant.SlotResponse, SystemConstants.SlotResponses.Confirmed, StringComparison.OrdinalIgnoreCase)
            || applicant.ConfirmedAt.HasValue)
        {
            status.State = applicant.Student is not null ? "confirmed" : "incomplete";
            status.Message = applicant.Student is not null
                ? "This training slot was already confirmed."
                : "Choose Confirm Slot to finish saving your registration for account activation.";
            return status;
        }

        if (applicant.ApplicationStatus == SystemConstants.ApplicationStatuses.Declined
            || (applicant.ApplicationStatus == SystemConstants.ApplicationStatuses.Rejected && applicant.DeclinedAt.HasValue)
            || string.Equals(applicant.SlotResponse, SystemConstants.SlotResponses.Declined, StringComparison.OrdinalIgnoreCase)
            || applicant.DeclinedAt.HasValue)
        {
            status.State = "declined";
            status.Message = "This training slot was already declined.";
            return status;
        }

        if (!applicant.ResponseDeadline.HasValue || DateTime.Now >= applicant.ResponseDeadline.Value
            || applicant.ApplicationStatus == SystemConstants.ApplicationStatuses.Expired
            || string.Equals(applicant.SlotResponse, SystemConstants.SlotResponses.Expired, StringComparison.OrdinalIgnoreCase))
        {
            status.State = "expired";
            status.Message = "This link has expired. Please contact ABEC Institute.";
            return status;
        }

        if (applicant.ApplicationStatus != SystemConstants.ApplicationStatuses.Approved)
        {
            status.State = "unavailable";
            status.Message = "This slot offer is no longer open.";
            return status;
        }

        status.State = "ready";
        return status;
    }

    public async Task<ApiResponse<StudentDto>> AddToSlotAsync(int applicantId, CancellationToken cancellationToken = default)
    {
        var applicant = await _db.Applicants
            .Include(a => a.Course)
            .Include(a => a.Student)
            .FirstOrDefaultAsync(a => a.ApplicantId == applicantId, cancellationToken);

        if (applicant is null)
            return ApiResponse<StudentDto>.Fail("Applicant not found.");
        if (!SystemConstants.ApplicationStatuses.IsConfirmedSlot(applicant.ApplicationStatus))
            return ApiResponse<StudentDto>.Fail("Only applicants who confirmed their slot can be added to a training batch.");
        if (applicant.Student is not null)
            return ApiResponse<StudentDto>.Ok(MapStudent(applicant.Student), "Applicant already has a student account in Pending Activation.");

        return await EnrollConfirmedApplicantAsync(applicant, cancellationToken);
    }

    /// <summary>
    /// Creates an Inactive student in the active batch for the applicant's course (Pending Activation).
    /// Idempotent: returns the existing student if already enrolled.
    /// </summary>
    private async Task<ApiResponse<StudentDto>> EnrollConfirmedApplicantAsync(Applicant applicant, CancellationToken cancellationToken)
    {
        if (applicant.Student is not null)
            return ApiResponse<StudentDto>.Ok(MapStudent(applicant.Student), "Applicant already enrolled in a course slot.");

        var activeBatch = await _db.Batches.FirstOrDefaultAsync(b => b.Status == SystemConstants.BatchStatuses.Active, cancellationToken);
        if (activeBatch is null || applicant.BatchId != activeBatch.BatchId)
            return ApiResponse<StudentDto>.Fail("This applicant does not belong to the active batch.");

        var filled = await _db.Students.Include(s => s.Applicant)
            .CountAsync(s => s.Applicant != null && s.Applicant.CourseId == applicant.CourseId && s.BatchId == activeBatch.BatchId, cancellationToken);

        var capacity = applicant.Course?.SlotCapacity > 0
            ? applicant.Course.SlotCapacity
            : SystemConstants.DefaultCourseCapacity;
        if (filled >= capacity)
            return ApiResponse<StudentDto>.Fail("Course slot capacity has been reached.");

        var student = new Student
        {
            ApplicantId = applicant.ApplicantId,
            BatchId = activeBatch.BatchId,
            AccountStatus = SystemConstants.AccountStatuses.Inactive,
            CreatedAt = DateTime.Now
        };

        _db.Students.Add(student);
        await SecurityPinGenerator.AssignAndSaveAsync(_db, student, applicant, cancellationToken);

        applicant.Student = student;

        var priorNotices = await _db.Notifications
            .Where(n => n.ApplicantId == applicant.ApplicantId && n.StudentId == null)
            .ToListAsync(cancellationToken);
        foreach (var notice in priorNotices)
            notice.StudentId = student.StudentId;
        await _db.SaveChangesAsync(cancellationToken);

        await _notifications.CreateAsync(
            "Assigned to Training Batch",
            $"You have been assigned to batch {activeBatch.BatchName}. Your account is pending activation.",
            applicantId: applicant.ApplicantId,
            studentId: student.StudentId,
            cancellationToken: cancellationToken);

        student.Applicant = applicant;
        student.Batch = activeBatch;
        return ApiResponse<StudentDto>.Ok(MapStudent(student), "Applicant added to training slot. Account is pending activation.");
    }

    private async Task ReleaseStudentSlotAsync(Applicant applicant, CancellationToken cancellationToken)
    {
        var student = applicant.Student
            ?? await _db.Students.FirstOrDefaultAsync(s => s.ApplicantId == applicant.ApplicantId, cancellationToken);
        if (student is null) return;

        var notices = await _db.Notifications
            .Where(n => n.StudentId == student.StudentId)
            .ToListAsync(cancellationToken);
        foreach (var notice in notices)
            notice.StudentId = null;

        _db.Students.Remove(student);
        applicant.Student = null;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private enum ApprovalEmailKind
    {
        PendingToApproved,
        WaitlistedToApproved
    }

    private static void ClearSlotOffer(Applicant applicant)
    {
        applicant.ConfirmationToken = null;
        applicant.ConfirmedAt = null;
        applicant.DeclinedAt = null;
        applicant.ResponseDeadline = null;
        applicant.ApprovalEmailSentAt = null;
        applicant.SlotResponse = null;
        applicant.AssignedTrainingDateTime = null;
    }

    public async Task ExpireSlotOffersAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.Now;
        var offers = await _db.Applicants.Include(a => a.Course)
            .Where(a => a.Batch != null && a.Batch.Status == "Active" && a.ApplicationStatus == "Approved"
                && a.ConfirmedAt == null && a.DeclinedAt == null && a.ResponseDeadline <= now)
            .ToListAsync(cancellationToken);
        foreach (var offer in offers) await EnsureExpiredIfNeededAsync(offer, cancellationToken);
    }

    private async Task EnsureExpiredIfNeededAsync(Applicant applicant, CancellationToken cancellationToken)
    {
        if (!await _db.Batches.AsNoTracking().AnyAsync(b => b.BatchId == applicant.BatchId && b.Status == "Active", cancellationToken)) return;
        if (applicant.ApplicationStatus != SystemConstants.ApplicationStatuses.Approved)
            return;
        if (applicant.ConfirmedAt.HasValue || applicant.DeclinedAt.HasValue)
            return;
        if (!applicant.ResponseDeadline.HasValue || DateTime.Now < applicant.ResponseDeadline.Value)
            return;

        // A list request may have read the offer just before a response was saved.
        // Recheck under the same application lock so expiry cannot replace a final choice.
        await using var workflowLock = await SlotWorkflowLock.AcquireAsync(_db, "applicant:" + applicant.ApplicantId, cancellationToken);
        await _db.Entry(applicant).ReloadAsync(cancellationToken);
        if (applicant.ApplicationStatus != SystemConstants.ApplicationStatuses.Approved
            || applicant.ConfirmedAt.HasValue || applicant.DeclinedAt.HasValue
            || !applicant.ResponseDeadline.HasValue || DateTime.Now < applicant.ResponseDeadline.Value)
            return;
        applicant.ApplicationStatus = SystemConstants.ApplicationStatuses.Expired;
        applicant.SlotResponse = SystemConstants.SlotResponses.Expired;
        await _db.SaveChangesAsync(cancellationToken);

        await _notifications.CreateAdminAsync(
            "Applicant Slot Response Expired",
            $"{applicant.FullName} did not respond within 48 hours. The slot offer for {applicant.Course?.CourseName ?? "their course"} has expired.",
            applicant.ApplicantId,
            cancellationToken);
    }

    private async Task<string> ResolveTrainingDateTimeAsync(int courseId, int? batchId, CancellationToken cancellationToken)
    {
        var now = DateTime.Now;
        var upcoming = await _db.CourseSchedules.AsNoTracking()
            .Where(s => s.CourseId == courseId && s.BatchId == batchId && s.Status == SystemConstants.ScheduleStatuses.Active)
            .OrderBy(s => s.ScheduleDate)
            .ThenBy(s => s.StartTime)
            .ToListAsync(cancellationToken);

        var schedule = upcoming.FirstOrDefault(s =>
            s.ScheduleDate.Date > now.Date
            || (s.ScheduleDate.Date == now.Date && s.StartTime >= now.TimeOfDay))
            ?? upcoming.LastOrDefault();

        if (schedule is not null)
        {
            var start = schedule.ScheduleDate.Date.Add(schedule.StartTime);
            var end = schedule.ScheduleDate.Date.Add(schedule.EndTime);
            return $"{start:MMMM dd, yyyy h:mm tt} – {end:h:mm tt}";
        }

        var batch = await _db.Batches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.BatchId == batchId, cancellationToken);
        if (batch is not null)
            return $"{batch.StartDate:MMMM dd, yyyy} ({batch.BatchName})";

        return "To be announced by ABEC Institute";
    }

    private async Task<EmailSendResult> SendApprovalDecisionEmailAsync(
        Applicant applicant,
        ApprovalEmailKind kind,
        CancellationToken cancellationToken)
    {
        try
        {
            var baseUrl = ResolvePublicBaseUrl().TrimEnd('/');
            var token = Uri.EscapeDataString(applicant.ConfirmationToken ?? string.Empty);
            var confirmUrl = $"{baseUrl}/confirm-slot?token={token}";
            var declineUrl = $"{baseUrl}/reject-slot?token={token}";
            var name = Html(applicant.FullName);
            var courseName = Html(string.IsNullOrWhiteSpace(applicant.Course?.CourseName)
                ? "Selected Course"
                : applicant.Course!.CourseName);
            var dateTime = Html(string.IsNullOrWhiteSpace(applicant.AssignedTrainingDateTime)
                ? "To be announced by ABEC Institute"
                : applicant.AssignedTrainingDateTime!);
            var deadline = applicant.ResponseDeadline.HasValue
                ? Html(SlotOfferPolicy.DisplayTime(SlotOfferPolicy.AsOffset(applicant.ResponseDeadline.Value))) : "Contact ABEC Institute";

            string subject;
            string intro;
            string heading;

            if (kind == ApprovalEmailKind.WaitlistedToApproved)
            {
                subject = "ABEC Institute – Waitlisted Application Approved";
                heading = "Waitlisted Application Approved";
                intro = $@"
            <p style='margin:0 0 14px'>Congratulations, {name}!</p>
            <p style='margin:0 0 18px'>We are pleased to inform you that a training slot has become available and your waitlisted application has now been approved.</p>";
            }
            else
            {
                subject = "ABEC Institute – Application Approved";
                heading = "Application Approved";
                intro = $@"
            <p style='margin:0 0 14px'>Hello, {name}!</p>
            <p style='margin:0 0 18px'>We are pleased to inform you that your application to ABEC Institute of Business and Technology Inc. has been approved.</p>";
            }

            var html = $@"
<html>
<head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>
<body style='margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a'>
  <table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='padding:24px 12px'>
    <tr><td align='center'>
      <table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden'>
        <tr>
          <td style='background:#0A2540;color:#ffffff;padding:20px 24px'>
            <div style='font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9'>ABEC Institute</div>
            <div style='font-size:20px;font-weight:700;margin-top:4px'>{heading}</div>
          </td>
        </tr>
        <tr>
          <td style='padding:28px 24px;font-size:15px;line-height:1.65'>
            {intro}
            <p style='margin:0 0 8px'><strong>Training Details:</strong></p>
            <p style='margin:0 0 18px'>
              Course: {courseName}<br/>
              Date/Time: {dateTime}
            </p>
            <p style='margin:0 0 18px'>Please confirm your slot within <strong>2 days (48 hours)</strong> to secure your place in the training.</p>
            <p style='margin:0 0 18px'><strong>Respond by:</strong> {deadline}</p>
            <p style='margin:0 0 12px;text-align:center'>
              <a href='{confirmUrl}' style='background:#0A2540;color:#ffffff;padding:12px 22px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:700;margin:4px'>Confirm Slot</a>
              <a href='{declineUrl}' style='background:#ffffff;color:#0A2540;padding:12px 22px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:700;margin:4px;border:2px solid #0A2540'>Reject Slot</a>
            </p>
            <p style='margin:16px 0 18px;font-size:12px;color:#64748b;overflow-wrap:anywhere;word-break:break-all'>
              Confirm: <a href='{confirmUrl}'>{confirmUrl}</a><br/>
              Reject: <a href='{declineUrl}'>{declineUrl}</a>
            </p>

            <div style='margin:22px 0 0;padding:16px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc'>
              <p style='margin:0 0 8px;font-size:14px;font-weight:700;color:#0A2540'>Application Form</p>
              <p style='margin:0;font-size:14px;color:#334155'>
                Your Application Form is attached to this email as a PDF file. Please download and print the attached Application Form and bring it with your required documents when you report to the ABEC office.
              </p>
            </div>

            <div style='margin:18px 0 0;padding:16px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff'>
              <p style='margin:0 0 10px;font-size:14px;font-weight:700;color:#0A2540'>Submission Instructions</p>
              <p style='margin:0 0 12px;font-size:14px;color:#334155'>
                Please download and print the attached Application Form PDF and bring it together with the required documents to the ABEC office.
              </p>
              <p style='margin:0 0 14px;font-size:14px;color:#334155'>
                <strong>ABEC Office:</strong> {Html(SystemConstants.AbecOffice.Address)}
              </p>
              <p style='margin:0 0 8px;font-size:14px;font-weight:700;color:#0A2540'>Required Documents:</p>
              <ul style='margin:0 0 12px;padding-left:20px;color:#334155;font-size:14px'>
                <li>Transcript of Records (TOR)</li>
                <li>Honorable Dismissal</li>
                <li>Certificate of Good Moral Character</li>
                <li>Form 138</li>
                <li>Printed Application Form</li>
              </ul>
              <p style='margin:0;font-size:13px;color:#64748b'><strong>Note:</strong> Photocopies of the required documents may be submitted.</p>
            </div>

            <p style='margin:22px 0 18px'>We look forward to having you with us!</p>
            <p style='margin:0'>Sincerely,<br/><strong>ABEC Institute of Business and Technology Inc.</strong></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>";

            var pdfBytes = _pdf.GenerateApplicationFormPdf(applicant);
            var safeName = string.Join("_", (applicant.FullName ?? "Applicant")
                .Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries))
                .Replace(' ', '_');
            if (string.IsNullOrWhiteSpace(safeName)) safeName = "Applicant";
            var fileName = $"ABEC_Application_Form_{safeName}_{applicant.ApplicantId}.pdf";

            return await _email.SendAsync(
                applicant.Email,
                subject,
                html,
                pdfAttachment: pdfBytes,
                attachmentFileName: fileName,
                cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            return EmailSendResult.Fail($"Approval email could not be prepared: {ex.Message}");
        }
    }

    private async Task<EmailSendResult> SendWaitlistedEmailAsync(Applicant applicant, CancellationToken cancellationToken)
    {
        try
        {
            var name = Html(applicant.FullName);
            var courseName = Html(string.IsNullOrWhiteSpace(applicant.Course?.CourseName)
                ? "Selected Course"
                : applicant.Course!.CourseName);

            var html = $@"
<html>
<body style='margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a'>
  <table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='padding:24px 12px'>
    <tr><td align='center'>
      <table role='presentation' width='600' cellspacing='0' cellpadding='0' style='background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden'>
        <tr>
          <td style='background:#0A2540;color:#ffffff;padding:20px 24px'>
            <div style='font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9'>ABEC Institute</div>
            <div style='font-size:20px;font-weight:700;margin-top:4px'>Application Waitlisted</div>
          </td>
        </tr>
        <tr>
          <td style='padding:28px 24px;font-size:15px;line-height:1.65'>
            <p style='margin:0 0 14px'>Hello, {name}!</p>
            <p style='margin:0 0 18px'>Thank you for applying to ABEC Institute of Business and Technology Inc.</p>
            <p style='margin:0 0 18px'>We would like to inform you that your registration has been placed on our waitlist.</p>
            <p style='margin:0 0 18px'>Your application has been reviewed, but a training slot is not currently available. If a slot becomes available, your application may be considered for approval.</p>
            <p style='margin:0 0 8px'><strong>Application Details:</strong></p>
            <p style='margin:0 0 18px'>
              Applicant Name: {name}<br/>
              Course: {courseName}<br/>
              Status: Waitlisted
            </p>
            <p style='margin:0 0 18px'>Please wait for further notification from ABEC Institute of Business and Technology Inc. regarding the status of your application.</p>
            <p style='margin:0'>Sincerely,<br/><strong>ABEC Institute of Business and Technology Inc.</strong></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>";

            return await _email.SendAsync(
                applicant.Email,
                "ABEC Institute – Application Waitlisted",
                html,
                cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            return EmailSendResult.Fail($"Waitlisted email could not be prepared: {ex.Message}");
        }
    }

    private async Task<EmailSendResult> SendStatusEmailAsync(Applicant applicant, string status, CancellationToken cancellationToken)
    {
        try
        {
            var subject = status switch
            {
                SystemConstants.ApplicationStatuses.Rejected => "ABEC Institute – Application Rejected",
                SystemConstants.ApplicationStatuses.Waitlisted => "ABEC Institute – Application Waitlisted",
                _ => $"ABEC Institute – Application Update ({status})"
            };

            var body = $@"
<html><body style='font-family:Segoe UI,Arial,sans-serif;color:#0f172a'>
  <p>Hello, {Html(applicant.FullName)}!</p>
  <p>Your application for <strong>{Html(applicant.Course?.CourseName ?? "your selected course")}</strong> is now: <strong>{Html(status)}</strong>.</p>
  <p>Sincerely,<br/>ABEC Institute of Business and Technology Inc.</p>
</body></html>";

            return await _email.SendAsync(applicant.Email, subject, body, cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            return EmailSendResult.Fail($"Status email could not be sent: {ex.Message}");
        }
    }

    private async Task NotifyAdminsOfSlotConfirmationAsync(Applicant applicant, CancellationToken cancellationToken)
    {
        try
        {
            var recipients = await _db.Admins.AsNoTracking()
                .Include(a => a.UserSetting)
                .Where(a => a.Email != null && a.Email != "" &&
                            (a.UserSetting == null || (a.UserSetting.EmailNotifications && a.UserSetting.StudentUpdates)))
                .Select(a => a.Email!)
                .Distinct()
                .ToListAsync(cancellationToken);

            if (recipients.Count == 0) return;

            var subject = "ABEC Alert — Applicant Confirmed Slot";
            var html = $@"
<html><body style='font-family:Segoe UI,Arial,sans-serif;color:#0f172a'>
  <h2>Applicant Confirmed Slot</h2>
  <p><strong>{Html(applicant.FullName)}</strong> confirmed their training slot and was added to <strong>Pending Activation</strong>.</p>
  <p>
    <strong>Course:</strong> {Html(applicant.Course?.CourseName ?? "—")}<br/>
    <strong>Applicant Email:</strong> {Html(applicant.Email)}<br/>
    <strong>Confirmed At:</strong> {applicant.ConfirmedAt:MMMM dd, yyyy h:mm tt}
  </p>
  <p>Open Account Activation in the Admin Module to activate this applicant's account.</p>
</body></html>";

            foreach (var to in recipients)
                await _email.SendAsync(to, subject, html, cancellationToken: cancellationToken);
        }
        catch
        {
            // In-app admin notification already created; email is best-effort.
        }
    }

    private string ResolvePublicBaseUrl() => PublicAppUrl.Normalize(_app.CurrentValue.PublicBaseUrl, _development);

    private static string BuildApproveMessage(string email, EmailSendResult? emailResult, bool sentEmail)
    {
        if (!sentEmail)
            return "Applicant approved successfully.";

        if (emailResult is null)
            return $"Applicant approved. Notification email will be sent to {email}.";

        if (emailResult.Sent && string.Equals(emailResult.Channel, "smtp", StringComparison.OrdinalIgnoreCase))
            return "Applicant approved successfully. An approval email notification has been sent successfully.";

        if (emailResult.Sent)
            return $"Applicant approved successfully. {emailResult.Message}";

        return $"EMAIL_NOT_SENT: Approval was saved, but the email was not delivered to {email}. Open the applicant under Approved and choose Retry approval email. {emailResult.Message}";
    }

    private static string Html(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

    private async Task<Course?> ResolveCourseAsync(int courseId, string? courseName, CancellationToken cancellationToken)
    {
        if (courseId > 0)
            return await _db.Courses.FirstOrDefaultAsync(c => c.CourseId == courseId, cancellationToken);

        if (string.IsNullOrWhiteSpace(courseName))
            return null;

        var trimmed = courseName.Trim();
        var exact = await _db.Courses.FirstOrDefaultAsync(
            c => c.CourseName == trimmed, cancellationToken);
        if (exact is not null)
            return exact;

        var name = trimmed.ToLowerInvariant();
        return await _db.Courses.FirstOrDefaultAsync(
            c => c.CourseName.ToLower() == name
                 || c.CourseName.ToLower().Contains(name)
                 || name.Contains(c.CourseName.ToLower()),
            cancellationToken);
    }

    private static string? NormalizeStatus(string status) => status.Trim().ToLowerInvariant() switch
    {
        "pending" => SystemConstants.ApplicationStatuses.Pending,
        "approved" => SystemConstants.ApplicationStatuses.Approved,
        "rejected" => SystemConstants.ApplicationStatuses.Rejected,
        "waitlisted" => SystemConstants.ApplicationStatuses.Waitlisted,
        "confirmed" or "confirmed slot" or "confirmedslot" => SystemConstants.ApplicationStatuses.Confirmed,
        "declined" => SystemConstants.ApplicationStatuses.Declined,
        "expired" => SystemConstants.ApplicationStatuses.Expired,
        _ => null
    };

    private static bool IsValidNamePart(string value)
        => System.Text.RegularExpressions.Regex.IsMatch(value.Trim(), @"^[A-Za-zÑñ][A-Za-zÑñ\s.\-']*$");

    private static string NormalizeNamePart(string value)
    {
        var normalized = System.Text.RegularExpressions.Regex.Replace(value.Trim(), @"\s+", " ");
        var words = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var particles = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "de", "del", "dela", "la", "y", "van", "von", "da", "das", "dos", "di" };
        return string.Join(' ', words.Select((word, index) => FormatNameWord(word, index == 0, particles)));
    }

    private static string FormatNameWord(string word, bool isFirst, HashSet<string> particles)
    {
        var pieces = word.Split('-', StringSplitOptions.RemoveEmptyEntries);
        var formatted = pieces.Select(piece => FormatNameToken(piece, isFirst, particles));
        return string.Join('-', formatted);
    }

    private static string FormatNameToken(string token, bool isFirst, HashSet<string> particles)
    {
        if (!isFirst && particles.Contains(token))
            return token.ToLowerInvariant();
        if (token.Length > 2 && token.StartsWith("Mc", StringComparison.OrdinalIgnoreCase))
            return "Mc" + char.ToUpperInvariant(token[2]) + token[3..].ToLowerInvariant();
        if (token.Length > 3 && token.StartsWith("Mac", StringComparison.OrdinalIgnoreCase) && char.IsLetter(token[3]))
            return "Mac" + char.ToUpperInvariant(token[3]) + (token.Length > 4 ? token[4..].ToLowerInvariant() : "");
        return token.Length == 1
            ? char.ToUpperInvariant(token[0]).ToString()
            : char.ToUpperInvariant(token[0]) + token[1..].ToLowerInvariant();
    }

    private static int CalculateAge(DateTime birthdate, DateTime asOf)
    {
        var age = asOf.Year - birthdate.Year;
        if (birthdate.Date > asOf.Date.AddYears(-age)) age--;
        return age;
    }

    private static ApplicantDto Map(Applicant a) => new()
    {
        ApplicantId = a.ApplicantId,
        FullName = a.FullName,
        FirstName = a.FirstName,
        MiddleName = a.MiddleName,
        LastName = a.LastName,
        Suffix = a.Suffix,
        Email = a.Email,
        ContactNumber = a.ContactNumber,
        Address = AddressFormatting.FullAddress(a),
        Province = a.Province,
        CityMunicipality = a.CityMunicipality,
        Barangay = AddressFormatting.Barangay(a.Barangay),
        StreetDetails = a.StreetDetails,
        Gender = a.Gender,
        Birthdate = a.Birthdate,
        Age = a.Age > 0 ? a.Age : CalculateAge(a.Birthdate, DateTime.Today),
        CourseId = a.CourseId,
        CourseName = a.Course?.CourseName ?? string.Empty,
        BatchId = a.BatchId,
        BatchName = a.Batch?.BatchName,
        ApplicationStatus = a.ApplicationStatus,
        ApplicationDate = a.ApplicationDate,
        HasStudentAccount = a.Student is not null,
        IsSlotConfirmed = a.IsSlotConfirmed,
        ConfirmedAt = a.ConfirmedAt,
        DeclinedAt = a.DeclinedAt,
        ResponseDeadline = a.ResponseDeadline,
        ApprovalEmailSentAt = a.ApprovalEmailSentAt,
        CanRetryApprovalEmail = a.ApplicationStatus == SystemConstants.ApplicationStatuses.Approved
            && !a.ApprovalEmailSentAt.HasValue && !a.ConfirmedAt.HasValue && !a.DeclinedAt.HasValue,
        SlotResponse = a.SlotResponse,
        AssignedTrainingDateTime = a.AssignedTrainingDateTime,
        IsResponseExpired = a.IsResponseExpired,
        TesdaScreeningStatus = a.TesdaScreeningStatus,
        TesdaScreeningSummary = a.TesdaScreeningSummary,
        TesdaPreviouslyEnrolled = a.TesdaPreviouslyEnrolled,
        TesdaPreviousCourse = a.TesdaPreviousCourse,
        TesdaPreviousInstitution = a.TesdaPreviousInstitution,
        TesdaPreviousStatus = a.TesdaPreviousStatus,
        TesdaPreviousYear = a.TesdaPreviousYear,
        TesdaCurrentlyEnrolled = a.TesdaCurrentlyEnrolled,
        TesdaCompletedQualification = a.TesdaCompletedQualification,
        TesdaCompletedQualificationName = a.TesdaCompletedQualificationName,
        IdentityIdType = a.IdentityIdType,
        HasRegistrationDocuments = a.RegistrationDocuments?.Count > 0,
        SchoolName = a.SchoolName,
        SchoolAddress = a.SchoolAddress,
        QualificationType = a.QualificationType,
        CocSpecification = a.CocSpecification,
        ApplicantClassification = a.ApplicantClassification,
        CivilStatus = a.CivilStatus,
        BirthPlace = a.BirthPlace,
        Telephone = a.Telephone,
        Fax = a.Fax,
        OtherContact = a.OtherContact,
        EducationLevel = a.EducationLevel,
        EducationSpecification = a.EducationSpecification,
        EmploymentStatus = a.EmploymentStatus,
        AddressDistrict = a.AddressDistrict,
        AddressRegion = a.AddressRegion,
        ZipCode = a.ZipCode,
        ApplicationReference = a.ApplicationReference,
        EmailNotificationStatus = a.EmailNotificationStatus
    };

    private static string? TrimOrNull(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }

    private static string? ValidateRegistrationProfile(
        EnrollApplicantDto dto,
        string street,
        string barangay,
        string city,
        string province)
    {
        if (!IsMeaningful(dto.SchoolName) || !IsMeaningful(dto.SchoolAddress))
            return "Enter the school, training center, or company name and address, or mark them as not applicable.";
        if (string.IsNullOrWhiteSpace(dto.QualificationType) ||
            !SystemConstants.RegistrationChoices.QualificationTypes.Contains(dto.QualificationType.Trim(), StringComparer.OrdinalIgnoreCase))
            return "Please select a qualification type.";
        if (dto.QualificationType.Trim().Equals("COC", StringComparison.OrdinalIgnoreCase) && !IsMeaningful(dto.CocSpecification))
            return "Please specify the COC qualification.";
        if (string.IsNullOrWhiteSpace(dto.ApplicantClassification) ||
            !SystemConstants.RegistrationChoices.Classifications.Contains(dto.ApplicantClassification.Trim(), StringComparer.Ordinal))
            return "Please select an applicant classification.";
        if (string.IsNullOrWhiteSpace(dto.CivilStatus) ||
            !SystemConstants.RegistrationChoices.CivilStatuses.Contains(dto.CivilStatus.Trim(), StringComparer.OrdinalIgnoreCase))
            return "Please select a civil status.";
        if (!IsMeaningful(dto.BirthPlace))
            return "Please enter your birth place.";
        if (!IsOptionalContact(dto.Telephone) || !IsOptionalContact(dto.Fax))
            return "Enter a telephone number and a fax number, or mark each one as not applicable.";
        if (string.IsNullOrWhiteSpace(dto.EducationLevel) ||
            !SystemConstants.RegistrationChoices.EducationLevels.Contains(dto.EducationLevel.Trim(), StringComparer.OrdinalIgnoreCase))
            return "Please select your highest educational attainment.";
        if (dto.EducationLevel.Trim().Equals("Others", StringComparison.OrdinalIgnoreCase) && !IsMeaningful(dto.EducationSpecification))
            return "Please specify your educational attainment.";
        if (string.IsNullOrWhiteSpace(dto.EmploymentStatus) ||
            !SystemConstants.RegistrationChoices.EmploymentStatuses.Contains(dto.EmploymentStatus.Trim(), StringComparer.Ordinal))
            return "Please select an employment status.";
        if (!IsMeaningful(street) || !IsMeaningful(AddressFormatting.BarangayName(barangay)) || !IsMeaningful(city) || !IsMeaningful(province))
            return "Please complete your residential address.";
        if (!IsMeaningful(dto.AddressDistrict))
            return "Enter your district, or mark it as not applicable.";
        var region = dto.AddressRegion?.Trim() ?? "";
        var match = SystemConstants.RegistrationChoices.Regions.FirstOrDefault(r =>
            r.Name.Equals(region, StringComparison.OrdinalIgnoreCase) || r.Code.Equals(dto.AddressRegionCode?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (match.Name is null)
            return "Please select a region.";
        if (string.IsNullOrWhiteSpace(dto.ZipCode) || !System.Text.RegularExpressions.Regex.IsMatch(dto.ZipCode.Trim(), @"^\d{4}$"))
            return "Please enter a 4-digit ZIP code.";
        if (string.IsNullOrWhiteSpace(dto.IdentityIdType) ||
            !SystemConstants.IdentityIdTypes.All.Contains(dto.IdentityIdType.Trim(), StringComparer.Ordinal))
            return "Please select an ID type.";
        return null;
    }

    private static bool IsOptionalContact(string? value)
    {
        var trimmed = value?.Trim() ?? "";
        return trimmed.Equals("N/A", StringComparison.OrdinalIgnoreCase) || IsMeaningful(trimmed);
    }

    private static bool IsMeaningful(string? value)
    {
        var trimmed = value?.Trim() ?? "";
        if (trimmed.Length == 0) return false;
        if (trimmed.Equals("N/A", StringComparison.OrdinalIgnoreCase)) return true;
        return System.Text.RegularExpressions.Regex.IsMatch(trimmed, @"[\p{L}\p{N}]");
    }

    private static string NormalizeScreeningStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
            return SystemConstants.TesdaScreeningStatuses.NoPotentialConflict;
        if (string.Equals(status, SystemConstants.TesdaScreeningStatuses.ForAdminVerification, StringComparison.OrdinalIgnoreCase))
            return SystemConstants.TesdaScreeningStatuses.ForAdminVerification;
        if (string.Equals(status, SystemConstants.TesdaScreeningStatuses.PotentialEligibilityIssue, StringComparison.OrdinalIgnoreCase))
            return SystemConstants.TesdaScreeningStatuses.PotentialEligibilityIssue;
        return SystemConstants.TesdaScreeningStatuses.NoPotentialConflict;
    }

    private static StudentDto MapStudent(Student s) => new()
    {
        StudentId = s.StudentId,
        ApplicantId = s.ApplicantId,
        FullName = s.Applicant?.FullName ?? string.Empty,
        Email = s.Applicant?.Email ?? string.Empty,
        ContactNumber = s.Applicant?.ContactNumber ?? string.Empty,
        Address = AddressFormatting.FullAddress(s.Applicant),
        CourseName = s.Applicant?.Course?.CourseName ?? string.Empty,
        CourseId = s.Applicant?.CourseId ?? 0,
        BatchId = s.BatchId,
        BatchName = s.Batch?.BatchName ?? string.Empty,
        AccountStatus = s.AccountStatus,
        ApplicationStatus = s.Applicant?.ApplicationStatus ?? string.Empty,
        ConfirmationStatus = SystemConstants.ApplicationStatuses.IsConfirmedSlot(s.Applicant?.ApplicationStatus)
            || s.Applicant?.ConfirmedAt != null
            ? SystemConstants.ApplicationStatuses.Confirmed
            : (s.Applicant?.ApplicationStatus ?? "—"),
        ApplicationDate = s.Applicant?.ApplicationDate,
        ConfirmedAt = s.Applicant?.ConfirmedAt,
        CreatedAt = s.CreatedAt
    };
}
