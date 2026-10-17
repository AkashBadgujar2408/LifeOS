using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace LifeOS.Core.Shared.Services;

/// <summary>A kind of file LifeOS accepts: its content type and how to recognise its bytes.</summary>
public sealed record AcceptedFileType(string ContentType, string Label, Func<ReadOnlySpan<byte>, bool> LooksRight);

/// <summary>
/// What may be stored and under what name (pure, xUnit-tested). The type comes from the extension and must match the
/// file's own first bytes, so "invoice.pdf" that is really a web page is refused. Scriptable formats (SVG, HTML) and
/// executables aren't on the list at all.
/// </summary>
public static partial class FileRules
{
    /// <summary>How many leading bytes <see cref="AcceptedFileType.LooksRight"/> is given.</summary>
    public const int HeadLength = 512;

    public const string TypeList = "PDF, images (JPG, PNG, WEBP, GIF, HEIC), text or CSV, Word, Excel or OpenDocument files";

    private static readonly byte[] Pdf = "%PDF-"u8.ToArray();
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF];
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] Gif = "GIF8"u8.ToArray();
    private static readonly byte[] Riff = "RIFF"u8.ToArray();
    private static readonly byte[] Webp = "WEBP"u8.ToArray();
    private static readonly byte[] Ftyp = "ftyp"u8.ToArray();
    private static readonly byte[] Zip = [0x50, 0x4B, 0x03, 0x04];
    private static readonly byte[] Ole = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    private static readonly string[] HeifBrands = ["heic", "heix", "hevc", "mif1", "msf1"];

    private static bool StartsWith(ReadOnlySpan<byte> head, byte[] prefix) => head.StartsWith(prefix);

    private static bool IsWebp(ReadOnlySpan<byte> head) =>
        head.Length >= 12 && head.StartsWith(Riff) && head[8..12].SequenceEqual(Webp);

    private static bool IsHeif(ReadOnlySpan<byte> head) =>
        head.Length >= 12 && head[4..8].SequenceEqual(Ftyp) && HeifBrands.Contains(Encoding.ASCII.GetString(head[8..12]));

    // Plain text has no NUL bytes; binaries nearly always do in their first few hundred.
    private static bool IsText(ReadOnlySpan<byte> head) => !head.Contains((byte)0);

    private static readonly AcceptedFileType PdfType = new("application/pdf", "PDF", h => StartsWith(h, Pdf));
    private static readonly AcceptedFileType JpegType = new("image/jpeg", "JPG image", h => StartsWith(h, Jpeg));

    private static readonly Dictionary<string, AcceptedFileType> Types = new(StringComparer.Ordinal)
    {
        [".pdf"] = PdfType,
        [".jpg"] = JpegType,
        [".jpeg"] = JpegType,
        [".png"] = new("image/png", "PNG image", h => StartsWith(h, Png)),
        [".gif"] = new("image/gif", "GIF image", h => StartsWith(h, Gif)),
        [".webp"] = new("image/webp", "WEBP image", IsWebp),
        [".heic"] = new("image/heic", "HEIC photo", IsHeif),
        [".txt"] = new("text/plain", "text file", IsText),
        [".csv"] = new("text/csv", "CSV file", IsText),
        [".doc"] = new("application/msword", "Word document", h => StartsWith(h, Ole)),
        [".xls"] = new("application/vnd.ms-excel", "Excel workbook", h => StartsWith(h, Ole)),
        [".docx"] = new("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word document", h => StartsWith(h, Zip)),
        [".xlsx"] = new("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel workbook", h => StartsWith(h, Zip)),
        [".odt"] = new("application/vnd.oasis.opendocument.text", "OpenDocument text", h => StartsWith(h, Zip)),
        [".ods"] = new("application/vnd.oasis.opendocument.spreadsheet", "OpenDocument spreadsheet", h => StartsWith(h, Zip)),
    };

    [GeneratedRegex("^[0-9a-f]{32}\\.[a-z0-9]{1,5}$", RegexOptions.CultureInvariant)]
    private static partial Regex StoredNamePattern();

    /// <summary>
    /// The uploaded name made safe to keep and offer back: only the last path segment (either slash), no control
    /// characters or characters Windows forbids, trimmed of dots and spaces, at most 255 characters with the
    /// extension kept. Null when nothing usable is left ("", "..", "/").
    /// </summary>
    public static string? CleanOriginalName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        var lastSlash = name.LastIndexOfAny(['/', '\\']);
        var segment = lastSlash >= 0 ? name[(lastSlash + 1)..] : name;
        var invalid = Path.GetInvalidFileNameChars().Concat(['<', '>', ':', '"', '|', '?', '*']).ToHashSet();
        var cleaned = new string(segment.Where(c => !char.IsControl(c) && !invalid.Contains(c)).ToArray()).Trim(' ', '.');
        if (cleaned.Length == 0)
        {
            return null;
        }

        if (cleaned.Length > 255)
        {
            var extension = Path.GetExtension(cleaned);
            cleaned = extension.Length is > 0 and <= 10
                ? cleaned[..(255 - extension.Length)] + extension
                : cleaned[..255];
        }

        return cleaned;
    }

    /// <summary>The accepted type for a name's extension (case doesn't matter), or null.</summary>
    public static AcceptedFileType? TypeOf(string fileName, out string extension)
    {
        extension = Path.GetExtension(fileName).ToLowerInvariant();
        return Types.GetValueOrDefault(extension);
    }

    /// <summary>A fresh name for disk: 128 random bits as hex, plus the (lower-case) extension.</summary>
    public static string NewStoredName(string extension) =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant() + extension;

    /// <summary>
    /// Only names <see cref="NewStoredName"/> could have made pass — so nothing with a slash, "..", a drive letter
    /// or any other way out of the user's folder ever reaches the file system.
    /// </summary>
    public static bool IsStoredName(string? name) => name is not null && StoredNamePattern().IsMatch(name);
}
