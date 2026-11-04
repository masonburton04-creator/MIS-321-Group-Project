using API.Models;

namespace API.Services;

// PRELIMINARY eligibility rules per state, for the client to review (Sprint 2 review,
// slide 5: "come up with your preliminary idea of what should be used to calculate
// eligibility per state ... consider things like wind / hail risk in TX for cars and home").
// None of this is a Valent Partners or carrier rule yet.
//
// DemoQuoteEngine applies the rules; the adjustable numbers (ages, multipliers) are in
// demo_quote_factors (Database/04_demo_quote_rates.sql). Catalog is what the agent
// dashboard lists for the client, so keep it in step with the engine.
public static class StateRules
{
    // Texas first-tier coastal counties, where TWIA is the wind/hail insurer of last resort.
    // (TWIA also covers part of Harris County, which needs a specialist to check.)
    private static readonly HashSet<string> TexasCoastal = new(StringComparer.OrdinalIgnoreCase)
    {
        "Aransas", "Brazoria", "Calhoun", "Cameron", "Chambers", "Galveston", "Jefferson",
        "Kenedy", "Kleberg", "Matagorda", "Nueces", "Refugio", "San Patricio", "Willacy"
    };

    // Coastal Alabama: Alabama Insurance Underwriting Association ("Beach Pool") area
    private static readonly HashSet<string> AlabamaCoastal = new(StringComparer.OrdinalIgnoreCase) { "Baldwin", "Mobile" };

    // New York City and Long Island, where hurricane deductibles usually apply (needs verification)
    private static readonly HashSet<string> NewYorkCoastal = new(StringComparer.OrdinalIgnoreCase)
    {
        "Kings", "Queens", "Richmond", "Bronx", "New York", "Nassau", "Suffolk"
    };

    // "Galveston County" (as Google returns it) -> "Galveston"; null if not answered
    public static string? County(ApplicationDetail app)
    {
        var county = app.Answers.GetValueOrDefault("county")?.Trim();
        if (string.IsNullOrEmpty(county)) return null;
        foreach (var suffix in new[] { " County", " Parish", " Borough" })
        {
            if (county.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                return county[..^suffix.Length].Trim();
        }
        return county;
    }

    public static bool IsCoastal(string stateCode, string? county) => county != null && stateCode switch
    {
        "TX" => TexasCoastal.Contains(county),
        "AL" => AlabamaCoastal.Contains(county),
        "NY" => NewYorkCoastal.Contains(county),
        _ => false
    };

    public static readonly List<RuleInfo> Catalog = new()
    {
        // ---- Homeowners, every state ----
        new() { Id = "HOME_MOBILE", LineCode = "HOME", State = "ALL",
            When = "Home type is mobile / manufactured",
            Effect = "Specialist prices it (needs a specialty policy)" },
        new() { Id = "HOME_RENTAL", LineCode = "HOME", State = "ALL",
            When = "The home is rented out to someone else",
            Effect = "Specialist prices it (needs a landlord / dwelling-fire policy)" },
        new() { Id = "HOME_ROOF_AGE", LineCode = "HOME", State = "ALL",
            When = "Roof older than 20 years (roof_age_refer_years)",
            Effect = "Specialist prices it after a roof inspection" },
        new() { Id = "HOME_CLAIMS", LineCode = "HOME", State = "ALL",
            When = "3 or more home claims in the last 5 years (prior_claims_refer)",
            Effect = "Specialist prices it" },
        new() { Id = "HOME_OLD_SYSTEMS", LineCode = "HOME", State = "ALL",
            When = "No major electrical, plumbing, or heating/cooling update in 40+ years (old_systems_years)",
            Effect = "Wider price range; agent checks the systems" },
        new() { Id = "HOME_IMPACT_ROOF", LineCode = "HOME", State = "ALL",
            When = "FORTIFIED or Class 4 impact-resistant roof",
            Effect = "Lower low end of the range (possible discount)" },
        new() { Id = "HOME_OCCUPANCY", LineCode = "HOME", State = "ALL",
            When = "Second home, or vacant",
            Effect = "Agent reviews (vacancy limits often apply)" },
        new() { Id = "HOME_LIABILITY", LineCode = "HOME", State = "ALL",
            When = "Pool, trampoline, or dog",
            Effect = "Agent notes the liability exposure" },
        // ---- Homeowners, by state ----
        new() { Id = "HOME_TX_TWIA", LineCode = "HOME", State = "TX",
            When = "Home in one of the 14 first-tier coastal counties",
            Effect = "Specialist prices it: wind and hail usually need a separate TWIA policy",
            Source = "TDI: Other Ways to Get Home and Wind Insurance" },
        new() { Id = "HOME_TX_HAIL", LineCode = "HOME", State = "TX",
            When = "Any Texas home (statewide wind and hail risk)",
            Effect = "Higher top of the range; percentage wind/hail deductibles are common", NeedsVerification = true },
        new() { Id = "HOME_TX_OLD_ROOF", LineCode = "HOME", State = "TX",
            When = "Texas roof older than 10 years (tx_old_roof_years)",
            Effect = "Higher top of the range; agent checks for hail damage and roof-payment terms", NeedsVerification = true },
        new() { Id = "HOME_AL_COASTAL", LineCode = "HOME", State = "AL",
            When = "Home in Baldwin or Mobile County",
            Effect = "Wider range; agent checks the hurricane deductible and whether the Beach Pool is needed",
            Source = "AL DOI windstorm mitigation handout", NeedsVerification = true },
        new() { Id = "HOME_NY_COASTAL", LineCode = "HOME", State = "NY",
            When = "Home in New York City or on Long Island",
            Effect = "Wider range; hurricane deductible (usually 1%–5%) may apply",
            Source = "NY DFS: Windstorm and Hurricane Deductibles", NeedsVerification = true },
        new() { Id = "HOME_COUNTY_UNKNOWN", LineCode = "HOME", State = "ALL",
            When = "County not known (address typed in without the lookup)",
            Effect = "Agent confirms the county so the coastal rules can be checked" },
        // ---- Flood ----
        new() { Id = "FLOOD_ZONE_V", LineCode = "FLOOD", State = "ALL",
            When = "Flood zone V / VE (coastal high risk)",
            Effect = "Specialist prices it" },
        new() { Id = "FLOOD_COASTAL_UNKNOWN", LineCode = "FLOOD", State = "ALL",
            When = "Coastal county and the customer doesn't know the flood zone",
            Effect = "Agent looks up the FEMA flood map before pricing" },
        // ---- Jewelry ----
        new() { Id = "JEWELRY_HIGH_VALUE", LineCode = "JEWELRY", State = "ALL",
            When = "Any single item worth more than $25,000 (specialist_item_value)",
            Effect = "Escalate to a jewelry specialist" },
        new() { Id = "JEWELRY_NO_APPRAISAL", LineCode = "JEWELRY", State = "ALL",
            When = "An item without a professional appraisal",
            Effect = "Agent asks for an appraisal before binding" },
        // ---- Auto ----
        new() { Id = "AUTO_BUSINESS_USE", LineCode = "AUTO", State = "ALL",
            When = "A vehicle used for business, rideshare, or delivery",
            Effect = "Licensed agent prices it" },
        new() { Id = "AUTO_TX_HAIL", LineCode = "AUTO", State = "TX",
            When = "Texas, liability + collision & comprehensive",
            Effect = "Higher top of the range (hail claims fall under comprehensive)", NeedsVerification = true },
        new() { Id = "AUTO_NY_REQUIRED", LineCode = "AUTO", State = "NY",
            When = "Any New York auto policy",
            Effect = "Higher bottom of the range: $50,000 no-fault (PIP) and uninsured motorist are required",
            Source = "NY DFS: What Auto Coverages Do I Need?" }
    };
}
