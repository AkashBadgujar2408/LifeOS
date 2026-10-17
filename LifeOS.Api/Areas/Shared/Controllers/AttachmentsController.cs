using LifeOS.Api.Infrastructure;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class AttachmentsController(IAttachmentsService attachmentsService) : ControllerBase
{
    /// <summary>GET api/Shared/Attachments?entityType=Goal&amp;entityId=5</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string entityType, [FromQuery] int entityId) =>
        Respond(await attachmentsService.ListAsync(entityType, entityId));

    /// <summary>POST api/Shared/Attachments?entityType=Goal&amp;entityId=5 — multipart, one or more "files" parts.</summary>
    [HttpPost]
    [RequestSizeLimit(FileResponses.MaxUploadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = FileResponses.MaxUploadBytes)]
    public async Task<IActionResult> Upload([FromQuery] string entityType, [FromQuery] int entityId,
        [FromForm] List<IFormFile> files, CancellationToken cancellationToken)
    {
        var uploads = files.Select(f => new FileUpload(f.FileName, f.OpenReadStream())).ToList();
        try
        {
            return Respond(await attachmentsService.AddAsync(entityType, entityId, uploads, cancellationToken));
        }
        finally
        {
            uploads.ForEach(u => u.Content.Dispose());
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await attachmentsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>GET api/Shared/Attachments/7/file[?download=true | ?raw=true] — the bytes, owner only.</summary>
    [HttpGet("{id:int}/file")]
    public async Task<IActionResult> Download(int id, [FromQuery] bool download = false, [FromQuery] bool raw = false)
    {
        var result = await attachmentsService.OpenAsync(id);
        return result.Success
            ? FileResponses.Send(this, result.Data!, download, raw)
            : NotFound(ApiResponse<object>.Fail(result.Error!));
    }

    private IActionResult Respond(OperationResult<List<AttachmentDto>> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<List<AttachmentDto>>.Ok(result.Data));
        }

        return result.Error == AttachmentErrors.TargetNotFound
            ? NotFound(ApiResponse<List<AttachmentDto>>.Fail(result.Error))
            : BadRequest(ApiResponse<List<AttachmentDto>>.Fail(result.Error!));
    }
}
