using System.Globalization;
using API.Models;

namespace API.Services;

// What happens automatically when a customer submits (client meeting, November 2026):
//   1. Homeowners dwelling coverage over $1,000,000 -> escalated to a specialist.
//   2. Auto and/or Jewelry applications that meet the simple rules below -> auto-approved.
//      Homeowners and Flood are never auto-approved.
//   3. Everything else -> submitted, waiting for an agent.
//
// The thresholds are PLACEHOLDERS picked for the demo, not client-approved underwriting
// rules. They're constants here (and listed on the dashboard) so they're easy to change.
public static class ApplicationRules
{
    public const decimal MaxDwellingCoverage = 50_000_000m;      // highest home value the form accepts
    public const decimal MinDwellingCoverage = 50_000m;
    public const decimal SpecialistDwellingThreshold = 1_000_000m; // above this, a specialist reviews it

    // Auto-approve: only these lines, and only when every line on the application is one of them
    public static readonly string[] AutoApproveLines = { "AUTO", "JEWELRY" };
    public const int AutoMinYearsLicensed = 3;               // every driver
    public const int AutoMaxVehicles = 4;
    public const decimal JewelryMaxTotalValue = 25_000m;     // all items together
    public const decimal JewelryAppraisalRequiredOver = 5_000m; // items above this need an appraisal

    public record Decision(string Status, string? AutoDecision, List<string> Reasons);

    public static Decision Decide(ApplicationDetail app, QuoteResponse? quote)
    {
        // 1. High-value homes go to a specialist
        var dwelling = Number(app.Answers.GetValueOrDefault("dwelling_coverage"));
        if (app.LineCodes.Contains("HOME") && dwelling > SpecialistDwellingThreshold)
        {
            return new Decision("escalated", "escalated", new List<string>
            {
                $"Home value of {Money(dwelling.Value)} is over {Money(SpecialistDwellingThreshold)}, so a specialist reviews it."
            });
        }

        // 2. Auto-approve check
        var reasons = new List<string>();
        var blockers = AutoApproveBlockers(app, quote, reasons);
        if (blockers.Count == 0)
            return new Decision("approved", "approved", reasons);

        // 3. Normal review
        return new Decision("submitted", null, blockers);
    }

    // Why this application can't be auto-approved (empty = it can). Adds what it checked to `passed`.
    private static List<string> AutoApproveBlockers(ApplicationDetail app, QuoteResponse? quote, List<string> passed)
    {
        var blockers = new List<string>();
        if (app.LineCodes.Count == 0 || app.LineCodes.Any(code => !AutoApproveLines.Contains(code)))
        {
            blockers.Add("Only Auto and Jewelry applications can be approved automatically.");
            return blockers;
        }
        if (quote == null || quote.Status != "DEMO_ESTIMATE")
            blockers.Add("An agent has to price part of this application.");

        if (app.LineCodes.Contains("AUTO"))
        {
            var vehicles = app.Items.GetValueOrDefault("vehicle") ?? new();
            var drivers = app.Items.GetValueOrDefault("driver") ?? new();
            if (app.Answers.GetValueOrDefault("recent_incidents") != "no")
                blockers.Add("Recent accidents, claims, or violations were reported.");
            if (vehicles.Count == 0 || vehicles.Count > AutoMaxVehicles)
                blockers.Add($"Auto-approval covers 1 to {AutoMaxVehicles} vehicles.");
            if (vehicles.Any(v => v.GetValueOrDefault("use") is "business" or "rideshare"))
                blockers.Add("A vehicle is used for business, rideshare, or delivery.");
            if (drivers.Count == 0 || drivers.Any(d => (Number(d.GetValueOrDefault("years_licensed")) ?? 0) < AutoMinYearsLicensed))
                blockers.Add($"Every driver needs at least {AutoMinYearsLicensed} years of driving experience.");
            if (blockers.Count == 0)
                passed.Add($"Auto: no recent incidents, personal use, every driver licensed {AutoMinYearsLicensed}+ years.");
        }

        if (app.LineCodes.Contains("JEWELRY"))
        {
            var items = app.Items.GetValueOrDefault("jewelry") ?? new();
            var total = items.Sum(i => Number(i.GetValueOrDefault("value")) ?? 0);
            if (items.Count == 0)
                blockers.Add("No jewelry items were listed.");
            if (total > JewelryMaxTotalValue)
                blockers.Add($"Jewelry worth more than {Money(JewelryMaxTotalValue)} in total needs an agent.");
            if (items.Any(i => (Number(i.GetValueOrDefault("value")) ?? 0) > JewelryAppraisalRequiredOver
                               && i.GetValueOrDefault("appraised") != "yes"))
                blockers.Add($"Items worth more than {Money(JewelryAppraisalRequiredOver)} need a professional appraisal.");
            if (blockers.Count == 0)
                passed.Add($"Jewelry: {Money(total)} in total, appraisals on file for items over {Money(JewelryAppraisalRequiredOver)}.");
        }
        return blockers;
    }

    private static decimal? Number(string? value) =>
        decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null;

    private static string Money(decimal amount) => amount.ToString("$#,0", CultureInfo.InvariantCulture);
}
