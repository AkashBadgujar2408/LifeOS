using System.Security.Cryptography;
using LifeOS.Core.Shared.Services;

namespace LifeOS.Core.Tests.Shared;

public class FileRulesTests
{
    [Theory]
    [InlineData("passport.pdf", "passport.pdf")]
    [InlineData("../../etc/passwd.pdf", "passwd.pdf")]
    [InlineData("C:\\Users\\me\\scan front.JPG", "scan front.JPG")]
    [InlineData("  .hidden.txt. ", "hidden.txt")]
    [InlineData("a\u0000b|c?.pdf", "abc.pdf")]
    public void Uploaded_names_keep_only_a_safe_last_segment(string typed, string expected)
    {
        Assert.Equal(expected, FileRules.CleanOriginalName(typed));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("..")]
    [InlineData("../")]
    [InlineData("folder/")]
    public void Names_with_nothing_usable_left_are_refused(string? typed)
    {
        Assert.Null(FileRules.CleanOriginalName(typed));
    }

    [Fact]
    public void Very_long_names_are_cut_keeping_the_extension()
    {
        var cleaned = FileRules.CleanOriginalName(new string('x', 400) + ".pdf")!;

        Assert.Equal(255, cleaned.Length);
        Assert.EndsWith(".pdf", cleaned);
    }

    [Theory]
    [InlineData("scan.PDF", "application/pdf")]
    [InlineData("photo.jpeg", "image/jpeg")]
    [InlineData("lease.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]
    public void The_type_comes_from_the_extension(string name, string contentType)
    {
        Assert.Equal(contentType, FileRules.TypeOf(name, out _)?.ContentType);
    }

    [Theory]
    [InlineData("logo.svg")]
    [InlineData("page.html")]
    [InlineData("setup.exe")]
    [InlineData("no-extension")]
    public void Scriptable_executable_and_unknown_types_are_not_accepted(string name)
    {
        Assert.Null(FileRules.TypeOf(name, out _));
    }

    [Fact]
    public void Stored_names_are_32_hex_characters_and_the_extension()
    {
        var name = FileRules.NewStoredName(".pdf");

        Assert.Matches("^[0-9a-f]{32}\\.pdf$", name);
        Assert.True(FileRules.IsStoredName(name));
        Assert.NotEqual(name, FileRules.NewStoredName(".pdf"));
    }

    [Theory]
    [InlineData("../0123456789abcdef0123456789abcdef.pdf")]
    [InlineData("..\\0123456789abcdef0123456789abcdef.pdf")]
    [InlineData("0123456789abcdef0123456789abcdef.pdf/../../x")]
    [InlineData("C:0123456789abcdef0123456789abcdef.pdf")]
    [InlineData("0123456789ABCDEF0123456789ABCDEF.pdf")]
    [InlineData("0123456789abcdef0123456789abcdef")]
    [InlineData("")]
    [InlineData(null)]
    public void Anything_else_is_not_a_stored_name(string? name)
    {
        Assert.False(FileRules.IsStoredName(name));
    }
}

/// <summary>DiskFileStore against a throwaway folder.</summary>
public sealed class DiskFileStoreTests : IDisposable
{
    private static readonly byte[] PdfBytes = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"u8.ToArray();
    private readonly string root = Path.Combine(Path.GetTempPath(), "lifeos-files-" + Guid.NewGuid().ToString("N"));
    private readonly DiskFileStore store;

    public DiskFileStoreTests()
    {
        store = new DiskFileStore(root, maxFileBytes: 1024);
    }

    public void Dispose()
    {
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task A_file_reads_back_with_the_same_hash()
    {
        var result = await store.SaveAsync(7, new MemoryStream(PdfBytes), "Passport scan.pdf");

        Assert.True(result.Success, result.Error);
        var stored = result.Data!;
        Assert.Equal("Passport scan.pdf", stored.OriginalName);
        Assert.Equal("application/pdf", stored.ContentType);
        Assert.Equal(PdfBytes.Length, stored.SizeBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(PdfBytes)), stored.Sha256);

        await using var read = store.OpenRead(7, stored.StoredName)!;
        Assert.Equal(stored.Sha256, Convert.ToHexString(await SHA256.HashDataAsync(read)));
        Assert.True(File.Exists(Path.Combine(root, "7", stored.StoredName)));
    }

    [Fact]
    public async Task Another_user_cant_open_the_file_by_its_name()
    {
        var stored = (await store.SaveAsync(7, new MemoryStream(PdfBytes), "a.pdf")).Data!;

        Assert.Null(store.OpenRead(8, stored.StoredName));
    }

    [Fact]
    public async Task Path_traversal_names_are_refused_even_when_the_target_exists()
    {
        var stored = (await store.SaveAsync(7, new MemoryStream(PdfBytes), "a.pdf")).Data!;

        Assert.Null(store.OpenRead(8, "../7/" + stored.StoredName));
        Assert.Null(store.OpenRead(8, "..\\7\\" + stored.StoredName));
        Assert.False(store.Delete(8, "../7/" + stored.StoredName));
        await using var own = store.OpenRead(7, stored.StoredName);
        Assert.NotNull(own);
    }

    [Fact]
    public async Task Too_big_empty_and_disguised_files_are_refused_and_leave_nothing_behind()
    {
        var tooBig = await store.SaveAsync(7, new MemoryStream([.. PdfBytes, .. new byte[2000]]), "big.pdf");
        var empty = await store.SaveAsync(7, new MemoryStream(), "empty.pdf");
        var disguised = await store.SaveAsync(7, new MemoryStream("<html><script>alert(1)</script>"u8.ToArray()), "invoice.pdf");
        var wrongType = await store.SaveAsync(7, new MemoryStream(PdfBytes), "logo.svg");

        Assert.Contains("too big", tooBig.Error);
        Assert.Contains("empty", empty.Error);
        Assert.Contains("isn't really a PDF", disguised.Error);
        Assert.Contains("can't be stored", wrongType.Error);
        Assert.Empty(Directory.Exists(Path.Combine(root, "7")) ? Directory.GetFiles(Path.Combine(root, "7")) : []);
    }

    [Fact]
    public async Task Delete_removes_the_bytes()
    {
        var stored = (await store.SaveAsync(7, new MemoryStream(PdfBytes), "a.pdf")).Data!;

        Assert.True(store.Delete(7, stored.StoredName));
        Assert.Null(store.OpenRead(7, stored.StoredName));
        Assert.False(store.Delete(7, stored.StoredName));
    }

    [Fact]
    public void A_root_inside_the_web_root_is_refused()
    {
        var web = Path.Combine(root, "wwwroot");

        Assert.Throws<InvalidOperationException>(() => DiskFileStore.ResolveRoot(Path.Combine(web, "files"), web));
        Assert.Equal(Path.GetFullPath(Path.Combine(root, "data")), DiskFileStore.ResolveRoot(Path.Combine(root, "data"), web));
    }
}
