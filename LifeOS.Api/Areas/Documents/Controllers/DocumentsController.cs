using LifeOS.Api.Infrastructure;
using LifeOS.Core.Documents.DTOs;
using LifeOS.Core.Documents.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Documents.Controllers;

[ApiController]
[Area("Documents")]
[Route("api/[area]/[controller]")]
[Authorize]
public class DocumentsController(IDocumentsService documentsService) : ControllerBase
{
    private const long MaxUploadBytes = FileResponses.MaxUploadBytes;
    /// <summary>GET api/Documents/Documents?kind=Identity&amp;search=pass&amp;tagId=3</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? kind, [FromQuery] string? search, [FromQuery] int? tagId)
    {
        var result = await documentsService.ListAsync(kind, search, tagId);
        return result.Success
            ? Ok(ApiResponse<List<DocumentSummaryDto>>.Ok(result.Data))
            : BadRequest(ApiResponse<List<DocumentSummaryDto>>.Fail(result.Error!));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Respond(await documentsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(DocumentRequest request) => Respond(await documentsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, DocumentRequest request) =>
        Respond(await documentsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await documentsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>POST api/Documents/Documents/5/files — multipart, one or more "files" parts. Returns the document.</summary>
    [HttpPost("{id:int}/files")]
    [RequestSizeLimit(MaxUploadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxUploadBytes)]
    public async Task<IActionResult> Upload(int id, [FromForm] List<IFormFile> files, CancellationToken cancellationToken)
    {
        var uploads = files.Select(f => new FileUpload(f.FileName, f.OpenReadStream())).ToList();
        try
        {
            return Respond(await documentsService.AddFilesAsync(id, uploads, cancellationToken));
        }
        finally
        {
            uploads.ForEach(u => u.Content.Dispose());
        }
    }

    /// <summary>PUT api/Documents/Documents/5/files/9 — multipart with one "file" part: a new version of that file.</summary>
    [HttpPut("{id:int}/files/{fileId:int}")]
    [RequestSizeLimit(MaxUploadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxUploadBytes)]
    public async Task<IActionResult> Replace(int id, int fileId, IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null)
        {
            return BadRequest(ApiResponse<DocumentDto>.Fail("Choose a file."));
        }

        await using var content = file.OpenReadStream();
        return Respond(await documentsService.ReplaceFileAsync(id, fileId, new FileUpload(file.FileName, content), cancellationToken));
    }

    [HttpDelete("{id:int}/files/{fileId:int}")]
    public async Task<IActionResult> RemoveFile(int id, int fileId) =>
        Respond(await documentsService.RemoveFileAsync(id, fileId));

    /// <summary>
    /// GET api/Documents/Documents/5/files/9[?download=true | ?raw=true] — the bytes, owner only (see FileResponses).
    /// A vault document's file needs the X-Vault-Unlock header: 423 Locked without a live one.
    /// </summary>
    [HttpGet("{id:int}/files/{fileId:int}")]
    public async Task<IActionResult> Download(int id, int fileId, [FromQuery] bool download = false, [FromQuery] bool raw = false)
    {
        var result = await documentsService.OpenFileAsync(id, fileId);
        if (result.Success)
        {
            return FileResponses.Send(this, result.Data!, download, raw);
        }

        return result.Error == DocumentErrors.VaultLocked
            ? StatusCode(StatusCodes.Status423Locked, ApiResponse<object>.Fail(result.Error))
            : NotFound(ApiResponse<object>.Fail(result.Error!));
    }

    private IActionResult Respond(OperationResult<DocumentDto> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<DocumentDto>.Ok(result.Data));
        }

        return result.Error switch
        {
            DocumentErrors.NotFound or DocumentErrors.FileNotFound => NotFound(ApiResponse<DocumentDto>.Fail(result.Error)),
            DocumentErrors.VaultLocked => StatusCode(StatusCodes.Status423Locked, ApiResponse<DocumentDto>.Fail(result.Error)),
            _ => BadRequest(ApiResponse<DocumentDto>.Fail(result.Error!)),
        };
    }
}
