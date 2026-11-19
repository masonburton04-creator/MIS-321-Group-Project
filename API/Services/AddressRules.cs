using System.Text.RegularExpressions;

namespace API.Services;

// Basic address checks that don't need Google, so they work even without a Maps key.
// The website runs the same checks (Valent.addressProblem in common.js) and, when Google is
// available, also confirms the whole address exists. These are the server's last line of defense.
public static partial class AddressRules
{
    // First three digits of the ZIP codes in each state this prototype offers (USPS ranges).
    // Add a state here when Database/05_supported_states.sql adds one.
    private static readonly Dictionary<string, (int From, int To)[]> ZipPrefixes = new()
    {
        ["AL"] = new[] { (350, 369) },
        ["TX"] = new[] { (750, 799), (885, 885) },
        ["NY"] = new[] { (5, 5), (63, 63), (100, 149) }
    };

    private static readonly Dictionary<string, string> StateNames = new()
    {
        ["AL"] = "Alabama", ["TX"] = "Texas", ["NY"] = "New York"
    };

    // null = OK, otherwise a message for the customer
    public static string? StreetProblem(string? street)
    {
        if (string.IsNullOrWhiteSpace(street)) return null; // "required" is checked by the form
        if (PoBoxRegex().IsMatch(street)) return "A PO box can't be insured. Enter the property's street address.";
        if (!StreetRegex().IsMatch(street.Trim())) return "Enter the street address with the house number first, like 123 Main St.";
        return null;
    }

    public static string? CityProblem(string? city)
    {
        if (string.IsNullOrWhiteSpace(city)) return null;
        var c = city.Trim();
        if (!CityRegex().IsMatch(c) || c.Distinct().Count() < 2) return "Enter a real city name (letters only).";
        return null;
    }

    public static string? ZipProblem(string? zip, string stateCode)
    {
        if (string.IsNullOrWhiteSpace(zip)) return null;
        if (!Regex.IsMatch(zip.Trim(), @"^\d{5}$")) return "Enter a 5-digit ZIP code.";
        if (!ZipPrefixes.TryGetValue(stateCode, out var ranges)) return null; // state we don't have ranges for
        var prefix = int.Parse(zip.Trim()[..3]);
        return ranges.Any(r => prefix >= r.From && prefix <= r.To)
            ? null
            : $"ZIP code {zip.Trim()} is outside {StateNames.GetValueOrDefault(stateCode, stateCode)}. This application is for {StateNames.GetValueOrDefault(stateCode, stateCode)}.";
    }

    [GeneratedRegex(@"\b(p\.?\s*o\.?\s*box|post\s+office\s+box)\b", RegexOptions.IgnoreCase)]
    private static partial Regex PoBoxRegex();
    // House number (123, 123A, 12-34), then a street name with at least one letter
    [GeneratedRegex(@"^\d+[A-Za-z]?(-\d+[A-Za-z]?)?\s+.*[A-Za-z]{2,}")]
    private static partial Regex StreetRegex();
    // Letters, spaces, periods, apostrophes, hyphens: "St. Louis", "Coeur d'Alene", "Winston-Salem"
    [GeneratedRegex(@"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]*[A-Za-zÀ-ÿ.]$")]
    private static partial Regex CityRegex();
}
