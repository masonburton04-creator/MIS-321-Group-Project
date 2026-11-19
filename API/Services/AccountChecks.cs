using System.Net.Mail;
using DnsClient;

namespace API.Services;

// Rules for new customer accounts. The front end shows the same rules as a live
// strength meter (Client/Resources/scripts/auth.js), but these are the ones enforced.
public static class PasswordRules
{
    public const int MinLength = 10;
    public const int MaxLength = 128;

    // The most common passwords from public breach lists, plus this project's own words
    private static readonly HashSet<string> Common = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssword",
        "p@ssw0rd", "123456789", "1234567890", "12345678910", "qwerty123", "qwertyuiop", "1q2w3e4r5t",
        "iloveyou", "iloveyou1", "welcome1", "welcome123", "letmein123", "football1", "baseball1",
        "sunshine1", "princess1", "dragon123", "monkey123", "abc123456", "abcdefghij", "trustno1",
        "insurance", "insurance1", "valent", "valentpartners", "valentdemo2026!", "rolltide1"
    };

    // Returns a list of what's wrong (empty = OK)
    public static List<string> Problems(string password, string email, string firstName, string lastName)
    {
        var problems = new List<string>();
        if (password.Length < MinLength)
            problems.Add($"Use at least {MinLength} characters.");
        if (password.Length > MaxLength)
            problems.Add($"Use {MaxLength} characters or fewer.");

        var kinds = 0;
        if (password.Any(char.IsLower)) kinds++;
        if (password.Any(char.IsUpper)) kinds++;
        if (password.Any(char.IsDigit)) kinds++;
        if (password.Any(c => !char.IsLetterOrDigit(c))) kinds++;
        if (kinds < 3)
            problems.Add("Mix at least three of: lowercase letters, capital letters, numbers, and symbols.");

        if (Common.Contains(password))
            problems.Add("That password is too common. Choose something harder to guess.");

        var lower = password.ToLowerInvariant();
        var emailName = email.Split('@')[0].ToLowerInvariant();
        foreach (var personal in new[] { emailName, firstName.ToLowerInvariant(), lastName.ToLowerInvariant() })
        {
            if (personal.Length >= 3 && lower.Contains(personal))
            {
                problems.Add("Don't include your name or email in your password.");
                break;
            }
        }

        if (password.Distinct().Count() <= 3)
            problems.Add("Avoid repeating the same few characters.");
        return problems;
    }
}

// Checks an email address before an account is created: the format, then whether the
// domain can receive mail (it has MX records, or at least an address record).
// This catches typos like "gmial.com" and made-up domains. It can't prove the inbox
// itself exists; only a verification email can do that.
public class EmailChecker
{
    private readonly ILookupClient _dns;
    private readonly ILogger<EmailChecker> _log;

    public EmailChecker(ILookupClient dns, ILogger<EmailChecker> log)
    {
        _dns = dns;
        _log = log;
    }

    // Common typos of popular mail domains -> the domain the customer probably meant
    private static readonly Dictionary<string, string> Typos = new(StringComparer.OrdinalIgnoreCase)
    {
        ["gmial.com"] = "gmail.com", ["gmai.com"] = "gmail.com", ["gmal.com"] = "gmail.com",
        ["gmail.co"] = "gmail.com", ["gmail.con"] = "gmail.com", ["gnail.com"] = "gmail.com",
        ["yaho.com"] = "yahoo.com", ["yahoo.co"] = "yahoo.com", ["yahoo.con"] = "yahoo.com",
        ["hotmal.com"] = "hotmail.com", ["hotmail.co"] = "hotmail.com", ["hotmial.com"] = "hotmail.com",
        ["outlok.com"] = "outlook.com", ["outlook.co"] = "outlook.com", ["icloud.co"] = "icloud.com",
        ["aol.co"] = "aol.com"
    };

    public record Result(bool Ok, string? Error, string? Suggestion);

    public async Task<Result> CheckAsync(string email)
    {
        if (!MailAddress.TryCreate(email, out var parsed) || parsed.Address != email || !email.Contains('.'))
            return new Result(false, "Enter a valid email address, like name@example.com.", null);

        var domain = parsed.Host.ToLowerInvariant();
        if (Typos.TryGetValue(domain, out var fixedDomain))
        {
            var suggestion = parsed.User + "@" + fixedDomain;
            return new Result(false, $"Did you mean {suggestion}?", suggestion);
        }

        try
        {
            var mx = await _dns.QueryAsync(domain, QueryType.MX);
            var records = mx.Answers.MxRecords().ToList();
            // A "null MX" (RFC 7505: a single record pointing at ".") means the domain accepts no mail
            if (records.Count == 1 && records[0].Exchange.Value == ".")
                return new Result(false, $"{domain} doesn't accept email. Check the address for typos.", null);
            if (records.Count > 0)
                return new Result(true, null, null);

            // No MX: mail falls back to the domain's own address record (RFC 5321)
            var a = await _dns.QueryAsync(domain, QueryType.A);
            if (a.Answers.ARecords().Any())
                return new Result(true, null, null);

            return new Result(false, $"We couldn't find a mail server for {domain}. Check the address for typos.", null);
        }
        catch (DnsResponseException ex)
        {
            // No internet / DNS down: don't block sign-up over our own network problem
            _log.LogWarning(ex, "Email domain check skipped for {Domain}", domain);
            return new Result(true, null, null);
        }
    }
}
