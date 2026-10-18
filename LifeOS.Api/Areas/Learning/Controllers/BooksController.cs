using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Learning.Controllers;

[ApiController]
[Area("Learning")]
[Route("api/[area]/[controller]")]
[Authorize]
public class BooksController(IBooksService booksService) : ControllerBase
{
    /// <summary>GET api/Learning/Books[?status=Reading] — reading first, then want to read, finished, abandoned.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status) =>
        Ok(ApiResponse<List<BookDto>>.Ok(await booksService.GetAllAsync(status)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await booksService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<BookDetailDto>.Ok(result.Data)) : NotFound(ApiResponse<BookDetailDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(BookRequest request)
    {
        var result = await booksService.CreateAsync(request);
        return result.Success ? Ok(ApiResponse<BookDetailDto>.Ok(result.Data)) : BadRequest(ApiResponse<BookDetailDto>.Fail(result.Error!));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, BookRequest request)
    {
        var result = await booksService.UpdateAsync(id, request);
        return result.Success ? Ok(ApiResponse<BookDetailDto>.Ok(result.Data)) : BadRequest(ApiResponse<BookDetailDto>.Fail(result.Error!));
    }

    /// <summary>PUT api/Learning/Books/7/progress { "currentPage": 212, "today": "2026-10-18" }</summary>
    [HttpPut("{id:int}/progress")]
    public async Task<IActionResult> SetProgress(int id, BookProgressRequest request)
    {
        var result = await booksService.SetProgressAsync(id, request);
        return result.Success ? Ok(ApiResponse<BookDetailDto>.Ok(result.Data)) : BadRequest(ApiResponse<BookDetailDto>.Fail(result.Error!));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await booksService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    [HttpPost("{id:int}/notes")]
    public async Task<IActionResult> AddNote(int id, BookNoteRequest request)
    {
        var result = await booksService.AddNoteAsync(id, request);
        return result.Success ? Ok(ApiResponse<BookNoteDto>.Ok(result.Data)) : BadRequest(ApiResponse<BookNoteDto>.Fail(result.Error!));
    }

    [HttpPut("{id:int}/notes/{noteId:int}")]
    public async Task<IActionResult> UpdateNote(int id, int noteId, BookNoteRequest request)
    {
        var result = await booksService.UpdateNoteAsync(id, noteId, request);
        return result.Success ? Ok(ApiResponse<BookNoteDto>.Ok(result.Data)) : BadRequest(ApiResponse<BookNoteDto>.Fail(result.Error!));
    }

    [HttpDelete("{id:int}/notes/{noteId:int}")]
    public async Task<IActionResult> DeleteNote(int id, int noteId)
    {
        var result = await booksService.DeleteNoteAsync(id, noteId);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }
}
