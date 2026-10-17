using System.Security.Cryptography;
using System.Text;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// Password recovery codes (pure, xUnit-tested): "K7QM-2XRD-P9WA-HN4C" — 16 characters from a 32-letter alphabet with
/// no 0/O or 1/I to misread, so 80 random bits each. Stored only as a SHA-256 of the normalised code: with that much
/// randomness a slow password hash adds nothing, and a fast one lets a reset find the code with one indexed lookup.
/// </summary>
public static class RecoveryCodeFormat
{
    public const int CodesPerSet = 8;
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int Length = 16;

    public static List<string> GenerateSet() => Enumerable.Range(0, CodesPerSet).Select(_ => Generate()).ToList();

    public static string Generate()
    {
        var chars = new char[Length];
        for (var i = 0; i < Length; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }

        return string.Join('-', Enumerable.Range(0, Length / 4).Select(g => new string(chars, g * 4, 4)));
    }

    /// <summary>What was typed, as hashed: upper case, without the dashes or any spaces.</summary>
    public static string Normalize(string typed) =>
        new(typed.ToUpperInvariant().Where(c => c != '-' && !char.IsWhiteSpace(c)).ToArray());

    /// <summary>SHA-256 of the normalised code, upper-case hex (CHAR(64) in shared.RecoveryCodes).</summary>
    public static string Hash(string typed) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Normalize(typed))));
}
