using System.Net;
using System.Text;
using ABEC_System.DTOs;
using Microsoft.AspNetCore.Antiforgery;

namespace ABEC_System.Services;

public static class SlotActionPage
{
    public const string VerificationCookieName = "abec-slot-verification";

    public static string Intent(string action, string? token, SlotLinkStatusDto status, AntiforgeryTokenSet? formTokens = null)
    {
        var state = status.State ?? "invalid";
        var confirming = state == "incomplete" || !string.Equals(action, "decline", StringComparison.OrdinalIgnoreCase);

        if (state == "confirmed")
            return Done(true, status.FullName, true, status);
        if (state == "declined")
            return Done(false, status.FullName, true, status);
        if (state is "missing" or "invalid" or "expired" or "unavailable" or "declined" or "confirmed")
            return Failed(status.Message);

        var title = confirming ? "Confirm Your Training Slot" : "Reject Your Training Slot";
        var lead = confirming
            ? "Choose Confirm Slot to accept this training offer. Your application will move to pending account activation."
            : "Choose Reject Slot if you do not want this training offer. Your application will be marked as rejected.";
        var button = confirming ? "Confirm Slot" : "Reject Slot";
        var path = confirming ? "/confirm-slot" : "/reject-slot";
        var buttonClass = confirming ? "primary" : "ghost";
        var name = string.IsNullOrWhiteSpace(status.FullName) ? "" : "<p class=\"name\">" + Encode(status.FullName) + "</p>";
        var form = new StringBuilder();
        form.Append(name);
        form.Append(Details(status));
        form.Append("<p>").Append(Encode(lead)).Append("</p>");
        form.Append("<p class=\"hint\">Opening this page does not record a response. Select the button below to confirm your choice.</p>");
        form.Append("<form method=\"post\" action=\"").Append(path).Append("\" id=\"slot-form\">");
        form.Append("<input type=\"hidden\" name=\"token\" value=\"").Append(Encode(token)).Append("\">");
        if (formTokens is not null)
            form.Append("<input type=\"hidden\" name=\"").Append(Encode(formTokens.FormFieldName)).Append("\" value=\"").Append(Encode(formTokens.RequestToken)).Append("\">");
        form.Append("<button type=\"submit\" id=\"slot-go\" class=\"").Append(buttonClass).Append("\">").Append(Encode(button)).Append("</button>");
        form.Append("</form>");
        form.Append("<script>document.getElementById('slot-form').addEventListener('submit',function(){var button=document.getElementById('slot-go');button.disabled=true;button.innerHTML='Loading... <span class=\"dots\"><i></i><i></i><i></i></span>';});</script>");
        return Shell(title, form.ToString());
    }

    public static string Done(bool confirmed, string? name, bool alreadyResponded = false, SlotLinkStatusDto? details = null)
    {
        var who = string.IsNullOrWhiteSpace(name) ? "" : "<p class=\"name\">" + Encode(name) + "</p>";
        var saved = alreadyResponded ? "<p class=\"saved\">You have already responded to this offer. Your recorded choice cannot be changed by reopening either email link.</p>" : "";
        var information = details is null ? "" : Details(details);
        if (confirmed)
        {
            return Shell(
                "Slot Confirmed Successfully!",
                "<div class=\"mark ok\">&#10003;</div>" + who + saved + information + "<p>Your slot confirmation has been received. Your application is now awaiting account activation. Please wait for further instructions from ABEC.</p>");
        }

        return Shell(
            "Slot Rejected Successfully",
            "<div class=\"mark warn\">-</div>" + who + saved + information + "<p>Your decision to reject the offered slot has been recorded. Thank you for informing ABEC.</p>");
    }

    private static string Details(SlotLinkStatusDto status)
    {
        var details = "<dl class=\"details\"><div><dt>Course</dt><dd>" + Encode(status.CourseName) + "</dd></div><div><dt>Training date and time</dt><dd>" +
            Encode(string.IsNullOrWhiteSpace(status.TrainingDateTime) ? "To be announced by ABEC Institute" : status.TrainingDateTime) + "</dd></div>";
        if (status.ResponseDeadline.HasValue)
            details += "<div><dt>Slot offered</dt><dd>" + Encode(SlotOfferPolicy.DisplayTime(status.ResponseDeadline.Value.AddHours(-SlotOfferPolicy.ResponseHours))) +
                "</dd></div><div><dt>Respond by</dt><dd>" + Encode(SlotOfferPolicy.DisplayTime(status.ResponseDeadline.Value)) + "</dd></div>";
        return details + "</dl><p class=\"hint\">The confirmation window is 2 days (48 hours) from the time this slot was offered.</p>";
    }

    public static string Failed(string? message)
    {
        var text = string.IsNullOrWhiteSpace(message)
            ? "This slot response could not be completed. Please open the link from your ABEC email again, or contact ABEC Institute."
            : message.Trim();
        return Shell("Unable to Process This Link", "<div class=\"mark bad\">!</div><p>" + Encode(text) + "</p>");
    }

    private static string Shell(string title, string body)
    {
        var html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>__TITLE__ - ABEC Institute</title>
              <style>
                *{box-sizing:border-box}
                body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#F5F9FF;color:#172B4D;font-family:Segoe UI,Arial,sans-serif}
                .card{width:min(520px,100%);background:#fff;border:1px solid #DCE6F1;border-radius:18px;box-shadow:0 12px 32px rgba(11,31,58,.08);padding:32px 28px;text-align:center}
                h1{margin:0 0 12px;font-size:26px;line-height:1.25;color:#0B1F3A}
                p{margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155}
                .name{font-weight:700;color:#0B1F3A}
                .course{font-size:13px;color:#64748B}
                .details{text-align:left;margin:18px 0;padding:16px;border:1px solid #DCE6F1;border-radius:10px;background:#f8fafc}
                .details div+div{margin-top:12px}.details dt{font-size:12px;font-weight:700;color:#64748b}.details dd{margin:4px 0 0;font-size:15px;line-height:1.45;overflow-wrap:anywhere}
                p.hint{font-size:13px;color:#64748b}.saved{padding:12px;background:#eff6ff;border-radius:10px}
                button{margin-top:8px;border:0;border-radius:10px;padding:12px 18px;font-size:14px;font-weight:700;cursor:pointer}
                button.primary{background:#0B1F3A;color:#fff}
                button.ghost{background:#fff;color:#0B1F3A;border:2px solid #0B1F3A}
                button:disabled{opacity:.7;cursor:wait}
                button:focus-visible,a:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
                @media(max-width:600px){body{padding:12px}.card{padding:24px 18px}h1{font-size:23px}button{width:100%;min-height:48px;font-size:16px}}
                .mark{width:56px;height:56px;margin:0 auto 14px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700}
                .mark.ok{background:#ECFDF5;color:#059669}.mark.warn{background:#FFFBEB;color:#D97706}.mark.bad{background:#FEF2F2;color:#DC2626}
                a.home{display:inline-block;margin-top:14px;color:#1A4B7A;font-size:13px;font-weight:700;text-decoration:none}
                .dots{display:inline-flex;gap:4px;margin-left:6px;vertical-align:middle}
                .dots i{width:7px;height:7px;border-radius:999px;background:#059669;display:block;animation:dot 1.05s ease-in-out infinite}
                .dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
                @keyframes dot{0%,100%{background:#059669;transform:translateY(0)}50%{background:#60A5FA;transform:translateY(-3px)}}
              </style>
            </head>
            <body>
              <main class="card">
                <h1>__TITLE__</h1>
                __BODY__
                <a class="home" href="/Views/Home/LandingPage.html">Back to ABEC</a>
              </main>
            </body>
            </html>
            """;
        return html.Replace("__TITLE__", Encode(title)).Replace("__BODY__", body);
    }

    private static string Encode(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);
}
