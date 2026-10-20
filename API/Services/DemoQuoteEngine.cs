using System.Globalization;
using API.Models;

namespace API.Services;

// Turns an application's saved answers into a rough yearly price RANGE per insurance line,
// using the numbers in the demo_quote_factors table (Database/04_demo_quote_rates.sql).
//
// This is a DEMO estimate, not a real quote: the factors are national averages plus
// placeholders. When the client provides approved rating rules or a carrier quote API,
// replace this class; the controller and front end only depend on QuoteResponse.
public class DemoQuoteEngine
{
    // factors[lineCode][factorKey] = value
    private readonly Dictionary<string, Dictionary<string, decimal>> _factors;

    public DemoQuoteEngine(Dictionary<string, Dictionary<string, decimal>> factors)
    {
        _factors = factors;
    }

    public List<LineQuote> Estimate(ApplicationDetail app)
    {
        return app.LineCodes.Select(code => code switch
        {
            "HOME" => EstimateHome(app),
            "FLOOD" => EstimateFlood(app),
            "JEWELRY" => EstimateJewelry(app),
            "AUTO" => EstimateAuto(app),
            _ => new LineQuote { LineCode = code, Status = "REFERRED", Notes = { "No estimate is available for this line yet." } }
        }).ToList();
    }

    private LineQuote EstimateHome(ApplicationDetail app)
    {
        var quote = new LineQuote { LineCode = "HOME" };
        var dwelling = Number(app, "dwelling_coverage");
        if (dwelling == null || dwelling <= 0)
            quote.Missing.Add(new MissingAnswer { Step = 1, Field = "dwelling_coverage", Label = "Estimated cost to rebuild your home" });
        if (quote.Missing.Count > 0) return Incomplete(quote);

        var average = dwelling!.Value / 1000 * Factor("HOME", "annual_per_1000_dwelling");
        quote.Low = RoundDown(average * Factor("HOME", "range_low_mult"));
        quote.High = RoundUp(average * Factor("HOME", "range_high_mult"));
        quote.Status = "DEMO_ESTIMATE";
        quote.Basis.Add($"{Money(dwelling.Value)} dwelling (rebuild) coverage");
        quote.Basis.Add("National average price per $1,000 of coverage");
        quote.Notes.Add("Your deductible, roof, claims history, and location can move the price a lot.");
        return quote;
    }

    private LineQuote EstimateFlood(ApplicationDetail app)
    {
        var quote = new LineQuote { LineCode = "FLOOD" };
        var zone = Text(app, "flood_zone");
        var building = Number(app, "flood_building_coverage");
        var contents = Number(app, "flood_contents_coverage");

        if (building == null)
            quote.Missing.Add(new MissingAnswer { Step = 1, Field = "flood_building_coverage", Label = "Flood coverage for the building" });
        if (contents == null)
            quote.Missing.Add(new MissingAnswer { Step = 1, Field = "flood_contents_coverage", Label = "Flood coverage for your belongings" });
        if (zone == null)
            quote.Missing.Add(new MissingAnswer { Step = 2, Field = "flood_zone", Label = "Flood zone" });
        if (quote.Missing.Count > 0) return Incomplete(quote);

        if (building == 0 && contents == 0)
        {
            quote.Missing.Add(new MissingAnswer { Step = 1, Field = "flood_building_coverage", Label = "Flood coverage amount (building, belongings, or both)" });
            return Incomplete(quote);
        }

        quote.Basis.Add($"{Money(building!.Value)} building / {Money(contents!.Value)} belongings coverage");
        quote.Notes.Add("Flood policies through the NFIP generally have a 30-day waiting period before coverage starts.");

        if (zone == "V")
        {
            quote.Status = "REFERRED";
            quote.Notes.Insert(0, "Homes in coastal high-risk zones (V/VE) are priced individually by a flood specialist.");
            return quote;
        }

        var lowMult = zone == "X" ? Factor("FLOOD", "zone_x_low_mult") : Factor("FLOOD", "zone_a_low_mult");
        var highMult = zone == "X" ? Factor("FLOOD", "zone_x_high_mult") : Factor("FLOOD", "zone_a_high_mult");
        var average = Factor("FLOOD", "annual_avg_policy");
        quote.Low = RoundDown(average * lowMult);
        quote.High = RoundUp(average * highMult);
        quote.Status = "DEMO_ESTIMATE";
        quote.Basis.Add(zone switch
        {
            "X" => "Flood zone X (moderate/low risk)",
            "A" => "Flood zone A/AE (high risk)",
            _ => "Flood zone not known yet, so the range is wide"
        });
        quote.Basis.Add("National average flood policy price");
        quote.Notes.Add("Real flood pricing also depends on elevation, the building, and distance to water.");
        return quote;
    }

    private LineQuote EstimateJewelry(ApplicationDetail app)
    {
        var quote = new LineQuote { LineCode = "JEWELRY" };
        var items = app.Items.GetValueOrDefault("jewelry") ?? new List<Dictionary<string, string?>>();
        var values = items.Select(item => ParseNumber(item.GetValueOrDefault("value"))).ToList();

        if (items.Count == 0 || values.Any(v => v == null || v <= 0))
        {
            quote.Missing.Add(new MissingAnswer { Step = 2, Field = "jewelry", Label = "Each jewelry item and its estimated value" });
            return Incomplete(quote);
        }

        var total = values.Sum(v => v!.Value);
        quote.Low = RoundDown(total * Factor("JEWELRY", "rate_low_pct") / 100);
        quote.High = RoundUp(total * Factor("JEWELRY", "rate_high_pct") / 100);
        quote.Status = "DEMO_ESTIMATE";
        quote.Basis.Add($"{items.Count} item{(items.Count == 1 ? "" : "s")} worth {Money(total)} in total");
        quote.Basis.Add($"Typical yearly cost of {Factor("JEWELRY", "rate_low_pct"):0.#}%–{Factor("JEWELRY", "rate_high_pct"):0.#}% of value");

        if (items.Any(item => item.GetValueOrDefault("appraised") != "yes"))
            quote.Notes.Add("Items without a professional appraisal may need one before they can be insured.");
        return quote;
    }

    private LineQuote EstimateAuto(ApplicationDetail app)
    {
        var quote = new LineQuote { LineCode = "AUTO" };
        var level = Text(app, "auto_coverage");
        var incidents = Text(app, "recent_incidents");
        var vehicles = app.Items.GetValueOrDefault("vehicle") ?? new List<Dictionary<string, string?>>();
        var drivers = app.Items.GetValueOrDefault("driver") ?? new List<Dictionary<string, string?>>();

        if (level != "liability" && level != "full")
            quote.Missing.Add(new MissingAnswer { Step = 1, Field = "auto_coverage", Label = "Which auto coverage you want" });
        if (vehicles.Count == 0)
            quote.Missing.Add(new MissingAnswer { Step = 2, Field = "vehicle", Label = "At least one vehicle" });
        if (drivers.Count == 0)
            quote.Missing.Add(new MissingAnswer { Step = 2, Field = "driver", Label = "At least one driver" });
        if (incidents == null)
            quote.Missing.Add(new MissingAnswer { Step = 2, Field = "recent_incidents", Label = "Recent accidents, claims, or violations" });
        if (quote.Missing.Count > 0) return Incomplete(quote);

        quote.Basis.Add($"{vehicles.Count} vehicle{(vehicles.Count == 1 ? "" : "s")}, {drivers.Count} driver{(drivers.Count == 1 ? "" : "s")}");
        quote.Basis.Add(level == "full" ? "Liability + collision & comprehensive" : "Liability only");

        // The research doc says business/rideshare use goes to a licensed agent instead of being guessed
        if (vehicles.Any(v => v.GetValueOrDefault("use") is "business" or "rideshare"))
        {
            quote.Status = "REFERRED";
            quote.Notes.Add("Vehicles used for business, rideshare, or delivery need a licensed agent to price them.");
            return quote;
        }

        var low = level == "full" ? Factor("AUTO", "full_low") : Factor("AUTO", "liability_low");
        var high = level == "full" ? Factor("AUTO", "full_high") : Factor("AUTO", "liability_high");
        var highMult = Factor("AUTO", "range_high_mult");

        if (incidents == "yes")
        {
            highMult *= Factor("AUTO", "incident_high_mult");
            quote.Basis.Add("Recent accidents, claims, or violations reported");
        }

        var newDriverYears = Factor("AUTO", "new_driver_years");
        if (drivers.Any(d => ParseNumber(d.GetValueOrDefault("years_licensed")) < newDriverYears))
        {
            highMult *= Factor("AUTO", "new_driver_high_mult");
            quote.Basis.Add($"A driver licensed less than {newDriverYears:0} years");
        }

        quote.Low = RoundDown(low * Factor("AUTO", "range_low_mult") * vehicles.Count);
        quote.High = RoundUp(high * highMult * vehicles.Count);
        quote.Status = "DEMO_ESTIMATE";

        if (level == "liability" && vehicles.Any(v => v.GetValueOrDefault("ownership") is "financed" or "leased"))
            quote.Notes.Add("Lenders and leasing companies usually require collision & comprehensive on financed or leased vehicles.");
        if (vehicles.Count > 1)
            quote.Notes.Add("Insuring several vehicles together may lower the price. Your specialist will confirm.");
        quote.Notes.Add("Required coverages and minimum limits vary by state.");
        return quote;
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    private decimal Factor(string line, string key)
    {
        if (_factors.TryGetValue(line, out var lineFactors) && lineFactors.TryGetValue(key, out var value))
            return value;
        throw new InvalidOperationException(
            $"Demo quote factor {line}.{key} is missing. Re-run Database/04_demo_quote_rates.sql.");
    }

    private static LineQuote Incomplete(LineQuote quote)
    {
        quote.Status = "INCOMPLETE";
        quote.Low = null;
        quote.High = null;
        return quote;
    }

    private static string? Text(ApplicationDetail app, string key) => app.Answers.GetValueOrDefault(key);

    private static decimal? Number(ApplicationDetail app, string key) => ParseNumber(Text(app, key));

    private static decimal? ParseNumber(string? value) =>
        decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null;

    // Ranges are rounded outward to the nearest $10 so they don't look falsely precise
    private static decimal RoundDown(decimal amount) => Math.Floor(amount / 10) * 10;
    private static decimal RoundUp(decimal amount) => Math.Ceiling(amount / 10) * 10;

    private static string Money(decimal amount) => amount.ToString("$#,0", CultureInfo.InvariantCulture);
}
