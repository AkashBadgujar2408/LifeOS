using System.Globalization;
using LifeOS.Api.Infrastructure;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace LifeOS.Api.Areas.Shared.Controllers;

/// <summary>Your data, all of it: export as a zip, import into an empty account, delete the account for good.</summary>
[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class AccountController(IAccountDataService accountDataService) : ControllerBase
{
    /// <summary>The largest export an import accepts (data + files).</summary>
    private const long MaxImportBytes = 2L * 1024 * 1024 * 1024;

    /// <summary>
    /// GET api/Shared/Account/export[?raw=true] — everything as one zip. Built in a temporary file (deleted when the
    /// response is done). ?raw=true is the app fetching it for itself (neutral type, no file name — see FileResponses).
    /// With vault documents it needs the X-Vault-Unlock header: 423 Locked without a live one.
    /// </summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] bool raw = false, CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(Path.GetTempPath(), $"lifeos-export-{Guid.NewGuid():N}.zip");
        var file = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 81920,
            FileOptions.Asynchronous | FileOptions.DeleteOnClose);
        try
        {
            var result = await accountDataService.ExportAsync(file, cancellationToken);
            if (!result.Success)
            {
                await file.DisposeAsync();
                return result.Error is AccountDataErrors.VaultLocked or AccountDataErrors.SensitiveLocked
                    ? StatusCode(StatusCodes.Status423Locked, ApiResponse<bool>.Fail(result.Error))
                    : BadRequest(ApiResponse<bool>.Fail(result.Error!));
            }
        }
        catch
        {
            await file.DisposeAsync();
            throw;
        }

        file.Position = 0;
        Response.Headers[HeaderNames.XContentTypeOptions] = "nosniff";
        Response.Headers[HeaderNames.CacheControl] = "private, no-store";
        var name = $"lifeos-export-{DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}.zip";
        return raw ? File(file, FileResponses.RawContentType) : File(file, "application/zip", name);
    }

    /// <summary>POST api/Shared/Account/import (multipart, field "file") — an export into this (empty) account.</summary>
    [HttpPost("import")]
    [RequestSizeLimit(MaxImportBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxImportBytes)]
    public async Task<IActionResult> Import(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(ApiResponse<ImportSummaryDto>.Fail("Choose the export (.zip) to import."));
        }

        // ZipArchive needs a seekable stream; the upload is spooled to a temporary file first.
        await using var copy = new FileStream(Path.Combine(Path.GetTempPath(), $"lifeos-import-{Guid.NewGuid():N}.zip"),
            FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.DeleteOnClose);
        await file.CopyToAsync(copy, cancellationToken);
        copy.Position = 0;
        var result = await accountDataService.ImportAsync(copy, cancellationToken);
        return result.Success
            ? Ok(ApiResponse<ImportSummaryDto>.Ok(result.Data))
            : BadRequest(ApiResponse<ImportSummaryDto>.Fail(result.Error!));
    }

    /// <summary>POST api/Shared/Account/delete — erases the account and everything in it, for good.</summary>
    [HttpPost("delete")]
    public async Task<IActionResult> Delete(DeleteAccountRequest request)
    {
        var result = await accountDataService.DeleteAccountAsync(request);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : BadRequest(ApiResponse<bool>.Fail(result.Error!));
    }
}
