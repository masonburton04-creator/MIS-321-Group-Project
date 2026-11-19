namespace API.Models;

// ---- AI chatbot ("Ask Val"): POST /api/chat and friends ----

public class ChatTurn
{
    public string Role { get; set; } = "";      // 'user' or 'assistant'
    public string Content { get; set; } = "";
}

public class ChatRequest
{
    public string? ConversationId { get; set; }  // from the previous reply; null starts a new conversation
    public List<ChatTurn> Messages { get; set; } = new();  // the conversation so far, newest last
    public string? StateCode { get; set; }       // state picked on the site (used when a quote names none)
}

// Quick estimate form in the chat panel: same numbers as the application's Quote step
public class ChatQuoteRequest
{
    public string? ConversationId { get; set; }
    public string? StateCode { get; set; }
    public List<string> Lines { get; set; } = new();          // HOME, FLOOD, JEWELRY, AUTO
    public decimal? DwellingCoverage { get; set; }
    public string? FloodZone { get; set; }                    // X, A, V, unknown
    public decimal? FloodBuildingCoverage { get; set; }
    public decimal? FloodContentsCoverage { get; set; }
    public List<decimal> JewelryItemValues { get; set; } = new();
    public bool? JewelryAppraised { get; set; }
    public string? AutoCoverage { get; set; }                 // liability, full
    public int? VehicleCount { get; set; }
    public int? DriverCount { get; set; }
    public bool? RecentIncidents { get; set; }
    public decimal? NewestDriverYearsLicensed { get; set; }
    public bool? BusinessUse { get; set; }
}

public class ChatFeedbackRequest
{
    public string ConversationId { get; set; } = "";
    public long MessageId { get; set; }
    public bool Helpful { get; set; }
}

public class ChatEventRequest
{
    public string ConversationId { get; set; } = "";
    public string Type { get; set; } = "";       // 'apply_click'
}

// ---- Dashboard: how customers use the chatbot ----
public class ChatUsage
{
    public int Conversations { get; set; }
    public int Questions { get; set; }             // customer messages
    public double? AvgQuestionsPerConversation { get; set; }
    public int? AvgFirstWordMs { get; set; }       // wait before the first word appeared
    public int? AvgReplyMs { get; set; }           // time for a whole reply
    public int Quotes { get; set; }                // replies that gave a price range
    public int QuotesFromForm { get; set; }        // ...of those, from the Quick estimate form
    public int QuotesNeedMoreInfo { get; set; }
    public int QuotesReferred { get; set; }        // a specialist has to price it
    public int OffTopic { get; set; }              // non-insurance questions turned away
    public int Errors { get; set; }
    public int RatedHelpful { get; set; }
    public int RatedNotHelpful { get; set; }
    public int ApplyClicks { get; set; }           // conversations that clicked "Start an application"
    public int SignedInConversations { get; set; }
    public int DemoConversations { get; set; }     // seeded by 09_ai_chatbot.sql (is_mock)
    public List<ChatTopicCount> Topics { get; set; } = new();
    public string? Error { get; set; }             // e.g. 09_ai_chatbot.sql not run yet
}

public class ChatTopicCount
{
    public string Topic { get; set; } = "";
    public int Questions { get; set; }
    public int Quotes { get; set; }
}
