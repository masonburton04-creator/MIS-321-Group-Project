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

    // Things an agent should look at, raised by the preliminary state rules (StateRules.cs)
    public List<ReviewFlag> Flags { get; } = new();

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

        quote.Basis.Add($"{Money(dwelling!.Value)} dwelling (rebuild) coverage");

        // Preliminary rules. Answers added in Sprint 2 (roof, updates, county...) are only
        // checked when present, so older applications still get an estimate.
        var year = DateTime.Today.Year;
        var county = StateRules.County(app);
        var coastal = StateRules.IsCoastal(app.StateCode, county);
        var roofAge = year - Number(app, "roof_year");
        var systemsAge = year - Number(app, "last_updated_year");
        var claims = Text(app, "prior_claims") == "3plus" ? 3 : Number(app, "prior_claims");

        if (Text(app, "home_type") == "mobile")
            Refer(quote, "HOME_MOBILE", "Manufactured and mobile homes need a specialty policy, so a specialist will price this.");
        if (Text(app, "occupancy") == "rental")
            Refer(quote, "HOME_RENTAL", "Homes rented out to someone else need a landlord (dwelling-fire) policy, so a specialist will price this.");
        if (roofAge > Factor("HOME", "roof_age_refer_years"))
            Refer(quote, "HOME_ROOF_AGE", $"The roof is about {roofAge} years old. A specialist will price this after a roof inspection.");
        if (claims >= Factor("HOME", "prior_claims_refer"))
            Refer(quote, "HOME_CLAIMS", "Several recent claims on the home mean a specialist needs to price this.");
        if (app.StateCode == "TX" && coastal)
            Refer(quote, "HOME_TX_TWIA", $"{county} County is on the Texas coast, where wind and hail usually need a separate TWIA policy. A specialist will price this.");
        if (quote.Status == "REFERRED") return quote;

        var lowMult = Factor("HOME", "range_low_mult");
        var highMult = Factor("HOME", "range_high_mult");

        if (app.StateCode == "TX")
        {
            highMult *= Factor("HOME", "tx_hail_high_mult");
            quote.Basis.Add("Texas wind and hail risk");
            quote.Notes.Add("Texas policies often have a separate wind/hail deductible set as a percentage of the dwelling amount.");
            Flag("HOME", "info", "HOME_TX_HAIL", "Texas home: confirm the wind/hail deductible.");
            if (roofAge > Factor("HOME", "tx_old_roof_years"))
            {
                highMult *= Factor("HOME", "tx_old_roof_high_mult");
                quote.Basis.Add($"Roof about {roofAge} years old (hail exposure)");
                Flag("HOME", "review", "HOME_TX_OLD_ROOF", $"Texas roof is about {roofAge} years old: check for hail damage and whether the roof is paid at actual cash value.");
            }
        }
        else if (coastal)
        {
            highMult *= Factor("HOME", "coastal_high_mult");
            quote.Basis.Add($"Coastal county ({county}) hurricane exposure");
            quote.Notes.Add("Coastal homes usually have a separate hurricane or named-storm deductible.");
            if (app.StateCode == "AL")
                Flag("HOME", "review", "HOME_AL_COASTAL", $"{county} County, AL: confirm the hurricane deductible and whether the Alabama Beach Pool is needed.");
            else
                Flag("HOME", "review", "HOME_NY_COASTAL", $"{county} County, NY: a hurricane deductible (usually 1% to 5%) may apply.");
        }
        if (county == null && Text(app, "street") != null)
            Flag("HOME", "info", "HOME_COUNTY_UNKNOWN", "County not known, so the coastal rules couldn't be checked. Confirm the county.");

        if (systemsAge > Factor("HOME", "old_systems_years"))
        {
            highMult *= Factor("HOME", "old_systems_high_mult");
            quote.Basis.Add("Electrical, plumbing, or heating/cooling not updated in many years");
            Flag("HOME", "review", "HOME_OLD_SYSTEMS", $"Last major systems update was about {systemsAge} years ago: confirm wiring, plumbing, and heating.");
        }
        if (Text(app, "roof_certification") is "fortified" or "class4")
        {
            lowMult *= Factor("HOME", "impact_roof_low_mult");
            quote.Basis.Add("Storm-resistant roof (possible discount)");
        }
        if (Text(app, "occupancy") is "secondary" or "vacant")
            Flag("HOME", "review", "HOME_OCCUPANCY", "Not the customer's main home: check vacancy and seasonal-use limits.");
        var exposures = new[] { ("has_pool", "pool"), ("has_trampoline", "trampoline"), ("has_dog", "dog") }
            .Where(x => Text(app, x.Item1) == "yes").Select(x => x.Item2).ToList();
        if (exposures.Count > 0)
            Flag("HOME", "info", "HOME_LIABILITY", "Liability exposure: " + string.Join(", ", exposures) + ".");

        var average = dwelling.Value / 1000 * Factor("HOME", "annual_per_1000_dwelling");
        quote.Low = RoundDown(average * lowMult);
        quote.High = RoundUp(average * highMult);
        quote.Status = "DEMO_ESTIMATE";
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
            Refer(quote, "FLOOD_ZONE_V", "Homes in coastal high-risk zones (V/VE) are priced individually by a flood specialist.");
            return quote;
        }

        var county = StateRules.County(app);
        if (zone == "unknown" && StateRules.IsCoastal(app.StateCode, county))
            Flag("FLOOD", "review", "FLOOD_COASTAL_UNKNOWN", $"{county} County is coastal and the flood zone isn't known: look it up on the FEMA flood map.");
        if (app.StateCode == "TX" && StateRules.IsCoastal("TX", county))
            quote.Notes.Add("TWIA and Texas FAIR Plan policies don't cover flood, so coastal Texas homes need this separate flood policy.");

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
        {
            quote.Notes.Add("Items without a professional appraisal may need one before they can be insured.");
            Flag("JEWELRY", "review", "JEWELRY_NO_APPRAISAL", "At least one item isn't professionally appraised: ask for an appraisal.");
        }
        var specialistValue = Factor("JEWELRY", "specialist_item_value");
        if (values.Any(v => v > specialistValue))
            Flag("JEWELRY", "refer", "JEWELRY_HIGH_VALUE", $"An item is worth more than {Money(specialistValue)}: escalate to a jewelry specialist.");
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
            Refer(quote, "AUTO_BUSINESS_USE", "Vehicles used for business, rideshare, or delivery need a licensed agent to price them.");
            return quote;
        }

        var low = level == "full" ? Factor("AUTO", "full_low") : Factor("AUTO", "liability_low");
        var high = level == "full" ? Factor("AUTO", "full_high") : Factor("AUTO", "liability_high");
        var lowMult = Factor("AUTO", "range_low_mult");
        var highMult = Factor("AUTO", "range_high_mult");

        // Preliminary state rules
        if (app.StateCode == "TX" && level == "full")
        {
            highMult *= Factor("AUTO", "tx_hail_comp_high_mult");
            quote.Basis.Add("Texas hail risk (comprehensive)");
            Flag("AUTO", "info", "AUTO_TX_HAIL", "Texas full coverage: hail claims fall under comprehensive. Confirm the comprehensive deductible.");
        }
        if (app.StateCode == "NY")
        {
            lowMult *= Factor("AUTO", "ny_required_low_mult");
            quote.Basis.Add("New York requires no-fault (PIP) and uninsured motorist coverage");
        }

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

        quote.Low = RoundDown(low * lowMult * vehicles.Count);
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

    // No price for this line; a specialist prices it. Every reason is listed for the customer and the agent.
    private void Refer(LineQuote quote, string ruleId, string reason)
    {
        quote.Status = "REFERRED";
        quote.Low = null;
        quote.High = null;
        quote.Notes.Add(reason);
        Flag(quote.LineCode, "refer", ruleId, reason);
    }

    private void Flag(string line, string severity, string ruleId, string message) =>
        Flags.Add(new ReviewFlag { LineCode = line, Severity = severity, RuleId = ruleId, Message = message });

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
