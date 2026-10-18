using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ContactsController(IContactsService contactsService) : ControllerBase
{
    /// <summary>GET api/Shared/Contacts[?tagId=4] — by name.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? tagId) =>
        Ok(ApiResponse<List<ContactDto>>.Ok(await contactsService.GetAllAsync(tagId)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await contactsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<ContactDto>.Ok(result.Data)) : NotFound(ApiResponse<ContactDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ContactRequest request) => Result(await contactsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ContactRequest request) => Result(await contactsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await contactsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<ContactDto> result) =>
        result.Success ? Ok(ApiResponse<ContactDto>.Ok(result.Data)) : BadRequest(ApiResponse<ContactDto>.Fail(result.Error!));
}
