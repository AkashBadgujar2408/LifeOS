using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace LifeOS.Api.Infrastructure;

/// <summary>How every stored file (document files, attachments) is sent back: one place for the headers.</summary>
public static class FileResponses
{
    // Ten files of up to 20 MB each, plus the multipart framing. The per-file limit is enforced (with a readable
    // message) by the file store while it streams; this only stops absurd requests early.
    public const long MaxUploadBytes = 10L * 20 * 1024 * 1024 + 1024 * 1024;

    /// <summary>The type for ?raw=true responses: deliberately not a type any download manager knows.</summary>
    public const string RawContentType = "application/x-lifeos-file";

    // What a browser can show itself; everything else is always a download.
    private static readonly HashSet<string> Previewable =
        ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "text/plain", "text/csv"];

    /// <summary>
    /// The bytes, shown inline when the browser can (PDF, images, text) unless a download is asked for. The type is
    /// the one the server decided at upload (checked against the bytes), and nosniff stops the browser second-guessing
    /// it. ?raw=true is the app fetching bytes for itself (preview, its own Save): no file name and a neutral type,
    /// because download managers (IDM, found in Session 40) seize anything that looks like a file and the page then
    /// gets an empty response. The app already knows the real type and name and rebuilds the Blob with them.
    /// </summary>
    public static IActionResult Send(ControllerBase controller, FileContent file, bool download, bool raw)
    {
        var headers = controller.Response.Headers;
        headers[HeaderNames.XContentTypeOptions] = "nosniff";
        headers[HeaderNames.CacheControl] = "private, no-store";
        headers["X-Content-SHA256"] = file.Sha256;

        if (raw)
        {
            return controller.File(file.Content, RawContentType, enableRangeProcessing: true);
        }

        var inline = !download && Previewable.Contains(file.ContentType);
        var disposition = new ContentDispositionHeaderValue(inline ? "inline" : "attachment");
        disposition.SetHttpFileName(file.FileName);
        headers[HeaderNames.ContentDisposition] = disposition.ToString();
        return controller.File(file.Content, file.ContentType, enableRangeProcessing: true);
    }
}
