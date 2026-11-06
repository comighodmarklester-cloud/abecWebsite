using ABEC_System.DTOs;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace ABEC_System.Services;

public interface ILocationService
{
    Task<ApiResponse<IReadOnlyList<LocationOptionDto>>> GetProvincesAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<LocationOptionDto>>> GetCitiesAsync(string provinceCode, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<LocationOptionDto>>> GetBarangaysAsync(string cityCode, CancellationToken cancellationToken = default);
}

public class LocationService : ILocationService
{
    /// <summary>PSA/PSGC Region V — Bicol Region. Kept for local city and barangay files.</summary>
    public const string BicolRegionCode = "050000000";

    /// <summary>PSGC region code for the National Capital Region. Its cities have no province.</summary>
    public const string NcrRegionCode = "130000000";

    private const string PsgcBase = "https://psgc.gitlab.io/api";

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<LocationService> _logger;

    public LocationService(
        HttpClient http,
        IMemoryCache cache,
        IWebHostEnvironment env,
        ILogger<LocationService> logger)
    {
        _http = http;
        _cache = cache;
        _env = env;
        _logger = logger;
    }

    public async Task<ApiResponse<IReadOnlyList<LocationOptionDto>>> GetProvincesAsync(CancellationToken cancellationToken = default)
    {
        var list = await _cache.GetOrCreateAsync("psgc:ph:provinces:v1", async entry =>
        {
            var raw = await FetchAsync<List<PsgcNamedItem>>($"{PsgcBase}/provinces.json", cancellationToken)
                      ?? await ReadLocalAsync<List<PsgcNamedItem>>("data/psgc/provinces.json", cancellationToken);

            var provinces = MapOptions(raw)
                .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (!provinces.Any(p => string.Equals(p.Code, NcrRegionCode, StringComparison.Ordinal)))
            {
                provinces.Add(new LocationOptionDto
                {
                    Code = NcrRegionCode,
                    Name = "National Capital Region"
                });
                provinces = provinces.OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase).ToList();
            }

            entry.AbsoluteExpirationRelativeToNow = provinces.Count > 1
                ? TimeSpan.FromHours(24)
                : TimeSpan.FromMinutes(2);

            return (IReadOnlyList<LocationOptionDto>)provinces;
        });

        var result = list ?? Array.Empty<LocationOptionDto>();
        if (result.Count == 0)
            return ApiResponse<IReadOnlyList<LocationOptionDto>>.Fail("Unable to load provinces. Please try again.");

        return ApiResponse<IReadOnlyList<LocationOptionDto>>.Ok(result);
    }

    public async Task<ApiResponse<IReadOnlyList<LocationOptionDto>>> GetCitiesAsync(string provinceCode, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(provinceCode))
            return ApiResponse<IReadOnlyList<LocationOptionDto>>.Fail("Province is required.");

        var normalized = provinceCode.Trim();
        var cacheKey = $"psgc:ph:cities:v1:{normalized}";
        var list = await _cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            List<PsgcNamedItem>? raw;
            if (string.Equals(normalized, NcrRegionCode, StringComparison.Ordinal))
            {
                raw = await FetchAsync<List<PsgcNamedItem>>($"{PsgcBase}/regions/{NcrRegionCode}/cities.json", cancellationToken);
            }
            else
            {
                raw = await ReadLocalAsync<List<PsgcNamedItem>>($"data/psgc/cities/{normalized}.json", cancellationToken);
                if (raw == null || raw.Count == 0)
                    raw = await FetchAsync<List<PsgcNamedItem>>($"{PsgcBase}/provinces/{normalized}/cities-municipalities.json", cancellationToken);
            }

            var cities = MapOptions(raw, isCity: true)
                .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            entry.AbsoluteExpirationRelativeToNow = cities.Count > 0
                ? TimeSpan.FromHours(24)
                : TimeSpan.FromMinutes(2);
            return (IReadOnlyList<LocationOptionDto>)cities;
        });

        var result = list ?? Array.Empty<LocationOptionDto>();
        if (result.Count == 0)
            return ApiResponse<IReadOnlyList<LocationOptionDto>>.Fail("Unable to load cities and municipalities for the selected province.");

        return ApiResponse<IReadOnlyList<LocationOptionDto>>.Ok(result);
    }

    public async Task<ApiResponse<IReadOnlyList<LocationOptionDto>>> GetBarangaysAsync(string cityCode, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(cityCode))
            return ApiResponse<IReadOnlyList<LocationOptionDto>>.Fail("City/Municipality is required.");

        var normalized = cityCode.Trim();
        var cacheKey = $"psgc:ph:barangays:v1:{normalized}";
        var list = await _cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            var raw = await ReadBarangaysAsync(normalized, cancellationToken);
            var barangays = MapOptions(raw, isBarangay: true)
                .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            entry.AbsoluteExpirationRelativeToNow = barangays.Count > 0
                ? TimeSpan.FromHours(24)
                : TimeSpan.FromMinutes(2);
            return (IReadOnlyList<LocationOptionDto>)barangays;
        });

        var result = list ?? Array.Empty<LocationOptionDto>();
        if (result.Count == 0)
            return ApiResponse<IReadOnlyList<LocationOptionDto>>.Fail("Unable to load barangays for the selected city or municipality.");

        return ApiResponse<IReadOnlyList<LocationOptionDto>>.Ok(result);
    }

    private async Task<List<PsgcNamedItem>?> ReadBarangaysAsync(string cityCode, CancellationToken cancellationToken)
    {
        var local = await ReadLocalAsync<List<PsgcNamedItem>>($"data/psgc/barangays/{cityCode}.json", cancellationToken);
        if (local != null && local.Count > 0) return local;

        var fromMunicipality = await FetchAsync<List<PsgcNamedItem>>(
            $"{PsgcBase}/cities-municipalities/{cityCode}/barangays.json", cancellationToken);
        if (fromMunicipality != null && fromMunicipality.Count > 0) return fromMunicipality;

        return await FetchAsync<List<PsgcNamedItem>>(
            $"{PsgcBase}/cities/{cityCode}/barangays.json", cancellationToken);
    }

    private static List<LocationOptionDto> MapOptions(
        IEnumerable<PsgcNamedItem>? raw,
        bool isBarangay = false,
        bool isCity = false) =>
        (raw ?? Enumerable.Empty<PsgcNamedItem>())
            .Where(x => !string.IsNullOrWhiteSpace(x.Code) && !string.IsNullOrWhiteSpace(x.Name))
            .Select(x => new LocationOptionDto
            {
                Code = x.Code!.Trim(),
                Name = FormatDisplayName(x.Name!.Trim(), isBarangay, isCity)
            })
            .GroupBy(x => x.Code, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

    /// <summary>
    /// Aligns names with local presentation:
    /// cities as "Legazpi City" (not "City of Legazpi"),
    /// barangays as "Brgy. …".
    /// Also repairs accidental UTF-8 mojibake (CabagÃ±an → Cabañgan).
    /// </summary>
    private static string FormatDisplayName(string name, bool isBarangay, bool isCity = false)
    {
        if (string.IsNullOrWhiteSpace(name)) return name;

        name = RepairMojibake(name);

        if (isCity)
            name = FormatCityName(name);

        // Normalize abbreviated barangay prefix used in some PSGC exports.
        if (name.StartsWith("Bgy.", StringComparison.OrdinalIgnoreCase))
            name = "Brgy." + name[4..];
        else if (name.StartsWith("Bgy ", StringComparison.OrdinalIgnoreCase))
            name = "Brgy. " + name[4..];
        else if (name.StartsWith("Barangay ", StringComparison.OrdinalIgnoreCase))
            name = "Brgy. " + name["Barangay ".Length..];

        if (isBarangay &&
            !name.StartsWith("Brgy.", StringComparison.OrdinalIgnoreCase) &&
            !name.StartsWith("Barangay ", StringComparison.OrdinalIgnoreCase))
        {
            name = "Brgy. " + name;
        }

        return name;
    }

    /// <summary>Converts "City of Legazpi" → "Legazpi City".</summary>
    private static string FormatCityName(string name)
    {
        const string prefix = "City of ";
        if (name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            var place = name[prefix.Length..].Trim();
            if (!place.EndsWith(" City", StringComparison.OrdinalIgnoreCase))
                return place + " City";
            return place;
        }

        return name;
    }

    /// <summary>
    /// Fixes classic double-encoded UTF-8 sequences such as "Ã±" → "ñ".
    /// </summary>
    private static string RepairMojibake(string value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        if (!value.Contains('Ã') && !value.Contains('Â')) return value;

        try
        {
            var latin1 = System.Text.Encoding.GetEncoding("ISO-8859-1");
            var bytes = latin1.GetBytes(value);
            var repaired = System.Text.Encoding.UTF8.GetString(bytes);
            // Only accept the repair when it clearly improves encoding.
            if (repaired.Contains('�')) return value;
            if ((repaired.Contains('ñ') || repaired.Contains('Ñ') || repaired.Contains('ó') || repaired.Contains('é'))
                && (value.Contains("Ã±") || value.Contains("Ã‘") || value.Contains("Ã") || value.Contains("Â")))
                return repaired;
        }
        catch
        {
            // keep original
        }

        return value;
    }

    private static readonly JsonSerializerOptions LocalJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private async Task<T?> ReadLocalAsync<T>(string relativeWebRootPath, CancellationToken cancellationToken)
    {
        try
        {
            var path = Path.Combine(_env.WebRootPath, relativeWebRootPath.Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(path)) return default;

            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<T>(stream, LocalJsonOptions, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read local PSGC file {Path}", relativeWebRootPath);
            return default;
        }
    }

    private async Task<T?> FetchAsync<T>(string url, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Accept.ParseAdd("application/json");
            using var response = await _http.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<T>(cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch PSGC data from {Url}", url);
            return default;
        }
    }

    private sealed class PsgcNamedItem
    {
        [JsonPropertyName("code")]
        public string? Code { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("regionCode")]
        public string? RegionCode { get; set; }
    }
}
