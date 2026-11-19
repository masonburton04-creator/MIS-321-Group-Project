using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using API.Models;

namespace API.Services;

// Price questions in the chat are answered here, not by the AI model:
//   1. FromText() reads the facts the customer typed ("$300k to rebuild", "2 cars, no accidents").
//   2. ToApplication() puts them in the same shape the application form saves.
//   3. ApplicationsController.BuildQuoteAsync() runs the SAME formula as the application's Quote step.
//   4. Describe() writes the reply, so every number is exact.
// This answers in milliseconds (the model takes 10-30 seconds to fill in a quote on a laptop)
// and the bot can never invent a price or a fact the customer didn't give.
public static partial class ChatQuoteBuilder
{
    private static readonly string[] LineOrder = { "HOME", "FLOOD", "JEWELRY", "AUTO" };
    private static readonly string[] Offered = { "AL", "TX", "NY" };

    public static readonly Dictionary<string, string> LineNames = new()
    {
        ["HOME"] = "Homeowners", ["FLOOD"] = "Flood", ["JEWELRY"] = "Jewelry", ["AUTO"] = "Auto"
    };

    private static readonly Dictionary<string, string> StateNames = new()
    {
        ["AL"] = "Alabama", ["TX"] = "Texas", ["NY"] = "New York", ["ALABAMA"] = "AL", ["TEXAS"] = "TX", ["NEW YORK"] = "NY"
    };

    // ---------------------------------------------------------------
    // Is this message about price?
    // ---------------------------------------------------------------

    // "How much is...", "quote", "estimate"... but not "what affects the price of..." (that's a coverage question)
    public static bool AsksForPrice(string text) =>
        PriceRegex().IsMatch(text) && !ExplainPriceRegex().IsMatch(text);

    // Insurance lines named in the text, in the site's usual order
    public static List<string> LinesIn(string text)
    {
        var t = text.ToLowerInvariant();
        var lines = new List<string>();
        if (HomeLineRegex().IsMatch(t)) lines.Add("HOME");
        if (FloodLineRegex().IsMatch(t)) lines.Add("FLOOD");
        if (JewelryLineRegex().IsMatch(t)) lines.Add("JEWELRY");
        if (AutoLineRegex().IsMatch(t)) lines.Add("AUTO");
        return lines;
    }

    // ---------------------------------------------------------------
    // Facts from what the customer typed.
    //   quoteText:  every customer message since they asked for a price (so answers to
    //               "I still need..." add to what they already said)
    //   latest:     their newest message, which decides the insurance line if it names one
    // ---------------------------------------------------------------
    public static ChatQuoteRequest FromText(string quoteText, string latest, string? pageState, out int factsInLatest)
    {
        var request = new ChatQuoteRequest { StateCode = StateIn(quoteText) ?? pageState };
        request.Lines = LinesIn(latest);
        if (request.Lines.Count == 0) request.Lines = LinesIn(quoteText);
        var lower = quoteText.ToLowerInvariant();
        var lines = request.Lines;

        // ---- Dollar amounts, each matched to the nearest word that says what it's for ----
        var amounts = AmountRegex().Matches(lower)
            .Select(m => (Value: ParseMoney(m.Value), m.Index, End: m.Index + m.Length))
            .Where(a => a.Value is >= 100)
            .ToList();
        string? Nearest(int start, int end)
        {
            string? best = null;
            var bestDistance = 40; // characters
            foreach (Match k in AmountLabelRegex().Matches(lower))
            {
                var distance = k.Index >= end ? k.Index - end : start - (k.Index + k.Length);
                if (distance >= 0 && distance < bestDistance) { bestDistance = distance; best = k.Value; }
            }
            return best;
        }
        var labeled = amounts.Select(a => (a.Value, Label: Kind(Nearest(a.Index, a.End)))).ToList();

        if (lines.Contains("HOME"))
        {
            var home = labeled.Where(a => a.Label == "home").Select(a => a.Value).LastOrDefault()
                    ?? (lines.Count == 1 ? labeled.Where(a => a.Value >= 50_000 && a.Label is null or "home").Select(a => a.Value).LastOrDefault() : null);
            request.DwellingCoverage = home;
        }

        if (lines.Contains("FLOOD"))
        {
            request.FloodBuildingCoverage = labeled.Where(a => a.Label == "building").Select(a => a.Value).LastOrDefault();
            request.FloodContentsCoverage = labeled.Where(a => a.Label == "contents").Select(a => a.Value).LastOrDefault();
            if (NoBuildingRegex().IsMatch(lower)) request.FloodBuildingCoverage = 0;
            if (NoContentsRegex().IsMatch(lower)) request.FloodContentsCoverage = 0;
            // One amount with no label, flood only: treat it as building coverage
            if (lines.Count == 1 && request.FloodBuildingCoverage == null && request.FloodContentsCoverage == null)
            {
                var only = labeled.Where(a => a.Label == null).Select(a => a.Value).ToList();
                if (only.Count == 1) request.FloodBuildingCoverage = only[0];
            }
            var zone = ZoneRegex().Match(lower);
            if (zone.Success) request.FloodZone = (zone.Groups[1].Success ? zone.Groups[1].Value : zone.Groups[2].Value).ToUpperInvariant() switch
            {
                var z when z.StartsWith('V') => "V",
                var z when z.StartsWith('A') => "A",
                _ => "X"
            };
            else if (DontKnowRegex().IsMatch(lower)) request.FloodZone = "unknown";
        }

        if (lines.Contains("JEWELRY"))
        {
            var jewelry = labeled.Where(a => a.Label == "jewelry" || (lines.Count == 1 && a.Label == null))
                .Select(a => a.Value!.Value).ToList();
            request.JewelryItemValues = jewelry;
            request.JewelryAppraised = AppraisedRegex().IsMatch(lower) && !NotAppraisedRegex().IsMatch(lower);
        }

        if (lines.Contains("AUTO"))
        {
            if (FullCoverageRegex().IsMatch(lower)) request.AutoCoverage = "full";
            else if (LiabilityRegex().IsMatch(lower)) request.AutoCoverage = "liability";
            request.VehicleCount = CountBefore(lower, VehicleWordRegex()) ?? (OneVehicleRegex().IsMatch(lower) ? 1 : null);
            request.DriverCount = CountBefore(lower, DriverWordRegex()) ?? (OnlyDriverRegex().IsMatch(lower) ? 1 : null);
            if (NoIncidentsRegex().IsMatch(lower)) request.RecentIncidents = false;
            else if (IncidentRegex().IsMatch(lower)) request.RecentIncidents = true;
            else if (request.AutoCoverage != null && YesNoOnlyRegex().Match(latest.ToLowerInvariant()) is { Success: true } yn)
                request.RecentIncidents = yn.Value.StartsWith('y');
            var years = YearsLicensedRegex().Match(lower);
            if (years.Success) request.NewestDriverYearsLicensed = WordOrNumber(years.Groups[1].Success ? years.Groups[1].Value : years.Groups[2].Value);
            else if (NewDriverRegex().IsMatch(lower)) request.NewestDriverYearsLicensed = 0;
            request.BusinessUse = BusinessRegex().IsMatch(lower);
        }

        // How much the newest message added (0 = it's probably a question, not an answer)
        var latestLower = latest.ToLowerInvariant();
        factsInLatest = LinesIn(latest).Count
            + AmountRegex().Matches(latestLower).Count
            + (ZoneRegex().IsMatch(latestLower) || DontKnowRegex().IsMatch(latestLower) ? 1 : 0)
            + (FullCoverageRegex().IsMatch(latestLower) || LiabilityRegex().IsMatch(latestLower) ? 1 : 0)
            + (CountBefore(latestLower, VehicleWordRegex()) != null || CountBefore(latestLower, DriverWordRegex()) != null ? 1 : 0)
            + (NoIncidentsRegex().IsMatch(latestLower) || IncidentRegex().IsMatch(latestLower) || YesNoOnlyRegex().IsMatch(latestLower) ? 1 : 0)
            + (YearsLicensedRegex().IsMatch(latestLower) ? 1 : 0)
            + (NumberOnlyRegex().IsMatch(latestLower) ? 1 : 0);
        return request;
    }

    private static string? Kind(string? label) => label switch
    {
        null => null,
        var l when l.StartsWith("build") || l.StartsWith("struct") => "building",
        var l when l.StartsWith("content") || l.StartsWith("belong") || l.StartsWith("stuff") || l.StartsWith("personal") => "contents",
        var l when l.StartsWith("jewel") || l.StartsWith("ring") || l.StartsWith("necklace") || l.StartsWith("diamond")
                   || l.StartsWith("bracelet") || l.StartsWith("earring") || l.StartsWith("watch") || l.StartsWith("pendant") => "jewelry",
        _ => "home"
    };

    private static int? CountBefore(string text, Regex noun)
    {
        foreach (Match m in noun.Matches(text))
        {
            var before = Regex.Match(text[..m.Index], @"(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|my)\s+(?:\w+\s+)?$");
            if (!before.Success) continue;
            var n = WordOrNumber(before.Groups[1].Value);
            if (n is > 0 and <= 20) return (int)n.Value;
        }
        return null;
    }

    private static decimal? WordOrNumber(string s) => s switch
    {
        "a" or "an" or "my" or "one" => 1, "two" => 2, "three" => 3, "four" => 4, "five" => 5,
        "six" => 6, "seven" => 7, "eight" => 8, "nine" => 9, "ten" => 10, "zero" => 0,
        _ => decimal.TryParse(s, NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null
    };

    private static string? StateIn(string text)
    {
        var m = StateRegex().Match(text);
        if (!m.Success) return null;
        var v = m.Value.ToUpperInvariant();
        return v.Length == 2 ? v : StateNames.GetValueOrDefault(v);
    }

    // ---------------------------------------------------------------
    // Into the shape the quote engine reads (same keys as the application form)
    // ---------------------------------------------------------------
    public static ApplicationDetail ToApplication(ChatQuoteRequest r, out List<string> extraMissing)
    {
        extraMissing = new List<string>();
        var lines = r.Lines.Select(NormalizeLine).Where(l => l != null).Select(l => l!).Distinct().ToList();
        lines = LineOrder.Where(lines.Contains).ToList();

        var state = r.StateCode?.Trim().ToUpperInvariant();
        var detail = new ApplicationDetail
        {
            LineCodes = lines,
            LineNames = lines.Select(l => LineNames[l]).ToList(),
            StateCode = state is { Length: 2 } ? state : "AL"
        };

        void Answer(string key, string? value) { if (value != null) detail.Answers[key] = value; }
        Answer("dwelling_coverage", Plain(r.DwellingCoverage));
        Answer("flood_zone", r.FloodZone is "X" or "A" or "V" or "unknown" ? r.FloodZone : null);
        Answer("flood_building_coverage", Plain(r.FloodBuildingCoverage));
        Answer("flood_contents_coverage", Plain(r.FloodContentsCoverage));
        Answer("auto_coverage", r.AutoCoverage is "liability" or "full" ? r.AutoCoverage : null);
        Answer("recent_incidents", r.RecentIncidents == null ? null : r.RecentIncidents.Value ? "yes" : "no");

        if (r.JewelryItemValues.Count > 0)
        {
            detail.Items["jewelry"] = r.JewelryItemValues.Take(50).Select(v => new Dictionary<string, string?>
            {
                ["value"] = Plain(v),
                ["appraised"] = r.JewelryAppraised == true ? "yes" : "no"
            }).ToList();
        }

        if (r.VehicleCount is > 0)
        {
            detail.Items["vehicle"] = Enumerable.Range(0, Math.Min(r.VehicleCount.Value, 20)).Select(_ => new Dictionary<string, string?>
            {
                ["use"] = r.BusinessUse == true ? "business" : "personal"
            }).ToList();
        }

        if (r.DriverCount is > 0)
        {
            // The newest driver's years decide the new-driver adjustment, like on the form
            detail.Items["driver"] = Enumerable.Range(0, Math.Min(r.DriverCount.Value, 20)).Select(i => new Dictionary<string, string?>
            {
                ["years_licensed"] = i == 0 ? Plain(r.NewestDriverYearsLicensed) : null
            }).ToList();
        }

        // The form asks every driver's years licensed, so the chat asks for the newest driver's
        if (lines.Contains("AUTO") && r.NewestDriverYearsLicensed == null)
            extraMissing.Add("how many years the **newest driver** has been licensed");

        return detail;
    }

    // ---------------------------------------------------------------
    // The chat reply for a quote. Written here, not by the model, so the numbers are exact.
    // ---------------------------------------------------------------
    public static (string Text, string Outcome) Describe(QuoteResponse quote, List<string> extraMissing, string? askedState)
    {
        var sb = new StringBuilder();
        var stateName = StateNames.GetValueOrDefault(quote.StateCode, quote.StateCode);

        var missing = quote.Lines.SelectMany(l => l.Missing.Select(m => ChatLabel(m.Field, m.Label)))
            .Concat(extraMissing).Distinct().ToList();
        if (missing.Count > 0)
        {
            var names = string.Join(" + ", quote.Lines.Select(l => LineNames.GetValueOrDefault(l.LineCode, l.LineCode)));
            sb.Append($"To estimate {names}, I still need:\n");
            foreach (var m in missing) sb.Append("- ").Append(m).Append('\n');
            sb.Append("\nReply with those details, or use **Quick estimate** below.");
            return (sb.ToString(), "quote_incomplete");
        }

        sb.Append($"Here's a **demo estimate** ({stateName}):\n");
        foreach (var line in quote.Lines)
        {
            var name = LineNames.GetValueOrDefault(line.LineCode, line.LineCode);
            if (line.Low != null && line.High != null)
                sb.Append($"- **{name}:** {Money0(line.Low.Value)} - {Money0(line.High.Value)} per year\n");
            else
                sb.Append($"- **{name}:** {line.Notes.FirstOrDefault() ?? "priced individually by a specialist."}\n");
        }
        if (quote.TotalLow != null && quote.TotalHigh != null && quote.Lines.Count > 1)
            sb.Append($"- **Total:** {Money0(quote.TotalLow.Value)} - {Money0(quote.TotalHigh.Value)} per year\n");

        sb.Append($"\nThis ballpark uses national averages adjusted for {stateName}, not your own details, so it isn't a real quote. Start an application for a reviewed price.");
        if (askedState != null && askedState.Length == 2 && !Offered.Contains(askedState))
            sb.Append(" Note: this prototype only offers coverage in Alabama, Texas, and New York.");

        var outcome = quote.Lines.All(l => l.Low == null) ? "quote_referred" : "quote";
        return (sb.ToString(), outcome);
    }

    public const string WhichLine = "Which insurance would you like an estimate for: **Homeowners**, **Flood**, **Jewelry**, or **Auto**? " +
                                    "For example: \"How much is homeowners insurance for a home that costs $300,000 to rebuild?\"";

    private static string ChatLabel(string field, string fallback) => field switch
    {
        "dwelling_coverage" => "the estimated cost to **rebuild** your home (not its sale price)",
        "flood_building_coverage" => "flood coverage for the **building** (NFIP max $250,000)",
        "flood_contents_coverage" => "flood coverage for your **belongings** (NFIP max $100,000; \"none\" is fine)",
        "flood_zone" => "your **flood zone**: X, A/AE, V/VE, or \"I don't know\"",
        "jewelry" => "the **value of each** jewelry item",
        "auto_coverage" => "**liability only** or **full coverage** (adds collision & comprehensive)",
        "vehicle" => "how many **vehicles**",
        "driver" => "how many **drivers**",
        "recent_incidents" => "any **accidents, claims, or tickets** recently (yes/no)",
        _ => fallback
    };

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    public static string? NormalizeLine(string? s)
    {
        var v = (s ?? "").Trim().ToUpperInvariant();
        return v switch
        {
            "HOME" or "HOMEOWNERS" or "HOMEOWNER" or "HOUSE" => "HOME",
            "FLOOD" => "FLOOD",
            "JEWELRY" or "JEWELLERY" => "JEWELRY",
            "AUTO" or "CAR" or "VEHICLE" => "AUTO",
            _ => null
        };
    }

    // "$300,000", "300k", "1.2 million", "250000" -> number
    public static decimal? ParseMoney(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = MoneyPartsRegex().Match(s.ToLowerInvariant());
        if (!m.Success) return null;
        if (!decimal.TryParse(m.Groups[1].Value.Replace(",", ""), NumberStyles.Number, CultureInfo.InvariantCulture, out var n))
            return null;
        return m.Groups[2].Value switch
        {
            "k" or "thousand" => n * 1_000,
            "m" or "mil" or "million" => n * 1_000_000,
            _ => n
        };
    }

    private static string? Plain(decimal? n) => n?.ToString("0.##", CultureInfo.InvariantCulture);
    private static string Money0(decimal n) => n.ToString("$#,0", CultureInfo.InvariantCulture);

    // ---- Patterns ----
    [GeneratedRegex(@"\b(quote|quotes|estimate|estimates|price|prices|pricing|cost|costs|how much|premium|premiums|rates?|afford|cheap|cheaper|expensive|per year|per month)\b", RegexOptions.IgnoreCase)]
    private static partial Regex PriceRegex();
    [GeneratedRegex(@"\b(what|why|which|how)\b[^?]*\b(affects?|determines?|factors?|raises?|lowers?|increases?|reduces?|influences?|goes? into|calculated|calculate|works?)\b", RegexOptions.IgnoreCase)]
    private static partial Regex ExplainPriceRegex();

    [GeneratedRegex(@"\b(home|homes|house|homeowners?|dwelling|condo|rebuild)\b")]
    private static partial Regex HomeLineRegex();
    [GeneratedRegex(@"\bflood")]
    private static partial Regex FloodLineRegex();
    [GeneratedRegex(@"\b(jewel\w*|rings?|necklaces?|diamonds?|bracelets?|earrings?|watch|watches|pendants?|engagement)\b")]
    private static partial Regex JewelryLineRegex();
    [GeneratedRegex(@"\b(auto|car|cars|vehicles?|trucks?|suv|drivers?|driving|motorcycle)\b")]
    private static partial Regex AutoLineRegex();

    // A dollar amount: "$6,000", "300k", "1.2 million", or a plain number of 4+ digits
    [GeneratedRegex(@"\$\s*\d[\d,]*(?:\.\d+)?\s*(?:k|m|mil|million|thousand)?\b|\b\d[\d,]*(?:\.\d+)?\s*(?:k|m|mil|million|thousand)\b|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b")]
    private static partial Regex AmountRegex();
    [GeneratedRegex(@"(\d[\d,]*(?:\.\d+)?)\s*(k|m|mil|million|thousand)?")]
    private static partial Regex MoneyPartsRegex();
    [GeneratedRegex(@"\b(building|structure|contents|belongings|stuff|personal property|rebuild|dwelling|home|house|jewel\w*|rings?|necklaces?|diamonds?|bracelets?|earrings?|watch|watches|pendants?)\b")]
    private static partial Regex AmountLabelRegex();

    [GeneratedRegex(@"\bzone\s*(ae|a|ao|ah|a\d+|ve|v|x|b|c)\b|\b(ae|ve|x)\s*zone\b")]
    private static partial Regex ZoneRegex();
    [GeneratedRegex(@"\b(don'?t know|do not know|not sure|unsure|no idea|unknown|idk)\b")]
    private static partial Regex DontKnowRegex();
    // "no building coverage", "$0 for the building", "building: none" (a separator is required after the
    // word, so "...$150k building\nno contents" doesn't count as "building no")
    [GeneratedRegex(@"\b(no|none|zero|\$?0)\s+(for\s+(the\s+)?)?(building|structure)|\b(building|structure)\s*(coverage)?\s*[:=-]\s*(no|none|zero|\$?0)\b")]
    private static partial Regex NoBuildingRegex();
    [GeneratedRegex(@"\b(no|none|zero|\$?0)\s+(for\s+(my\s+|the\s+)?)?(contents|belongings|stuff)|\b(contents|belongings)\s*(coverage)?\s*[:=-]\s*(no|none|zero|\$?0)\b")]
    private static partial Regex NoContentsRegex();
    [GeneratedRegex(@"^\s*(what|what's|whats|why|how|who|when|where|which|can|could|does|do|is|are|should|will|would|explain|tell me)\b", RegexOptions.IgnoreCase)]
    private static partial Regex QuestionStartRegex();

    // "What does liability mean?" during a quote is a question for the assistant, not an answer
    public static bool IsQuestion(string text) => QuestionStartRegex().IsMatch(text) && !AsksForPrice(text);

    [GeneratedRegex(@"\b(appraised|appraisal|appraisals)\b")]
    private static partial Regex AppraisedRegex();
    [GeneratedRegex(@"\b(not|never|no|without)\s+(been\s+)?(an?\s+)?(appraised|appraisal)")]
    private static partial Regex NotAppraisedRegex();

    [GeneratedRegex(@"\bfull\b|\bcollision\b|\bcomprehensive\b")]
    private static partial Regex FullCoverageRegex();
    [GeneratedRegex(@"\b(liability|minimum|minimums|basic|state min\w*)\b")]
    private static partial Regex LiabilityRegex();
    [GeneratedRegex(@"\b(cars?|vehicles?|trucks?|suvs?|autos?|motorcycles?)\b")]
    private static partial Regex VehicleWordRegex();
    [GeneratedRegex(@"\b(drivers?)\b")]
    private static partial Regex DriverWordRegex();
    [GeneratedRegex(@"\b(my|a|one|the)\s+(car|vehicle|truck|suv)\b")]
    private static partial Regex OneVehicleRegex();
    [GeneratedRegex(@"\b(just me|only me|only driver|i'?m the only|i am the only|single driver|myself)\b")]
    private static partial Regex OnlyDriverRegex();
    [GeneratedRegex(@"\b(no|zero|never had any|never had an?|without)\s+(recent\s+)?(accidents?|tickets?|claims?|violations?|incidents?)|\bclean\s+(driving\s+)?(record|history)\b|\bnone\b")]
    private static partial Regex NoIncidentsRegex();
    [GeneratedRegex(@"\b(accidents?|tickets?|claims?|violations?|speeding|dui|dwi|crash(ed)?|wreck)\b")]
    private static partial Regex IncidentRegex();
    [GeneratedRegex(@"^\s*(yes|yeah|yep|no|nope)\b")]
    private static partial Regex YesNoOnlyRegex();
    [GeneratedRegex(@"licen[sc]ed\s+(?:for\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:years?|yrs?)|(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:years?|yrs?)\s*(?:licen[sc]ed|of driving|driving|experience|behind the wheel)")]
    private static partial Regex YearsLicensedRegex();
    [GeneratedRegex(@"\b(new driver|just got (my |a |their )?licen[sc]e|teen driver|newly licen[sc]ed|learner'?s permit)\b")]
    private static partial Regex NewDriverRegex();
    [GeneratedRegex(@"\b(business|rideshare|uber|lyft|deliver(y|ies)|doordash|commercial)\b")]
    private static partial Regex BusinessRegex();
    [GeneratedRegex(@"^\s*\$?\d[\d,.]*\s*(k|m|million|thousand)?\s*$")]
    private static partial Regex NumberOnlyRegex();

    [GeneratedRegex(@"(?i:\b(alabama|texas|new york)\b)|\b(AL|TX|NY)\b")]
    private static partial Regex StateRegex();
}
